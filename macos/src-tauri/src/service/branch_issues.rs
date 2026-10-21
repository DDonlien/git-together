use super::*;
use std::collections::BTreeSet;

fn strings(value: &Value) -> BTreeSet<String> {
    value
        .as_array()
        .into_iter()
        .flatten()
        .map(|value| value.as_str().unwrap().to_owned())
        .collect()
}
fn string_list(value: &Value) -> bool {
    value
        .as_array()
        .is_some_and(|rows| rows.iter().all(Value::is_string))
}
pub(super) fn valid_state(value: &Value) -> bool {
    (value["branchSnapshots"].is_null()
        || value["branchSnapshots"]
            .as_object()
            .is_some_and(|snapshots| {
                snapshots.values().all(|snapshot| {
                    snapshot["url"].is_string()
                        && ["current", "known", "checked"]
                            .iter()
                            .all(|key| string_list(&snapshot[key]))
                })
            }))
        && (value["branchIssues"].is_null()
            || value["branchIssues"].as_array().is_some_and(|issues| {
                issues.iter().all(|issue| {
                    util::valid_sha(text(issue, "id"))
                        && issue["repositoryId"].is_string()
                        && issue["branch"].is_string()
                        && matches!(
                            text(issue, "kind"),
                            "remote-missing" | "both-missing" | "local-missing"
                        )
                        && string_list(&issue["paths"])
                })
            }))
}

fn issue_roots(link: &Value) -> Result<Vec<Value>> {
    let directories = roots(link)?;
    if directories.is_empty() && !text(link, "path").is_empty() {
        return Ok(vec![json!({"branch":"", "path":link["path"]})]);
    }
    Ok(directories)
}

fn issues_for(catalog: &Value, snapshots: &Value) -> Value {
    let mut issues = Vec::new();
    for repository in catalog["repositories"].as_array().unwrap() {
        let id = text(repository, "id");
        let saved = &snapshots[id];
        let empty = Value::Null;
        let snapshot = if saved["url"] == repository["url"] {
            saved
        } else {
            &empty
        };
        let current = strings(&snapshot["current"]);
        let known = strings(&snapshot["known"]);
        let checked = strings(&snapshot["checked"]);
        let mut paths_by_branch = BTreeMap::<String, BTreeSet<String>>::new();
        for link in catalog["links"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|link| text(link, "repositoryId") == id)
        {
            for item in issue_roots(link).unwrap() {
                let branch = if text(&item, "branch").is_empty() {
                    "未读取分支"
                } else {
                    text(&item, "branch")
                };
                paths_by_branch
                    .entry(branch.into())
                    .or_default()
                    .insert(text(&item, "path").into());
            }
        }
        let branches: BTreeSet<_> = known
            .iter()
            .cloned()
            .chain(paths_by_branch.keys().cloned())
            .collect();
        for branch in branches {
            let paths = paths_by_branch.get(&branch).cloned().unwrap_or_default();
            let missing: BTreeSet<_> = paths
                .iter()
                .filter(|path| missing_directory(path))
                .cloned()
                .collect();
            // A never-published local branch is not a deleted remote branch.
            let remote_missing = !matches!(branch.as_str(), "未读取分支" | "Detached HEAD")
                && checked.contains(&branch)
                && !current.contains(&branch)
                && (known.contains(&branch) || !paths.is_empty() && missing.len() == paths.len());
            let (kind, paths) = if remote_missing {
                (
                    if paths.is_empty() || missing.len() == paths.len() {
                        "both-missing"
                    } else {
                        "remote-missing"
                    },
                    paths,
                )
            } else if !missing.is_empty() {
                ("local-missing", missing)
            } else {
                continue;
            };
            let mut issue = json!({"repositoryId":id,"branch":branch,"kind":kind,"paths":paths});
            issue["id"] = json!(util::digest(issue.to_string()));
            issues.push(issue);
        }
    }
    json!(issues)
}

