use super::*;
use std::path::PathBuf;

async fn git_write(root: &std::path::Path, arguments: &[&str]) {
    git::run(root, arguments, git::Options { write: true, ..Default::default() }).await.unwrap();
}

async fn fixture() -> (tempfile::TempDir, Arc<Service>, PathBuf) {
    let temporary = tempfile::tempdir().unwrap();
    let checkout = temporary.path().join("checkout");
    fs::create_dir(&checkout).unwrap();
    let root = dunce::canonicalize(checkout).unwrap();
    for args in [
        vec!["init", "--quiet", "--initial-branch=main", "--template="],
        vec!["config", "user.name", "Fixture"],
        vec!["config", "user.email", "fixture@example.invalid"],
        vec!["config", "commit.gpgsign", "false"],
        vec!["config", "core.autocrlf", "false"],
        vec!["remote", "add", "origin", "https://github.com/fixture/project.git"],
    ] { git_write(&root, &args).await; }
    fs::write(root.join("chosen.txt"), "initial\n").unwrap();
    fs::write(root.join("excluded.txt"), "initial\n").unwrap();
    git_write(&root, &["add", "--all"]).await;
    git_write(&root, &["commit", "--quiet", "-m", "initial"]).await;
    let service = Service::new(temporary.path().join("storage"), false, "test").unwrap();
    service.state.write().await.value = json!({"version":2,"accounts":[{"account":{"id":"fixture","provider":"github","host":"https://github.com","login":"fixture"},"token":"fixture-only"}],"repositories":[{"id":"fixture:1","accountId":"fixture","name":"project","fullName":"fixture/project","url":"https://github.com/fixture/project","available":true}],"links":[{"repositoryId":"fixture:1","path":root.to_string_lossy(),"worktrees":[{"branch":"main","path":root.to_string_lossy()}]}]});
    (temporary, service, root)
}

fn request(task: &Value, paths: Vec<String>, groups: Value) -> Value {
    json!({"repositoryId":"fixture:1","taskId":task["id"],"expectedHead":task["head"],"changeKey":task["changeKey"],"operationId":uuid::Uuid::new_v4().to_string(),"summary":"","description":"","paths":paths,"groups":groups})
}

#[tokio::test]
async fn large_split_preserves_unselected_staging_and_creates_each_group_once() {
    let (_temporary, service, root) = fixture().await;
    fs::write(root.join("chosen.txt"), "chosen\n").unwrap();
    fs::write(root.join("excluded.txt"), "staged\n").unwrap();
    git_write(&root, &["add", "excluded.txt"]).await;
    fs::write(root.join("excluded.txt"), "working\n").unwrap();
    fs::create_dir(root.join("items")).unwrap();
    let mut files = Vec::new();
    for number in 0..700 {
        let path = format!("items/{number:04}-{}", "long-name-".repeat(8));
        fs::write(root.join(&path), "fixture\n").unwrap();
        files.push(path);
    }
    let unusual = "items/特殊\tfile\nname.txt".to_owned();
    fs::write(root.join(&unusual), "unusual\n").unwrap();
    files.push(unusual.clone());
    let mut first = vec!["chosen.txt".to_owned()];
    first.extend(files[..350].iter().cloned());
    let second = files[350..].to_vec();
    let mut selected = first.clone(); selected.extend(second.clone());
    let task = git::task(&root).await.unwrap();
    let input = request(&task, selected, json!([
        {"summary":"first group","description":"","paths":first},
        {"summary":"second group","description":"","paths":second},
    ]));
    assert!(serde_json::to_vec(&input).unwrap().len() > 32_768);
    let result = service.handle("submitCommit", input.clone(), CancellationToken::new()).await.unwrap();
    assert!(result.get("warning").is_none(), "{result}");
    assert_eq!(result["commits"].as_array().unwrap().len(), 2);
    assert_eq!(service.handle("submitCommit", input, CancellationToken::new()).await.unwrap(), result);
    assert_eq!(git::read(&root, &["rev-list", "--count", "HEAD"]).await.unwrap().trim(), "3");
    assert_eq!(git::read(&root, &["show", "HEAD^:chosen.txt"]).await.unwrap(), "chosen\n");
    assert_eq!(git::read(&root, &["show", &format!("HEAD:{unusual}")]).await.unwrap(), "unusual\n");
    assert_eq!(git::read(&root, &["show", ":excluded.txt"]).await.unwrap(), "staged\n");
    assert_eq!(fs::read_to_string(root.join("excluded.txt")).unwrap(), "working\n");
}

