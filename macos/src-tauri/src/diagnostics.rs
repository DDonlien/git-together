use crate::util::{self, text, Result};
use serde_json::{json, Value};
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::PathBuf,
    sync::{atomic::{AtomicU64, Ordering}, mpsc::{self, SyncSender}, Arc, Mutex},
    time::{Duration, Instant},
};
const MAX_BYTES: u64 = 128 * 1024 * 1024;
#[derive(Clone)]
pub struct Diagnostics {
    pub directory: PathBuf,
    writer: Arc<LogWriter>,
    sender: SyncSender<LogMessage>,
    queued: Arc<AtomicU64>,
    dropped: Arc<AtomicU64>,
}
struct LogWriter {
    directory: PathBuf,
    component: String,
    session: String,
    state: Mutex<LogState>,
}
enum LogMessage { Record(Value, Instant), Barrier(SyncSender<()>) }
struct LogState {
    limited: bool,
    error: String,
    last: i64,
    written: u64,
}
impl Diagnostics {
    pub fn new(directory: PathBuf, component: &str) -> Self {
        let writer = Arc::new(LogWriter {
            directory: directory.clone(),
            component: component.into(),
            session: uuid::Uuid::new_v4().to_string(),
            state: Mutex::new(LogState {
                limited: false,
                error: String::new(),
                last: 0,
                written: 0,
            }),
        });
        let (sender, receiver) = mpsc::sync_channel(512);
        let queued = Arc::new(AtomicU64::new(0));
        let dropped = Arc::new(AtomicU64::new(0));
        let worker = writer.clone(); let pending = queued.clone(); let lost = dropped.clone();
        std::thread::Builder::new().name("gittogether-log-writer".into()).spawn(move || {
            let mut deferred = None;
            let mut reported_loss = 0;
            let mut measured = Instant::now(); let mut writes = 0u64; let mut write_ms = 0u64; let mut queue_ms = 0u64;
            loop {
                let message = match deferred.take() { Some(message) => message, None => match receiver.recv_timeout(Duration::from_secs(60)) {
                    Ok(message) => message, Err(mpsc::RecvTimeoutError::Timeout) => { worker.status(); continue; }, Err(mpsc::RecvTimeoutError::Disconnected) => break,
                }};
                match message {
                    LogMessage::Barrier(done) => {
                        let total = lost.load(Ordering::Relaxed);
                        if total > reported_loss && worker.write_records(&[worker.decorate(json!({"event":"performance","phase":"log-queue","outcome":"partial","dropped":total-reported_loss}))]) { reported_loss = total; }
                        let _ = done.send(());
                    },
                    LogMessage::Record(value, queued_at) => {
                        let mut batch = vec![value]; queue_ms = queue_ms.max(queued_at.elapsed().as_millis() as u64);
                        for _ in 1..64 { match receiver.try_recv() {
                            Ok(LogMessage::Record(value, queued_at)) => { batch.push(value); queue_ms = queue_ms.max(queued_at.elapsed().as_millis() as u64); },
                            Ok(barrier) => { deferred = Some(barrier); break; }, Err(_) => break,
                        }}
                        pending.fetch_sub(batch.len() as u64, Ordering::Relaxed);
                        writes += batch.len() as u64;
                        let started = Instant::now(); if !worker.write_records(&batch) { lost.fetch_add(batch.len() as u64, Ordering::Relaxed); } write_ms += started.elapsed().as_millis() as u64;
                        if measured.elapsed() >= Duration::from_secs(10) {
                            let total = lost.load(Ordering::Relaxed);
                            if worker.write_records(&[worker.decorate(json!({"event":"performance","phase":"log-write","outcome":if queue_ms >= 100 || total > reported_loss {"partial"}else{"success"},"durationMs":measured.elapsed().as_millis() as u64,"items":writes,"writeMs":write_ms,"queueMs":queue_ms,"queued":pending.load(Ordering::Relaxed),"dropped":total-reported_loss}))]) { reported_loss = total; }
                            measured = Instant::now(); writes = 0; write_ms = 0; queue_ms = 0;
                        }
                    },
                }
            }
        }).expect("无法启动本地日志写入线程");
        Self { directory, writer, sender, queued, dropped }
    }
    // true acknowledges a bounded queue, not a synchronous disk write.
    // All pruning, ACLs and append IO stay on the single background writer.
    pub fn record(&self, input: &Value, renderer: bool) -> bool {
        let Some(value) = sanitize(input, renderer) else { return false; };
        self.queued.fetch_add(1, Ordering::Relaxed);
        if self.sender.try_send(LogMessage::Record(self.writer.decorate(value), Instant::now())).is_ok() { true }
        else { self.queued.fetch_sub(1, Ordering::Relaxed); self.dropped.fetch_add(1, Ordering::Relaxed); false }
    }
    pub fn status(&self) -> Value {
        let (sender, receiver) = mpsc::sync_channel(1);
        let flushed = self.sender.send(LogMessage::Barrier(sender)).is_ok() && receiver.recv().is_ok();
        let mut status = self.writer.status();
        let dropped = self.dropped.load(Ordering::Relaxed);
        status["queued"] = json!(self.queued.load(Ordering::Relaxed)); status["dropped"] = json!(dropped);
        status["capacityLimited"] = status["limited"].clone();
        if dropped > 0 { status["limited"] = json!(true); }
        if !flushed { status["error"] = json!("日志写入线程已停止。"); }
        status
    }
}
impl LogWriter {
    fn decorate(&self, mut value: Value) -> Value {
        value["time"] = json!(util::iso()); value["version"] = json!(crate::VERSION); value["component"] = json!(self.component); value["session"] = json!(self.session); value
    }
    fn prepare(&self) -> Result<()> {
        if fs::symlink_metadata(&self.directory).is_ok_and(|m| m.file_type().is_symlink()) {
            return Err("日志目录链接无效（ELOOP）。".into());
        }
        crate::platform::private_directory(&self.directory).map_err(|_| "无法保护日志目录。".into())
    }
    fn files(&self) -> Result<Vec<(PathBuf, i64, u64)>> {
        let mut files = Vec::new();
        for item in fs::read_dir(&self.directory).map_err(|_| "无法读取日志目录。")? {
            let item = item.map_err(|_| "无法读取日志文件清单。")?;
            let name = item.file_name();
            let name = name.to_string_lossy();
            let Some(hour) = log_hour(&name) else {
                continue;
            };
            let m = fs::symlink_metadata(item.path()).map_err(|_| "无法读取日志文件状态。")?;
            if !m.is_file() || m.file_type().is_symlink() {
                continue;
            }
            files.push((item.path(), hour, m.len()));
        }
        files.sort_by_key(|(_, hour, _)| *hour);
        Ok(files)
    }
    fn prune(&self, state: &mut LogState) -> Result<()> {
        self.prepare()?;
        let cutoff = util::now() - 86_400_000;
        for (path, hour, _) in self.files()? {
            if hour + 3_600_000 <= cutoff {
                let _ = fs::remove_file(path);
            } else if hour <= cutoff {
                let bytes = fs::read(&path).map_err(|_| "日志边界清理读取失败。")?;
                if bytes.len() > MAX_BYTES as usize {
                    return Err("日志文件超过清理上限。".into());
                }
                let retained = String::from_utf8_lossy(&bytes)
                    .lines()
                    .filter_map(|line| serde_json::from_str::<Value>(line).ok())
                    .filter(|v| {
                        chrono::DateTime::parse_from_rfc3339(text(v, "time"))
                            .is_ok_and(|d| d.timestamp_millis() >= cutoff)
                            && sanitize(v, false).is_some()
                    })
                    .map(|v| v.to_string())
                    .collect::<Vec<_>>()
                    .join("\n");
                if retained.is_empty() {
                    let _ = fs::remove_file(path);
                } else {
                    let mut temp = tempfile::NamedTempFile::new_in(&self.directory)
                        .map_err(|_| "日志清理写入失败。")?;
                    crate::platform::private_file(temp.as_file()).map_err(|_| "日志保护失败。")?;
                    writeln!(temp, "{retained}").map_err(|_| "日志清理写入失败。")?;
                    temp.persist(path).map_err(|_| "日志清理发布失败。")?;
                }
            }
        }
        let files = self.files()?;
        let mut total = files.iter().map(|(_, _, s)| s).sum::<u64>();
        for (path, _, size) in files {
            if total <= MAX_BYTES {
                break;
            }
            fs::remove_file(path).map_err(|_| "日志容量清理失败。")?;
            total = total.saturating_sub(size);
            state.limited = true;
        }
        state.last = util::now();
        state.written = 0;
        Ok(())
    }
    fn write_records(&self, values: &[Value]) -> bool {
        let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        let result = (|| {
            if util::now() - state.last > 60_000 || state.written >= 1_048_576 {
                self.prune(&mut state)?;
            }
            self.prepare()?;
            let path = self.directory.join(format!(
                "diagnostics-{}-{}-{}.jsonl",
                util::now() / 3_600_000 * 3_600_000,
                self.component,
                self.session
            ));
            let mut file =
                crate::platform::open_regular(&path, OpenOptions::new().create(true).append(true))
                    .map_err(|_| "日志写入失败。")?;
            crate::platform::private_file(&file).map_err(|_| "日志保护失败。")?;
            let row = values.iter().map(|v| format!("{v}\n")).collect::<String>();
            file.write_all(row.as_bytes())
                .map_err(|_| "日志写入失败。")?;
            state.written += row.len() as u64;
            Ok::<(), String>(())
        })();
        match result {
            Ok(()) => {
                state.error.clear();
                true
            }
            Err(e) => {
                state.error = e;
                false
            }
        }
    }
    pub fn status(&self) -> Value {
        let mut s = self.state.lock().unwrap_or_else(|e| e.into_inner());
        if let Err(e) = self.prune(&mut s) {
            s.error = e;
        }
        json!({"directory":self.directory.to_string_lossy(),"retentionHours":24,"maxBytes":MAX_BYTES,"limited":s.limited,"error":s.error})
    }
}
impl Diagnostics {
    async fn inspect(&self) -> Result<Value> {
        let diagnostics = self.clone();
        tokio::task::spawn_blocking(move || diagnostics.status()).await.map_err(|_| "日志状态读取未完成。".into())
    }
    pub async fn command(&self, method: &str, input: &Value) -> Result<Value> {
        match method {
            "status" => self.inspect().await,
            "record" => {
                if self.record(input, true) {
                    Ok(json!(true))
                } else {
                    Err("日志事件无效或写入失败。".into())
                }
            }
            "open" => {
                let status = self.inspect().await?;
                if status["error"] != "" {
                    return Err(text(&status, "error").into());
                }
                crate::service::open(self.directory.to_str().ok_or("日志目录名称无法读取。")?)
                    .await?;
                Ok(json!(true))
            }
            "copy" => {
                self.inspect().await?;
                let writer = self.writer.clone();
                let files = tokio::task::spawn_blocking(move || writer.files()).await.map_err(|_| "日志文件读取未完成。")??.into_iter().map(|(p, _, _)| p).collect::<Vec<_>>();
                if files.is_empty() {
                    return Err("暂无可复制的日志文件。".into());
                }
                let count = files.len();
                tokio::task::spawn_blocking(move || copy_files(&files))
                    .await
                    .map_err(|_| "日志复制未完成。".to_string())??;
                Ok(json!(count))
            }
            _ => Err("不支持该日志操作。".into()),
        }
    }
}
fn log_hour(name: &str) -> Option<i64> {
    let tail = name.strip_prefix("diagnostics-")?.strip_suffix(".jsonl")?;
    let (hour, rest) = tail.split_once('-')?;
    if hour.len() != 13 {
        return None;
    }
    let (component, id) = rest.split_once('-')?;
    if !matches!(component, "app" | "preview" | "authorization" | "test")
        || uuid::Uuid::parse_str(id).is_err()
    {
        return None;
    }
    hour.parse().ok()
}
pub fn sanitize(v: &Value, renderer: bool) -> Option<Value> {
    let event = text(v, "event");
    let outcome = text(v, "outcome");
    if !["lifecycle","api","provider-read","git-read","git-write","storage","authorization","update","refresh","renderer","ui-action","performance"].contains(&event)||!"start success partial failure cancelled paused resumed retry online offline hidden visible blocked received accepted complete rejected failed current available ready installing".split_whitespace().any(|s|s==outcome)||(renderer&&!["api","refresh","renderer","ui-action","performance"].contains(&event)){return None;}
    let mut clean = json!({"event":event,"outcome":outcome});
    if !renderer && matches!(event,"authorization"|"storage") {
        for (key,allowed) in [
            ("authorizationStage","token-received token-rejected refresh-start refresh-complete refresh-failed refresh-unavailable storage-load"),
            ("authReason","granted renewed expiring expired rejected missing-refresh refresh-expired refresh-revoked configuration network rate-limit response storage stale cancelled"),
        ] {
            if allowed.split_whitespace().any(|allowed|allowed==text(v,key)) { clean[key]=v[key].clone(); }
        }
        for key in ["expiresInSeconds","refreshExpiresInSeconds"] {
            if v[key].as_i64().is_some_and(|n|(-31_536_000..=31_536_000).contains(&n)) { clean[key]=v[key].clone(); }
        }
    }
    let allowed=[("method","graphSources graphPreview prepareGraphMerge cancelGraphPreparation discardGraphMerge applyGraphMerge executeGraph createGraphWorktree openCommit fetchRepository prepareSync applySync discardSync submitCommit pushCommit submit generateCommitMessage cancelCommitGeneration status catalog connect updateAccount refresh removeAccount matchAccountRepositories link downloadBranch unlink snapshot localWorkspace localCommit remoteWorkspace remoteHistory remoteCommit remoteFile localDirectory prepareFileOperation applyFileOperation discardFileOperation openFile openDirectory openLocalDirectory openRepository diff githubAuthStart githubAuthPoll githubAuthCancel start poll cancel open check download install commit fetch pull push latest reconcile clear hide restore chooseDirectory preferences"),("provider","github github-enterprise gitlab gitee gitea"),("endpoint","identity repositories branches history tree commit file classification other"),("verb","status log diff worktree ls-tree ls-files check-ignore rev-parse for-each-ref config fetch ls-remote clone push add commit other"),("code","unknown aborted timeout connection permission rate-limit certificate invalid-data version session git git-remote-ref-missing git-lfs-missing git-lfs-object-missing git-lfs ENOENT EACCES EPERM ENOSPC EIO ELOOP EEXIST ENOTDIR EADDRINUSE ERR_CHILD_PROCESS_STDIO_MAXBUFFER ECONNREFUSED ENOTFOUND EAI_AGAIN ECONNRESET ETIMEDOUT UND_ERR_CONNECT_TIMEOUT CERT_HAS_EXPIRED DEPTH_ZERO_SELF_SIGNED_CERT SELF_SIGNED_CERT_IN_CHAIN UNABLE_TO_VERIFY_LEAF_SIGNATURE ERR_TLS_CERT_ALTNAME_INVALID ERR_UPDATER_INVALID_SIGNATURE ERR_UPDATER_INVALID_RELEASE_FEED ERR_UPDATER_INVALID_ARCHIVE ERR_UPDATER_VERSION ERR_UPDATER_HTTP ERR_UPDATER_TEMP_DIR ERR_UPDATER_RESTORE EXDEV EROFS EBUSY INVALID_LOG LOG_CAPACITY"),("signal","SIGTERM SIGKILL SIGABRT SIGSEGV"),("errorKind","Error TypeError SyntaxError RangeError ReferenceError AbortError TimeoutError")];
    for (key, list) in allowed {
        if v[key].is_string() && list.split_whitespace().any(|s| s == text(v, key)) {
            clean[key] = v[key].clone();
        }
    }
    if !renderer && event == "api" && text(v, "method") == "generateCommitMessage"
        && ["codex-model", "codex-auth", "codex-version", "codex-network", "codex-generation"].contains(&text(v, "code")) {
        clean["code"] = v["code"].clone();
    }
    if ["ui-window", "dashboard-render", "branch-render", "response-read", "response-validate", "git-queue", "worktree-read", "log-write", "log-queue", "renderer-log-queue"].contains(&text(v, "phase")) { clean["phase"] = v["phase"].clone(); }
for key in ["durationMs", "retryMs", "failures", "tasks", "frames", "slowFrames", "frameMaxMs", "lagMaxMs", "inputMaxMs", "nextFrameMaxMs", "longTasks", "longTaskSupported", "longTaskMaxMs", "renders", "renderMaxMs", "renderTotalMs", "items", "activeRequests", "peakRequests", "characters", "queueMs", "bytes", "dropped", "queued", "writeMs"] {
        if v[key].as_u64().is_some_and(|n| n <= 1_000_000_000_000) {
            clean[key] = v[key].clone();
        }
    }
    for (key, min, max) in [("httpStatus", 100, 599), ("exitCode", 0, 255)] {
        if v[key].as_u64().is_some_and(|n| n >= min && n <= max) {
            clean[key] = v[key].clone();
        }
    }
    for key in if renderer {
        vec!["requestId"]
    } else {
        vec!["requestId", "spanId", "parentId"]
    } {
        if uuid::Uuid::parse_str(text(v, key)).is_ok() {
            clean[key] = v[key].clone();
        }
    }
    if !renderer
        && text(v, "resource").len() == 24
        && text(v, "resource")
            .bytes()
            .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
    {
        clean["resource"] = v["resource"].clone();
    }
    if !renderer && event == "authorization" && v["systemCode"].as_i64().is_some_and(|n| (0..=i32::MAX as i64).contains(&n)) {
        clean["systemCode"] = v["systemCode"].clone();
    }
    if !renderer && event == "update" {
        if ["check", "download", "install", "extract"].contains(&text(v, "updateStage")) {
            clean["updateStage"] = v["updateStage"].clone();
        }
        if [
            "Io",
            "Reqwest",
            "Signature",
            "Version",
            "Restore",
            "Updater",
        ]
        .contains(&text(v, "updaterError"))
        {
            clean["updaterError"] = v["updaterError"].clone();
        }
        if v["systemCode"]
            .as_i64()
            .is_some_and(|n| (0..=i32::MAX as i64).contains(&n))
        {
            clean["systemCode"] = v["systemCode"].clone();
        }
        let version = text(v, "updateVersion");
        if !version.is_empty()
            && version.len() <= 64
            && version
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b".-+".contains(&b))
        {
            clean["updateVersion"] = v["updateVersion"].clone();
        }
        if let Some(chain) = v["errorChain"].as_array() {
            clean["errorChain"] = json!(chain
                .iter()
                .take(8)
                .filter_map(Value::as_str)
                .map(|s| s.chars().take(1024).collect::<String>())
                .collect::<Vec<_>>());
        }
    }
    Some(clean)
}

