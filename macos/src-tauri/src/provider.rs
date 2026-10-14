use crate::{
    git,
    util::{self, text, Result},
};
use base64::{engine::general_purpose::STANDARD, Engine};
use reqwest::{header::HeaderMap, Client};
use serde_json::{json, Value};
use std::{
    collections::{BTreeMap, VecDeque},
    sync::{Arc, Weak},
    time::Duration,
};
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;
use url::Url;

#[cfg(test)]
mod tests;

pub fn client() -> Result<Client> {
    Client::builder()
        .timeout(Duration::from_secs(15))
        .redirect(reqwest::redirect::Policy::none())
        .user_agent(format!("GitTogether/{}", crate::VERSION))
        .build()
        .map_err(|_| "无法初始化账号连接。".into())
}
pub fn host(provider: &str, input: &str) -> Result<String> {
    if provider == "github" {
        return Ok("https://github.com".into());
    }
    if provider != "gitea" {
        return Err("不支持该账号服务。".into());
    }
    let parsed = Url::parse(&if input.contains("://") {
        input.to_owned()
    } else {
        format!("https://{input}")
    })
    .map_err(|_| "请输入有效的 Gitea 域名。")?;
    let local = matches!(
        parsed.host_str(),
        Some("localhost" | "127.0.0.1" | "[::1]" | "::1")
    );
    if (parsed.scheme() != "https" && !(parsed.scheme() == "http" && local))
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.query().is_some()
        || parsed.fragment().is_some()
        || parsed.path() != "/"
    {
        return Err(
            "Gitea 必须使用 HTTPS 域名，不含用户信息、路径或查询参数；HTTP 仅限本机。".into(),
        );
    }
    Ok(parsed.origin().ascii_serialization())
}
fn encoded(s: &str) -> String {
    url::form_urlencoded::byte_serialize(s.as_bytes())
        .collect::<String>()
        .replace('+', "%20")
}
pub fn repo_path(repo: &Value) -> Result<String> {
    let name = text(repo, "fullName");
    let parts: Vec<_> = name.split('/').collect();
    if parts.len() != 2
        || parts.iter().any(|p| {
            p.is_empty()
                || matches!(*p, "." | "..")
                || p.chars().any(|c| c.is_whitespace() || c == '\0')
        })
    {
        return Err("无效的远端仓库身份。".into());
    }
    Ok(format!(
        "/repos/{}/{}",
        encoded(parts[0]),
        encoded(parts[1])
    ))
}