#[tokio::test]
async fn large_manual_selection_can_still_be_one_commit() {
    let (_temporary, service, root) = fixture().await;
    fs::create_dir(root.join("items")).unwrap();
    let paths: Vec<_> = (0..450).map(|number| format!("items/{number:04}-{}", "long-name-".repeat(8))).collect();
    for path in &paths { fs::write(root.join(path), "fixture\n").unwrap(); }
    let task = git::task(&root).await.unwrap();
    let input = json!({"repositoryId":"fixture:1","taskId":task["id"],"expectedHead":task["head"],"changeKey":task["changeKey"],"operationId":uuid::Uuid::new_v4().to_string(),"summary":"manual commit","description":"","paths":paths});
    assert!(serde_json::to_vec(&input).unwrap().len() > 32_768);
    let result = service.handle("submitCommit", input, CancellationToken::new()).await.unwrap();
    assert!(result.get("warning").is_none(), "{result}");
    assert_eq!(git::read(&root, &["rev-list", "--count", "HEAD"]).await.unwrap().trim(), "2");
}

#[tokio::test]
async fn staged_rename_in_a_later_group_keeps_both_paths_together() {
    let (_temporary, service, root) = fixture().await;
    git_write(&root, &["mv", "chosen.txt", "renamed.txt"]).await;
    fs::write(root.join("first.txt"), "first\n").unwrap();
    let task = git::task(&root).await.unwrap();
    let rename = task["files"].as_array().unwrap().iter().find(|file| text(file, "path") == "renamed.txt").unwrap();
    assert_eq!(rename["previousPath"], "chosen.txt");
    let input = request(&task, vec!["first.txt".into(), "renamed.txt".into()], json!([
        {"summary":"first","description":"","paths":["first.txt"]},
        {"summary":"rename","description":"","paths":["renamed.txt"]},
    ]));
    let result = service.handle("submitCommit", input, CancellationToken::new()).await.unwrap();
    assert!(result.get("warning").is_none(), "{result}");
    assert_eq!(result["commits"].as_array().unwrap().len(), 2);
    assert_eq!(git::read(&root, &["show", "HEAD:renamed.txt"]).await.unwrap(), "initial\n");
    assert!(git::read(&root, &["show", "HEAD:chosen.txt"]).await.is_err());
}

#[tokio::test]
#[ignore = "Uses the locally signed-in Codex CLI with a synthetic repository"]
async fn full_large_generation_with_real_cli() {
    let (_temporary, service, root) = fixture().await;
    let prefix = format!("synthetic{}", uuid::Uuid::new_v4().simple());
    let paths: Vec<_> = (0..1354).map(|number| format!("{prefix}/g{:02}/{number:04}.txt", number % 23)).collect();
    for path in &paths {
        let target = root.join(path);
        fs::create_dir_all(target.parent().unwrap()).unwrap();
        fs::write(target, "Synthetic fixture content.\n").unwrap();
    }
    let task = git::task(&root).await.unwrap();
    let input = json!({"repositoryId":"fixture:1","taskId":task["id"],"expectedHead":task["head"],"changeKey":task["changeKey"],"generationId":uuid::Uuid::new_v4().to_string(),"paths":paths});
    assert!(serde_json::to_vec(&input).unwrap().len() > 32_768);
    let context = service.context("fixture:1").await.unwrap();
    let (data, selected) = ai::commit_context(&root, &input, &CancellationToken::new(), &service, &context, true).await.unwrap();
    assert_eq!(selected.len(), 1354);
    assert!(data["records"].as_array().unwrap().is_empty(), "Synthetic test must not send unrelated records to AI");
    let sampled: std::collections::BTreeSet<_> = data["untracked"].as_array().unwrap().iter().filter_map(|file| text(file, "path").split('/').nth(1)).collect();
    assert_eq!(sampled.len(), 23);
    let result = service.handle("generateCommitPlan", input, CancellationToken::new()).await.unwrap();
    let groups = result["groups"].as_array().unwrap();
    let actual: std::collections::BTreeSet<_> = groups.iter().flat_map(|group| group["paths"].as_array().unwrap().iter().map(|path| path.as_str().unwrap())).collect();
    assert_eq!(actual.len(), 1354);
    assert!(selected.iter().all(|path| actual.contains(path.as_str())));
    println!("Service generated {} groups covering {} synthetic files", groups.len(), actual.len());
}

