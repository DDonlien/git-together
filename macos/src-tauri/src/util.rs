use serde_json::Value;
use std::path::{Component, Path, PathBuf};
pub type Result<T> = std::result::Result<T, String>;
pub fn text<'a>(value: &'a Value, key: &str) -> &'a str {
    value[key].as_str().unwrap_or("")
}
pub fn field(value: &Value, key: &str, limit: usize) -> Result<String> {
    let v = value[key]
        .as_str()
        .ok_or_else(|| format!("无效的 {key}。"))?;
    if v.len() > limit || v.contains(['\0', '\r', '\n']) {
        return Err(format!("无效的 {key}。"));
    }
    Ok(v.trim().to_owned())
}
pub fn allowed(value: &Value, keys: &[&str]) -> Result<()> {
    let object = value.as_object().ok_or("请求格式无效。")?;
    if object.keys().any(|key| !keys.contains(&key.as_str())) {
        return Err("请求包含不支持的字段。".into());
    }
    Ok(())
}
pub fn valid_sha(value: &str) -> bool {
    matches!(value.len(), 40 | 64)
        && value
            .bytes()
            .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
}
pub fn sha(value: &str) -> Result<String> {
    if valid_sha(value) {
        Ok(value.into())
    } else {
        Err("无效的 Git 对象标识。".into())
    }
}
pub fn file_path(value: &str) -> Result<String> {
    if value.is_empty()
        || value.len() > 4096
        || value.contains(['\0', '\\'])
        || Path::new(value).is_absolute()
        || Path::new(value)
            .components()
            .any(|p| !matches!(p, Component::Normal(_)))
        || value.split('/').any(|p| p.eq_ignore_ascii_case(".git"))
    {
        return Err("无效的仓库文件路径。".into());
    }
    Ok(value.into())
}
pub fn absolute(value: &str) -> Result<PathBuf> {
    let home = std::env::var_os("HOME")
        .map(PathBuf::from)
        .ok_or("无法读取用户目录。")?;
    let path = if value == "~" {
        home
    } else if let Some(suffix) = value.strip_prefix("~/") {
        home.join(suffix)
    } else {
        PathBuf::from(value)
    };
    if !path.is_absolute() {
        return Err("请选择绝对的本地目录。".into());
    }
    std::fs::canonicalize(path).map_err(|_| "目录不存在或不可访问。".into())
}
pub fn now() -> i64 {
    chrono::Utc::now().timestamp_millis()
}
pub fn iso() -> String {
    chrono::Utc::now().to_rfc3339()
}
pub fn digest(data: impl AsRef<[u8]>) -> String {
    use sha2::{Digest, Sha256};
    format!("{:x}", Sha256::digest(data))
}
pub fn identity(value: &str) -> Option<String> {
    let source = value.trim();
    let address = if source.contains("://") {
        source.to_owned()
    } else {
        let (host, path) = source.split_once(':')?;
        format!("ssh://{host}/{path}")
    };
    let url = url::Url::parse(&address).ok()?;
    if !matches!(url.scheme(), "https" | "http" | "ssh" | "git") {
        return None;
    }
    let path = percent_encoding::percent_decode_str(url.path())
        .decode_utf8()
        .ok()?
        .trim_matches('/')
        .to_lowercase();
    // Preserve the existing repository identity across SSH/HTTPS transports.
    // Credentials remain bound to the actual HTTP origin in Network::new.
    Some(format!(
        "{}/{}",
        url.host_str()?.to_lowercase(),
        path.strip_suffix(".git").unwrap_or(&path)
    ))
}
pub fn tool_path() -> String {
    format!("{}/.local/bin:{}/.cargo/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:{}", std::env::var("HOME").unwrap_or_default(), std::env::var("HOME").unwrap_or_default(), std::env::var("PATH").unwrap_or_default())
}
