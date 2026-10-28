use super::*;
use crate::provider::{client, Provider};
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, BufReader};

#[tokio::test]
async fn divergence_inspection_preserves_index_and_checks_the_actual_push_target() {
    let temporary = tempfile::tempdir().unwrap();
    let source = temporary.path().join("source");
    let remote_dir = temporary.path().join("remotes/fixture");
    fs::create_dir(&source).unwrap();
    fs::create_dir_all(&remote_dir).unwrap();
    for args in [vec!["init", "--initial-branch=main"], vec!["config", "user.name", "Fixture"], vec!["config", "user.email", "fixture@example.invalid"], vec!["config", "commit.gpgsign", "false"]] { fixture_git(&source, &args).await; }
    fs::write(source.join("base.txt"), "base\n").unwrap();
    fixture_git(&source, &["add", "base.txt"]).await;
    fixture_git(&source, &["commit", "-m", "base"]).await;
    let remote = remote_dir.join("project.git");
    let stale = temporary.path().join("stale.git");
    fixture_git(&source, &["clone", "--bare", source.to_str().unwrap(), remote.to_str().unwrap()]).await;
    fixture_git(&source, &["clone", "--bare", source.to_str().unwrap(), stale.to_str().unwrap()]).await;
    let local = temporary.path().join("local");
    let behind = temporary.path().join("behind");
    let writer = temporary.path().join("writer");
    for destination in [&local, &behind, &writer] {
        fixture_git(&source, &["clone", remote.to_str().unwrap(), destination.to_str().unwrap()]).await;
        for args in [vec!["config", "user.name", "Fixture"], vec!["config", "user.email", "fixture@example.invalid"], vec!["config", "commit.gpgsign", "false"]] { fixture_git(destination, &args).await; }
    }
    let local = dunce::canonicalize(local).unwrap();
    let behind = dunce::canonicalize(behind).unwrap();
    let writer = dunce::canonicalize(writer).unwrap();
    let host = format!("file://{}", temporary.path().join("remotes").display());
    let provider = Provider::new(json!({"id":"fixture","provider":"gitea","host":host,"login":"fixture"}), "fixture-only".into(), client().unwrap());
    let repo = json!({"id":"fixture:1","accountId":"fixture","remoteId":1,"name":"project","fullName":"fixture/project","url":format!("{host}/fixture/project")});
    let network = Network::new(&repo, &provider).unwrap().for_link(&json!({"path":local.to_string_lossy(),"authentication":"system","worktrees":[{"path":local.to_string_lossy()},{"path":behind.to_string_lossy()}]}));
    let cancel = CancellationToken::new();
    let request = |task: &Value, mode: &str| json!({"repositoryId":"fixture:1","taskId":task["id"],"mode":mode});
    let initial = git::task(&local).await.unwrap();
    assert_eq!(inspect_divergence(&local, &request(&initial, "pull"), &network, &cancel).await.unwrap()["diverged"], false);
    fs::write(local.join("local.txt"), "local\n").unwrap();
    fixture_git(&local, &["add", "local.txt"]).await;
    fixture_git(&local, &["commit", "-m", "local"]).await;
    let local_task = git::task(&local).await.unwrap();
    assert_eq!(inspect_divergence(&local, &request(&local_task, "push"), &network, &cancel).await.unwrap()["diverged"], false);
    fs::write(writer.join("remote.txt"), "remote\n").unwrap();
    fixture_git(&writer, &["add", "remote.txt"]).await;
    fixture_git(&writer, &["commit", "-m", "remote"]).await;
    fixture_git(&writer, &["push", "origin", "main"]).await;
    let behind_task = git::task(&behind).await.unwrap();
    assert_eq!(inspect_divergence(&behind, &request(&behind_task, "pull"), &network.for_worktree(&behind), &cancel).await.unwrap()["diverged"], false);
    let pull_input = request(&local_task, "pull");
    let pull_error = match prepare(&local, &pull_input, &network, temporary.path(), &cancel).await { Ok(_) => panic!("diverged pull must stop"), Err(error) => error };
    assert_eq!(pull_error, PULL_DIVERGED);
    let latest_input = request(&local_task, "latest");
    let latest_error = match prepare(&local, &latest_input, &network, temporary.path(), &cancel).await { Ok(_) => panic!("diverged Get Latest must stop"), Err(error) => error };
    assert_eq!(latest_error, LATEST_DIVERGED);
    fs::write(local.join("base.txt"), "staged\n").unwrap();
    fixture_git(&local, &["add", "base.txt"]).await;
    fs::write(local.join("base.txt"), "unstaged\n").unwrap();
    let task = git::task(&local).await.unwrap();
    let index = fs::read(local.join(".git/index")).unwrap();
    let result = inspect_divergence(&local, &request(&task, "push"), &network, &cancel).await.unwrap();
    assert_eq!(result["diverged"], true);
    assert_eq!(result["ahead"], 1); assert_eq!(result["behind"], 1); assert_eq!(result["dirty"], true);
    assert_eq!(result["remote"], "origin"); assert_eq!(result["pushRemote"], "origin");
    assert_eq!(result["head"], task["head"]); assert_eq!(result["localCommits"].as_array().unwrap().len(), 1);
    assert_eq!(fs::read(local.join(".git/index")).unwrap(), index);
    assert_eq!(fs::read_to_string(local.join("base.txt")).unwrap(), "unstaged\n");
    assert_eq!(git::task(&local).await.unwrap()["head"], task["head"]);
    fixture_git(&local, &["remote", "add", "alternate", remote.to_str().unwrap()]).await;
    fixture_git(&local, &["config", "branch.main.pushremote", "alternate"]).await;
    let alternate = inspect_divergence(&local, &request(&task, "push"), &network, &cancel).await.unwrap();
    assert_eq!(alternate["remote"], "origin"); assert_eq!(alternate["pushRemote"], "alternate");
    let service = crate::service::Service::new(temporary.path().join("service"), false, "test").unwrap();
    let context = crate::service::Context { repository: repo.clone(), link: json!({}), provider: provider.clone(), identity: "fixture".into(), network: network.clone() };
    let dirty_input = json!({"repositoryId":"fixture:1","taskId":task["id"],"expectedHead":task["head"],"changeKey":task["changeKey"],"requireClean":true,"expectedRemoteHead":result["remoteHead"],"sources":[{"name":"main","kind":"remote","taskId":""}]});
    let dirty_error = match crate::graph_operations::prepare(&local, &dirty_input, &service, &context, &cancel).await { Ok(_) => panic!("dirty merge preparation must fail"), Err(error) => error };
    assert!(dirty_error.contains("未提交或暂存"));
    assert_eq!(fs::read(local.join(".git/index")).unwrap(), index);
    let stale_context = crate::service::Context { network: network.for_worktree(&behind), ..context };
    let stale_input = json!({"repositoryId":"fixture:1","taskId":behind_task["id"],"expectedHead":behind_task["head"],"changeKey":behind_task["changeKey"],"requireClean":true,"expectedRemoteHead":behind_task["head"],"sources":[{"name":"main","kind":"remote","taskId":""}]});
    let stale_error = match crate::graph_operations::prepare(&behind, &stale_input, &service, &stale_context, &cancel).await { Ok(_) => panic!("stale merge preparation must fail"), Err(error) => error };
    assert!(stale_error.contains("远端分支已变化"), "{stale_error}");
    assert_eq!(git::task(&behind).await.unwrap()["head"], behind_task["head"]);
    fixture_git(&local, &["remote", "set-url", "--push", "alternate", stale.to_str().unwrap()]).await;
    assert!(inspect_divergence(&local, &request(&task, "push"), &network, &cancel).await.unwrap_err().contains("推送目标与获取到的远端状态不一致"));
    let cancelled = CancellationToken::new(); cancelled.cancel();
    assert!(inspect_divergence(&local, &request(&task, "pull"), &network, &cancelled).await.is_err());
    assert_eq!(fs::read(local.join(".git/index")).unwrap(), index);
}

