use super::*;
use crate::provider::{client, Provider};
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, BufReader};

#[test]
fn publishing_index_lock_never_deletes_a_later_operations_lock() {
    let temporary=tempfile::tempdir().unwrap();
    let index=temporary.path().join("index");
    let path=temporary.path().join("index.lock");
    let mut lock=IndexLock::take(path.clone()).unwrap();
    lock.publish(&index,b"published index").unwrap();
    fs::write(&path,b"later operation").unwrap();
    drop(lock);
    assert_eq!(fs::read(&index).unwrap(),b"published index");
    assert_eq!(fs::read(&path).unwrap(),b"later operation");
}

#[tokio::test]
async fn pull_preview_distinguishes_fast_forward_and_merge_without_changing_worktrees() {
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
    let equal = prepare(&local, &request(&initial,"pull"), &network, temporary.path(), &cancel).await.unwrap();
    assert_eq!(equal.public["mode"], "pull");
    fs::write(local.join("local.txt"), "local\n").unwrap();
    fixture_git(&local, &["add", "local.txt"]).await;
    fixture_git(&local, &["commit", "-m", "local"]).await;
    let local_task = git::task(&local).await.unwrap();
    fs::write(writer.join("remote.txt"), "remote\n").unwrap();
    fixture_git(&writer, &["add", "remote.txt"]).await;
    fixture_git(&writer, &["commit", "-m", "remote"]).await;
    fixture_git(&writer, &["push", "origin", "main"]).await;
    let behind_task = git::task(&behind).await.unwrap();
    let plan = prepare(&behind, &request(&behind_task,"pull"), &network.for_worktree(&behind), temporary.path(), &cancel).await.unwrap();
    assert_ne!(plan.public["head"], plan.public["remoteHead"]);
    assert_eq!(plan.public["files"].as_array().unwrap().len(), 1);
    // A local main may track a differently named remote branch.
    fs::write(writer.join("upstream-only.txt"), "upstream\n").unwrap();
    fixture_git(&writer, &["add", "upstream-only.txt"]).await;
    fixture_git(&writer, &["commit", "-m", "alternate upstream"]).await;
    fixture_git(&writer, &["push", "origin", "HEAD:refs/heads/upstream-trial"]).await;
    fixture_git(&behind, &["config", "branch.main.merge", "refs/heads/upstream-trial"]).await;
    let alternate = prepare(&behind, &request(&behind_task,"pull"), &network.for_worktree(&behind), temporary.path(), &cancel).await.unwrap();
    assert_eq!(alternate.public["remoteBranch"], "upstream-trial");
    assert_eq!(alternate.public["remoteHead"], fixture_git(&writer, &["rev-parse", "HEAD"]).await.trim());
    fixture_git(&behind,&["remote","add","other",stale.to_str().unwrap()]).await;
    fixture_git(&behind,&["config","branch.main.remote","other"]).await;
    assert!(prepare(&behind,&request(&behind_task,"pull"),&network.for_worktree(&behind),temporary.path(),&cancel).await.is_err());
    fixture_git(&behind,&["config","branch.main.remote","origin"]).await;
    let divergent = prepare(&local, &request(&local_task,"pull"), &network, temporary.path(), &cancel).await.unwrap();
    assert_eq!(divergent.public["integration"], "merge");
    assert!(divergent.public["files"].as_array().unwrap().is_empty());
    fs::write(local.join("base.txt"), "staged\n").unwrap();
    fixture_git(&local, &["add", "base.txt"]).await;
    fs::write(local.join("base.txt"), "unstaged\n").unwrap();
    let task = git::task(&local).await.unwrap();
    let index = fs::read(local.join(".git/index")).unwrap();
    assert!(prepare(&local, &request(&task,"pull"), &network, temporary.path(), &cancel).await.is_ok());
    assert_eq!(fs::read(local.join(".git/index")).unwrap(), index);
    assert_eq!(fs::read_to_string(local.join("base.txt")).unwrap(), "unstaged\n");
    assert_eq!(git::task(&local).await.unwrap()["head"], task["head"]);
    for mode in ["latest","clean"] {assert!(prepare(&local,&request(&task,mode),&network,temporary.path(),&cancel).await.is_err());}
    fs::write(local.join("untracked.txt"), "keep untracked\n").unwrap();
    // Git may reject a merge with staged content even when that file is
    // unrelated. Preserve both staged and unstaged versions on refusal.
    let staged_before=fixture_git(&local,&["ls-files","--stage"]).await;
    let rejected=integrate(&local,&network,"main","main",text(&divergent.public,"remoteHead"),text(&task,"head"),false).await.unwrap_err();
    assert!(rejected.contains("未完成"));
    assert_eq!(fixture_git(&local,&["ls-files","--stage"]).await,staged_before);
    assert_eq!(fixture_git(&local,&["show", ":base.txt"]).await,"staged\n");
    assert_eq!(fs::read_to_string(local.join("base.txt")).unwrap(),"unstaged\n");
    fixture_git(&local,&["reset","HEAD","--","base.txt"]).await;
    #[cfg(unix)] {
        use std::os::unix::fs::PermissionsExt;
        let hooks=temporary.path().join("hooks");fs::create_dir(&hooks).unwrap();
        let hook=hooks.join("pre-merge-commit");fs::write(&hook,"#!/bin/sh\nexit 1\n").unwrap();
        fs::set_permissions(&hook,fs::Permissions::from_mode(0o700)).unwrap();
        fixture_git(&local,&["config","core.hooksPath",hooks.to_str().unwrap()]).await;
        let hook_error=integrate(&local,&network,"main","main",text(&divergent.public,"remoteHead"),text(&task,"head"),false).await.unwrap_err();
        assert!(local.join(".git/MERGE_HEAD").exists());
        assert!(hook_error.contains("签名或提交钩子")&&!hook_error.contains("冲突文件"));
        fixture_git(&local,&["merge","--abort"]).await;
        fixture_git(&local,&["config","--unset","core.hooksPath"]).await;
    }
    let merged=integrate(&local,&network,"main","main",text(&divergent.public,"remoteHead"),text(&task,"head"),false).await.unwrap();
    assert_eq!(fixture_git(&local,&["show","-s","--format=%s",&merged]).await.trim(),"Merge remote-tracking branch 'origin/main'");
    assert_eq!(fixture_git(&local,&["show", ":base.txt"]).await,"base\n");
    assert_eq!(fs::read_to_string(local.join("base.txt")).unwrap(),"unstaged\n");
    assert_eq!(fs::read_to_string(local.join("untracked.txt")).unwrap(),"keep untracked\n");
    assert_eq!(fs::read_to_string(local.join("remote.txt")).unwrap(),"remote\n");
    assert_eq!(fixture_git(&local,&["rev-list", "--parents", "-n", "1", &merged]).await.split_whitespace().count(),3);
    let behind_head=fixture_git(&behind,&["rev-parse","HEAD"]).await.trim().to_owned();
    fs::write(behind.join("remote.txt"),"do not overwrite\n").unwrap();
    let error=integrate(&behind,&network.for_worktree(&behind),"main","main",text(&plan.public,"remoteHead"),&behind_head,false).await.unwrap_err();
    assert!(error.contains("未完成"));
    assert_eq!(fs::read_to_string(behind.join("remote.txt")).unwrap(),"do not overwrite\n");
    assert_eq!(fixture_git(&behind,&["rev-parse","HEAD"]).await.trim(),behind_head);
    fs::remove_file(behind.join("remote.txt")).unwrap();
    fs::write(writer.join("base.txt"),"remote change\n").unwrap();
    fixture_git(&writer,&["add","base.txt"]).await;fixture_git(&writer,&["commit","-m","remote modifies base"]).await;fixture_git(&writer,&["push","origin","main"]).await;
    fs::write(behind.join("base.txt"),"do not overwrite local\n").unwrap();
    let remote=network.for_worktree(&behind).fetch(&behind,&["main".into()],&cancel).await.unwrap().remove(0);
    assert!(integrate(&behind,&network.for_worktree(&behind),"main","main",&remote,&behind_head,false).await.is_err());
    assert_eq!(fs::read_to_string(behind.join("base.txt")).unwrap(),"do not overwrite local\n");
    assert_eq!(fixture_git(&behind,&["rev-parse","HEAD"]).await.trim(),behind_head);
}

