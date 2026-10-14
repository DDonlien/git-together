//! Native release diagnostics. Runs only in a disposable directory and is never bundled.
use gittogether_core::{
    credentials, diagnostics::Diagnostics, git, platform, service::Service, util,
};
use serde_json::json;
use std::{
    fs,
    path::Path,
    sync::Arc,
    time::{Duration, Instant},
};
use tokio_util::sync::CancellationToken;

async fn verify_directory_matching(
    parent: &Path,
    source: &Path,
    service: &Arc<Service>,
) -> Result<(), String> {
    let projects = parent.join("Projects");
    let main = projects.join("GITEA").join("project-name").join("main");
    let task = main.parent().unwrap().join("branch-name");
    fs::create_dir_all(main.parent().unwrap()).map_err(|e| e.to_string())?;
    let boundary = projects.join("one/two/three/four/five/six");
    let outside = projects.join("one/two/three/four/five/deeper/seven");
    for path in [&main, &boundary, &outside] {
        fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
        git::read(
            parent,
            &[
                "-c",
                "core.hooksPath=",
                "clone",
                "--quiet",
                "--no-hardlinks",
                "--",
                source.to_str().ok_or("临时路径无效。")?,
                path.to_str().ok_or("临时路径无效。")?,
            ],
        )
        .await?;
        git::read(
            path,
            &[
                "remote",
                "set-url",
                "origin",
                "https://github.com/gittogether-verification/fixture.git",
            ],
        )
        .await?;
    }
    git::read(
        &main,
        &[
            "-c",
            "core.hooksPath=",
            "worktree",
            "add",
            "--quiet",
            "-b",
            "branch-name",
            task.to_str().ok_or("临时路径无效。")?,
            "main",
        ],
    )
    .await?;
    if !main.join(".git").is_dir() || !task.join(".git").is_file() {
        return Err("临时clone/worktree标记形状不符。".into());
    }
    // These belong to a checkout, not to the search's container budget.
    for index in 0..4100 {
        fs::create_dir_all(main.join("generated").join(index.to_string()))
            .map_err(|e| e.to_string())?;
    }
    let mut unrelated = projects.join("GITHUB").join("unrelated-cache");
    for index in 0..10 {
        unrelated.push(index.to_string());
    }
    fs::create_dir_all(unrelated).map_err(|e| e.to_string())?;
    let before = fs::read(main.join(".git/index")).map_err(|e| e.to_string())?;
    let head = git::read(&main, &["rev-parse", "HEAD"]).await?;
    let result = service
        .handle(
            "matchAccountRepositories",
            json!({"accountId":"release-check","path":projects.to_string_lossy()}),
            CancellationToken::new(),
        )
        .await?;
    let paths = result["catalog"]["links"][0]["worktrees"]
        .as_array()
        .ok_or("目录匹配没有返回关联。")?;
    for path in [&main, &task, &boundary] {
        let path = dunce::canonicalize(path).map_err(|e| e.to_string())?;
        if !paths
            .iter()
            .any(|entry| util::text(entry, "path") == path.to_string_lossy())
        {
            return Err("6层内的真实clone/worktree未匹配。".into());
        }
    }
    let outside = dunce::canonicalize(outside).map_err(|e| e.to_string())?;
    if paths
        .iter()
        .any(|entry| util::text(entry, "path") == outside.to_string_lossy())
        || fs::read(main.join(".git/index")).map_err(|e| e.to_string())? != before
        || git::read(&main, &["rev-parse", "HEAD"]).await? != head
    {
        return Err("扫描越过6层边界或改变Git状态。".into());
    }
    let catalog = service.catalog().await?;
    let cancel = CancellationToken::new();
    cancel.cancel();
    if service
        .handle(
            "matchAccountRepositories",
            json!({"accountId":"release-check","path":projects.to_string_lossy()}),
            cancel,
        )
        .await
        .is_ok()
        || service.catalog().await? != catalog
    {
        return Err("取消目录匹配后仍保存了关联。".into());
    }
    Ok(())
}

