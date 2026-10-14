use crate::{
    provider::Provider,
    util::{self, text, Result},
};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use tokio_util::sync::CancellationToken;

pub fn github_app(saved: &Value) -> bool {
    matches!(
        text(&saved["account"], "provider"),
        "github" | "github-enterprise"
    ) && (text(saved, "token").starts_with("ghu_")
        || text(saved, "token").starts_with("ghs_")
        || text(&saved["githubOAuth"], "clientId").starts_with("Iv"))
}

// Installation and repository lists are separate paged envelopes. Only a
// complete response can prove that a repository is outside the app's grant.
async fn pages(
    provider: &Provider,
    path: &str,
    field: &str,
    cancel: &CancellationToken,
) -> Result<Vec<Value>> {
    let mut records = BTreeMap::new();
    for page in 1..=100 {
        let page = page.to_string();
        let (value, headers) = provider
            .get(
                path,
                &[("per_page", "100"), ("page", &page)],
                "json",
                cancel,
            )
            .await?;
        let rows = value[field]
            .as_array()
            .ok_or("仓库授权列表返回格式无效。")?;
        let total = value["total_count"]
            .as_u64()
            .ok_or("仓库授权列表缺少总数。")?;
        let before = records.len();
        for row in rows {
            let id = row["id"].as_u64().ok_or("仓库授权列表包含无效身份。")?;
            records.insert(id, row.clone());
        }
        let more = headers
            .get("link")
            .and_then(|value| value.to_str().ok())
            .is_some_and(|link| link.contains("rel=\"next\"") || link.contains("rel=next"));
        if !more && records.len() as u64 >= total {
            return Ok(records.into_values().collect());
        }
        if records.len() == before {
            return Err("仓库授权分页未完整返回，尚不能确认授权范围。".into());
        }
    }
    Err("仓库授权检查超过10000条，尚不能确认完整范围。".into())
}

fn row(repo: &Value, authorization: &str, read: &str, write: &str, reason: &str) -> Value {
    json!({"repositoryId":repo["id"],"authorization":authorization,"read":read,"write":write,"reason":reason})
}

async fn app_access(
    saved: &Value,
    provider: &Provider,
    repositories: &[Value],
    cancel: &CancellationToken,
) -> Result<Vec<Value>> {
    if text(saved, "token").starts_with("ghs_") {
        let installed = pages(
            provider,
            "/installation/repositories",
            "repositories",
            cancel,
        )
        .await?;
        return Ok(repositories.iter().map(|repo| {
            if installed.iter().any(|item| item["id"] == repo["remoteId"]) {
                row(repo, "authorized", "unknown", "unknown", "安装令牌已授权此仓库；GitHub 未提供该令牌的 Contents 权限，请检查令牌配置。")
            } else {
                row(repo, "missing", if repo["private"] == false { "granted" } else { "denied" }, "denied", "此仓库不在应用安装令牌的授权范围内。")
            }
        }).collect());
    }
    let installations = pages(provider, "/user/installations", "installations", cancel).await?;
    if installations.is_empty() && repositories.is_empty() {
        return Err(
            "当前用户没有可访问的 GitHub App 安装，请在 GitHub 的应用安装设置中授予仓库访问。"
                .into(),
        );
    }
    let mut granted = BTreeMap::new();
    let mut errors = Vec::new();
    for installation in installations {
        let owner = text(&installation["account"], "login");
        if !repositories.iter().any(|repo| {
            text(repo, "fullName")
                .split('/')
                .next()
                .is_some_and(|value| value.eq_ignore_ascii_case(owner))
        }) {
            continue;
        }
        let id = installation["id"].as_u64().ok_or("应用安装身份无效。")?;
        match pages(
            provider,
            &format!("/user/installations/{id}/repositories"),
            "repositories",
            cancel,
        )
        .await
        {
            Ok(rows) => {
                if !installation["permissions"].is_object() {
                    return Err("应用安装权限返回格式无效。".into());
                }
                for raw in rows {
                    let id = raw["id"].as_u64().ok_or("应用仓库身份无效。")?;
                    granted.insert(id, (installation.clone(), raw));
                }
            }
            Err(error) => {
                if cancel.is_cancelled() {
                    return Err(error);
                }
                errors.push(error);
            }
        }
    }
    let failure = errors.join(" ");
    Ok(repositories.iter().map(|repo| {
        match repo["remoteId"].as_u64().and_then(|id| granted.get(&id)) {
            Some((installation, raw)) => {
                if !installation["suspended_at"].is_null() { return row(repo, "authorized", "denied", "denied", "GitHub App 的安装已暂停，请恢复安装授权。"); }
                let contents = text(&installation["permissions"], "contents");
                let read = if matches!(contents, "read" | "write") || repo["private"] == false { "granted" } else { "denied" };
                let (write, reason) = if contents != "write" {
                    ("denied", "应用已获仓库授权，但缺少 Contents 写权限；需由应用管理员修改权限，并由仓库所有者批准。")
                } else if raw["archived"] == true || raw["disabled"] == true {
                    ("denied", "仓库已归档或停用，无法写入。")
                } else {
                    match raw["permissions"]["push"].as_bool() {
                        Some(true) => ("granted", "应用具有 Contents 写权限，当前用户也有仓库写权限；分支保护仍可能限制推送。"),
                        Some(false) => ("denied", "应用具有 Contents 写权限，但当前用户没有此仓库的写权限。"),
                        None => ("unknown", "应用具有 Contents 写权限，但 GitHub 未返回当前用户的仓库写权限。"),
                    }
                };
                let mut value = row(repo, "authorized", read, write, reason);
                if contents == "write" && text(&installation["permissions"], "workflows") != "write" {
                    value["reason"] = json!(format!("{reason} 修改 GitHub Actions 工作流还需要 Workflows 写权限。"));
                }
                value
            }
            None if !failure.is_empty() => row(repo, "unknown", "unknown", "unknown", &format!("应用安装范围未能完整检查：{failure}")),
            None => row(repo, "missing", if repo["private"] == false { "granted" } else { "denied" }, "denied", "此仓库尚未授予 GitHub App 访问。公开仓库可以读取，但不代表应用可以推送。请在 GitHub 的应用安装设置中添加仓库。"),
        }
    }).collect())
}