fn local_identity(repository: &Value, link: &Value) -> String {
    util::digest(json!([repository["url"], link]).to_string())
}

impl Service {
    pub(super) async fn observe_local_branches(&self, context: &Context, tasks: &[Value]) {
        let identity = local_identity(&context.repository, &context.link);
        let mut observed = self.local_branches.lock().await;
        let entry = observed
            .entry(text(&context.repository, "id").into())
            .or_insert_with(|| (identity.clone(), BTreeMap::new()));
        if entry.0 != identity {
            *entry = (identity, BTreeMap::new());
        }
        for task in tasks.iter().filter(|task| text(task, "error").is_empty()) {
            entry
                .1
                .insert(text(task, "path").into(), text(task, "branch").into());
        }
    }

    pub(super) async fn update_branch_issues(&self, cancel: &CancellationToken) -> Result<()> {
        let (catalog, snapshots) = {
            let state = self.state.read().await;
            if !state.error.is_empty() {
                return Err(state.error.clone());
            }
            (
                self.catalog_value(&state),
                state.value["branchSnapshots"].clone(),
            )
        };
        let mut inspected_catalog = catalog.clone();
        let local_branches = self.local_branches.lock().await.clone();
        // Reuse actual HEAD observations from the existing local reader.
        // Catalog polling only probes filesystem metadata, never repeats Git scans.
        for link in inspected_catalog["links"].as_array_mut().unwrap() {
            if let Some(repository) = catalog["repositories"]
                .as_array()
                .unwrap()
                .iter()
                .find(|repository| repository["id"] == link["repositoryId"])
            {
                if let Some((identity, branches)) = local_branches.get(text(repository, "id")) {
                    if *identity == local_identity(repository, link) {
                        let mut directories = issue_roots(link)?;
                        for item in &mut directories {
                            if let Some(branch) = branches.get(text(item, "path")) {
                                item["branch"] = json!(branch);
                            }
                        }
                        link["worktrees"] = json!(directories);
                    }
                }
            }
        }
        let inspected_snapshots = snapshots.clone();
        let issues = tokio::task::spawn_blocking(move || {
            issues_for(&inspected_catalog, &inspected_snapshots)
        })
        .await
        .map_err(|_| "分支状态检查未完成。".to_string())?;
        self.mutate(|next| {
            if cancel.is_cancelled() {
                return Err("分支状态检查已取消。".into());
            }
            // Concurrent relinking or a newer remote observation owns the next scan.
            if next["links"] != catalog["links"]
                || next["repositories"] != catalog["repositories"]
                || next["branchSnapshots"] != snapshots
            {
                return Ok(());
            }
            if next["branchIssues"].is_null() && issues.as_array().unwrap().is_empty() {
                return Ok(());
            }
            next["branchIssues"] = issues;
            Ok(())
        })
        .await?;
        Ok(())
    }

    pub(super) async fn observe_branch_presence(
        &self,
        context: &Context,
        checked: &[String],
        present: &[String],
        historical: &[String],
        complete: bool,
        cancel: &CancellationToken,
    ) -> Result<()> {
        if cancel.is_cancelled() {
            return Err("分支检查已取消。".into());
        }
        self.mutate(|next| {
            check_context(next, context)?;
            if cancel.is_cancelled() { return Err("分支检查已取消。".into()); }
            let id = text(&context.repository, "id");
            let previous = &next["branchSnapshots"][id];
            let mut current = BTreeSet::new();
            let mut known = BTreeSet::new();
            let mut verified = BTreeSet::new();
            if previous["url"] == context.repository["url"] {
                current = strings(&previous["current"]); known = strings(&previous["known"]); verified = strings(&previous["checked"]);
            }
            if complete {
                current.clear();
                verified.extend(known.iter().cloned());
                if !context.link.is_null() {
                    for item in issue_roots(&context.link)? {
                        verified.insert(if text(&item, "branch").is_empty() { "未读取分支".into() } else { text(&item, "branch").into() });
                    }
                }
            } else {
                current.retain(|branch| !checked.contains(branch));
            }
            current.extend(present.iter().cloned());
            known.extend(present.iter().chain(historical).cloned());
            verified.extend(checked.iter().chain(present).chain(historical).cloned());
            if next["branchSnapshots"].is_null() { next["branchSnapshots"] = json!({}); }
            next["branchSnapshots"][id] = json!({"url":context.repository["url"],"current":current,"known":known,"checked":verified});
            Ok(())
        }).await?;
        self.update_branch_issues(cancel).await
    }