#[derive(Clone)]
pub struct Provider {
    pub account: Value,
    token: String,
    authorization: Option<(Weak<crate::service::Service>, String)>,
    diagnostics: Option<crate::diagnostics::Diagnostics>,
    client: Client,
    cache: Arc<Mutex<BTreeMap<String, Value>>>,
}
impl Provider {
    pub fn new(account: Value, token: String, client: Client) -> Self {
        Self {
            account,
            token,
            authorization: None,
            diagnostics: None,
            client,
            cache: Arc::new(Mutex::new(BTreeMap::new())),
        }
    }
    pub fn kind(&self) -> &str {
        text(&self.account, "provider")
    }
    pub fn with_authorization(
        mut self,
        service: Weak<crate::service::Service>,
        generation: String,
    ) -> Self {
        if self.kind() == "github" {
            self.authorization = Some((service, generation));
        }
        self
    }
    pub fn with_diagnostics(mut self, diagnostics: crate::diagnostics::Diagnostics) -> Self {
        self.diagnostics = Some(diagnostics);
        self
    }
    async fn access_token(
        &self,
        rejected: Option<&str>,
        cancel: &CancellationToken,
    ) -> Result<String> {
        if cancel.is_cancelled() {
            return Err("操作已取消。".into());
        }
        match &self.authorization {
            Some((service, generation)) => {
                service
                    .upgrade()
                    .ok_or("账号服务已退出。")?
                    .github_token(text(&self.account, "id"), generation, rejected, cancel)
                    .await
            }
            None => Ok(self.token.clone()),
        }
    }
    fn http_failure(&self, status: u16, headers: &HeaderMap) {
        if let Some(diagnostics) = &self.diagnostics {
            let rate_limited = status == 429
                || status == 403
                    && headers
                        .get("x-ratelimit-remaining")
                        .is_some_and(|remaining| remaining == "0");
            let mut record = json!({"event":"provider-read","outcome":"failure","provider":self.kind(),"endpoint":"other","httpStatus":status,"code":if rate_limited{"rate-limit"}else if status==401||status==403{"permission"}else{"connection"},"resource":&util::digest(text(&self.account,"id"))[..24]});
            if status == 401 && self.kind() == "github" {
                record["event"] = json!("authorization");
                record["authorizationStage"] = json!("token-rejected");
                record["authReason"] = json!("rejected");
            }
            diagnostics.record(&record, false);
        }
    }
    pub fn api(&self) -> String {
        if self.kind() == "github" {
            "https://api.github.com".into()
        } else {
            format!("{}/api/v1", text(&self.account, "host"))
        }
    }
    pub async fn get(
        &self,
        path: &str,
        query: &[(&str, &str)],
        format: &str,
        cancel: &CancellationToken,
    ) -> Result<(Value, HeaderMap)> {
        if !path.starts_with('/') || path.contains("://") || path.contains('#') {
            return Err("无效的远端读取路径。".into());
        }
        let mut url = Url::parse(&(self.api() + path)).map_err(|_| "无效的账号服务地址。")?;
        url.query_pairs_mut().extend_pairs(query.iter().copied());
        let operation = async {
            let mut token = self.access_token(None, cancel).await?;
            for attempt in 0..2 {
                let mut request = self
                    .client
                    .get(url.clone())
                    .header(
                        "Authorization",
                        format!(
                            "{} {}",
                            if self.kind() == "github" {
                                "Bearer"
                            } else {
                                "token"
                            },
                            token
                        ),
                    )
                    .header(
                        "Accept",
                        if format == "text" {
                            "text/plain"
                        } else if self.kind() == "github" {
                            "application/vnd.github+json"
                        } else {
                            "application/json"
                        },
                    );
                if self.kind() == "github" {
                    request = request.header("X-GitHub-Api-Version", "2022-11-28");
                }
                let mut response = request.send().await.map_err(transport_error)?;
                let status = response.status().as_u16();
                let headers = response.headers().clone();
                if !response.status().is_success() {
                    self.http_failure(status, &headers);
                }
                if status == 401 {
                    if attempt == 0 && self.authorization.is_some() {
                        token = self.access_token(Some(&token), cancel).await?;
                        continue;
                    }
                    return Err("令牌已失效或被撤销（HTTP 401），请在设置中重新连接账号。".into());
                }
                if status == 429
                    || (status == 403
                        && headers
                            .get("x-ratelimit-remaining")
                            .is_some_and(|v| v == "0"))
                {
                    return Err(format!(
                        "远端访问频率受限（HTTP {status}）；保留上次结果，等待下次检查。"
                    ));
                }
                if status == 403 {
                    return Err("远端拒绝读取（HTTP 403）；请检查读取权限与服务访问限制。".into());
                }
                if !response.status().is_success() {
                    return Err(format!(
                        "账号服务返回 HTTP {status}；请检查服务与令牌权限。"
                    ));
                }
                if format == "status" {
                    return Ok((json!(status), headers));
                }
                if response.content_length().is_some_and(|n| n > 8_000_000) {
                    return Err("账号服务响应过大。".into());
                }
                let mut bytes = Vec::new();
                while let Some(chunk) = response.chunk().await.map_err(transport_error)? {
                    if bytes.len() + chunk.len() > 8_000_000 {
                        return Err("账号服务响应过大。".into());
                    }
                    bytes.extend_from_slice(&chunk);
                }
                let value = if format == "text" {
                    Value::String(String::from_utf8(bytes).map_err(|_| "账号服务返回了无效文本。")?)
                } else {
                    serde_json::from_slice(&bytes).map_err(|_| "账号服务返回了无效 JSON 数据。")?
                };
                return Ok((value, headers));
            }
            unreachable!("the bounded HTTP retry returns on its final attempt")
        };
        tokio::select! { result = operation => result, _ = cancel.cancelled() => Err("操作已取消。".into()) }
    }
    pub fn record(&self, raw: &Value) -> Result<Value> {
        let id = raw["id"].as_u64().ok_or("仓库列表中包含无效的记录。")?;
        let name = raw["name"].as_str().ok_or("仓库名称无效。")?;
        let full = raw["full_name"].as_str().ok_or("仓库身份无效。")?;
        repo_path(&json!({"fullName":full}))?;
        let mut value = json!({"id":format!("{}:{id}", text(&self.account,"id")),"remoteId":id,"accountId":text(&self.account,"id"),"name":name,"fullName":full,"description":text(raw,"description"),"defaultBranch":text(raw,"default_branch"),"private":raw["private"]==true,"url":format!("{}/{}/{}",text(&self.account,"host"),encoded(full.split('/').next().unwrap()),encoded(full.split('/').nth(1).unwrap())),"available":true});
        if let Some(date) = raw["updated_at"]
            .as_str()
            .filter(|s| chrono::DateTime::parse_from_rfc3339(s).is_ok())
        {
            value["updatedAt"] = json!(date);
        }
        if let Some(fork) = raw["fork"].as_bool() {
            value["fork"] = json!(fork);
        }
        if self.kind() == "github" {
            match text(&raw["owner"], "type") {
                "Organization" => value["ownerType"] = json!("organization"),
                "User" => value["ownerType"] = json!("user"),
                _ => (),
            }
        }
        let mut permissions = json!({});
        for key in ["admin", "maintain", "push", "triage", "pull"] {
            if let Some(b) = raw["permissions"][key].as_bool() {
                permissions[key] = json!(b);
            }
        }
        if permissions.as_object().is_some_and(|o| !o.is_empty()) {
            value["permissions"] = permissions;
        }
        Ok(value)
    }
    async fn paged(
        &self,
        path: &str,
        parameters: &[(&str, String)],
        cancel: &CancellationToken,
    ) -> Result<Vec<Value>> {
        let mut records = BTreeMap::new();
        let mut stalled = 0;
        for page in 1..=10_000 {
            let page = page.to_string();
            let mut query = vec![
                ("page", page.as_str()),
                (
                    if self.kind() == "github" {
                        "per_page"
                    } else {
                        "limit"
                    },
                    "100",
                ),
            ];
            query.extend(parameters.iter().map(|(k, v)| (*k, v.as_str())));
            let (value, headers) = self.get(path, &query, "json", cancel).await?;
            let rows = if path == "/repos/search" && value["ok"] == true {
                value["data"].as_array()
            } else {
                value.as_array()
            }
            .ok_or("仓库列表返回格式不正确。")?;
            let before = records.len();
            for raw in rows {
                let r = self.record(raw)?;
                records.insert(r["remoteId"].as_u64().unwrap(), r);
            }
            let more = if let Some(link) = headers.get("link").and_then(|h| h.to_str().ok()) {
                link.contains("rel=\"next\"") || link.contains("rel=next")
            } else if let Some(total) = headers
                .get("x-total-count")
                .and_then(|v| v.to_str().ok())
                .and_then(|v| v.parse::<usize>().ok())
                .filter(|v| *v > 0)
            {
                records.len() < total
            } else {
                !rows.is_empty()
            };
            if !more {
                let mut result: Vec<_> = records.into_values().collect();
                result.sort_by(|a, b| {
                    text(a, "fullName")
                        .to_lowercase()
                        .cmp(&text(b, "fullName").to_lowercase())
                });
                return Ok(result);
            }
            stalled = if records.len() > before {
                0
            } else {
                stalled + 1
            };
            if stalled >= 3 {
                return Err("仓库分页未返回新记录，未用不完整数据覆盖已有列表。".into());
            }
        }
        Err("仓库分页超出安全上限，未覆盖已有列表。".into())
    }
    pub async fn repositories(
        &self,
        cancel: &CancellationToken,
        uid: Option<u64>,
    ) -> Result<Vec<Value>> {
        let params = if self.kind() == "github" {
            vec![
                ("visibility", "all".into()),
                (
                    "affiliation",
                    "owner,collaborator,organization_member".into(),
                ),
            ]
        } else {
            vec![]
        };
        let mut repositories = self.paged("/user/repos", &params, cancel).await?;
        if self.kind() == "github" {
            match self
                .paged(
                    "/user/repos",
                    &[
                        ("visibility", "all".into()),
                        ("affiliation", "collaborator".into()),
                    ],
                    cancel,
                )
                .await
            {
                Ok(extra) => {
                    let ids: Vec<_> = extra.iter().map(|r| r["remoteId"].clone()).collect();
                    for row in extra {
                        if let Some(i) = repositories
                            .iter()
                            .position(|r| r["remoteId"] == row["remoteId"])
                        {
                            repositories[i] = row;
                        } else {
                            repositories.push(row);
                        }
                    }
                    for r in &mut repositories {
                        r["collaborator"] = json!(ids.contains(&r["remoteId"]));
                    }
                }
                Err(e) => {
                    if cancel.is_cancelled() {
                        return Err(e);
                    }
                    for r in &mut repositories {
                        r["metadataError"] = json!(format!("协作分类未能读取：{e}"));
                    }
                }
            }
        } else {
            let uid = match uid {
                Some(v) => Some(v),
                None => self
                    .get("/user", &[], "json", cancel)
                    .await
                    .ok()
                    .and_then(|(v, _)| v["id"].as_u64()),
            };
            let mut errors = Vec::new();
            if let Some(uid) = uid {
                for mode in ["fork", "collaborative"] {
                    match self
                        .paged(
                            "/repos/search",
                            &[
                                ("uid", uid.to_string()),
                                ("mode", mode.into()),
                                ("exclusive", "false".into()),
                            ],
                            cancel,
                        )
                        .await
                    {
                        Ok(extra) => {
                            for row in extra {
                                if let Some(i) = repositories
                                    .iter()
                                    .position(|r| r["remoteId"] == row["remoteId"])
                                {
                                    repositories[i] = row;
                                } else {
                                    repositories.push(row);
                                }
                            }
                        }
                        Err(e) => errors.push(e),
                    }
                }
            } else {
                errors.push("无法确认补充目录的账号身份。".into());
            }
            if repositories.is_empty() && !errors.is_empty() {
                return Err(errors.join(" "));
            }
            if !errors.is_empty() {
                for r in &mut repositories {
                    r["metadataError"] = json!(errors.join(" "));
                }
            }
        }
        // Each actual request has a separate timeout; limit concurrent metadata reads.
        let mut queue: VecDeque<_> = repositories.into();
        let mut tasks = tokio::task::JoinSet::new();
        let mut result = Vec::new();
        loop {
            while tasks.len() < 4 {
                let Some(mut r) = queue.pop_front() else {
                    break;
                };
                let p = self.clone();
                let c = cancel.clone();
                tasks.spawn(async move {
                    let base = repo_path(&r)?;
                    if !r["fork"].is_boolean() {
                        match p
                            .get(&base, &[], "json", &c)
                            .await
                            .and_then(|(v, _)| p.record(&v))
                        {
                            Ok(details)
                                if details["remoteId"] == r["remoteId"]
                                    && details["fork"].is_boolean() =>
                            {
                                for key in ["fork", "ownerType", "permissions"] {
                                    if !details[key].is_null() {
                                        r[key] = details[key].clone();
                                    }
                                }
                            }
                            _ => append_error(&mut r, "来源分类未能读取。"),
                        }
                    }
                    if p.kind() == "gitea" {
                        let owner = text(&r, "fullName")
                            .split('/')
                            .next()
                            .unwrap_or("")
                            .to_owned();
                        if owner.eq_ignore_ascii_case(text(&p.account, "login")) {
                            r["ownerType"] = json!("user");
                            r["collaborator"] = json!(false);
                        } else {
                            match p
                                .get(&format!("/orgs/{}", encoded(&owner)), &[], "json", &c)
                                .await
                            {
                                Ok((v, _)) if text(&v, "username").eq_ignore_ascii_case(&owner) => {
                                    r["ownerType"] = json!("organization")
                                }
                                _ => append_error(&mut r, "归属分类未确认。"),
                            };
                            match p
                                .get(
                                    &format!(
                                        "{base}/collaborators/{}",
                                        encoded(text(&p.account, "login"))
                                    ),
                                    &[],
                                    "status",
                                    &c,
                                )
                                .await
                            {
                                Ok((v, _)) if v == 204 => r["collaborator"] = json!(true),
                                _ => append_error(&mut r, "协作关系未确认。"),
                            }
                        }
                    }
                    if c.is_cancelled() {
                        return Err("操作已取消。".into());
                    }
                    Ok::<Value, String>(r)
                });
            }
            match tasks.join_next().await {
                Some(Ok(v)) => result.push(v?),
                Some(Err(_)) => return Err("仓库元数据读取未完成。".into()),
                None => break,
            }
        }
        result.sort_by(|a, b| {
            text(a, "fullName")
                .to_lowercase()
                .cmp(&text(b, "fullName").to_lowercase())
        });
        Ok(result)
    }
    async fn cached(&self, key: &str) -> Option<Value> {
        self.cache.lock().await.get(key).cloned()
    }
    async fn remember(&self, key: String, v: Value) -> Value {
        let mut cache = self.cache.lock().await;
        if cache.len() >= 128 {
            if let Some(k) = cache.keys().next().cloned() {
                cache.remove(&k);
            }
        }
        cache.insert(key, v.clone());
        v
    }
    async fn history(&self, repo: &Value, head: &str, cancel: &CancellationToken) -> Result<Value> {
        let key = format!("h:{}:{head}", text(repo, "id"));
        if let Some(v) = self.cached(&key).await {
            return Ok(v);
        }
        let (v, _) = self
            .get(
                &(repo_path(repo)? + "/commits"),
                &[
                    ("sha", head),
                    (
                        if self.kind() == "github" {
                            "per_page"
                        } else {
                            "limit"
                        },
                        "50",
                    ),
                    ("page", "1"),
                    ("stat", "false"),
                ],
                "json",
                cancel,
            )
            .await?;
        let rows = v
            .as_array()
            .filter(|v| !v.is_empty())
            .ok_or("远端分支没有返回 HEAD 提交。")?;
        let commits: Vec<_> = rows.iter().map(commit_value).collect::<Result<_>>()?;
        if text(&commits[0], "id") != head {
            return Err("远端分支提交与 HEAD 不一致。".into());
        }
        let tree = util::sha(text(&rows[0]["commit"]["tree"], "sha"))?;
        Ok(self
            .remember(
                key,
                json!({"commits":commits,"tree":tree,"limited":rows.len()>=50}),
            )
            .await)
    }
    async fn gitea_verified_emails(
        &self,
        cancel: &CancellationToken,
    ) -> Result<std::collections::BTreeSet<String>> {
        let key = "participation-emails";
        let value = if let Some(value) = self.cached(key).await.filter(|value| {
            value["checkedAt"]
                .as_i64()
                .is_some_and(|time| util::now() - time < 300_000)
        }) {
            value
        } else {
            let (user, _) = self.get("/user", &[], "json", cancel).await?;
            if !text(&user, "login").eq_ignore_ascii_case(text(&self.account, "login")) {
                return Err("提交身份与当前登录账号不一致。".into());
            }
            // Gitea returns the full email list. Its public profile email can
            // be masked or unverified, so only use explicitly verified entries.
            let (value, headers) = self.get("/user/emails", &[], "json", cancel).await?;
            let rows = value.as_array().ok_or("账号邮箱记录格式无效。")?;
            if next(&headers) {
                return Err("账号邮箱记录尚未完整读取。".into());
            }
            let emails = rows
                .iter()
                .filter(|row| row["verified"] == true)
                .map(|row| {
                    row["email"]
                        .as_str()
                        .filter(|email| !email.is_empty())
                        .map(str::to_lowercase)
                        .ok_or_else(|| "账号邮箱记录格式无效。".to_owned())
                })
                .collect::<Result<Vec<_>>>()?;
            if emails.is_empty() {
                return Err("当前账号没有可用于匹配的已验证邮箱。".into());
            }
            self.remember(key.into(), json!({"emails":emails,"checkedAt":util::now()}))
                .await
        };
        value["emails"]
            .as_array()
            .ok_or("账号邮箱记录格式无效。")?
            .iter()
            .map(|email| {
                email
                    .as_str()
                    .map(str::to_owned)
                    .ok_or_else(|| "账号邮箱记录格式无效。".to_owned())
            })
            .collect()
    }
    async fn account_created_repository(
        &self,
        repo: &Value,
        cancel: &CancellationToken,
    ) -> Result<bool> {
        if self.kind() != "gitea" {
            return Err("当前平台未提供可核对的仓库创建记录，继续显示唯一分支。".into());
        }
        let key = format!(
            "participation-creation:{}:{}",
            text(&self.account, "id"),
            text(repo, "id")
        );
        if let Some(value) = self.cached(&key).await.filter(|value| {
            value["checkedAt"]
                .as_i64()
                .is_some_and(|time| util::now() - time < 300_000)
        }) {
            return value["found"]
                .as_bool()
                .ok_or("仓库创建记录格式无效。".into());
        }
        let remote_id = repo["remoteId"]
            .as_u64()
            .filter(|id| *id > 0)
            .ok_or("无效的远端仓库身份。")?;
        let base = repo_path(repo)?;
        let (metadata, _) = self.get(&base, &[], "json", cancel).await?;
        if metadata["id"].as_u64() != Some(remote_id) {
            return Err("仓库创建记录与当前仓库身份不一致。".into());
        }
        let date = chrono::DateTime::parse_from_rfc3339(text(&metadata, "created_at"))
            .map_err(|_| "仓库创建日期无法确认。")?
            .with_timezone(&chrono::Utc)
            .date_naive()
            .to_string();
        // Activity recipients and organization owners are not the creator.
        // Query the creation day, and only trust the matching repo's actor.
        for page in 1..=10 {
            let page_s = page.to_string();
            let (value, headers) = self
                .get(
                    &format!("{base}/activities/feeds"),
                    &[("date", &date), ("page", &page_s), ("limit", "100")],
                    "json",
                    cancel,
                )
                .await?;
            let rows = value.as_array().ok_or("仓库创建活动格式无效。")?;
            for activity in rows {
                if activity["op_type"] != "create_repo" {
                    continue;
                }
                if activity["repo_id"].as_u64() != Some(remote_id) {
                    return Err("仓库创建活动与当前仓库身份不一致。".into());
                }
                let actor = text(&activity["act_user"], "login");
                if actor.is_empty() {
                    return Err("仓库创建者身份无法确认。".into());
                }
                let found = actor.eq_ignore_ascii_case(text(&self.account, "login"));
                self.remember(key, json!({"found":found,"checkedAt":util::now()}))
                    .await;
                return Ok(found);
            }
            if rows.is_empty() || (!next(&headers) && rows.len() < 100) {
                return Err("未找到可核对的仓库创建活动，继续显示唯一分支。".into());
            }
        }
        Err("仓库创建活动超过读取上限，继续显示唯一分支。".into())
    }
    async fn account_pushed_commits(
        &self,
        repo: &Value,
        commits: &std::collections::BTreeSet<String>,
        cancel: &CancellationToken,
    ) -> Result<bool> {
        let remote_id = repo["remoteId"]
            .as_u64()
            .filter(|id| *id > 0)
            .ok_or("无效的远端仓库身份。")?;
        let base = repo_path(repo)?;
        // Git authors and committers are not the authenticated push actor.
        // A push counts only when its actor and repo match, and its commit is
        // in this branch's actual ancestry. Never match names or CompareURL.
        for page in 1..=10 {
            let page_s = page.to_string();
            let (value, headers) = self
                .get(
                    &format!("{base}/activities/feeds"),
                    &[("page", &page_s), ("limit", "50")],
                    "json",
                    cancel,
                )
                .await?;
            let rows = value.as_array().ok_or("仓库推送活动格式无效。")?;
            for activity in rows {
                if activity["op_type"] != "commit_repo" {
                    continue;
                }
                if activity["repo_id"].as_u64() != Some(remote_id) {
                    return Err("仓库推送活动与当前仓库身份不一致。".into());
                }
                let actor = text(&activity["act_user"], "login");
                if actor.is_empty() {
                    return Err("仓库推送者身份无法确认。".into());
                }
                if !actor.eq_ignore_ascii_case(text(&self.account, "login")) {
                    continue;
                }
                let raw = activity["content"]
                    .as_str()
                    .ok_or("仓库推送提交记录格式无效。")?;
                // Gitea also emits commit_repo for CreateRef, without commit content.
                // That event has no SHA evidence and must not invalidate real pushes.
                if raw.is_empty() {
                    continue;
                }
                let content: Value = serde_json::from_str(raw)
                    .map_err(|_| "仓库推送提交记录格式无效。")?;
                let pushed = content["Commits"]
                    .as_array()
                    .ok_or("仓库推送提交记录格式无效。")?;
                for commit in pushed.iter().chain(std::iter::once(&content["HeadCommit"])) {
                    let id = util::sha(text(commit, "Sha1"))?;
                    if commits.contains(&id) {
                        return Ok(true);
                    }
                }
            }
            // Some Gitea servers cap pages at 50 without a Link header.
            if rows.is_empty() || (!next(&headers) && rows.len() < 50) {
                return Ok(false);
            }
        }
        Err("仓库推送活动尚未完整读取（最多500条），继续显示该分支。".into())
    }
    async fn account_participation(
        &self,
        repo: &Value,
        head: &str,
        cancel: &CancellationToken,
    ) -> Result<Value> {
        let key = format!(
            "participation:{}:{}:{head}",
            text(&self.account, "id"),
            text(repo, "id")
        );
        if let Some(value) = self.cached(&key).await {
            if value["checkedAt"]
                .as_i64()
                .is_some_and(|time| util::now() - time < 300_000)
            {
                return Ok(value["proof"].clone());
            }
        }
        let kind = self.kind();
        let login = text(&self.account, "login");
        let base = if kind == "gitlab" {
            format!(
                "/projects/{}",
                repo["remoteId"]
                    .as_u64()
                    .filter(|id| *id > 0)
                    .ok_or("无效的远端项目身份。")?
            )
        } else {
            repo_path(repo)?
        };
        if matches!(kind, "github" | "github-enterprise" | "gitee") {
            let (value, _) = self
                .get(
                    &format!("{base}/commits"),
                    &[("sha", head), ("author", login), ("per_page", "1")],
                    "json",
                    cancel,
                )
                .await?;
            let rows = value.as_array().ok_or("分支参与记录返回格式无效。")?;
            if rows
                .iter()
                .any(|row| !text(&row["author"], "login").eq_ignore_ascii_case(login))
            {
                return Err("平台未能确认提交作者的账号身份。".into());
            }
            let found = !rows.is_empty();
            let proof = json!({"hasAccountCommits":found});
            self.remember(key, json!({"proof":proof,"checkedAt":util::now()}))
                .await;
            return Ok(proof);
        }
        let mut emails = std::collections::BTreeSet::new();
        if kind == "gitlab" {
            let email_key = "participation-emails";
            let identity = if let Some(value) = self.cached(email_key).await.filter(|value| {
                value["checkedAt"]
                    .as_i64()
                    .is_some_and(|time| util::now() - time < 300_000)
            }) {
                value["emails"].clone()
            } else {
                let (user, _) = self.get("/user", &[], "json", cancel).await?;
                if !text(&user, "username").eq_ignore_ascii_case(login) {
                    return Err("提交身份与当前登录账号不一致。".into());
                }
                let mut addresses = Vec::new();
                if let Some(email) = user["email"].as_str().filter(|email| !email.is_empty()) {
                    addresses.push(email.to_lowercase());
                }
                for page in 1..=10 {
                    let page_s = page.to_string();
                    let (value, headers) = self
                        .get(
                            "/user/emails",
                            &[("page", &page_s), ("per_page", "100")],
                            "json",
                            cancel,
                        )
                        .await?;
                    let rows = value.as_array().ok_or("账号邮箱记录格式无效。")?;
                    for row in rows {
                        if row["confirmed_at"].as_str().is_some() {
                            addresses.push(
                                row["email"]
                                    .as_str()
                                    .ok_or("账号邮箱记录格式无效。")?
                                    .to_lowercase(),
                            );
                        }
                    }
                    if !next(&headers) && rows.len() < 100 {
                        break;
                    }
                    if page == 10 {
                        return Err("账号邮箱记录尚未完整读取。".into());
                    }
                }
                if addresses.is_empty() {
                    return Err("平台未返回当前账号的已验证邮箱。".into());
                }
                self.remember(
                    email_key.into(),
                    json!({"emails":addresses,"checkedAt":util::now()}),
                )
                .await["emails"]
                    .clone()
            };
            for email in identity.as_array().ok_or("账号邮箱记录格式无效。")? {
                emails.insert(email.as_str().ok_or("账号邮箱记录格式无效。")?.to_owned());
            }
        } else if kind != "gitea" {
            return Err("平台暂不能确认提交账号身份。".into());
        }
        // Gitea has no author query. A negative result requires a closed parent
        // graph back to every root, rather than the graph's recent 50 records.
        let mut seen = std::collections::BTreeSet::new();
        let mut parents = std::collections::BTreeSet::from([head.to_owned()]);
        let mut gitea_emails = None;
        let mut incomplete_gitea_identity = false;
        let mut history_complete = false;
        for page in 1..=10 {
            let page_s = page.to_string();
            let (value, _) = self
                .get(
                    &format!(
                        "{base}{}",
                        if kind == "gitlab" {
                            "/repository/commits"
                        } else {
                            "/commits"
                        }
                    ),
                    &[
                        (if kind == "gitlab" { "ref_name" } else { "sha" }, head),
                        (if kind == "gitea" { "limit" } else { "per_page" }, "100"),
                        ("page", &page_s),
                        ("stat", "false"),
                        ("verification", "false"),
                        ("files", "false"),
                    ],
                    "json",
                    cancel,
                )
                .await?;
            let rows = value.as_array().ok_or("分支参与记录返回格式无效。")?;
            for row in rows {
                let found = if kind == "gitlab" {
                    emails.contains(&text(row, "author_email").to_lowercase())
                } else {
                    let author = text(&row["author"], "login");
                    if author.eq_ignore_ascii_case(login) {
                        true
                    } else if author.is_empty() {
                        if gitea_emails.is_none() {
                            gitea_emails = Some(self.gitea_verified_emails(cancel).await);
                        }
                        let author_email = text(&row["commit"]["author"], "email");
                        // Imported authors need no local platform account. A negative
                        // result only stays unknown when the identity data is missing.
                        incomplete_gitea_identity |= author_email.is_empty()
                            || gitea_emails.as_ref().unwrap().is_err();
                        let matched = gitea_emails.as_ref().is_some_and(|result| {
                            result.as_ref().is_ok_and(|emails| {
                                emails.contains(&author_email.to_lowercase())
                            })
                        });
                        matched
                    } else {
                        false
                    }
                };
                if found {
                    let proof = json!({"hasAccountCommits":true});
                    self.remember(key, json!({"proof":proof,"checkedAt":util::now()}))
                        .await;
                    return Ok(proof);
                }
                let commit = commit_value(row)?;
                seen.insert(text(&commit, "id").to_owned());
                parents.extend(
                    commit["parents"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .map(|id| id.as_str().unwrap().to_owned()),
                );
            }
            if parents.iter().all(|id| seen.contains(id)) {
                history_complete = true;
                break;
            }
            if rows.is_empty() {
                break;
            }
        }
        let mut proof = json!({});
        if kind == "gitea" {
            let pushed = self
                .account_pushed_commits(repo, &seen, cancel)
                .await
                .map_err(|error| format!("当前账号推送记录核对未完成：{error}"))?;
            proof["hasAccountPush"] = json!(pushed);
            if pushed {
                if history_complete && !incomplete_gitea_identity {
                    proof["hasAccountCommits"] = json!(false);
                }
                self.remember(key, json!({"proof":proof,"checkedAt":util::now()}))
                    .await;
                return Ok(proof);
            }
        }
        if !history_complete {
            return Err("分支历史尚未完整确认（最多读取1000条），继续显示该分支。".into());
        }
        if incomplete_gitea_identity {
            let detail = match &gitea_emails {
                Some(Err(error)) => format!("账号邮箱核对未完成：{error}"),
                _ => "部分提交缺少作者邮箱。".into(),
            };
            return Err(format!("无法判断是否包含当前账号的提交；{detail}继续显示该分支。"));
        }
        proof["hasAccountCommits"] = json!(false);
        self.remember(key, json!({"proof":proof,"checkedAt":util::now()}))
            .await;
        Ok(proof)
    }
    pub async fn tree(&self, repo: &Value, id: &str, cancel: &CancellationToken) -> Result<Value> {
        util::sha(id)?;
        let key = format!("t:{}:{id}", text(repo, "id"));
        if let Some(v) = self.cached(&key).await {
            return Ok(v);
        }
        let base = repo_path(repo)?;
        let mut entries = BTreeMap::new();
        let mut complete = true;
        let insert =
            |value: &Value, prefix: &str, entries: &mut BTreeMap<String, Value>| -> Result<bool> {
                let rows = value["tree"].as_array().ok_or("远端文件树返回格式无效。")?;
                for item in rows {
                    let kind = text(item, "type");
                    if !matches!(kind, "tree" | "blob" | "commit") {
                        return Err("远端文件树包含无效条目。".into());
                    }
                    let path = format!("{prefix}{}", util::file_path(text(item, "path"))?);
                    entries.insert(
                        path,
                        json!({"sha":util::sha(text(item,"sha"))?,"type":kind}),
                    );
                    if entries.len() >= 20_000 {
                        return Ok(false);
                    }
                }
                Ok(true)
            };
        if self.kind() == "gitea" {
            for page in 1..=200 {
                let page_s = page.to_string();
                let (v, h) = self
                    .get(
                        &format!("{base}/git/trees/{id}"),
                        &[
                            ("recursive", "true"),
                            ("page", &page_s),
                            ("per_page", "100"),
                        ],
                        "json",
                        cancel,
                    )
                    .await?;
                complete = insert(&v, "", &mut entries)?;
                let more = v["truncated"] == true
                    || v["total_count"]
                        .as_u64()
                        .is_some_and(|n| entries.len() < (n as usize))
                    || next(&h);
                if !complete || !more {
                    complete = complete && v["truncated"] != true;
                    break;
                }
                if page == 200 {
                    complete = false;
                }
            }
        } else {
            let (v, _) = self
                .get(
                    &format!("{base}/git/trees/{id}"),
                    &[("recursive", "1")],
                    "json",
                    cancel,
                )
                .await?;
            complete = insert(&v, "", &mut entries)?;
            if v["truncated"] == true {
                entries.clear();
                complete = true;
                let mut queue = VecDeque::from([(id.to_owned(), String::new())]);
                let mut reads = 0;
                while let Some((id, prefix)) = queue.pop_front() {
                    if reads >= 400 {
                        complete = false;
                        break;
                    }
                    reads += 1;
                    let (v, _) = self
                        .get(&format!("{base}/git/trees/{id}"), &[], "json", cancel)
                        .await?;
                    complete = insert(&v, &prefix, &mut entries)? && v["truncated"] != true;
                    if !complete {
                        break;
                    }
                    for item in v["tree"].as_array().unwrap() {
                        if item["type"] == "tree" {
                            queue.push_back((
                                util::sha(text(item, "sha"))?,
                                format!("{prefix}{}/", util::file_path(text(item, "path"))?),
                            ));
                        }
                    }
                }
            }
        }
        let result = json!({"entries":entries,"complete":complete});
        // Only complete immutable snapshots may satisfy future refreshes.
        if complete {
            Ok(self.remember(key, result).await)
        } else {
            Ok(result)
        }
    }
    pub async fn branches(
        &self,
        repo: &Value,
        cancel: &CancellationToken,
    ) -> Result<(Vec<(String, String)>, bool)> {
        let mut branches = BTreeMap::new();
        let mut limited = false;
        for page in 1..=10 {
            let page_s = page.to_string();
            let (v, h) = self
                .get(
                    &(repo_path(repo)? + "/branches"),
                    &[
                        ("page", &page_s),
                        (
                            if self.kind() == "github" {
                                "per_page"
                            } else {
                                "limit"
                            },
                            "100",
                        ),
                    ],
                    "json",
                    cancel,
                )
                .await?;
            let rows = v.as_array().ok_or("远端分支返回格式无效。")?;
            for r in rows {
                let name = util::field(r, "name", 1024)?;
                if name.is_empty() {
                    return Err("远端分支名称无效。".into());
                }
                branches.insert(
                    name,
                    util::sha(text(
                        &r["commit"],
                        if self.kind() == "github" { "sha" } else { "id" },
                    ))?,
                );
            }
            let more = next(&h)
                || h.get("x-total-count")
                    .and_then(|v| v.to_str().ok())
                    .and_then(|v| v.parse::<usize>().ok())
                    .is_some_and(|v| v > branches.len())
                || rows.len() >= 100;
            if !more || rows.is_empty() {
                break;
            }
            if page == 10 {
                limited = true;
            }
        }
        let mut out: Vec<_> = branches.into_iter().collect();
        out.sort_by(|(a, _), (b, _)| {
            (b == text(repo, "defaultBranch"))
                .cmp(&(a == text(repo, "defaultBranch")))
                .then(a.cmp(b))
        });
        Ok((out, limited))
    }
    pub async fn workspace(&self, repo: &Value, cancel: &CancellationToken, check_participation: bool) -> Result<Value> {
        let (items, limited) = self.branches(repo, cancel).await?;
        let mut tasks = Vec::new();
        let mut commits = Vec::new();
        let mut warnings = Vec::new();
        if limited {
            warnings.push("分支超过单次读取上限（1000 个）；当前显示已读取分支。".to_string());
        }
        let sole_branch = !limited && items.len() == 1;
        let mut pending = VecDeque::from(items.clone());
        let mut jobs = tokio::task::JoinSet::new();
        loop {
            while jobs.len() < 4 {
                let Some((branch, head)) = pending.pop_front() else {
                    break;
                };
                let p = self.clone();
                let r = repo.clone();
                let c = cancel.clone();
                jobs.spawn(async move {
                    let mut task = json!({"id":format!("remote:{branch}"),"branch":branch,"head":head,"path":null,"files":[],"tree":[],"error":"","remote":true,"treeComplete":false});
                    let history = match p.history(&r, &head, &c).await {
                        Ok(history) => history,
                        Err(error) => {
                            task["error"] = json!(error);
                            return (task, vec![], false);
                        }
                    };
                    // File-tree health must not discard a verified branch tip
                    // and its history: the graph and sync counts need them.
                    match p.tree(&r, text(&history, "tree"), &c).await {
                        Ok(tree) => {
                            task["tree"] = json!(tree_paths(&tree));
                            task["treeComplete"] = tree["complete"].clone();
                            if check_participation {
                                match p.account_participation(&r, &head, &c).await {
                                    Ok(proof) => {
                                        task.as_object_mut().unwrap().extend(proof.as_object().unwrap().clone());
                                        if sole_branch && proof["hasAccountCommits"] == false && proof["hasAccountPush"] != true {
                                            match p.account_created_repository(&r, &c).await {
                                                Ok(created) => task["hasAccountCreation"] = json!(created),
                                                Err(error) => task["participationError"] = json!(error),
                                            }
                                        }
                                    }
                                    Err(error) => task["participationError"] = json!(error),
                                }
                            }
                        }
                        Err(error) => task["error"] = json!(format!("文件树读取失败：{error}")),
                    }
                    (task, history["commits"].as_array().unwrap().clone(), history["limited"] == true)
                });
            }
            match jobs.join_next().await {
                Some(Ok((t, c, l))) => {
                    if let Some(error) = t["participationError"].as_str() {
                        warnings.push(format!("分支参与记录：{}：{}", text(&t, "branch"), error));
                    }
                    if t["treeComplete"] != true && t["error"] == "" {
                        warnings.push(format!("{} 的文件树读取不完整。", text(&t, "branch")));
                    }
                    if l && !warnings.iter().any(|s| s.starts_with("每个分支")) {
                        warnings
                            .push("每个分支当前读取最近 50 条提交；图线只使用真实父节点。".into());
                    }
                    tasks.push(t);
                    commits.extend(c);
                }
                Some(Err(_)) => return Err("远端分支读取未完成。".into()),
                None => break,
            }
        }
        for (branch, head) in &items {
            for c in &mut commits {
                if text(c, "id") == head {
                    c["refs"]
                        .as_array_mut()
                        .unwrap()
                        .push(json!(format!("origin/{branch}")));
                }
            }
        }
        tasks.sort_by_key(|t| {
            items
                .iter()
                .position(|(b, _)| b == text(t, "branch"))
                .unwrap_or(usize::MAX)
        });
        let complete = !limited
            && tasks
                .iter()
                .all(|t| t["error"] == "" && t["treeComplete"] == true);
        Ok(
            json!({"source":"remote","checkedAt":util::now(),"tasks":tasks,"commits":git::merge_history(commits),"complete":complete,"warnings":warnings}),
        )
    }
    pub async fn commit(
        &self,
        repo: &Value,
        id: &str,
        cancel: &CancellationToken,
    ) -> Result<Value> {
        util::sha(id)?;
        let key = format!("c:{}:{id}", text(repo, "id"));
        if let Some(v) = self.cached(&key).await {
            return Ok(v);
        }
        let base = repo_path(repo)?;
        let mut files = Vec::new();
        let mut commit = json!({});
        let mut tree = String::new();
        let mut warnings = Vec::new();
        for page in 1..=30 {
            let page_s = page.to_string();
            let (v, h) = self
                .get(
                    &format!(
                        "{base}{}/commits/{id}",
                        if self.kind() == "gitea" { "/git" } else { "" }
                    ),
                    &[("per_page", "100"), ("page", &page_s), ("files", "true")],
                    "json",
                    cancel,
                )
                .await?;
            commit = commit_value(&v)?;
            if text(&commit, "id") != id {
                return Err("远端提交文件返回格式无效。".into());
            }
            commit["description"] = json!(text(&v["commit"], "message")
                .split_once('\n')
                .map(|(_, s)| s.trim_start())
                .unwrap_or(""));
            tree = util::sha(text(&v["commit"]["tree"], "sha"))?;
            for f in v["files"].as_array().ok_or("远端提交文件返回格式无效。")? {
                let mut f1 = json!({"path":util::file_path(text(f,"filename"))?,"status":text(f,"status"),"patch":f["patch"].as_str()});
                if f["previous_filename"].is_string() {
                    f1["previousPath"] = json!(util::file_path(text(f, "previous_filename"))?);
                }
                files.push(f1);
            }
            if self.kind() != "github" || !next(&h) {
                break;
            }
            if page == 30 {
                warnings.push("提交文件超过接口上限，当前文件列表不完整。".to_string());
            }
        }
        let t = self.tree(repo, &tree, cancel).await?;
        if t["complete"] != true {
            warnings.push("所选提交的文件树不完整。".into());
        }
        let diff = if self.kind() == "gitea" {
            let (v, _) = self
                .get(
                    &format!("{base}/git/commits/{id}.diff"),
                    &[],
                    "text",
                    cancel,
                )
                .await?;
            let d = v.as_str().ok_or("远端 Diff 返回格式无效。")?.to_owned();
            attach_patches(&d, &mut files);
            d
        } else {
            files
                .iter()
                .map(|f| {
                    if let Some(p) = f["patch"].as_str() {
                        format!(
                            "--- a/{}\n+++ b/{}\n{p}",
                            f["previousPath"].as_str().unwrap_or(text(f, "path")),
                            text(f, "path")
                        )
                    } else {
                        format!(
                            "# {}: 接口未提供文本补丁（二进制或补丁省略）",
                            text(f, "path")
                        )
                    }
                })
                .collect::<Vec<_>>()
                .join("\n")
        };
        let cacheable = t["complete"] == true && warnings.is_empty();
        let result = json!({"commit":commit,"files":files,"diff":diff,"tree":tree_paths(&t),"treeComplete":t["complete"],"warnings":warnings});
        if cacheable {
            Ok(self.remember(key, result).await)
        } else {
            Ok(result)
        }
    }
    pub async fn file(
        &self,
        repo: &Value,
        id: &str,
        path: &str,
        cancel: &CancellationToken,
    ) -> Result<Value> {
        util::sha(id)?;
        util::file_path(path)?;
        let base = repo_path(repo)?;
        let (v, _) = self
            .get(&format!("{base}/git/commits/{id}"), &[], "json", cancel)
            .await?;
        let t = self
            .tree(
                repo,
                &util::sha(text(
                    if self.kind() == "gitea" {
                        &v["commit"]["tree"]
                    } else {
                        &v["tree"]
                    },
                    "sha",
                ))?,
                cancel,
            )
            .await?;
        let e = &t["entries"][path];
        if e.is_null() {
            return Err("这个文件不在已读取的所选提交文件树中。".into());
        }
        if e["type"] == "commit" {
            return Ok(
                json!({"text":"这是子模块引用，不读取其他仓库内容。","binary":false,"size":0}),
            );
        }
        if e["type"] != "blob" {
            return Err("只能读取文件，不读取目录。".into());
        }
        let (b, _) = self
            .get(
                &format!("{base}/git/blobs/{}", util::sha(text(e, "sha"))?),
                &[],
                "json",
                cancel,
            )
            .await?;
        let size = b["size"].as_u64().ok_or("远端文件返回格式无效。")?;
        let content = b["content"].as_str().ok_or("远端文件返回格式无效。")?;
        if b["encoding"] != "base64" {
            return Err("远端文件编码无效。".into());
        }
        if size > 500_000 || content.len() > 700_000 {
            return Ok(
                json!({"text":"文件超过文本预览上限（500 KB）。","binary":false,"size":size}),
            );
        }
        let bytes = STANDARD
            .decode(
                content
                    .chars()
                    .filter(|c| !c.is_whitespace())
                    .collect::<String>(),
            )
            .map_err(|_| "远端文件编码无效。")?;
        if bytes.len() != size as usize {
            return Err("远端文件长度不一致。".into());
        }
        let binary = bytes.contains(&0) || std::str::from_utf8(&bytes).is_err();
        Ok(
            json!({"text":if binary{"二进制或非 UTF-8 文件，不作为文本预览。".to_string()}else{String::from_utf8(bytes).unwrap()},"binary":binary,"size":size}),
        )
    }
}
fn next(h: &HeaderMap) -> bool {
    h.get("link")
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| v.contains("rel=\"next\"") || v.contains("rel=next"))
}
fn append_error(r: &mut Value, e: &str) {
    r["metadataError"] = json!(format!("{} {e}", text(r, "metadataError")).trim());
}
fn tree_paths(t: &Value) -> Vec<String> {
    t["entries"]
        .as_object()
        .map(|m| {
            m.iter()
                .filter(|(_, e)| e["type"] != "tree")
                .map(|(p, _)| p.clone())
                .collect()
        })
        .unwrap_or_default()
}
fn commit_value(v: &Value) -> Result<Value> {
    let msg = v["commit"]["message"]
        .as_str()
        .ok_or("远端提交返回格式无效。")?;
    let name = v["commit"]["author"]["name"]
        .as_str()
        .ok_or("远端提交作者无效。")?;
    let date = v["commit"]["author"]["date"]
        .as_str()
        .filter(|s| chrono::DateTime::parse_from_rfc3339(s).is_ok())
        .ok_or("远端提交日期无效。")?;
    let parents = v["parents"]
        .as_array()
        .ok_or("远端提交父节点无效。")?
        .iter()
        .map(|p| util::sha(text(p, "sha")))
        .collect::<Result<Vec<_>>>()?;
    Ok(
        json!({"id":util::sha(text(v,"sha"))?,"summary":msg.lines().next().unwrap_or(""),"author":name,"time":date,"parents":parents,"refs":[]}),
    )
}
fn attach_patches(diff: &str, files: &mut [Value]) {
    let mut patches = BTreeMap::new();
    for (index, section) in diff.split("\ndiff --git ").enumerate() {
        let section = if index == 0 {
            section.to_owned()
        } else {
            format!("diff --git {section}")
        };
        let new_path = section
            .lines()
            .find_map(|line| line.strip_prefix("+++ "))
            .and_then(diff_path)
            .filter(|path| path != "/dev/null");
        let path = new_path.or_else(|| {
            section
                .lines()
                .find_map(|line| line.strip_prefix("--- "))
                .and_then(diff_path)
                .filter(|path| path != "/dev/null")
        });
        if let Some(path) = path {
            patches.insert(path, section.trim_end().to_owned());
        }
    }
    for f in files {
        if let Some(patch) = patches.get(text(f, "path")) {
            f["patch"] = json!(patch);
        }
    }
}
fn diff_path(value: &str) -> Option<String> {
    let decoded = if let Some(quoted) = value.strip_prefix('"').and_then(|s| s.strip_suffix('"')) {
        let source = quoted.as_bytes();
        let mut bytes = Vec::with_capacity(source.len());
        let mut index = 0;
        while index < source.len() {
            if source[index] != b'\\' || index + 1 == source.len() {
                bytes.push(source[index]);
                index += 1;
                continue;
            }
            let next = source[index + 1];
            if matches!(next, b'0'..=b'7') {
                let mut octal = 0u16;
                let mut digits = 0;
                index += 1;
                while index < source.len() && digits < 3 && matches!(source[index], b'0'..=b'7') {
                    octal = octal * 8 + u16::from(source[index] - b'0');
                    index += 1;
                    digits += 1;
                }
                bytes.push(u8::try_from(octal).ok()?);
            } else {
                match next {
                    b't' => bytes.push(b'\t'),
                    b'n' => bytes.push(b'\n'),
                    b'r' => bytes.push(b'\r'),
                    b'\\' | b'"' => bytes.push(next),
                    _ => {
                        bytes.push(b'\\');
                        index += 1;
                        continue;
                    }
                }
                index += 2;
            }
        }
        String::from_utf8(bytes).ok()?
    } else {
        value.to_owned()
    };
    Some(
        decoded
            .strip_prefix("a/")
            .or_else(|| decoded.strip_prefix("b/"))
            .unwrap_or(&decoded)
            .to_owned(),
    )
}
pub fn transport_error(e: reqwest::Error) -> String {
    if e.is_timeout() {
        "远端账号服务请求超时（15秒）；保留上次结果，等待下次检查。".into()
    } else if e.is_connect() {
        "无法连接账号服务，请检查域名、网络和证书。".into()
    } else {
        "账号服务响应读取失败；保留上次结果。".into()
    }
}

