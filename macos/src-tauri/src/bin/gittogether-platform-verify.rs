//! Native release diagnostics. Runs only in a disposable directory and is never bundled.
use gittogether_core::{
    credentials, diagnostics::Diagnostics, git, platform, service::Service, util,
};
use serde_json::json;
use std::{
    fs,
    time::{Duration, Instant},
};
use tokio_util::sync::CancellationToken;

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
    git::read(&root, &["add", "--all"]).await?;
    git::read(&root, &["commit", "--quiet", "-m", "initial"]).await?;
    fs::write(root.join("selected.txt"), "selected\n").map_err(|e| e.to_string())?;
    fs::write(root.join("保留.txt"), "keep staged\n").map_err(|e| e.to_string())?;
    git::read(&root, &["add", "--", "保留.txt"]).await?;
    let task = git::task(&root).await?;
    let service = Service::new(storage.clone(), true, "release-check")?;
    let result = service.handle("submitCommit", json!({"repositoryId":"release-check:1","taskId":task["id"],"expectedHead":task["head"],"changeKey":task["changeKey"],"operationId":uuid::Uuid::new_v4().to_string(),"summary":"select one file","description":"native Windows release validation","paths":["selected.txt"]}), CancellationToken::new()).await?;
    if result["commitId"].as_str().is_none() {
        return Err("本地提交未返回真实SHA。".into());
    }
    let committed = git::read(
        &root,
        &["diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"],
    )
    .await?;
    let staged = git::read(&root, &["diff", "--cached", "--name-only", "-z"]).await?;
    if committed.trim() != "selected.txt" || !staged.contains("保留.txt") {
        return Err("选择范围或未选暂存内容核验失败。".into());
    }

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
            json!({"version":gittogether_core::VERSION,"architecture":std::env::consts::ARCH,"checks":["dpapi-round-trip","tamper-rejected","private-acl","git-unicode-path","selected-commit","preserved-staging","process-tree-cancel","private-diagnostics"],"nativeValidationPassed":true})
        ),
        Err(error) => {
            eprintln!("Windows原生校验失败：{error}");
            std::process::exit(1);
        }
    }
}
