use super::*;
use crate::provider::{client, Provider};
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, BufReader};

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