pub const CREDENTIAL_HELPER:&str="!f() { test \"$1\" = get || exit 0; protocol=; host=; while IFS=\"=\" read -r key value; do case \"$key\" in protocol) protocol=\"$value\";; host) host=\"$value\";; esac; done; if test \"$protocol://$host\" = \"$GITTOGETHER_DOWNLOAD_ORIGIN\"; then printf \"username=%s\\npassword=%s\\n\" \"$GITTOGETHER_DOWNLOAD_USER\" \"$GITTOGETHER_DOWNLOAD_TOKEN\"; fi; }; f";
#[derive(Clone)]
pub struct Network {
    provider: Provider,
    pub url: String,
    env: Vec<(String, String)>,
    diagnostics: Option<crate::diagnostics::Diagnostics>,
    resource: String,
}
impl Network {
    pub fn new(repo: &Value, p: &Provider) -> Result<Self> {
        repo_path(repo)?;
        let full = text(repo, "fullName");
        let url = format!(
            "{}/{}/{}.git",
            text(&p.account, "host"),
            encoded(full.split('/').next().unwrap()),
            encoded(full.split('/').nth(1).unwrap())
        );
        if util::identity(&url) != util::identity(text(repo, "url")) {
            return Err("仓库远端与访问账号不匹配。".into());
        }
        let origin = Url::parse(&url)
            .map_err(|_| "无效的仓库远端。")?
            .origin()
            .ascii_serialization();
        Ok(Self {
            provider: p.clone(),
            url,
            diagnostics: None,
            resource: util::digest(text(repo, "id").as_bytes())[..24].into(),
            env: vec![
                ("GITTOGETHER_DOWNLOAD_ORIGIN".into(), origin),
                (
                    "GITTOGETHER_DOWNLOAD_USER".into(),
                    text(&p.account, "login").into(),
                ),
                ("GIT_ASKPASS".into(), "".into()),
                ("SSH_ASKPASS".into(), "".into()),
            ],
        })
    }
    pub fn with_diagnostics(mut self, diagnostics: crate::diagnostics::Diagnostics) -> Self {
        self.diagnostics = Some(diagnostics);
        self
    }
    pub async fn run(
        &self,
        root: &std::path::Path,
        args: &[&str],
        cancel: Option<CancellationToken>,
        hooks: bool,
        smudge: bool,
        timeout: u64,
    ) -> Result<String> {
        let helper = format!("credential.helper={CREDENTIAL_HELPER}");
        let mut a = vec![
            "-c",
            "credential.helper=",
            "-c",
            &helper,
            "-c",
            "http.followRedirects=false",
        ];
        if !hooks {
            a.extend(["-c", "core.hooksPath=/dev/null"]);
        }
        a.extend_from_slice(args);
        let mut environment = self.env.clone();
        let authorization_cancel=cancel.clone().unwrap_or_default();
        environment.push(("GITTOGETHER_DOWNLOAD_TOKEN".into(),self.provider.access_token(None,&authorization_cancel).await?));
        if let Some(proxy) = crate::proxy::environment(root, &self.url).await? {
            environment.push(proxy);
        }
        if !smudge {
            environment.push(("GIT_LFS_SKIP_SMUDGE".into(), "1".into()));
        }
        git::run(
            root,
            &a,
            git::Options {
                environment,
                timeout,
                cancel,
                write: true,
                diagnostics: self.diagnostics.clone(),
                resource: self.resource.clone(),
                ..Default::default()
            },
        )
        .await
    }
    pub async fn fetch(
        &self,
        root: &std::path::Path,
        branches: &[String],
        cancel: &CancellationToken,
    ) -> Result<Vec<String>> {
        let names = git::read(root, &["remote"]).await?;
        let mut remote = String::new();
        for name in names.lines() {
            let url = git::read(root, &["remote", "get-url", name]).await?;
            if util::identity(url.trim()) == util::identity(&self.url) {
                remote = name.into();
                break;
            }
        }
        if remote.is_empty() {
            return Err("工作目录的远端已经变化，请重新关联。".into());
        }
        let mut refs = Vec::new();
        for b in branches {
            if b.starts_with('-')
                || git::read(root, &["check-ref-format", "--branch", b])
                    .await?
                    .trim()
                    != b
            {
                return Err("分支名称无效。".into());
            }
            refs.push(format!("+refs/heads/{b}:refs/remotes/{remote}/{b}"));
        }
        let mut args = vec![
            "fetch",
            "--atomic",
            "--no-tags",
            "--no-auto-gc",
            "--no-write-fetch-head",
            "--recurse-submodules=no",
            self.url.as_str(),
        ];
        args.extend(refs.iter().map(String::as_str));
        if !refs.is_empty() {
            self.run(root, &args, Some(cancel.clone()), false, false, 120)
                .await?;
        }
        let mut heads = Vec::new();
        for b in branches {
            heads.push(
                git::read(
                    root,
                    &[
                        "rev-parse",
                        "--verify",
                        &format!("refs/remotes/{remote}/{b}^{{commit}}"),
                    ],
                )
                .await?
                .trim()
                .into(),
            );
        }
        Ok(heads)
    }
    pub async fn hydrate(
        &self,
        root: &std::path::Path,
        head: &str,
        cancel: Option<CancellationToken>,
    ) -> Result<()> {
        let files = git::read(root, &["ls-files", "-z"]).await?;
        let attrs = git::run(
            root,
            &["check-attr", "-z", "--stdin", "filter"],
            git::Options {
                stdin: Some(files.into_bytes()),
                ..Default::default()
            },
        )
        .await?;
        if !attrs
            .split('\0')
            .enumerate()
            .any(|(i, v)| i % 3 == 2 && v == "lfs")
        {
            return Ok(());
        }
        self.run(root, &["lfs", "version"], cancel.clone(), false, false, 30)
            .await?;
        self.run(
            root,
            &["lfs", "fetch", "-I", "", "-X", "", &self.url, head],
            cancel.clone(),
            false,
            false,
            1800,
        )
        .await?;
        self.run(
            root,
            &["lfs", "checkout"],
            cancel.clone(),
            false,
            false,
            1800,
        )
        .await?;
        self.run(
            root,
            &["lfs", "fsck", "--objects", head],
            cancel,
            false,
            false,
            1800,
        )
        .await?;
        Ok(())
    }
}
