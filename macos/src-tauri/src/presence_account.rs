use super::*;
use crate::util::{self, text};

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

impl Presence {
    fn account_metadata(value: &Value) -> Value {
        json!({"version":value["version"],"mode":value["mode"],"organizationManagement":value["organizationManagement"],"registrationAvailable":value["registrationAvailable"],"setupRequired":value["setupRequired"]})
    }
    pub fn signed_in(&self) -> bool {
        self.config.borrow().account.is_some()
    }
    pub(super) async fn account_http(
        &self,
        url: &str,
        method: &str,
        token: Option<&str>,
        input: Option<&Value>,
    ) -> Result<Value> {
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
        let ok = response.status().is_success();
        let mut bytes = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(|_| "账号响应读取失败。")? {
            if bytes.len() + chunk.len() > MAX_MESSAGE {
                return Err("账号响应过大。".into());
            }
            bytes.extend_from_slice(&chunk);
        }
        let value: Value = serde_json::from_slice(&bytes)
            .map_err(|_| "此服务器尚未提供 Presence 注册和登录接口。")?;
        if !ok {
            return Err(value["message"]
                .as_str()
                .filter(|s| s.len() <= 1000)
                .unwrap_or("Presence 账号请求未完成。")
                .into());
        }
        Ok(value)
    }
    pub(super) async fn save_account(
        &self,
        config: Configuration,
        metadata: Value,
        error: String,
    ) -> Result<()> {
        let metadata = if metadata.is_null() {
            metadata
        } else {
            Self::account_metadata(&metadata)
        };
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
        state.account_service = metadata;
        self.config.send_replace(config);
        Ok(())
    }
    pub(super) async fn account_snapshot(&self) -> Result<Value> {
        let mut status =
            serde_json::to_value(&*self.state.read().await).map_err(|_| "账号状态无法读取。")?;
        let config = self.config.borrow().clone();
        if config.account.is_none() {
            status["localRepositories"] = json!([]);
            return Ok(status);
        }
        status["localRepositories"] = json!([]);
        Ok(status)
    }
    pub(super) async fn account_command(&self, method: &str, input: Value) -> Result<Value> {
        if !input.is_object()
            || serde_json::to_vec(&input)
                .map_err(|_| "账号请求无效。")?
                .len()
                > 8192
        {
            return Err("账号请求无效。".into());
        }
        match method {
            "openAccount" => {
                util::allowed(&input, &["serverUrl"])?;
                let c = self.config.borrow().clone();
                let url = server_url(input["serverUrl"].as_str().unwrap_or(&c.server_url))?
                    .join("account")
                    .map_err(|_| "账号网页地址无效。")?;
                crate::service::open(url.as_str()).await?;
            }
            "accountStatus" => {
                util::allowed(&input, &["serverUrl"])?;
                let _guard = self.configure_lock.lock().await;
                let config = self.config.borrow().clone();
                let url = input["serverUrl"].as_str().unwrap_or(&config.server_url);
                let same = server_url(url)?.as_str() == config.server_url;
                let token = if same && config.account.is_some() {
                    Some(config.server_token.as_str())
                } else {
                    None
                };
                let value = self.account_http(url, "status", token, None).await?;
                if same {
                    let mut next = config;
                    if let Some(account) = next.account.as_mut() {
                        if value["account"]["id"] != account.id {
                            return Err("Presence 返回了不匹配的账号，请重新登录。".into());
                        }
                        let repositories: Vec<String> =
                            serde_json::from_value(value["repositories"].clone())
                                .map_err(|_| "账号仓库清单无效。")?;
                        if account.repositories != repositories {
                            account.repositories = repositories;
                            self.save_cached(next.clone()).await?;
                        }
                    }
                }
                self.state.write().await.account_service = Self::account_metadata(&value);
            }
            "register" | "login" => {
                util::allowed(
                    &input,
                    if method == "register" {
                        &["serverUrl", "email", "password", "displayName", "setupKey"]
                    } else {
                        &["serverUrl", "email", "password"]
                    },
                )?;
                let _guard = self.configure_lock.lock().await;
                let old = self.config.borrow().clone();
                let url = server_url(&util::field(&input, "serverUrl", 2048)?)?.to_string();
                let mut body = json!({"email":util::field(&input,"email",254)?,"password":input["password"].as_str().filter(|s| !s.is_empty() && s.chars().count()<=128).ok_or("请输入有效密码。")?});
                if method == "register" {
                    body["displayName"] = json!(util::field(&input, "displayName", 120)?);
                    let supplied = input["setupKey"]
                        .as_str()
                        .filter(|s| !s.trim().is_empty())
                        .map(str::to_owned);
                    let setup = if let Some(key) = supplied {
                        Some(key)
                    } else {
                        let value =
                            private_json(&self.private_directory.join("account-setup.local.json"))?;
                        value
                            .filter(|v| {
                                server_url(text(v, "serverUrl")).is_ok_and(|u| u.as_str() == url)
                            })
                            .and_then(|v| v["setupKey"].as_str().map(str::to_owned))
                    };
                    if let Some(key) = setup {
                        body["setupKey"] = json!(key);
                    }
                }
                let value = self.account_http(&url, method, None, Some(&body)).await?;
                let token = util::field(&value, "token", 512)?;
                if token.len() < 32 {
                    return Err("服务器返回的会话凭证无效。".into());
                }
                let profile = &value["account"];
                let account = Account {
                    id: util::field(profile, "id", 160)?,
                    email: util::field(profile, "email", 254)?,
                    display_name: util::field(profile, "displayName", 480)?,
                    email_verified: profile["emailVerified"] == true,
                    expires_at: value["expiresAt"].as_u64().ok_or("账号有效期无效。")?,
                    repositories: serde_json::from_value(value["repositories"].clone())
                        .map_err(|_| "账号仓库清单无效。")?,
                    mode: util::field(&value, "mode", 20)?,
                    identity_id: profile["identityId"].as_str().unwrap_or("").to_owned(),
                    issuer: profile["issuer"].as_str().unwrap_or(&url).to_owned(),
                    subject: profile["subject"]
                        .as_str()
                        .unwrap_or(text(profile, "id"))
                        .to_owned(),
                };
                if old
                    .account
                    .as_ref()
                    .is_some_and(|a| a.id != account.id || old.server_url != url)
                {
                    let result = self
                        .account_http(&url, "logout", Some(&token), Some(&json!({})))
                        .await;
                    return Err(if result.is_ok() {
                        "一个实例只能绑定一个Presence账号，请先退出当前账号。".into()
                    } else {
                        "请先退出当前账号；新的登录会话暂未撤销，请在该账号网页处理。".into()
                    });
                }
                let mut config = Configuration {
                    enabled: true,
                    server_url: url,
                    server_name: "Presence".into(),
                    server_token: token,
                    account: Some(account),
                    ..old.clone()
                };
                let same_account = old.account.as_ref().is_some_and(|a| {
                    a.id == config.account.as_ref().unwrap().id
                        && old.server_url == config.server_url
                });
                if !same_account {
                    config.servers.clear();
                }
                let home = ServerConfiguration::home(&config);
                if let Some(existing) = config.servers.iter_mut().find(|s| s.url == home.url) {
                    existing.token = home.token;
                    existing.expires_at = home.expires_at;
                    existing.user_id = home.user_id;
                } else {
                    config.servers.insert(0, home);
                }
                let mut warnings = vec![];
                let foreign = config
                    .servers
                    .iter()
                    .enumerate()
                    .filter(|(_, s)| s.url != config.server_url && s.enabled)
                    .map(|(i, s)| (i, s.clone()))
                    .collect::<Vec<_>>();
                let results = futures_util::future::join_all(
                    foreign
                        .iter()
                        .map(|(_, s)| self.authenticated_server(&s.url, &config)),
                )
                .await;
                for ((index, previous), result) in foreign.into_iter().zip(results) {
                    match result {
                        Ok(mut server) => {
                            server.device_id = previous.device_id;
                            server.device_token = previous.device_token;
                            config.servers[index] = server;
                        }
                        Err(error) => {
                            warnings.push(format!("{} 的身份更新未完成：{error}", previous.url))
                        }
                    }
                }
                validate_configuration(&config)?;
                self.save_account(config, value, warnings.join("；"))
                    .await?;
            }
            "logout" => {
                util::allowed(&input, &[])?;
                let _guard = self.configure_lock.lock().await;
                let mut config = self.config.borrow().clone();
                if config.account.is_none() {
                    return Err("尚未登录 Presence 账号。".into());
                }
                let result = self
                    .account_http(
                        &config.server_url,
                        method,
                        Some(&config.server_token),
                        Some(&input),
                    )
                    .await;
                let warning = match result {
                    Ok(_) => String::new(),
                    Err(error) => {
                        format!("本机已退出；服务器会话暂未撤销：{error}")
                    }
                };
                config.enabled = false;
                config.account = None;
                config.server_token.clear();
                config.servers.clear();
                self.save_account(config, json!(null), warning).await?;
            }
            _ => return Err("未知的 Presence 账号操作。".into()),
        }
        self.account_snapshot().await
    }
}
