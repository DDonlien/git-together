use crate::{
    credentials,
    presence::{self, Presence},
    remote_git,
    service::Service,
    util::{self, text, Result},
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{collections::BTreeMap, sync::Arc, time::Duration};
use tokio::sync::{watch, Mutex, RwLock};
use tokio_util::sync::CancellationToken;

#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Project {
    pub repository_id: String,
    pub team_id: Option<String>,
}
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Configuration {
    enabled: bool,
    name: String,
    server_url: String,
    binding: String,
    device_id: String,
    user_id: String,
    device_token: String,
    projects: Vec<Project>,
}
#[derive(Clone, Serialize, Deserialize)]
pub(crate) struct Record {
    pub hash: String,
    pub result: Option<Value>,
    pub plan: Option<Value>,
}
#[derive(Clone)]
pub(crate) struct Workspace {
    pub repository: String,
    pub task: String,
    pub public: Value,
}
pub struct RemoteControl {
    pub(crate) service: Arc<Service>,
    pub(crate) presence: Arc<Presence>,
    persistent: bool,
    config: watch::Sender<Configuration>,
    state: RwLock<Value>,
    settings: Mutex<()>,
    pub(crate) records: Mutex<BTreeMap<String, Record>>,
    workspaces: RwLock<BTreeMap<String, Workspace>>,
    running: Mutex<BTreeMap<String, (String, CancellationToken)>>,
    client: reqwest::Client,
    storage_error: String,
    server_scope: Option<String>,
    children: RwLock<BTreeMap<String, Arc<RemoteControl>>>,
    config_file: std::path::PathBuf,
    journal_file: std::path::PathBuf,
}
impl RemoteControl {
    pub fn new(
        service: Arc<Service>,
        presence: Arc<Presence>,
        persistent: bool,
    ) -> Result<Arc<Self>> {
        Self::new_scope(service, presence, persistent, None)
    }
    fn new_scope(
        service: Arc<Service>,
        presence: Arc<Presence>,
        persistent: bool,
        server_scope: Option<String>,
    ) -> Result<Arc<Self>> {
        let root = &service.root;
        let suffix = server_scope
            .as_ref()
            .map(|u| format!("-{}", util::digest(u)))
            .unwrap_or_default();
        let config_file = root.join(format!("remote-control-v1{suffix}.encrypted"));
        let journal_file = root.join(format!("remote-control-journal-v1{suffix}.encrypted"));
        let loaded = (|| -> Result<(Configuration, BTreeMap<String, Record>)> {
            let config = if persistent {
                credentials::load(&config_file, "GitTogether")?
            } else {
                None
            };
            let config: Configuration = config
                .map(serde_json::from_value)
                .transpose()
                .map_err(|_| "远端控制配置无效；原文件已保留。")?
                .unwrap_or_default();
            let records = if persistent {
                credentials::load(&journal_file, "GitTogether")?
                    .map(serde_json::from_value)
                    .transpose()
                    .map_err(|_| "远端执行记录无效；请保留原文件并检查。")?
                    .unwrap_or_default()
            } else {
                BTreeMap::new()
            };
            Ok((config, records))
        })();
        let (config, records, storage_error) = match loaded {
            Ok((c, r)) => (c, r, String::new()),
            Err(e) => (Configuration::default(), BTreeMap::new(), e),
        };
        let (config, mut receiver) = watch::channel(config);
        let control = Arc::new(Self {
            service,
            presence,
            persistent,
            config,
            state: RwLock::new(
                json!({"connection":"disabled","error":storage_error,"devices":[],"jobs":[],"teams":[],"repositories":[]}),
            ),
            settings: Mutex::new(()),
            records: Mutex::new(records),
            workspaces: RwLock::new(BTreeMap::new()),
            running: Mutex::new(BTreeMap::new()),
            client: reqwest::Client::builder()
                .redirect(reqwest::redirect::Policy::none())
                .timeout(Duration::from_secs(12))
                .build()
                .map_err(|_| "远端控制网络服务无法启动。")?,
            storage_error,
            server_scope,
            children: RwLock::new(BTreeMap::new()),
            config_file,
            journal_file,
        });
        let weak = Arc::downgrade(&control);
        tokio::spawn(async move {
            let mut retry = 2u64;
            loop {
                let _ = receiver.borrow_and_update().clone();
                let Some(control) = weak.upgrade() else { break };
                if control.server_scope.is_none() {
                    if let Err(error) = control.reconcile_servers().await {
                        control.state.write().await["error"] = json!(error);
                    }
                }
                let url = control
                    .server_scope
                    .clone()
                    .unwrap_or_else(|| control.presence.home_server());
                if control.presence.control_servers().contains(&url) {
                    let result = match control.ensure_enrolled(&url).await {
                        Ok(()) => {
                            let c = control.config.borrow().clone();
                            control.poll(&c).await
                        }
                        Err(e) => Err(e),
                    };
                    match result {
                        Ok(()) => retry = 2,
                        Err(error) => {
                            let mut state = control.state.write().await;
                            state["connection"] = json!("offline");
                            state["error"] = json!(error);
                            if let Some(devices) = state["devices"].as_array_mut() {
                                for device in devices {
                                    device["online"] = json!(false);
                                }
                            }
                            retry = (retry * 2).min(30);
                        }
                    }
                } else {
                    control.state.write().await["connection"] = json!("disabled");
                }
                drop(control);
                tokio::select! { _ = tokio::time::sleep(Duration::from_secs(retry)) => {}, result = receiver.changed() => { if result.is_err() { break; } retry = 2; } }
            }
        });
        Ok(control)
    }
    async fn reconcile_servers(&self) -> Result<()> {
        let home = self.presence.home_server();
        let selected = self.presence.control_servers();
        let mut children = self.children.write().await;
        children.retain(|url, _| selected.contains(url) && url != &home);
        for url in selected.into_iter().filter(|u| u != &home) {
            if !children.contains_key(&url) {
                let child = Self::new_scope(
                    self.service.clone(),
                    self.presence.clone(),
                    self.persistent,
                    Some(url.clone()),
                )?;
                children.insert(url, child);
            }
        }
        Ok(())
    }
    async fn ensure_enrolled(self: &Arc<Self>, url: &str) -> Result<()> {
        if !self.storage_error.is_empty() {
            return Err(self.storage_error.clone());
        }
        let old = self.config.borrow().clone();
        if !old.device_token.is_empty()
            && old.server_url == url
            && self.bound(&old).is_ok()
            && self.state.read().await["deviceRevoked"] != true
        {
            if !old.enabled {
                let mut next = old.clone();
                next.enabled = true;
                self.save_config(next).await?;
            }
            self.presence
                .save_device_access(url, &old.device_id, &old.device_token)
                .await?;
            return Ok(());
        }
        let name = if old.name.is_empty() {
            let name = crate::platform::device_name();
            match crate::instances::profile()? {
                Some(id) => format!("{name} · {id}").chars().take(120).collect(),
                None => name,
            }
        } else {
            old.name
        };
        self.command_inner("enroll", json!({"name":name})).await?;
        Ok(())
    }
    pub async fn command(self: &Arc<Self>, method: &str, mut input: Value) -> Result<Value> {
        if self.server_scope.is_some() {
            return self.command_inner(method, input).await;
        }
        if method == "status" {
            return self.combined_snapshot().await;
        }
        let selected = input["serverId"].as_str().map(str::to_owned);
        if let Some(object) = input.as_object_mut() {
            object.remove("serverId");
        }
        let home = self.presence.home_server();
        if let Some(id) = selected {
            if id != util::digest(&home) {
                let child = self
                    .children
                    .read()
                    .await
                    .values()
                    .find(|c| {
                        c.server_scope
                            .as_ref()
                            .is_some_and(|u| util::digest(u) == id)
                    })
                    .cloned()
                    .ok_or("此服务器已断开或未选择。")?;
                let mut value = child.command_inner(method, input).await?;
                value["serverId"] = json!(id);
                return Ok(value);
            }
        }
        let mut value = self.command_inner(method, input).await?;
        value["serverId"] = json!(util::digest(home));
        Ok(value)
    }
    async fn combined_snapshot(&self) -> Result<Value> {
        let mut snapshots = vec![(self.presence.home_server(), self.snapshot().await?)];
        let children = self
            .children
            .read()
            .await
            .iter()
            .map(|(u, c)| (u.clone(), c.clone()))
            .collect::<Vec<_>>();
        for (url, child) in children {
            snapshots.push((url, child.snapshot().await?));
        }
        let mut value = json!({"enabled":self.enabled(),"registered":false,"deviceId":"","userId":"","name":"","connection":"disabled","error":"","devices":[],"jobs":[],"teams":[],"repositories":[],"localRepositories":[],"servers":[]});
        let mut devices = vec![];
        let mut jobs = vec![];
        let mut teams = vec![];
        let mut servers = vec![];
        let mut errors = vec![];
        for (url, snapshot) in snapshots {
            let id = util::digest(&url);
            let registered = snapshot["registered"] == true;
            servers.push(json!({"serverId":id,"url":url,"deviceId":snapshot["deviceId"],"userId":snapshot["userId"],"registered":registered,"connection":snapshot["connection"],"error":snapshot["error"]}));
            if registered {
                value["registered"] = json!(true);
            }
            if snapshot["connection"] == "connected" {
                value["connection"] = json!("connected");
            }
            if snapshot["error"].as_str().is_some_and(|s| !s.is_empty()) {
                errors.push(text(&snapshot, "error").to_owned());
            }
            for mut d in snapshot["devices"].as_array().cloned().unwrap_or_default() {
                d["serverId"] = json!(id);
                d["isCurrent"] = json!(d["deviceId"] == snapshot["deviceId"]);
                devices.push(d);
            }
            for mut j in snapshot["jobs"].as_array().cloned().unwrap_or_default() {
                j["serverId"] = json!(id);
                jobs.push(j);
            }
            for mut t in snapshot["teams"].as_array().cloned().unwrap_or_default() {
                t["serverId"] = json!(id);
                teams.push(t);
            }
        }
        if value["connection"] != "connected" && self.enabled() {
            value["connection"] = json!("offline");
        }
        value["devices"] = json!(devices);
        value["jobs"] = json!(jobs);
        value["teams"] = json!(teams);
        value["servers"] = json!(servers);
        value["error"] = json!(errors.join("；"));
        Ok(value)
    }
    pub fn enabled(&self) -> bool {
        if self.server_scope.is_none() {
            return !self.presence.control_servers().is_empty();
        }
        let c = self.config.borrow();
        c.enabled && !c.device_token.is_empty() && self.bound(&c).is_ok()
    }
    pub async fn busy(&self) -> bool {
        if !self.running.lock().await.is_empty() {
            return true;
        }
        let children = self
            .children
            .read()
            .await
            .values()
            .cloned()
            .collect::<Vec<_>>();
        for child in children {
            if !child.running.lock().await.is_empty() {
                return true;
            }
        }
        false
    }
    pub async fn forget_account(&self, revoke: bool) -> Result<()> {
        let _guard = self.settings.lock().await;
        if self.busy().await {
            return Err("远端操作正在执行，请先等待完成或中止，再退出账号。".into());
        }
        let children = self
            .children
            .read()
            .await
            .values()
            .cloned()
            .collect::<Vec<_>>();
        let mut warnings = vec![];
        for child in children {
            if let Some(warning) = child.forget_one(revoke).await? {
                warnings.push(warning);
            }
        }
        self.children.write().await.clear();
        if let Some(warning) = self.forget_one(revoke).await? {
            warnings.push(warning);
        }
        *self.state.write().await = json!({"connection":"disabled","error":warnings.join("；"),"devices":[],"jobs":[],"teams":[],"repositories":[]});
        Ok(())
    }
    async fn forget_one(&self, revoke: bool) -> Result<Option<String>> {
        let old = self.config.borrow().clone();
        let warning = if revoke && !old.device_token.is_empty() {
            let result = async {
                let url = presence::server_url(&old.server_url)?
                    .join("v1/control/revoke")
                    .map_err(|_| "设备地址无效。")?;
                let response = self
                    .client
                    .post(url)
                    .bearer_auth(&old.device_token)
                    .json(&json!({"deviceId":old.device_id}))
                    .send()
                    .await
                    .map_err(|_| "设备撤销连接失败。")?;
                Self::decode(response).await
            }
            .await;
            result
                .err()
                .map(|e| format!("本机已停止接收；{} 的设备撤销暂未完成：{e}", old.server_url))
        } else {
            None
        };
        self.save_config(Configuration::default()).await?;
        self.workspaces.write().await.clear();
        Ok(warning)
    }
    fn bound(&self, c: &Configuration) -> Result<()> {
        if c.binding != self.presence.binding_for(&c.server_url)? {
            return Err("Presence账号或服务器已改变，请重新登记此设备。".into());
        }
        Ok(())
    }
    async fn decode(mut response: reqwest::Response) -> Result<Value> {
        let success = response.status().is_success();
        let mut bytes = vec![];
        while let Some(chunk) = response.chunk().await.map_err(|_| "远端控制响应未完成。")?
        {
            if bytes.len() + chunk.len() > 4 * 1024 * 1024 {
                return Err("远端控制响应过大。".into());
            }
            bytes.extend_from_slice(&chunk);
        }
        let value: Value =
            serde_json::from_slice(&bytes).map_err(|_| "服务器尚不支持远端控制或响应格式无效。")?;
        if !success {
            return Err(value["message"]
                .as_str()
                .unwrap_or("服务器拒绝了远端控制请求。")
                .chars()
                .take(1900)
                .collect());
        }
        Ok(value)
    }
    async fn http(&self, c: &Configuration, route: &str, input: Option<&Value>) -> Result<Value> {
        self.bound(c)?;
        let url = presence::server_url(&c.server_url)?
            .join(&format!("v1/control/{route}"))
            .map_err(|_| "远端控制地址无效。")?;
        let request = if let Some(value) = input {
            self.client.post(url).json(value)
        } else {
            self.client.get(url)
        };
        let response = request
            .bearer_auth(&c.device_token)
            .send()
            .await
            .map_err(|_| "远端控制连接失败；可重新连接后查询命令结果。")?;
        if route == "state" && matches!(response.status().as_u16(), 401 | 403) {
            self.state.write().await["deviceRevoked"] = json!(true);
        }
        Self::decode(response).await
    }
    async fn save_config(&self, c: Configuration) -> Result<()> {
        if self.persistent {
            credentials::save(
                &self.config_file,
                &serde_json::to_value(&c).map_err(|_| "设备配置无法编码。")?,
            )?;
        }
        self.config.send_replace(c);
        Ok(())
    }
    pub(crate) async fn save_record(&self, id: &str, record: Record) -> Result<()> {
        let mut records = self.records.lock().await;
        if records.len() >= 512 && !records.contains_key(id) {
            let removable = records
                .iter()
                .find(|(_, record)| record.result.is_some())
                .map(|(id, _)| id.clone());
            if let Some(id) = removable {
                records.remove(&id);
            } else {
                return Err("执行中的远端命令过多。".into());
            }
        }
        let mut next = records.clone();
        next.insert(id.into(), record);
        if self.persistent {
            credentials::save(
                &self.journal_file,
                &serde_json::to_value(&next).map_err(|_| "执行记录无法编码。")?,
            )?;
        }
        *records = next;
        Ok(())
    }
    async fn snapshot(&self) -> Result<Value> {
        let c = self.config.borrow().clone();
        let mut state = self.state.read().await.clone();
        let bound =
            !c.device_token.is_empty() && state["deviceRevoked"] != true && self.bound(&c).is_ok();
        if !bound {
            state["devices"] = json!([]);
            state["jobs"] = json!([]);
            state["teams"] = json!([]);
            state["repositories"] = json!([]);
            state["connection"] = json!("disabled");
        }
        state["enabled"] = json!(c.enabled && bound);
        state["registered"] = json!(bound);
        state["deviceId"] = json!(if bound { &c.device_id } else { "" });
        state["userId"] = json!(if bound { &c.user_id } else { "" });
        state["name"] = json!(c.name);
        state["localRepositories"] = json!([]);
        Ok(state)
    }
    async fn command_inner(self: &Arc<Self>, method: &str, input: Value) -> Result<Value> {
        if !input.is_object()
            || serde_json::to_vec(&input)
                .map_err(|_| "控制请求无效。")?
                .len()
                > 128 * 1024
        {
            return Err("控制请求无效或过大。".into());
        }
        if method != "status" && !self.storage_error.is_empty() {
            return Err(format!(
                "远端控制已停用，原记录未覆盖：{}",
                self.storage_error
            ));
        }
        match method {
            "status" => self.snapshot().await,
            "enroll" => {
                util::allowed(&input, &["name", "registrationKey"])?;
                let _guard = self.settings.lock().await;
                let selected = self
                    .server_scope
                    .clone()
                    .unwrap_or_else(|| self.presence.home_server());
                let (url, token) = self.presence.prepare_server(&selected).await?;
                let supplied = input["registrationKey"]
                    .as_str()
                    .filter(|s| !s.trim().is_empty())
                    .map(|s| s.trim().to_owned());
                let registration = if self.presence.signed_in() {
                    token.clone()
                } else if let Some(key) = supplied {
                    key
                } else {
                    let private = presence::private_json(
                        &crate::platform::home()?
                            .join(".config/git-presence/control-access.local.json"),
                    )?;
                    if let Some(access) = private {
                        if presence::server_url(text(&access, "serverUrl"))?.as_str() != url {
                            return Err(
                                "设备登记授权属于其他服务器，请填写当前服务器的登记密钥。".into()
                            );
                        }
                        util::field(&access, "registrationKey", 512)?
                    } else {
                        token.clone()
                    }
                };
                let name = util::field(&input, "name", 480)?;
                if name.trim().is_empty() || name.chars().count() > 120 {
                    return Err("请输入设备名称。".into());
                }
                let old = self.config.borrow().clone();
                if !old.device_token.is_empty()
                    && self.state.read().await["deviceRevoked"] != true
                    && self.bound(&old).is_ok()
                {
                    return Err("此设备已登记；可以修改名称或先撤销旧设备。".into());
                }
                let address = presence::server_url(&url)?
                    .join("v1/control/enroll")
                    .map_err(|_| "登记地址无效。")?;
                let response = self
                    .client
                    .post(address)
                    .bearer_auth(&registration)
                    .header("X-Presence-Account", &token)
                    .json(&json!({"name":name}))
                    .send()
                    .await
                    .map_err(|_| "设备登记未完成，请检查服务器。")?;
                let value = Self::decode(response).await?;
                let id = util::field(&value, "deviceId", 100)?;
                uuid::Uuid::parse_str(&id).map_err(|_| "服务器返回无效设备身份。")?;
                let credential = util::field(&value, "deviceToken", 512)?;
                if credential.len() < 32 {
                    return Err("服务器返回无效设备凭证。".into());
                }
                self.save_config(Configuration {
                    enabled: true,
                    name,
                    server_url: url.clone(),
                    binding: self.presence.binding_for(&url)?,
                    device_id: id.clone(),
                    user_id: util::field(&value, "userId", 160)?,
                    device_token: credential.clone(),
                    projects: vec![],
                })
                .await?;
                self.presence
                    .save_device_access(&url, &id, &credential)
                    .await?;
                self.state.write().await["deviceRevoked"] = json!(false);
                self.snapshot().await
            }
            "request" => {
                let c = self.config.borrow().clone();
                if !c.enabled {
                    return Err("请先启用远端控制。".into());
                }
                util::allowed(
                    &input,
                    &[
                        "id",
                        "deviceId",
                        "workspaceId",
                        "repositoryId",
                        "action",
                        "kind",
                        "previewId",
                        "previousId",
                        "paths",
                        "summary",
                        "description",
                    ],
                )?;
                uuid::Uuid::parse_str(text(&input, "id")).map_err(|_| "控制命令编号无效。")?;
                let repository = util::field(&input, "repositoryId", 512)?;
                let catalog = self.service.catalog().await?;
                if !catalog["repositories"].as_array().is_some_and(|r| {
                    r.iter().any(|r| {
                        r["available"] == true
                            && repository_id(text(r, "url")).is_ok_and(|id| id == repository)
                    })
                }) {
                    return Err("当前Git账号已不能访问此仓库。".into());
                }
                self.http(&c, "requests", Some(&input)).await
            }
            "cancel" | "revoke" => {
                let c = self.config.borrow().clone();
                util::allowed(
                    &input,
                    &[if method == "cancel" { "id" } else { "deviceId" }],
                )?;
                self.http(&c, method, Some(&input)).await?;
                if method == "revoke" && input["deviceId"] == c.device_id {
                    self.save_config(Configuration {
                        name: c.name,
                        ..Default::default()
                    })
                    .await?;
                    self.workspaces.write().await.clear();
                    *self.state.write().await = json!({"connection":"disabled","error":"","devices":[],"jobs":[],"teams":[],"repositories":[]});
                }
                self.snapshot().await
            }
            _ => Err("未知的远端控制操作。".into()),
        }
    }
    async fn mapped(
        &self,
        c: &Configuration,
        allowed: &Value,
        teams: &Value,
        worktree_identity: bool,
    ) -> Result<BTreeMap<String, Workspace>> {
        let catalog = self.service.catalog().await?;
        let mut result = BTreeMap::new();
        for repository in catalog["repositories"]
            .as_array()
            .ok_or("仓库清单无效。")?
            .iter()
            .filter(|r| r["available"] == true)
        {
            let repo_id = text(repository, "id");
            let remote = repository_id(text(repository, "url"))?;
            if !allowed
                .as_array()
                .is_some_and(|ids| ids.iter().any(|id| id == &remote))
            {
                continue;
            }
            let tasks = self.presence.source_tasks(repo_id).await?;
            let scopes = teams
                .as_array()
                .ok_or("组织范围无效。")?
                .iter()
                .filter(|t| {
                    t["projects"]
                        .as_array()
                        .is_some_and(|p| p.iter().any(|p| p == &remote))
                })
                .collect::<Vec<_>>();
            for task in &tasks {
                let scopes = if scopes.is_empty() {
                    vec![None]
                } else {
                    scopes.iter().map(|s| Some(*s)).collect()
                };
                for scope in scopes {
                    let id = util::digest(format!(
                        "{}:{}:{remote}:{}",
                        c.server_url,
                        scope.map(|s| text(s, "id")).unwrap_or("personal"),
                        text(task, "path")
                    ));
                    let actions = if task["branch"] == "Detached HEAD" {
                        vec!["abort"]
                    } else {
                        vec!["commit", "submit", "abort", "discard"]
                    };
                    let mut public = json!({"id":id,"repositoryId":remote,"branch":task["branch"],"head":task["head"],"teamId":scope.map(|s|s["id"].clone()),"actions":actions});
                    if worktree_identity {
                        public["worktreeId"] = json!(util::digest(text(task, "path")));
                    }
                    if let Some(scope) = scope {
                        public["scopeVersion"] = scope["revision"].clone();
                    }
                    result.insert(
                        id.clone(),
                        Workspace {
                            repository: repo_id.to_owned(),
                            task: text(task, "id").into(),
                            public,
                        },
                    );
                }
            }
        }
        Ok(result)
    }
    async fn poll(self: &Arc<Self>, c: &Configuration) -> Result<()> {
        let mut state = self.http(c, "state", None).await?;
        if state["version"] != 1
            || state["deviceId"] != c.device_id
            || state["userId"] != c.user_id
            || !state["devices"].is_array()
            || !state["pending"].is_array()
        {
            return Err("远端控制身份或状态无效。".into());
        }
        self.bound(c)?;
        let mapped = self
            .mapped(
                c,
                &state["repositories"],
                &state["teams"],
                state["worktreeIdentity"] == true,
            )
            .await?;
        self.http(c, "announce", Some(&json!({"name":c.name,"workspaces":mapped.values().map(|w|&w.public).collect::<Vec<_>>()}))).await?;
        *self.workspaces.write().await = mapped;
        state["connection"] = json!("connected");
        state["error"] = json!("");
        let pending = state["pending"].as_array().unwrap().clone();
        if self.config.borrow().device_id != c.device_id || !self.enabled() {
            return Ok(());
        }
        *self.state.write().await = state;
        for job in pending {
            let id = util::field(&job, "id", 100)?;
            uuid::Uuid::parse_str(&id).map_err(|_| "服务器返回无效命令编号。")?;
            let mut running = self.running.lock().await;
            if running.contains_key(&id) || (running.len() >= 8 && job["action"] != "abort") {
                continue;
            }
            let cancel = CancellationToken::new();
            running.insert(
                id.clone(),
                (text(&job, "workspaceId").into(), cancel.clone()),
            );
            drop(running);
            let control = self.clone();
            tokio::spawn(async move {
                let result = control.run_job(job, cancel).await;
                if let Err(error) = result {
                    control.state.write().await["error"] = json!(error);
                }
                control.running.lock().await.remove(&id);
            });
        }
        Ok(())
    }
    pub(crate) async fn authorize(&self, job: &Value) -> Result<Workspace> {
        let c = self.config.borrow().clone();
        if !c.enabled || c.device_id != text(job, "deviceId") {
            return Err("此设备已停用或命令目标已变化。".into());
        }
        let workspace = self
            .workspaces
            .read()
            .await
            .get(text(job, "workspaceId"))
            .cloned()
            .ok_or("目标工作目录未开放远端控制。")?;
        self.bound(&c)?;
        if workspace.public["repositoryId"] != job["repositoryId"] {
            return Err("命令不属于此项目。".into());
        }
        self.http(&c, "claim", Some(&json!({"id":job["id"]})))
            .await?;
        Ok(workspace)
    }
    async fn run_job(self: &Arc<Self>, job: Value, cancel: CancellationToken) -> Result<()> {
        let workspace = self.authorize(&job).await?;
        let id = text(&job, "id");
        let keys = [
            "id",
            "deviceId",
            "workspaceId",
            "repositoryId",
            "organizationId",
            "scopeVersion",
            "action",
            "kind",
            "previewId",
            "previousId",
            "paths",
            "summary",
            "description",
            "requesterDeviceId",
        ];
        let request: Value = job
            .as_object()
            .ok_or("远端命令无效。")?
            .iter()
            .filter(|(k, _)| keys.contains(&k.as_str()))
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect::<serde_json::Map<_, _>>()
            .into();
        let hash = util::digest(serde_json::to_vec(&request).map_err(|_| "命令无法编码。")?);
        let previous = self.records.lock().await.get(id).cloned();
        let completion = if let Some(previous) = previous {
            if previous.hash != hash {
                return Err("命令编号与原请求不一致，拒绝执行。".into());
            }
            previous.result.unwrap_or_else(|| json!({"id":id,"ok":false,"result":{"phase":"interrupted"},"error":"目标进程曾在执行中退出；已保留现场，请重新查看目标状态。不会自动重复提交。"}))
        } else {
            self.save_record(
                id,
                Record {
                    hash: hash.clone(),
                    result: None,
                    plan: None,
                },
            )
            .await?;
            let result = remote_git::run(self, &workspace, &job, &cancel).await;
            let completion = match result {
                Ok(result) => json!({"id":id,"ok":true,"result":result}),
                Err(error) => {
                    json!({"id":id,"ok":false,"error":error.chars().take(1900).collect::<String>()})
                }
            };
            let plan = self
                .records
                .lock()
                .await
                .get(id)
                .and_then(|record| record.plan.clone());
            self.save_record(
                id,
                Record {
                    hash,
                    result: Some(completion.clone()),
                    plan,
                },
            )
            .await?;
            completion
        };
        let c = self.config.borrow().clone();
        self.http(&c, "finish", Some(&completion)).await?;
        Ok(())
    }
}
pub(crate) fn repository_id(input: &str) -> Result<String> {
    let url = url::Url::parse(input).map_err(|_| "仓库远端身份无效。")?;
    let host = url.host_str().ok_or("仓库远端身份无效。")?;
    let authority = if let Some(port) = url.port() {
        format!("{host}:{port}")
    } else {
        host.to_owned()
    };
    Ok(format!("{}{}", authority, url.path().trim_end_matches('/')).to_lowercase())
}
