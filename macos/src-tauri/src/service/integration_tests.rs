use super::*;
use std::path::{Path, PathBuf};

async fn gitw(root: &Path, args: &[&str]) -> String {
    git::run(
        root,
        args,
        git::Options {
            write: true,
            ..Default::default()
        },
    )
    .await
    .unwrap_or_else(|error| panic!("git {args:?}: {error}"))
}
async fn head(root: &Path) -> String {
    git::read(root, &["rev-parse", "HEAD"])
        .await
        .unwrap()
        .trim()
        .to_owned()
}
struct Fixture {
    _temporary: tempfile::TempDir,
    local: PathBuf,
    writer: PathBuf,
    remote: PathBuf,
    service: Arc<Service>,
    context: Context,
}
impl Fixture {
    async fn new(conflict: bool) -> Self {
        let temp = tempfile::tempdir().unwrap();
        let source = temp.path().join("source");
        let remote_dir = temp.path().join("remotes/fixture");
        fs::create_dir(&source).unwrap();
        fs::create_dir_all(&remote_dir).unwrap();
        gitw(&source, &["init", "--initial-branch=main"]).await;
        for (key, value) in [
            ("user.name", "Fixture"),
            ("user.email", "fixture@example.invalid"),
            ("commit.gpgsign", "false"),
        ] {
            gitw(&source, &["config", key, value]).await;
        }
        fs::write(source.join("shared.txt"), "base\n").unwrap();
        gitw(&source, &["add", "shared.txt"]).await;
        gitw(&source, &["commit", "-m", "base"]).await;
        let remote = remote_dir.join("project.git");
        gitw(
            &source,
            &[
                "clone",
                "--bare",
                source.to_str().unwrap(),
                remote.to_str().unwrap(),
            ],
        )
        .await;
        let local = temp.path().join("local");
        let writer = temp.path().join("writer");
        for dir in [&local, &writer] {
            gitw(
                &source,
                &["clone", remote.to_str().unwrap(), dir.to_str().unwrap()],
            )
            .await;
            for (key, value) in [
                ("user.name", "Fixture"),
                ("user.email", "fixture@example.invalid"),
                ("commit.gpgsign", "false"),
            ] {
                gitw(dir, &["config", key, value]).await;
            }
        }
        let local = dunce::canonicalize(local).unwrap();
        let writer = dunce::canonicalize(writer).unwrap();
        let lp = if conflict { "shared.txt" } else { "local.txt" };
        let rp = if conflict { "shared.txt" } else { "remote.txt" };
        fs::write(local.join(lp), "base\nLOCAL_UNIQUE=1\n").unwrap();
        gitw(&local, &["add", lp]).await;
        gitw(&local, &["commit", "-m", "local"]).await;
        fs::write(writer.join(rp), "base\nREMOTE_UNIQUE=1\n").unwrap();
        gitw(&writer, &["add", rp]).await;
        gitw(&writer, &["commit", "-m", "remote"]).await;
        gitw(&writer, &["push", "origin", "main"]).await;
        let host = format!("file://{}", temp.path().join("remotes").display());
        let service = Service::new(temp.path().join("storage"), false, "test").unwrap();
        service.state.write().await.value = json!({"version":2,"accounts":[{"account":{"id":"fixture","provider":"gitea","host":host,"login":"fixture"},"token":"fixture-only"}],"repositories":[{"id":"fixture:1","accountId":"fixture","name":"project","fullName":"fixture/project","url":format!("{host}/fixture/project"),"available":true}],"links":[{"repositoryId":"fixture:1","path":local.to_string_lossy(),"authentication":"system","worktrees":[{"branch":"main","path":local.to_string_lossy()}]}]});
        let context = service.context("fixture:1").await.unwrap();
        Self {
            _temporary: temp,
            local,
            writer,
            remote,
            service,
            context,
        }
    }
    async fn input(&self, mode: &str, target: &str) -> Value {
        let task = git::task(&self.local).await.unwrap();
        let remote_head = head(&self.writer).await;
        json!({"repositoryId":"fixture:1","taskId":task["id"],"expectedHead":task["head"],"changeKey":task["changeKey"],"mode":mode,"remoteBranch":"main","remoteHead":remote_head,"targetCommit":target})
    }
}
#[tokio::test]
async fn rebase_selected_remote_commit_preserves_dirty_and_rejects_stale() {
    let f = Fixture::new(false).await;
    let cancel = CancellationToken::new();
    let selected = head(&f.writer).await;
    fs::write(f.writer.join("remote2.txt"), "later\n").unwrap();
    gitw(&f.writer, &["add", "remote2.txt"]).await;
    gitw(&f.writer, &["commit", "-m", "later"]).await;
    gitw(&f.writer, &["push", "origin", "main"]).await;
    let input = f.input("rebase", &selected).await;
    let old = head(&f.local).await;
    let index = fs::read(f.local.join(".git/index")).unwrap();
    let plan =
        graph_operations::integration::prepare(&f.local, &input, &f.service, &f.context, &cancel)
            .await
            .unwrap();
    assert_eq!(plan.public["targetCommit"], selected);
    assert_eq!(plan.public["replay"].as_array().unwrap().len(), 1);
    assert_eq!(head(&f.local).await, old);
    assert_eq!(fs::read(f.local.join(".git/index")).unwrap(), index);
    let result = graph_operations::integration::apply(
        &plan,
        &json!({"acknowledgeRewrite":true}),
        &f.service,
        &f.context,
        &cancel,
    )
    .await
    .unwrap();
    assert_eq!(result["status"], "rebased", "{result}");
    let rewritten = head(&f.local).await;
    assert_ne!(rewritten, old);
    assert_eq!(
        git::read(&f.local, &["rev-parse", "HEAD^"])
            .await
            .unwrap()
            .trim(),
        selected
    );
    assert_eq!(
        git::read(&f.local, &["rev-parse", text(&result, "recoveryRef")])
            .await
            .unwrap()
            .trim(),
        old
    );
    assert!(f.local.join("local.txt").exists());
    assert!(f.local.join("remote.txt").exists());
    assert!(!f.local.join("remote2.txt").exists());
    assert!(git::read(&f.local, &["status", "--porcelain"])
        .await
        .unwrap()
        .trim()
        .is_empty());
    assert_eq!(
        head(&f.writer).await,
        git::read(&f.remote, &["rev-parse", "refs/heads/main"])
            .await
            .unwrap()
            .trim()
    );
    fs::write(f.local.join("local.txt"), "staged\n").unwrap();
    gitw(&f.local, &["add", "local.txt"]).await;
    fs::write(f.local.join("local.txt"), "unstaged\n").unwrap();
    let dirty = f.input("rebase", &selected).await;
    let dirty_index = fs::read(f.local.join(".git/index")).unwrap();
    let error =
        graph_operations::integration::prepare(&f.local, &dirty, &f.service, &f.context, &cancel)
            .await
            .err()
            .unwrap();
    assert!(error.contains("暂存"), "{error}");
    assert_eq!(fs::read(f.local.join(".git/index")).unwrap(), dirty_index);
    assert_eq!(
        fs::read_to_string(f.local.join("local.txt")).unwrap(),
        "unstaged\n"
    );
    let refused = graph_operations::integration::restore(
        &plan,
        &json!({"acknowledgeRestore":true}),
        &f.service,
        &f.context,
        &cancel,
    )
    .await
    .err()
    .unwrap();
    assert!(refused.contains("暂存"), "{refused}");
    assert_eq!(fs::read(f.local.join(".git/index")).unwrap(), dirty_index);
    fs::write(f.local.join("local.txt"), "base\nLOCAL_UNIQUE=1\n").unwrap();
    gitw(&f.local, &["add", "local.txt"]).await;
    let restored = graph_operations::integration::restore(
        &plan,
        &json!({"acknowledgeRestore":true}),
        &f.service,
        &f.context,
        &cancel,
    )
    .await
    .unwrap();
    assert_eq!(restored["status"], "restored", "{restored}");
    assert_eq!(head(&f.local).await, old);
    assert_eq!(
        git::read(&f.local, &["rev-parse", text(&restored, "recoveryRef")])
            .await
            .unwrap()
            .trim(),
        rewritten
    );
    assert!(!f.local.join("remote.txt").exists());
    assert!(git::read(&f.local, &["status", "--porcelain"])
        .await
        .unwrap()
        .trim()
        .is_empty());
}
#[tokio::test]
async fn rebase_refuses_remote_advance_and_special_index_flags() {
    let f = Fixture::new(false).await;
    let cancel = CancellationToken::new();
    let remote = head(&f.writer).await;
    let input = f.input("rebase", &remote).await;
    let old = head(&f.local).await;
    let plan =
        graph_operations::integration::prepare(&f.local, &input, &f.service, &f.context, &cancel)
            .await
            .unwrap();
    let index = fs::read(f.local.join(".git/index")).unwrap();
    fs::write(f.writer.join("advance.txt"), "advanced\n").unwrap();
    gitw(&f.writer, &["add", "advance.txt"]).await;
    gitw(&f.writer, &["commit", "-m", "advance"]).await;
    gitw(&f.writer, &["push", "origin", "main"]).await;
    let error = graph_operations::integration::apply(
        &plan,
        &json!({"acknowledgeRewrite":true}),
        &f.service,
        &f.context,
        &cancel,
    )
    .await
    .err()
    .unwrap();
    assert!(error.contains("已更新"), "{error}");
    assert_eq!(head(&f.local).await, old);
    assert_eq!(fs::read(f.local.join(".git/index")).unwrap(), index);
    gitw(
        &f.local,
        &["update-index", "--assume-unchanged", "local.txt"],
    )
    .await;
    let next = head(&f.writer).await;
    let input = f.input("rebase", &next).await;
    let error =
        graph_operations::integration::prepare(&f.local, &input, &f.service, &f.context, &cancel)
            .await
            .err()
            .unwrap();
    assert!(error.contains("特殊标记"), "{error}");
}
#[tokio::test]
#[ignore = "Calls signed-in Codex using synthetic repository contents"]
async fn real_ai_rebase_conflict_and_remote_target_merge() {
    let f = Fixture::new(true).await;
    let cancel = CancellationToken::new();
    let remote = head(&f.writer).await;
    let input = f.input("rebase", &remote).await;
    let old = head(&f.local).await;
    let plan =
        graph_operations::integration::prepare(&f.local, &input, &f.service, &f.context, &cancel)
            .await
            .unwrap();
    assert!(!plan.public["resolvedConflicts"]
        .as_array()
        .unwrap()
        .is_empty());
    assert_eq!(head(&f.local).await, old);
    let result = graph_operations::integration::apply(
        &plan,
        &json!({"acknowledgeRewrite":true}),
        &f.service,
        &f.context,
        &cancel,
    )
    .await
    .unwrap();
    assert_eq!(result["status"], "rebased", "{result}");
    let text = fs::read_to_string(f.local.join("shared.txt")).unwrap();
    assert!(
        text.contains("LOCAL_UNIQUE=1") && text.contains("REMOTE_UNIQUE=1"),
        "{text}"
    );
    fs::write(f.local.join("local-next.txt"), "local\n").unwrap();
    gitw(&f.local, &["add", "local-next.txt"]).await;
    gitw(&f.local, &["commit", "-m", "local next"]).await;
    fs::write(f.writer.join("remote-next.txt"), "remote\n").unwrap();
    gitw(&f.writer, &["add", "remote-next.txt"]).await;
    gitw(&f.writer, &["commit", "-m", "remote next"]).await;
    gitw(&f.writer, &["push", "origin", "main"]).await;
    let before = head(&f.local).await;
    let remote = head(&f.writer).await;
    let input = f.input("remote-merge", &remote).await;
    let plan =
        graph_operations::integration::prepare(&f.local, &input, &f.service, &f.context, &cancel)
            .await
            .unwrap();
    let index = fs::read(f.local.join(".git/index")).unwrap();
    fs::write(f.writer.join("remote-advanced.txt"), "later\n").unwrap();
    gitw(&f.writer, &["add", "remote-advanced.txt"]).await;
    gitw(&f.writer, &["commit", "-m", "advance before publish"]).await;
    gitw(&f.writer, &["push", "origin", "main"]).await;
    let error = graph_operations::integration::apply(
        &plan,
        &json!({"summary":plan.public["summary"],"description":plan.public["description"]}),
        &f.service,
        &f.context,
        &cancel,
    )
    .await
    .err()
    .unwrap();
    assert!(error.contains("已更新"), "{error}");
    assert_eq!(head(&f.local).await, before);
    assert_eq!(fs::read(f.local.join(".git/index")).unwrap(), index);
    let remote = head(&f.writer).await;
    let input = f.input("remote-merge", &remote).await;
    let plan =
        graph_operations::integration::prepare(&f.local, &input, &f.service, &f.context, &cancel)
            .await
            .unwrap();
    let result = graph_operations::integration::apply(
        &plan,
        &json!({"summary":plan.public["summary"],"description":plan.public["description"]}),
        &f.service,
        &f.context,
        &cancel,
    )
    .await
    .unwrap();
    assert_eq!(result["status"], "pushed", "{result}");
    assert_eq!(head(&f.local).await, before);
    let parents = git::read(&f.remote, &["show", "-s", "--format=%P", "refs/heads/main"])
        .await
        .unwrap();
    assert_eq!(
        parents.split_whitespace().collect::<Vec<_>>(),
        vec![remote.as_str(), before.as_str()]
    );
}

