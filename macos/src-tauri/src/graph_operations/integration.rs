use super::*;

pub struct IntegrationPlan {
    pub public: Value,
    pub created: i64,
    pub started: std::sync::atomic::AtomicBool,
    pub applied: std::sync::atomic::AtomicBool,
    pub restoring: std::sync::atomic::AtomicBool,
    root: PathBuf,
    before: Value,
    mode: String,
    remote_branch: String,
    remote_head: String,
    target_commit: String,
    result_commit: String,
    config_key: String,
    temporary: tempfile::TempDir,
}

async fn remote_head(
    root: &Path,
    network: &crate::provider::Network,
    branch: &str,
    cancel: &CancellationToken,
) -> Result<String> {
    let reference = format!("refs/heads/{branch}");
    let rows = network
        .run(
            root,
            &["ls-remote", "--heads", "--", &network.url, &reference],
            Some(cancel.clone()),
            false,
            false,
            120,
        )
        .await?;
    let found: Vec<_> = rows
        .lines()
        .filter_map(|line| line.split_once('\t'))
        .filter(|(_, name)| *name == reference)
        .collect();
    if found.len() != 1 {
        return Err("远端目标分支不存在或返回不完整，请刷新。".into());
    }
    util::sha(found[0].0)
}

async fn valid_branch(root: &Path, value: &str) -> Result<String> {
    if value.starts_with('-')
        || value.len() > 1024
        || git::read(root, &["check-ref-format", "--branch", value])
            .await?
            .trim()
            != value
    {
        return Err("远端分支名称无效。".into());
    }
    Ok(value.into())
}

pub async fn branches(root: &Path, context: &Context, cancel: &CancellationToken) -> Result<Value> {
    let output = context
        .network
        .run(
            root,
            &["ls-remote", "--heads", "--", &context.network.url],
            Some(cancel.clone()),
            false,
            false,
            120,
        )
        .await?;
    let mut rows = Vec::new();
    for line in output.lines() {
        let (head, reference) = line.split_once('\t').ok_or("远端分支列表格式无效。")?;
        let name = reference
            .strip_prefix("refs/heads/")
            .ok_or("远端分支列表格式无效。")?;
        if name.starts_with('-') || name.is_empty() || name.len() > 1024 {
            return Err("远端分支名称无效。".into());
        }
        rows.push(json!({"name":name,"head":util::sha(head)?}));
    }
    rows.sort_by(|a, b| text(a, "name").cmp(text(b, "name")));
    let limited = rows.len() > 500;
    rows.truncate(500);
    let push = context.network.push_remote(root).await;
    Ok(
        json!({"branches":rows,"limited":limited,"remote":context.network.fetch_remote(root).await?,"pushRemote":push.as_ref().ok(),"pushError":push.as_ref().err()}),
    )
}

pub async fn commits(
    root: &Path,
    input: &Value,
    context: &Context,
    cancel: &CancellationToken,
) -> Result<Value> {
    let branch = valid_branch(root, &util::field(input, "remoteBranch", 1024)?).await?;
    let expected = util::sha(text(input, "remoteHead"))?;
    let page = input["page"]
        .as_u64()
        .filter(|page| *page < 10)
        .ok_or("提交页码无效。")?;
    let head = context
        .network
        .fetch(root, &[branch.clone()], cancel)
        .await?
        .remove(0);
    if head != expected {
        return Err("远端分支已更新，请刷新分支和提交列表。".into());
    }
    let skip = format!("--skip={}", page * 100);
    let output = git::read(
        root,
        &[
            "log",
            "--topo-order",
            "--max-count=101",
            &skip,
            "--format=%H%x00%s",
            &head,
            "--",
        ],
    )
    .await?;
    let mut commits = Vec::new();
    for line in output.lines() {
        let (sha, summary) = line.split_once('\0').ok_or("远端提交列表格式无效。")?;
        commits.push(json!({"id":util::sha(sha)?,"summary":summary}));
    }
    let more = commits.len() > 100;
    commits.truncate(100);
    let local = git::task(root).await?;
    let local_head = util::sha(text(&local, "head"))?;
    let bases = git::merge_bases(root, &local_head, &head).await?;
    let bases: Vec<_> = bases
        .lines()
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(util::sha)
        .collect::<Result<_>>()?;
    let range = format!("{local_head}...{head}");
    let counts = git::read(root, &["rev-list", "--left-right", "--count", &range]).await?;
    let counts: Vec<_> = counts
        .split_whitespace()
        .map(|s| s.parse::<u64>())
        .collect::<std::result::Result<_, _>>()
        .map_err(|_| "历史关系格式无效。")?;
    if counts.len() != 2 {
        return Err("历史关系格式无效。".into());
    }
    Ok(
        json!({"branch":branch,"head":head,"page":page,"commits":commits,"hasMore":more && page < 9,"localHead":local_head,"bases":bases,"ahead":counts[0],"behind":counts[1]}),
    )
}

