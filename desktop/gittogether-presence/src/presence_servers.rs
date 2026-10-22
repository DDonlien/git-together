use super::*;
use crate::{
    git,
    remote_control::repository_id,
    util::{self, text},
};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ServerConfiguration {
    pub url: String,
    pub enabled: bool,
    pub token: String,
    pub expires_at: u64,
    pub user_id: String,
    #[serde(default)]
    pub device_id: String,
    #[serde(default)]
    pub device_token: String,
    #[serde(default)]
    pub organizations: Vec<Organization>,
}
impl ServerConfiguration {
    pub fn home(c: &Configuration) -> Self {
        Self {
            url: c.server_url.clone(),
            enabled: true,
            token: c.server_token.clone(),
            expires_at: c.account.as_ref().map(|a| a.expires_at).unwrap_or(u64::MAX),
            user_id: c.account.as_ref().map(|a| a.id.clone()).unwrap_or_default(),
            device_id: String::new(),
            device_token: String::new(),
            organizations: vec![],
        }
    }
}
#[derive(Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(super) struct Organization {
    pub id: String,
    pub name: String,
    pub role: String,
    pub projects: Vec<String>,
    pub revision: u64,
    #[serde(default)]
    pub server_id: String,
    #[serde(default)]
    pub server_url: String,
    #[serde(default)]
    pub connected: bool,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ServerStatus {
    pub id: String,
    pub url: String,
    pub enabled: bool,
    pub connection: String,
    pub error: String,
}
impl ServerStatus {
    pub fn new(c: &ServerConfiguration) -> Self {
        Self {
            id: util::digest(&c.url),
            url: c.url.clone(),
            enabled: c.enabled,
            connection: if c.enabled { "connecting" } else { "disabled" }.into(),
            error: String::new(),
        }
    }
}
#[derive(Clone)]
pub(super) struct RemoteState {
    sessions: Vec<Session>,
    connected: bool,
    error: String,
    catalogue_error: String,
}
#[derive(Clone, Default)]
pub(super) struct NativeProjects {
    checked: Option<tokio::time::Instant>,
    revision: Option<u64>,
    projects: BTreeMap<String, Vec<Project>>,
    tasks: BTreeMap<String, Vec<Value>>,
}