struct Daemon(std::process::Child);
impl Drop for Daemon {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}
#[tokio::test]
#[ignore = "Starts a loopback Git server for an isolated synthetic repository"]
async fn integration_service_dispatch_rebases_and_restores() {
    let f = Fixture::new(false).await;
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    drop(listener);
    let base = f._temporary.path().join("remotes");
    let child = std::process::Command::new("git")
        .args([
            "daemon",
            "--reuseaddr",
            "--export-all",
            "--enable=receive-pack",
            "--listen=127.0.0.1",
            &format!("--port={port}"),
            &format!("--base-path={}", base.display()),
        ])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .unwrap();
    let _daemon = Daemon(child);
    let remote_url = format!("git://127.0.0.1:{port}/fixture/project.git");
    gitw(&f.local, &["remote", "set-url", "origin", &remote_url]).await;
    {
        let mut state = f.service.state.write().await;
        state.value["accounts"][0]["account"]["host"] = json!(format!("git://127.0.0.1:{port}"));
        state.value["repositories"][0]["url"] = json!(remote_url.trim_end_matches(".git"));
    }
    let token = CancellationToken::new();
    let task = git::task(&f.local).await.unwrap();
    let base_input = json!({"repositoryId":"fixture:1","taskId":task["id"]});
    let mut result = None;
    for _ in 0..30 {
        match f
            .service
            .handle("integrationBranches", base_input.clone(), token.clone())
            .await
        {
            Ok(value) => {
                result = Some(value);
                break;
            }
            Err(_) => tokio::time::sleep(Duration::from_millis(100)).await,
        }
    }
    let branches = result.expect("loopback daemon did not start");
    let remote = text(&branches["branches"][0], "head");
    let page=f.service.handle("integrationCommits",json!({"repositoryId":"fixture:1","taskId":task["id"],"remoteBranch":"main","remoteHead":remote,"page":0}),token.clone()).await.unwrap();
    assert_eq!(page["ahead"], 1);
    assert_eq!(page["behind"], 1);
    let generation = uuid::Uuid::new_v4().to_string();
    let input = json!({"repositoryId":"fixture:1","taskId":task["id"],"expectedHead":task["head"],"changeKey":task["changeKey"],"mode":"rebase","remoteBranch":"main","remoteHead":remote,"targetCommit":remote,"generationId":generation});
    let plan = f
        .service
        .handle("prepareIntegration", input, token.clone())
        .await
        .unwrap();
    let operation = uuid::Uuid::new_v4().to_string();
    let apply = json!({"repositoryId":"fixture:1","taskId":task["id"],"planId":plan["id"],"operationId":operation,"summary":"","description":"","acknowledgeRewrite":true});
    let result = f
        .service
        .handle("applyIntegration", apply.clone(), token.clone())
        .await
        .unwrap();
    assert_eq!(result["status"], "rebased", "{result}");
    assert_eq!(
        f.service
            .handle("applyIntegration", apply, token.clone())
            .await
            .unwrap(),
        result
    );
    let restore=f.service.handle("restoreIntegration",json!({"repositoryId":"fixture:1","taskId":task["id"],"planId":plan["id"],"operationId":uuid::Uuid::new_v4().to_string(),"acknowledgeRestore":true}),token.clone()).await.unwrap();
    assert_eq!(restore["status"], "restored", "{restore}");
    assert_eq!(head(&f.local).await, text(&task, "head"));
    let generation = uuid::Uuid::new_v4().to_string();
    f.service
        .handle(
            "cancelGraphPreparation",
            json!({"repositoryId":"fixture:1","taskId":task["id"],"generationId":generation}),
            token.clone(),
        )
        .await
        .unwrap();
    let task = git::task(&f.local).await.unwrap();
    let canceled=f.service.handle("prepareIntegration",json!({"repositoryId":"fixture:1","taskId":task["id"],"expectedHead":task["head"],"changeKey":task["changeKey"],"mode":"rebase","remoteBranch":"main","remoteHead":remote,"targetCommit":remote,"generationId":generation}),token).await;
    assert!(canceled.is_err());
    assert_eq!(head(&f.local).await, text(&task, "head"));
}

