use crate::util::Result;
use std::path::PathBuf;

pub fn profile() -> Result<Option<String>> {
    let value = std::env::args()
        .find_map(|arg| arg.strip_prefix("--presence-instance=").map(str::to_owned));
    if let Some(id) = &value {
        if id.is_empty()
            || id.len() > 64
            || !id
                .bytes()
                .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
        {
            return Err("实例名称只能包含小写字母、数字和连字符，最长64个字符。".into());
        }
    }
    Ok(value)
}
pub fn data_root() -> Result<PathBuf> {
    let root = crate::platform::data_root()?;
    Ok(match profile()? {
        Some(id) => root.join("instances").join(id),
        None => root,
    })
}
pub fn open_other() -> Result<()> {
    let mut command =
        std::process::Command::new(std::env::current_exe().map_err(|_| "无法定位应用。")?);
    if profile()?.is_none() {
        command.arg("--presence-instance=secondary");
    }
    command
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|_| "独立实例无法启动。")?;
    Ok(())
}