pub async fn inspect(
    saved: &Value,
    provider: &Provider,
    repositories: &[Value],
    cancel: &CancellationToken,
) -> Result<Value> {
    let kind = if github_app(saved) {
        "github-app"
    } else if text(saved, "token").starts_with("gho_") {
        "oauth"
    } else if matches!(provider.kind(), "github" | "github-enterprise") {
        "token"
    } else {
        "provider"
    };
    let mut snapshot = json!({"accountId":saved["account"]["id"],"kind":kind,"checkedAt":util::iso(),"repositories":[]});
    let result = if kind == "github-app" {
        app_access(saved, provider, repositories, cancel).await
    } else if matches!(provider.kind(), "github" | "github-enterprise") {
        match provider.get("/user", &[], "json", cancel).await {
            Ok((_, headers)) => {
                let scopes = headers
                    .get("x-oauth-scopes")
                    .and_then(|value| value.to_str().ok());
                Ok(repositories.iter().map(|repo| {
                    let scope = scopes.map(|value| value.split(',').map(str::trim).any(|scope| scope == "repo" || scope == "public_repo" && repo["private"] == false));
                    let (write, reason) = match (scope, repo["permissions"]["push"].as_bool()) {
                        (_, Some(false)) => ("denied", "最近读取的仓库角色没有写权限。"),
                        (Some(false), _) => ("denied", "此 OAuth / 传统令牌的授权范围不包含该仓库的 Git 写操作。"),
                        (Some(true), Some(true)) => ("granted", "令牌授权范围及最近读取的仓库角色均允许写入；分支保护仍可能限制推送。"),
                        _ => ("unknown", "无法从账号登录或仓库读取确认此令牌的 Contents 写权限；请检查令牌的仓库范围与权限。"),
                    };
                    row(repo, "not-required", if repo["available"] == true { "granted" } else { "unknown" }, write, reason)
                }).collect())
            }
            Err(error) => Err(error),
        }
    } else {
        Ok(repositories
            .iter()
            .map(|repo| {
                row(
                    repo,
                    "not-required",
                    if repo["available"] == true {
                        "granted"
                    } else {
                        "unknown"
                    },
                    if repo["permissions"]["push"] == false {
                        "denied"
                    } else {
                        "unknown"
                    },
                    if repo["permissions"]["push"] == false {
                        "最近读取的仓库角色没有写权限。"
                    } else {
                        "仓库角色与令牌权限需同时允许写入；当前服务没有提供令牌写权限信息。"
                    },
                )
            })
            .collect())
    };
    match result {
        Ok(rows) => snapshot["repositories"] = json!(rows),
        Err(error) => {
            if cancel.is_cancelled() {
                return Err(error);
            }
            snapshot["repositories"] = json!(repositories
                .iter()
                .map(|repo| row(
                    repo,
                    "unknown",
                    "unknown",
                    "unknown",
                    "授权检查未完成，请查看检查错误并重试。"
                ))
                .collect::<Vec<_>>());
            snapshot["error"] = json!(error);
        }
    }
    snapshot["checkedAt"] = json!(util::iso());
    Ok(snapshot)
}
