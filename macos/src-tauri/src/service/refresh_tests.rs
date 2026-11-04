use super::*;

async fn registered(service: &Service, repository: &str, method: &str) {
    tokio::time::timeout(Duration::from_secs(5), async {
        loop {
            if service.running_targets.lock().unwrap().values().any(|(key, name, _)| key.starts_with(&format!("{repository}:")) && name == method) { return; }
            tokio::task::yield_now().await;
        }
    }).await.unwrap();
}

#[tokio::test]
async fn fetch_updates_remote_ref_when_local_status_filter_fails() {
    use std::process::Stdio;
    use tokio::io::{AsyncBufReadExt, BufReader};

    let temporary = tempfile::tempdir().unwrap();
    let source = temporary.path().join("source");
    let remotes = temporary.path().join("remotes");
    let checkout = temporary.path().join("checkout");
    fs::create_dir(&source).unwrap();
    fs::create_dir_all(remotes.join("fixture")).unwrap();
    async fn git_at(root: &Path, args: &[&str]) -> String {
        git::run(root, args, git::Options { write: true, ..Default::default() }).await.unwrap()
    }
    for args in [
        vec!["init", "--quiet", "--initial-branch=main", "--template="],
        vec!["config", "user.name", "Fixture"],
        vec!["config", "user.email", "fixture@example.invalid"],
        vec!["config", "commit.gpgsign", "false"],
    ] {
        git_at(&source, &args).await;
    }
    fs::write(source.join(".gitattributes"), "*.asset filter=probe\n").unwrap();
    fs::write(source.join("asset.asset"), "base\n").unwrap();
    git_at(&source, &["add", ".gitattributes", "asset.asset"]).await;
    git_at(&source, &["commit", "--quiet", "-m", "base"]).await;
    let remote = remotes.join("fixture/project.git");
    git_at(&source, &["clone", "--bare", "--quiet", source.to_str().unwrap(), remote.to_str().unwrap()]).await;
    git_at(temporary.path(), &["clone", "--quiet", remote.to_str().unwrap(), checkout.to_str().unwrap()]).await;
    let checkout = dunce::canonicalize(checkout).unwrap();

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    drop(listener);
    let mut daemon = tokio::process::Command::new(util::find_tool("git").unwrap())
        .args(["daemon", "--verbose", "--reuseaddr", "--export-all", &format!("--base-path={}", remotes.display()), "--listen=127.0.0.1", &format!("--port={port}"), remotes.to_str().unwrap()])
        .stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::piped()).kill_on_drop(true).spawn().unwrap();
    let mut lines = BufReader::new(daemon.stderr.take().unwrap()).lines();
    tokio::time::timeout(Duration::from_secs(5), async {
        while let Some(line) = lines.next_line().await.unwrap() {
            if line.contains("Ready to rumble") { return; }
        }
        panic!("fixture Git daemon exited before readiness");
    }).await.unwrap();
    let host = format!("git://127.0.0.1:{port}");
    let remote_url = format!("{host}/fixture/project.git");
    git_at(&checkout, &["remote", "set-url", "origin", &remote_url]).await;
    let old_head = git::read(&checkout, &["rev-parse", "HEAD"]).await.unwrap();
    fs::write(source.join("remote.txt"), "remote\n").unwrap();
    git_at(&source, &["add", "remote.txt"]).await;
    git_at(&source, &["commit", "--quiet", "-m", "remote"]).await;
    git_at(&source, &["push", "--quiet", remote.to_str().unwrap(), "main"]).await;
    let remote_head = git::read(&source, &["rev-parse", "HEAD"]).await.unwrap();
    git_at(&checkout, &["config", "filter.probe.clean", "false"]).await;
    git_at(&checkout, &["config", "filter.probe.required", "true"]).await;
    fs::write(checkout.join("asset.asset"), "diff\n").unwrap();
    assert!(git::task(&checkout).await.is_err());
    let index = fs::read(checkout.join(".git/index")).unwrap();

    let service = Service::new(temporary.path().join("storage"), false, "test").unwrap();
    service.state.write().await.value = json!({"version":2,"accounts":[{"account":{"id":"fixture","provider":"gitea","host":host,"login":"fixture"},"token":"fixture-only"}],"repositories":[{"id":"fixture:1","accountId":"fixture","name":"project","fullName":"fixture/project","url":remote_url,"available":true}],"links":[{"repositoryId":"fixture:1","path":checkout.to_string_lossy(),"worktrees":[{"branch":"main","path":checkout.to_string_lossy()}]}]});
    let context = service.context("fixture:1").await.unwrap();
    let result = service.fetch_once(&context, &CancellationToken::new()).await.unwrap();
    assert_eq!(result["branches"], 1);
    assert_eq!(result["errors"], json!([]));
    assert_eq!(git::read(&checkout, &["rev-parse", "refs/remotes/origin/main"]).await.unwrap(), remote_head);
    assert_eq!(git::read(&checkout, &["rev-parse", "HEAD"]).await.unwrap(), old_head);
    assert_eq!(fs::read(checkout.join(".git/index")).unwrap(), index);
    assert_eq!(fs::read_to_string(checkout.join("asset.asset")).unwrap(), "diff\n");
    daemon.kill().await.unwrap();
}

