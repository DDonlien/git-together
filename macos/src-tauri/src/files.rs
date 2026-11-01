use crate::{git, util::{self, Result}};
use serde_json::{json, Value};
use std::{fs, io, path::{Component, Path, PathBuf}};

fn problem(action: &str, error: io::Error) -> String {
    let reason = match error.kind() {
        io::ErrorKind::PermissionDenied => "系统拒绝访问", io::ErrorKind::NotFound => "文件或目录已不存在",
        io::ErrorKind::AlreadyExists => "目标已存在，未覆盖", io::ErrorKind::StorageFull => "磁盘空间不足",
        io::ErrorKind::ReadOnlyFilesystem => "磁盘只读", _ => "系统文件操作失败",
    };
    format!("{action}：{reason}（系统错误码 {}）。", error.raw_os_error().unwrap_or(0))
}
pub fn relative(root: &Path, value: &str, allow_root: bool) -> Result<PathBuf> {
    if value.is_empty() && allow_root { return Ok(root.to_owned()); }
    util::file_path(value)?;
    let mut path = root.to_owned();
    for part in Path::new(value).components() {
        let Component::Normal(name) = part else { return Err("文件路径必须位于当前工作目录。".into()); };
        if name.to_string_lossy().eq_ignore_ascii_case(".git") { return Err("不能操作Git元数据。".into()); }
        path.push(name);
        let meta = fs::symlink_metadata(&path).map_err(|e| problem("读取路径失败", e))?;
        if meta.file_type().is_symlink() { return Err("链接路径不能用于文件操作。".into()); }
    }
    Ok(path)
}
pub async fn directory(root: &Path, path: &str) -> Result<Value> {
    let folder = relative(root, path, true)?;
    let mut entries = Vec::new(); let mut input = Vec::new();
    for row in fs::read_dir(&folder).map_err(|e| problem("读取目录失败", e))? {
        let row = row.map_err(|e| problem("读取目录项失败", e))?;
        let name = row.file_name().into_string().map_err(|_| "文件名包含无法显示的文字。")?;
        if name.eq_ignore_ascii_case(".git") { continue; }
        let meta = fs::symlink_metadata(row.path()).map_err(|e| problem("读取文件信息失败", e))?;
        let link = row.file_type().map_err(|e| problem("读取文件类型失败", e))?.is_symlink();
        let relative = if path.is_empty() { name.clone() } else { format!("{path}/{name}") };
        input.extend(relative.as_bytes()); if meta.is_dir() { input.push(b'/'); } input.push(0);
        entries.push(json!({"name":name,"path":relative,"directory":meta.is_dir() && !link,"link":link,"ignored":false,"hidden":name.starts_with('.'),"size":meta.len(),"modified":meta.modified().ok().and_then(|v|v.duration_since(std::time::UNIX_EPOCH).ok()).map(|v|v.as_millis() as u64).unwrap_or(0)}));
    }
    if !entries.is_empty() {
        let options = git::Options { stdin: Some(input), ..git::READ_CONTEXT.try_with(Clone::clone).unwrap_or_default() };
        let ignored = git::run(root, &["check-ignore", "--stdin", "-z"], options).await?;
        let ignored: std::collections::BTreeSet<_> = ignored.split('\0').map(|s| s.trim_end_matches('/')).collect();
        for entry in &mut entries { entry["ignored"] = json!(ignored.contains(util::text(entry, "path"))); }
    }
    Ok(json!({"path":path,"entries":entries}))
}
