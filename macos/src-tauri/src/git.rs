use crate::util::{self, digest, file_path, text, tool_path, valid_sha as sha, Result};
use serde_json::{json, Value};
use std::{
    collections::{BTreeMap, BTreeSet},
    path::{Path, PathBuf},
    time::Duration,
};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    process::Command,
};
use tokio_util::sync::CancellationToken;

// Background queues await permits; foreground writes never queue behind reads.
// Four read processes and two fetches bound IO pressure without hiding data.
static READ_SLOTS: tokio::sync::Semaphore = tokio::sync::Semaphore::const_new(4);
static FETCH_SLOTS: tokio::sync::Semaphore = tokio::sync::Semaphore::const_new(2);
tokio::task_local! { pub(crate) static READ_CONTEXT: Options; }

#[derive(Clone, Default)]
pub struct Options {
    pub environment: Vec<(String, String)>,
    pub stdin: Option<Vec<u8>>,
    pub timeout: u64,
    pub cancel: Option<CancellationToken>,
    pub write: bool,
    pub diagnostics: Option<crate::diagnostics::Diagnostics>,
    pub resource: String,
    pub system_authentication: bool,
}
fn failure(output: &[u8], system_authentication: bool) -> String {
    let out = String::from_utf8_lossy(output).to_lowercase();
    if out.contains("no space left")
        || out.contains("not enough space on the disk")
        || out.contains("out of diskspace")
        || out.contains("disk full")
    {
        "磁盘空间不足；操作未完成。"
    } else if out.contains("authentication failed")
        || out.contains("could not read username")
        || out.contains("could not read password")
        || out.contains("http 401")
        || out.contains("http 403")
        || out.contains("returned error: 401")
        || out.contains("returned error: 403")
        || out.contains("access denied")
        || out.contains("permission denied (publickey")
        || out.contains("permission to ") && out.contains(" denied")
    {
        if system_authentication {
            "远端拒绝访问，当前使用系统 Git/SSH，请检查凭据助手、SSH 密钥或该账号的仓库权限。"
        } else {
            "远端拒绝访问，请在设置中检查应用账号的仓库授权和写权限。"
        }
    } else if out.contains("couldn't find remote ref") || out.contains("could not find remote ref")
    {
        "Git远端分支不存在，请刷新分支列表。"
    } else if out.contains("could not resolve host") || out.contains("could not resolve proxy") {
        "Git无法解析远端或代理域名。"
    } else if out.contains("timed out") || out.contains("timeout") {
        "Git远端连接超时，请检查网络和代理后重试。"
    } else if out.contains("connection refused") {
        "Git远端或代理拒绝连接，请检查网络连接。"
    } else if out.contains("couldn't connect to server") || out.contains("failed to connect to") {
        "Git无法连接远端或代理，请检查网络连接。"
    } else if out.contains("connection reset")
        || out.contains("recv failure")
        || out.contains("empty reply from server")
    {
        "Git远端连接中断，请稍后重试。"
    } else if out.contains("error: failed to push some refs") || out.contains("non-fast-forward") {
        "远端已有新的提交，请先检查远端状态；未强制推送。"
    } else if out.contains("author identity unknown")
        || out.contains("unable to auto-detect email address")
    {
        "请先为仓库配置Git提交者姓名和邮箱，然后重新提交。"
    } else if out.contains("failed to sign")
        || out.contains("gpg failed")
        || out.contains("could not read public key")
    {
        "提交签名失败，请检查Git签名密钥及本机签名程序。"
    } else if out.contains("certificate") || out.contains("ssl") {
        "Git证书验证失败，请检查服务器证书。"
    } else if out.contains("git-lfs: command not found")
        || out.contains("git-lfs: not found")
        || out.contains("'git-lfs' was not found on your path")
        || out.contains("'lfs' is not a git command")
        || out.contains("cannot spawn git-lfs")
    {
        "Git LFS未找到，请确认本机已安装Git LFS且Git子进程可以找到它。"
    } else if out.contains("lfs") && out.contains("[404] not found") {
        "Git LFS对象未找到，服务器返回404；请核对对象存储和访问权限。"
    } else if out.contains("lfs") {
        "Git LFS过滤器或钩子执行失败；请查看本机Git LFS日志。"
    } else if out.contains("index.lock") {
        "当前Git暂存区正在被其他操作使用，请稍后重试。"
    } else {
        "Git操作失败，请检查仓库状态和网络连接。"
    }
    .into()
}
pub fn diagnostic_code(message: &str) -> &'static str {
    if message.contains("HTTP 401") || message.contains("授权已失效") { return "permission"; }
    if message.starts_with("Git LFS未找到") {
        return "git-lfs-missing";
    }
    if message.starts_with("Git LFS对象未找到") {
        return "git-lfs-object-missing";
    }
    if message.starts_with("Git LFS") {
        return "git-lfs";
    }
    if message.starts_with("Git远端分支不存在") {
        return "git-remote-ref-missing";
    }
    if message.starts_with("Git无法解析") {
        return "ENOTFOUND";
    }
    if message.starts_with("Git远端或代理拒绝连接") {
        return "ECONNREFUSED";
    }
    if message.starts_with("Git远端连接中断") {
        return "ECONNRESET";
    }
    if message.starts_with("磁盘空间不足") {
        return "ENOSPC";
    }
    for code in [
        "git-remote-ref-missing",
        "ENOTFOUND",
        "ECONNREFUSED",
        "ECONNRESET",
        "ENOSPC",
    ] {
        if message.contains(&format!("（{code}）")) {
            return code;
        }
    }
    if message
        .split('，')
        .next()
        .unwrap_or(message)
        .trim_end_matches('。')
        .ends_with("已取消")
    {
        "aborted"
    } else if message.contains("超时") {
        "timeout"
    } else if message.contains("证书验证失败") {
        "certificate"
    } else if message.contains("远端拒绝访问")
        || message.contains("无权")
        || message.contains("检查权限")
    {
        "permission"
    } else if message.contains("无法连接") || message.contains("连接中断") {
        "connection"
    } else if message.contains("Git") {
        "git"
    } else {
        "unknown"
    }
}
pub async fn run(root: &Path, args: &[&str], options: Options) -> Result<String> {
    let diagnostics = options.diagnostics.clone();
    let started = std::time::Instant::now();
    let mut index = 0;
    while index < args.len() && args[index].starts_with('-') {
        index += if args[index] == "-c" { 2 } else { 1 };
    }
    let verb = args.get(index).copied().unwrap_or("other");
    let mut details = json!({"event":if options.write && verb != "ls-remote" {"git-write"}else{"git-read"},"outcome":"start","verb":verb,"spanId":uuid::Uuid::new_v4().to_string(),"resource":options.resource});
    if let Some(log) = &diagnostics {
        log.record(&details, false);
    }
    let result = run_process(root, args, options, &mut details).await;
    details["durationMs"] = json!(started.elapsed().as_millis());
    details["outcome"] = json!(match &result {
        Ok(_) => "success",
        Err(error) if diagnostic_code(error) == "aborted" => "cancelled",
        Err(_) => "failure",
    });
    if let Err(error) = &result {
        details["code"] = json!(diagnostic_code(error));
    }
    if let Some(log) = &diagnostics {
        log.record(&details, false);
    }
    result
}
async fn run_process(
    root: &Path,
    args: &[&str],
    options: Options,
    details: &mut Value,
) -> Result<String> {
    let cancellation = options.cancel.clone().unwrap_or_default();
    if cancellation.is_cancelled() { return Err("操作已取消。".into()); }
    let slots = if text(details, "verb") == "fetch" { Some(&FETCH_SLOTS) } else if !options.write { Some(&READ_SLOTS) } else { None };
    let queued_at = std::time::Instant::now();
    let _permit = if let Some(slots) = slots { Some(tokio::select! {
        permit = slots.acquire() => permit.map_err(|_| "Git读取队列已停止。")?,
        _ = cancellation.cancelled() => return Err("操作已取消。".into()),
    }) } else { None };
    details["queueMs"] = json!(queued_at.elapsed().as_millis() as u64);
    if let Some(slots) = slots { details["activeRequests"] = json!((if text(details, "verb") == "fetch" { 2 } else { 4 }) - slots.available_permits()); }
    let mut command = Command::new(util::find_tool("git")?);
    command
        .args([
            "--no-optional-locks",
            "-c",
            "core.fsmonitor=false",
            "-c",
            "core.untrackedCache=false",
            "-c",
            "core.pager=cat",
            "-C",
        ])
        .arg(root)
        .args(args);
    command
        .env("PATH", tool_path())
        .env("LC_ALL", "C")
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_OPTIONAL_LOCKS", "0")
        .env("GIT_NO_LAZY_FETCH", "1");
    for key in [
        "GIT_DIR",
        "GIT_WORK_TREE",
        "GIT_INDEX_FILE",
        "GIT_OBJECT_DIRECTORY",
        "GIT_ALTERNATE_OBJECT_DIRECTORIES",
        "ELECTRON_RUN_AS_NODE",
    ] {
        command.env_remove(key);
    }
    for (key, value) in &options.environment {
        command.env(key, value);
    }
    command
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true);
    let group = crate::platform::ChildGroup::prepare(&mut command)?;
    let mut child = command
        .spawn()
        .map_err(|_| "无法启动Git，请检查Git安装。")?;
    if let Err(error) = group.attach(&child) {
        let _ = child.kill().await;
        let _ = child.wait().await;
        return Err(error);
    }
    let pid = child.id().unwrap_or(0);
    let stdout = child.stdout.take().ok_or("无法读取Git输出。")?;
    let stderr = child.stderr.take().ok_or("无法读取Git状态。")?;
    let reader = tokio::spawn(async move {
        let mut data = Vec::new();
        stdout
            .take(16_000_001)
            .read_to_end(&mut data)
            .await
            .map(|_| data)
    });
    let errors = tokio::spawn(async move {
        let mut data = Vec::new();
        stderr
            .take(1_000_001)
            .read_to_end(&mut data)
            .await
            .map(|_| data)
    });
    if let Some(mut input) = child.stdin.take() {
        if let Some(data) = options.stdin {
            input.write_all(&data).await.map_err(|_| "Git输入失败。")?;
        }
    }
    let cancellation = options.cancel.unwrap_or_default();
    let wait = tokio::select! { result=child.wait()=>result.map_err(|_| "无法读取Git操作结果。".to_string()), _=tokio::time::sleep(Duration::from_secs(if options.timeout>0 {options.timeout} else if options.write {180} else {10}))=>Err("Git操作超时，请稍后重试。".into()), _=cancellation.cancelled()=>Err("操作已取消。".into()) };
    if wait.is_err() {
        group.terminate(pid);
        let _ = child.kill().await;
        let _ = child.wait().await;
    }
    let output = reader
        .await
        .map_err(|_| "Git输出读取失败。")?
        .map_err(|_| "Git输出读取失败。")?;
    details["bytes"] = json!(output.len());
    let error = errors
        .await
        .map_err(|_| "Git状态读取失败。")?
        .map_err(|_| "Git状态读取失败。")?;
    let status = wait?;
    if let Some(code) = status.code() {
        details["exitCode"] = json!(code);
    }
    // check-ignore uses 1 for a successful read with no ignored paths.
    if !status.success() && !(args.first() == Some(&"check-ignore") && status.code() == Some(1)) {
        return Err(failure(&error, options.system_authentication));
    }
    if output.len() > 16_000_000 {
        return Err("Git输出超过可读取范围；未发布不完整结果。".into());
    }
    String::from_utf8(output).map_err(|_| "Git输出包含无法读取的文字。".into())
}
pub async fn read(root: &Path, args: &[&str]) -> Result<String> {
    run(root, args, READ_CONTEXT.try_with(Clone::clone).unwrap_or_default()).await
}
pub fn changes(status: &str) -> Vec<Value> {
    let records: Vec<&str> = status.split('\0').collect();
    let mut files = vec![];
    let mut i = 0;
    while i < records.len() {
        let row = records[i];
        i += 1;
        if row.len() < 3 {
            continue;
        }
        let code = &row[..2];
        let mut file = json!({"path":&row[3..],"status":code.trim(),"tracked":code!="??"});
        if code.contains(['R', 'C']) {
            if let Some(previous) = records.get(i) {
                file["previousPath"] = json!(previous);
            }
            i += 1;
        }
        files.push(file);
    }
    files
}
pub async fn worktrees(root: &Path) -> Result<Vec<Value>> {
    let output = read(root, &["worktree", "list", "--porcelain", "-z"]).await?;
    Ok(output.split("\0\0").filter(|s|!s.is_empty()).map(|row| {
        let parts:Vec<&str>=row.split('\0').collect();let field=|key:&str|parts.iter().find_map(|s|s.strip_prefix(&format!("{key} "))).unwrap_or("").to_owned();
        let path=field("worktree");let canonical=dunce::canonicalize(&path).unwrap_or(PathBuf::from(&path));
        let branch=field("branch").trim_start_matches("refs/heads/").to_owned();
        json!({"path":canonical.to_string_lossy(),"branch":if branch.is_empty(){"Detached HEAD"}else{&branch},"head":field("HEAD"),"bare":parts.contains(&"bare"),"prunable":parts.iter().any(|s|s.starts_with("prunable"))})
    }).collect())
}
pub async fn task(root: &Path) -> Result<Value> {
    let entry = worktrees(root)
        .await?
        .into_iter()
        .find(|v| text(v, "path") == root.to_string_lossy())
        .ok_or("工作目录不属于此仓库。")?;
    if entry["bare"] == true || entry["prunable"] == true {
        return Err("工作目录不可读取。".into());
    }
    let status = read(
        root,
        &["status", "--porcelain=v1", "-z", "--untracked-files=all"],
    )
    .await?;
    let tree = read(
        root,
        &[
            "ls-files",
            "--cached",
            "--others",
            "--exclude-standard",
            "-z",
        ],
    )
    .await?;
    let index = read(root, &["ls-files", "--stage", "--cached", "-z"]).await?;
    let files = changes(&status);
    let mut bytes = format!("{}\0{}\0{}", text(&entry, "head"), status, index).into_bytes();
    for file in &files {
        let path = text(file, "path");
        file_path(path)?;
        bytes.extend(path.as_bytes());
        match std::fs::symlink_metadata(root.join(path)) {
            Ok(m) => bytes.extend(format!("\0{}", crate::platform::metadata_key(&m)).as_bytes()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => bytes.extend(b"missing"),
            Err(_) => return Err("无法完整检查本地更改，请刷新后重试。".into()),
        }
    }
    let branch = text(&entry, "branch");
    let tree: BTreeSet<&str> = tree.split('\0').filter(|s| !s.is_empty()).collect();
    Ok(
        json!({"id":format!("worktree:{branch}:{}",root.display()),"path":root.to_string_lossy(),"branch":branch,"head":entry["head"],"files":files,"tree":tree,"error":"","changeKey":digest(bytes)}),
    )
}
pub async fn history(root: &Path) -> Result<Vec<Value>> {
    let refs = read(
        root,
        &[
            "for-each-ref",
            "--format=%(refname)%00%(objectname)",
            "refs/heads",
            "refs/remotes",
        ],
    )
    .await?;
    let output = read(
        root,
        &[
            "log",
            "--exclude=refs/gittogether/recovery/*",
            "--all",
            "--topo-order",
            "-200",
            "--format=%H%x00%P%x00%s%x00%an%x00%aI%x00",
            "--",
        ],
    )
    .await;
    if output.is_err() && refs.is_empty() {
        return Ok(vec![]);
    }
    Ok(output?.lines().filter_map(|row|{
        let parts:Vec<&str>=row.split('\0').collect();if parts.len()<5{return None;}
        let names:Vec<String>=refs.lines().filter_map(|row|{let (name,head)=row.split_once('\0')?;if head!=parts[0] {return None;}Some(name.strip_prefix("refs/heads/").or_else(||name.strip_prefix("refs/remotes/").filter(|remote|remote.starts_with("origin/"))).unwrap_or(name).to_owned())}).collect();
        Some(json!({"id":parts[0],"parents":parts[1].split_whitespace().collect::<Vec<_>>(),"summary":parts[2],"author":parts[3],"time":parts[4],"refs":names}))
    }).collect())
}
pub async fn commit(root: &Path, id: &str) -> Result<Value> {
    if !sha(id)
        || read(root, &["cat-file", "-t", id]).await?.trim() != "commit"
        || !read(root, &["rev-list", "-1", id, "--not", "--all", "--"])
            .await?
            .trim()
            .is_empty()
    {
        return Err("提交不属于当前仓库历史。".into());
    }
    let meta = read(
        root,
        &[
            "show",
            "--no-patch",
            "--no-show-signature",
            "--format=%H%x00%s%x00%b%x00%an%x00%aI",
            id,
            "--",
        ],
    )
    .await?;
    let parts: Vec<&str> = meta.split('\0').collect();
    if parts.len() < 5 {
        return Err("提交信息无法读取。".into());
    }
    let object = read(root, &["cat-file", "-p", id]).await?;
    let parents: Vec<&str> = object
        .split("\n\n")
        .next()
        .unwrap_or("")
        .lines()
        .filter_map(|s| s.strip_prefix("parent "))
        .collect();
    if !parents.is_empty()
        && read(root, &["rev-parse", "--is-shallow-repository"])
            .await?
            .trim()
            == "true"
        && read(root, &["rev-list", "--parents", "-1", id, "--"])
            .await?
            .split_whitespace()
            .count()
            == 1
    {
        return Err("浅克隆尚未下载父提交，无法读取完整差异。".into());
    }
    let mut args = vec![
        "diff-tree",
        "--no-commit-id",
        "-r",
        "--name-status",
        "-z",
        "--no-ext-diff",
        "--no-textconv",
        "--find-renames",
    ];
    if let Some(parent) = parents.first() {
        args.extend([*parent, id]);
    } else {
        args.extend(["--root", id]);
    }
    args.push("--");
    let raw = read(root, &args).await?;
    let rows: Vec<&str> = raw.split('\0').collect();
    let mut files = vec![];
    let mut i = 0;
    while i + 1 < rows.len() {
        let status = rows[i];
        let path = rows[i + 1];
        i += 2;
        if status.starts_with(['R', 'C']) && i < rows.len() {
            files.push(json!({"status":status,"previousPath":path,"path":rows[i]}));
            i += 1;
        } else {
            files.push(json!({"status":status,"path":path}));
        }
    }
    Ok(
        json!({"commit":{"id":parts[0],"summary":parts[1],"description":parts[2].trim_end(),"author":parts[3],"time":parts[4].trim(),"parents":parents,"refs":[]},"files":files}),
    )
}
pub async fn diff(root: &Path, path: &str, commit_id: Option<&str>) -> Result<String> {
    file_path(path)?;
    let literal = format!(":(literal){path}");
    if let Some(id) = commit_id {
        let details = commit(root, id).await?;
        let file = details["files"]
            .as_array()
            .and_then(|a| a.iter().find(|f| text(f, "path") == path))
            .ok_or("文件不属于此提交。")?;
        let mut args = vec![
            "diff-tree",
            "--no-commit-id",
            "-r",
            "-p",
            "--no-ext-diff",
            "--no-textconv",
            "--find-renames",
        ];
        if let Some(parent) = details["commit"]["parents"][0].as_str() {
            args.extend([parent, id]);
        } else {
            args.extend(["--root", id]);
        }
        args.extend(["--", &literal]);
        let previous = format!(":(literal){}", text(file, "previousPath"));
        if !text(file, "previousPath").is_empty() {
            args.push(&previous);
        }
        return read(root, &args).await;
    }
    let t = task(root).await?;
    let file = t["files"]
        .as_array()
        .and_then(|a| a.iter().find(|f| text(f, "path") == path))
        .ok_or("文件不属于当前更改。")?;
    if file["tracked"] == false {
        return Ok("未跟踪文件尚无Git Diff。".into());
    }
    let staged = read(
        root,
        &[
            "diff",
            "--cached",
            "--no-ext-diff",
            "--no-textconv",
            "--",
            &literal,
        ],
    )
    .await?;
    let working = read(
        root,
        &["diff", "--no-ext-diff", "--no-textconv", "--", &literal],
    )
    .await?;
    Ok(format!(
        "{}{}",
        if staged.is_empty() {
            String::new()
        } else {
            format!("# 已暂存\n{staged}\n")
        },
        if working.is_empty() {
            String::new()
        } else {
            format!("# 工作目录\n{working}")
        }
    ))
}
pub fn merge_history(commits: Vec<Value>) -> Vec<Value> {
    let mut by_id: BTreeMap<String, Value> = BTreeMap::new();
    for commit in commits {
        let id = text(&commit, "id").to_owned();
        if let Some(old) = by_id.get_mut(&id) {
            let mut refs: BTreeSet<String> = old["refs"]
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(|r| r.as_str().map(str::to_owned))
                .collect();
            refs.extend(
                commit["refs"]
                    .as_array()
                    .into_iter()
                    .flatten()
                    .filter_map(|r| r.as_str().map(str::to_owned)),
            );
            old["refs"] = json!(refs);
        } else {
            by_id.insert(id, commit);
        }
    }
    let mut result = vec![];
    while !by_id.is_empty() {
        let parents: BTreeSet<String> = by_id
            .values()
            .flat_map(|c| {
                c["parents"]
                    .as_array()
                    .into_iter()
                    .flatten()
                    .filter_map(|p| p.as_str().map(str::to_owned))
            })
            .collect();
        let id = by_id
            .values()
            .filter(|c| !parents.contains(text(c, "id")))
            .max_by_key(|c| text(c, "time"))
            .map(|c| text(c, "id").to_owned());
        if let Some(id) = id {
            if let Some(c) = by_id.remove(&id) {
                result.push(c);
            }
        } else {
            break;
        }
    }
    result
}

// Resolve SSH host aliases only for repository matching. The original URL is
// still passed to Git, preserving its port, user, key and agent configuration.
pub async fn remote_identity(value: &str) -> Result<Option<String>> {
    let identity = util::identity(value);
    let ssh = value.starts_with("ssh://") || !value.contains("://") && value.contains(':');
    if !ssh { return Ok(identity); }
    let Some(identity) = identity else { return Ok(None); };
    let Some((host, path)) = identity.split_once('/') else { return Ok(None); };
    let mut command = Command::new(util::find_tool("ssh")?);
    command.args(["-G", "--", host]).env("PATH", tool_path()).kill_on_drop(true);
    let result = tokio::time::timeout(Duration::from_secs(5), command.output()).await
        .map_err(|_| "读取系统 SSH 配置超时。")?.map_err(|_| "无法读取系统 SSH 配置。")?;
    if !result.status.success() { return Err("系统 SSH 配置无法解析，请检查该仓库的 SSH 连接。".into()); }
    let output = String::from_utf8_lossy(&result.stdout);
    let hostname = output.lines().find_map(|line| line.strip_prefix("hostname ")).unwrap_or(host);
    Ok(Some(format!("{}/{path}", hostname.to_lowercase())))
}
