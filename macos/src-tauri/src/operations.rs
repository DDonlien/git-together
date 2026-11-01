use crate::{
    git::{self, Options},
    provider::Network,
    util::{self, text, Result},
};
use serde_json::{json, Value};
use std::{
    collections::BTreeSet,
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};
use tokio_util::sync::CancellationToken;

#[cfg(test)]
mod tests;

pub const PULL_DIVERGED: &str = "本地与远端历史已分叉，请先合并或变基；Pull 没有修改文件。";

pub async fn idle(root: &Path) -> Result<()> {
    for name in [
        "MERGE_HEAD",
        "CHERRY_PICK_HEAD",
        "REVERT_HEAD",
        "rebase-merge",
        "rebase-apply",
        "BISECT_START",
    ] {
        let p = git::read(
            root,
            &["rev-parse", "--path-format=absolute", "--git-path", name],
        )
        .await?;
        if Path::new(p.trim()).exists() {
            return Err("请先完成正在进行的合并、变基或其他 Git 操作。".into());
        }
    }
    Ok(())
}
pub async fn current(root: &Path, input: &Value) -> Result<Value> {
    let t = git::task(root).await?;
    if t["id"] != input["taskId"]
        || t["head"] != input["expectedHead"]
        || t["changeKey"] != input["changeKey"]
    {
        return Err("分支、提交或文件更改已变化，请检查最新更改后重试。".into());
    }
    if t["branch"] == "Detached HEAD" {
        return Err("当前目录处于游离 HEAD，请先选择分支。".into());
    }
    let files = t["files"].as_array().ok_or("工作目录无法读取。")?;
    if files.is_empty() {
        return Err("没有可提交的更改。".into());
    }
    if files
        .iter()
        .any(|f| text(f, "status").contains('U') || matches!(text(f, "status"), "AA" | "DD"))
    {
        return Err("请先解决合并冲突，再提交。".into());
    }
    idle(root).await?;
    Ok(t)
}
pub fn draft(v: &Value) -> Result<()> {
    let summary = v["summary"].as_str().ok_or("提交摘要无效。")?;
    let description = v["description"].as_str().ok_or("提交描述无效。")?;
    if summary.trim().is_empty()
        || summary.chars().count() > 500
        || summary.contains(['\0', '\n', '\r'])
        || description.chars().count() > 20_000
        || description.contains('\0')
        || serde_json::to_vec(v).map_err(|_| "提交描述无效。")?.len() > 24_000
    {
        return Err("提交摘要或描述超出可接受范围。".into());
    }
    Ok(())
}
pub fn selected_files<'a>(task: &'a Value, input: &Value) -> Result<Vec<&'a Value>> {
    let files = task["files"].as_array().ok_or("工作目录无法读取。")?;
    let Some(paths) = input.get("paths") else {
        return Ok(files.iter().collect());
    };
    let paths = paths.as_array().ok_or("提交文件范围无效。")?;
    if paths.is_empty() {
        return Err("请至少选择一个更改。".into());
    }
    let available: BTreeSet<_> = files.iter().map(|file| text(file, "path")).collect();
    let mut selected = BTreeSet::new();
    for path in paths {
        let path = path.as_str().ok_or("提交文件路径无效。")?;
        if !selected.insert(path) || !available.contains(path) {
            return Err("提交文件范围已变化，请重新检查更改。".into());
        }
    }
    Ok(files
        .iter()
        .filter(|file| selected.contains(text(file, "path")))
        .collect())
}
fn pathspec_input(paths: &[String]) -> Vec<u8> {
    let mut input = Vec::new();
    for path in paths {
        input.extend_from_slice(path.as_bytes());
        input.push(0);
    }
    input
}
pub fn selected_paths(files: &[&Value]) -> Vec<String> {
    files
        .iter()
        .flat_map(|file| {
            std::iter::once(text(file, "path")).chain(
                file["previousPath"]
                    .as_str()
                    .filter(|_| text(file, "status").contains('R')),
            )
        })
        .map(String::from)
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect()
}
pub(crate) struct IndexLock {
    path: PathBuf,
    file: Option<fs::File>,
}
impl IndexLock {
    pub(crate) fn take(path: PathBuf) -> Result<Self> {
        let file =
            crate::platform::open_regular(&path, OpenOptions::new().write(true).create_new(true))
                .map_err(|_| "Git 暂存区正在使用，请稍后重试。")?;
        Ok(Self {
            path,
            file: Some(file),
        })
    }
    pub(crate) fn publish(&mut self, index: &Path, data: &[u8]) -> Result<()> {
        let f = self.file.as_mut().ok_or("暂存区锁已关闭。")?;
        f.write_all(data)
            .and_then(|_| f.sync_all())
            .map_err(|_| "暂存状态写入失败。")?;
        self.file.take();
        fs::rename(&self.path, index).map_err(|_| "暂存状态发布失败。")?;
        Ok(())
    }
}
impl Drop for IndexLock {
    fn drop(&mut self) {
        self.file.take();
        let _ = fs::remove_file(&self.path);
    }
}
pub async fn submit(
    root: &Path,
    input: &Value,
    service: &crate::service::Service,
    context: &crate::service::Context,
    cancel: &CancellationToken,
) -> Result<Value> {
    service.validate(context).await?;
    if cancel.is_cancelled() {
        return Err("提交已取消。".into());
    }
    draft(&json!({"summary":input["summary"],"description":input["description"]}))?;
    let before = current(root, input).await?;
    let paths = selected_paths(&selected_files(&before, input)?);
    let index = PathBuf::from(
        git::read(
            root,
            &["rev-parse", "--path-format=absolute", "--git-path", "index"],
        )
        .await?
        .trim(),
    );
    let mut lock = IndexLock::take(PathBuf::from(format!("{}.lock", index.display())))?;
    let temporary = tempfile::Builder::new()
        .prefix("gittogether-commit-")
        .tempdir_in(index.parent().ok_or("Git index 路径无效。")?)
        .map_err(|_| "无法创建提交暂存区。")?;
    let private = temporary.path().join("index");
    let preserved = temporary.path().join("preserved-index");
    if index.exists() {
        if !fs::symlink_metadata(&index)
            .map_err(|_| "Git index 无法读取。")?
            .is_file()
        {
            return Err("Git index 无效。".into());
        }
        fs::copy(&index, &preserved).map_err(|_| "无法复制暂存状态。")?;
    }
    let env = vec![
        ("GIT_INDEX_FILE".into(), private.to_string_lossy().into()),
        ("GIT_LITERAL_PATHSPECS".into(), "1".into()),
    ];
    // Start from HEAD so an unselected, already staged change cannot leak into
    // this commit. The original index is retained separately for publication.
    let baseline = if text(&before, "head").bytes().all(|v| v == b'0') {
        "--empty"
    } else {
        text(&before, "head")
    };
    git::run(
        root,
        &["read-tree", baseline],
        Options {
            environment: env.clone(),
            write: true,
            ..Default::default()
        },
    )
    .await?;
    git::run(
        root,
        &["add", "--all", "--pathspec-from-file=-", "--pathspec-file-nul"],
        Options {
            environment: env.clone(),
            stdin: Some(pathspec_input(&paths)),
            cancel: Some(cancel.clone()),
            write: true,
            diagnostics: Some(service.diagnostics.clone()),
            ..Default::default()
        },
    )
    .await?;
    current(root, input).await?;
    service.validate(context).await?;
    if cancel.is_cancelled() {
        return Err("提交已取消。".into());
    }
    let message = format!(
        "{}\n\n{}\n",
        text(input, "summary").trim(),
        text(input, "description").trim()
    );
    let feedback = git::run(
        root,
        &["commit", "--cleanup=verbatim", "--file=-"],
        Options {
            environment: env.clone(),
            stdin: Some(message.into_bytes()),
            write: true,
            timeout: 120,
            diagnostics: Some(service.diagnostics.clone()),
            ..Default::default()
        },
    )
    .await;
    let after = git::task(root).await?;
    if after["head"] == before["head"] {
        return Err(feedback
            .err()
            .unwrap_or_else(|| "Git 没有创建新提交。".into()));
    }
    let head = text(&after, "head");
    let parent = git::read(root, &["show", "-s", "--format=%P", head]).await?;
    let actual_tree = git::read(root, &["show", "-s", "--format=%T", head]).await?;
    let index_tree = git::run(
        root,
        &["write-tree"],
        Options {
            environment: env,
            ..Default::default()
        },
    )
    .await?;
    let previous = text(&before, "head");
    let expected_parent = if previous.bytes().all(|v| v == b'0') {
        ""
    } else {
        previous
    };
    if after["branch"] != before["branch"]
        || parent.trim() != expected_parent
        || actual_tree.trim() != index_tree.trim()
    {
        return Err("提交期间分支或内容已变化，请检查实际 Git 历史和暂存状态。".into());
    }
    let mut result = json!({"taskId":input["taskId"],"commitId":head,"branch":after["branch"]});
    if feedback.is_err() {
        result["warning"] = json!("提交已创建，但 Git 后续反馈未完成；请检查本机提交钩子。");
    }
    let publication: Result<()> = async {
        // Updating only selected entries preserves the user's staged versions
        // of every excluded file, including partial staging.
        git::run(
            root,
            &["reset", "--quiet", "--pathspec-from-file=-", "--pathspec-file-nul", head],
            Options {
                environment: vec![
                    ("GIT_INDEX_FILE".into(), preserved.to_string_lossy().into()),
                    ("GIT_LITERAL_PATHSPECS".into(), "1".into()),
                ],
                stdin: Some(pathspec_input(&paths)),
                write: true,
                ..Default::default()
            },
        )
        .await?;
        let data = fs::read(&preserved).map_err(|_| "无法读取新暂存区。".to_string())?;
        lock.publish(&index, &data)
    }
    .await;
    if publication.is_err() {
        result["warning"] = json!("提交已创建，但更新暂存状态失败；请检查 Git index 后再提交。");
    }
    Ok(result)
}

