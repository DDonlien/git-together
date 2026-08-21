//! Native AI providers whose credentials must stay outside the webview.
//!
//! The ChatGPT subscription flow follows the public PKCE behavior used by OpenAI Codex and Zed,
//! while keeping GitTogether's credentials in its own keychain entry. OpenCode Go uses its
//! documented API-key endpoints and routes each model to the protocol family advertised by its
//! provider documentation.

use std::{
    io::{BufRead, BufReader, Write},
    net::{TcpListener, TcpStream},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use anyhow::{Context as _, Result, anyhow, bail};
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use but_api::json as api_json;
use but_secret::{
    Sensitive,
    secret::{self, Namespace},
};
use futures::StreamExt;
use rand::RngCore as _;
use reqwest::{Client, RequestBuilder, Response, StatusCode};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use tauri::{State, ipc::Channel};
use url::Url;

const OPENAI_AUTHORIZE_URL: &str = "https://auth.openai.com/oauth/authorize";
const OPENAI_TOKEN_URL: &str = "https://auth.openai.com/oauth/token";
const CHATGPT_CODEX_BASE_URL: &str = "https://chatgpt.com/backend-api/codex";
const CHATGPT_CLIENT_ID: &str = "app_EMoamEEZ73f0CkXaXp7hrann";
const CHATGPT_CALLBACK_PORTS: [u16; 2] = [1455, 1457];
const CHATGPT_CALLBACK_PATH: &str = "/auth/callback";
const CHATGPT_CREDENTIAL_HANDLE: &str = "gittogether-ai-openai-subscription";
const OPENCODE_GO_KEY_HANDLE: &str = "gittogether-ai-opencode-go-api-key";
const OPENCODE_GO_BASE_URL: &str = "https://opencode.ai/zen/go/v1";
const TOKEN_REFRESH_BUFFER: Duration = Duration::from_secs(5 * 60);
const OAUTH_CALLBACK_TIMEOUT: Duration = Duration::from_secs(5 * 60);
const DEFAULT_MAX_OUTPUT_TOKENS: u32 = 1024;

/// Shared native state for provider HTTP calls and serialized credential refreshes.
pub struct AiRuntime {
    client: Client,
    subscription_lock: tokio::sync::Mutex<()>,
}

impl Default for AiRuntime {
    fn default() -> Self {
        let client = Client::builder()
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(2 * 60))
            .user_agent("GitTogether/AI")
            .build()
            .expect("static AI HTTP client configuration is valid");
        Self {
            client,
            subscription_lock: tokio::sync::Mutex::new(()),
        }
    }
}

/// Non-secret ChatGPT subscription state exposed to settings UI.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubscriptionStatus {
    pub authenticated: bool,
    pub email: Option<String>,
}

/// Non-secret API-key state exposed to settings UI.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiKeyStatus {
    pub has_api_key: bool,
}

/// A model option discovered from a provider-owned catalog.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiModel {
    pub id: String,
    pub label: String,
}