async fn safe_configuration(root: &Path, task: &Value) -> Result<String> {
    if !task["files"]
        .as_array()
        .ok_or("无法读取工作目录状态。")?
        .is_empty()
    {
        return Err("工作目录包含未提交或暂存更改；请先处理这些更改，原内容保持。".into());
    }
    let flags = git::read(root, &["ls-files", "-v", "-z"]).await?;
    if flags
        .split('\0')
        .filter(|row| !row.is_empty())
        .any(|row| !row.starts_with("H "))
    {
        return Err(
            "暂存区包含 skip-worktree、assume-unchanged 或其他特殊标记，不能安全整合；原内容保持。"
                .into(),
        );
    }
    if git::read(root, &["rev-parse", "--is-shallow-repository"])
        .await?
        .trim()
        == "true"
    {
        return Err("浅克隆无法完整核验历史，请先补齐历史后重试。".into());
    }
    let config = git::read(root, &["config", "--null", "--list"]).await?;
    let info_attributes = git::read(
        root,
        &[
            "rev-parse",
            "--path-format=absolute",
            "--git-path",
            "info/attributes",
        ],
    )
    .await?;
    match fs::metadata(info_attributes.trim()) {
        Ok(metadata) if metadata.len() > 0 => {
            return Err("仓库使用私有 info/attributes；预览式发布暂不支持，请使用标准 Git。".into())
        }
        Ok(_) => (),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => (),
        Err(_) => return Err("无法检查仓库属性，未开始整合。".into()),
    }
    let signing = config
        .split('\0')
        .filter_map(|row| row.split_once('\n'))
        .filter(|(key, _)| *key == "commit.gpgsign")
        .map(|(_, value)| value)
        .last();
    if signing.is_some_and(|value| {
        !matches!(
            value.to_ascii_lowercase().as_str(),
            "false" | "no" | "off" | "0"
        )
    }) {
        return Err("当前仓库要求签名提交；此预览式整合暂不支持签名，请使用标准 Git。".into());
    }
    for hook in [
        "pre-rebase",
        "post-rewrite",
        "pre-commit",
        "prepare-commit-msg",
        "commit-msg",
        "post-commit",
        "post-checkout",
    ] {
        let relative = format!("hooks/{hook}");
        let raw = git::read(
            root,
            &[
                "rev-parse",
                "--path-format=absolute",
                "--git-path",
                &relative,
            ],
        )
        .await?;
        let path = Path::new(raw.trim());
        match fs::metadata(path) {
            Ok(metadata) if crate::platform::executable(&metadata) => {
                return Err(format!(
                    "检测到启用的 {hook} 钩子；预览式整合不会绕过它，请使用标准 Git。"
                ))
            }
            Ok(_) => (),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => (),
            Err(_) => return Err(format!("无法检查 {hook} 钩子，未开始整合。")),
        }
    }
    for tree in git::worktrees(root).await? {
        if text(&tree, "branch") == text(task, "branch")
            && text(&tree, "path") != text(task, "path")
            && tree["bare"] != true
        {
            return Err("此分支同时被其他工作目录检出，无法安全更新；未修改任何目录。".into());
        }
    }
    Ok(util::digest(config))
}

async fn identity(root: &Path) -> Result<(String, String)> {
    let ident = git::read(root, &["var", "GIT_COMMITTER_IDENT"]).await?;
    let (name, rest) = ident
        .trim()
        .rsplit_once(" <")
        .ok_or("无法读取 Git 提交身份。")?;
    let (email, _) = rest.split_once('>').ok_or("无法读取 Git 提交身份。")?;
    if name.is_empty() || email.is_empty() || name.contains('\n') || email.contains('\n') {
        return Err("Git 提交身份无效。".into());
    }
    Ok((name.into(), email.into()))
}

async fn contains_submodule(root: &Path, head: &str) -> Result<bool> {
    Ok(git::read(root, &["ls-tree", "-r", head])
        .await?
        .lines()
        .any(|line| line.starts_with("160000 ")))
}

async fn ensure_remote(
    root: &Path,
    context: &Context,
    branch: &str,
    expected: &str,
    push: bool,
    cancel: &CancellationToken,
) -> Result<()> {
    if remote_head(root, &context.network, branch, cancel).await? != expected {
        return Err("远端来源分支已更新，请重新准备。".into());
    }
    if push {
        let network = context.network.for_push(root).await?;
        if remote_head(root, &network, branch, cancel).await? != expected {
            return Err("推送目标与预览的远端分支不一致，请重新准备。".into());
        }
    }
    Ok(())
}