#[tokio::test]
async fn integration_rejects_unsafe_config_wrong_commit_and_ahead_only_remote() {
    let f = Fixture::new(false).await;
    let cancel = CancellationToken::new();
    let remote = head(&f.writer).await;
    let local = head(&f.local).await;
    let index = fs::read(f.local.join(".git/index")).unwrap();
    let wrong = f.input("rebase", &local).await;
    let error =
        graph_operations::integration::prepare(&f.local, &wrong, &f.service, &f.context, &cancel)
            .await
            .err()
            .unwrap();
    assert!(error.contains("所选提交"), "{error}");
    gitw(&f.local, &["config", "commit.gpgsign", "true"]).await;
    let signed = f.input("rebase", &remote).await;
    let error =
        graph_operations::integration::prepare(&f.local, &signed, &f.service, &f.context, &cancel)
            .await
            .err()
            .unwrap();
    assert!(error.contains("签名"), "{error}");
    gitw(&f.local, &["config", "commit.gpgsign", "false"]).await;
    let base = git::read(&f.local, &["rev-parse", "HEAD^"])
        .await
        .unwrap()
        .trim()
        .to_owned();
    gitw(&f.remote, &["update-ref", "refs/heads/behind", &base]).await;
    let mut ahead = f.input("remote-merge", &base).await;
    ahead["remoteBranch"] = json!("behind");
    ahead["remoteHead"] = json!(base);
    let error =
        graph_operations::integration::prepare(&f.local, &ahead, &f.service, &f.context, &cancel)
            .await
            .err()
            .unwrap();
    assert!(error.contains("普通 Push"), "{error}");
    let cancelled = CancellationToken::new();
    cancelled.cancel();
    let input = f.input("rebase", &remote).await;
    assert!(graph_operations::integration::prepare(
        &f.local, &input, &f.service, &f.context, &cancelled
    )
    .await
    .is_err());
    assert_eq!(head(&f.local).await, local);
    assert_eq!(fs::read(f.local.join(".git/index")).unwrap(), index);
}

