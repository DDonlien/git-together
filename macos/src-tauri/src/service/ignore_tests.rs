use super::*;

async fn run(root: &Path, args: &[&str]) -> String {
    git::run(root,args,git::Options {write:true,..Default::default()}).await.unwrap()
}
async fn fixture() -> (tempfile::TempDir,PathBuf,Arc<Service>) {
    let temporary=tempfile::tempdir().unwrap();
    let root=temporary.path().join("repository"); fs::create_dir(&root).unwrap();
    let root=dunce::canonicalize(root).unwrap();
    for args in [vec!["init","--quiet","--initial-branch=main","--template="],vec!["config","user.name","Fixture"],vec!["config","user.email","fixture@example.invalid"],vec!["config","commit.gpgsign","false"],vec!["remote","add","origin","https://github.com/fixture/project.git"]] {run(&root,&args).await;}
    for (path,bytes) in [("tracked.txt","initial target\n"),("other.txt","initial other\n"),(".gitignore","# original\n")] {fs::write(root.join(path),bytes).unwrap();}
    run(&root,&["add","--all"]).await; run(&root,&["commit","--quiet","-m","initial"]).await;
    let service=Service::new(temporary.path().join("storage"),false,"test").unwrap();
    service.state.write().await.value=json!({"version":2,"accounts":[{"account":{"id":"fixture","provider":"github","host":"https://github.com","login":"fixture","name":"Fixture","updatedAt":"2026-11-01T00:00:00Z"},"token":"fixture-only"}],"repositories":[{"id":"fixture:1","accountId":"fixture","remoteId":1,"name":"project","fullName":"fixture/project","description":"","defaultBranch":"main","private":false,"url":"https://github.com/fixture/project","available":true}],"links":[{"repositoryId":"fixture:1","path":root.to_string_lossy(),"worktrees":[{"branch":"main","path":root.to_string_lossy()}]}]});
    (temporary,root,service)
}
async fn request(root: &Path,path: &str) -> Value {
    let task=git::task_summary(root).await.unwrap();
    json!({"repositoryId":"fixture:1","taskId":task["id"],"expectedHead":task["head"],"changeKey":task["changeKey"],"path":path,"operationId":uuid::Uuid::new_v4().to_string()})
}
async fn ignore(service: &Arc<Service>, root: &Path,path: &str) -> Result<Value> {
    service.handle("ignoreFile",request(root,path).await,CancellationToken::new()).await
}
async fn submit(service: &Arc<Service>,root: &Path,paths: &[&str]) -> Value {
    let task=git::task_summary(root).await.unwrap();
    service.handle("submitCommit",json!({"repositoryId":"fixture:1","taskId":task["id"],"expectedHead":task["head"],"changeKey":task["changeKey"],"operationId":uuid::Uuid::new_v4().to_string(),"summary":"Ignore selected file","description":"","paths":paths}),CancellationToken::new()).await.unwrap()
}
async fn ignored(root: &Path,path: &str) -> bool {
    let input=format!("./{path}\0");
    let value=git::run(root,&["check-ignore","--no-index","-z","--stdin"],git::Options{stdin:Some(input.into_bytes()),..Default::default()}).await.unwrap();
    value==format!("./{path}\0")
}

#[tokio::test]
async fn ignore_then_commit_removes_tracking_but_keeps_working_bytes_and_excluded_staging() {
    let (_temporary,root,service)=fixture().await;
    fs::write(root.join("tracked.txt"),"working target must survive\n").unwrap();
    fs::write(root.join("other.txt"),"staged other\n").unwrap(); run(&root,&["add","other.txt"]).await;
    fs::write(root.join("other.txt"),"unstaged other\n").unwrap();
    fs::write(root.join(".gitignore"),"# staged ignore\n").unwrap(); run(&root,&["add",".gitignore"]).await;
    fs::write(root.join(".gitignore"),"# working ignore\n").unwrap();
    let head=run(&root,&["rev-parse","HEAD"]).await;
    let intent=request(&root,"tracked.txt").await;
    let result=service.handle("ignoreFile",intent.clone(),CancellationToken::new()).await.unwrap();
    assert_eq!(result["stoppedTracking"],true);
    assert_eq!(service.handle("ignoreFile",intent,CancellationToken::new()).await.unwrap(),result);
    assert!(result["files"].as_array().unwrap().iter().any(|file|file["path"]=="tracked.txt" && text(file,"status").contains('D')));
    assert_eq!(run(&root,&["rev-parse","HEAD"]).await,head);
    assert_eq!(fs::read_to_string(root.join("tracked.txt")).unwrap(),"working target must survive\n");
    assert_eq!(fs::read_to_string(root.join(".gitignore")).unwrap(),"# working ignore\n/tracked.txt\n");
    assert_eq!(run(&root,&["show",":other.txt"]).await,"staged other\n");
    assert_eq!(run(&root,&["show",":.gitignore"]).await,"# staged ignore\n");
    assert!(run(&root,&["ls-files","--","tracked.txt"]).await.is_empty());
    assert!(ignored(&root,"tracked.txt").await);
    submit(&service,&root,&["tracked.txt",".gitignore"]).await;
    assert!(run(&root,&["ls-tree","HEAD","--","tracked.txt"]).await.is_empty());
    assert_eq!(run(&root,&["show","HEAD:.gitignore"]).await,"# working ignore\n/tracked.txt\n");
    assert_eq!(run(&root,&["show","HEAD:other.txt"]).await,"initial other\n");
    assert_eq!(run(&root,&["show",":other.txt"]).await,"staged other\n");
    assert_eq!(fs::read_to_string(root.join("other.txt")).unwrap(),"unstaged other\n");
    assert_eq!(fs::read_to_string(root.join("tracked.txt")).unwrap(),"working target must survive\n");
}

