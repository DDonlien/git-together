use crate::{credentials, util::Result};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::Arc,
    time::Duration,
};
use tokio::sync::{watch, Mutex, RwLock};
use tokio_tungstenite::{
    connect_async_with_config,
    tungstenite::{client::IntoClientRequest, protocol::WebSocketConfig, Message},
};
use url::Url;
#[path = "presence_account.rs"]
mod account;
#[path = "presence_servers.rs"]
mod servers;
use servers::{Organization, ServerConfiguration, ServerStatus};

pub const DEFAULT_SERVER: &str = "https://git.freshli4.com:10443/presence/";
const MAX_MESSAGE: usize = 16 * 1024 * 1024;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Configuration {
    version: u8,
    #[serde(default)]
    enabled: bool,
    server_url: String,
    server_name: String,
    server_token: String,
    device_id: String,
    #[serde(default)]
    account: Option<account::Account>,
    #[serde(default)]
    servers: Vec<ServerConfiguration>,
}
impl Default for Configuration {
    fn default() -> Self {
        Self {
            version: 1,
            enabled: false,
            server_url: DEFAULT_SERVER.into(),
            server_name: "NAS".into(),
            server_token: String::new(),
            device_id: format!("gittogether-{}", uuid::Uuid::new_v4()),
            account: None,
            servers: vec![],
        }
    }
}

