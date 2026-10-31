use crate::{
    git::{self, Options},
    provider::Network,
    util::{self, text, Result},
};
use serde_json::{json, Value};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs::{self, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
};
use tokio_util::sync::CancellationToken;

#[cfg(test)]
mod tests;

pub const PULL_DIVERGED: &str = "本地与远端历史已分叉，请先合并或变基；Pull 没有修改文件。";
pub const LATEST_DIVERGED: &str = "本地与远端历史已分叉，已保留历史；请先处理分叉。";

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
async fn remaining_key(root: &Path, task: &Value, excluded: &BTreeSet<String>) -> Result<String> {
    let files = task["files"].as_array().ok_or("工作目录无法读取。")?;
    let mut paths = BTreeSet::new();
    let mut entries = BTreeMap::new();
    for file in files {
        let path = text(file, "path");
        if excluded.contains(path) { continue; }
        let mut metadata = BTreeMap::new();
        for path in std::iter::once(path).chain(file["previousPath"].as_str()) {
            let path = util::file_path(path)?;
            paths.insert(path.clone());
            let value = match fs::symlink_metadata(root.join(&path)) {
                Ok(value) => crate::platform::metadata_key(&value),
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => "missing".into(),
                Err(_) => return Err("无法检查剩余文件。".into()),
            };
            metadata.insert(path, value);
        }
        entries.insert(path.to_owned(), json!({"file":file,"metadata":metadata}));
    }
    let index = git::read(root, &["ls-files", "--stage", "--cached", "-z"]).await?;
    let staged: Vec<_> = index.split('\0').filter(|record| {
        record.split_once('\t').is_some_and(|(_, path)| paths.contains(path))
    }).collect();
    Ok(util::digest(serde_json::to_vec(&json!({"entries":entries,"staged":staged})).map_err(|_| "无法检查剩余更改。")?))
}

fn partial_groups(commits: &[Value], warning: String) -> Result<Value> {
    let Some(last) = commits.last() else {
        return Err(format!("{warning} 请检查本地提交历史后重新分析。"));
    };
    let mut result = last.clone();
    result["commits"] = json!(commits);
    result["incomplete"] = json!(true);
    result["warning"] = json!(warning);
    Ok(result)
}