#[cfg(target_os = "macos")]
fn copy_files(files: &[PathBuf]) -> Result<()> {
    use std::{
        ffi::{c_void, CString},
        mem::transmute,
    };
    type Id = *mut c_void;
    #[link(name = "AppKit", kind = "framework")]
    extern "C" {}
    #[link(name = "objc")]
    extern "C" {
        fn objc_getClass(name: *const i8) -> Id;
        fn sel_registerName(name: *const i8) -> Id;
        fn objc_msgSend();
        fn objc_autoreleasePoolPush() -> Id;
        fn objc_autoreleasePoolPop(pool: Id);
    }
    unsafe {
        let pool = objc_autoreleasePoolPush();
        let result = (|| {
            let send0: unsafe extern "C" fn(Id, Id) -> Id = transmute(objc_msgSend as *const ());
            let send1: unsafe extern "C" fn(Id, Id, Id) -> Id =
                transmute(objc_msgSend as *const ());
            let bool1: unsafe extern "C" fn(Id, Id, Id) -> bool =
                transmute(objc_msgSend as *const ());
            let sel = |s: &str| sel_registerName(CString::new(s).unwrap().as_ptr());
            let class = |s: &str| objc_getClass(CString::new(s).unwrap().as_ptr());
            let array = send0(class("NSMutableArray"), sel("array"));
            for p in files {
                let path = CString::new(p.to_str().ok_or("日志路径无法读取。")?)
                    .map_err(|_| "日志路径无效。")?;
                let string = send1(
                    class("NSString"),
                    sel("stringWithUTF8String:"),
                    path.as_ptr() as Id,
                );
                let url = send1(class("NSURL"), sel("fileURLWithPath:"), string);
                send1(array, sel("addObject:"), url);
            }
            let pasteboard = send0(class("NSPasteboard"), sel("generalPasteboard"));
            send0(pasteboard, sel("clearContents"));
            if bool1(pasteboard, sel("writeObjects:"), array) {
                Ok(())
            } else {
                Err("无法把日志文件复制到剪贴板。".into())
            }
        })();
        objc_autoreleasePoolPop(pool);
        result
    }
}
#[cfg(windows)]
fn copy_files(files: &[PathBuf]) -> Result<()> {
    crate::platform::copy_files(files)
}
#[cfg(not(any(target_os = "macos", windows)))]
fn copy_files(_: &[PathBuf]) -> Result<()> {
    Err("当前系统暂不支持复制日志文件。".into())
}
