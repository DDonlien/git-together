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
