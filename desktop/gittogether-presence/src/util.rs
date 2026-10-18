use serde_json::Value;
use std::path::{Component, Path};
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
pub fn now() -> i64 {
    chrono::Utc::now().timestamp_millis()
}
pub fn digest(data: impl AsRef<[u8]>) -> String {
    use sha2::{Digest, Sha256};
    format!("{:x}", Sha256::digest(data))
}