async fn verify() -> Result<(), String> {
    if !cfg!(windows) {
        return Err("此校验入口要求原生Windows环境。".into());
    }
    let temporary = tempfile::Builder::new()
        .prefix("gittogether-native-check-")
        .tempdir()
        .map_err(|e| e.to_string())?;
    let root = temporary.path().join("仓库 with spaces");
    fs::create_dir(&root).map_err(|e| e.to_string())?;
    let root = dunce::canonicalize(&root).map_err(|e| e.to_string())?;
    let storage = temporary.path().join("state");
    platform::private_directory(&storage).map_err(|e| e.to_string())?;
    let account_path = storage.join("accounts-v2.encrypted");
    let account = json!({"id":"release-check","provider":"github","host":"https://github.com","login":"release-check","name":"Release Check","updatedAt":util::iso()});
    let repo = json!({"id":"release-check:1","accountId":"release-check","remoteId":1,"name":"fixture","fullName":"gittogether-verification/fixture","description":"disposable fixture","defaultBranch":"main","url":"https://github.com/gittogether-verification/fixture","private":true,"available":true});
    let state = json!({"version":2,"accounts":[{"account":account,"token":"disposable-token-not-a-real-credential"}],"repositories":[repo],"links":[{"repositoryId":"release-check:1","path":root.to_string_lossy(),"worktrees":[{"path":root.to_string_lossy(),"branch":"main"}]}]});
    credentials::save(&account_path, &state)?;
    let encrypted = fs::read(&account_path).map_err(|e| e.to_string())?;
    if !encrypted.starts_with(b"GTTW1")
        || encrypted.windows(16).any(|v| v == b"disposable-token")
        || credentials::load(&account_path, "GitTogether")? != Some(state.clone())
    {
        return Err("Windows系统加密往返核验失败。".into());
    }
    let mut damaged = encrypted.clone();
    let last = damaged.len() - 1;
    damaged[last] ^= 1;
    fs::write(&account_path, damaged).map_err(|e| e.to_string())?;
    if credentials::load(&account_path, "GitTogether").is_ok() {
        return Err("加密损坏未被拒绝。".into());
    }
    fs::write(&account_path, &encrypted).map_err(|e| e.to_string())?;
    if !platform::private_config(
        &account_path,
        &fs::metadata(&account_path).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?
    {
        return Err("配置文件ACL不符合私有范围。".into());
    }

    git::read(
        &root,
        &["init", "--quiet", "--initial-branch=main", "--template="],
    )
    .await?;
    for (key, value) in [
        ("user.name", "Release Check"),
        ("user.email", "release-check@example.invalid"),
        ("commit.gpgsign", "false"),
        ("core.autocrlf", "false"),
    ] {
        git::read(&root, &["config", key, value]).await?;
    }
    git::read(
        &root,
        &[
            "remote",
            "add",
            "origin",
            "https://github.com/gittogether-verification/fixture.git",
        ],
    )
    .await?;
    fs::write(root.join("selected.txt"), "original\n").map_err(|e| e.to_string())?;
    fs::write(root.join("保留.txt"), "original\n").map_err(|e| e.to_string())?;
    git::read(&root, &["lfs", "install", "--local"]).await?;
    fs::write(root.join(".gitattributes"), "*.bin filter=lfs diff=lfs merge=lfs -text\n")
        .map_err(|e| e.to_string())?;
    fs::write(root.join("asset.bin"), [0, 1, 2, 3]).map_err(|e| e.to_string())?;
    git::read(&root, &["add", "--all"]).await?;
    git::read(&root, &["commit", "--quiet", "-m", "initial"]).await?;
    fs::write(root.join("selected.txt"), "selected\n").map_err(|e| e.to_string())?;
    let asset = [0, 4, 5, 6, 7];
    fs::write(root.join("asset.bin"), asset).map_err(|e| e.to_string())?;
    fs::write(root.join("保留.txt"), "keep staged\n").map_err(|e| e.to_string())?;
    git::read(&root, &["add", "--", "保留.txt"]).await?;
    let task = git::task(&root).await?;
    let service = Service::new(storage.clone(), true, "release-check")?;
    let result = service.handle("submitCommit", json!({"repositoryId":"release-check:1","taskId":task["id"],"expectedHead":task["head"],"changeKey":task["changeKey"],"operationId":uuid::Uuid::new_v4().to_string(),"summary":"select files with LFS","description":"","paths":["selected.txt","asset.bin"]}), CancellationToken::new()).await?;
    if result["commitId"].as_str().is_none() || result.get("warning").is_some() {
        return Err("本地提交未返回真实SHA。".into());
    }
    let committed = git::read(
        &root,
        &["diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"],
    )
    .await?;
    let staged = git::read(&root, &["diff", "--cached", "--name-only", "-z"]).await?;
    if committed.lines().collect::<Vec<_>>() != ["asset.bin", "selected.txt"]
        || staged
            .split('\0')
            .filter(|path| !path.is_empty())
            .collect::<Vec<_>>()
            != ["保留.txt"]
    {
        return Err("选择范围或未选暂存内容核验失败。".into());
    }
    let pointer = git::read(&root, &["show", "HEAD:asset.bin"]).await?;
    if pointer != format!("version https://git-lfs.github.com/spec/v1\noid sha256:{}\nsize {}\n", util::digest(asset), asset.len())
        || fs::read(root.join("asset.bin")).map_err(|e| e.to_string())? != asset
        || git::read(&root, &["show", "-s", "--format=%B", "HEAD"]).await?.trim() != "select files with LFS"
    {
        return Err("LFS指针、工作文件或Summary单独提交核验失败。".into());
    }
    git::read(&root, &["lfs", "fsck", "--objects", "HEAD"]).await?;

    let previous_head = git::read(&root, &["rev-parse", "HEAD"]).await?;
    let previous_index = fs::read(root.join(".git/index")).map_err(|e| e.to_string())?;
    let hook = root.join(".git/hooks/pre-commit");
    fs::write(&hook, "#!/bin/sh\nprintf '%s\\n' 'git-lfs: write: no space left on device' >&2\nexit 1\n")
        .map_err(|e| e.to_string())?;
    fs::write(root.join("selected.txt"), "retain after failure\n").map_err(|e| e.to_string())?;
    let task = git::task(&root).await?;
    let error = service.handle("submitCommit", json!({"repositoryId":"release-check:1","taskId":task["id"],"expectedHead":task["head"],"changeKey":task["changeKey"],"operationId":uuid::Uuid::new_v4().to_string(),"summary":"failed commit","description":"","paths":["selected.txt"]}), CancellationToken::new()).await
        .err().ok_or("失败钩子未阻止提交。")?;
    if git::diagnostic_code(&error) != "ENOSPC"
        || git::read(&root, &["rev-parse", "HEAD"]).await? != previous_head
        || fs::read(root.join(".git/index")).map_err(|e| e.to_string())? != previous_index
        || fs::read(root.join("selected.txt")).map_err(|e| e.to_string())? != b"retain after failure\n"
    {
        return Err("提交失败后没有保留原HEAD、暂存区或工作文件。".into());
    }
    fs::remove_file(hook).map_err(|e| e.to_string())?;

    for (output, code) in [
        ("git-lfs: write: no space left on device", "ENOSPC"),
        ("git-lfs: There is not enough space on the disk", "ENOSPC"),
        ("git-lfs: command not found", "git-lfs-missing"),
        ("Git LFS smudge error: [404] Not Found", "git-lfs-object-missing"),
    ] {
        let alias = format!("alias.release-lfs-failure=!printf '%s\\n' '{output}' >&2; exit 1");
        let error = git::read(&root, &["-c", &alias, "release-lfs-failure"]).await
            .err().ok_or("Git故障诊断未返回失败。")?;
        if git::diagnostic_code(&error) != code || error.contains(output) {
            return Err("Git LFS故障分类错误或泄露原始输出。".into());
        }
    }

    verify_directory_matching(temporary.path(), &root, &service).await?;
    verify_file_operations(&root, &service).await?;

    let cancel = CancellationToken::new();
    let trigger = cancel.clone();
    tokio::spawn(async move {
        tokio::time::sleep(Duration::from_millis(250)).await;
        trigger.cancel();
    });
    let started = Instant::now();
    let cancelled = git::run(
        &root,
        &[
            "-c",
            "alias.release-wait=!sleep 4; printf orphan > orphan.txt",
            "release-wait",
        ],
        git::Options {
            write: true,
            cancel: Some(cancel),
            ..Default::default()
        },
    )
    .await;
    if cancelled.is_ok() || started.elapsed() > Duration::from_secs(3) {
        return Err("Git进程组取消核验失败。".into());
    }
    tokio::time::sleep(Duration::from_secs(4)).await;
    if root.join("orphan.txt").exists() {
        return Err("取消后残留Git子进程继续执行。".into());
    }
    let log = Diagnostics::new(storage.join("logs"), "release-check");
    if !log.record(
        &json!({"event":"git-read","outcome":"success","verb":"status"}),
        false,
    ) || log.status()["error"] != ""
    {
        return Err("原生日志写入失败。".into());
    }
    Ok(())
}
#[tokio::main]
async fn main() {
    match verify().await {
        Ok(()) => println!(
            "{}",
            json!({"version":gittogether_core::VERSION,"architecture":std::env::consts::ARCH,"checks":["dpapi-round-trip","tamper-rejected","private-acl","git-unicode-path","selected-commit","summary-only-commit","lfs-filter-and-hooks","lfs-object-integrity","lfs-failure-classification","failed-commit-preserved-state","preserved-staging","bounded-directory-matching","local-file-operations","process-tree-cancel","private-diagnostics"],"nativeValidationPassed":true})
        ),
        Err(error) => {
            eprintln!("Windows原生校验失败：{error}");
            std::process::exit(1);
        }
    }
}

pub async fn verify_file_operations(root: &Path, service: &Arc<Service>) -> Result<(), String> {
    let before_head = git::read(root, &["rev-parse", "HEAD"]).await?;
    let before_index = git::read(root, &["ls-files", "--stage", "-z"]).await?;
    fs::create_dir(root.join("file-actions")).map_err(|e| e.to_string())?;
    fs::create_dir(root.join("file-actions/destination")).map_err(|e| e.to_string())?;
    fs::create_dir(root.join("file-actions/ignored-cache")).map_err(|e| e.to_string())?;
    fs::write(root.join("file-actions/.gitignore"), "ignored-cache/\n*.cache\n").map_err(|e| e.to_string())?;
    fs::write(root.join("file-actions/source.txt"), b"real file\0content").map_err(|e| e.to_string())?;
    fs::write(root.join("file-actions/.hidden"), "hidden").map_err(|e| e.to_string())?;
    let task = git::task(root).await?; let task_id = task["id"].as_str().unwrap();
    let invoke = |method: &'static str, input: serde_json::Value| service.handle(method, input, CancellationToken::new());
    let entries = invoke("localDirectory", json!({"repositoryId":"release-check:1","taskId":task_id,"path":"file-actions"})).await?;
    if !entries["entries"].as_array().unwrap().iter().any(|e|e["name"]=="ignored-cache" && e["ignored"]==true && e["directory"]==true) || entries["entries"].as_array().unwrap().iter().any(|e|e["name"]==".git") { return Err("逐目录忽略项或元数据隔离不符合预期。".into()); }
    let copy = invoke("prepareFileOperation", json!({"repositoryId":"release-check:1","taskId":task_id,"operation":"copy","paths":["file-actions/source.txt"],"destination":"file-actions/destination"})).await?;
    let apply = json!({"repositoryId":"release-check:1","taskId":task_id,"planId":copy["planId"],"operationId":uuid::Uuid::new_v4().to_string()});
    let result = invoke("applyFileOperation", apply.clone()).await?;
    if result["completed"]!=1 || invoke("applyFileOperation",apply).await? != result || fs::read(root.join("file-actions/source.txt")).unwrap()!=fs::read(root.join("file-actions/destination/source.txt")).unwrap() { return Err("复制完整性或请求去重失败。".into()); }
    if invoke("prepareFileOperation",json!({"repositoryId":"release-check:1","taskId":task_id,"operation":"copy","paths":["file-actions/source.txt"],"destination":"file-actions/destination"})).await.is_ok() { return Err("同名内容未被阻止。".into()); }
    let plan = invoke("prepareFileOperation",json!({"repositoryId":"release-check:1","taskId":task_id,"operation":"move","paths":["file-actions/destination/source.txt"],"destination":"file-actions","name":"renamed.txt"})).await?;
    let result = invoke("applyFileOperation",json!({"repositoryId":"release-check:1","taskId":task_id,"planId":plan["planId"],"operationId":uuid::Uuid::new_v4().to_string()})).await?;
    if result["completed"]!=1 || root.join("file-actions/destination/source.txt").exists() || !root.join("file-actions/renamed.txt").is_file() { return Err("实际移动/重命名失败。".into()); }
    let stale = invoke("prepareFileOperation",json!({"repositoryId":"release-check:1","taskId":task_id,"operation":"copy","paths":["file-actions/source.txt"],"destination":"file-actions/destination","name":"stale.txt"})).await?;
    fs::write(root.join("file-actions/source.txt"), "changed after preview").map_err(|e|e.to_string())?;
    if invoke("applyFileOperation",json!({"repositoryId":"release-check:1","taskId":task_id,"planId":stale["planId"],"operationId":uuid::Uuid::new_v4().to_string()})).await.is_ok() || root.join("file-actions/destination/stale.txt").exists() { return Err("过期预览没有被阻止。".into()); }
    let cancelled = invoke("prepareFileOperation",json!({"repositoryId":"release-check:1","taskId":task_id,"operation":"copy","paths":["file-actions/source.txt"],"destination":"file-actions/destination","name":"cancelled.txt"})).await?;
    invoke("discardFileOperation",json!({"repositoryId":"release-check:1","taskId":task_id,"planId":cancelled["planId"]})).await?;
    if invoke("applyFileOperation",json!({"repositoryId":"release-check:1","taskId":task_id,"planId":cancelled["planId"],"operationId":uuid::Uuid::new_v4().to_string()})).await.is_ok() || root.join("file-actions/destination/cancelled.txt").exists() { return Err("取消仍执行写入。".into()); }
    for path in ["../outside.txt", ".git/config"] {
        if invoke("prepareFileOperation",json!({"repositoryId":"release-check:1","taskId":task_id,"operation":"delete","paths":[path],"destination":""})).await.is_ok() { return Err("越界路径或Git元数据未被阻止。".into()); }
    }
    let external = root.parent().unwrap().join("outside-file-actions.txt");fs::write(&external,"external content").map_err(|e|e.to_string())?;
    let drop_id=service.file_state.lock().unwrap().drop_files(vec![external.clone()])?;
    let plan=invoke("prepareFileOperation",json!({"repositoryId":"release-check:1","taskId":task_id,"operation":"copy","dropId":drop_id,"destination":"file-actions/destination"})).await?;
    let result=invoke("applyFileOperation",json!({"repositoryId":"release-check:1","taskId":task_id,"planId":plan["planId"],"operationId":uuid::Uuid::new_v4().to_string()})).await?;
    if result["completed"]!=1 || !external.exists() || fs::read(root.join("file-actions/destination/outside-file-actions.txt")).unwrap()!=b"external content" { return Err("原生拖入来源复制失败。".into()); }
    let plan=invoke("prepareFileOperation",json!({"repositoryId":"release-check:1","taskId":task_id,"operation":"move","dropId":drop_id,"destination":"file-actions","name":"external-moved.txt"})).await?;
    let result=invoke("applyFileOperation",json!({"repositoryId":"release-check:1","taskId":task_id,"planId":plan["planId"],"operationId":uuid::Uuid::new_v4().to_string()})).await?;
    if result["completed"]!=1 || external.exists() || !root.join("file-actions/external-moved.txt").exists() { return Err("原生拖入来源移动失败。".into()); }
    let plan=invoke("prepareFileOperation",json!({"repositoryId":"release-check:1","taskId":task_id,"operation":"delete","paths":["file-actions/renamed.txt"],"destination":""})).await?;
    let result=invoke("applyFileOperation",json!({"repositoryId":"release-check:1","taskId":task_id,"planId":plan["planId"],"operationId":uuid::Uuid::new_v4().to_string()})).await?;
    if result["completed"]!=1 || !result["error"].as_str().unwrap().is_empty() || root.join("file-actions/renamed.txt").exists() { return Err(format!("系统回收站未完成：{result}")); }
    if before_head!=git::read(root,&["rev-parse","HEAD"]).await? || before_index!=git::read(root,&["ls-files","--stage","-z"]).await? { return Err("文件操作更改了HEAD或index。".into()); }
    Ok(())
}