#[derive(Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Fact {
    Clean,
    Dirty,
    Unknown,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Activity {
    Idle,
    Viewing,
    Editing,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Source {
    source_id: String,
    kind: String,
    alive: bool,
    unsaved: Fact,
    activity: Activity,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct File {
    path: String,
    git: Fact,
    editor: Fact,
    dirty: Fact,
    pending: bool,
    tracked: bool,
    index: String,
    worktree: String,
    activity: Activity,
    sources: Vec<Source>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    repository_id: String,
    worktree_id: String,
    branch: Option<String>,
    head: Option<String>,
    git_ready: bool,
    unpublished_commits: Option<u64>,
    files: Vec<File>,
    #[serde(default)]
    organization_id: Option<String>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    session_id: String,
    user_id: String,
    display_name: String,
    avatar_url: Option<String>,
    device_id: String,
    alive: bool,
    last_seen: u64,
    projects: Vec<Project>,
    #[serde(default)]
    identity_id: String,
    #[serde(default)]
    server_id: String,
    #[serde(default)]
    device_name: Option<String>,
}
#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
enum ServerMessage {
    #[serde(rename_all = "camelCase")]
    Welcome {
        version: u8,
        session_id: String,
        heartbeat_ms: u64,
        ttl_ms: u64,
    },
    World {
        version: u8,
        revision: u64,
        sessions: Vec<Session>,
        #[serde(default)]
        organizations: Vec<Organization>,
    },
    Error {
        code: String,
    },
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct BridgeStatus {
    connected: bool,
    error: String,
    projects: Vec<Project>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Status {
    #[serde(skip)]
    generation: u64,
    version: u8,
    enabled: bool,
    configured: bool,
    server_url: String,
    server_name: String,
    connection: String,
    error: String,
    sessions: Vec<Session>,
    local_error: String,
    bridge: BridgeStatus,
    account: Option<account::Account>,
    account_service: Value,
    servers: Vec<ServerStatus>,
    organizations: Vec<Organization>,
    #[serde(skip)]
    remote: std::collections::BTreeMap<String, servers::RemoteState>,
}
impl Status {
    fn new(config: &Configuration, error: String) -> Self {
        Self {
            generation: 0,
            version: 1,
            enabled: config.enabled,
            configured: !config.server_token.is_empty(),
            server_url: config.server_url.clone(),
            server_name: config.server_name.clone(),
            connection: if config.enabled {
                "connecting"
            } else {
                "disabled"
            }
            .into(),
            error,
            sessions: vec![],
            local_error: String::new(),
            bridge: BridgeStatus {
                connected: false,
                error: String::new(),
                projects: vec![],
            },
            account: config.account.clone(),
            account_service: json!(null),
            servers: config.servers.iter().map(ServerStatus::new).collect(),
            organizations: config
                .servers
                .iter()
                .filter(|s| s.enabled)
                .flat_map(|s| {
                    s.organizations.iter().cloned().map(|mut o| {
                        o.connected = false;
                        o
                    })
                })
                .collect(),
            remote: std::collections::BTreeMap::new(),
        }
    }
}

pub struct Presence {
    service: Arc<crate::service::Service>,
    root: PathBuf,
    private_directory: PathBuf,
    persistent: bool,
    config: watch::Sender<Configuration>,
    state: RwLock<Status>,
    configure_lock: Mutex<()>,
    editor_roots: RwLock<std::collections::BTreeMap<PathBuf, Project>>,
    native_projects: Mutex<servers::NativeProjects>,
}
impl Presence {
    pub fn new(
        root: PathBuf,
        persistent: bool,
        service: Arc<crate::service::Service>,
    ) -> Result<Arc<Self>> {
        let directory = std::env::var_os("GITTOGETHER_PRESENCE_CONFIG_DIR").map(PathBuf::from).unwrap_or(crate::platform::home()?.join(".config/git-presence"));
        let loaded = (|| -> Result<Configuration> {
            let saved = if persistent {
                credentials::load(&root.join("presence-v1.encrypted"), "GitTogether")?
            } else {
                None
            };
            let value = if let Some(value) = saved {
                Some(value)
            } else {
                private_json(&directory.join("gittogether.local.json"))?
            };
            let Some(value) = value else {
                return Ok(Configuration::default());
            };
            let config: Configuration = serde_json::from_value(value)
                .map_err(|_| "Presence 配置格式无效；原文件已保留。")?;
            validate_configuration(&config)?;
            Ok(config)
        })();
        let (mut config, error) = match loaded {
            Ok(c) => (c, String::new()),
            Err(e) => (Configuration::default(), e),
        };
        if config.servers.is_empty() && !config.server_token.is_empty() {
            config.servers.push(ServerConfiguration::home(&config));
        }
        let (tx, mut rx) = watch::channel(config.clone());
        let presence = Arc::new(Self {
            service,
            root,
            private_directory: directory,
            persistent,
            config: tx,
            state: RwLock::new(Status::new(&config, error)),
            configure_lock: Mutex::new(()),
            editor_roots: RwLock::new(std::collections::BTreeMap::new()),
            native_projects: Mutex::new(servers::NativeProjects::default()),
        });
        let weak = Arc::downgrade(&presence);
        tokio::spawn(async move {
            loop {
                let config = rx.borrow_and_update().clone();
                let Some(presence) = weak.upgrade() else {
                    break;
                };
                if !config.enabled {
                    drop(presence);
                    if rx.changed().await.is_err() {
                        break;
                    }
                    continue;
                }
                let generation = presence.state.read().await.generation;
                tokio::select! {
                    biased;
                    changed = rx.changed() => { if changed.is_err() { break; } }
                    _ = presence.remote_loops(config, generation) => {}
                    _ = presence.bridge_loop(generation) => {}
                }
            }
        });
        Ok(presence)
    }

    pub async fn command(&self, method: &str, input: Value) -> Result<Value> {
        if matches!(
            method,
            "accountStatus" | "register" | "login" | "logout" | "openAccount"
        ) {
            return self.account_command(method, input).await;
        }
        if matches!(method, "addServer" | "selectServer" | "removeServer") {
            return self.server_command(method, input).await;
        }
        match method {
            "status" => {}
            "configure" => {
                #[derive(Deserialize)]
                #[serde(rename_all = "camelCase", deny_unknown_fields)]
                struct Input {
                    enabled: bool,
                }
                let input: Input =
                    serde_json::from_value(input).map_err(|_| "Presence 设置无效。")?;
                let _guard = self.configure_lock.lock().await;
                let mut config = self.config.borrow().clone();
                config.enabled = input.enabled;
                validate_configuration(&config)?;
                if self.persistent {
                    credentials::save(
                        &self.root.join("presence-v1.encrypted"),
                        &serde_json::to_value(&config).map_err(|_| "Presence 设置无法编码。")?,
                    )?;
                }
                let mut state = self.state.write().await;
                let generation = state.generation + 1;
                *state = Status::new(&config, String::new());
                state.generation = generation;
                self.config.send_replace(config);
            }
            "reconnect" => {
                let _guard = self.configure_lock.lock().await;
                let config = self.config.borrow().clone();
                if !config.enabled {
                    return Err("请先启用 Presence 插件。".into());
                }
                let mut state = self.state.write().await;
                state.generation += 1;
                state.connection = "connecting".into();
                state.error.clear();
                for session in &mut state.sessions {
                    session.alive = false;
                }
                state.bridge.connected = false;
                self.config.send_replace(config);
            }
            _ => return Err("未知的 Presence 操作。".into()),
        }
        self.account_snapshot().await
    }

    async fn update(&self, generation: u64, apply: impl FnOnce(&mut Status)) {
        let mut state = self.state.write().await;
        if state.generation == generation {
            apply(&mut state);
        }
    }

    async fn remote_loop(&self, config: Configuration, generation: u64) {
        let mut retry = 1u64;
        loop {
            match self.remote_session(&config, generation).await {
                Ok(()) => {}
                Err(error) => {
                    self.remote_update(generation, &config.server_url, None, error)
                        .await
                }
            }
            tokio::time::sleep(Duration::from_secs(retry)).await;
            retry = (retry * 2).min(30);
        }
    }

    async fn remote_session(&self, config: &Configuration, generation: u64) -> Result<()> {
        let mut url = server_url(&config.server_url)?
            .join("v1/ws")
            .map_err(|_| "Presence 地址无效。")?;
        url.set_scheme(if url.scheme() == "https" { "wss" } else { "ws" })
            .map_err(|_| "Presence 地址无效。")?;
        let credentials = self.connection_credentials(&config.server_url)?;
        let mut request = url
            .as_str()
            .into_client_request()
            .map_err(|_| "Presence 地址无效。")?;
        request.headers_mut().insert(
            "Authorization",
            format!("Bearer {}", credentials.1)
                .parse()
                .map_err(|_| "Presence 访问密钥无效。")?,
        );
        let limit = WebSocketConfig::default()
            .max_message_size(Some(MAX_MESSAGE))
            .max_frame_size(Some(MAX_MESSAGE));
        let (mut socket, _) = tokio::time::timeout(
            Duration::from_secs(12),
            connect_async_with_config(request, Some(limit), false),
        )
        .await
        .map_err(|_| "连接 Presence 服务器超时，正在自动重试。")?
        .map_err(|e| match e {
            tokio_tungstenite::tungstenite::Error::Http(response)
                if response.status().as_u16() == 401 || response.status().as_u16() == 403 =>
            {
                "Presence 访问密钥无效或未获授权，请检查服务器配置。".to_owned()
            }
            tokio_tungstenite::tungstenite::Error::Tls(_) => {
                "Presence 安全连接失败，请检查服务器证书。".to_owned()
            }
            _ => "无法连接 Presence 服务器，正在自动重试。".to_owned(),
        })?;
        socket
            .send(Message::Text(
                json!({"type":if config.account.is_some(){"bridge"}else{"observer"},"version":3,"deviceId":if credentials.0.is_empty(){&config.device_id}else{&credentials.0}})
                    .to_string()
                    .into(),
            ))
            .await
            .map_err(|_| "Presence 握手发送失败。")?;
        let welcome = tokio::time::timeout(Duration::from_secs(5), socket.next())
            .await
            .map_err(|_| "Presence 服务器握手超时。")?
            .ok_or("Presence 服务器已断开。")?
            .map_err(|_| "Presence 握手读取失败。")?;
        let ServerMessage::Welcome {
            version: 3,
            session_id,
            heartbeat_ms,
            ttl_ms,
        } = decode_message(welcome)?
        else {
            return Err("Presence 服务器不支持当前观察者协议。".into());
        };
        if !valid_id(&session_id)
            || !(50..=60_000).contains(&heartbeat_ms)
            || ttl_ms <= heartbeat_ms * 2
            || ttl_ms > 600_000
        {
            return Err("Presence 服务器心跳配置无效。".into());
        }
        let mut heartbeat = tokio::time::interval(Duration::from_millis(heartbeat_ms));
        heartbeat.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        let mut last_receive = tokio::time::Instant::now();
        let mut revision = None;
        let mut published = 0u64;
        let mut last_snapshot = None;
        loop {
            tokio::select! {
                _ = heartbeat.tick() => {
                    if config.account.is_some() {
                        let projects = self.source_snapshot().await;
                        let value=serde_json::to_value(projects).map_err(|_|"Presence本机状态编码失败。")?;
                        if last_snapshot.as_ref()!=Some(&value){published+=1;socket.send(Message::Text(json!({"type":"snapshot","version":3,"sessionId":session_id,"revision":published,"projects":value}).to_string().into())).await.map_err(|_|"Presence 本机状态发布失败。")?;last_snapshot=Some(value);}
                    }
                    if last_receive.elapsed() > Duration::from_millis(ttl_ms) { return Err("Presence 服务器续期超时，协作状态已变为未知。".into()); }
                    socket.send(Message::Text(json!({"type":"heartbeat","version":3,"sessionId":session_id}).to_string().into())).await.map_err(|_| "Presence 连接已断开，正在自动重试。")?;
                    socket.send(Message::Ping(vec![].into())).await.map_err(|_| "Presence 连接已断开。")?;
                }
                message = socket.next() => {
                    let message = message.ok_or("Presence 连接已断开，协作状态已变为未知。")?.map_err(|_| "Presence 连接读取失败。")?;
                    last_receive = tokio::time::Instant::now();
                    match message {
                        Message::Ping(_) | Message::Pong(_) => continue,
                        Message::Close(_) => return Err("Presence 连接已断开，正在自动重试。".into()),
                        other => match decode_message(other)? {
                            ServerMessage::World { version: 3, revision: current, sessions, organizations } => {
                                if sessions.len() > 2000 || sessions.iter().any(|s| !valid_session(s)) { return Err("Presence 服务器快照无效，未使用异常数据。".into()); }
                                if revision.is_some_and(|previous| current < previous) { return Err("Presence 服务器快照顺序无效。".into()); }
                                revision = Some(current);
                                self.cache_organizations(&config.server_url,organizations).await?;
                                self.remote_update(generation, &config.server_url, Some(sessions), String::new()).await;
                            },
                            ServerMessage::Error { code } => return Err(if code == "repository_forbidden" { "Presence 尚未授权访问这个仓库。" } else { "Presence 服务器拒绝了当前会话。" }.into()),
                            _ => return Err("Presence 服务器协议不匹配。".into()),
                        }
                    }
                }
            }
        }
    }

    async fn bridge_loop(&self, generation: u64) {
        let client = match reqwest::Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(Duration::from_secs(2))
            .build()
        {
            Ok(client) => client,
            Err(_) => {
                self.update(generation, |state| {
                    state.bridge.error = "本机 Bridge 读取服务无法启动。".into()
                })
                .await;
                return;
            }
        };
        loop {
            match self.read_bridge(&client).await {
                Ok(projects) => {
                    self.update(generation, |state| {
                        state.bridge = BridgeStatus {
                            connected: true,
                            error: String::new(),
                            projects,
                        }
                    })
                    .await
                }
                Err(error) => {
                    self.update(generation, |state| {
                        state.bridge.connected = false;
                        state.bridge.error = error;
                    })
                    .await
                }
            }
            tokio::time::sleep(Duration::from_secs(2)).await;
        }
    }

    pub(crate) async fn ensure_saved(&self, root: &Path, paths: &[String]) -> Result<()> {
        if private_json(&self.private_directory.join("connection.json"))?.is_none() {
            if self
                .editor_roots
                .read()
                .await
                .get(root)
                .is_some_and(|p| p.files.iter().any(|f| !f.sources.is_empty()))
            {
                return Err("目标编辑器的状态已失联，请先恢复连接或保存文件。".into());
            }
            return Ok(());
        }
        let client = reqwest::Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(Duration::from_secs(2))
            .build()
            .map_err(|_| "无法检查目标编辑器状态。")?;
        let read = self.read_bridge(&client).await;
        let roots = self.editor_roots.read().await;
        if let Some(project) = roots.get(root) {
            let observed = project.files.iter().any(|f| !f.sources.is_empty());
            if observed && read.is_err() {
                return Err("目标编辑器状态未知，请恢复连接后重试。".into());
            }
            if project.files.iter().any(|f| {
                paths.contains(&f.path) && !f.sources.is_empty() && f.editor != Fact::Clean
            }) {
                return Err("选中的文件在目标编辑器中尚未保存或状态未知，请先保存。".into());
            }
        }
        Ok(())
    }
    async fn read_bridge(&self, client: &reqwest::Client) -> Result<Vec<Project>> {
        let value = private_json(&self.private_directory.join("connection.json"))?
            .ok_or("本机 Bridge 尚未运行，本机协作状态未知。")?;
        #[derive(Deserialize)]
        struct Connection {
            version: u8,
            url: String,
            token: String,
        }
        let connection: Connection =
            serde_json::from_value(value).map_err(|_| "本机 Bridge 连接配置无效。")?;
        let url = server_url(&connection.url)?;
        if connection.version != 1
            || url.scheme() != "http"
            || !loopback(&url)
            || url.path() != "/"
            || !valid_token(&connection.token)
        {
            return Err("本机 Bridge 必须使用受保护的本机地址与独立密钥。".into());
        }
        let list = local_json(
            client,
            url.join("v1/projects")
                .map_err(|_| "本机 Bridge 地址无效。")?,
            &connection.token,
        )
        .await?;
        let projects = list["projects"]
            .as_array()
            .filter(|p| p.len() <= 100)
            .ok_or("本机 Bridge 项目清单无效。")?;
        let mut snapshots = vec![];
        let mut roots = std::collections::BTreeMap::new();
        for project in projects {
            let id = project["id"]
                .as_str()
                .filter(|s| valid_id(s))
                .ok_or("本机 Bridge 项目标识无效。")?;
            let mut view_url = url.join("v1/view").map_err(|_| "本机 Bridge 地址无效。")?;
            view_url.query_pairs_mut().append_pair("projectId", id);
            let view = local_json(client, view_url, &connection.token).await?;
            if view["type"] != "view" || view["version"] != 1 {
                return Err("本机 Bridge 协议不匹配。".into());
            }
            let snapshot: Project = serde_json::from_value(view["project"].clone())
                .map_err(|_| "本机 Bridge 快照无效。")?;
            if !valid_project(&snapshot) {
                return Err("本机 Bridge 文件状态无效。".into());
            }
            if let Some(root) = project["root"].as_str() {
                if let Ok(root) = dunce::canonicalize(root) {
                    roots.insert(root, snapshot.clone());
                }
            }
            snapshots.push(snapshot);
        }
        *self.editor_roots.write().await = roots;
        Ok(snapshots)
    }
}

pub(crate) fn private_json(path: &Path) -> Result<Option<Value>> {
    let metadata = match fs::symlink_metadata(path) {
        Ok(v) => v,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err("Presence 私有配置无法读取；原文件已保留。".into()),
    };
    if !metadata.is_file()
        || metadata.file_type().is_symlink()
        || metadata.len() > 8192
        || !crate::platform::private_config(path, &metadata)
            .map_err(|_| "Presence 私有配置权限无法读取。")?
    {
        return Err("Presence 连接文件必须是当前用户的私有配置文件。".into());
    }
    let bytes = fs::read(path).map_err(|_| "Presence 私有配置读取失败。")?;
    serde_json::from_slice(&bytes)
        .map(Some)
        .map_err(|_| "Presence 私有配置格式无效。".into())
}
fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 160
        && id
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"_.:@/-".contains(&c))
}
fn valid_token(token: &str) -> bool {
    (32..=512).contains(&token.len()) && token.bytes().all(|b| b.is_ascii_graphic())
}
fn loopback(url: &Url) -> bool {
    matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"))
}
pub(crate) fn server_url(input: &str) -> Result<Url> {
    let mut url = Url::parse(input.trim()).map_err(|_| "请输入完整的 Presence 服务器地址。")?;
    if !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || url.host().is_none()
        || !(url.scheme() == "https" || url.scheme() == "http" && loopback(&url))
    {
        return Err("Presence 服务器必须使用 HTTPS 地址；本机连接可以使用 HTTP。".into());
    }
    url.set_path(&format!("{}/", url.path().trim_end_matches('/')));
    Ok(url)
}
fn validate_configuration(config: &Configuration) -> Result<()> {
    server_url(&config.server_url)?;
    if config.version != 1
        || !valid_id(&config.device_id)
        || config.server_name.is_empty()
        || config.server_name.chars().count() > 120
        || !config.server_token.is_empty() && !valid_token(&config.server_token)
    {
        return Err("Presence 配置或访问密钥无效。".into());
    }
    Ok(())
}
fn valid_project(project: &Project) -> bool {
    let mut paths = std::collections::HashSet::new();
    !project.repository_id.is_empty()
        && project.repository_id.len() <= 512
        && project
            .repository_id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"_.:@%~/-".contains(&b))
        && valid_id(&project.worktree_id)
        && project
            .organization_id
            .as_ref()
            .is_none_or(|id| valid_id(id))
        && project
            .unpublished_commits
            .is_none_or(|count| count <= 9_007_199_254_740_991)
        && project.branch.as_ref().is_none_or(|s| s.len() <= 1024)
        && project.head.as_ref().is_none_or(|s| {
            (s.len() == 40 || s.len() == 64)
                && s.bytes()
                    .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
        })
        && project.files.len() <= 10_000
        && project.files.iter().all(|file| {
            !file.path.is_empty()
                && file.path.len() <= 4096
                && !file.path.contains(['\0', '\\'])
                && !file.path.starts_with('/')
                && !file.path.as_bytes().get(1).is_some_and(|b| *b == b':')
                && file.path.split('/').all(|s| {
                    !s.is_empty() && s != "." && s != ".." && !s.eq_ignore_ascii_case(".git")
                })
                && paths.insert(&file.path)
                && file.index.chars().count() <= 1
                && file.worktree.chars().count() <= 1
                && file.sources.len() <= 64
                && file.sources.iter().all(|s| {
                    valid_id(&s.source_id) && matches!(s.kind.as_str(), "unreal" | "godot")
                })
        })
}
fn valid_session(session: &Session) -> bool {
    valid_id(&session.session_id)
        && valid_id(&session.user_id)
        && valid_id(&session.identity_id)
        && valid_id(&session.device_id)
        && session.device_name.as_ref().is_none_or(|name| {
            !name.trim().is_empty() && name.chars().count() <= 120
        })
        && !session.display_name.is_empty()
        && session.display_name.chars().count() <= 200
        && session.avatar_url.as_ref().is_none_or(|value| {
            value.len() <= 2048
                && url::Url::parse(value).is_ok_and(|url| {
                    url.scheme() == "https" && url.username().is_empty() && url.password().is_none()
                })
        })
        && session.projects.len() <= 4096
        && session.projects.iter().all(valid_project)
}
fn decode_message(message: Message) -> Result<ServerMessage> {
    let Message::Text(text) = message else {
        return Err("Presence 服务器发送了无效消息。".into());
    };
    serde_json::from_str(&text).map_err(|_| "Presence 服务器消息格式无效。".into())
}
async fn local_json(client: &reqwest::Client, url: Url, token: &str) -> Result<Value> {
    let mut response = client
        .get(url)
        .bearer_auth(token)
        .send()
        .await
        .map_err(|_| "无法连接本机 Bridge，本机协作状态未知。")?;
    if !response.status().is_success() {
        return Err("本机 Bridge 拒绝访问，请检查独立连接配置。".into());
    }
    let mut bytes = vec![];
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "本机 Bridge 状态读取未完成。")?
    {
        if bytes.len() + chunk.len() > MAX_MESSAGE {
            return Err("本机 Bridge 快照超过读取上限。".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&bytes).map_err(|_| "本机 Bridge 返回了无效状态。".into())
}