#[tokio::test]
async fn merge_conflicts_preserve_git_state_and_report_how_to_continue_or_abort() {
    let temporary=tempfile::tempdir().unwrap();
    let source=temporary.path().join("source");let remotes=temporary.path().join("remotes/fixture");
    fs::create_dir(&source).unwrap();fs::create_dir_all(&remotes).unwrap();
    for args in [vec!["init","--initial-branch=main"],vec!["config","user.name","Fixture"],vec!["config","user.email","fixture@example.invalid"],vec!["config","commit.gpgsign","false"]] { fixture_git(&source,&args).await; }
    fs::write(source.join("shared.txt"),"base\n").unwrap();fixture_git(&source,&["add","shared.txt"]).await;fixture_git(&source,&["commit","-m","base"]).await;
    let remote=remotes.join("project.git");fixture_git(&source,&["clone","--bare",source.to_str().unwrap(),remote.to_str().unwrap()]).await;
    let local=temporary.path().join("local");let writer=temporary.path().join("writer");
    for path in [&local,&writer] {fixture_git(&source,&["clone",remote.to_str().unwrap(),path.to_str().unwrap()]).await;for args in [vec!["config","user.name","Fixture"],vec!["config","user.email","fixture@example.invalid"],vec!["config","commit.gpgsign","false"]] {fixture_git(path,&args).await;}}
    let local=dunce::canonicalize(local).unwrap();
    fs::write(local.join("shared.txt"),"local\n").unwrap();fixture_git(&local,&["add","shared.txt"]).await;fixture_git(&local,&["commit","-m","local"]).await;
    let old=fixture_git(&local,&["rev-parse","HEAD"]).await.trim().to_owned();
    fs::write(writer.join("shared.txt"),"remote\n").unwrap();fixture_git(&writer,&["add","shared.txt"]).await;fixture_git(&writer,&["commit","-m","remote"]).await;fixture_git(&writer,&["push","origin","main"]).await;
    let host=format!("file://{}",temporary.path().join("remotes").display());
    let provider=Provider::new(json!({"id":"fixture","provider":"gitea","host":host,"login":"fixture"}),"fixture-only".into(),client().unwrap());
    let repo=json!({"id":"fixture:1","accountId":"fixture","remoteId":1,"name":"project","fullName":"fixture/project","url":format!("{host}/fixture/project")});
    let network=Network::new(&repo,&provider).unwrap().for_link(&json!({"path":local.to_string_lossy(),"authentication":"system","worktrees":[{"path":local.to_string_lossy()}]}));
    let fetched=network.fetch(&local,&["main".into()],&CancellationToken::new()).await.unwrap().remove(0);
    let error=integrate(&local,&network,"main","main",&fetched,&old,false).await.unwrap_err();
    assert!(error.contains("shared.txt")&&error.contains("git add")&&error.contains("git merge --continue")&&error.contains("git merge --abort")&&!error.contains("未执行 Push"));
    assert_eq!(fixture_git(&local,&["rev-parse","HEAD"]).await.trim(),old);
    assert!(local.join(".git/MERGE_HEAD").exists());
    assert!(fixture_git(&local,&["diff","--name-only","--diff-filter=U"]).await.contains("shared.txt"));
    assert!(fs::read_to_string(local.join("shared.txt")).unwrap().contains("<<<<<<<"));
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
        "2"
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