    pub(super) async fn dismiss_branch_issue(
        &self,
        context: &Context,
        issue_id: &str,
        cancel: &CancellationToken,
    ) -> Result<Value> {
        let before = self.catalog().await?;
        let issue = before["branchIssues"]
            .as_array()
            .unwrap()
            .iter()
            .find(|issue| {
                text(issue, "id") == issue_id && issue["repositoryId"] == context.repository["id"]
            })
            .cloned();
        let Some(issue) = issue else {
            return Ok(before);
        };
        // Acknowledge against freshly read local identities as well as the
        // remote list, so a switched/replaced directory keeps its association.
        if !context.link.is_null() {
            self.local_workspace(context, cancel).await?;
        }
        if text(&issue, "kind") != "local-missing" {
            let (branches, limited) = context
                .provider
                .branches(&context.repository, cancel)
                .await?;
            if limited {
                return Err("远端分支列表尚未完整读取，保留提示和关联，请稍后重试。".into());
            }
            let names: Vec<_> = branches.into_iter().map(|(name, _)| name).collect();
            self.observe_branch_presence(context, &names, &names, &[], true, cancel)
                .await?;
        } else {
            self.update_branch_issues(cancel).await?;
        }
        let mut removable = BTreeSet::new();
        for path in strings(&issue["paths"]) {
            if missing_directory(&path) {
                removable.insert(path);
                continue;
            }
            if text(&issue, "kind") == "remote-missing" {
                if let Ok(root) = self.validate_path(&context.repository, &path).await {
                    if git::read(&root, &["symbolic-ref", "--short", "HEAD"])
                        .await
                        .is_ok_and(|branch| branch.trim() == text(&issue, "branch"))
                    {
                        removable.insert(path);
                    }
                }
            }
        }
        self.mutate(|next| {
            check_context(next, context)?;
            if cancel.is_cancelled() {
                return Err("关闭分支提示已取消。".into());
            }
            let active = next["branchIssues"]
                .as_array()
                .is_some_and(|issues| issues.iter().any(|current| *current == issue));
            if !active {
                return Ok(());
            }
            let id = text(&context.repository, "id");
            let links = next["links"].as_array_mut().unwrap();
            if let Some(index) = links
                .iter()
                .position(|link| text(link, "repositoryId") == id)
            {
                let directories = issue_roots(&links[index])?;
                let retained: Vec<_> = directories
                    .iter()
                    .filter(|item| {
                        !removable.contains(text(item, "path"))
                            || text(&issue, "kind") != "remote-missing"
                                && !missing_directory(text(item, "path"))
                    })
                    .cloned()
                    .collect();
                if retained.len() != directories.len() {
                    if retained.is_empty() {
                        links.remove(index);
                    } else {
                        if !retained
                            .iter()
                            .any(|item| item["path"] == links[index]["path"])
                        {
                            links[index]["path"] = retained[0]["path"].clone();
                        }
                        links[index]["worktrees"] = json!(retained);
                    }
                }
            }
            if text(&issue, "kind") != "local-missing" {
                if let Some(known) = next["branchSnapshots"][id]["known"].as_array_mut() {
                    known.retain(|branch| *branch != issue["branch"]);
                }
            }
            next["branchIssues"]
                .as_array_mut()
                .unwrap()
                .retain(|current| text(current, "id") != issue_id);
            Ok(())
        })
        .await
    }
}
