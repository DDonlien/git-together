use crate::{git, platform, util::{self, Result}};
use serde_json::{json, Value};
use std::{collections::BTreeMap, fs, io, path::{Component, Path, PathBuf}, time::{Duration, Instant}};

#[derive(Default)]
pub struct State {
    drops: BTreeMap<String, (Instant, Vec<PathBuf>)>,
    plans: BTreeMap<String, (Instant, String, Plan)>,
}
#[derive(Clone)]
pub struct Plan { root: PathBuf, source_scope: Option<PathBuf>, operation: String, items: Vec<Item> }
#[derive(Clone)]
struct Item { source: PathBuf, target: Option<PathBuf>, fingerprint: String }
impl State {
    fn expire(&mut self) {
        self.drops.retain(|_, (time, _)| time.elapsed() < Duration::from_secs(600));
        self.plans.retain(|_, (time, _, _)| time.elapsed() < Duration::from_secs(600));
    }
    // Only a native OS drop can grant an external source. IPC accepts its ID,
    // never an arbitrary absolute path supplied by the renderer.
    pub fn drop_files(&mut self, paths: Vec<PathBuf>) -> Result<String> {
        self.expire();
        if paths.is_empty() || paths.len() > 256 || self.drops.len() >= 16 { return Err("拖入文件过多，请分批处理。".into()); }
        let id = uuid::Uuid::new_v4().to_string(); self.drops.insert(id.clone(), (Instant::now(), paths)); Ok(id)
    }
    pub fn sources(&mut self, id: &str) -> Result<Vec<PathBuf>> {
        self.expire(); self.drops.get(id).map(|(_, paths)| paths.clone()).ok_or("拖入记录已失效，请重新拖入。".into())
    }
    pub fn save(&mut self, identity: String, plan: Plan) -> Result<Value> {
        self.expire(); if self.plans.len() >= 32 { return Err("待处理文件操作过多，请关闭已有预览。".into()); }
        let id = uuid::Uuid::new_v4().to_string();
        let value = json!({"planId":id,"operation":plan.operation,"items":plan.items.iter().map(|item|json!({"source":item.source.file_name().map(|name|name.to_string_lossy()).unwrap_or_default(),"target":item.target.as_ref().map(|p|p.strip_prefix(&plan.root).unwrap().to_string_lossy().replace('\\',"/"))})).collect::<Vec<_>>()});
        self.plans.insert(id, (Instant::now(), identity, plan)); Ok(value)
    }
    pub fn take(&mut self, id: &str, identity: &str) -> Result<Plan> {
        self.expire();
        if !self.plans.get(id).is_some_and(|(_, saved, _)| saved == identity) { return Err("文件操作预览已失效，请重新选择。".into()); }
        Ok(self.plans.remove(id).unwrap().2)
    }
    pub fn discard(&mut self, id: &str, identity: &str) {
        if self.plans.get(id).is_some_and(|(_, saved, _)| saved == identity) { self.plans.remove(id); }
    }
}
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
        let options = git::Options { stdin: Some(input), ..git::Options::default() };
        let ignored = git::run(root, &["check-ignore", "--stdin", "-z"], options).await?;
        let ignored: std::collections::BTreeSet<_> = ignored.split('\0').map(|s| s.trim_end_matches('/')).collect();
        for entry in &mut entries { entry["ignored"] = json!(ignored.contains(util::text(entry, "path"))); }
    }
    Ok(json!({"path":path,"entries":entries}))
}
fn fingerprint(path: &Path) -> Result<String> {
    let mut rows = Vec::new();
    for entry in walkdir::WalkDir::new(path).follow_links(false).sort_by_file_name() {
        let entry = entry.map_err(|_| "无法完整读取文件内容，未开始操作。")?;
        if entry.file_name().to_string_lossy().eq_ignore_ascii_case(".git") { return Err("所选目录包含Git元数据，未开始操作。".into()); }
        let meta = fs::symlink_metadata(entry.path()).map_err(|e| problem("检查文件失败", e))?;
        if meta.file_type().is_symlink() || !(meta.is_file() || meta.is_dir()) { return Err("所选内容包含链接或特殊文件，未开始操作。".into()); }
        rows.push(format!("{}:{}", entry.path().strip_prefix(path).unwrap().display(), platform::metadata_key(&meta)));
    }
    Ok(util::digest(rows.join("\0")))
}
pub fn prepare(root: &Path, source_scope: Option<PathBuf>, sources: Vec<PathBuf>, operation: &str, destination: &str, name: &str) -> Result<Plan> {
    if !["copy", "move", "delete"].contains(&operation) || sources.is_empty() || sources.len() > 256 { return Err("无效的文件操作或文件数量。".into()); }
    let folder = if operation == "delete" { None } else { Some(relative(root, destination, true)?) };
    if folder.as_ref().is_some_and(|p| !p.is_dir()) { return Err("目标位置必须是目录。".into()); }
    if !name.is_empty() && (sources.len() != 1 || Path::new(name).components().count() != 1 || name.contains(['/', '\\']) || name == "." || name == ".." || name.eq_ignore_ascii_case(".git")) { return Err("目标文件名无效。".into()); }
    let mut items = Vec::new(); let mut seen = std::collections::BTreeSet::new();
    let mut sources = sources; sources.sort(); sources.dedup();
    // Selecting a directory and one of its descendants is one operation.
    sources.retain(|path| !path.ancestors().skip(1).any(|p| seen.contains(p)) && { seen.insert(path.clone()); true });
    let mut targets = std::collections::BTreeSet::new();
    for source in sources {
        if source == root { return Err("不能操作工作目录本身。".into()); }
        if source.file_name().is_none() { return Err("来源没有有效的文件名。".into()); }
        if source.components().any(|part|part.as_os_str().to_string_lossy().eq_ignore_ascii_case(".git")) { return Err("不能操作Git元数据。".into()); }
        let fingerprint = fingerprint(&source)?;
        let target = folder.as_ref().map(|folder| folder.join(if name.is_empty() { source.file_name().unwrap() } else { std::ffi::OsStr::new(name) }));
        if let Some(target) = &target {
            if target.starts_with(&source) { return Err("不能把文件夹放入自身或其子目录。".into()); }
            if fs::symlink_metadata(target).is_ok() || !targets.insert(target.clone()) { return Err("目标已有同名内容，请修改名称或选择其他目录；未覆盖原文件。".into()); }
        }
        items.push(Item { source, target, fingerprint });
    }
    Ok(Plan { root: root.to_owned(), source_scope, operation: operation.into(), items })
}
fn copy(source: &Path, target: &Path) -> Result<()> {
    let meta = fs::symlink_metadata(source).map_err(|e| problem("读取来源失败", e))?;
    if meta.is_dir() {
        fs::create_dir(target).map_err(|e| problem("创建目标目录失败", e))?;
        let entries = fs::read_dir(source).map_err(|e| format!("复制文件夹未完成，原始文件保留，目标目录可能包含部分内容：{}", problem("读取来源目录失败", e)))?;
        for row in entries {
            let row = row.map_err(|e| format!("复制文件夹未完成，原始文件保留，目标目录可能包含部分内容：{}", problem("读取来源文件失败", e)))?;
            copy(&row.path(), &target.join(row.file_name())).map_err(|error| format!("复制文件夹未完成，原始文件保留，目标目录可能包含部分内容：{error}"))?;
        }
    } else if meta.is_file() && !meta.file_type().is_symlink() {
        let mut source_file = fs::File::open(source).map_err(|e| problem("读取来源失败", e))?;
        let mut target_file = fs::OpenOptions::new().write(true).create_new(true).open(target).map_err(|e| problem("创建目标失败", e))?;
        io::copy(&mut source_file, &mut target_file).map_err(|e| problem("复制未完成，来源保留，请检查部分目标", e))?;
        target_file.sync_all().map_err(|e| problem("保存目标失败", e))?;
        fs::set_permissions(target, meta.permissions()).map_err(|e| problem("复制权限失败", e))?;
    } else { return Err("来源变成链接或特殊文件，操作已停止。".into()); }
    Ok(())
}
// Exclusive rename makes an intervening name conflict fail rather than replace
// another application's file. Cross-volume moves copy fully before trashing.
#[cfg(target_os = "macos")]
fn rename(source: &Path, target: &Path) -> io::Result<()> {
    use std::os::unix::ffi::OsStrExt;
    let s = std::ffi::CString::new(source.as_os_str().as_bytes())?; let t = std::ffi::CString::new(target.as_os_str().as_bytes())?;
    if unsafe { libc::renamex_np(s.as_ptr(), t.as_ptr(), libc::RENAME_EXCL) } == 0 { Ok(()) } else { Err(io::Error::last_os_error()) }
}
#[cfg(windows)]
fn rename(source: &Path, target: &Path) -> io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    let s: Vec<_> = source.as_os_str().encode_wide().chain(Some(0)).collect(); let t: Vec<_> = target.as_os_str().encode_wide().chain(Some(0)).collect();
    if unsafe { windows_sys::Win32::Storage::FileSystem::MoveFileExW(s.as_ptr(), t.as_ptr(), 0) } != 0 { Ok(()) } else { Err(io::Error::last_os_error()) }
}
#[cfg(target_os = "linux")]
fn rename(source: &Path, target: &Path) -> io::Result<()> {
    use std::os::unix::ffi::OsStrExt;
    let s = std::ffi::CString::new(source.as_os_str().as_bytes())?; let t = std::ffi::CString::new(target.as_os_str().as_bytes())?;
    if unsafe { libc::renameat2(libc::AT_FDCWD, s.as_ptr(), libc::AT_FDCWD, t.as_ptr(), libc::RENAME_NOREPLACE) } == 0 { Ok(()) } else { Err(io::Error::last_os_error()) }
}
pub fn apply(plan: Plan) -> Result<Value> {
    for item in &plan.items {
        if let Some(scope) = &plan.source_scope { relative(scope, item.source.strip_prefix(scope).map_err(|_| "来源不属于关联工作目录。")?.to_str().ok_or("来源路径无法读取。")?, false)?; }
        if fingerprint(&item.source)? != item.fingerprint { return Err("来源内容已变化，请重新预览后操作。".into()); }
        if let Some(target) = &item.target {
            relative(&plan.root, target.parent().unwrap().strip_prefix(&plan.root).unwrap().to_str().ok_or("目标路径无效。")?, true)?;
            if fs::symlink_metadata(target).is_ok() { return Err("目标已出现同名文件，未覆盖，请重新预览。".into()); }
        }
    }
    let mut completed = 0; let mut error = String::new();
    for item in &plan.items {
        let result = match plan.operation.as_str() {
            "copy" => copy(&item.source, item.target.as_ref().unwrap()),
            "move" => match rename(&item.source, item.target.as_ref().unwrap()) {
                Ok(()) => Ok(()),
                Err(e) if e.kind() == io::ErrorKind::CrossesDevices => copy(&item.source, item.target.as_ref().unwrap()).and_then(|_| trash::delete(&item.source).map_err(|_| "目标已复制，来源无法移入回收站，两个位置均保留。".into())),
                Err(e) => Err(problem("移动失败", e)),
            },
            _ => trash::delete(&item.source).map_err(|_| "系统回收站操作失败，未永久删除，请检查来源是否仍在。".into()),
        };
        match result { Ok(()) => completed += 1, Err(e) => { error = e; break; } }
    }
    Ok(json!({"completed":completed,"total":plan.items.len(),"error":error}))
}