async fn setup_scratch(
    root: &Path,
    dir: &Path,
    head: &str,
    cancel: &CancellationToken,
) -> Result<PathBuf> {
    let (name, email) = identity(root).await?;
    let scratch = dir.join("repository");
    git::run(
        root,
        &[
            "clone",
            "--shared",
            "--no-checkout",
            "--no-hardlinks",
            "--quiet",
            "--",
            root.to_str().ok_or("本地路径无效。")?,
            scratch.to_str().ok_or("预览路径无效。")?,
        ],
        opts(cancel),
    )
    .await?;
    let hooks = dir.join("empty-hooks");
    fs::create_dir(&hooks).map_err(|_| "无法创建隔离钩子目录。")?;
    let hooks_path = hooks.to_str().ok_or("隔离钩子路径无效。")?;
    for (key, value) in [
        ("user.name", name.as_str()),
        ("user.email", email.as_str()),
        ("commit.gpgsign", "false"),
        ("core.hooksPath", hooks_path),
        ("merge.conflictStyle", "diff3"),
    ] {
        git::run(&scratch, &["config", key, value], opts(cancel)).await?;
    }
    // Checkout filters and line endings must match the actual worktree. Clone
    // inherits global config but deliberately does not copy local Git settings.
    let relevant = |config: String| -> Vec<String> {
        config
            .split('\0')
            .filter_map(|row| row.split_once('\n'))
            .filter(|(key, _)| {
                key.starts_with("filter.")
                    || matches!(
                        *key,
                        "core.autocrlf"
                            | "core.eol"
                            | "core.safecrlf"
                            | "core.symlinks"
                            | "core.attributesfile"
                    )
            })
            .map(|(key, value)| format!("{key}\n{value}"))
            .collect()
    };
    if relevant(git::read(root, &["config", "--null", "--list"]).await?)
        != relevant(git::read(&scratch, &["config", "--null", "--list"]).await?)
    {
        return Err(
            "工作目录的检出过滤器、换行或链接配置与隔离预览不同；为保护文件请使用标准 Git。".into(),
        );
    }
    git::run(
        &scratch,
        &["checkout", "--detach", "--quiet", head],
        Options {
            environment: vec![("GIT_LFS_SKIP_SMUDGE".into(), "1".into())],
            ..opts(cancel)
        },
    )
    .await?;
    Ok(scratch)
}

async fn replay_list(root: &Path, base: &str, head: &str) -> Result<Vec<String>> {
    let range = format!("{base}..{head}");
    let merges = git::read(root, &["rev-list", "--min-parents=2", &range]).await?;
    if !merges.trim().is_empty() {
        return Err("本地独有历史包含合并提交，当前 AI Rebase 仅支持线性提交；原历史保持。".into());
    }
    let output = git::read(root, &["rev-list", "--reverse", "--max-count=501", &range]).await?;
    let commits: Vec<_> = output
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(util::sha)
        .collect::<Result<_>>()?;
    if commits.is_empty() || commits.len() > 500 {
        return Err("本地独有提交为空或超过 500 个，未开始变基。".into());
    }
    Ok(commits)
}

