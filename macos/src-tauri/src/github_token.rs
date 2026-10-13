use crate::{
    credentials,
    oauth::CLIENT_ID,
    provider,
    util::{self, text, Result},
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::Path;

#[derive(Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Flow {
    Web,
    Device,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RefreshCredential {
    pub token: String,
    pub expires_at: String,
    pub flow: Flow,
}

#[derive(Clone)]
pub struct Grant {
    pub token: String,
    pub expires_at: Option<String>,
    pub refresh: Option<RefreshCredential>,
}

pub struct Failure {
    pub reason: &'static str,
    pub message: String,
    pub status: Option<u16>,
}

fn token_valid(token: &str) -> bool {
    !token.is_empty()
        && token.len() <= 4096
        && token.is_ascii()
        && !token.chars().any(char::is_whitespace)
}

fn expiration(value: &Value) -> Result<String> {
    let seconds = value
        .as_i64()
        .filter(|n| (1..=31_536_000).contains(n))
        .ok_or("GitHub令牌有效期返回格式无效。")?;
    chrono::DateTime::from_timestamp_millis(util::now() + seconds * 1000)
        .map(|date| date.to_rfc3339())
        .ok_or_else(|| "GitHub令牌有效期返回格式无效。".into())
}

pub fn grant(value: &Value, flow: Flow) -> Result<Grant> {
    let token = text(value, "access_token");
    if !token_valid(token) {
        return Err("GitHub没有返回有效授权，请重新开始。".into());
    }
    let expires_at = if value["expires_in"].is_null() {
        None
    } else {
        Some(expiration(&value["expires_in"])?)
    };
    let refresh = if expires_at.is_some() {
        let token = text(value, "refresh_token");
        if !token_valid(token) || !token.starts_with("ghr_") {
            return Err("GitHub没有返回有效续期凭据，请重新开始授权。".into());
        }
        Some(RefreshCredential {
            token: token.into(),
            expires_at: expiration(&value["refresh_token_expires_in"])?,
            flow,
        })
    } else {
        None
    };
    Ok(Grant {
        token: token.into(),
        expires_at,
        refresh,
    })
}

pub fn valid_refresh(value: &Value) -> bool {
    if value.is_null() {
        return true;
    }
    serde_json::from_value::<RefreshCredential>(value.clone()).is_ok_and(|refresh| {
        token_valid(&refresh.token)
            && refresh.token.starts_with("ghr_")
            && chrono::DateTime::parse_from_rfc3339(&refresh.expires_at).is_ok()
    })
}

pub fn remaining(expiration: &Value) -> Option<i64> {
    expiration
        .as_str()
        .and_then(|date| chrono::DateTime::parse_from_rfc3339(date).ok())
        .map(|date| date.timestamp_millis() - util::now())
}

pub fn generation(saved: &Value) -> String {
    // Rotation preserves this identity; an explicit new credential replaces it.
    saved["authorizationId"]
        .as_str()
        .map(str::to_owned)
        .unwrap_or_else(|| util::digest(text(saved, "token")))
}

pub async fn renew(
    client: &reqwest::Client,
    root: &Path,
    credential: &RefreshCredential,
) -> std::result::Result<Grant, Failure> {
    let secret = match credential.flow {
        Flow::Device => None,
        Flow::Web => Some(
            credentials::oauth_secret(root)
                .map_err(|_| Failure {
                    reason: "configuration",
                    message: "GitHub自动续期的应用配置暂不可读取，请稍后重试；账号已保留。".into(),
                    status: None,
                })?
                .ok_or_else(|| Failure {
                    reason: "configuration",
                    message: "GitHub自动续期的应用配置缺失，请联系开发者；账号已保留。".into(),
                    status: None,
                })?,
        ),
    };
    let mut body = vec![
        ("client_id", CLIENT_ID),
        ("grant_type", "refresh_token"),
        ("refresh_token", credential.token.as_str()),
    ];
    if let Some(secret) = &secret {
        body.push(("client_secret", secret.as_str()));
    }
    let mut response = client
        .post("https://github.com/login/oauth/access_token")
        .header("Accept", "application/json")
        .form(&body)
        .send()
        .await
        .map_err(|error| Failure {
            reason: "network",
            message: format!(
                "GitHub自动续期暂未完成：{} 请稍后重试。",
                provider::transport_error(error)
            ),
            status: None,
        })?;
    let status = response.status().as_u16();
    if status == 429 || status >= 500 {
        return Err(Failure {
            reason: if status == 429 {
                "rate-limit"
            } else {
                "network"
            },
            message: format!(
                "GitHub自动续期服务暂不可用（HTTP {status}），请稍后重试；账号已保留。"
            ),
            status: Some(status),
        });
    }
    let mut bytes = vec![];
    while let Some(chunk) = response.chunk().await.map_err(|_| Failure {
        reason: "network",
        message: "GitHub续期响应未读完，请稍后重试；账号已保留。".into(),
        status: Some(status),
    })? {
        if bytes.len() + chunk.len() > 32_768 {
            return Err(Failure {
                reason: "response",
                message: "GitHub续期响应超出可读取范围，账号已保留。".into(),
                status: Some(status),
            });
        }
        bytes.extend_from_slice(&chunk);
    }
    let value: Value = serde_json::from_slice(&bytes).map_err(|_| Failure {
        reason: "response",
        message: "GitHub续期响应格式无效，请稍后重试；账号已保留。".into(),
        status: Some(status),
    })?;
    if !response.status().is_success() || !text(&value, "error").is_empty() {
        let (reason, message) = match text(&value, "error") {
            "bad_refresh_token" | "invalid_grant" | "expired_token" | "access_denied" => (
                "refresh-revoked",
                "GitHub续期凭据已失效或被撤销，请在设置中重新进行网页授权。",
            ),
            "incorrect_client_credentials" | "unsupported_grant_type" => (
                "configuration",
                "GitHub自动续期应用配置未被接受，请联系开发者；账号已保留。",
            ),
            _ if status == 401 => (
                "refresh-revoked",
                "GitHub拒绝续期授权（HTTP 401），请在设置中重新进行网页授权。",
            ),
            _ => ("response", "GitHub自动续期未完成，请稍后重试；账号已保留。"),
        };
        return Err(Failure {
            reason,
            message: message.into(),
            status: Some(status),
        });
    }
    let grant = grant(&value, credential.flow).map_err(|message| Failure {
        reason: "response",
        message,
        status: Some(status),
    })?;
    if grant.refresh.is_none() {
        return Err(Failure {
            reason: "response",
            message: "GitHub续期未返回新的轮换凭据，请重新进行网页授权。".into(),
            status: Some(status),
        });
    }
    Ok(grant)
}
