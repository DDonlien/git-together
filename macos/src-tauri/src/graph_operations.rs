use crate::{git::{self, Options}, operations, service::{Context, Service}, util::{self, text, Result}};
use serde_json::{json, Value};
use std::path::Path;
use tokio_util::sync::CancellationToken;

fn opts(cancel: &CancellationToken) -> Options {
    Options {
        write: true,
        cancel: Some(cancel.clone()),
        timeout: 120,
        ..Default::default()
    }
}
async fn snapshot(root: &Path, input: &Value) -> Result<Value> {
    let task = git::task(root).await?;
    if task["id"] != input["taskId"]
        || task["head"] != input["expectedHead"]
        || task["changeKey"] != input["changeKey"]
    {
        return Err("工作目录、HEAD 或文件更改已变化，请重新准备。".into());
    }
    if task["branch"] == "Detached HEAD" || text(&task, "head").bytes().all(|b| b == b'0') {
        return Err("请先在有提交的本地分支中执行这个操作。".into());
    }
    operations::idle(root).await?;
    if task["files"]
        .as_array()
        .unwrap()
        .iter()
        .any(|f| text(f, "status").contains('U') || matches!(text(f, "status"), "AA" | "DD"))
    {
        return Err("当前工作目录已有冲突，请先完成或中止原操作。".into());
    }
    Ok(task)
}
async fn ensure_commit(
    root: &Path,
    id: &str,
    service: &Service,
    context: &Context,
    cancel: &CancellationToken,
) -> Result<String> {
    let id = util::sha(id)?;
    if git::read(root, &["cat-file", "-e", &format!("{id}^{{commit}}")])
        .await
        .is_ok()
    {
        return Ok(id);
    }
    let workspace = service.graph_workspace(context, cancel).await?;
    for task in workspace["tasks"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|t| t["error"] == "")
    {
        let source = service.task_root(context, text(task, "id")).await?;
        if git::read(&source, &["cat-file", "-e", &format!("{id}^{{commit}}")])
            .await
            .is_ok()
        {
            git::run(
                root,
                &[
                    "fetch",
                    "--no-tags",
                    "--no-auto-gc",
                    "--no-write-fetch-head",
                    "--",
                    source.to_str().ok_or("工作目录路径无效。")?,
                    &id,
                ],
                opts(cancel),
            )
            .await?;
            return Ok(id);
        }
    }
    let commit = context
        .provider
        .commit(&context.repository, &id, cancel)
        .await?;
    if commit["id"] != id {
        return Err("远端提交身份不一致。".into());
    }
    context
        .network
        .run(
            root,
            &[
                "fetch",
                "--no-tags",
                "--no-auto-gc",
                "--no-write-fetch-head",
                "--recurse-submodules=no",
                "--",
                &context.network.url,
                &id,
            ],
            Some(cancel.clone()),
            false,
            false,
            120,
        )
        .await?;
    Ok(id)
}
pub async fn preview(
    root: &Path,
    input: &Value,
    service: &Service,
    context: &Context,
    cancel: &CancellationToken,
) -> Result<Value> {
    let before = snapshot(root, input).await?;
    let commit = ensure_commit(root, text(input, "commitId"), service, context, cancel).await?;
    let head = text(input, "expectedHead");
    let base = if matches!(text(input, "action"), "cherry-pick" | "revert") {
        let parents = git::read(root, &["show", "-s", "--format=%P", &commit]).await?;
        let parents: Vec<_> = parents.split_whitespace().collect();
        if parents.len() > 1 {
            let at = input["mainline"]
                .as_u64()
                .filter(|v| *v > 0 && *v <= parents.len() as u64)
                .ok_or("合并提交需要选择比较的父提交。")?;
            parents[at as usize - 1].to_owned()
        } else if let Some(parent) = parents.first() {
            (*parent).into()
        } else {
            git::run(
                root,
                &["hash-object", "-w", "-t", "tree", "--stdin"],
                Options {
                    stdin: Some(Vec::new()),
                    write: true,
                    ..Default::default()
                },
            )
            .await?
            .trim()
            .to_owned()
        }
    } else {
        head.into()
    };
    let (from, to) = if text(input, "action") == "revert" {
        (commit.as_str(), base.as_str())
    } else {
        (base.as_str(), commit.as_str())
    };
    let patch = git::run(
        root,
        &[
            "diff",
            "--no-ext-diff",
            "--no-textconv",
            "--binary",
            "--no-renames",
            from,
            to,
            "--",
        ],
        Options {
            cancel: Some(cancel.clone()),
            ..Default::default()
        },
    )
    .await?;
    let files = changed_files(root, from, to, cancel).await?;
    snapshot(root, input).await?;
    service.validate(context).await?;
    Ok(
        json!({"files":files,"patch":patch,"head":head,"commitId":commit,"localChanges":before["files"]}),
    )
}
async fn changed_files(
    root: &Path,
    from: &str,
    to: &str,
    cancel: &CancellationToken,
) -> Result<Vec<Value>> {
    let output = git::run(
        root,
        &[
            "diff",
            "--no-ext-diff",
            "--no-textconv",
            "--name-status",
            "--no-renames",
            "-z",
            from,
            to,
            "--",
        ],
        Options {
            cancel: Some(cancel.clone()),
            ..Default::default()
        },
    )
    .await?;
    let fields: Vec<_> = output.split('\0').filter(|s| !s.is_empty()).collect();
    if fields.len() % 2 != 0 {
        return Err("Git 差异清单不完整。".into());
    }
    fields
        .chunks(2)
        .map(|pair| Ok(json!({"status":pair[0],"path":util::file_path(pair[1])?,"tracked":true})))
        .collect()
}
async fn working_tree(
    root: &Path,
    task: &Value,
    directory: &Path,
    cancel: &CancellationToken,
) -> Result<String> {
    let index = directory.join("working-index");
    let env = vec![
        (
            "GIT_INDEX_FILE".into(),
            index.to_string_lossy().into_owned(),
        ),
        ("GIT_LITERAL_PATHSPECS".into(), "1".into()),
    ];
    git::run(
        root,
        &["read-tree", text(task, "head")],
        Options {
            environment: env.clone(),
            ..opts(cancel)
        },
    )
    .await?;
    let files: Vec<_> = task["files"].as_array().unwrap().iter().collect();
    let paths = operations::selected_paths(&files);
    if !paths.is_empty() {
        let mut args = vec!["add", "--all", "--"];
        args.extend(paths.iter().map(String::as_str));
        git::run(
            root,
            &args,
            Options {
                environment: env.clone(),
                ..opts(cancel)
            },
        )
        .await?;
    }
    Ok(git::run(
        root,
        &["write-tree"],
        Options {
            environment: env,
            ..opts(cancel)
        },
    )
    .await?
    .trim()
    .into())
}
async fn temporary_commit(
    root: &Path,
    tree: &str,
    parents: &[String],
    cancel: &CancellationToken,
) -> Result<String> {
    let mut args = vec![
        "-c",
        "user.name=GitTogether Preview",
        "-c",
        "user.email=preview@gittogether.invalid",
        "commit-tree",
        tree,
    ];
    for parent in parents {
        args.extend(["-p", parent.as_str()]);
    }
    Ok(git::run(
        root,
        &args,
        Options {
            stdin: Some(b"GitTogether isolated preview\n".to_vec()),
            ..opts(cancel)
        },
    )
    .await?
    .trim()
    .into())
}
pub async fn execute(
    root: &Path,
    input: &Value,
    service: &Service,
    context: &Context,
    cancel: &CancellationToken,
) -> Result<Value> {
    let action = text(input, "action");
    if !matches!(action, "checkout" | "branch" | "tag" | "cherry-pick" | "revert" | "merge" | "rebase" | "reset" | "abort") {
        return Err("不支持这个 Git 操作。".into());
    }
    if action == "abort" {
        let current = git::task(root).await?;
        if current["id"] != input["taskId"]
            || current["head"] != input["expectedHead"]
            || current["changeKey"] != input["changeKey"]
        {
            return Err("当前 Git 操作状态已变化，请重新打开中止操作。".into());
        }
        service.validate(context).await?;
        let states = [
            ("MERGE_HEAD", "merge"),
            ("CHERRY_PICK_HEAD", "cherry-pick"),
            ("REVERT_HEAD", "revert"),
            ("rebase-merge", "rebase"),
            ("rebase-apply", "rebase"),
        ];
        for (state, verb) in states {
            let path = git::read(
                root,
                &["rev-parse", "--path-format=absolute", "--git-path", state],
            )
            .await?;
            if Path::new(path.trim()).exists() {
                git::run(root, &[verb, "--abort"], opts(cancel)).await?;
                let t = git::task(root).await?;
                return Ok(
                    json!({"taskId":t["id"],"head":t["head"],"branch":t["branch"],"unchanged":false}),
                );
            }
        }
        return Err("当前没有需要中止的 Git 操作。".into());
    }
    let before = snapshot(root, input).await?;
    let commit = ensure_commit(root, text(input, "commitId"), service, context, cancel).await?;
    let name = text(input, "name");
    let mut recovery_ref = None;
    let args: Vec<String> = match action {
        "checkout" => {
            if !before["files"].as_array().unwrap().is_empty() {
                return Err("切换分支前请先提交或处理当前更改。".into());
            }
            if name.starts_with('-') || git::read(root, &["check-ref-format", "--branch", name]).await?.trim() != name {
                return Err("分支名称无效。".into());
            }
            let tip = git::read(root, &["show-ref", "--verify", "--hash", &format!("refs/heads/{name}")]).await?;
            if tip.trim() != commit {
                return Err("目标分支已变化或所选提交不是分支最新提交，请刷新。".into());
            }
            vec!["switch".into(), "--no-guess".into(), name.into()]
        }
        "branch" => {
            if name.starts_with('-')
                || git::read(root, &["check-ref-format", "--branch", name])
                    .await?
                    .trim()
                    != name
            {
                return Err("新分支名称无效。".into());
            }
            vec!["branch".into(), name.into(), commit]
        }
        "tag" => {
            if name.starts_with('-') {
                return Err("标签名称无效。".into());
            }
            git::read(root, &["check-ref-format", &format!("refs/tags/{name}")]).await?;
            vec!["tag".into(), name.into(), commit]
        }
        "cherry-pick" | "revert" => {
            if !before["files"].as_array().unwrap().is_empty() {
                return Err("请先处理目标工作目录的未提交更改。".into());
            }
            let p = git::read(root, &["show", "-s", "--format=%P", &commit]).await?;
            let mut args = vec![action.into()];
            if action == "revert" {
                args.push("--no-edit".into());
            }
            if p.split_whitespace().count() > 1 {
                let n = input["mainline"]
                    .as_u64()
                    .filter(|n| *n > 0 && *n <= p.split_whitespace().count() as u64)
                    .ok_or("请选择合并提交的父提交。")?;
                args.extend(["--mainline".into(), n.to_string()]);
            }
            args.push(commit);
            args
        }
        "merge" | "rebase" => {
            if !before["files"].as_array().unwrap().is_empty() {
                return Err("请先处理目标工作目录的未提交更改。".into());
            }
            let mut args = vec![action.into()];
            if action == "merge" {
                args.push("--no-edit".into());
            }
            args.push(commit);
            args
        }
        "reset" => {
            let mode = text(input, "resetMode");
            if !matches!(mode, "soft" | "mixed" | "hard") {
                return Err("Reset 模式无效。".into());
            }
            let backup = tempfile::tempdir().map_err(|_| "无法保存恢复点。")?;
            let tree = working_tree(root, &before, backup.path(), cancel).await?;
            let saved =
                temporary_commit(root, &tree, &[text(&before, "head").into()], cancel).await?;
            let recovery = format!("refs/gittogether/recovery/{}", text(input, "operationId"));
            recovery_ref = Some(recovery.clone());
            git::run(
                root,
                &[
                    "update-ref",
                    "-m",
                    "GitTogether reset recovery",
                    &recovery,
                    &saved,
                ],
                opts(cancel),
            )
            .await?;
            vec!["reset".into(), format!("--{mode}"), commit]
        }
        _ => return Err("不支持这个 Git 操作。".into()),
    };
    snapshot(root, input).await?;
    service.validate(context).await?;
    let feedback = git::run(
        root,
        &args.iter().map(String::as_str).collect::<Vec<_>>(),
        opts(cancel),
    )
    .await;
    let after = git::task(root).await?;
    if let Err(error) = feedback {
        if operations::idle(root).await.is_err() {
            return Err(format!(
                "{error} Git 保留了正在进行的 {action}；请解决冲突后继续，或中止当前操作。"
            ));
        }
        if after["head"] == before["head"] {
            return Err(format!(
                "{error} 如 Git 留下冲突，可解决后继续或选择中止当前操作。"
            ));
        }
        return Ok(
            json!({"taskId":after["id"],"head":after["head"],"branch":after["branch"],"unchanged":false,"warning":"Git 已更新 HEAD，但后续反馈未完成；请检查实际历史，不要重复执行。"}),
        );
    }
    let mut result = json!({"taskId":after["id"],"head":after["head"],"branch":after["branch"],"unchanged":after["head"]==before["head"] && after["branch"]==before["branch"]});
    if let Some(recovery) = recovery_ref {
        result["recoveryRef"] = json!(recovery);
    }
    Ok(result)
}