// Compare only the changes left after a group, so our own commit does not
// invalidate the next group while outside edits still stop the sequence.
pub async fn push(
    root: &Path,
    input: &Value,
    network: &Network,
    service: &crate::service::Service,
    context: &crate::service::Context,
    cancel: &CancellationToken,
) -> Result<Value> {
    service.validate(context).await?;
    let task = git::task(root).await?;
    if task["id"] != input["taskId"]
        || task["head"] != input["expectedHead"]
        || task["branch"] == "Detached HEAD"
    {
        return Err("分支或本地提交已变化，请查看最新状态后重试。".into());
    }
    let commit = util::sha(text(input, "commitId"))?;
    let branch = text(&task, "branch");
    git::read(root, &["check-ref-format", &format!("refs/heads/{branch}")]).await?;
    if git::read(
        root,
        &["merge-base", "--is-ancestor", &commit, text(&task, "head")],
    )
    .await
    .is_err()
    {
        return Err("所选提交不属于当前分支历史，未推送。".into());
    }
    let reference = format!("refs/heads/{branch}");
    let network = network.for_push(root).await?;
    let remote_head = |s: String| -> Result<Option<String>> {
        let rows: Vec<_> = s
            .lines()
            .filter_map(|l| l.split_once('\t'))
            .filter(|(_, r)| *r == reference)
            .collect();
        match rows.as_slice() {
            [] => Ok(None),
            [(h, _)] => Ok(Some(util::sha(h)?)),
            _ => Err("远端引用读取异常，无法确认推送。".into()),
        }
    };
    let before = network
        .run(
            root,
            &["ls-remote", "--", &network.url, &reference],
            Some(cancel.clone()),
            true,
            true,
            120,
        )
        .await?;
    if remote_head(before)?.as_deref() != Some(&commit) {
        service.validate(context).await?;
        if cancel.is_cancelled() {
            return Err("推送已取消，本地提交已保留。".into());
        }
        let t = git::task(root).await?;
        if t["id"] != task["id"] || t["head"] != task["head"] {
            return Err("本地提交已变化，未推送。".into());
        }
        network
            .run(
                root,
                &[
                    "push",
                    "--porcelain",
                    "--no-follow-tags",
                    "--recurse-submodules=no",
                    "--",
                    &network.url,
                    &format!("{commit}:{reference}"),
                ],
                None,
                true,
                true,
                1800,
            )
            .await
            .map_err(|e| format!("{e} 本地提交已保留。"))?;
        let after = network
            .run(
                root,
                &["ls-remote", "--", &network.url, &reference],
                None,
                true,
                true,
                120,
            )
            .await?;
        if remote_head(after)?.as_deref() != Some(&commit) {
            return Err("远端状态已变化，无法确认本次推送；本地提交已保留，请刷新后检查。".into());
        }
    }
    Ok(json!({"taskId":input["taskId"],"commitId":commit,"branch":branch,"pushed":true}))
}
pub async fn common(root: &Path) -> Result<PathBuf> {
    let p = git::read(root, &["rev-parse", "--git-common-dir"]).await?;
    dunce::canonicalize(root.join(p.trim())).map_err(|_| "Git 共享目录不可读取。".into())
}
pub async fn download(
    root: &Path,
    repo: &Value,
    input: &Value,
    network: &Network,
    cancel: &CancellationToken,
) -> Result<PathBuf> {
    let branch = util::field(input, "branch", 1024)?;
    let parent = util::absolute(text(input, "parentPath"))?;
    let name = util::field(input, "folderName", 160)?;
    if name.is_empty()
        || name == "."
        || name == ".."
        || name.starts_with('.')
        || name.contains(['/', '\\', ':'])
    {
        return Err("请输入一个独立的文件夹名称。".into());
    }
    git::read(&parent, &["check-ref-format", "--branch", &branch]).await?;
    let project_name: String = text(repo, "name")
        .chars()
        .map(|c| if c <= '\u{1f}' || ['/', '\\', ':', '*', '?', '"', '<', '>', '|'].contains(&c) { '-' } else { c })
        .collect();
    let project_name = project_name.trim_end_matches(['.', ' ']);
    let project = parent.join(if project_name.is_empty() { "repository" } else { project_name });
    match project.symlink_metadata() {
        Ok(metadata) if !metadata.is_dir() || metadata.file_type().is_symlink() => {
            return Err("仓库容器不是可用的实际目录，未修改文件。".into());
        }
        Ok(_) => (),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => (),
        Err(_) => return Err("仓库容器目录不可访问，未修改文件。".into()),
    }
    let destination = project.join(&name);
    if destination.symlink_metadata().is_ok() {
        return Err("目标目录已经存在，未覆盖文件。".into());
    }
    fs::create_dir_all(root).map_err(|_| "无法创建分支存储目录。")?;
    crate::platform::private_directory(root).map_err(|_| "无法保护分支存储目录。")?;
    let store = root.join(format!(
        "{}.git",
        util::digest(format!(
            "{}\0{}\0{}",
            text(repo, "accountId"),
            text(repo, "id"),
            network.url
        ))
    ));
    if !store.exists() {
        fs::create_dir(&store).map_err(|_| "无法创建分支存储。")?;
        network
            .run(
                &store,
                &["init", "--bare", "--quiet", "--template="],
                Some(cancel.clone()),
                false,
                false,
                30,
            )
            .await?;
        network.configure_system(&store).await?;
        network
            .run(
                &store,
                &["remote", "add", "origin", &network.url],
                Some(cancel.clone()),
                false,
                false,
                30,
            )
            .await?;
    }
    if fs::symlink_metadata(&store)
        .map_err(|_| "分支存储不可读取。")?
        .file_type()
        .is_symlink()
        || git::read(&store, &["rev-parse", "--is-bare-repository"])
            .await?
            .trim()
            != "true"
        || git::remote_identity(git::read(&store, &["remote", "get-url", "origin"]).await?.trim()).await? != util::identity(&network.url)
    {
        return Err("分支存储身份不匹配，未修改文件。".into());
    }
    if git::worktrees(&store)
        .await?
        .iter()
        .any(|t| t["bare"] != true && text(t, "branch") == branch)
    {
        return Err("这个分支已有工作目录，请直接关联。".into());
    }
    let shallow = git::read(&store, &["rev-parse", "--is-shallow-repository"]).await?.trim() == "true";
    let reference = format!("+refs/heads/{branch}:refs/remotes/origin/{branch}");
    let mut fetch = vec!["fetch", "--no-tags", "--no-auto-gc", "--recurse-submodules=no"];
    if shallow { fetch.push("--unshallow"); }
    fetch.extend(["origin", &reference]);
    network
        .run(
            &store,
            &fetch,
            Some(cancel.clone()),
            false,
            false,
            1800,
        )
        .await?;
    let head = git::read(
        &store,
        &[
            "rev-parse",
            &format!("refs/remotes/origin/{branch}^{{commit}}"),
        ],
    )
    .await?
    .trim()
    .to_owned();
    let local_ref = format!("refs/heads/{branch}");
    let existing = git::read(&store, &["rev-parse", "--verify", &local_ref])
        .await
        .ok()
        .map(|s| s.trim().to_owned());
    if existing.as_ref().is_some_and(|s| s != &head) {
        return Err("分支存储有本地提交，已保留；请选择关联既有目录。".into());
    }
    let temporary = tempfile::Builder::new()
        .prefix(".gittogether-download-")
        .tempdir_in(&parent)
        .map_err(|_| "无法创建下载目录。")?;
    let worktree = temporary.path().join("worktree");
    let result = async {
        network
            .run(
                &store,
                &[
                    "worktree",
                    "add",
                    "--detach",
                    worktree.to_str().ok_or("目录名称无法读取。")?,
                    &head,
                ],
                Some(cancel.clone()),
                false,
                false,
                1800,
            )
            .await?;
        network
            .hydrate(&worktree, &head, Some(cancel.clone()))
            .await?;
        network
            .run(
                &worktree,
                &[
                    "checkout",
                    "--quiet",
                    "-B",
                    &branch,
                    "--track",
                    &format!("origin/{branch}"),
                ],
                Some(cancel.clone()),
                false,
                false,
                30,
            )
            .await?;
        if cancel.is_cancelled() {
            return Err("下载已取消。".into());
        }
        if destination.symlink_metadata().is_ok() {
            return Err("目标文件夹已出现，未覆盖文件。".into());
        }
        fs::create_dir_all(&project).map_err(|_| "无法创建仓库容器目录。")?;
        network
            .run(
                &store,
                &[
                    "worktree",
                    "move",
                    worktree.to_str().unwrap(),
                    destination.to_str().ok_or("目录名称无法读取。")?,
                ],
                None,
                false,
                false,
                30,
            )
            .await?;
        Ok::<_, String>(destination.clone())
    }
    .await;
    if result.is_err() {
        if worktree.exists() {
            let cleanup = network
                .run(
                    &store,
                    &["worktree", "remove", "--force", worktree.to_str().unwrap()],
                    None,
                    false,
                    false,
                    30,
                )
                .await;
            if cleanup.is_err() {
                let retained = temporary.keep();
                return Err(format!(
                    "下载未完成，临时工作目录清理失败，已保留于 {}；未删除仍被引用的分支。",
                    retained.display()
                ));
            }
        }
        if existing.is_none() {
            let _ = git::run(
                &store,
                &["update-ref", "-d", &local_ref, &head],
                Options {
                    write: true,
                    ..Default::default()
                },
            )
            .await;
        }
    }
    result
}