#[tokio::test]
async fn committing_only_ignored_deletion_never_adds_excluded_changes_or_ignore_rule() {
    let (_temporary,root,service)=fixture().await;
    fs::write(root.join("tracked.txt"),"keep target\n").unwrap();
    fs::write(root.join("other.txt"),"staged other\n").unwrap(); run(&root,&["add","other.txt"]).await;
    fs::write(root.join("other.txt"),"working other\n").unwrap();
    fs::write(root.join("excluded-new.txt"),"excluded new\n").unwrap();
    ignore(&service,&root,"tracked.txt").await.unwrap();
    submit(&service,&root,&["tracked.txt"]).await;
    assert_eq!(run(&root,&["show","--format=","--name-only","HEAD"]).await.trim(),"tracked.txt");
    assert_eq!(run(&root,&["show","HEAD:.gitignore"]).await,"# original\n");
    assert_eq!(run(&root,&["show",":other.txt"]).await,"staged other\n");
    assert_eq!(run(&root,&["show","HEAD:other.txt"]).await,"initial other\n");
    assert_eq!(fs::read_to_string(root.join("tracked.txt")).unwrap(),"keep target\n");
    assert!(fs::read_to_string(root.join(".gitignore")).unwrap().contains("/tracked.txt"));
    assert!(run(&root,&["ls-files","--","excluded-new.txt"]).await.is_empty());
}

#[tokio::test]
async fn untracked_ignore_is_literal_duplicate_safe_and_does_not_change_the_index() {
    let (_temporary,root,service)=fixture().await;
    fs::write(root.join("draft.txt"),"untracked bytes\n").unwrap();
    let index=fs::read(root.join(".git/index")).unwrap();
    for _ in 0..2 { assert_eq!(ignore(&service,&root,"draft.txt").await.unwrap()["stoppedTracking"],false); }
    assert_eq!(fs::read_to_string(root.join(".gitignore")).unwrap(),"# original\n/draft.txt\n");
    assert_eq!(fs::read(root.join(".git/index")).unwrap(),index);
    assert_eq!(fs::read_to_string(root.join("draft.txt")).unwrap(),"untracked bytes\n");
}

#[cfg(unix)]
#[tokio::test]
async fn ignore_escapes_pattern_characters_spaces_and_pathspec_like_filenames() {
    let (_temporary,root,service)=fixture().await;
    fs::create_dir(root.join("folder [1]")).unwrap();
    let path="folder [1]/!#log [1]*?.txt ";
    fs::write(root.join(path),"literal\n").unwrap();
    fs::write(root.join("folder [1]/!#log 1XX.txt"),"sibling\n").unwrap();
    ignore(&service,&root,path).await.unwrap();
    assert!(ignored(&root,path).await);
    assert!(!ignored(&root,"folder [1]/!#log 1XX.txt").await);
    assert!(fs::read_to_string(root.join(".gitignore")).unwrap().contains("/folder\\ \\[1\\]/\\!\\#log\\ \\[1\\]\\*\\?.txt\\ \n"));
    fs::write(root.join(":(literal)private"),"magic-like name\n").unwrap();
    ignore(&service,&root,":(literal)private").await.unwrap();
    assert!(ignored(&root,":(literal)private").await);
}