#[cfg(unix)]
#[tokio::test]
#[ignore = "Calls Codex and simulates a concurrent push in a synthetic local repository"]
async fn remote_moves_during_push_without_losing_its_new_commit() {
    use std::os::unix::fs::PermissionsExt;
    let f = Fixture::new(false).await;
    let cancel = CancellationToken::new();
    let remote_before = head(&f.writer).await;
    let local_before = head(&f.local).await;
    let index = fs::read(f.local.join(".git/index")).unwrap();
    let input = f.input("remote-merge", &remote_before).await;
    let plan =
        graph_operations::integration::prepare(&f.local, &input, &f.service, &f.context, &cancel)
            .await
            .unwrap();
    fs::write(f.writer.join("concurrent.txt"), "concurrent writer\n").unwrap();
    gitw(&f.writer, &["add", "concurrent.txt"]).await;
    gitw(&f.writer, &["commit", "-m", "concurrent writer"]).await;
    let concurrent = head(&f.writer).await;
    let refspec = format!("{concurrent}:refs/gittogether/test-object");
    gitw(&f.writer, &["push", "origin", &refspec]).await;
    let quote = |value: &str| format!("'{}'", value.replace('\'', "'\\''"));
    let hook = f.local.join(".git/hooks/pre-push");
    let script = format!(
        "#!/bin/sh\ngit --git-dir={} update-ref refs/heads/main {} {}\n",
        quote(f.remote.to_str().unwrap()),
        quote(&concurrent),
        quote(&remote_before)
    );
    fs::write(&hook, script).unwrap();
    fs::set_permissions(&hook, fs::Permissions::from_mode(0o700)).unwrap();
    let result = graph_operations::integration::apply(
        &plan,
        &json!({"summary":plan.public["summary"],"description":plan.public["description"]}),
        &f.service,
        &f.context,
        &cancel,
    )
    .await
    .unwrap();
    assert!(
        result["status"] == "created-not-pushed" || result["status"] == "unknown",
        "{result}"
    );
    assert_eq!(
        git::read(&f.remote, &["rev-parse", "refs/heads/main"])
            .await
            .unwrap()
            .trim(),
        concurrent
    );
    assert_eq!(head(&f.local).await, local_before);
    assert_eq!(fs::read(f.local.join(".git/index")).unwrap(), index);
    let saved = git::read(&f.local, &["rev-parse", text(&result, "recoveryRef")])
        .await
        .unwrap();
    assert_eq!(saved.trim(), text(&result, "commitId"));
}