pub struct SyncPlan {
    pub public: Value,
    pub root: PathBuf,
    state: String,
    pub created: i64,
}
async fn pull_state(root: &Path) -> Result<String> {
    let task = git::task(root).await?;
    let config = git::read(root, &["config", "--null", "--list"]).await?;
    Ok(util::digest(format!("{}:{}:{}:{}", text(&task,"branch"), text(&task,"head"), text(&task,"changeKey"), config)))
}
async fn upstream_branch(root: &Path, branch: &str) -> Result<String> {
    let configuration = git::read(root, &["config", "--null", "--list"]).await?;
    let key = format!("branch.{branch}.merge");
    let values: Vec<_> = configuration.split('\0').filter_map(|entry| entry.split_once('\n'))
        .filter(|(name,_)| name.eq_ignore_ascii_case(&key)).map(|(_,value)|value).collect();
    if values.len() != 1 { return Err("当前分支未配置唯一的上游分支，无法执行 Pull。".into()); }
    let remote = values[0].strip_prefix("refs/heads/").ok_or("上游分支配置无效，未执行 Pull。")?;
    if remote.starts_with('-') || git::read(root, &["check-ref-format", "--branch", remote]).await?.trim() != remote {
        return Err("上游分支配置无效，未执行 Pull。".into());
    }
    Ok(remote.to_owned())
}