async fn fixture_git(root: &Path, args: &[&str]) -> String {
    git::run(
        root,
        args,
        Options {
            write: true,
            ..Default::default()
        },
    )
    .await
    .unwrap()
}

#[tokio::test]
async fn branch_download_uses_project_container_and_preserves_existing_directories() {
    let temporary = tempfile::tempdir().unwrap();
    let source = temporary.path().join("source");
    let remotes = temporary.path().join("remotes");
    let downloads = temporary.path().join("downloads");
    let storage = temporary.path().join("storage");
    fs::create_dir(&source).unwrap();
    fs::create_dir_all(remotes.join("fixture")).unwrap();
    fs::create_dir(&downloads).unwrap();
    fixture_git(&source, &["init", "--initial-branch=main"]).await;
    for contents in ["first\n", "latest\n"] {
        fs::write(source.join("hello.txt"), contents).unwrap();
        fixture_git(&source, &["add", "hello.txt"]).await;
        fixture_git(
            &source,
            &[
                "-c",
                "user.name=Fixture",
                "-c",
                "user.email=fixture@example.test",
                "-c",
                "commit.gpgsign=false",
                "commit",
                "-m",
                "fixture",
            ],
        )
        .await;
    }
    fixture_git(&source, &["branch", "feature/layout"]).await;
    let remote = remotes.join("fixture/project.git");
    fixture_git(
        &source,
        &[
            "clone",
            "--bare",
            "--",
            source.to_str().unwrap(),
            remote.to_str().unwrap(),
        ],
    )
    .await;
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    drop(listener);
    let mut command = tokio::process::Command::new(util::find_tool("git").unwrap());
    command
        .args([
            "daemon",
            "--verbose",
            "--reuseaddr",
            "--export-all",
            &format!("--base-path={}", remotes.display()),
            "--listen=127.0.0.1",
            &format!("--port={port}"),
            remotes.to_str().unwrap(),
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    #[cfg(windows)]
    command.creation_flags(0x08000000);
    let mut daemon = command.spawn().unwrap();
    let mut lines = BufReader::new(daemon.stderr.take().unwrap()).lines();
    tokio::time::timeout(std::time::Duration::from_secs(5), async {
        while let Some(line) = lines.next_line().await.unwrap() {
            if line.contains("Ready to rumble") {
                return;
            }
        }
        panic!("Fixture Git daemon exited before readiness");
    })
    .await
    .unwrap();
    let host = format!("git://127.0.0.1:{port}");
    let provider = Provider::new(
        json!({"id":"fixture","provider":"gitea","host":host,"login":"fixture"}),
        "fixture-only".into(),
        client().unwrap(),
    );
    let repo = json!({"id":"fixture:1","accountId":"fixture","remoteId":1,"name":"project","fullName":"fixture/project","url":format!("{host}/fixture/project")});
    let network = Network::new(&repo, &provider).unwrap();
    let cancel = CancellationToken::new();
    let input = json!({"branch":"main","parentPath":downloads.to_string_lossy(),"folderName":"project_main"});
    let path = download(&storage, &repo, &input, &network, &cancel)
        .await
        .unwrap();
    assert_eq!(
        path,
        dunce::canonicalize(&downloads)
            .unwrap()
            .join("project/project_main")
    );
    assert_eq!(
        fs::read_to_string(path.join("hello.txt")).unwrap().replace("\r\n", "\n"),
        "latest\n"
    );
    assert_eq!(
        git::read(&path, &["branch", "--show-current"])
            .await
            .unwrap()
            .trim(),
        "main"
    );
    assert_eq!(
        git::read(&path, &["rev-list", "--count", "HEAD"])
            .await
            .unwrap()
            .trim(),
        "1"
    );
    assert!(path.join(".git").is_file());
    assert!(!downloads.join("project_main").exists());
    fs::write(path.join("keep.txt"), "do not overwrite").unwrap();
    assert!(download(&storage, &repo, &input, &network, &cancel)
        .await
        .unwrap_err()
        .contains("目标目录已经存在"));
    assert_eq!(
        fs::read_to_string(path.join("keep.txt")).unwrap(),
        "do not overwrite"
    );
    let feature = json!({"branch":"feature/layout","parentPath":downloads.to_string_lossy(),"folderName":"custom-worktree"});
    let feature_path = download(&storage, &repo, &feature, &network, &cancel)
        .await
        .unwrap();
    assert_eq!(feature_path.parent().unwrap(), path.parent().unwrap());
    assert_eq!(feature_path.file_name().unwrap(), "custom-worktree");
    assert_eq!(
        git::read(&feature_path, &["branch", "--show-current"])
            .await
            .unwrap()
            .trim(),
        "feature/layout"
    );
    let mut occupied = repo.clone();
    occupied["name"] = json!("occupied");
    fs::write(downloads.join("occupied"), "container is a file").unwrap();
    assert!(download(&storage, &occupied, &input, &network, &cancel)
        .await
        .unwrap_err()
        .contains("仓库容器不是可用"));
    assert_eq!(
        fs::read_to_string(downloads.join("occupied")).unwrap(),
        "container is a file"
    );
    daemon.kill().await.unwrap();
    daemon.wait().await.unwrap();
}