/// One streamed token sent to the webview. Credentials and provider payloads never use this
/// channel.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", content = "value", rename_all = "camelCase")]
pub enum AiStreamEvent {
    Token(String),
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiEvaluateRequest {
    provider: NativeProvider,
    model: String,
    prompt: Vec<AiPromptMessage>,
    max_tokens: Option<u32>,
}

#[derive(Debug, Clone, Copy, Deserialize)]
enum NativeProvider {
    #[serde(rename = "openai-subscription")]
    OpenAiSubscription,
    #[serde(rename = "opencode-go")]
    OpenCodeGo,
}

#[derive(Debug, Clone, Deserialize)]
struct AiPromptMessage {
    role: AiPromptRole,
    content: String,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
enum AiPromptRole {
    System,
    User,
    Assistant,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum WireProtocol {
    Responses,
    ChatCompletions,
    AnthropicMessages,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SubscriptionCredentials {
    access_token: String,
    refresh_token: String,
    expires_at_ms: u64,
    account_id: Option<String>,
    email: Option<String>,
}

impl SubscriptionCredentials {
    fn needs_refresh(&self) -> bool {
        now_ms().saturating_add(TOKEN_REFRESH_BUFFER.as_millis() as u64) >= self.expires_at_ms
    }
}

#[derive(Debug, Deserialize)]
struct OAuthTokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    id_token: Option<String>,
    expires_in: u64,
    email: Option<String>,
}

#[derive(Debug)]
struct OAuthCallback {
    code: String,
}

#[derive(Debug)]
enum RefreshFailure {
    Fatal(anyhow::Error),
    Transient(anyhow::Error),
}

#[derive(Debug, Deserialize)]
struct SubscriptionModelsResponse {
    models: Vec<SubscriptionCatalogModel>,
}

#[derive(Debug, Deserialize)]
struct SubscriptionCatalogModel {
    slug: String,
    display_name: String,
    visibility: Option<String>,
    #[serde(default)]
    priority: i32,
}

#[derive(Debug, Deserialize)]
struct OpenCodeModelsResponse {
    data: Vec<OpenCodeCatalogModel>,
}

#[derive(Debug, Deserialize)]
struct OpenCodeCatalogModel {
    id: String,
}

/// Read non-secret ChatGPT subscription status without starting network activity.
#[tauri::command(async)]
pub fn ai_subscription_status() -> Result<SubscriptionStatus, api_json::Error> {
    subscription_status().map_err(Into::into)
}

/// Start a browser OAuth 2.0 PKCE flow and persist the resulting tokens in GitTogether's keychain
/// namespace.
#[tauri::command(async)]
pub async fn ai_subscription_sign_in(
    runtime: State<'_, AiRuntime>,
) -> Result<SubscriptionStatus, api_json::Error> {
    sign_in_subscription(&runtime).await.map_err(Into::into)
}

/// Delete GitTogether's ChatGPT subscription credentials.
#[tauri::command(async)]
pub async fn ai_subscription_sign_out(
    runtime: State<'_, AiRuntime>,
) -> Result<SubscriptionStatus, api_json::Error> {
    let _guard = runtime.subscription_lock.lock().await;
    secret::delete(CHATGPT_CREDENTIAL_HANDLE, Namespace::BuildKind)?;
    Ok(SubscriptionStatus {
        authenticated: false,
        email: None,
    })
}

/// Fetch the account-visible ChatGPT/Codex model catalog.
#[tauri::command(async)]
pub async fn ai_subscription_models(
    runtime: State<'_, AiRuntime>,
) -> Result<Vec<AiModel>, api_json::Error> {
    subscription_models(&runtime).await.map_err(Into::into)
}

/// Return whether GitTogether has an OpenCode Go API key without returning the key itself.
#[tauri::command(async)]
pub fn ai_opencode_status() -> Result<ApiKeyStatus, api_json::Error> {
    Ok(ApiKeyStatus {
        has_api_key: load_opencode_key()?.is_some(),
    })
}

/// Save an OpenCode Go API key without ever making the saved value readable by the webview.
#[tauri::command(async)]
pub fn ai_opencode_key_save(api_key: String) -> Result<ApiKeyStatus, api_json::Error> {
    let api_key = api_key.trim();
    if api_key.is_empty() {
        return Err(anyhow!("OpenCode Go API key cannot be empty").into());
    }
    secret::persist(
        OPENCODE_GO_KEY_HANDLE,
        &Sensitive(api_key.to_owned()),
        Namespace::BuildKind,
    )?;
    Ok(ApiKeyStatus { has_api_key: true })
}

/// Delete the saved OpenCode Go API key.
#[tauri::command(async)]
pub fn ai_opencode_key_delete() -> Result<ApiKeyStatus, api_json::Error> {
    secret::delete(OPENCODE_GO_KEY_HANDLE, Namespace::BuildKind)?;
    Ok(ApiKeyStatus { has_api_key: false })
}

/// Fetch OpenCode Go's current model catalog. The catalog endpoint is provider-owned and can
/// change independently of a GitTogether release.
#[tauri::command(async)]
pub async fn ai_opencode_models(
    runtime: State<'_, AiRuntime>,
) -> Result<Vec<AiModel>, api_json::Error> {
    opencode_models(&runtime).await.map_err(Into::into)
}

/// Evaluate a prompt through a native provider and stream only generated text to the webview.
#[tauri::command(async)]
pub async fn ai_evaluate(
    runtime: State<'_, AiRuntime>,
    request: AiEvaluateRequest,
    on_event: Channel<AiStreamEvent>,
) -> Result<String, api_json::Error> {
    validate_model_id(&request.model)?;
    let result = match request.provider {
        NativeProvider::OpenAiSubscription => {
            evaluate_subscription(&runtime, &request, &on_event).await
        }
        NativeProvider::OpenCodeGo => evaluate_opencode(&runtime, &request, &on_event).await,
    };
    result.map_err(Into::into)
}

fn subscription_status() -> Result<SubscriptionStatus> {
    let credentials = load_subscription_credentials()?;
    Ok(credentials
        .map(|credentials| SubscriptionStatus {
            authenticated: true,
            email: credentials.email,
        })
        .unwrap_or(SubscriptionStatus {
            authenticated: false,
            email: None,
        }))
}

async fn sign_in_subscription(runtime: &AiRuntime) -> Result<SubscriptionStatus> {
    let _guard = runtime.subscription_lock.lock().await;
    let (listener, redirect_uri) = bind_oauth_listener()?;
    let verifier = generate_random_urlsafe(32);
    let challenge = pkce_challenge(&verifier);
    let state = generate_random_urlsafe(16);
    let authorize_url = build_authorize_url(&redirect_uri, &challenge, &state)?;

    open::that(authorize_url.as_str()).context("Failed to open the system browser")?;

    let expected_state = state.clone();
    let callback = tokio::task::spawn_blocking(move || {
        wait_for_oauth_callback(listener, &expected_state, OAUTH_CALLBACK_TIMEOUT)
    })
    .await
    .context("OAuth callback task failed")??;

    let tokens =
        exchange_authorization_code(&runtime.client, &callback.code, &verifier, &redirect_uri)
            .await?;
    let credentials = credentials_from_tokens(tokens, None)?;
    persist_subscription_credentials(&credentials)?;
    Ok(SubscriptionStatus {
        authenticated: true,
        email: credentials.email,
    })
}

fn bind_oauth_listener() -> Result<(TcpListener, String)> {
    let mut last_error = None;
    for port in CHATGPT_CALLBACK_PORTS {
        match TcpListener::bind(("127.0.0.1", port)) {
            Ok(listener) => {
                listener
                    .set_nonblocking(true)
                    .context("Failed to configure OAuth callback listener")?;
                return Ok((
                    listener,
                    format!("http://localhost:{port}{CHATGPT_CALLBACK_PATH}"),
                ));
            }
            Err(error) => last_error = Some(error),
        }
    }
    Err(last_error
        .map(anyhow::Error::from)
        .unwrap_or_else(|| anyhow!("No OAuth callback port is available")))
    .context("Ports 1455 and 1457 are unavailable for ChatGPT sign-in")
}

fn build_authorize_url(redirect_uri: &str, challenge: &str, state: &str) -> Result<Url> {
    let mut url = Url::parse(OPENAI_AUTHORIZE_URL)?;
    url.query_pairs_mut()
        .append_pair("client_id", CHATGPT_CLIENT_ID)
        .append_pair("redirect_uri", redirect_uri)
        .append_pair("scope", "openid profile email offline_access")
        .append_pair("response_type", "code")
        .append_pair("code_challenge", challenge)
        .append_pair("code_challenge_method", "S256")
        .append_pair("id_token_add_organizations", "true")
        .append_pair("state", state)
        .append_pair("codex_cli_simplified_flow", "true")
        .append_pair("originator", "gittogether");
    Ok(url)
}

fn wait_for_oauth_callback(
    listener: TcpListener,
    expected_state: &str,
    timeout: Duration,
) -> Result<OAuthCallback> {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        match listener.accept() {
            Ok((mut stream, _)) => {
                if let Some(callback) = handle_oauth_connection(&mut stream, expected_state)? {
                    return Ok(callback);
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(100));
            }
            Err(error) => return Err(error).context("OAuth callback listener failed"),
        }
    }
    bail!("ChatGPT sign-in timed out before the browser returned authorization")
}

fn handle_oauth_connection(
    stream: &mut TcpStream,
    expected_state: &str,
) -> Result<Option<OAuthCallback>> {
    stream.set_read_timeout(Some(Duration::from_secs(2)))?;
    let mut reader = BufReader::new(&mut *stream);
    let mut request_line = String::new();
    reader.read_line(&mut request_line)?;
    if request_line.len() > 16 * 1024 {
        write_oauth_page(stream, 400, "Authorization request was too large")?;
        bail!("OAuth callback request was too large")
    }
    let target = request_line
        .split_whitespace()
        .nth(1)
        .ok_or_else(|| anyhow!("OAuth callback request line was malformed"))?;
    let callback_url = Url::parse(&format!("http://localhost{target}"))?;
    if callback_url.path() != CHATGPT_CALLBACK_PATH {
        write_oauth_page(
            stream,
            404,
            "GitTogether is waiting for ChatGPT authorization",
        )?;
        return Ok(None);
    }

    let query = callback_url
        .query_pairs()
        .collect::<std::collections::BTreeMap<_, _>>();
    if let Some(error) = query.get("error") {
        write_oauth_page(stream, 400, "ChatGPT authorization was cancelled")?;
        bail!("ChatGPT authorization failed: {error}")
    }
    let state = query
        .get("state")
        .ok_or_else(|| anyhow!("OAuth callback did not include state"))?;
    if state.as_ref() != expected_state {
        write_oauth_page(
            stream,
            400,
            "GitTogether rejected an invalid authorization state",
        )?;
        bail!("OAuth state mismatch")
    }
    let code = query
        .get("code")
        .filter(|code| !code.is_empty())
        .ok_or_else(|| anyhow!("OAuth callback did not include an authorization code"))?
        .to_string();
    write_oauth_page(
        stream,
        200,
        "GitTogether authorization is complete. You can close this window.",
    )?;
    Ok(Some(OAuthCallback { code }))
}

fn write_oauth_page(stream: &mut TcpStream, status: u16, message: &str) -> Result<()> {
    let reason = if status == 200 { "OK" } else { "Error" };
    let body = format!(
        "<!doctype html><html><head><meta charset=\"utf-8\"><title>GitTogether</title></head>\
         <body style=\"font-family:system-ui;padding:3rem;background:#111;color:#eee\">\
         <h1>GitTogether</h1><p>{message}</p></body></html>"
    );
    write!(
        stream,
        "HTTP/1.1 {status} {reason}\r\nContent-Type: text/html; charset=utf-8\r\n\
         Content-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    )?;
    stream.flush()?;
    Ok(())
}

async fn exchange_authorization_code(
    client: &Client,
    code: &str,
    verifier: &str,
    redirect_uri: &str,
) -> Result<OAuthTokenResponse> {
    let response = client
        .post(OPENAI_TOKEN_URL)
        .form(&[
            ("grant_type", "authorization_code"),
            ("client_id", CHATGPT_CLIENT_ID),
            ("code", code),
            ("redirect_uri", redirect_uri),
            ("code_verifier", verifier),
        ])
        .send()
        .await
        .context("Failed to exchange ChatGPT authorization code")?;
    if !response.status().is_success() {
        bail!(
            "ChatGPT authorization token exchange failed with HTTP {}",
            response.status()
        );
    }
    response
        .json::<OAuthTokenResponse>()
        .await
        .context("ChatGPT authorization returned an invalid token response")
}

fn credentials_from_tokens(
    tokens: OAuthTokenResponse,
    previous: Option<&SubscriptionCredentials>,
) -> Result<SubscriptionCredentials> {
    let refresh_token = tokens
        .refresh_token
        .or_else(|| previous.map(|credentials| credentials.refresh_token.clone()))
        .ok_or_else(|| anyhow!("ChatGPT authorization did not return a refresh token"))?;
    let claims_token = tokens
        .id_token
        .as_deref()
        .unwrap_or(tokens.access_token.as_str());
    let claims = extract_jwt_claims(claims_token);
    Ok(SubscriptionCredentials {
        access_token: tokens.access_token,
        refresh_token,
        expires_at_ms: now_ms().saturating_add(tokens.expires_in.saturating_mul(1000)),
        account_id: claims
            .account_id
            .or_else(|| previous.and_then(|credentials| credentials.account_id.clone())),
        email: claims
            .email
            .or(tokens.email)
            .or_else(|| previous.and_then(|credentials| credentials.email.clone())),
    })
}

fn load_subscription_credentials() -> Result<Option<SubscriptionCredentials>> {
    let Some(Sensitive(raw)) = secret::retrieve(CHATGPT_CREDENTIAL_HANDLE, Namespace::BuildKind)?
    else {
        return Ok(None);
    };
    serde_json::from_str(&raw)
        .context("Saved ChatGPT subscription credentials are invalid")
        .map(Some)
}

fn persist_subscription_credentials(credentials: &SubscriptionCredentials) -> Result<()> {
    let serialized = serde_json::to_string(credentials)?;
    secret::persist(
        CHATGPT_CREDENTIAL_HANDLE,
        &Sensitive(serialized),
        Namespace::BuildKind,
    )
}

fn load_opencode_key() -> Result<Option<Sensitive<String>>> {
    secret::retrieve(OPENCODE_GO_KEY_HANDLE, Namespace::BuildKind)
}

async fn fresh_subscription_credentials(
    runtime: &AiRuntime,
    rejected_access_token: Option<&str>,
) -> Result<SubscriptionCredentials> {
    let current = load_subscription_credentials()?
        .ok_or_else(|| anyhow!("Sign in with ChatGPT before using OpenAI Subscription"))?;
    let should_refresh = current.needs_refresh()
        || rejected_access_token.is_some_and(|rejected| rejected == current.access_token);
    if !should_refresh {
        return Ok(current);
    }

    let _guard = runtime.subscription_lock.lock().await;
    let current = load_subscription_credentials()?
        .ok_or_else(|| anyhow!("Sign in with ChatGPT before using OpenAI Subscription"))?;
    let should_refresh = current.needs_refresh()
        || rejected_access_token.is_some_and(|rejected| rejected == current.access_token);
    if !should_refresh {
        return Ok(current);
    }

    match refresh_subscription_credentials(&runtime.client, &current).await {
        Ok(credentials) => {
            persist_subscription_credentials(&credentials)?;
            Ok(credentials)
        }
        Err(RefreshFailure::Fatal(error)) => {
            secret::delete(CHATGPT_CREDENTIAL_HANDLE, Namespace::BuildKind)?;
            Err(error).context("ChatGPT subscription session expired; sign in again")
        }
        Err(RefreshFailure::Transient(error)) => {
            Err(error).context("ChatGPT subscription token refresh failed temporarily")
        }
    }
}

async fn refresh_subscription_credentials(
    client: &Client,
    current: &SubscriptionCredentials,
) -> std::result::Result<SubscriptionCredentials, RefreshFailure> {
    let response = client
        .post(OPENAI_TOKEN_URL)
        .form(&[
            ("grant_type", "refresh_token"),
            ("client_id", CHATGPT_CLIENT_ID),
            ("refresh_token", current.refresh_token.as_str()),
        ])
        .send()
        .await
        .map_err(|error| RefreshFailure::Transient(error.into()))?;
    let status = response.status();
    if !status.is_success() {
        let error = anyhow!("ChatGPT token refresh failed with HTTP {status}");
        return if is_fatal_refresh_status(status) {
            Err(RefreshFailure::Fatal(error))
        } else {
            Err(RefreshFailure::Transient(error))
        };
    }
    let tokens = response
        .json::<OAuthTokenResponse>()
        .await
        .map_err(|error| RefreshFailure::Transient(error.into()))?;
    credentials_from_tokens(tokens, Some(current)).map_err(RefreshFailure::Transient)
}

fn is_fatal_refresh_status(status: StatusCode) -> bool {
    matches!(
        status,
        StatusCode::BAD_REQUEST | StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN
    )
}

async fn subscription_models(runtime: &AiRuntime) -> Result<Vec<AiModel>> {
    let mut rejected_access_token = None;
    for attempt in 0..2 {
        let credentials =
            fresh_subscription_credentials(runtime, rejected_access_token.as_deref()).await?;
        let response = subscription_headers(
            runtime.client.get(format!(
                "{CHATGPT_CODEX_BASE_URL}/models?client_version=0.0.0"
            )),
            &credentials,
        )
        .send()
        .await
        .context("Failed to load ChatGPT subscription models")?;
        if response.status() == StatusCode::UNAUTHORIZED && attempt == 0 {
            rejected_access_token = Some(credentials.access_token);
            continue;
        }
        if !response.status().is_success() {
            bail!(
                "ChatGPT subscription model catalog failed with HTTP {}",
                response.status()
            );
        }
        let mut models = response
            .json::<SubscriptionModelsResponse>()
            .await
            .context("ChatGPT subscription returned an invalid model catalog")?
            .models;
        models.retain(|model| model.visibility.as_deref() == Some("list"));
        models.sort_by(|left, right| {
            left.priority
                .cmp(&right.priority)
                .then_with(|| left.display_name.cmp(&right.display_name))
        });
        let models = models
            .into_iter()
            .map(|model| AiModel {
                id: model.slug,
                label: model.display_name,
            })
            .collect::<Vec<_>>();
        if models.is_empty() {
            bail!("ChatGPT subscription returned no account-visible models");
        }
        return Ok(models);
    }
    bail!("ChatGPT subscription authentication failed after token refresh")
}

async fn opencode_models(runtime: &AiRuntime) -> Result<Vec<AiModel>> {
    let mut request = runtime.client.get(format!("{OPENCODE_GO_BASE_URL}/models"));
    if let Some(Sensitive(key)) = load_opencode_key()? {
        request = request.bearer_auth(key);
    }
    let response = request
        .send()
        .await
        .context("Failed to load OpenCode Go models")?;
    if !response.status().is_success() {
        bail!(
            "OpenCode Go model catalog failed with HTTP {}",
            response.status()
        );
    }
    let models = response
        .json::<OpenCodeModelsResponse>()
        .await
        .context("OpenCode Go returned an invalid model catalog")?
        .data
        .into_iter()
        .map(|model| AiModel {
            label: humanize_model_id(&model.id),
            id: model.id,
        })
        .collect::<Vec<_>>();
    if models.is_empty() {
        bail!("OpenCode Go returned no available models");
    }
    Ok(models)
}

async fn evaluate_subscription(
    runtime: &AiRuntime,
    request: &AiEvaluateRequest,
    on_event: &Channel<AiStreamEvent>,
) -> Result<String> {
    let body = responses_request_body(request);
    let mut rejected_access_token = None;
    for attempt in 0..2 {
        let credentials =
            fresh_subscription_credentials(runtime, rejected_access_token.as_deref()).await?;
        let response = subscription_headers(
            runtime
                .client
                .post(format!("{CHATGPT_CODEX_BASE_URL}/responses"))
                .json(&body),
            &credentials,
        )
        .send()
        .await
        .context("Failed to call OpenAI Subscription")?;
        if response.status() == StatusCode::UNAUTHORIZED && attempt == 0 {
            rejected_access_token = Some(credentials.access_token);
            continue;
        }
        ensure_success(response.status(), "OpenAI Subscription")?;
        return stream_sse_response(response, WireProtocol::Responses, on_event).await;
    }
    bail!("OpenAI Subscription authentication failed after token refresh")
}

async fn evaluate_opencode(
    runtime: &AiRuntime,
    request: &AiEvaluateRequest,
    on_event: &Channel<AiStreamEvent>,
) -> Result<String> {
    let Sensitive(api_key) = load_opencode_key()?
        .ok_or_else(|| anyhow!("Save an OpenCode Go API key before using this provider"))?;
    let protocol = opencode_protocol_for_model(&request.model);
    let (endpoint, body) = match protocol {
        WireProtocol::Responses => (
            format!("{OPENCODE_GO_BASE_URL}/responses"),
            responses_request_body(request),
        ),
        WireProtocol::ChatCompletions => (
            format!("{OPENCODE_GO_BASE_URL}/chat/completions"),
            chat_completions_request_body(request),
        ),
        WireProtocol::AnthropicMessages => (
            format!("{OPENCODE_GO_BASE_URL}/messages"),
            anthropic_messages_request_body(request),
        ),
    };
    let mut request_builder = runtime
        .client
        .post(endpoint)
        .bearer_auth(&api_key)
        .json(&body);
    if protocol == WireProtocol::AnthropicMessages {
        request_builder = request_builder
            .header("x-api-key", &api_key)
            .header("anthropic-version", "2023-06-01");
    }
    let response = request_builder
        .send()
        .await
        .context("Failed to call OpenCode Go")?;
    ensure_success(response.status(), "OpenCode Go")?;
    stream_sse_response(response, protocol, on_event).await
}

fn subscription_headers(
    mut request: RequestBuilder,
    credentials: &SubscriptionCredentials,
) -> RequestBuilder {
    request = request
        .bearer_auth(&credentials.access_token)
        .header("originator", "gittogether")
        .header("openai-beta", "responses=experimental");
    if let Some(account_id) = credentials.account_id.as_deref() {
        request = request.header("chatgpt-account-id", account_id);
    }
    request
}

fn responses_request_body(request: &AiEvaluateRequest) -> Value {
    let instructions = system_instructions(&request.prompt);
    let input = request
        .prompt
        .iter()
        .filter(|message| !matches!(message.role, AiPromptRole::System))
        .map(|message| {
            json!({
                "role": prompt_role_name(message.role),
                "content": message.content,
            })
        })
        .collect::<Vec<_>>();
    json!({
        "model": request.model,
        "instructions": instructions,
        "input": input,
        "max_output_tokens": request.max_tokens.unwrap_or(DEFAULT_MAX_OUTPUT_TOKENS),
        "stream": true,
        "store": false,
    })
}

fn chat_completions_request_body(request: &AiEvaluateRequest) -> Value {
    let messages = request
        .prompt
        .iter()
        .map(|message| {
            json!({
                "role": prompt_role_name(message.role),
                "content": message.content,
            })
        })
        .collect::<Vec<_>>();
    json!({
        "model": request.model,
        "messages": messages,
        "max_tokens": request.max_tokens.unwrap_or(DEFAULT_MAX_OUTPUT_TOKENS),
        "stream": true,
    })
}

fn anthropic_messages_request_body(request: &AiEvaluateRequest) -> Value {
    let messages = request
        .prompt
        .iter()
        .filter(|message| !matches!(message.role, AiPromptRole::System))
        .map(|message| {
            json!({
                "role": prompt_role_name(message.role),
                "content": message.content,
            })
        })
        .collect::<Vec<_>>();
    json!({
        "model": request.model,
        "system": system_instructions(&request.prompt),
        "messages": messages,
        "max_tokens": request.max_tokens.unwrap_or(DEFAULT_MAX_OUTPUT_TOKENS),
        "stream": true,
    })
}

fn system_instructions(prompt: &[AiPromptMessage]) -> String {
    let instructions = prompt
        .iter()
        .filter(|message| matches!(message.role, AiPromptRole::System))
        .map(|message| message.content.as_str())
        .collect::<Vec<_>>()
        .join("\n\n");
    if instructions.is_empty() {
        "You are a concise assistant that helps generate Git metadata.".to_string()
    } else {
        instructions
    }
}

fn prompt_role_name(role: AiPromptRole) -> &'static str {
    match role {
        AiPromptRole::System => "system",
        AiPromptRole::User => "user",
        AiPromptRole::Assistant => "assistant",
    }
}

fn opencode_protocol_for_model(model: &str) -> WireProtocol {
    if model.starts_with("gpt-") || model.starts_with("grok-") {
        WireProtocol::Responses
    } else if model.starts_with("minimax-") || model.starts_with("qwen") {
        WireProtocol::AnthropicMessages
    } else {
        WireProtocol::ChatCompletions
    }
}

async fn stream_sse_response(
    response: Response,
    protocol: WireProtocol,
    on_event: &Channel<AiStreamEvent>,
) -> Result<String> {
    let mut stream = response.bytes_stream();
    let mut pending = Vec::new();
    let mut output = String::new();
    while let Some(chunk) = stream.next().await {
        pending.extend_from_slice(&chunk.context("AI response stream failed")?);
        while let Some(newline) = pending.iter().position(|byte| *byte == b'\n') {
            let line = pending.drain(..=newline).collect::<Vec<_>>();
            process_sse_line(&line, protocol, on_event, &mut output)?;
        }
    }
    if !pending.is_empty() {
        process_sse_line(&pending, protocol, on_event, &mut output)?;
    }
    if output.trim().is_empty() {
        bail!("AI provider returned an empty response");
    }
    Ok(output)
}

fn process_sse_line(
    line: &[u8],
    protocol: WireProtocol,
    on_event: &Channel<AiStreamEvent>,
    output: &mut String,
) -> Result<()> {
    let line = std::str::from_utf8(line).context("AI stream returned invalid UTF-8")?;
    let line = line.trim_end_matches(['\r', '\n']);
    let Some(data) = line.strip_prefix("data:") else {
        return Ok(());
    };
    let data = data.trim_start();
    if data.is_empty() || data == "[DONE]" {
        return Ok(());
    }
    if let Some(token) = token_from_sse_data(data, protocol)? {
        on_event
            .send(AiStreamEvent::Token(token.clone()))
            .context("AI stream receiver closed")?;
        output.push_str(&token);
    }
    Ok(())
}

fn token_from_sse_data(data: &str, protocol: WireProtocol) -> Result<Option<String>> {
    let value: Value = serde_json::from_str(data).context("AI stream returned invalid JSON")?;
    if matches!(
        value.get("type").and_then(Value::as_str),
        Some("error" | "response.failed")
    ) {
        bail!("AI provider reported a streaming error");
    }
    let token = match protocol {
        WireProtocol::Responses => (value.get("type").and_then(Value::as_str)
            == Some("response.output_text.delta"))
        .then(|| value.get("delta").and_then(Value::as_str))
        .flatten(),
        WireProtocol::ChatCompletions => value
            .pointer("/choices/0/delta/content")
            .and_then(Value::as_str),
        WireProtocol::AnthropicMessages => (value.get("type").and_then(Value::as_str)
            == Some("content_block_delta"))
        .then(|| value.pointer("/delta/text").and_then(Value::as_str))
        .flatten(),
    };
    Ok(token.map(ToOwned::to_owned))
}

fn ensure_success(status: StatusCode, provider: &str) -> Result<()> {
    if status.is_success() {
        return Ok(());
    }
    if status == StatusCode::UNAUTHORIZED || status == StatusCode::FORBIDDEN {
        bail!("{provider} rejected the saved credentials (HTTP {status})");
    }
    bail!("{provider} request failed with HTTP {status}")
}

fn validate_model_id(model: &str) -> Result<()> {
    if model.is_empty()
        || model.len() > 128
        || !model
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'/'))
    {
        bail!("AI model ID is invalid");
    }
    Ok(())
}