pub async fn prepare(
    root: &Path,
    input: &Value,
    network: &Network,
    _storage: &Path,
    cancel: &CancellationToken,
) -> Result<SyncPlan> {
    if input["mode"] != "pull" { return Err("精简版只支持标准 Pull。".into()); }
    idle(root).await?;
    let task = git::task(root).await?;
    if task["id"] != input["taskId"] || task["branch"] == "Detached HEAD" {
        return Err("工作目录分支已变化，请刷新后重试。".into());
    }
    if !task["files"].as_array().unwrap().is_empty() {
        return Err("Pull 前请先提交或处理未提交文件。".into());
    }
    let branch = text(&task, "branch");
    git::read(root, &["check-ref-format", "--branch", branch]).await?;
    let remote_branch = upstream_branch(root, branch).await?;
    let remote_head = network.fetch(root, &[remote_branch.clone()], cancel).await?.remove(0);
    let current = git::task(root).await?;
    if current["head"] != task["head"] || current["branch"] != task["branch"] || current["changeKey"] != task["changeKey"] {
        return Err("工作目录在获取远端期间已变化，请重新检查。".into());
    }
    let behind = git::read(root, &["merge-base", "--is-ancestor", text(&task,"head"), &remote_head]).await.is_ok();
    let ahead = git::read(root, &["merge-base", "--is-ancestor", &remote_head, text(&task,"head")]).await.is_ok();
    if !behind && !ahead {
        return Err(match crate::history_relationship::inspect(root,text(&task,"head"),&remote_head).await? {
            crate::history_relationship::Relationship::Diverged{..} => PULL_DIVERGED,
            _ => "无法确认本地与远端的共同祖先；Pull 没有修改文件，请检查历史是否完整。",
        }.into());
    }
    let mut files = Vec::new();
    if behind {
        let names=git::read(root,&["diff","--name-status","-z","--no-renames","--no-ext-diff","--no-textconv",text(&task,"head"),&remote_head]).await?;
        let rows:Vec<_>=names.split('\0').filter(|field|!field.is_empty()).collect();
        if rows.len()%2!=0 { return Err("Git 变更清单不完整。".into()); }
        for pair in rows.chunks_exact(2) {
            files.push(json!({"path":util::file_path(pair[1])?,"action":match pair[0]{"D"=>"delete","A"=>"add",_=>"restore"}}));
        }
    }
    Ok(SyncPlan {
        public:json!({"id":uuid::Uuid::new_v4().to_string(),"repositoryId":input["repositoryId"],"taskId":input["taskId"],"mode":"pull","path":root.to_string_lossy(),"branch":branch,"remoteBranch":remote_branch,"head":task["head"],"remoteHead":remote_head,"files":files,"historyCommits":0,"protectedHistory":false,"note":"仅快进当前分支，不改写本地提交。"}),
        root:root.to_owned(), state:pull_state(root).await?, created:util::now(),
    })
}

