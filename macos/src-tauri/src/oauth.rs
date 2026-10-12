use crate::{
    credentials, provider,
    service::{self, Service},
    util::{self, text, Result},
};
use aes_gcm::aead::{rand_core::RngCore, OsRng};
use axum::{
    body::Bytes,
    extract::{Query, State},
    http::{header, HeaderMap, StatusCode},
    response::{Html, IntoResponse, Response},
    routing::{get, post},
    Router,
};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    path::PathBuf,
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc, Weak,
    },
};
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;
pub const CLIENT_ID: &str = "Iv23liKMFYSaYtpe3XnL";
const ORIGIN: &str = "http://127.0.0.1:4174";
const CALLBACK: &str = "http://127.0.0.1:4174/oauth/github/callback";
#[derive(Clone)]
pub struct Authorization {
    service: Weak<Service>,
    root: PathBuf,
    client: reqwest::Client,
    sessions: Arc<Mutex<BTreeMap<String, Arc<Mutex<Session>>>>>,
    pending: Arc<AtomicUsize>,
    listener: Arc<Mutex<bool>>,
    shutdown: CancellationToken,
    setup_nonce: String,
}
struct Session {
    id: String,
    name: String,
    expires: i64,
    state: String,
    verifier: String,
    url: String,
    device: String,
    interval: u64,
    next: i64,
    token: Option<String>,
    token_expires: Option<String>,
    catalog: Option<Value>,
    error: String,
    cancel: CancellationToken,
    finished: bool,
}
fn random() -> String {
    let mut b = [0u8; 32];
    OsRng.fill_bytes(&mut b);
    URL_SAFE_NO_PAD.encode(b)
}
impl Authorization {
    pub fn new(service: Weak<Service>, root: PathBuf, client: reqwest::Client) -> Self {
        Self {
            service,
            root,
            client,
            sessions: Arc::new(Mutex::new(BTreeMap::new())),
            pending: Arc::new(AtomicUsize::new(0)),
            listener: Arc::new(Mutex::new(false)),
            shutdown: CancellationToken::new(),
            setup_nonce: random(),
        }
    }
    pub fn busy(&self) -> bool {
        self.pending.load(Ordering::SeqCst) > 0
    }
    fn finish(&self, s: &mut Session) {
        if !s.finished {
            s.finished = true;
            self.pending.fetch_sub(1, Ordering::SeqCst);
        }
    }
    pub async fn prune(&self) {
        let now = util::now();
        let mut all = self.sessions.lock().await;
        let ids: Vec<_> = all
            .iter()
            .filter_map(|(id, s)| {
                s.try_lock()
                    .ok()
                    .filter(|s| s.expires < now)
                    .map(|_| id.clone())
            })
            .collect();
        for id in ids {
            if let Some(s) = all.remove(&id) {
                let mut s = s.lock().await;
                s.cancel.cancel();
                self.finish(&mut s);
            }
        }
    }
    async fn insert(&self, s: Session) -> Result<()> {
        self.prune().await;
        let mut sessions = self.sessions.lock().await;
        if sessions.len() >= 8 {
            return Err("授权会话已达上限，请先完成或取消已有授权。".into());
        }
        self.pending.fetch_add(1, Ordering::SeqCst);
        sessions.insert(s.id.clone(), Arc::new(Mutex::new(s)));
        Ok(())
    }
    async fn session(&self, id: &str) -> Result<Arc<Mutex<Session>>> {
        uuid::Uuid::parse_str(id).map_err(|_| "授权会话标识无效。")?;
        self.prune().await;
        self.sessions
            .lock()
            .await
            .get(id)
            .cloned()
            .ok_or("授权已取消或过期，请重新开始。".into())
    }
    pub fn ensure_listener(
        &self,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<()>> + Send + '_>> {
        Box::pin(async move {
            self.listen().await.map_err(|error| self.listener_error(&error))
        })
    }
    fn listener_error(&self, error: &std::io::Error) -> String {
        let reason = match error.kind() {
            std::io::ErrorKind::AddrInUse => "已被其他进程占用",
            std::io::ErrorKind::PermissionDenied => "被系统拒绝使用，可能是系统保留端口",
            _ => "无法启动监听",
        };
        let code = error.raw_os_error().map(|code| format!("（系统错误 {code}）")).unwrap_or_default();
        format!("本机授权端口 {}{reason}{code}。", 4174)
    }
    fn listen(
        &self,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = std::io::Result<()>> + Send + '_>> {
        Box::pin(async move {
            let mut started = self.listener.lock().await;
            if *started {
                return Ok(());
            }
            let listener = tokio::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 4174)).await?;
            let router = Router::new()
                .route("/oauth/github/callback", get(callback))
                .route("/setup", get(setup).post(save_setup))
                .route("/api/{method}", post(api).options(preflight))
                .layer(axum::extract::DefaultBodyLimit::max(8192))
                .with_state(self.clone());
            let shutdown = self.shutdown.clone();
            tokio::spawn(async move {
                let _ = axum::serve(listener, router)
                    .with_graceful_shutdown(shutdown.cancelled_owned())
                    .await;
            });
            *started = true;
            Ok(())
        })
    }
    pub async fn start(&self, name: &str) -> Result<Value> {
        if let Err(error) = self.listen().await {
            let problem = self.listener_error(&error);
            if let Some(service) = self.service.upgrade() {
                let code = match error.kind() {
                    std::io::ErrorKind::PermissionDenied => "permission",
                    std::io::ErrorKind::AddrInUse => "EADDRINUSE",
                    _ => "unknown",
                };
                service.diagnostics.record(&json!({"event":"authorization","method":"start","outcome":"failure","code":code,"systemCode":error.raw_os_error()}), false);
            }
            if matches!(error.kind(), std::io::ErrorKind::AddrInUse | std::io::ErrorKind::PermissionDenied) {
                let mut session = self.device_start(name).await.map_err(|error| format!("{problem} 备用网页授权未能启动：{error}"))?;
                session["flow"] = json!("device");
                return Ok(session);
            }
            return Err(problem);
        }
        let secret = credentials::oauth_secret(&self.root)?;
        if secret.is_none() {
            return Err("GitHub 网页授权应用尚未配置；请先在本机授权配置页完成一次配置。".into());
        }
        let id = uuid::Uuid::new_v4().to_string();
        let state = random();
        let verifier = random();
        let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
        let mut url = url::Url::parse("https://github.com/login/oauth/authorize").unwrap();
        url.query_pairs_mut().extend_pairs([
            ("client_id", CLIENT_ID),
            ("redirect_uri", CALLBACK),
            ("state", &state),
            ("code_challenge", &challenge),
            ("code_challenge_method", "S256"),
        ]);
        let expires = util::now() + 600_000;
        let public = json!({"id":id,"authorizationURL":url.as_str(),"expiresAt":expires});
        self.insert(Session {
            id,
            name: name.into(),
            expires,
            state,
            verifier,
            url: url.to_string(),
            device: String::new(),
            interval: 5,
            next: 0,
            token: None,
            token_expires: None,
            catalog: None,
            error: String::new(),
            cancel: CancellationToken::new(),
            finished: false,
        })
        .await?;
        Ok(public)
    }
    pub async fn open(&self, id: &str) -> Result<Value> {
        let s = self.session(id).await?;
        let s = s.lock().await;
        if s.finished || s.url.is_empty() {
            return Err("授权已取消或完成，请重新开始。".into());
        }
        service::open(&s.url).await?;
        Ok(json!(true))
    }
    pub async fn poll(&self, id: &str) -> Result<Value> {
        let item = self.session(id).await?;
        let mut s = item.lock().await;
        if let Some(c) = &s.catalog {
            return Ok(json!({"status":"complete","catalog":c}));
        }
        if !s.error.is_empty() {
            return Err(s.error.clone());
        }
        if s.cancel.is_cancelled() {
            return Err("授权已取消。".into());
        }
        if let Some(token) = s.token.take() {
            let service = self.service.upgrade().ok_or("账号服务已退出。")?;
            match service.connect(&json!({"provider":"github","host":"https://github.com","token":token,"name":s.name}),s.token_expires.clone(),true).await{Ok(c)=>{s.catalog=Some(c.clone());self.finish(&mut s);return Ok(json!({"status":"complete","catalog":c}));},Err(e)=>{s.error=e.clone();self.finish(&mut s);return Err(e);}}
        }
        Ok(json!({"status":"pending"}))
    }
    pub async fn cancel(&self, id: &str) -> Result<Value> {
        let item = match self.session(id).await {
            Ok(v) => v,
            Err(_) => return Ok(json!({"cancelled":true})),
        };
        let mut s = item.lock().await;
        if let Some(c) = &s.catalog {
            return Ok(json!({"cancelled":false,"catalog":c}));
        }
        s.cancel.cancel();
        s.token = None;
        self.finish(&mut s);
        Ok(json!({"cancelled":true}))
    }
    pub async fn device_start(&self, name: &str) -> Result<Value> {
        let value = post_json(
            &self.client,
            "https://github.com/login/device/code",
            &[("client_id", CLIENT_ID)],
        )
        .await?;
        let device = text(&value, "device_code");
        let user = text(&value, "user_code");
        let seconds = value["expires_in"]
            .as_i64()
            .filter(|n| *n > 0 && *n <= 3600)
            .ok_or("GitHub 设备授权返回格式无效。")?;
        let interval = value["interval"].as_u64().unwrap_or(5).clamp(5, 900);
        if device.is_empty()
            || device.len() > 512
            || user.len() != 9
            || value["verification_uri"] != "https://github.com/login/device"
        {
            return Err("GitHub 设备授权返回格式无效。".into());
        }
        let id = uuid::Uuid::new_v4().to_string();
        let expires = util::now() + seconds * 1000;
        self.insert(Session {
            id: id.clone(),
            name: name.into(),
            expires,
            state: String::new(),
            verifier: String::new(),
            url: String::new(),
            device: device.into(),
            interval,
            next: util::now() + interval as i64 * 1000,
            token: None,
            token_expires: None,
            catalog: None,
            error: String::new(),
            cancel: CancellationToken::new(),
            finished: false,
        })
        .await?;
        Ok(
            json!({"id":id,"userCode":user,"verificationURL":"https://github.com/login/device","expiresAt":expires,"interval":interval}),
        )
    }
    pub async fn device_poll(&self, id: &str) -> Result<Value> {
        let item = self.session(id).await?;
        {
            let mut s = item.lock().await;
            if let Some(c) = &s.catalog {
                return Ok(json!({"status":"complete","catalog":c}));
            }
            if !s.error.is_empty() {
                return Err(s.error.clone());
            }
            if s.device.is_empty() {
                return Err("不是设备授权会话。".into());
            }
            if s.cancel.is_cancelled() {
                return Err("授权已取消。".into());
            }
            let now = util::now();
            if now < s.next {
                return Ok(
                    json!({"status":"pending","retryAfter":((s.next-now+999)/1000).clamp(1,3600)}),
                );
            }
            let value = post_json(
                &self.client,
                "https://github.com/login/oauth/access_token",
                &[
                    ("client_id", CLIENT_ID),
                    ("device_code", &s.device),
                    ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
                ],
            )
            .await?;
            if let Some(token) = value["access_token"]
                .as_str()
                .filter(|t| !t.is_empty() && t.len() <= 4096 && !t.chars().any(char::is_whitespace))
            {
                s.token = Some(token.into());
                s.token_expires = value["expires_in"]
                    .as_i64()
                    .filter(|n| *n > 0)
                    .and_then(|n| chrono::DateTime::from_timestamp_millis(util::now() + n * 1000))
                    .map(|d| d.to_rfc3339());
            } else {
                match text(&value, "error") {
                    "authorization_pending" => (),
                    "slow_down" => s.interval = (s.interval + 5).min(900),
                    _ => {
                        s.error = "GitHub 授权未完成或被拒绝，请重新开始。".into();
                        self.finish(&mut s);
                        return Err(s.error.clone());
                    }
                }
                s.next = now + s.interval as i64 * 1000;
                return Ok(json!({"status":"pending","retryAfter":s.interval}));
            }
        }
        self.poll(id).await
    }
    async fn callback(&self, query: &BTreeMap<String, String>) -> Result<()> {
        let state = query
            .get("state")
            .filter(|s| s.len() == 43)
            .ok_or("授权校验失败，请重新开始。")?;
        let code = query
            .get("code")
            .filter(|c| !c.is_empty() && c.len() <= 512 && !c.chars().any(char::is_whitespace))
            .ok_or("GitHub 授权未完成，请重新开始。")?;
        self.prune().await;
        let all = self
            .sessions
            .lock()
            .await
            .values()
            .cloned()
            .collect::<Vec<_>>();
        let mut selected = None;
        for item in all {
            let s = item.lock().await;
            if s.state == *state && !s.finished && !s.cancel.is_cancelled() {
                drop(s);
                selected = Some(item);
                break;
            }
        }
        let item = selected.ok_or("授权校验失败或已过期。")?;
        let mut s = item.lock().await;
        if s.token.is_some() || s.catalog.is_some() {
            return Ok(());
        }
        let secret = credentials::oauth_secret(&self.root)?.ok_or("本机应用配置不可用。")?;
        let value = post_json(
            &self.client,
            "https://github.com/login/oauth/access_token",
            &[
                ("client_id", CLIENT_ID),
                ("client_secret", &secret),
                ("code", code),
                ("redirect_uri", CALLBACK),
                ("code_verifier", &s.verifier),
            ],
        )
        .await?;
        let token = text(&value, "access_token");
        if token.is_empty() || token.len() > 4096 || token.chars().any(char::is_whitespace) {
            s.error = "GitHub 没有返回有效授权，请重新开始。".into();
            self.finish(&mut s);
            return Err(s.error.clone());
        }
        s.token = Some(token.into());
        s.state.clear();
        s.token_expires = value["expires_in"]
            .as_i64()
            .filter(|n| *n > 0)
            .and_then(|n| chrono::DateTime::from_timestamp_millis(util::now() + n * 1000))
            .map(|d| d.to_rfc3339());
        Ok(())
    }
    pub async fn web(&self, method: &str, input: Value) -> Result<Value> {
        if self
            .service
            .upgrade()
            .is_some_and(|s| s.installing.load(Ordering::SeqCst))
        {
            return Err("正在安装更新，请稍后重试。".into());
        }
        match method {
            "start" => {
                util::allowed(&input, &["name"])?;
                self.start(&util::field(&input, "name", 120)?).await
            }
            "poll" | "cancel" | "open" => {
                util::allowed(&input, &["sessionId"])?;
                let id = util::field(&input, "sessionId", 100)?;
                match method {
                    "poll" => self.poll(&id).await,
                    "cancel" => self.cancel(&id).await,
                    _ => self.open(&id).await,
                }
            }
            "status" => {
                util::allowed(&input, &[])?;
                Ok(
                    json!({"configured":credentials::oauth_secret(&self.root)?.is_some(),"version":crate::VERSION,"clientId":CLIENT_ID}),
                )
            }
            _ => Err("不支持该授权操作。".into()),
        }
    }
    pub fn stop(&self) {
        self.shutdown.cancel();
    }
}
async fn post_json(client: &reqwest::Client, url: &str, body: &[(&str, &str)]) -> Result<Value> {
    let mut response = client
        .post(url)
        .header("Accept", "application/json")
        .form(body)
        .send()
        .await
        .map_err(provider::transport_error)?;
    let status = response.status();
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(provider::transport_error)? {
        if bytes.len() + chunk.len() > 32_768 {
            return Err("授权响应超过可读取范围。".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    if !status.is_success() {
        if url == "https://github.com/login/device/code"
            && serde_json::from_slice::<Value>(&bytes).ok().is_some_and(|value| value["error"] == "device_flow_disabled") {
            return Err("GitTogether 的 GitHub 备用网页授权尚未启用，请联系开发者开启设备授权。".into());
        }
        return Err(format!("网页授权服务返回 HTTP {}，请检查该域名的应用配置与授权状态。", status.as_u16()));
    }
    serde_json::from_slice(&bytes).map_err(|_| "网页授权服务返回格式无效。".into())
}
fn trusted(h: &HeaderMap) -> bool {
    h.get("host").and_then(|v| v.to_str().ok()) == Some("127.0.0.1:4174")
        && h.get("origin")
            .and_then(|v| v.to_str().ok())
            .is_some_and(|v| matches!(v, "http://127.0.0.1:4173" | ORIGIN))
        && h.get("x-gittogether-client").and_then(|v| v.to_str().ok()) == Some("1")
}
fn envelope(r: Result<Value>) -> Value {
    match r {
        Ok(v) => json!({"ok":true,"value":v}),
        Err(e) => json!({"ok":false,"error":e}),
    }
}
async fn api(
    State(auth): State<Authorization>,
    axum::extract::Path(method): axum::extract::Path<String>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    if !trusted(&headers) {
        return (
            StatusCode::FORBIDDEN,
            axum::Json(envelope(Err("仅允许本机应用的授权请求。".into()))),
        )
            .into_response();
    }
    let input = serde_json::from_slice(&body).map_err(|_| "请求不是有效 JSON。".to_string());
    let result = match input {
        Ok(v) => match auth.service.upgrade() {
            Some(service) => service.web(&method, v).await,
            None => Err("授权服务已退出。".into()),
        },
        Err(e) => Err(e),
    };
    let mut response = axum::Json(envelope(result)).into_response();
    response.headers_mut().insert(
        header::ACCESS_CONTROL_ALLOW_ORIGIN,
        "http://127.0.0.1:4173".parse().unwrap(),
    );
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, "no-store".parse().unwrap());
    response
}
async fn preflight(headers: HeaderMap) -> Response {
    if headers.get("host").and_then(|v| v.to_str().ok()) != Some("127.0.0.1:4174")
        || headers.get("origin").and_then(|v| v.to_str().ok()) != Some("http://127.0.0.1:4173")
    {
        return StatusCode::FORBIDDEN.into_response();
    }
    (
        [
            (header::ACCESS_CONTROL_ALLOW_ORIGIN, "http://127.0.0.1:4173"),
            (header::ACCESS_CONTROL_ALLOW_METHODS, "POST"),
            (
                header::ACCESS_CONTROL_ALLOW_HEADERS,
                "Content-Type, X-GitTogether-Client",
            ),
            (header::ACCESS_CONTROL_MAX_AGE, "600"),
        ],
        StatusCode::NO_CONTENT,
    )
        .into_response()
}
fn page(body: &str) -> Response {
    let mut r=Html(format!("<!doctype html><html lang=\"zh\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>GitTogether 授权</title><style>body{{font:16px system-ui;max-width:600px;margin:10vh auto;padding:24px;color:#25232b;background:#f6f5fa}}input{{display:block;width:100%;padding:12px;margin:12px 0;box-sizing:border-box}}button{{padding:12px 24px}}p{{line-height:1.7}}</style>{body}</html>")).into_response();
    r.headers_mut()
        .insert(header::CACHE_CONTROL, "no-store".parse().unwrap());
    r.headers_mut().insert(header::CONTENT_SECURITY_POLICY,"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'".parse().unwrap());
    r.headers_mut()
        .insert(header::REFERRER_POLICY, "no-referrer".parse().unwrap());
    r
}
async fn callback(
    State(auth): State<Authorization>,
    headers: HeaderMap,
    Query(query): Query<BTreeMap<String, String>>,
) -> Response {
    if headers.get("host").and_then(|v| v.to_str().ok()) != Some("127.0.0.1:4174") {
        return StatusCode::FORBIDDEN.into_response();
    }
    match auth.callback(&query).await {
        Ok(()) => page(
            "<h1>授权完成</h1><p>请回到 GitTogether，等待账号与仓库载入。这个窗口可以关闭。</p>",
        ),
        Err(_) => page("<h1>授权未完成</h1><p>请回到 GitTogether 重新开始授权。</p>"),
    }
}
async fn setup(State(auth): State<Authorization>, headers: HeaderMap) -> Response {
    if headers.get("host").and_then(|v| v.to_str().ok()) != Some("127.0.0.1:4174") {
        return StatusCode::FORBIDDEN.into_response();
    }
    page(&format!("<h1>GitHub 授权配置</h1><p>仅在这台电脑上配置一次。应用密钥会加密保存到系统用户目录。</p><form method=\"post\" action=\"/setup\"><input type=\"hidden\" name=\"nonce\" value=\"{}\"><label>Client ID<input readonly name=\"clientId\" value=\"{CLIENT_ID}\"></label><label>Client Secret<input type=\"password\" name=\"secret\" autocomplete=\"off\" required maxlength=\"4096\"></label><button>保存配置</button></form>",auth.setup_nonce))
}
async fn save_setup(
    State(auth): State<Authorization>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    if headers.get("host").and_then(|v| v.to_str().ok()) != Some("127.0.0.1:4174")
        || headers.get("origin").and_then(|v| v.to_str().ok()) != Some(ORIGIN)
    {
        return StatusCode::FORBIDDEN.into_response();
    }
    let values: url::form_urlencoded::Parse<'_> = url::form_urlencoded::parse(&body);
    let values: BTreeMap<String, String> = values.into_owned().collect();
    let valid = values.get("nonce") == Some(&auth.setup_nonce)
        && values.get("clientId").is_some_and(|v| v == CLIENT_ID)
        && values.get("secret").is_some_and(|v| {
            !v.is_empty() && v.len() <= 4096 && !v.chars().any(char::is_whitespace)
        });
    if !valid {
        return page("<h1>配置未保存</h1><p>请重新打开配置页，确认应用身份与密钥。</p>");
    }
    match credentials::save(
        &auth.root.join("github-oauth-v1.encrypted"),
        &json!({"version":1,"clientId":CLIENT_ID,"secret":values["secret"]}),
    ) {
        Ok(()) => page("<h1>配置已保存</h1><p>请回到 GitTogether 开始授权。</p>"),
        Err(_) => page("<h1>配置未保存</h1><p>系统加密存储暂不可用，原配置已经保留。</p>"),
    }
}