fn humanize_model_id(model: &str) -> String {
    model
        .split('-')
        .map(|part| match part.to_ascii_lowercase().as_str() {
            "gpt" => "GPT".to_string(),
            "glm" => "GLM".to_string(),
            "kimi" => "Kimi".to_string(),
            "minimax" => "MiniMax".to_string(),
            "mimo" => "MiMo".to_string(),
            "deepseek" => "DeepSeek".to_string(),
            "grok" => "Grok".to_string(),
            "qwen3.8" => "Qwen3.8".to_string(),
            "qwen3.7" => "Qwen3.7".to_string(),
            "qwen3.6" => "Qwen3.6".to_string(),
            "qwen3.5" => "Qwen3.5".to_string(),
            "hy3" => "HY3".to_string(),
            other if other.starts_with('v') || other.starts_with('m') || other.starts_with('k') => {
                other.to_ascii_uppercase()
            }
            other => {
                let mut characters = other.chars();
                characters
                    .next()
                    .map(|first| first.to_uppercase().collect::<String>() + characters.as_str())
                    .unwrap_or_default()
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn generate_random_urlsafe(byte_count: usize) -> String {
    let mut bytes = vec![0_u8; byte_count];
    rand::rng().fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

fn pkce_challenge(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

#[derive(Debug)]
struct JwtClaims {
    account_id: Option<String>,
    email: Option<String>,
}

fn extract_jwt_claims(jwt: &str) -> JwtClaims {
    let claims = jwt
        .split('.')
        .nth(1)
        .and_then(|payload| URL_SAFE_NO_PAD.decode(payload).ok())
        .and_then(|payload| serde_json::from_slice::<Value>(&payload).ok());
    let account_id = claims.as_ref().and_then(|claims| {
        claims
            .get("chatgpt_account_id")
            .and_then(Value::as_str)
            .or_else(|| {
                claims
                    .pointer("/https:~1~1api.openai.com~1auth/chatgpt_account_id")
                    .and_then(Value::as_str)
            })
            .or_else(|| {
                claims
                    .get("organizations")
                    .and_then(Value::as_array)
                    .and_then(|organizations| organizations.first())
                    .and_then(|organization| organization.get("id"))
                    .and_then(Value::as_str)
            })
            .map(ToOwned::to_owned)
    });
    let email = claims
        .as_ref()
        .and_then(|claims| claims.get("email"))
        .and_then(Value::as_str)
        .map(ToOwned::to_owned);
    JwtClaims { account_id, email }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pkce_challenge_matches_rfc_7636_example() {
        let verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
        assert_eq!(
            pkce_challenge(verifier),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
            "PKCE challenge must match RFC 7636"
        );
    }

    #[test]
    fn extracts_account_and_email_from_jwt() {
        let payload = URL_SAFE_NO_PAD.encode(
            serde_json::to_vec(&json!({
                "chatgpt_account_id": "account-123",
                "email": "person@example.com"
            }))
            .unwrap(),
        );
        let claims = extract_jwt_claims(&format!("header.{payload}.signature"));
        assert_eq!(claims.account_id.as_deref(), Some("account-123"));
        assert_eq!(claims.email.as_deref(), Some("person@example.com"));
    }

    #[test]
    fn extracts_nested_chatgpt_account_from_jwt() {
        let payload = URL_SAFE_NO_PAD.encode(
            serde_json::to_vec(&json!({
                "https://api.openai.com/auth": {
                    "chatgpt_account_id": "workspace-456"
                }
            }))
            .unwrap(),
        );
        let claims = extract_jwt_claims(&format!("header.{payload}.signature"));
        assert_eq!(claims.account_id.as_deref(), Some("workspace-456"));
    }

    #[test]
    fn authorize_url_uses_codex_pkce_contract() {
        let url = build_authorize_url(
            "http://localhost:1455/auth/callback",
            "challenge",
            "state-token",
        )
        .unwrap();
        let params = url
            .query_pairs()
            .collect::<std::collections::BTreeMap<_, _>>();
        assert_eq!(
            params.get("client_id").map(|value| value.as_ref()),
            Some(CHATGPT_CLIENT_ID)
        );
        assert_eq!(
            params.get("scope").map(|value| value.as_ref()),
            Some("openid profile email offline_access")
        );
        assert_eq!(
            params
                .get("code_challenge_method")
                .map(|value| value.as_ref()),
            Some("S256")
        );
        assert_eq!(
            params
                .get("codex_cli_simplified_flow")
                .map(|value| value.as_ref()),
            Some("true")
        );
        assert_eq!(
            params.get("originator").map(|value| value.as_ref()),
            Some("gittogether")
        );
    }

    #[test]
    fn refreshes_before_expiry_and_classifies_revoked_tokens_as_fatal() {
        let credentials = SubscriptionCredentials {
            access_token: "access".to_string(),
            refresh_token: "refresh".to_string(),
            expires_at_ms: now_ms() + Duration::from_secs(4 * 60).as_millis() as u64,
            account_id: None,
            email: None,
        };
        assert!(credentials.needs_refresh());
        assert!(is_fatal_refresh_status(StatusCode::BAD_REQUEST));
        assert!(is_fatal_refresh_status(StatusCode::UNAUTHORIZED));
        assert!(is_fatal_refresh_status(StatusCode::FORBIDDEN));
        assert!(!is_fatal_refresh_status(StatusCode::INTERNAL_SERVER_ERROR));
    }

    #[test]
    fn routes_opencode_models_to_documented_protocol_families() {
        assert_eq!(
            opencode_protocol_for_model("gpt-5.6-luna"),
            WireProtocol::Responses
        );
        assert_eq!(
            opencode_protocol_for_model("minimax-m3"),
            WireProtocol::AnthropicMessages
        );
        assert_eq!(
            opencode_protocol_for_model("qwen3.8-max"),
            WireProtocol::AnthropicMessages
        );
        assert_eq!(
            opencode_protocol_for_model("glm-5.3"),
            WireProtocol::ChatCompletions
        );
        assert_eq!(
            opencode_protocol_for_model("grok-4.5"),
            WireProtocol::Responses
        );
    }

    #[test]
    fn parses_tokens_from_each_stream_protocol() {
        assert_eq!(
            token_from_sse_data(
                r#"{"type":"response.output_text.delta","delta":"one"}"#,
                WireProtocol::Responses,
            )
            .unwrap()
            .as_deref(),
            Some("one")
        );
        assert_eq!(
            token_from_sse_data(
                r#"{"choices":[{"delta":{"content":"two"}}]}"#,
                WireProtocol::ChatCompletions,
            )
            .unwrap()
            .as_deref(),
            Some("two")
        );
        assert_eq!(
            token_from_sse_data(
                r#"{"type":"content_block_delta","delta":{"type":"text_delta","text":"three"}}"#,
                WireProtocol::AnthropicMessages,
            )
            .unwrap()
            .as_deref(),
            Some("three")
        );
    }

    #[test]
    fn responses_request_moves_system_messages_to_instructions() {
        let request = AiEvaluateRequest {
            provider: NativeProvider::OpenAiSubscription,
            model: "gpt-5.4".to_string(),
            prompt: vec![
                AiPromptMessage {
                    role: AiPromptRole::System,
                    content: "Follow the format".to_string(),
                },
                AiPromptMessage {
                    role: AiPromptRole::User,
                    content: "Summarize this diff".to_string(),
                },
            ],
            max_tokens: Some(42),
        };
        let body = responses_request_body(&request);
        assert_eq!(body["instructions"], "Follow the format");
        assert_eq!(body["input"].as_array().map(Vec::len), Some(1));
        assert_eq!(body["max_output_tokens"], 42);
        assert_eq!(body["store"], false);
    }

    #[test]
    fn humanizes_provider_model_ids() {
        assert_eq!(humanize_model_id("gpt-5.6-luna"), "GPT 5.6 Luna");
        assert_eq!(humanize_model_id("minimax-m3"), "MiniMax M3");
        assert_eq!(humanize_model_id("deepseek-v4-pro"), "DeepSeek V4 Pro");
    }
}