pub async fn prepare(
    root: &Path,
    input: &Value,
    service: &Service,
    context: &Context,
    cancel: &CancellationToken,
) -> Result<IntegrationPlan> {
    let before = snapshot(root, input).await?;
    let config_key = safe_configuration(root, &before).await?;
    let mode = text(input, "mode");
    if !matches!(mode, "rebase" | "remote-merge") {
        return Err("不支持该整合方式。".into());
    }
    let branch = valid_branch(root, &util::field(input, "remoteBranch", 1024)?).await?;
    let remote_head = util::sha(text(input, "remoteHead"))?;
    let fetched = context
        .network
        .fetch(root, &[branch.clone()], cancel)
        .await?
        .remove(0);
    if fetched != remote_head {
        return Err("远端分支已更新，请重新选择。".into());
    }
    ensure_remote(
        root,
        context,
        &branch,
        &remote_head,
        mode == "remote-merge",
        cancel,
    )
    .await?;
    let local_head = util::sha(text(&before, "head"))?;
    if contains_submodule(root, &local_head).await?
        || contains_submodule(root, &remote_head).await?
    {
        return Err("所选历史包含子模块；请先单独处理子模块，原工作目录保持。".into());
    }
    let bases = git::merge_bases(root, &local_head, &remote_head).await?;
    let bases: Vec<_> = bases
        .lines()
        .map(str::trim)
        .filter(|base| !base.is_empty())
        .collect();
    if bases.len() != 1 || !util::valid_sha(bases[0]) {
        return Err("无法确认唯一共同祖先；请使用标准 Git 检查历史。".into());
    }
    let base = bases[0].to_owned();
    // If the target is already an ancestor of the source, a concurrent
    // fast-forward to an intermediate local commit could otherwise still be
    // accepted by ordinary Git push despite a stale preview. Use normal Push.
    if mode == "remote-merge" && base == remote_head {
        return Err("所选远端提交已包含在本地历史中；请使用普通 Push，未创建合并或推送。".into());
    }
    let mut replay = Vec::new();
    let target = if mode == "rebase" {
        let target = util::sha(text(input, "targetCommit"))?;
        if git::read(
            root,
            &["merge-base", "--is-ancestor", &target, &remote_head],
        )
        .await
        .is_err()
            || git::read(root, &["merge-base", "--is-ancestor", &base, &target])
                .await
                .is_err()
        {
            return Err("所选提交必须属于该远端分支且不早于共同祖先；未改写历史。".into());
        }
        replay = replay_list(root, &base, &local_head).await?;
        target
    } else {
        remote_head.clone()
    };
    let temporary = tempfile::Builder::new()
        .prefix("gittogether-integration-")
        .tempdir()
        .map_err(|_| "无法创建隔离预览目录。")?;
    crate::platform::private_directory(temporary.path()).map_err(|_| "无法保护隔离预览目录。")?;
    let scratch = setup_scratch(
        root,
        temporary.path(),
        if mode == "rebase" {
            &local_head
        } else {
            &remote_head
        },
        cancel,
    )
    .await?;
    let mut conflicts = BTreeSet::new();
    let mut unchanged = false;
    let result_commit;
    if mode == "rebase" {
        if target == base {
            unchanged = true;
            result_commit = local_head.clone();
        } else {
            let mut step = git::run(
                &scratch,
                &[
                    "-c",
                    "core.editor=true",
                    "rebase",
                    "--no-autostash",
                    "--no-update-refs",
                    "--no-fork-point",
                    "--reapply-cherry-picks",
                    "--empty=keep",
                    "--keep-empty",
                    "--no-autosquash",
                    "--onto",
                    &target,
                    &base,
                ],
                Options {
                    environment: vec![
                        ("GIT_LFS_SKIP_SMUDGE".into(), "1".into()),
                        ("GIT_EDITOR".into(), "true".into()),
                    ],
                    ..opts(cancel)
                },
            )
            .await;
            let mut attempts = 0;
            while let Err(error) = step {
                if cancel.is_cancelled() {
                    return Err("AI Rebase 准备已取消，本地分支未修改。".into());
                }
                let unmerged = git::read(&scratch, &["ls-files", "--unmerged", "-z"]).await?;
                if unmerged.is_empty() {
                    return Err(format!("变基预览未完成：{error} 本地分支未修改。"));
                }
                attempts += 1;
                if attempts > replay.len() {
                    return Err("变基冲突步骤超出预览范围，本地分支未修改。".into());
                }
                let current = git::read(&scratch, &["rev-parse", "--verify", "REBASE_HEAD"])
                    .await?
                    .trim()
                    .to_owned();
                if !replay.contains(&current) {
                    return Err("变基遇到未列出的提交，本地分支未修改。".into());
                }
                let source = Source {
                    name: format!("本地提交 {current}"),
                    kind: "local".into(),
                    task_id: String::new(),
                    root: root.to_owned(),
                    head: current,
                };
                conflicts.extend(resolve_conflicts(&scratch, &source, cancel, service).await?);
                step = git::run(
                    &scratch,
                    &["-c", "core.editor=true", "rebase", "--continue"],
                    Options {
                        environment: vec![
                            ("GIT_LFS_SKIP_SMUDGE".into(), "1".into()),
                            ("GIT_EDITOR".into(), "true".into()),
                        ],
                        ..opts(cancel)
                    },
                )
                .await;
            }
            result_commit = util::sha(git::read(&scratch, &["rev-parse", "HEAD"]).await?.trim())?;
            let new_range = format!("{target}..{result_commit}");
            let new_output = git::read(&scratch, &["rev-list", "--reverse", &new_range]).await?;
            let rewritten: Vec<_> = new_output.lines().filter(|line| !line.is_empty()).collect();
            if rewritten.len() != replay.len() {
                return Err("预览重放数量不一致，本地分支未修改。".into());
            }
            for (old, new) in replay.iter().zip(rewritten) {
                let format = "--format=%an%x00%ae%x00%aI%x00%B";
                if git::read(root, &["show", "-s", format, old]).await?
                    != git::read(&scratch, &["show", "-s", format, new]).await?
                {
                    return Err("预览提交的作者或说明发生变化，本地分支未修改。".into());
                }
            }
        }
    } else if base == local_head {
        unchanged = true;
        result_commit = remote_head.clone();
    } else {
        let merged = git::run(
            &scratch,
            &["merge", "--no-ff", "--no-commit", "--no-edit", &local_head],
            Options {
                environment: vec![("GIT_LFS_SKIP_SMUDGE".into(), "1".into())],
                ..opts(cancel)
            },
        )
        .await;
        if let Err(error) = merged {
            if git::read(&scratch, &["ls-files", "--unmerged", "-z"])
                .await?
                .is_empty()
            {
                return Err(format!(
                    "远端合并预览未完成：{error} 本地与远端分支未修改。"
                ));
            }
            let source = Source {
                name: text(&before, "branch").into(),
                kind: "local".into(),
                task_id: text(&before, "id").into(),
                root: root.to_owned(),
                head: local_head.clone(),
            };
            conflicts.extend(resolve_conflicts(&scratch, &source, cancel, service).await?);
        }
        let tree = git::read(&scratch, &["write-tree"])
            .await?
            .trim()
            .to_owned();
        result_commit = temporary_commit(
            &scratch,
            &tree,
            &[remote_head.clone(), local_head.clone()],
            cancel,
        )
        .await?;
    }
    let compare = if mode == "rebase" {
        &local_head
    } else {
        &remote_head
    };
    let files = changed_files(&scratch, compare, &result_commit, cancel).await?;
    let patch = git::run(
        &scratch,
        &[
            "diff",
            "--no-ext-diff",
            "--no-textconv",
            "--binary",
            "--no-renames",
            compare,
            &result_commit,
            "--",
        ],
        Options {
            cancel: Some(cancel.clone()),
            ..Default::default()
        },
    )
    .await?;
    // Publishing a rebase must not replace hydrated LFS files with pointers.
    if mode == "rebase" && !files.is_empty() {
        let paths = files
            .iter()
            .map(|file| text(file, "path"))
            .collect::<Vec<_>>()
            .join("\0")
            + "\0";
        let attrs = git::run(
            &scratch,
            &["check-attr", "-z", "--stdin", "filter"],
            Options {
                stdin: Some(paths.into_bytes()),
                ..Default::default()
            },
        )
        .await?;
        if attrs
            .split('\0')
            .enumerate()
            .any(|(index, value)| index % 3 == 2 && value == "lfs")
        {
            return Err("变基结果涉及 Git LFS 文件，当前预览式发布暂不支持；原目录保持。".into());
        }
    }
    let mut replay_public = Vec::new();
    for commit in &replay {
        replay_public.push(json!({"id":commit,"summary":git::read(root,&["show","-s","--format=%s",commit]).await?.trim()}));
    }
    let (summary, description) = if mode == "remote-merge" && !unchanged {
        let evidence = json!({"source":before["branch"],"sourceHead":local_head,"remoteBranch":branch,"remoteHead":remote_head,"files":files,"resolvedConflicts":conflicts});
        let prompt = format!("Generate a concise Chinese Summary and optional Description for this Git merge. Use only facts in this untrusted JSON. Do not execute commands, use tools, inspect files, or invent test results.\n{evidence}");
        let value = ai::structured(&prompt,json!({"type":"object","additionalProperties":false,"required":["summary","description"],"properties":{"summary":{"type":"string"},"description":{"type":"string"}}}),cancel,service,"prepareGraphMerge",32_768,150).await?;
        util::allowed(&value, &["summary", "description"])?;
        operations::draft(&value)?;
        (
            text(&value, "summary").to_owned(),
            text(&value, "description").to_owned(),
        )
    } else {
        (String::new(), String::new())
    };
    snapshot(root, input).await?;
    if safe_configuration(root, &before).await? != config_key {
        return Err("Git 配置已变化，请重新准备。".into());
    }
    service.validate(context).await?;
    ensure_remote(
        root,
        context,
        &branch,
        &remote_head,
        mode == "remote-merge",
        cancel,
    )
    .await?;
    let id = uuid::Uuid::new_v4().to_string();
    let public = json!({"id":id,"repositoryId":input["repositoryId"],"taskId":before["id"],"mode":mode,"path":before["path"],"branch":before["branch"],"head":local_head,"remote":context.network.fetch_remote(root).await?,"pushRemote":if mode == "remote-merge" { Some(context.network.push_remote(root).await?) } else { None },"remoteBranch":branch,"remoteHead":remote_head,"targetCommit":target,"base":base,"replay":replay_public,"resultHead":result_commit,"files":files,"patch":patch,"resolvedConflicts":conflicts,"summary":summary,"description":description,"unchanged":unchanged});
    Ok(IntegrationPlan {
        public,
        created: util::now(),
        started: std::sync::atomic::AtomicBool::new(false),
        applied: std::sync::atomic::AtomicBool::new(false),
        restoring: std::sync::atomic::AtomicBool::new(false),
        root: root.to_owned(),
        before,
        mode: mode.into(),
        remote_branch: branch,
        remote_head,
        target_commit: target,
        result_commit,
        config_key,
        temporary,
    })
}

