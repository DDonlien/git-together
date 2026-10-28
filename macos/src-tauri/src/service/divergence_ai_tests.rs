use super::*;
use std::path::Path;

async fn write_git(root: &Path, args: &[&str]) -> String {
    git::run(
        root,
        args,
        git::Options {
            write: true,
            ..Default::default()
        },
    )
    .await
    .unwrap()
}

#[tokio::test]
#[ignore = "Calls the locally signed-in Codex CLI using only synthetic repository contents"]
async fn real_ai_merge_resolves_a_synthetic_conflict_without_pushing() {
    let temporary = tempfile::tempdir().unwrap();
    let source = temporary.path().join("source");
    let remotes = temporary.path().join("remotes/fixture");
    fs::create_dir(&source).unwrap();
    fs::create_dir_all(&remotes).unwrap();
    for args in [
        vec!["init", "--initial-branch=main"],
        vec!["config", "user.name", "Fixture"],
        vec!["config", "user.email", "fixture@example.invalid"],
        vec!["config", "commit.gpgsign", "false"],
    ] {
        write_git(&source, &args).await;
    }
    fs::write(source.join("content.txt"), "shared\n").unwrap();
    write_git(&source, &["add", "content.txt"]).await;
    write_git(&source, &["commit", "-m", "base"]).await;
    let remote = remotes.join("project.git");
    write_git(
        &source,
        &[
            "clone",
            "--bare",
            source.to_str().unwrap(),
            remote.to_str().unwrap(),
        ],
    )
    .await;
    let local = temporary.path().join("local");
    let writer = temporary.path().join("writer");
    for path in [&local, &writer] {
        write_git(
            &source,
            &["clone", remote.to_str().unwrap(), path.to_str().unwrap()],
        )
        .await;
        for args in [
            vec!["config", "user.name", "Fixture"],
            vec!["config", "user.email", "fixture@example.invalid"],
            vec!["config", "commit.gpgsign", "false"],
        ] {
            write_git(path, &args).await;
        }
    }
    let local = dunce::canonicalize(local).unwrap();
    let writer = dunce::canonicalize(writer).unwrap();
    fs::write(local.join("content.txt"), "shared\nLOCAL_UNIQUE=1\n").unwrap();
    write_git(&local, &["add", "content.txt"]).await;
    write_git(&local, &["commit", "-m", "local"]).await;
    fs::write(writer.join("content.txt"), "shared\nREMOTE_UNIQUE=1\n").unwrap();
    write_git(&writer, &["add", "content.txt"]).await;
    write_git(&writer, &["commit", "-m", "remote"]).await;
    write_git(&writer, &["push", "origin", "main"]).await;
    let remote_head = git::read(&writer, &["rev-parse", "HEAD"])
        .await
        .unwrap()
        .trim()
        .to_owned();
    let host = format!("file://{}", temporary.path().join("remotes").display());
    let service = Service::new(temporary.path().join("storage"), false, "test").unwrap();
    service.state.write().await.value = json!({"version":2,"accounts":[{"account":{"id":"fixture","provider":"gitea","host":host,"login":"fixture"},"token":"fixture-only"}],"repositories":[{"id":"fixture:1","accountId":"fixture","name":"project","fullName":"fixture/project","url":format!("{host}/fixture/project"),"available":true}],"links":[{"repositoryId":"fixture:1","path":local.to_string_lossy(),"authentication":"system","worktrees":[{"branch":"main","path":local.to_string_lossy()}]}]});
    let before = git::task(&local).await.unwrap();
    let index = fs::read(local.join(".git/index")).unwrap();
    let input = json!({"repositoryId":"fixture:1","taskId":before["id"],"expectedHead":before["head"],"changeKey":before["changeKey"],"requireClean":true,"expectedRemoteHead":remote_head,"sources":[{"name":"main","kind":"remote","taskId":""}],"generationId":uuid::Uuid::new_v4().to_string()});
    let context = service.context("fixture:1").await.unwrap();
    let cancel = CancellationToken::new();
    let plan = graph_operations::prepare(&local, &input, &service, &context, &cancel)
        .await
        .unwrap();
    assert!(!plan.public["resolvedConflicts"]
        .as_array()
        .unwrap()
        .is_empty());
    assert_eq!(git::task(&local).await.unwrap()["head"], before["head"]);
    assert_eq!(fs::read(local.join(".git/index")).unwrap(), index);
    let result = graph_operations::apply(&plan, &json!({"repositoryId":"fixture:1","taskId":before["id"],"planId":plan.public["id"],"operationId":uuid::Uuid::new_v4().to_string(),"summary":plan.public["summary"],"description":plan.public["description"]}), &service, &context, &cancel).await.unwrap();
    assert!(result.get("warning").is_none(), "{result}");
    let parents = git::read(&local, &["show", "-s", "--format=%P", "HEAD"])
        .await
        .unwrap();
    assert_eq!(
        parents.split_whitespace().collect::<Vec<_>>(),
        vec![text(&before, "head"), remote_head.as_str()]
    );
    let content = fs::read_to_string(local.join("content.txt")).unwrap();
    assert!(
        content.contains("LOCAL_UNIQUE=1")
            && content.contains("REMOTE_UNIQUE=1")
            && !content.contains("<<<<<<<"),
        "{content}"
    );
    assert_eq!(
        git::read(&remote, &["rev-parse", "refs/heads/main"])
            .await
            .unwrap()
            .trim(),
        remote_head
    );

    fs::write(local.join("local-next.txt"), "local next\n").unwrap();
    write_git(&local, &["add", "local-next.txt"]).await;
    write_git(&local, &["commit", "-m", "local next"]).await;
    fs::write(writer.join("remote-next.txt"), "remote next\n").unwrap();
    write_git(&writer, &["add", "remote-next.txt"]).await;
    write_git(&writer, &["commit", "-m", "remote next"]).await;
    write_git(&writer, &["push", "origin", "main"]).await;
    let next_remote = git::read(&writer, &["rev-parse", "HEAD"])
        .await
        .unwrap()
        .trim()
        .to_owned();
    let next_before = git::task(&local).await.unwrap();
    let next_input = json!({"repositoryId":"fixture:1","taskId":next_before["id"],"expectedHead":next_before["head"],"changeKey":next_before["changeKey"],"requireClean":true,"expectedRemoteHead":next_remote,"sources":[{"name":"main","kind":"remote","taskId":""}],"generationId":uuid::Uuid::new_v4().to_string()});
    let next_plan = graph_operations::prepare(&local, &next_input, &service, &context, &cancel)
        .await
        .unwrap();
    let next_index = fs::read(local.join(".git/index")).unwrap();
    fs::write(writer.join("remote-last.txt"), "remote advanced\n").unwrap();
    write_git(&writer, &["add", "remote-last.txt"]).await;
    write_git(&writer, &["commit", "-m", "remote advanced"]).await;
    write_git(&writer, &["push", "origin", "main"]).await;
    let apply = json!({"repositoryId":"fixture:1","taskId":next_before["id"],"planId":next_plan.public["id"],"operationId":uuid::Uuid::new_v4().to_string(),"summary":next_plan.public["summary"],"description":next_plan.public["description"]});
    let stale_error = graph_operations::apply(&next_plan, &apply, &service, &context, &cancel)
        .await
        .unwrap_err();
    assert!(stale_error.contains("已更新"), "{stale_error}");
    assert_eq!(
        git::task(&local).await.unwrap()["head"],
        next_before["head"]
    );
    assert_eq!(fs::read(local.join(".git/index")).unwrap(), next_index);
}
