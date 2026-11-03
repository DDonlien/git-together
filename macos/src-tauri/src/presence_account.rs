use super::*;
use crate::util::{self, text};

#[cfg(test)]
pub(super) type TestTransport = Arc<
    dyn Fn(
            String,
            String,
            Option<String>,
            Option<Value>,
        ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<Value>> + Send>>
        + Send
        + Sync,
>;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Account {
    pub id: String,
    pub email: String,
    pub display_name: String,
    pub email_verified: bool,
    pub expires_at: u64,
    pub repositories: Vec<String>,
    pub mode: String,
    #[serde(default)]
    pub identity_id: String,
    #[serde(default)]
    pub issuer: String,
    #[serde(default)]
    pub subject: String,
}

pub(super) fn valid_account(account: &Account) -> bool {
    valid_id(&account.id)
        && !account.email.is_empty()
        && account.email.len() <= 254
        && !account.email.contains(['\0', '\r', '\n'])
        && !account.display_name.is_empty()
        && account.display_name.chars().count() <= 480
        && !account.display_name.contains(['\0', '\r', '\n'])
        && matches!(account.mode.as_str(), "personal" | "hosted")
        && (account.identity_id.is_empty() || valid_id(&account.identity_id))
        && (account.issuer.is_empty() || server_url(&account.issuer).is_ok())
        && (account.subject.is_empty() || valid_id(&account.subject))
        && account.repositories.len() <= 10_000
        && account.repositories.iter().all(|repository| {
            !repository.is_empty()
                && repository.len() <= 512
                && !repository.chars().any(char::is_control)
        })
}

pub(super) fn profile(value: &Value, url: &str, fallback_expiry: Option<u64>) -> Result<Account> {
    let source = &value["account"];
    let id = util::field(source, "id", 160)?;
    let issuer = server_url(
        source["issuer"]
            .as_str()
            .filter(|issuer| !issuer.is_empty())
            .unwrap_or(url),
    )?
    .to_string();
    let subject = source["subject"]
        .as_str()
        .filter(|subject| !subject.is_empty())
        .unwrap_or(&id)
        .to_owned();
    let account = Account {
        id,
        email: util::field(source, "email", 254)?,
        display_name: util::field(source, "displayName", 1920)?,
        email_verified: source["emailVerified"] == true,
        expires_at: value["expiresAt"]
            .as_u64()
            .or(fallback_expiry)
            .ok_or("账号有效期无效。")?,
        repositories: serde_json::from_value(value["repositories"].clone())
            .map_err(|_| "账号仓库清单无效。")?,
        mode: util::field(value, "mode", 20)?,
        identity_id: source["identityId"]
            .as_str()
            .filter(|identity| !identity.is_empty())
            .map(str::to_owned)
            .unwrap_or_else(|| util::digest(format!("{issuer}\0{subject}"))),
        issuer,
        subject,
    };
    if !valid_account(&account) {
        return Err("Presence 返回了无效的账号身份，原登录未修改。".into());
    }
    Ok(account)
}

pub(super) fn same_identity(a: &Account, b: &Account) -> bool {
    a.id == b.id && a.issuer == b.issuer && a.subject == b.subject && a.identity_id == b.identity_id
}
pub(super) fn normalize_account(account: &mut Account, url: &str) -> Result<()> {
    account.issuer = server_url(if account.issuer.is_empty() {
        url
    } else {
        &account.issuer
    })?
    .to_string();
    if account.subject.is_empty() {
        account.subject = account.id.clone();
    }
    if account.identity_id.is_empty() {
        account.identity_id = util::digest(format!("{}\0{}", account.issuer, account.subject));
    }
    Ok(())
}

pub(super) fn account_response(status: reqwest::StatusCode, bytes: &[u8]) -> Result<Value> {
    if !status.is_success() {
        return Err(match status.as_u16() {
            400 | 422 => "Presence 登录请求无效，请检查服务器地址和填写内容。",
            401 => "Presence 登录已失效或邮箱、密码不正确，请重新登录。",
            403 => "Presence 服务器拒绝了此账号的访问。",
            404 => "此服务器尚未提供所需的 Presence 账号接口。",
            409 => "Presence 账号或会话存在冲突，请检查当前登录。",
            429 => "Presence 请求过于频繁，请稍后重试。",
            _ => "Presence 账号服务暂时不可用，请稍后重试。",
        }
        .into());
    }
    let value: Value =
        serde_json::from_slice(bytes).map_err(|_| "Presence 账号服务返回格式无效。")?;
    if !value.is_object() {
        return Err("Presence 账号服务返回格式无效。".into());
    }
    Ok(value)
}

impl Presence {
    pub(super) fn account_metadata(value: &Value) -> Value {
        if value["version"] != 1 || !matches!(text(value, "mode"), "personal" | "hosted") {
            return Value::Null;
        }
        json!({"version":1,"mode":text(value,"mode"),"organizationManagement":value["organizationManagement"]==true,"registrationAvailable":value["registrationAvailable"]==true,"setupRequired":value["setupRequired"]==true})
    }
    pub fn signed_in(&self) -> bool {
        self.config
            .borrow()
            .servers
            .iter()
            .any(ServerConfiguration::logged_in)
    }
    pub(super) async fn account_http(
        &self,
        url: &str,
        method: &str,
        token: Option<&str>,
        input: Option<&Value>,
    ) -> Result<Value> {
        #[cfg(test)]
        if let Some(transport) = &self.test_http {
            return transport(
                url.into(),
                method.into(),
                token.map(str::to_owned),
                input.cloned(),
            )
            .await;
        }
        let address = server_url(url)?
            .join(&if let Some(route) = method.strip_prefix("identity/") {
                format!("v1/identity/{route}")
            } else if let Some(route) = method.strip_prefix("control/") {
                format!("v1/control/{route}")
            } else {
                format!("v1/account/{method}")
            })
            .map_err(|_| "账号地址无效。")?;
        let client = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(Duration::from_secs(15))
            .build()
            .map_err(|_| "账号网络服务无法启动。")?;
        let mut request = if let Some(input) = input {
            client.post(address).json(input)
        } else {
            client.get(address)
        }
        .header("X-Presence-Client", "native");
        if let Some(token) = token {
            request = request.bearer_auth(token);
        }
        let mut response = request
            .send()
            .await
            .map_err(|_| "无法连接 Presence 账号服务，请检查服务器地址。")?;
        let status = response.status();
        let mut bytes = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(|_| "账号响应读取失败。")? {
            if bytes.len() + chunk.len() > MAX_MESSAGE {
                return Err("账号响应过大。".into());
            }
            bytes.extend_from_slice(&chunk);
        }
        account_response(status, &bytes)
    }
    pub(super) async fn save_account(
        &self,
        mut config: Configuration,
        metadata: Value,
        error: String,
    ) -> Result<()> {
        if self.read_only {
            return Err("Presence 配置尚未安全读取，原文件已保留，暂不能保存登录。".into());
        }
        servers::synchronize_legacy(&mut config);
        validate_configuration(&config)?;
        #[cfg(test)]
        if self.test_save_failure {
            return Err("Presence 登录无法安全保存，原配置已保留。".into());
        }
        if self.persistent {
            credentials::save(
                &self.root.join("presence-v1.encrypted"),
                &serde_json::to_value(&config).map_err(|_| "账号配置无法编码。")?,
            )?;
        }
        let mut state = self.state.write().await;
        let generation = state.generation + 1;
        *state = Status::new(&config, error);
        state.generation = generation;
        state.account_service = if metadata.is_null() {
            config
                .servers
                .iter()
                .find(|server| server.logged_in())
                .map(|server| Self::account_metadata(&server.account_service))
                .unwrap_or(Value::Null)
        } else {
            Self::account_metadata(&metadata)
        };
        self.config.send_replace(config);
        Ok(())
    }
    pub(super) async fn account_snapshot(&self) -> Result<Value> {
        let mut status =
            serde_json::to_value(&*self.state.read().await).map_err(|_| "账号状态无法读取。")?;
        status["localRepositories"] = json!([]);
        Ok(status)
    }
    async fn revoke_new_session(
        &self,
        url: &str,
        token: &str,
        previous: Option<&ServerConfiguration>,
    ) -> bool {
        if previous.is_some_and(|server| server.token == token) {
            return true;
        }
        self.account_http(url, "logout", Some(token), Some(&json!({})))
            .await
            .is_ok()
    }
    async fn retire_credentials(
        &self,
        server: &ServerConfiguration,
        replacement: Option<&str>,
    ) -> Vec<&'static str> {
        let mut warnings = Vec::new();
        if !server.device_token.is_empty()
            && self
                .account_http(
                    &server.url,
                    "control/revoke",
                    Some(&server.device_token),
                    Some(&json!({"deviceId":server.device_id})),
                )
                .await
                .is_err()
        {
            warnings.push("服务器设备授权暂未确认撤销");
        }
        if !server.token.is_empty()
            && replacement != Some(server.token.as_str())
            && self
                .account_http(&server.url, "logout", Some(&server.token), Some(&json!({})))
                .await
                .is_err()
        {
            warnings.push("服务器会话暂未撤销");
        }
        warnings
    }
    pub(super) async fn account_command(&self, method: &str, input: Value) -> Result<Value> {
        if self.read_only && !matches!(method, "openAccount" | "accountStatus") {
            return Err("Presence 配置尚未安全读取，原文件已保留，暂不能修改登录。".into());
        }
        if !input.is_object()
            || serde_json::to_vec(&input)
                .map_err(|_| "账号请求无效。")?
                .len()
                > 8192
        {
            return Err("账号请求无效。".into());
        }
        if method == "openAccount" {
            util::allowed(&input, &["serverUrl"])?;
            let config = self.config.borrow().clone();
            let url = server_url(input["serverUrl"].as_str().unwrap_or(&config.server_url))?
                .join("account")
                .map_err(|_| "账号网页地址无效。")?;
            crate::service::open(url.as_str()).await?;
            return self.account_snapshot().await;
        }
        let _guard = self.configure_lock.lock().await;
        let old = self.config.borrow().clone();
        match method {
            "accountStatus" => {
                util::allowed(&input, &["serverUrl", "serverId"])?;
                let selected = if input["serverId"].is_null() {
                    None
                } else {
                    Some(util::field(&input, "serverId", 64)?)
                };
                let existing = if let Some(id) = selected.as_ref() {
                    Some(
                        old.servers
                            .iter()
                            .find(|server| util::digest(&server.url) == *id)
                            .ok_or("此 Presence 服务器不存在。")?,
                    )
                } else {
                    None
                };
                let url = server_url(
                    input["serverUrl"]
                        .as_str()
                        .or(existing.map(|server| server.url.as_str()))
                        .unwrap_or(&old.server_url),
                )?
                .to_string();
                if existing.is_some_and(|server| server.url != url) {
                    return Err("服务器地址与所选登录不一致。".into());
                }
                let existing =
                    existing.or_else(|| old.servers.iter().find(|server| server.url == url));
                let value = self
                    .account_http(
                        &url,
                        "status",
                        existing
                            .filter(|server| !server.token.is_empty())
                            .map(|server| server.token.as_str()),
                        None,
                    )
                    .await?;
                if let Some(existing) =
                    existing.filter(|server| server.auth_mode == "direct" && server.logged_in())
                {
                    let updated = profile(&value, &url, Some(existing.expires_at))?;
                    if !same_identity(existing.account.as_ref().unwrap(), &updated) {
                        return Err("Presence 返回了不匹配的账号，原登录未修改。".into());
                    }
                    let mut next = old.clone();
                    let server = next
                        .servers
                        .iter_mut()
                        .find(|server| server.url == url)
                        .unwrap();
                    server.account = Some(updated);
                    server.account_service = Self::account_metadata(&value);
                    self.save_account(next, Value::Null, String::new()).await?;
                } else {
                    self.state.write().await.account_service = Self::account_metadata(&value);
                }
            }
            "register" | "login" => {
                util::allowed(
                    &input,
                    if method == "register" {
                        &[
                            "serverUrl",
                            "serverId",
                            "email",
                            "password",
                            "displayName",
                            "setupKey",
                        ]
                    } else {
                        &["serverUrl", "serverId", "email", "password"]
                    },
                )?;
                let url = server_url(&util::field(&input, "serverUrl", 2048)?)?.to_string();
                let selected = if input["serverId"].is_null() {
                    None
                } else {
                    Some(util::field(&input, "serverId", 64)?)
                };
                let previous = old.servers.iter().find(|server| server.url == url);
                if let Some(id) = selected {
                    if previous.is_none_or(|server| util::digest(&server.url) != id) {
                        return Err("服务器地址与所选登录不一致，未发送密码。".into());
                    }
                } else if previous.is_some_and(ServerConfiguration::logged_in) {
                    return Err("此服务器已经登录，请使用该行的重新登录。".into());
                }
                if previous.is_none() && old.servers.len() >= 32 {
                    return Err("最多保存32台 Presence 服务器。".into());
                }
                let mut body = json!({"email":util::field(&input,"email",254)?,"password":input["password"].as_str().filter(|password|!password.is_empty()&&password.chars().count()<=128).ok_or("请输入有效密码。")?});
                if method == "register" {
                    body["displayName"] = json!(util::field(&input, "displayName", 120)?);
                    if let Some(setup) = input["setupKey"]
                        .as_str()
                        .filter(|key| !key.trim().is_empty())
                    {
                        body["setupKey"] = json!(setup);
                    }
                }
                let value = self.account_http(&url, method, None, Some(&body)).await?;
                let token = util::field(&value, "token", 512)?;
                if !valid_token(&token) {
                    return Err("服务器返回的会话凭证无效，原登录未修改。".into());
                }
                let prepared = (|| -> Result<ServerConfiguration> {
                    let account = profile(&value, &url, None)?;
                    if account.expires_at <= util::now() as u64 {
                        return Err("服务器返回的登录会话已过期。".into());
                    }
                    // Explicit login replaces target credentials, even for the
                    // same identity: password changes may revoke old devices.
                    let mut server = ServerConfiguration {
                        url: url.clone(),
                        enabled: true,
                        token: token.clone(),
                        expires_at: account.expires_at,
                        user_id: account.id.clone(),
                        device_id: String::new(),
                        device_token: String::new(),
                        organizations: vec![],
                        auth_mode: "direct".into(),
                        account: Some(account),
                        issuer_url: String::new(),
                        issuer_account: None,
                        account_service: Self::account_metadata(&value),
                    };
                    if value["organizations"].is_array() {
                        Self::organization_metadata(&mut server, &value)?;
                    }
                    Ok(server)
                })();
                let server = match prepared {
                    Ok(server) => server,
                    Err(error) => {
                        let revoked = self.revoke_new_session(&url, &token, previous).await;
                        return Err(if revoked {
                            error
                        } else {
                            format!("{error} 新登录会话暂未撤销，请在该服务器账号网页处理。")
                        });
                    }
                };
                let mut next = old.clone();
                if let Some(index) = next.servers.iter().position(|server| server.url == url) {
                    next.servers[index] = server;
                } else {
                    next.servers.push(server);
                }
                if let Err(error) = self.save_account(next, Value::Null, String::new()).await {
                    let revoked = self.revoke_new_session(&url, &token, previous).await;
                    return Err(if revoked {
                        error
                    } else {
                        format!("{error} 新登录会话暂未撤销，请在该服务器账号网页处理。")
                    });
                }
                if let Some(previous) = previous {
                    let warnings = self.retire_credentials(previous, Some(&token)).await;
                    if !warnings.is_empty() {
                        self.state.write().await.error = format!(
                            "登录已保存；{}，可在该服务器账号网页检查。",
                            warnings.join("；")
                        );
                    }
                }
            }
            "logout" => {
                util::allowed(&input, &["serverId"])?;
                let selected = util::field(&input, "serverId", 64)?;
                let target = old
                    .servers
                    .iter()
                    .find(|server| util::digest(&server.url) == selected)
                    .cloned()
                    .ok_or("此 Presence 登录已经退出。")?;
                let mut next = old;
                next.servers.retain(|server| server.url != target.url);
                // Commit the local removal first. A storage failure must never
                // revoke a remote session still shown as saved on this device.
                self.save_account(next, Value::Null, String::new()).await?;
                let warnings = self.retire_credentials(&target, None).await;
                if !warnings.is_empty() {
                    self.state.write().await.error = format!(
                        "本机已退出 {}；{}，可在该服务器的账号网页处理。",
                        target.url,
                        warnings.join("；")
                    );
                }
            }
            _ => return Err("未知的 Presence 账号操作。".into()),
        }
        self.account_snapshot().await
    }
}