#[tokio::test]
#[ignore = "Requires a deliberately failing synthetic Codex executable on PATH"]
async fn unavailable_codex_preserves_conflicting_worktree_and_index() {
    let fake =
        std::env::var("GITTOGETHER_TEST_FAKE_CODEX_PATH").expect("set the fixture executable path");
    assert_eq!(
        crate::util::find_tool("codex").unwrap(),
        PathBuf::from(fake)
    );
    let f = Fixture::new(true).await;
    let cancel = CancellationToken::new();
    let remote = head(&f.writer).await;
    let input = f.input("rebase", &remote).await;
    let local = head(&f.local).await;
    let index = fs::read(f.local.join(".git/index")).unwrap();
    let content = fs::read(f.local.join("shared.txt")).unwrap();
    let error =
        graph_operations::integration::prepare(&f.local, &input, &f.service, &f.context, &cancel)
            .await
            .err()
            .unwrap();
    assert!(error.contains("AI") || error.contains("Codex"), "{error}");
    assert_eq!(head(&f.local).await, local);
    assert_eq!(fs::read(f.local.join(".git/index")).unwrap(), index);
    assert_eq!(fs::read(f.local.join("shared.txt")).unwrap(), content);
    assert_eq!(
        git::read(&f.remote, &["rev-parse", "refs/heads/main"])
            .await
            .unwrap()
            .trim(),
        remote
    );
}