#[cfg(unix)]
#[tokio::test]
async fn changed_remaining_file_stops_after_the_first_commit() {
    use std::os::unix::fs::PermissionsExt;
    let (_temporary, service, root) = fixture().await;
    fs::write(root.join("one.txt"), "first\n").unwrap();
    fs::write(root.join("two.txt"), "original second\n").unwrap();
    fs::create_dir_all(root.join(".git/hooks")).unwrap();
    let hook = root.join(".git/hooks/post-commit");
    fs::write(&hook, "#!/bin/sh\nprintf 'changed by hook\\n' > two.txt\n").unwrap();
    fs::set_permissions(hook, fs::Permissions::from_mode(0o755)).unwrap();
    let task = git::task(&root).await.unwrap();
    let input = request(&task, vec!["one.txt".into(), "two.txt".into()], json!([
        {"summary":"one","description":"","paths":["one.txt"]},
        {"summary":"two","description":"","paths":["two.txt"]},
    ]));
    let result = service.handle("submitCommit", input, CancellationToken::new()).await.unwrap();
    assert_eq!(result["incomplete"], true);
    assert_eq!(result["commits"].as_array().unwrap().len(), 1);
    assert_eq!(git::read(&root, &["rev-list", "--count", "HEAD"]).await.unwrap().trim(), "2");
    assert_eq!(fs::read_to_string(root.join("two.txt")).unwrap(), "changed by hook\n");
}

#[cfg(unix)]
#[tokio::test]
async fn failed_later_commit_reports_partial_result_without_replaying() {
    use std::os::unix::fs::PermissionsExt;
    let (_temporary, service, root) = fixture().await;
    fs::write(root.join("one.txt"), "first\n").unwrap();
    fs::write(root.join("two.txt"), "second\n").unwrap();
    fs::create_dir_all(root.join(".git/hooks")).unwrap();
    let hook = root.join(".git/hooks/pre-commit");
    fs::write(&hook, "#!/bin/sh\ncount=$(git rev-list --count HEAD)\n[ \"$count\" -lt 2 ]\n").unwrap();
    fs::set_permissions(hook, fs::Permissions::from_mode(0o755)).unwrap();
    let task = git::task(&root).await.unwrap();
    let input = request(&task, vec!["one.txt".into(), "two.txt".into()], json!([
        {"summary":"one","description":"","paths":["one.txt"]},
        {"summary":"two","description":"","paths":["two.txt"]},
    ]));
    let result = service.handle("submitCommit", input.clone(), CancellationToken::new()).await.unwrap();
    assert_eq!(result["incomplete"], true);
    assert_eq!(result["commits"].as_array().unwrap().len(), 1);
    assert_eq!(service.handle("submitCommit", input, CancellationToken::new()).await.unwrap(), result);
    assert_eq!(git::read(&root, &["rev-list", "--count", "HEAD"]).await.unwrap().trim(), "2");
    assert!(root.join("two.txt").exists());
}

#[tokio::test]
async fn missing_or_duplicate_selected_files_are_rejected_before_committing() {
    let (_temporary, service, root) = fixture().await;
    fs::write(root.join("one.txt"), "one\n").unwrap();
    fs::write(root.join("two.txt"), "two\n").unwrap();
    let task = git::task(&root).await.unwrap();
    for groups in [
        json!([{"summary":"one","description":"","paths":["one.txt"]}]),
        json!([{"summary":"one","description":"","paths":["one.txt", "one.txt"]}, {"summary":"two","description":"","paths":["two.txt"]}]),
    ] {
        let input = request(&task, vec!["one.txt".into(), "two.txt".into()], groups);
        assert!(service.handle("submitCommit", input, CancellationToken::new()).await.is_err());
    }
    assert_eq!(git::read(&root, &["rev-list", "--count", "HEAD"]).await.unwrap().trim(), "1");
}