pub async fn apply(
    plan: &IntegrationPlan,
    input: &Value,
    service: &Service,
    context: &Context,
    cancel: &CancellationToken,
) -> Result<Value> {
    if plan.mode == "rebase" && input["acknowledgeRewrite"] != true {
        return Err("请确认变基会改写本地提交及可能已发布的历史。".into());
    }
    if plan.mode == "remote-merge" && plan.public["unchanged"] != true {
        operations::draft(input)?;
    }
    let expected = json!({"taskId":plan.before["id"],"expectedHead":plan.before["head"],"changeKey":plan.before["changeKey"]});
    snapshot(&plan.root, &expected).await?;
    if safe_configuration(&plan.root, &plan.before).await? != plan.config_key {
        return Err("Git 配置已变化，请重新准备。".into());
    }
    service.validate(context).await?;
    ensure_remote(
        &plan.root,
        context,
        &plan.remote_branch,
        &plan.remote_head,
        plan.mode == "remote-merge",
        cancel,
    )
    .await?;
    if plan.public["unchanged"] == true {
        return Ok(
            json!({"status":"unchanged","taskId":plan.before["id"],"head":plan.before["head"],"branch":plan.before["branch"]}),
        );
    }
    let scratch = plan.temporary.path().join("repository");
    git::run(
        &plan.root,
        &[
            "fetch",
            "--no-tags",
            "--no-auto-gc",
            "--no-write-fetch-head",
            "--",
            scratch.to_str().ok_or("预览路径无效。")?,
            &plan.result_commit,
        ],
        opts(cancel),
    )
    .await?;
    snapshot(&plan.root, &expected).await?;
    service.validate(context).await?;
    if cancel.is_cancelled() {
        return Err("操作已取消，本地和远端分支未修改。".into());
    }
    let recovery = format!("refs/gittogether/recovery/{}", text(&plan.public, "id"));
    if plan.mode == "remote-merge" {
        if context.link["authentication"] == "account"
            && context.repository["permissions"]["push"] == false
        {
            return Err("访问账号目前没有此仓库推送权限。".into());
        }
        let tree = git::read(
            &scratch,
            &["show", "-s", "--format=%T", &plan.result_commit],
        )
        .await?
        .trim()
        .to_owned();
        let message = format!(
            "{}\n\n{}\n",
            text(input, "summary").trim(),
            text(input, "description").trim()
        );
        let commit = util::sha(
            git::run(
                &plan.root,
                &[
                    "commit-tree",
                    &tree,
                    "-p",
                    &plan.remote_head,
                    "-p",
                    text(&plan.before, "head"),
                ],
                Options {
                    stdin: Some(message.into_bytes()),
                    ..opts(cancel)
                },
            )
            .await?
            .trim(),
        )?;
        let create = format!("create {recovery} {commit}\n");
        git::run(
            &plan.root,
            &["update-ref", "--stdin"],
            Options {
                stdin: Some(create.into_bytes()),
                ..opts(cancel)
            },
        )
        .await?;
        let mut value = json!({"status":"created-not-pushed","taskId":plan.before["id"],"head":plan.before["head"],"branch":plan.before["branch"],"commitId":commit,"recoveryRef":recovery,"remoteBranch":plan.remote_branch});
        if snapshot(&plan.root, &expected).await.is_err()
            || service.validate(context).await.is_err()
        {
            value["warning"] =
                json!("合并提交已保存在恢复引用，但本地状态已变化；尚未推送，请检查后重新准备。");
            return Ok(value);
        }
        if ensure_remote(
            &plan.root,
            context,
            &plan.remote_branch,
            &plan.remote_head,
            true,
            cancel,
        )
        .await
        .is_err()
        {
            value["warning"] =
                json!("合并提交已保存在恢复引用，但远端状态已变化或无法确认；尚未推送。");
            return Ok(value);
        }
        let push = match context.network.for_push(&plan.root).await {
            Ok(push) => push,
            Err(error) => {
                value["warning"] = json!(format!("{error} 合并提交保存在恢复引用；尚未推送。"));
                return Ok(value);
            }
        };
        let reference = format!("refs/heads/{}", plan.remote_branch);
        let refspec = format!("{commit}:{reference}");
        // Once the push starts, its outcome must be read back rather than replayed.
        let pushed = push
            .run(
                &plan.root,
                &[
                    "push",
                    "--porcelain",
                    "--no-follow-tags",
                    "--recurse-submodules=no",
                    "--",
                    &push.url,
                    &refspec,
                ],
                None,
                true,
                true,
                1800,
            )
            .await;
        let observed = remote_head(
            &plan.root,
            &push,
            &plan.remote_branch,
            &CancellationToken::new(),
        )
        .await;
        match (pushed, observed) {
            (_, Ok(head)) if head == commit => {
                value["status"] = json!("pushed");
                value["remoteHead"] = json!(head);
            }
            (Err(error), Ok(_))
                if error.starts_with(git::NON_FAST_FORWARD)
                    || error.starts_with("远端规则拒绝")
                    || error.starts_with("远端拒绝推送")
                    || error.starts_with("远端拒绝访问") =>
            {
                value["status"] = json!("created-not-pushed");
                value["warning"] = json!(format!("{error} 合并提交保留在恢复引用；未强制推送。"));
            }
            (error, _) => {
                value["status"] = json!("unknown");
                value["warning"] = json!(format!(
                    "{}无法确认远端结果；请先检查远端和恢复引用，不要重复推送。",
                    error.err().map(|e| format!("{e} ")).unwrap_or_default()
                ));
            }
        }
        return Ok(value);
    }
    let index = PathBuf::from(
        git::read(
            &plan.root,
            &["rev-parse", "--path-format=absolute", "--git-path", "index"],
        )
        .await?
        .trim(),
    );
    let head_file = PathBuf::from(
        git::read(
            &plan.root,
            &["rev-parse", "--path-format=absolute", "--git-path", "HEAD"],
        )
        .await?
        .trim(),
    );
    let mut index_lock =
        operations::IndexLock::take(PathBuf::from(format!("{}.lock", index.display())))?;
    let head_lock =
        operations::IndexLock::take(PathBuf::from(format!("{}.lock", head_file.display())))
            .map_err(|_| "工作目录 HEAD 正在使用，请稍后重试。")?;
    snapshot(&plan.root, &expected).await?;
    let full_branch = format!("refs/heads/{}", text(&plan.before, "branch"));
    if git::read(&plan.root, &["symbolic-ref", "--quiet", "HEAD"])
        .await?
        .trim()
        != full_branch
    {
        return Err("当前分支已变化，未应用变基。".into());
    }
    let tree = git::read(
        &scratch,
        &["show", "-s", "--format=%T", &plan.result_commit],
    )
    .await?
    .trim()
    .to_owned();
    let temp_index = tempfile::Builder::new()
        .prefix(".gittogether-rebase-index-")
        .tempdir_in(index.parent().ok_or("暂存区路径无效。")?)
        .map_err(|_| "无法创建临时暂存区。")?;
    let private = temp_index.path().join("index");
    let env = vec![(
        "GIT_INDEX_FILE".into(),
        private.to_string_lossy().into_owned(),
    )];
    git::run(
        &plan.root,
        &["read-tree", &tree],
        Options {
            environment: env,
            ..opts(cancel)
        },
    )
    .await?;
    let changed = changed_files(
        &scratch,
        text(&plan.before, "head"),
        &plan.result_commit,
        cancel,
    )
    .await?;
    let paths = git::read(
        &plan.root,
        &[
            "ls-tree",
            "-r",
            "--name-only",
            "-z",
            text(&plan.before, "head"),
        ],
    )
    .await?;
    let before_paths: BTreeSet<String> = paths
        .split('\0')
        .filter(|path| !path.is_empty())
        .map(str::to_owned)
        .collect();
    let mut publication = FilePublication::staged(&plan.root, &scratch, &changed)?;
    snapshot(&plan.root, &expected).await?;
    service.validate(context).await?;
    ensure_remote(
        &plan.root,
        context,
        &plan.remote_branch,
        &plan.remote_head,
        false,
        cancel,
    )
    .await?;
    if cancel.is_cancelled() {
        return Err("AI Rebase 已取消，本地分支未修改。".into());
    }
    let create = format!("create {recovery} {}\n", text(&plan.before, "head"));
    git::run(
        &plan.root,
        &["update-ref", "--stdin"],
        Options {
            stdin: Some(create.into_bytes()),
            ..opts(cancel)
        },
    )
    .await?;
    if let Err(error) = publication.publish(&changed, &before_paths) {
        if let Err(rollback) = publication.rollback() {
            let saved = publication.preserve();
            return Err(format!(
                "{error} {rollback} 原文件保存在 {}，恢复引用为 {recovery}。",
                saved.display()
            ));
        }
        return Err(error);
    }
    // Git's update-ref must acquire HEAD.lock itself for its reflog. The index
    // remains locked so normal checkout cannot change worktrees during handoff.
    drop(head_lock);
    let update = git::run(
        &plan.root,
        &[
            "update-ref",
            "-m",
            "GitTogether AI rebase",
            &full_branch,
            &plan.result_commit,
            text(&plan.before, "head"),
        ],
        Options {
            write: true,
            timeout: 120,
            ..Default::default()
        },
    )
    .await;
    if let Err(error) = update {
        if let Err(rollback) = publication.rollback() {
            let saved = publication.preserve();
            return Err(format!(
                "{error} {rollback} 原文件保存在 {}，恢复引用为 {recovery}。",
                saved.display()
            ));
        }
        return Err(format!("{error} 分支未更新，工作文件已恢复。"));
    }
    let mut result = json!({"status":"rebased","taskId":plan.before["id"],"head":plan.result_commit,"branch":plan.before["branch"],"recoveryRef":recovery,"targetCommit":plan.target_commit});
    if git::read(&plan.root, &["symbolic-ref", "--quiet", "HEAD"])
        .await
        .map(|s| s.trim().to_owned())
        .ok()
        .as_deref()
        != Some(full_branch.as_str())
    {
        let backup = publication.preserve();
        result["status"] = json!("partial");
        result["warning"] = json!(format!(
            "更新时当前分支发生变化；原文件备份保存在 {}，请检查恢复引用和 Git 状态。",
            backup.display()
        ));
        return Ok(result);
    }
    let publish = fs::read(&private)
        .map_err(|_| "变基暂存区无法读取。".to_owned())
        .and_then(|bytes| index_lock.publish(&index, &bytes));
    if publish.is_err() {
        let backup = publication.preserve();
        result["status"] = json!("partial");
        result["warning"] = json!(format!(
            "分支已更新但暂存区未发布；原文件备份保存在 {}，请检查恢复引用和 Git 状态。",
            backup.display()
        ));
    }
    Ok(result)
}

