use super::*;

fn fixture_state(root: Option<&Path>, provider: &str) -> Value {
    let host = if provider == "github-enterprise" { "https://github.example.invalid" } else { "https://github.com" };
    let mut value = json!({"version":2,"accounts":[{"account":{"id":"fixture","provider":provider,"host":host,"login":"fixture","name":"Fixture","updatedAt":"2026-11-01T00:00:00Z"},"token":"fixture-only"}],"repositories":[{"id":"fixture:1","accountId":"fixture","remoteId":1,"name":"project","fullName":"fixture/project","description":"","defaultBranch":"main","private":false,"url":format!("{host}/fixture/project"),"available":true}],"links":[]});
    if let Some(root) = root {
        value["links"] = json!([{"repositoryId":"fixture:1","path":root.to_string_lossy(),"worktrees":[{"branch":"main","path":root.to_string_lossy()}]}]);
    }
    assert!(valid_state(&value));
    value
}

#[tokio::test]
async fn lite_rejects_retired_operations_before_reading_or_writing_a_repository() {
    let temporary = tempfile::tempdir().unwrap();
    let service = Service::new(temporary.path().join("storage"), false, "test").unwrap();
    for method in ["createGraphWorktree", "accountRepositoryAccess", "openAccountAccessSettings", "generateCommitPlan", "prepareGraphMerge", "applyGraphMerge", "graphSources", "prepareIntegration", "applyIntegration", "restoreIntegration", "integrationBranches", "integrationCommits", "prepareFileOperation", "applyFileOperation", "discardFileOperation", "inspectDivergence"] {
        let error = service.handle(method, json!({}), CancellationToken::new()).await.unwrap_err();
        assert_eq!(error, "精简版不提供此操作。", "{method}");
    }
    assert!(!temporary.path().join("storage/accounts-v2.encrypted").exists());
}

#[tokio::test]
async fn github_accounts_cannot_launch_codex_commit_generation() {
    for provider in ["github", "github-enterprise"] {
        let temporary = tempfile::tempdir().unwrap();
        let service = Service::new(temporary.path().join("storage"), false, "test").unwrap();
        service.state.write().await.value = fixture_state(None, provider);
        let error = service.handle("generateCommitMessage", json!({"repositoryId":"fixture:1"}), CancellationToken::new()).await.unwrap_err();
        assert!(error.contains("GitHub 仓库不提供 Codex CLI"), "{provider}: {error}");
        assert!(service.generations.lock().await.is_empty());
    }
}

#[tokio::test]
async fn checkout_refuses_dirty_files_and_updates_the_associated_branch() {
    let temporary = tempfile::tempdir().unwrap();
    let root = temporary.path().join("checkout");
    fs::create_dir(&root).unwrap();
    let root = dunce::canonicalize(root).unwrap();
    for args in [
        vec!["init", "--quiet", "--initial-branch=main", "--template="],
        vec!["config", "user.name", "Fixture"],
        vec!["config", "user.email", "fixture@example.invalid"],
        vec!["config", "commit.gpgsign", "false"],
        vec!["remote", "add", "origin", "https://github.com/fixture/project.git"],
    ] { git::run(&root, &args, git::Options { write:true, ..Default::default() }).await.unwrap(); }
    fs::write(root.join("file.txt"), "initial\n").unwrap();
    for args in [vec!["add", "file.txt"], vec!["commit", "--quiet", "-m", "initial"], vec!["branch", "feature"]] {
        git::run(&root, &args, git::Options { write:true, ..Default::default() }).await.unwrap();
    }
    let service = Service::new(temporary.path().join("storage"), false, "test").unwrap();
    service.state.write().await.value = fixture_state(Some(&root), "github");
    let input = |task: &Value| json!({"repositoryId":"fixture:1","taskId":task["id"],"expectedHead":task["head"],"changeKey":task["changeKey"],"commitId":task["head"],"action":"checkout","name":"feature","operationId":uuid::Uuid::new_v4().to_string()});
    fs::write(root.join("file.txt"), "dirty\n").unwrap();
    let dirty = git::task(&root).await.unwrap();
    let error = service.handle("executeGraph", input(&dirty), CancellationToken::new()).await.unwrap_err();
    assert!(error.contains("切换分支前"), "{error}");
    assert_eq!(git::read(&root, &["branch", "--show-current"]).await.unwrap().trim(), "main");
    assert_eq!(fs::read_to_string(root.join("file.txt")).unwrap(), "dirty\n");
    fs::write(root.join("file.txt"), "initial\n").unwrap();
    let clean = git::task(&root).await.unwrap();
    let result = service.handle("executeGraph", input(&clean), CancellationToken::new()).await.unwrap();
    assert_eq!(result["branch"], "feature");
    assert_eq!(result["unchanged"], false);
    assert_eq!(result["catalog"]["links"][0]["worktrees"][0]["branch"], "feature");
}