pub async fn submit_groups(
    root: &Path,
    input: &Value,
    service: &crate::service::Service,
    context: &crate::service::Context,
    cancel: &CancellationToken,
) -> Result<Value> {
    let task = current(root, input).await?;
    let selected: BTreeSet<String> = selected_files(&task, input)?.iter().map(|file| text(file, "path").to_owned()).collect();
    let groups = input["groups"].as_array().ok_or("提交分组无效。")?;
    if groups.is_empty() || groups.len() > selected.len() { return Err("提交分组无效。".into()); }
    let mut covered = BTreeSet::new();
    for group in groups {
        util::allowed(group, &["summary", "description", "paths"])?;
        draft(&json!({"summary":group["summary"],"description":group["description"]}))?;
        let paths = group["paths"].as_array().ok_or("提交分组文件无效。")?;
        if paths.is_empty() { return Err("提交分组不能为空。".into()); }
        for path in paths {
            let path = path.as_str().ok_or("提交分组文件无效。")?;
            if !selected.contains(path) || !covered.insert(path.to_owned()) {
                return Err("提交分组包含重复或未选中的文件，请重新分析。".into());
            }
        }
    }
    if covered != selected { return Err("提交分组未覆盖全部选中文件，请重新分析。".into()); }

    let mut snapshot = task;
    let mut commits = Vec::new();
    for (index, group) in groups.iter().enumerate() {
        let excluded: BTreeSet<_> = group["paths"].as_array().unwrap().iter().map(|path| path.as_str().unwrap().to_owned()).collect();
        let expected = if index + 1 < groups.len() {
            match remaining_key(root, &snapshot, &excluded).await {
                Ok(value) => Some(value),
                Err(error) => return partial_groups(&commits, error),
            }
        } else { None };
        let step = json!({"taskId":input["taskId"],"expectedHead":snapshot["head"],"changeKey":snapshot["changeKey"],"summary":group["summary"],"description":group["description"],"paths":group["paths"]});
        let result = match submit(root, &step, service, context, cancel).await {
            Ok(result) => result,
            Err(error) => return partial_groups(&commits, format!("第 {} 组未完成或结果未确认：{error}；未继续后续分组。", index + 1)),
        };
        commits.push(result.clone());
        if let Some(warning) = result["warning"].as_str() {
            return partial_groups(&commits, format!("第 {} 组已提交：{warning} 未继续后续分组。", index + 1));
        }
        if let Some(expected) = expected {
            let next = match git::task(root).await {
                Ok(value) => value,
                Err(error) => return partial_groups(&commits, format!("无法读取剩余更改：{error}；未继续后续分组。")),
            };
            let actual = match remaining_key(root, &next, &BTreeSet::new()).await {
                Ok(value) => value,
                Err(error) => return partial_groups(&commits, format!("无法核对剩余更改：{error}；未继续后续分组。")),
            };
            let unchanged = next["head"] == result["commitId"] && next["branch"] == snapshot["branch"] && actual == expected;
            if !unchanged {
                return partial_groups(&commits, "剩余文件、暂存状态或分支发生变化；未继续后续分组，请刷新后重新分析。".into());
            }
            snapshot = next;
        }
    }
    let mut result = commits.last().unwrap().clone();
    result["commits"] = json!(commits);
    Ok(result)
}
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
    network
        .run(
            &store,
            &[
                "fetch",
                "--depth=1",
                "--no-tags",
                "--no-auto-gc",
                "--recurse-submodules=no",
                "origin",
                &format!("+refs/heads/{branch}:refs/remotes/origin/{branch}"),
            ],
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

#[derive(Clone, serde::Serialize, PartialEq, Eq)]
pub struct Entry {
    kind: String,
    mode: u32,
    digest: String,
}
type Inventory = BTreeMap<String, Entry>;
fn inventory_sync(root: &Path, cancel: &CancellationToken) -> Result<Inventory> {
    let mut entries = BTreeMap::new();
    let mut queue = vec![root.to_owned()];
    let mut nested_repositories = Vec::new();
    while let Some(dir) = queue.pop() {
        if cancel.is_cancelled() {
            return Err("操作已取消。".into());
        }
        let children = fs::read_dir(&dir)
            .map_err(|_| "目录清单不可读取。")?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(|_| "文件清单不可读取。")?;
        if dir != root
            && children
                .iter()
                .any(|c| c.file_name().to_string_lossy().eq_ignore_ascii_case(".git"))
        {
            nested_repositories.push(dir.clone());
            continue;
        }
        for child in children {
            if dir == root
                && child
                    .file_name()
                    .to_string_lossy()
                    .eq_ignore_ascii_case(".git")
            {
                continue;
            }
            let path = child.path();
            let key = path
                .strip_prefix(root)
                .map_err(|_| "文件路径无效。")?
                .to_str()
                .ok_or("文件路径无法读取。")?
                .to_owned();
            #[cfg(windows)]
            let key = key.replace('\\', "/");
            util::file_path(&key)?;
            let meta = fs::symlink_metadata(&path).map_err(|_| "文件状态无法读取。")?;
            if meta.is_dir() && !crate::platform::is_link(&meta) {
                queue.push(path);
                continue;
            }
            if !nested_repositories.is_empty() {
                continue;
            }
            let (kind, mode, digest) = if crate::platform::is_link(&meta) {
                (
                    "symlink".into(),
                    0,
                    util::digest(
                        fs::read_link(&path)
                            .map_err(|_| "文件链接无法读取。")?
                            .as_os_str()
                            .as_encoded_bytes(),
                    ),
                )
            } else if meta.is_file() {
                let mut file = crate::platform::open_regular(&path, OpenOptions::new().read(true))
                    .map_err(|_| "文件内容不可读取。")?;
                use sha2::{Digest, Sha256};
                let mut hash = Sha256::new();
                let mut bytes = [0u8; 65536];
                loop {
                    if cancel.is_cancelled() {
                        return Err("操作已取消。".into());
                    }
                    let n = file.read(&mut bytes).map_err(|_| "文件内容不可读取。")?;
                    if n == 0 {
                        break;
                    }
                    hash.update(&bytes[..n]);
                }
                (
                    "file".into(),
                    crate::platform::file_mode(&meta),
                    format!("{:x}", hash.finalize()),
                )
            } else {
                return Err("目录包含不支持的文件类型，未修改文件。".into());
            };
            entries.insert(key, Entry { kind, mode, digest });
            if entries.len() > 500_000 {
                return Err("文件数量超过可预览范围，未修改工作目录。".into());
            }
        }
    }
    if !nested_repositories.is_empty() {
        nested_repositories.sort();
        let locations = nested_repositories
            .iter()
            .map(|path| path.display().to_string())
            .collect::<Vec<_>>()
            .join("；");
        return Err(format!(
            "目录包含独立 Git 仓库或子模块，已保留。对应位置：{locations}。请先移出这些目录再清理。"
        ));
    }
    Ok(entries)
}
async fn inventory(root: &Path, cancel: &CancellationToken) -> Result<Inventory> {
    let root = root.to_owned();
    let c = cancel.clone();
    tokio::task::spawn_blocking(move || inventory_sync(&root, &c))
        .await
        .map_err(|_| "文件检查未完成。".to_string())?
}
async fn state_key(root: &Path, files: &Inventory) -> Result<String> {
    let head = git::read(root, &["rev-parse", "HEAD"]).await?;
    let config = git::read(root, &["config", "--null", "--list"]).await?;
    let refs = git::read(root, &["show-ref"]).await.unwrap_or_default();
    let trees = git::read(root, &["worktree", "list", "--porcelain", "-z"]).await?;
    let index = git::read(
        root,
        &["rev-parse", "--path-format=absolute", "--git-path", "index"],
    )
    .await?;
    let bytes = fs::read(index.trim()).unwrap_or_default();
    Ok(util::digest(
        serde_json::to_vec(&(head, refs, trees, util::digest(bytes), util::digest(config), files))
            .map_err(|_| "文件状态编码失败。")?,
    ))
}
fn copy_tree(from: &Path, to: &Path) -> Result<()> {
    fs::create_dir_all(to).map_err(|_| "配置目录创建失败。")?;
    for item in fs::read_dir(from).map_err(|_| "配置读取失败。")? {
        let item = item.map_err(|_| "配置读取失败。")?;
        let src = item.path();
        let dst = to.join(item.file_name());
        let m = fs::symlink_metadata(&src).map_err(|_| "配置读取失败。")?;
        if m.is_dir() && !crate::platform::is_link(&m) {
            copy_tree(&src, &dst)?;
        } else if crate::platform::is_link(&m) {
            crate::platform::copy_link(&src, &dst).map_err(|_| "配置链接保存失败。")?;
        } else {
            fs::copy(src, &dst).map_err(|_| "配置保存失败。")?;
            fs::set_permissions(dst, m.permissions()).map_err(|_| "配置权限保存失败。")?;
        }
    }
    Ok(())
}
async fn snapshot(
    root: &Path,
    destination: &Path,
    branch: &str,
    network: &Network,
    cancel: &CancellationToken,
) -> Result<String> {
    let network = network.for_worktree(root);
    fs::create_dir(destination).map_err(|_| "无法创建远端快照。")?;
    network
        .run(
            destination,
            &["init", "--quiet", "--template="],
            Some(cancel.clone()),
            false,
            false,
            30,
        )
        .await?;
    network.configure_system(destination).await?;
    network
        .run(
            destination,
            &["remote", "add", "origin", &network.url],
            Some(cancel.clone()),
            false,
            false,
            30,
        )
        .await?;
    network
        .run(
            destination,
            &[
                "fetch",
                "--depth=1",
                "--no-tags",
                "--no-auto-gc",
                "--recurse-submodules=no",
                "origin",
                &format!("+refs/heads/{branch}:refs/remotes/origin/{branch}"),
            ],
            Some(cancel.clone()),
            false,
            false,
            1800,
        )
        .await?;
    let head = git::read(
        destination,
        &[
            "rev-parse",
            &format!("refs/remotes/origin/{branch}^{{commit}}"),
        ],
    )
    .await?
    .trim()
    .to_owned();
    let tree = git::read(destination, &["ls-tree", "-r", "-z", &head]).await?;
    let submodule_locations = tree
        .split('\0')
        .filter_map(|entry| {
            let (metadata, path) = entry.split_once('\t')?;
            metadata
                .starts_with("160000 ")
                .then(|| root.join(path).display().to_string())
        })
        .collect::<Vec<_>>();
    if !submodule_locations.is_empty() {
        return Err(format!(
            "此分支包含子模块，暂不支持快照替换。子模块位置：{}。",
            submodule_locations.join("；")
        ));
    }
    for key in [
        "user.name",
        "user.email",
        "user.signingkey",
        "commit.gpgsign",
        "gpg.format",
        "gpg.program",
        "gpg.ssh.program",
        "core.hooksPath",
        "core.autocrlf",
        "core.eol",
        "core.filemode",
    ] {
        if let Ok(value) = git::read(root, &["config", "--local", "--get", key]).await {
            git::run(
                destination,
                &["config", key, value.trim_end()],
                Options {
                    write: true,
                    ..Default::default()
                },
            )
            .await?;
        }
    }
    let hooks = git::read(
        root,
        &["rev-parse", "--path-format=absolute", "--git-path", "hooks"],
    )
    .await?;
    if Path::new(hooks.trim()).exists() {
        copy_tree(Path::new(hooks.trim()), &destination.join(".git/hooks"))?;
    }
    network
        .run(
            destination,
            &[
                "checkout",
                "--quiet",
                "-b",
                branch,
                "--track",
                &format!("origin/{branch}"),
            ],
            Some(cancel.clone()),
            false,
            false,
            1800,
        )
        .await?;
    network
        .hydrate(destination, &head, Some(cancel.clone()))
        .await?;
    network.preserve_remotes(root, destination, branch, &head).await?;
    git::read(
        destination,
        &["fsck", "--connectivity-only", "--no-dangling"],
    )
    .await?;
    if git::read(destination, &["rev-list", "--count", "HEAD"])
        .await?
        .trim()
        != "1"
        || git::read(destination, &["rev-parse", "HEAD"]).await?.trim() != head
    {
        return Err("最新快照校验失败，未修改原目录。".into());
    }
    Ok(head)
}
pub struct SyncPlan {
    pub public: Value,
    pub root: PathBuf,
    temporary: Option<tempfile::TempDir>,
    snapshot: Option<PathBuf>,
    inventory: Inventory,
    state: String,
    common: PathBuf,
    linked: bool,
    reclaim: bool,
    pub created: i64,
}
/// Inspect only the same branch and remote used by the interrupted operation.
/// Fetch updates tracking refs, never the worktree or index.
pub async fn inspect_divergence(
    root: &Path,
    input: &Value,
    network: &Network,
    cancel: &CancellationToken,
) -> Result<Value> {
    let mode = text(input, "mode");
    if !matches!(mode, "pull" | "latest" | "push") {
        return Err("不支持该分叉检查。".into());
    }
    let task = git::task(root).await?;
    if task["id"] != input["taskId"] || task["branch"] == "Detached HEAD" {
        return Err("工作目录分支已变化，请刷新后重试。".into());
    }
    let branch = text(&task, "branch");
    let local_head = util::sha(text(&task, "head"))?;
    git::read(root, &["check-ref-format", "--branch", branch]).await?;
    let fetch_remote = network.fetch_remote(root).await?;
    let remote_head = network.fetch(root, &[branch.into()], cancel).await?.remove(0);
    let push_remote = if mode == "push" {
        let name = network.push_remote(root).await?;
        let push = network.for_push(root).await?;
        let reference = format!("refs/heads/{branch}");
        let result = push.run(root, &["ls-remote", "--", &push.url, &reference], Some(cancel.clone()), false, false, 120).await?;
        let rows: Vec<_> = result.lines().filter_map(|line| line.split_once('\t')).filter(|(_, name)| *name == reference).collect();
        if rows.len() != 1 || util::sha(rows[0].0)? != remote_head {
            return Err("推送目标与获取到的远端状态不一致，请刷新后检查实际目标。".into());
        }
        Some(name)
    } else { None };
    let current = git::task(root).await?;
    if current["id"] != task["id"] || current["head"] != task["head"] || current["changeKey"] != task["changeKey"] {
        return Err("工作目录或提交已变化，请重新核验。".into());
    }
    match crate::history_relationship::inspect(root, &local_head, &remote_head).await? {
        crate::history_relationship::Relationship::Diverged { ahead, behind, bases } => {
            let range = format!("{remote_head}..{local_head}");
            let output = git::read(root, &["rev-list", "--reverse", "--max-count=101", &range]).await?;
            let commits: Vec<_> = output.lines().map(str::trim).filter(|sha| !sha.is_empty()).collect();
            if commits.iter().any(|sha| !util::valid_sha(sha)) { return Err("本地提交列表格式无效。".into()); }
            Ok(json!({"diverged":true,"repositoryId":input["repositoryId"],"taskId":task["id"],"path":task["path"],"branch":branch,"head":local_head,"changeKey":task["changeKey"],"dirty":!task["files"].as_array().unwrap().is_empty(),"remote":fetch_remote,"pushRemote":push_remote,"remoteHead":remote_head,"ahead":ahead,"behind":behind,"bases":bases,"localCommits":commits.iter().take(100).collect::<Vec<_>>(),"commitsTruncated":commits.len()>100}))
        }
        _ => Ok(json!({"diverged":false})),
    }
}
pub async fn prepare(
    root: &Path,
    input: &Value,
    network: &Network,
    storage: &Path,
    cancel: &CancellationToken,
) -> Result<SyncPlan> {
    idle(root).await?;
    let configuration = git::read(root, &["config", "--null", "--list"]).await?;
    let task = git::task(root).await?;
    if task["id"] != input["taskId"] || task["branch"] == "Detached HEAD" {
        return Err("工作目录分支已变化，请刷新后重试。".into());
    }
    let branch = text(&task, "branch");
    git::read(root, &["check-ref-format", "--branch", branch]).await?;
    let common = common(root).await?;
    let linked = !fs::symlink_metadata(root.join(".git"))
        .map_err(|_| "Git 目录不可读取。")?
        .is_dir();
    let mode = text(input, "mode");
    if !matches!(mode, "pull" | "latest" | "clean") {
        return Err("不支持该操作。".into());
    }
    let mut reclaim = false;
    let mut protected = false;
    if mode == "latest" {
        if !task["files"].as_array().unwrap().is_empty() {
            return Err("Get Latest 需要先处理未提交文件；请先 Commit、Submit 或 Clean。".into());
        }
        let refs = git::read(root, &["for-each-ref", "--format=%(refname)%00%(symref)"]).await?;
        let other_refs = refs.lines().any(|l| {
            let (r, s) = l.split_once('\0').unwrap_or((l, ""));
            r != format!("refs/heads/{branch}")
                && !(r.starts_with("refs/remotes/")
                    && (r.ends_with(&format!("/{branch}")) || s.ends_with(&format!("/{branch}"))))
        });
        let other_trees = git::worktrees(root)
            .await?
            .iter()
            .any(|t| t["bare"] != true && text(t, "path") != root.to_string_lossy());
        if !linked && (other_refs || other_trees) {
            return Err("此主目录还保存其他分支、标签或工作目录的历史，已保留；请在独立分支工作目录使用 Get Latest。".into());
        }
        reclaim = linked
            && !other_refs
            && !other_trees
            && common.parent() == Some(storage)
            && common
                .file_name()
                .and_then(|s| s.to_str())
                .is_some_and(|s| {
                    s.len() == 68
                        && s.ends_with(".git")
                        && s[..64].bytes().all(|b| b.is_ascii_hexdigit())
                })
            && git::read(&common, &["rev-parse", "--is-bare-repository"])
                .await?
                .trim()
                == "true";
        protected = linked && !reclaim;
    }
    let temporary = tempfile::Builder::new()
        .prefix(".gittogether-sync-")
        .tempdir_in(root.parent().ok_or("目录路径无效。")?)
        .map_err(|_| "无法创建预览目录。")?;
    let mut destination = None;
    let remote_head;
    let mut files = Vec::new();
    if mode == "pull" {
        remote_head = network
            .fetch(root, &[branch.into()], cancel)
            .await?
            .remove(0);
        if !task["files"].as_array().unwrap().is_empty() {
            return Err("Pull 前请先 Commit 或 Submit 未提交文件。".into());
        }
        let behind = git::read(
            root,
            &[
                "merge-base",
                "--is-ancestor",
                text(&task, "head"),
                &remote_head,
            ],
        )
        .await
        .is_ok();
        let ahead = git::read(
            root,
            &[
                "merge-base",
                "--is-ancestor",
                &remote_head,
                text(&task, "head"),
            ],
        )
        .await
        .is_ok();
        if !behind && !ahead {
            return Err(
                match crate::history_relationship::inspect(root, text(&task, "head"), &remote_head)
                    .await?
                {
                    crate::history_relationship::Relationship::Diverged { .. } => PULL_DIVERGED,
                    _ => "无法确认本地与远端的共同祖先；Pull 没有修改文件，请检查历史是否完整。",
                }
                .into(),
            );
        }
        if behind {
            let names = git::read(
                root,
                &[
                    "diff",
                    "--name-status",
                    "-z",
                    "--no-renames",
                    "--no-ext-diff",
                    "--no-textconv",
                    text(&task, "head"),
                    &remote_head,
                ],
            )
            .await?;
            let rows: Vec<_> = names.split('\0').collect();
            for pair in rows.chunks_exact(2) {
                files.push(json!({"path":util::file_path(pair[1])?,"action":match pair[0]{"D"=>"delete","A"=>"add",_=>"restore"}}));
            }
        }
    } else {
        let path = temporary.path().join("snapshot");
        remote_head = snapshot(root, &path, branch, network, cancel).await?;
        if mode == "latest" {
            if network.fetch(root, &[branch.into()], cancel).await?.first() != Some(&remote_head) {
                return Err("远端分支已更新，请重新预览。".into());
            }
            if git::read(
                root,
                &[
                    "merge-base",
                    "--is-ancestor",
                    text(&task, "head"),
                    &remote_head,
                ],
            )
            .await
            .is_err()
            {
                return Err(
                    match crate::history_relationship::inspect(root, text(&task, "head"), &remote_head)
                        .await?
                    {
                        crate::history_relationship::Relationship::Ahead { .. } => "本地还有未推送的提交，已保留历史；请先 Push。",
                        crate::history_relationship::Relationship::Diverged { .. } => LATEST_DIVERGED,
                        _ => "无法确认本地与远端的共同祖先，已保留历史；请检查历史是否完整。",
                    }
                    .into(),
                );
            }
        }
        let local = inventory(root, cancel).await?;
        let remote = inventory(&path, cancel).await?;
        let keys: BTreeSet<_> = local.keys().chain(remote.keys()).collect();
        for key in keys {
            if local.get(key) != remote.get(key) {
                files.push(json!({"path":key,"action":if !remote.contains_key(key){"delete"}else if !local.contains_key(key){"add"}else{"restore"}}));
            }
        }
        destination = Some(path);
    }
    let inventory = inventory(root, cancel).await?;
    let current = git::task(root).await?;
    if git::read(root, &["config", "--null", "--list"]).await? != configuration {
        return Err("Git 连接或认证配置已变化，请重新预览。".into());
    }
    if current["head"] != task["head"] || current["branch"] != task["branch"] {
        return Err("分支或提交已变化，请重新预览。".into());
    }
    let state = state_key(root, &inventory).await?;
    let history = if mode == "latest" {
        git::read(root, &["rev-list", "--count", "HEAD"])
            .await?
            .trim()
            .parse::<u64>()
            .map_err(|_| "历史数量无法读取。")?
            .saturating_sub(1)
    } else {
        0
    };
    let note = match mode {
        "pull" => "仅快进合入；未提交文件或分叉历史会停止操作。",
        "clean" => "以远端为准恢复、补齐和删除文件（包含忽略的本地文件）；本地提交和暂存区保留。",
        _ if protected => "最新目录只保留一层历史；其他工作目录仍需要的共享历史和 LFS 缓存保留。",
        _ => "核验最新文件及 LFS 后，替换为一层历史并删除原目录的旧 Git 对象和历史缓存。",
    };
    Ok(SyncPlan {
        public: json!({"id":uuid::Uuid::new_v4().to_string(),"repositoryId":input["repositoryId"],"taskId":input["taskId"],"mode":mode,"path":root.to_string_lossy(),"branch":branch,"head":task["head"],"remoteHead":remote_head,"files":files,"historyCommits":history,"protectedHistory":protected,"note":note}),
        root: root.to_owned(),
        temporary: Some(temporary),
        snapshot: destination,
        inventory,
        state,
        common,
        linked,
        reclaim,
        created: util::now(),
    })
}
fn parents(root: &Path, path: &str) {
    let mut p = root.join(path);
    p.pop();
    while p != root && p.starts_with(root) {
        if fs::remove_dir(&p).is_err() {
            break;
        }
        p.pop();
    }
}
fn clean(plan: &SyncPlan) -> Result<()> {
    let temp = plan.temporary.as_ref().ok_or("预览目录不可用。")?;
    let backup = temp.path().join("backup");
    fs::create_dir(&backup).map_err(|_| "无法创建原文件备份。")?;
    let mut removed: Vec<String> = Vec::new();
    let mut written: Vec<String> = Vec::new();
    let files = plan.public["files"].as_array().ok_or("预览格式无效。")?;
    let result = (|| {
        let mut order: Vec<_> = files.iter().collect();
        order.sort_by_key(|f| std::cmp::Reverse(text(f, "path").len()));
        for f in order {
            let p = text(f, "path");
            if !plan.inventory.contains_key(p) {
                continue;
            }
            let saved = backup.join(p);
            fs::create_dir_all(saved.parent().unwrap()).map_err(|_| "原文件备份失败。")?;
            fs::rename(plan.root.join(p), saved).map_err(|_| "原文件备份失败。")?;
            removed.push(p.into());
            parents(&plan.root, p);
        }
        for f in files {
            if f["action"] == "delete" {
                continue;
            }
            let p = text(f, "path");
            let target = plan.root.join(p);
            if target.symlink_metadata().is_ok() {
                fs::remove_dir(&target).map_err(|_| "预览后文件已变化，操作已停止。")?;
            }
            fs::create_dir_all(target.parent().unwrap()).map_err(|_| "文件目录创建失败。")?;
            fs::rename(plan.snapshot.as_ref().unwrap().join(p), target)
                .map_err(|_| "文件恢复失败。")?;
            written.push(p.into());
        }
        Ok::<(), String>(())
    })();
    if let Err(e) = result {
        let rollback = (|| {
            for p in written.iter().rev() {
                fs::remove_file(plan.root.join(p)).map_err(|_| "回滚失败。")?;
                parents(&plan.root, p);
            }
            for p in removed.iter().rev() {
                let target = plan.root.join(p);
                if target.symlink_metadata().is_ok() {
                    fs::remove_dir(&target).map_err(|_| "回滚失败。")?;
                }
                fs::create_dir_all(target.parent().unwrap()).map_err(|_| "回滚失败。")?;
                fs::rename(backup.join(p), target).map_err(|_| "回滚失败。")?;
            }
            Ok::<(), String>(())
        })();
        if rollback.is_err() {
            return Err(format!(
                "文件恢复未完成，原文件备份已保留在 {}；请检查。",
                backup.display()
            ));
        }
        return Err(e);
    }
    Ok(())
}
fn directory_bytes(root: &Path) -> u64 {
    if !root.exists() {
        return 0;
    }
    walkdir::WalkDir::new(root)
        .follow_links(false)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter_map(|e| e.metadata().ok())
        .filter(|m| !m.is_dir())
        .map(|m| m.len())
        .sum()
}
pub async fn apply(
    mut plan: SyncPlan,
    network: &Network,
    cancel: &CancellationToken,
    service: &crate::service::Service,
    context: &crate::service::Context,
) -> Result<Value> {
    idle(&plan.root).await?;
    if state_key(&plan.root, &inventory(&plan.root, cancel).await?).await? != plan.state {
        return Err("目录、暂存区、分支或历史已变化，请重新预览。".into());
    }
    let remote = network
        .run(
            &plan.root,
            &[
                "ls-remote",
                "--exit-code",
                &network.url,
                &format!("refs/heads/{}", text(&plan.public, "branch")),
            ],
            Some(cancel.clone()),
            false,
            false,
            120,
        )
        .await?;
    if remote.split_whitespace().next() != plan.public["remoteHead"].as_str() {
        return Err("远端分支已更新，请重新预览最新文件。".into());
    }
    if cancel.is_cancelled() {
        return Err("操作已取消。".into());
    }
    service.validate(context).await?;
    let mut result = json!({"taskId":plan.public["taskId"],"mode":plan.public["mode"],"head":plan.public["head"],"files":plan.public["files"].as_array().unwrap().len(),"reclaimedBytes":0,"protectedHistory":plan.public["protectedHistory"]});
    let mode = text(&plan.public, "mode").to_owned();
    if mode == "pull" {
        let old = text(&plan.public, "head");
        let remote = text(&plan.public, "remoteHead");
        if git::read(&plan.root, &["merge-base", "--is-ancestor", remote, old])
            .await
            .is_err()
        {
            network
                .run(
                    &plan.root,
                    &["merge", "--ff-only", "--no-edit", remote],
                    None,
                    false,
                    false,
                    120,
                )
                .await?;
        }
        let head = git::read(&plan.root, &["rev-parse", "HEAD"])
            .await?
            .trim()
            .to_owned();
        result["head"] = json!(head);
        if network.hydrate(&plan.root, &head, None).await.is_err() {
            result["warning"] =
                json!("Pull 已快进完成，但 LFS 下载未完成；请检查网络后再次 Pull 补齐。");
        }
        return Ok(result);
    }
    let lock_path = PathBuf::from(
        git::read(
            &plan.root,
            &[
                "rev-parse",
                "--path-format=absolute",
                "--git-path",
                "index.lock",
            ],
        )
        .await?
        .trim(),
    );
    let mut lock = IndexLock::take(lock_path)?;
    if state_key(
        &plan.root,
        &inventory(&plan.root, &CancellationToken::new()).await?,
    )
    .await?
        != plan.state
    {
        return Err("文件已经变化，请重新预览。".into());
    }
    service.validate(context).await?;
    if mode == "clean" {
        if let Err(e) = clean(&plan) {
            if e.contains("备份已保留") {
                if let Some(t) = plan.temporary.take() {
                    let _ = t.keep();
                }
            }
            return Err(e);
        }
        return Ok(result);
    }
    let temp = plan.temporary.as_ref().unwrap().path().to_owned();
    let old = temp.join("old");
    let old_git = plan.root.join(".git");
    let old_bytes = directory_bytes(if plan.linked {
        if plan.reclaim {
            &plan.common
        } else {
            lock.path.parent().unwrap()
        }
    } else {
        &old_git
    });
    if plan.linked {
        network
            .run(
                &plan.common,
                &[
                    "worktree",
                    "move",
                    plan.root.to_str().ok_or("目录路径无效。")?,
                    old.to_str().unwrap(),
                ],
                None,
                false,
                false,
                120,
            )
            .await?;
    } else {
        fs::rename(&plan.root, &old).map_err(|_| "原目录移动失败，未替换文件。")?;
    }
    if let Err(_) = fs::rename(plan.snapshot.as_ref().unwrap(), &plan.root) {
        let rollback = if plan.linked {
            network
                .run(
                    &plan.common,
                    &[
                        "worktree",
                        "move",
                        old.to_str().unwrap(),
                        plan.root.to_str().unwrap(),
                    ],
                    None,
                    false,
                    false,
                    120,
                )
                .await
                .map(|_| ())
        } else {
            fs::rename(&old, &plan.root).map_err(|_| "目录恢复失败。".into())
        };
        if rollback.is_err() {
            if let Some(t) = plan.temporary.take() {
                let _ = t.keep();
            }
            return Err(format!(
                "目录替换未完成，原目录已保留在 {}；请检查。",
                old.display()
            ));
        }
        return Err("目录替换失败，已恢复原目录。".into());
    }
    if !plan.linked {
        lock.path = old.join(".git/index.lock");
    }
    lock.file.take();
    let _ = fs::remove_file(&lock.path);
    result["head"] = plan.public["remoteHead"].clone();
    let removed = async {
        if plan.linked {
            network
                .run(
                    &plan.common,
                    &["worktree", "remove", "--force", old.to_str().unwrap()],
                    None,
                    false,
                    false,
                    120,
                )
                .await?;
        } else {
            fs::remove_dir_all(&old).map_err(|_| "旧目录清理失败。")?;
        }
        if plan.reclaim {
            fs::remove_dir_all(&plan.common).map_err(|_| "旧分支存储清理失败。")?;
        }
        Ok::<(), String>(())
    }
    .await;
    if removed.is_err() {
        if let Some(t) = plan.temporary.take() {
            let _ = t.keep();
        }
        result["warning"] = json!(format!(
            "最新目录已就绪，旧历史清理未完成，已保留 {}；请检查目录权限。",
            temp.display()
        ));
    } else if plan.public["protectedHistory"] != true {
        result["reclaimedBytes"] =
            json!(old_bytes.saturating_sub(directory_bytes(&plan.root.join(".git"))));
    }
    Ok(result)
}