#[tokio::test]
async fn ignore_rejects_staged_target_versions_without_touching_files_or_staging() {
    for mode in ["modified","partial","added","intent","deleted"] {
        let (_temporary,root,service)=fixture().await;
        let path=if matches!(mode,"added"|"intent") {"new.txt"}else{"tracked.txt"};
        fs::write(root.join(path),"staged target\n").unwrap();
        if mode=="intent" {run(&root,&["add","-N",path]).await;}
        else if mode=="deleted" {run(&root,&["rm","--cached",path]).await;}
        else {run(&root,&["add",path]).await;}
        if mode=="partial" {fs::write(root.join(path),"different working bytes\n").unwrap();}
        let index=fs::read(root.join(".git/index")).unwrap();
        let bytes=fs::read(root.join(path)).unwrap();
        let error=ignore(&service,&root,path).await.unwrap_err();
        assert!(error.contains("已暂存"),"{mode}: {error}");
        assert_eq!(fs::read(root.join(".git/index")).unwrap(),index,"{mode}");
        assert_eq!(fs::read(root.join(path)).unwrap(),bytes,"{mode}");
        assert_eq!(fs::read_to_string(root.join(".gitignore")).unwrap(),"# original\n");
    }
}

#[tokio::test]
async fn ignore_fails_closed_for_invalid_paths_stale_snapshots_and_existing_index_locks() {
    let (_temporary,root,service)=fixture().await;
    fs::create_dir(root.join("folder")).unwrap();
    let index=fs::read(root.join(".git/index")).unwrap();
    for path in [".gitignore",".git/index","../tracked.txt","/tracked.txt","folder","missing.txt","bad\nname","folder//file.txt"] {
        assert!(ignore(&service,&root,path).await.is_err(),"{path}");
        assert_eq!(fs::read(root.join(".git/index")).unwrap(),index);
        assert_eq!(fs::read_to_string(root.join(".gitignore")).unwrap(),"# original\n");
    }
    let stale=request(&root,"tracked.txt").await;
    fs::write(root.join("tracked.txt"),"new user bytes\n").unwrap();
    assert!(service.handle("ignoreFile",stale,CancellationToken::new()).await.unwrap_err().contains("已变化"));
    fs::write(root.join(".git/index.lock"),"another operation").unwrap();
    assert!(ignore(&service,&root,"tracked.txt").await.is_err());
    assert_eq!(fs::read_to_string(root.join(".git/index.lock")).unwrap(),"another operation");
    assert_eq!(fs::read(root.join(".git/index")).unwrap(),index);
    assert_eq!(fs::read_to_string(root.join("tracked.txt")).unwrap(),"new user bytes\n");
}

#[tokio::test]
async fn nested_negation_keeps_additive_rule_reports_partial_work_and_never_removes_tracking() {
    for existing in [true,false] {
        let (_temporary,root,service)=fixture().await;
        if !existing {fs::remove_file(root.join(".gitignore")).unwrap();}
        fs::create_dir(root.join("nested")).unwrap();
        fs::write(root.join("nested/.gitignore"),"!file.txt\n").unwrap();
        fs::write(root.join("nested/file.txt"),"nested target\n").unwrap();
        run(&root,&["add","--all"]).await; run(&root,&["commit","--quiet","-m","nested ignore"]).await;
        let index=fs::read(root.join(".git/index")).unwrap();
        let error=ignore(&service,&root,"nested/file.txt").await.unwrap_err();
        assert!(error.contains("规则覆盖"),"{error}");
        assert!(error.contains("已保留现有内容"),"{error}");
        assert_eq!(fs::read(root.join(".git/index")).unwrap(),index);
        assert!(!run(&root,&["ls-files","--","nested/file.txt"]).await.is_empty());
        assert_eq!(fs::read_to_string(root.join(".gitignore")).unwrap(),if existing {"# original\n/nested/file.txt\n"}else{"/nested/file.txt\n"});
    }
}

#[cfg(unix)]
#[tokio::test]
async fn ignore_refuses_symlink_targets_and_symlinked_ignore_files() {
    use std::os::unix::fs::symlink;
    let (temporary,root,service)=fixture().await;
    let outside=temporary.path().join("outside.txt"); fs::write(&outside,"outside bytes\n").unwrap();
    symlink(&outside,root.join("linked.txt")).unwrap();
    let index=fs::read(root.join(".git/index")).unwrap();
    assert!(ignore(&service,&root,"linked.txt").await.is_err());
    fs::remove_file(root.join(".gitignore")).unwrap(); symlink(&outside,root.join(".gitignore")).unwrap();
    assert!(ignore(&service,&root,"tracked.txt").await.is_err());
    assert_eq!(fs::read_to_string(&outside).unwrap(),"outside bytes\n");
    assert_eq!(fs::read(root.join(".git/index")).unwrap(),index);
}