/// Restore only this plan's exact result, while protecting new user work.
pub async fn restore(
    plan: &IntegrationPlan,
    input: &Value,
    service: &Service,
    context: &Context,
    cancel: &CancellationToken,
) -> Result<Value> {
    if plan.mode != "rebase" || input["acknowledgeRestore"] != true {
        return Err("请明确确认恢复变基前的本地分支。".into());
    }
    let current = git::task(&plan.root).await?;
    if current["id"] != plan.before["id"]
        || current["branch"] != plan.before["branch"]
        || current["head"] != plan.result_commit
    {
        return Err("当前分支或提交已变化，未恢复；请手动检查恢复引用。".into());
    }
    let expected = json!({"taskId":current["id"],"expectedHead":current["head"],"changeKey":current["changeKey"]});
    snapshot(&plan.root, &expected).await?;
    if safe_configuration(&plan.root, &current).await? != plan.config_key {
        return Err("Git 配置已变化，未恢复；请检查恢复引用。".into());
    }
    service.validate(context).await?;
    let scratch = plan.temporary.path().join("repository");
    git::run(
        &scratch,
        &[
            "checkout",
            "--detach",
            "--quiet",
            text(&plan.before, "head"),
        ],
        Options {
            environment: vec![("GIT_LFS_SKIP_SMUDGE".into(), "1".into())],
            ..opts(cancel)
        },
    )
    .await?;
    let index = PathBuf::from(
        git::read(
            &plan.root,
            &["rev-parse", "--path-format=absolute", "--git-path", "index"],
        )
        .await?
        .trim(),
    );
    let head_file = PathBuf::from(
        git::read(
            &plan.root,
            &["rev-parse", "--path-format=absolute", "--git-path", "HEAD"],
        )
        .await?
        .trim(),
    );
    let mut index_lock =
        operations::IndexLock::take(PathBuf::from(format!("{}.lock", index.display())))?;
    let head_lock =
        operations::IndexLock::take(PathBuf::from(format!("{}.lock", head_file.display())))
            .map_err(|_| "工作目录 HEAD 正在使用，请稍后重试。")?;
    snapshot(&plan.root, &expected).await?;
    let full_branch = format!("refs/heads/{}", text(&plan.before, "branch"));
    if git::read(&plan.root, &["symbolic-ref", "--quiet", "HEAD"])
        .await?
        .trim()
        != full_branch
    {
        return Err("当前分支已变化，未恢复。".into());
    }
    let tree = git::read(
        &plan.root,
        &["show", "-s", "--format=%T", text(&plan.before, "head")],
    )
    .await?
    .trim()
    .to_owned();
    let temp_index = tempfile::Builder::new()
        .prefix(".gittogether-restore-index-")
        .tempdir_in(index.parent().ok_or("暂存区路径无效。")?)
        .map_err(|_| "无法创建临时暂存区。")?;
    let private = temp_index.path().join("index");
    git::run(
        &plan.root,
        &["read-tree", &tree],
        Options {
            environment: vec![(
                "GIT_INDEX_FILE".into(),
                private.to_string_lossy().into_owned(),
            )],
            ..opts(cancel)
        },
    )
    .await?;
    let changed = changed_files(
        &scratch,
        &plan.result_commit,
        text(&plan.before, "head"),
        cancel,
    )
    .await?;
    let paths = git::read(
        &plan.root,
        &["ls-tree", "-r", "--name-only", "-z", &plan.result_commit],
    )
    .await?;
    let before_paths: BTreeSet<String> = paths
        .split('\0')
        .filter(|p| !p.is_empty())
        .map(str::to_owned)
        .collect();
    let mut publication = FilePublication::staged(&plan.root, &scratch, &changed)?;
    snapshot(&plan.root, &expected).await?;
    service.validate(context).await?;
    if cancel.is_cancelled() {
        return Err("恢复已取消，分支未修改。".into());
    }
    let recovery = format!(
        "refs/gittogether/recovery/{}-rebased",
        text(&plan.public, "id")
    );
    let create = format!("create {recovery} {}\n", plan.result_commit);
    git::run(
        &plan.root,
        &["update-ref", "--stdin"],
        Options {
            stdin: Some(create.into_bytes()),
            ..opts(cancel)
        },
    )
    .await?;
    if let Err(error) = publication.publish(&changed, &before_paths) {
        if let Err(rollback) = publication.rollback() {
            let saved = publication.preserve();
            return Err(format!(
                "{error} {rollback} 原文件备份在 {}，恢复引用为 {recovery}。",
                saved.display()
            ));
        }
        return Err(error);
    }
    drop(head_lock);
    let update = git::run(
        &plan.root,
        &[
            "update-ref",
            "-m",
            "GitTogether restore AI rebase",
            &full_branch,
            text(&plan.before, "head"),
            &plan.result_commit,
        ],
        Options {
            write: true,
            timeout: 120,
            ..Default::default()
        },
    )
    .await;
    if let Err(error) = update {
        if let Err(rollback) = publication.rollback() {
            let saved = publication.preserve();
            return Err(format!(
                "{error} {rollback} 原文件备份在 {}，恢复引用为 {recovery}。",
                saved.display()
            ));
        }
        return Err(format!("{error} 分支未更新，工作文件已恢复。"));
    }
    let mut result = json!({"status":"restored","taskId":current["id"],"head":plan.before["head"],"branch":current["branch"],"recoveryRef":recovery});
    if git::read(&plan.root, &["symbolic-ref", "--quiet", "HEAD"])
        .await
        .map(|s| s.trim().to_owned())
        .ok()
        .as_deref()
        != Some(full_branch.as_str())
    {
        let saved = publication.preserve();
        result["status"] = json!("partial");
        result["warning"] = json!(format!(
            "恢复时当前分支发生变化；原文件备份在 {}，请检查 Git 状态。",
            saved.display()
        ));
        return Ok(result);
    }
    if fs::read(&private)
        .map_err(|_| "暂存区无法读取。".to_owned())
        .and_then(|bytes| index_lock.publish(&index, &bytes))
        .is_err()
    {
        let saved = publication.preserve();
        result["status"] = json!("partial");
        result["warning"] = json!(format!(
            "分支已恢复但暂存区未发布；原文件备份在 {}，请检查 Git 状态。",
            saved.display()
        ));
    }
    Ok(result)
}