pub async fn apply(
    plan: SyncPlan,
    network: &Network,
    cancel: &CancellationToken,
    service: &crate::service::Service,
    context: &crate::service::Context,
) -> Result<Value> {
    idle(&plan.root).await?;
    if pull_state(&plan.root).await? != plan.state {
        return Err("工作目录、暂存区或连接配置已变化，请重新预览。".into());
    }
    let branch=text(&plan.public,"remoteBranch");
    let reference=format!("refs/heads/{branch}");
    let remote=network.run(&plan.root,&["ls-remote","--exit-code",&network.url,&reference],Some(cancel.clone()),false,false,120).await?;
    if remote.split_whitespace().next()!=plan.public["remoteHead"].as_str() {
        return Err("远端分支已更新，请重新预览。".into());
    }
    if cancel.is_cancelled() {return Err("操作已取消。".into());}
    service.validate(context).await?;
    let old=text(&plan.public,"head");
    let remote=text(&plan.public,"remoteHead");
    if git::read(&plan.root,&["merge-base","--is-ancestor",remote,old]).await.is_err() {
        network.run(&plan.root,&["merge","--ff-only","--no-edit",remote],None,true,false,120).await?;
    }
    let head=git::read(&plan.root,&["rev-parse","HEAD"]).await?.trim().to_owned();
    let mut result=json!({"taskId":plan.public["taskId"],"mode":"pull","head":head,"files":plan.public["files"].as_array().unwrap().len(),"reclaimedBytes":0,"protectedHistory":false});
    if network.hydrate(&plan.root,&head,None).await.is_err() {
        result["warning"]=json!("Pull 已快进完成，但 LFS 下载未完成；请检查网络后再次 Pull 补齐。");
    }
    Ok(result)
}