#[tokio::test]
async fn foreground_cancels_native_reads_only_for_its_repository_and_resumes_after_failure() {
    for method in ["generateCommitMessage", "submitCommit", "pushCommit"] {
        let temporary = tempfile::tempdir().unwrap();
        let service = Service::new(temporary.path().to_owned(), false, "test").unwrap();
        let held = service.state.write().await;
        let token = CancellationToken::new();
        let reader = {
            let service = service.clone(); let token = token.clone();
            tokio::spawn(async move { service.handle("localWorkspace", json!({"repositoryId":"fixture:1"}), token).await })
        };
        registered(&service, "fixture:1", "localWorkspace").await;
        let other_token = CancellationToken::new();
        let other = {
            let service = service.clone(); let token = other_token.clone();
            tokio::spawn(async move { service.handle("localWorkspace", json!({"repositoryId":"fixture:2"}), token).await })
        };
        registered(&service, "fixture:2", "localWorkspace").await;
        let writer = {
            let service = service.clone();
            tokio::spawn(async move { service.handle(method, json!({"repositoryId":"fixture:1","taskId":"main"}), CancellationToken::new()).await })
        };
        registered(&service, "fixture:1", method).await;
        assert!(token.is_cancelled()); assert!(!other_token.is_cancelled());
        assert!(tokio::time::timeout(Duration::from_secs(5), reader).await.unwrap().unwrap().unwrap_err().contains("取消"));
        for read in ["localWorkspace", "remoteWorkspace", "fetchRepository"] {
            let token = CancellationToken::new();
            assert!(service.handle(read, json!({"repositoryId":"fixture:1"}), token.clone()).await.unwrap_err().contains("暂停"));
            assert!(token.is_cancelled());
        }
        other_token.cancel(); other.await.unwrap().unwrap_err();
        drop(held);
        writer.await.unwrap().unwrap_err();
        let message = service.handle("localWorkspace", json!({"repositoryId":"fixture:1"}), CancellationToken::new()).await.unwrap_err();
        assert!(!message.contains("暂停"));
        assert!(service.running_targets.lock().unwrap().is_empty());
    }
}

#[tokio::test]
async fn actual_commit_preserves_excluded_staging_and_remains_idempotent() {
    let temporary = tempfile::tempdir().unwrap();
    let root = temporary.path().join("checkout"); fs::create_dir(&root).unwrap();
    let root = dunce::canonicalize(root).unwrap();
    for arguments in [
        vec!["init", "--quiet", "--initial-branch=main", "--template="],
        vec!["config", "user.name", "Fixture"], vec!["config", "user.email", "fixture@example.invalid"],
        vec!["config", "commit.gpgsign", "false"], vec!["config", "core.autocrlf", "false"],
        vec!["remote", "add", "origin", "https://github.com/fixture/project.git"],
    ] { git::run(&root, &arguments, git::Options { write: true, ..Default::default() }).await.unwrap(); }
    fs::write(root.join("selected.txt"), "initial\n").unwrap();
    fs::write(root.join("excluded.txt"), "initial\n").unwrap();
    git::run(&root, &["add", "--all"], git::Options { write: true, ..Default::default() }).await.unwrap();
    git::run(&root, &["commit", "--quiet", "-m", "initial"], git::Options { write: true, ..Default::default() }).await.unwrap();
    fs::write(root.join("selected.txt"), "selected\n").unwrap();
    fs::write(root.join("excluded.txt"), "staged\n").unwrap();
    git::run(&root, &["add", "excluded.txt"], git::Options { write: true, ..Default::default() }).await.unwrap();
    let task = git::task(&root).await.unwrap();
    let service = Service::new(temporary.path().join("storage"), false, "test").unwrap();
    service.state.write().await.value = json!({"version":2,"accounts":[{"account":{"id":"fixture","provider":"github","host":"https://github.com","login":"fixture"},"token":"fixture-only"}],"repositories":[{"id":"fixture:1","accountId":"fixture","name":"project","fullName":"fixture/project","url":"https://github.com/fixture/project","available":true}],"links":[{"repositoryId":"fixture:1","path":root.to_string_lossy(),"worktrees":[{"branch":"main","path":root.to_string_lossy()}]}]});
    let input = json!({"repositoryId":"fixture:1","taskId":task["id"],"expectedHead":task["head"],"changeKey":task["changeKey"],"operationId":uuid::Uuid::new_v4().to_string(),"summary":"fixture commit","description":"","paths":["selected.txt"]});
    let result = service.handle("submitCommit", input.clone(), CancellationToken::new()).await.unwrap();
    assert!(result.get("warning").is_none());
    assert_eq!(service.handle("submitCommit", input, CancellationToken::new()).await.unwrap(), result);
    assert_eq!(git::read(&root, &["show", "HEAD:selected.txt"]).await.unwrap(), "selected\n");
    assert_eq!(git::read(&root, &["show", "HEAD:excluded.txt"]).await.unwrap(), "initial\n");
    assert_eq!(git::read(&root, &["show", ":excluded.txt"]).await.unwrap(), "staged\n");
    assert_eq!(git::read(&root, &["rev-list", "--count", "HEAD"]).await.unwrap().trim(), "2");
}
