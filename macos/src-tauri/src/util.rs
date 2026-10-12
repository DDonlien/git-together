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
    let home = crate::platform::home()?;
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
    dunce::canonicalize(path).map_err(|_| "目录不存在或不可访问。".into())
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
    #[cfg(windows)]
    {
        let mut paths = vec![];
        if let Ok(home) = crate::platform::home() {
            paths.extend([home.join(".local/bin"), home.join(".cargo/bin")]);
        }
        if let Some(roaming) = std::env::var_os("APPDATA") {
            paths.push(PathBuf::from(roaming).join("npm"));
        }
        for variable in ["ProgramW6432", "ProgramFiles", "ProgramFiles(x86)"] {
            if let Some(directory) = std::env::var_os(variable) {
                paths.push(PathBuf::from(directory).join("Git/cmd"));
            }
        }
        if let Some(directory) = std::env::var_os("LOCALAPPDATA") {
            paths.push(PathBuf::from(directory).join("Programs/Git/cmd"));
        }
        if let Some(existing) = std::env::var_os("PATH") {
            paths.extend(std::env::split_paths(&existing));
        }
        return std::env::join_paths(paths)
            .unwrap_or_default()
            .to_string_lossy()
            .into();
    }
    #[cfg(not(windows))]
    format!("{}/.local/bin:{}/.cargo/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:{}", std::env::var("HOME").unwrap_or_default(), std::env::var("HOME").unwrap_or_default(), std::env::var("PATH").unwrap_or_default())
}

pub fn find_tool(name: &str) -> Result<PathBuf> {
    let filename = if cfg!(windows) {
        format!("{name}.exe")
    } else {
        name.into()
    };
    for directory in std::env::split_paths(&tool_path()) {
        let path = directory.join(&filename);
        if std::fs::metadata(&path).is_ok_and(|m| crate::platform::executable(&m)) {
            return Ok(path);
        }
        #[cfg(windows)]
        if name == "codex" {
            // npm's .cmd is a shell shim. Locate the shipped native CLI instead
            // of interpreting the shim or interpolating repository text in cmd.
            for arch in ["x64", "arm64"] {
                let target = if arch == "arm64" { "aarch64" } else { "x86_64" };
                for package in [
                    directory.join(format!(
                        "node_modules/@openai/codex/node_modules/@openai/codex-win32-{arch}"
                    )),
                    directory.join(format!("node_modules/@openai/codex-win32-{arch}")),
                    directory.join("node_modules/@openai/codex"),
                ] {
                    for folder in ["bin", "codex"] {
                        let candidate = package.join(format!(
                            "vendor/{target}-pc-windows-msvc/{folder}/codex.exe"
                        ));
                        if candidate.is_file() {
                            return Ok(candidate);
                        }
                    }
                }
            }
        }
    }
    Err(format!("没有找到本机 {name}，请先安装并确认工具路径。"))
}