impl Presence {
    pub(crate) fn control_servers(&self) -> Vec<String> {
        let c = self.config.borrow();
        if !c.enabled || c.account.is_none() {
            return vec![];
        }
        c.servers
            .iter()
            .filter(|s| s.enabled)
            .map(|s| s.url.clone())
            .collect()
    }
    pub(crate) fn binding_for(&self, url: &str) -> Result<String> {
        let c = self.config.borrow();
        if !c.enabled || c.account.is_none() || !c.servers.iter().any(|s| s.enabled && s.url == url)
        {
            return Err("Presence已停用、账号退出或服务器已移除。".into());
        }
        Ok(util::digest(if url == c.server_url {
            format!("{}:{}", url, c.account.as_ref().unwrap().id)
        } else {
            format!(
                "{}:{}:{}",
                url,
                c.server_url,
                c.account.as_ref().unwrap().id
            )
        }))
    }
    pub(crate) fn home_server(&self) -> String {
        self.config.borrow().server_url.clone()
    }
    pub(crate) async fn prepare_server(&self, url: &str) -> Result<(String, String)> {
        let (url, token) = self.access_for(url)?;
        let c = self.config.borrow().clone();
        let catalog = self.service.catalog().await?;
        let repositories = catalog["repositories"]
            .as_array()
            .ok_or("Git仓库清单无效。")?
            .iter()
            .filter(|r| r["available"] == true)
            .map(|r| repository_id(text(r, "url")))
            .collect::<Result<BTreeSet<_>>>()?;
        let value = self
            .account_http(
                &url,
                "catalogue",
                Some(&token),
                Some(&json!({"deviceId":c.device_id,"repositories":repositories})),
            )
            .await?;
        let _guard = self.configure_lock.lock().await;
        let mut latest = self.config.borrow().clone();
        if latest.server_url != c.server_url
            || latest.account.as_ref().map(|a| &a.id) != c.account.as_ref().map(|a| &a.id)
        {
            return Err("Presence身份已改变。".into());
        }
        let server = latest
            .servers
            .iter_mut()
            .find(|s| s.url == url)
            .ok_or("服务器已移除。")?;
        Self::organization_metadata(server, &value)?;
        self.save_cached(latest).await?;
        Ok((url, token))
    }
    pub(crate) fn access_for(&self, url: &str) -> Result<(String, String)> {
        self.binding_for(url)?;
        let c = self.config.borrow();
        let s = c.servers.iter().find(|s| s.url == url).unwrap();
        if s.token.is_empty() || s.expires_at <= util::now() as u64 {
            return Err("Presence登录会话已过期，请重新登录账号服务。".into());
        }
        Ok((s.url.clone(), s.token.clone()))
    }
    pub(super) fn connection_credentials(&self, url: &str) -> Result<(String, String)> {
        let c = self.config.borrow();
        let s = c
            .servers
            .iter()
            .find(|s| s.enabled && s.url == url)
            .ok_or("服务器已停用。")?;
        if !s.device_token.is_empty() {
            return Ok((s.device_id.clone(), s.device_token.clone()));
        }
        if s.expires_at <= util::now() as u64 {
            return Err("Presence登录已过期，请重新登录。".into());
        }
        Ok((String::new(), s.token.clone()))
    }
    pub(crate) async fn save_device_access(&self, url: &str, id: &str, token: &str) -> Result<()> {
        let _guard = self.configure_lock.lock().await;
        let mut c = self.config.borrow().clone();
        let s = c
            .servers
            .iter_mut()
            .find(|s| s.url == url)
            .ok_or("服务器已移除。")?;
        if s.device_id == id && s.device_token == token {
            return Ok(());
        }
        s.device_id = id.into();
        s.device_token = token.into();
        self.save_cached(c).await
    }
    pub(super) async fn save_cached(&self, c: Configuration) -> Result<()> {
        if self.persistent {
            credentials::save(
                &self.root.join("presence-v1.encrypted"),
                &serde_json::to_value(&c).map_err(|_| "Presence配置编码失败。")?,
            ).await?;
        }
        // Catalog and role metadata must not restart every healthy WebSocket.
        self.config.send_if_modified(|current| {
            *current = c;
            false
        });
        Ok(())
    }
    pub(super) async fn cache_organizations(
        &self,
        url: &str,
        organizations: Vec<Organization>,
    ) -> Result<()> {
        let _guard = self.configure_lock.lock().await;
        let mut c = self.config.borrow().clone();
        let server = c
            .servers
            .iter_mut()
            .find(|s| s.enabled && s.url == url)
            .ok_or("服务器已停用。")?;
        let previous = server.organizations.clone();
        Self::organization_metadata(server, &json!({"organizations":organizations}))?;
        if previous != server.organizations {
            self.save_cached(c).await?;
        }
        Ok(())
    }
    pub(super) async fn authenticated_server(
        &self,
        url: &str,
        c: &Configuration,
    ) -> Result<ServerConfiguration> {
        let a = c.account.as_ref().ok_or("请先登录Presence账号。")?;
        let value = if url == c.server_url {
            self.account_http(url, "status", Some(&c.server_token), None)
                .await?
        } else {
            let challenge = self
                .account_http(
                    url,
                    "identity/challenge",
                    None,
                    Some(&json!({"issuer":if a.issuer.is_empty(){&c.server_url}else{&a.issuer}})),
                )
                .await?;
            if challenge["audience"] != url {
                return Err("服务器返回了不匹配的身份接收地址。".into());
            }
            let ticket = self
                .account_http(
                    &c.server_url,
                    "identity/ticket",
                    Some(&c.server_token),
                    Some(&json!({"audience":url,"nonce":challenge["nonce"]})),
                )
                .await?;
            self.account_http(
                url,
                "identity/exchange",
                None,
                Some(&json!({"assertion":ticket["assertion"],"delegation":ticket["delegation"]})),
            )
            .await?
        };
        let expected = if a.identity_id.is_empty() {
            util::digest(format!("{}\0{}", c.server_url, a.id))
        } else {
            a.identity_id.clone()
        };
        if value["account"]["identityId"] != expected || value["automaticManagement"] != true {
            return Err("服务器未确认当前个人身份或不支持自动纳管。".into());
        }
        let token = if url == c.server_url {
            c.server_token.clone()
        } else {
            util::field(&value, "token", 512)?
        };
        let mut server = ServerConfiguration {
            url: url.into(),
            enabled: true,
            token,
            expires_at: if url == c.server_url {
                a.expires_at
            } else {
                value["expiresAt"].as_u64().ok_or("账号有效期无效。")?
            },
            user_id: util::field(&value["account"], "id", 160)?,
            device_id: String::new(),
            device_token: String::new(),
            organizations: vec![],
        };
        Self::organization_metadata(&mut server, &value)?;
        Ok(server)
    }
    fn organization_metadata(server: &mut ServerConfiguration, value: &Value) -> Result<()> {
        let mut organizations: Vec<Organization> =
            serde_json::from_value(value["organizations"].clone())
                .map_err(|_| "服务器组织范围无效。")?;
        if organizations.len() > 512
            || organizations.iter().any(|o| {
                !valid_id(&o.id)
                    || o.name.is_empty()
                    || o.name.len() > 480
                    || !matches!(o.role.as_str(), "owner" | "admin" | "member")
                    || o.projects.len() > 4096
            })
        {
            return Err("服务器返回异常组织信息，未使用。".into());
        }
        for o in &mut organizations {
            o.server_id = util::digest(&server.url);
            o.server_url = server.url.clone();
            o.connected = true;
        }
        server.organizations = organizations;
        Ok(())
    }
    pub(super) async fn server_command(&self, method: &str, input: Value) -> Result<Value> {
        let _guard = self.configure_lock.lock().await;
        let mut c = self.config.borrow().clone();
        if c.account.is_none() {
            return Err("请先登录Presence账号。".into());
        }
        match method {
            "addServer" => {
                util::allowed(&input, &["serverUrl"])?;
                let url = server_url(&util::field(&input, "serverUrl", 2048)?)?.to_string();
                if c.servers.iter().any(|s| s.url == url) {
                    return Err("此服务器已添加。".into());
                }
                if c.servers.len() >= 32 {
                    return Err("最多连接32台Presence服务器。".into());
                }
                let server = self.authenticated_server(&url, &c).await?;
                c.servers.push(server);
            }
            "selectServer" => {
                util::allowed(&input, &["serverId", "enabled"])?;
                let id = util::field(&input, "serverId", 64)?;
                let enabled = input["enabled"].as_bool().ok_or("选择无效。")?;
                let index = c
                    .servers
                    .iter()
                    .position(|s| util::digest(&s.url) == id)
                    .ok_or("此服务器不存在。")?;
                if enabled {
                    let old = c.servers[index].clone();
                    let mut next = self.authenticated_server(&old.url, &c).await?;
                    next.device_id = old.device_id;
                    next.device_token = old.device_token;
                    c.servers[index] = next;
                } else {
                    c.servers[index].enabled = false;
                }
            }
            "removeServer" => {
                util::allowed(&input, &["serverId"])?;
                let id = util::field(&input, "serverId", 64)?;
                if !c.servers.iter().any(|s| util::digest(&s.url) == id) {
                    return Err("服务器已移除。".into());
                }
                c.servers.retain(|s| util::digest(&s.url) != id);
            }
            _ => return Err("未知服务器操作。".into()),
        }
        self.save_account(c, json!(null), String::new()).await?;
        self.account_snapshot().await
    }
    pub(super) async fn remote_loops(&self, c: Configuration, generation: u64) {
        let connections = c
            .servers
            .iter()
            .filter(|s| s.enabled)
            .map(|s| {
                let mut child = c.clone();
                child.server_url = s.url.clone();
                self.remote_loop(child, generation)
            })
            .collect::<Vec<_>>();
        if connections.is_empty() {
            std::future::pending::<()>().await;
        }
        tokio::select! { _=futures_util::future::join_all(connections)=>{}, _=self.catalogue_loop(generation)=>{} }
    }
    async fn catalogue_loop(&self, generation: u64) {
        loop {
            let catalog = self.service.catalog().await;
            if let Ok(catalog) = catalog {
                let c = self.config.borrow().clone();
                let repositories = catalog["repositories"]
                    .as_array()
                    .map(|a| {
                        a.iter()
                            .filter(|r| r["available"] == true)
                            .filter_map(|r| repository_id(text(r, "url")).ok())
                            .collect::<BTreeSet<_>>()
                    })
                    .unwrap_or_default();
                for original in c.servers.iter().filter(|s| s.enabled) {
                    let (method, token) = if original.device_token.is_empty() {
                        ("catalogue", &original.token)
                    } else {
                        ("control/catalogue", &original.device_token)
                    };
                    match self
                        .account_http(
                            &original.url,
                            method,
                            Some(token),
                            Some(&json!({"deviceId":c.device_id,"repositories":repositories})),
                        )
                        .await
                    {
                        Ok(value) => {
                            self.catalogue_error(generation, &original.url, String::new())
                                .await;
                            let mut current = original.clone();
                            if let Err(error) = Self::organization_metadata(&mut current, &value) {
                                self.catalogue_error(generation, &original.url, error).await;
                                continue;
                            }
                            let _guard = self.configure_lock.lock().await;
                            let mut latest = self.config.borrow().clone();
                            if latest.server_url != c.server_url
                                || latest.account.as_ref().map(|a| &a.id)
                                    != c.account.as_ref().map(|a| &a.id)
                            {
                                break;
                            }
                            if let Some(s) =
                                latest.servers.iter_mut().find(|s| s.url == original.url)
                            {
                                if s.organizations != current.organizations {
                                    s.organizations = current.organizations;
                                    if let Err(error) = self.save_cached(latest).await {
                                        self.catalogue_error(generation, &original.url, error)
                                            .await;
                                    }
                                }
                            }
                        }
                        Err(error) => {
                            self.catalogue_error(generation, &original.url, error).await;
                        }
                    }
                }
            }
            tokio::time::sleep(Duration::from_secs(10)).await;
        }
    }
    async fn catalogue_error(&self, generation: u64, url: &str, error: String) {
        let mut state = self.state.write().await;
        if state.generation != generation {
            return;
        }
        let id = util::digest(url);
        state
            .remote
            .entry(id.clone())
            .or_insert(RemoteState {
                sessions: vec![],
                connected: false,
                error: String::new(),
                catalogue_error: String::new(),
            })
            .catalogue_error = error.clone();
        let socket_error = state
            .remote
            .get(&id)
            .map(|r| r.error.clone())
            .unwrap_or_default();
        if let Some(s) = state.servers.iter_mut().find(|s| s.id == id) {
            s.error = if socket_error.is_empty() {
                error
            } else {
                socket_error
            };
        }
    }
    pub(super) async fn remote_update(
        &self,
        generation: u64,
        url: &str,
        sessions: Option<Vec<Session>>,
        error: String,
    ) {
        let c = self.config.borrow().clone();
        let id = util::digest(url);
        let mut state = self.state.write().await;
        if state.generation != generation {
            return;
        }
        let connected = sessions.is_some();
        let entry = state.remote.entry(id.clone()).or_insert(RemoteState {
            sessions: vec![],
            connected: false,
            error: String::new(),
            catalogue_error: String::new(),
        });
        if let Some(mut sessions) = sessions {
            for s in &mut sessions {
                s.server_id = id.clone();
            }
            entry.sessions = sessions;
        } else {
            for s in &mut entry.sessions {
                s.alive = false;
            }
        }
        entry.connected = connected;
        entry.error = error;
        state.servers = c
            .servers
            .iter()
            .map(|s| {
                let mut public = ServerStatus::new(s);
                if !c.enabled || !s.enabled {
                    public.connection = "disabled".into();
                } else if let Some(r) = state.remote.get(&public.id) {
                    public.connection = if r.connected { "connected" } else { "offline" }.into();
                    public.error = if r.error.is_empty() {
                        r.catalogue_error.clone()
                    } else {
                        r.error.clone()
                    };
                }
                public
            })
            .collect();
        state.sessions = state
            .remote
            .iter()
            .filter(|(id, _)| state.servers.iter().any(|s| s.enabled && &s.id == *id))
            .flat_map(|(_, r)| r.sessions.clone())
            .collect();
        state.organizations = c
            .servers
            .iter()
            .filter(|s| s.enabled)
            .flat_map(|s| {
                s.organizations.iter().cloned().map(|mut o| {
                    o.connected = state.remote.get(&o.server_id).is_some_and(|r| r.connected);
                    o
                })
            })
            .collect();
        state.connection = if state.servers.iter().any(|s| s.connection == "connected") {
            "connected"
        } else if state.servers.iter().any(|s| s.enabled) {
            "offline"
        } else {
            "disabled"
        }
        .into();
        state.error.clear();
    }
    pub(super) async fn source_loop(&self, generation: u64) {
        if self.config.borrow().account.is_none() {
            std::future::pending::<()>().await;
        }
        loop {
            if let Err(error) = self.source_projects().await {
                let mut cache = self.native_projects.lock().await;
                cache.tasks.clear();
                for project in cache.projects.values_mut().flatten() {
                    invalidate_project(project);
                }
                drop(cache);
                self.update(generation, |state| state.local_error = error)
                    .await;
            }
            tokio::time::sleep(Duration::from_secs(5)).await;
        }
    }
    pub(super) async fn source_snapshot(&self) -> Vec<Project> {
        let cache = self.native_projects.lock().await;
        let mut projects: BTreeMap<(String, String), Project> = BTreeMap::new();
        // Two saved Git identities can refer to the same physical worktree.
        for project in cache.projects.values().flatten() {
            let key = (project.repository_id.clone(), project.worktree_id.clone());
            if projects
                .get(&key)
                .is_none_or(|existing| !existing.git_ready)
            {
                projects.insert(key, project.clone());
            }
        }
        projects.into_values().collect()
    }
    pub(crate) async fn source_tasks(&self, repository: &str) -> Result<Vec<Value>> {
        Ok(self
            .native_projects
            .lock()
            .await
            .tasks
            .get(repository)
            .cloned()
            .unwrap_or_default())
    }
    pub(super) async fn source_projects(&self) -> Result<Vec<Project>> {
        let catalog = self.service.catalog().await?;
        let mut cache = self.native_projects.lock().await.clone();
        let revision = catalog["revision"].as_u64();
        if cache.revision == revision
            && cache
                .checked
                .is_some_and(|t| t.elapsed() < Duration::from_secs(5))
        {
            return Ok(cache.projects.values().flatten().cloned().collect());
        }
        let mut active = BTreeSet::new();
        let mut errors = vec![];
        let linked: BTreeSet<_> = catalog["links"]
            .as_array()
            .ok_or("本机工作区关联清单无效。")?
            .iter()
            .map(|link| text(link, "repositoryId"))
            .collect();
        for repository in catalog["repositories"]
            .as_array()
            .ok_or("Git仓库清单无效。")?
            .iter()
            .filter(|r| r["available"] == true && linked.contains(text(r, "id")))
        {
            let id = text(repository, "id").to_owned();
            active.insert(id.clone());
            let remote = repository_id(text(repository, "url"))?;
            match self.service.control_tasks(&id).await {
                Ok(tasks) => {
                    let mut projects = vec![];
                    for task in &tasks {
                        let root = PathBuf::from(text(task, "path"));
                        let mut files: BTreeMap<String, File> = BTreeMap::new();
                        for changed in task["files"].as_array().ok_or("工作区文件状态无效。")?
                        {
                            let path = text(changed, "path").to_owned();
                            util::file_path(&path)?;
                            files.insert(
                                path.clone(),
                                File {
                                    path,
                                    git: Fact::Dirty,
                                    editor: Fact::Unknown,
                                    dirty: Fact::Dirty,
                                    pending: false,
                                    tracked: changed["tracked"] == true,
                                    index: String::new(),
                                    worktree: String::new(),
                                    activity: Activity::Idle,
                                    sources: vec![],
                                },
                            );
                        }
                        let editor = self.editor_roots.read().await.get(&root).cloned();
                        let editor_connected = self.state.read().await.bridge.connected;
                        if let Some(editor) = editor {
                            for mut f in editor.files {
                                if !editor_connected {
                                    f.editor = Fact::Unknown;
                                    f.activity = Activity::Idle;
                                    for source in &mut f.sources {
                                        source.alive = false;
                                        source.unsaved = Fact::Unknown;
                                        source.activity = Activity::Idle;
                                    }
                                }
                                if let Some(existing) = files.get_mut(&f.path) {
                                    existing.editor = f.editor;
                                    existing.activity = f.activity;
                                    existing.sources = f.sources;
                                } else {
                                    f.git = Fact::Clean;
                                    f.dirty = if f.editor == Fact::Dirty {
                                        Fact::Dirty
                                    } else {
                                        Fact::Unknown
                                    };
                                    files.insert(f.path.clone(), f);
                                }
                            }
                        }
                        let unpublished =
                            git::read(&root, &["rev-list", "--count", "@{upstream}..HEAD"])
                                .await
                                .ok()
                                .and_then(|s| s.trim().parse::<u64>().ok());
                        let project = Project {
                            repository_id: remote.clone(),
                            worktree_id: util::digest(text(task, "path")),
                            branch: Some(text(task, "branch").into()),
                            head: Some(text(task, "head").into()),
                            git_ready: true,
                            unpublished_commits: unpublished,
                            files: files.into_values().collect(),
                            organization_id: None,
                        };
                        if !valid_project(&project) {
                            return Err("本机Presence状态无效，未发布异常数据。".into());
                        }
                        projects.push(project);
                    }
                    cache.tasks.insert(id.clone(), tasks);
                    cache.projects.insert(id, projects);
                }
                Err(error) => {
                    errors.push(error);
                    cache.tasks.remove(&id);
                    if let Some(previous) = cache.projects.get_mut(&id) {
                        for p in previous {
                            invalidate_project(p);
                        }
                    }
                }
            }
        }
        cache.tasks.retain(|id, _| active.contains(id));
        cache.projects.retain(|id, _| active.contains(id));
        cache.checked = Some(tokio::time::Instant::now());
        cache.revision = revision;
        let projects = cache.projects.values().flatten().cloned().collect();
        *self.native_projects.lock().await = cache;
        self.state.write().await.local_error = if errors.is_empty() {
            String::new()
        } else {
            format!("部分工作区不可读取，暂不接受远端操作：{}", errors[0])
        };
        Ok(projects)
    }
}

fn invalidate_project(project: &mut Project) {
    project.git_ready = false;
    project.unpublished_commits = None;
    for file in &mut project.files {
        file.git = Fact::Unknown;
        file.editor = Fact::Unknown;
        file.dirty = Fact::Unknown;
        file.pending = true;
        file.activity = Activity::Idle;
        for source in &mut file.sources {
            source.alive = false;
            source.unsaved = Fact::Unknown;
            source.activity = Activity::Idle;
        }
    }
}
