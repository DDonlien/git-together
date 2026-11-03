use crate::util::{self, text, Result};
use serde_json::{json, Value};
use std::{
    fs::{self, OpenOptions},
    io::{Read, Seek, SeekFrom, Write},
    path::PathBuf,
    sync::{atomic::{AtomicU64, Ordering}, mpsc::{self, SyncSender}, Arc, Mutex},
    time::{Duration, Instant},
};
const RETENTION_HOURS: i64 = 7 * 24;
const MAX_BYTES: u64 = 512 * 1024 * 1024;
const RECENT_RECORDS: usize = 500;
const RECENT_BYTES: usize = 256 * 1024;
const RECENT_FILE_BYTES: u64 = 256 * 1024;
const RECENT_FILES: usize = 64;
const RECENT_SOURCE_BYTES: u64 = RECENT_FILE_BYTES * RECENT_FILES as u64;
const RECENT_LINE_BYTES: usize = 16 * 1024;
const CAPACITY_ERROR: &str = "日志达到空间上限，当前日志文件已保留，写入已暂停；仍可查看、打开或复制现有日志，下一小时轮换后会重试写入。";
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
    total: u64,
    pruned: bool,
    write_paused: bool,
    required: u64,
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
                total: 0,
                pruned: false,
                write_paused: false,
                required: 0,
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
        if fs::symlink_metadata(&self.directory).is_ok_and(|m| crate::platform::is_link(&m)) {
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
            if !m.is_file() || crate::platform::is_link(&m) {
                continue;
            }
            files.push((item.path(), hour, m.len()));
        }
        files.sort_by(|(a, ah, _),(b, bh, _)| ah.cmp(bh).then_with(||a.cmp(b)));
        Ok(files)
    }
    fn prune_at(&self, state: &mut LogState, now: i64, max_bytes: u64) -> Result<()> {
        self.prune_for_write(state,now,max_bytes,state.required)
    }
    fn prune_for_write(&self, state: &mut LogState, now: i64, max_bytes: u64, incoming_bytes: u64) -> Result<()> {
        self.prepare()?;
        let cutoff = now - RETENTION_HOURS * 3_600_000;
        for (path, hour, _) in self.files()? {
            if hour + 3_600_000 <= cutoff {
                let _ = fs::remove_file(path);
            }
        }
        // Keep boundary-hour archives intact rather than rewriting their
        // records. Hourly rotation conservatively retains up to one extra hour.
        let files = self.files()?;
        let mut total = files.iter().fold(0u64,|total,(_,_,size)|total.saturating_add(*size));
        for (path, hour, size) in files {
            if total <= max_bytes.saturating_sub(incoming_bytes) {
                break;
            }
            // A current-hour file may still be open by another log writer.
            // Preserve active archives instead of deleting the newest records.
            if hour >= now / 3_600_000 * 3_600_000 { continue; }
            fs::remove_file(path).map_err(|_| "日志容量清理失败。")?;
            total = total.saturating_sub(size);
            state.limited = true;
            state.pruned = true;
        }
        state.total=total;
        state.write_paused=total>=max_bytes || total.saturating_add(incoming_bytes)>max_bytes;
        if state.write_paused { state.limited=true;state.error=CAPACITY_ERROR.into(); }
        else { state.required=0;if state.error==CAPACITY_ERROR { state.error.clear(); } }
        state.last = now;
        state.written = 0;
        Ok(())
    }
    fn write_records(&self, values: &[Value]) -> bool {
        self.write_records_with_limit(values,MAX_BYTES)
    }
    fn write_records_with_limit(&self, values: &[Value], max_bytes: u64) -> bool {
        let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        let result = (|| {
            let row = values.iter().map(|v| format!("{v}\n")).collect::<String>();
            if util::now() - state.last > 60_000 || state.written >= 1_048_576 || state.total.saturating_add(row.len() as u64)>max_bytes {
                self.prune_for_write(&mut state,util::now(),max_bytes,row.len() as u64)?;
            }
            if state.total.saturating_add(row.len() as u64)>max_bytes {
                state.limited=true;state.write_paused=true;state.required=row.len() as u64;
                return Err(CAPACITY_ERROR.into());
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
            file.write_all(row.as_bytes())
                .map_err(|_| "日志写入失败。")?;
            state.written += row.len() as u64;
            state.total=state.total.saturating_add(row.len() as u64);
            state.write_paused=false;
            state.required=0;
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
        self.status_with_limit(MAX_BYTES)
    }
    fn status_with_limit(&self,max_bytes: u64) -> Value {
        let mut s = self.state.lock().unwrap_or_else(|e| e.into_inner());
        if let Err(e) = self.prune_at(&mut s,util::now(),max_bytes) {
            s.error = e;
        }
        json!({"directory":self.directory.to_string_lossy(),"retentionHours":RETENTION_HOURS,"maxBytes":max_bytes,"limited":s.limited,"error":s.error,"retainedBytes":s.total.min(9_007_199_254_740_991),"capacityPruned":s.pruned,"writePaused":s.write_paused})
    }

    fn recent(&self, flushed: bool) -> Result<Value> {
        let mut files = match fs::symlink_metadata(&self.directory) {
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Vec::new(),
            Err(_) => return Err("日志目录无法读取。".into()),
            Ok(metadata) if !metadata.is_dir() || crate::platform::is_link(&metadata) => return Err("日志目录链接无效（ELOOP）。".into()),
            Ok(_) => self.files()?,
        };
        let file_count=files.len();
        let total_bytes=files.iter().fold(0u64,|total,(_,_,size)|total.saturating_add(*size)).min(9_007_199_254_740_991);
        // Last modification selects the files most recently written even when
        // several sessions/components share one hourly bucket. Record times,
        // not directory order, determine the final ordering across those files.
        files.sort_by_cached_key(|(path,_,_)| (std::cmp::Reverse(fs::metadata(path).and_then(|metadata|metadata.modified()).unwrap_or(std::time::UNIX_EPOCH)),path.clone()));
        let mut candidates=Vec::new();
        let mut read_bytes=0u64;
        let mut omitted=file_count>RECENT_FILES;
        let mut invalid=false;
        for (rank,(path,_,_)) in files.into_iter().take(RECENT_FILES).enumerate() {
            if read_bytes>=RECENT_SOURCE_BYTES { omitted=true;break; }
            let name=path.file_name().and_then(|name|name.to_str()).ok_or("日志文件名称无效。")?;
            let (_,component,session)=log_identity(name).ok_or("日志文件名称无效。")?;
            let mut file=crate::platform::open_regular(&path,OpenOptions::new().read(true)).map_err(|_| "近期日志文件无法读取。")?;
            let length=file.metadata().map_err(|_| "近期日志状态无法读取。")?.len();
            let count=length.min(RECENT_FILE_BYTES).min(RECENT_SOURCE_BYTES-read_bytes);
            let offset=length-count;
            if offset>0 { omitted=true; }
            file.seek(SeekFrom::Start(offset)).map_err(|_| "近期日志定位失败。")?;
            let mut bytes=Vec::with_capacity(count as usize);
            Read::by_ref(&mut file).take(count).read_to_end(&mut bytes).map_err(|_| "近期日志读取失败。")?;
            if bytes.len() as u64!=count { omitted=true; }
            read_bytes+=bytes.len() as u64;
            let start=if offset>0 { bytes.iter().position(|byte|*byte==b'\n').map_or(bytes.len(),|position|position+1) }else{0};
            let end=bytes.iter().rposition(|byte|*byte==b'\n').map_or(0,|position|position+1);
            if end<bytes.len() { invalid=true; }
            if start>=end { continue; }
            for (line_index,line) in bytes[start..end].split(|byte|*byte==b'\n').enumerate() {
                if line.is_empty() { continue; }
                if line.len()>RECENT_LINE_BYTES { invalid=true;continue; }
                let record=serde_json::from_slice::<Value>(line).ok().and_then(|value|recent_record(&value,component,&session));
                if let Some((timestamp,record))=record { candidates.push((timestamp,rank,line_index,record)); }
                else { invalid=true; }
            }
        }
        candidates.sort_by(|a,b|b.0.cmp(&a.0).then_with(||a.1.cmp(&b.1)).then_with(||b.2.cmp(&a.2)));
        let mut records=Vec::new();
        let mut returned_bytes=2usize;
        let candidate_count=candidates.len();
        for (_,_,_,record) in candidates {
            let bytes=serde_json::to_vec(&record).map_err(|_| "近期日志格式无效。")?.len()+usize::from(!records.is_empty());
            // Leave room for the fixed response metadata so the whole reply
            // remains within 256 KiB, not only its record array.
            if records.len()>=RECENT_RECORDS || returned_bytes+bytes>RECENT_BYTES-4096 { omitted=true;break; }
            returned_bytes+=bytes; records.push(record);
        }
        if records.len()<candidate_count { omitted=true; }
        let newest=records.first().map(|record|record["time"].clone()).unwrap_or(Value::Null);
        let oldest=records.last().map(|record|record["time"].clone()).unwrap_or(Value::Null);
        Ok(json!({"records":records,"truncated":omitted||invalid||!flushed,"hasOlder":omitted,"files":file_count,"totalBytes":total_bytes,"returnedBytes":returned_bytes,"maxRecords":RECENT_RECORDS,"maxBytes":RECENT_BYTES,"oldestTime":oldest,"newestTime":newest}))
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
            "recent" => {
                util::allowed(input,&[])?;
                let diagnostics=self.clone();
                tokio::task::spawn_blocking(move || {
                    let (sender,receiver)=mpsc::sync_channel(1);
                    let flushed=diagnostics.sender.try_send(LogMessage::Barrier(sender)).is_ok() && receiver.recv_timeout(Duration::from_secs(2)).is_ok();
                    diagnostics.writer.recent(flushed)
                }).await.map_err(|_| "近期日志读取未完成。")?
            }
            "record" => {
                if self.record(input, true) {
                    Ok(json!(true))
                } else {
                    Err("日志事件无效或写入失败。".into())
                }
            }
            "open" => {
                self.inspect().await?;
                let directory=self.directory.clone();
                tokio::task::spawn_blocking(move || {
                    let metadata=fs::symlink_metadata(directory).map_err(|_| "日志目录无法读取。")?;
                    if !metadata.is_dir() || crate::platform::is_link(&metadata) { return Err("日志目录链接无效（ELOOP）。".to_string()); }
                    Ok(())
                }).await.map_err(|_| "日志目录验证未完成。")??;
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
    log_identity(name).map(|(hour,_,_)|hour)
}
fn log_identity(name: &str) -> Option<(i64,&str,uuid::Uuid)> {
    let tail = name.strip_prefix("diagnostics-")?.strip_suffix(".jsonl")?;
    let (hour, rest) = tail.split_once('-')?;
    if hour.len() != 13 {
        return None;
    }
    let (component, id) = rest.split_once('-')?;
    if !matches!(component, "app" | "preview" | "authorization" | "test") {
        return None;
    }
    Some((hour.parse().ok()?,component,uuid::Uuid::parse_str(id).ok()?))
}
fn recent_record(value: &Value,component: &str,session: &uuid::Uuid) -> Option<(chrono::DateTime<chrono::Utc>,Value)> {
    let time=text(value,"time");
    if time.len()>64 { return None; }
    let timestamp=chrono::DateTime::parse_from_rfc3339(time).ok()?;
    let version=display_version(text(value,"version"))?;
    if text(value,"component")!=component || uuid::Uuid::parse_str(text(value,"session")).ok().as_ref()!=Some(session) { return None; }
    let mut clean=sanitize(value,false)?;
    // Updater chains on disk are bounded developer diagnostics but can contain
    // free text. The app viewer only exposes finite allowlisted fields.
    clean.as_object_mut()?.remove("errorChain");
    if clean.get("updateVersion").is_some_and(|version|display_version(version.as_str().unwrap_or("")).is_none()) { clean.as_object_mut()?.remove("updateVersion"); }
    clean["time"]=json!(timestamp.to_utc().to_rfc3339_opts(chrono::SecondsFormat::AutoSi,true));
    clean["version"]=json!(version); clean["component"]=json!(component); clean["session"]=json!(session.to_string());
    Some((timestamp.to_utc(),clean))
}
fn display_version(value: &str) -> Option<String> {
    if value.len()>64 { return None; }
    let parsed=semver::Version::parse(value).ok()?;
    if !parsed.build.is_empty() || !parsed.pre.is_empty() && !parsed.pre.as_str().strip_prefix("lite.").is_some_and(|number|!number.is_empty()&&number.bytes().all(|byte|byte.is_ascii_digit())) { return None; }
    Some(parsed.to_string())
}
pub fn sanitize(v: &Value, renderer: bool) -> Option<Value> {
    let event = text(v, "event");
    let outcome = text(v, "outcome");
    if !["lifecycle","api","provider-read","git-read","git-write","storage","authorization","update","refresh","renderer","ui-action","performance"].contains(&event)||!"start success partial failure cancelled paused resumed retry online offline hidden visible blocked received accepted complete rejected failed current available ready installing".split_whitespace().any(|s|s==outcome)||(renderer&&!["api","refresh","renderer","ui-action","performance"].contains(&event)){return None;}
    let mut clean = json!({"event":event,"outcome":outcome});
    if !renderer && matches!(event, "git-read" | "git-write") {
        for (key, allowed) in [
            ("authentication", "system account"),
            ("gitFailureReason", "workflow-permission sso-required remote-policy write-permission ssh-key-rejected ssh-host-key credential-rejected credential-unavailable rate-limit repository-unavailable access-denied non-fast-forward remote-rejected"),
        ] {
            if allowed.split_whitespace().any(|value| value == text(v, key)) {
                clean[key] = v[key].clone();
            }
        }
    }
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
    let allowed=[("method","integrationBranches integrationCommits prepareIntegration applyIntegration restoreIntegration discardIntegration graphSources graphPreview prepareGraphMerge cancelGraphPreparation discardGraphMerge applyGraphMerge executeGraph createGraphWorktree openCommit fetchRepository prepareSync inspectDivergence applySync discardSync ignoreFile submitCommit pushCommit submit generateCommitMessage generateCommitPlan cancelCommitGeneration status catalog connect accountRepositoryAccess openAccountAccessSettings setRepositoryAuthentication updateAccount refresh removeAccount matchAccountRepositories link downloadBranch dismissBranchIssue unlink snapshot localWorkspace localCommit remoteWorkspace remoteHistory remoteCommit remoteFile localDirectory prepareFileOperation applyFileOperation discardFileOperation openFile openDirectory openLocalDirectory openRepository diff githubAuthStart githubAuthPoll githubAuthCancel start poll cancel open check download install commit fetch pull push latest reconcile clear hide restore chooseDirectory preferences"),("provider","github github-enterprise gitlab gitee gitea"),("endpoint","identity repositories branches history tree commit file classification other"),("verb","status log diff worktree ls-tree ls-files check-ignore rev-parse for-each-ref config fetch ls-remote clone push add commit other"),("code","unknown aborted timeout connection permission rate-limit certificate invalid-data version session git git-remote-ref-missing git-lfs-missing git-lfs-object-missing git-lfs ENOENT EACCES EPERM ENOSPC EIO ELOOP EEXIST ENOTDIR EADDRINUSE ERR_CHILD_PROCESS_STDIO_MAXBUFFER ECONNREFUSED ENOTFOUND EAI_AGAIN ECONNRESET ETIMEDOUT UND_ERR_CONNECT_TIMEOUT CERT_HAS_EXPIRED DEPTH_ZERO_SELF_SIGNED_CERT SELF_SIGNED_CERT_IN_CHAIN UNABLE_TO_VERIFY_LEAF_SIGNATURE ERR_TLS_CERT_ALTNAME_INVALID ERR_UPDATER_INVALID_SIGNATURE ERR_UPDATER_INVALID_RELEASE_FEED ERR_UPDATER_INVALID_ARCHIVE ERR_UPDATER_VERSION ERR_UPDATER_HTTP ERR_UPDATER_TEMP_DIR ERR_UPDATER_RESTORE EXDEV EROFS EBUSY INVALID_LOG LOG_CAPACITY"),("signal","SIGTERM SIGKILL SIGABRT SIGSEGV"),("errorKind","Error TypeError SyntaxError RangeError ReferenceError AbortError TimeoutError")];
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    fn writer(directory: &Path) -> LogWriter {
        LogWriter {directory:directory.into(),component:"test".into(),session:uuid::Uuid::new_v4().to_string(),state:Mutex::new(LogState {limited:false,error:String::new(),last:0,written:0,total:0,pruned:false,write_paused:false,required:0})}
    }
    fn row(session: &uuid::Uuid, time: &str, tasks: u64) -> Value {
        json!({"time":time,"version":crate::VERSION,"component":"test","session":session.to_string(),"event":"api","outcome":"success","method":"localWorkspace","tasks":tasks})
    }
    fn file(directory: &Path,hour: i64,session: &uuid::Uuid,values: &[Value]) -> PathBuf {
        fs::create_dir_all(directory).unwrap();
        let path=directory.join(format!("diagnostics-{hour}-test-{session}.jsonl"));
        fs::write(&path,values.iter().map(|value|format!("{value}\n")).collect::<String>()).unwrap();
        path
    }
    fn hour() -> i64 {util::now()/3_600_000*3_600_000}
    fn time(millis: i64) -> String {chrono::DateTime::from_timestamp_millis(millis).unwrap().to_rfc3339()}

    #[test]
    fn recent_resanitizes_disk_records_and_retains_safe_authorization_and_ignore_events() {
        let temporary=tempfile::tempdir().unwrap(); let writer=writer(temporary.path()); let session=uuid::Uuid::new_v4();
        let mut auth=row(&session,&time(hour()+1000),1);
        auth["event"]=json!("authorization");auth["outcome"]=json!("partial");auth["authReason"]=json!("configuration");
        auth["token"]=json!("fixture-private-token");auth["path"]=json!("/fixture/private/path");auth["message"]=json!("fixture-private-message");
        let mut ignore=row(&session,&time(hour()+2000),2);ignore["method"]=json!("ignoreFile");
        let mut update=row(&session,&time(hour()+3000),3);update["event"]=json!("update");update["errorChain"]=json!(["fixture-private-token"]);update["updateVersion"]=json!("1.2.3-sensitiveversion");
        let path=file(temporary.path(),hour(),&session,&[auth,ignore,update]); let original=fs::read(&path).unwrap();
        let result=writer.recent(true).unwrap(); let records=result["records"].as_array().unwrap();
        assert_eq!(records.len(),3);assert_eq!(records[1]["method"],"ignoreFile");assert_eq!(records[2]["authReason"],"configuration");assert_eq!(records[2]["outcome"],"partial");
        for private in ["fixture-private-token","/fixture/private/path","fixture-private-message","sensitiveversion","errorChain"] {assert!(!result.to_string().contains(private),"{private}");}
        assert_eq!(fs::read(&path).unwrap(),original);
    }

    #[test]
    fn recent_merges_same_hour_sessions_by_timestamp_including_submillisecond_order() {
        let temporary=tempfile::tempdir().unwrap();let writer=writer(temporary.path());
        let a=uuid::Uuid::new_v4();let b=uuid::Uuid::new_v4();
        file(temporary.path(),hour(),&a,&[row(&a,"2026-11-02T00:00:00.000000001Z",1),row(&a,"2026-11-02T00:00:00.000000003Z",3)]);
        file(temporary.path(),hour(),&b,&[row(&b,"2026-11-02T00:00:00.000000002Z",2)]);
        let result=writer.recent(true).unwrap();
        assert_eq!(result["records"].as_array().unwrap().iter().map(|value|value["tasks"].as_u64().unwrap()).collect::<Vec<_>>(),[3,2,1]);
        assert_eq!(result["newestTime"],"2026-11-02T00:00:00.000000003Z");
        assert_eq!(result["oldestTime"],"2026-11-02T00:00:00.000000001Z");assert_eq!(result["truncated"],false);
    }

    #[test]
    fn recent_does_not_starve_a_fifth_file_with_newest_records_and_older_mtime() {
        let temporary=tempfile::tempdir().unwrap();let writer=writer(temporary.path());
        for index in 0..5 {
            let session=uuid::Uuid::new_v4();let path=file(temporary.path(),hour(),&session,&[]);
            let value=row(&session,&time(hour()+if index==4 {10_000}else{index*1000}),index as u64);
            let mut bytes=if index<4 {vec![b'x';RECENT_FILE_BYTES as usize+10]}else{Vec::new()};
            if !bytes.is_empty() {bytes.push(b'\n');}bytes.extend(format!("{value}\n").as_bytes());fs::write(&path,bytes).unwrap();
            let modified=std::time::UNIX_EPOCH+Duration::from_secs(if index==4 {1}else{10+index as u64});
            fs::File::options().write(true).open(path).unwrap().set_times(fs::FileTimes::new().set_modified(modified)).unwrap();
        }
        let result=writer.recent(true).unwrap();assert_eq!(result["records"][0]["tasks"],4);assert_eq!(result["records"].as_array().unwrap().len(),5);assert_eq!(result["hasOlder"],true);
    }

    #[test]
    fn recent_limits_record_count_bytes_and_untrusted_line_allocation() {
        let temporary=tempfile::tempdir().unwrap();let writer=writer(temporary.path());let session=uuid::Uuid::new_v4();
        let values=(0..600).map(|index|row(&session,&time(hour()+index),index as u64)).collect::<Vec<_>>();
        let path=file(temporary.path(),hour(),&session,&values);
        let result=writer.recent(true).unwrap();assert_eq!(result["records"].as_array().unwrap().len(),500);assert_eq!(result["records"][0]["tasks"],599);assert_eq!(result["truncated"],true);
        let mut dense=row(&session,&time(hour()+10_000),999);
        for key in ["durationMs","retryMs","failures","tasks","frames","slowFrames","frameMaxMs","lagMaxMs","inputMaxMs","nextFrameMaxMs","longTasks","longTaskSupported","longTaskMaxMs","renders","renderMaxMs","renderTotalMs","items","activeRequests","peakRequests","characters","queueMs","bytes","dropped","queued","writeMs"] {dense[key]=json!(1_000_000_000_000u64);}
        file(temporary.path(),hour(),&session,&vec![dense;600]);
        let result=writer.recent(true).unwrap();assert!(result["records"].as_array().unwrap().len()<500);assert!(serde_json::to_vec(&result).unwrap().len()<=RECENT_BYTES);assert_eq!(result["returnedBytes"].as_u64().unwrap() as usize,serde_json::to_vec(&result["records"]).unwrap().len());
        let mut bytes=vec![b'x';2*1024*1024];bytes.push(b'\n');bytes.extend(format!("{}\n",row(&session,&time(hour()+20_000),123)).as_bytes());bytes.extend(b"{partial-private-record");fs::write(path,bytes).unwrap();
        let result=writer.recent(true).unwrap();assert_eq!(result["records"].as_array().unwrap().len(),1);assert_eq!(result["records"][0]["tasks"],123);assert_eq!(result["truncated"],true);assert!(!result.to_string().contains("partial-private-record"));
    }

    #[test]
    fn retention_preserves_two_day_archives_and_retires_whole_expired_hours() {
        let temporary=tempfile::tempdir().unwrap();let writer=writer(temporary.path());let session=uuid::Uuid::new_v4();
        let kept=file(temporary.path(),hour()-48*3_600_000,&session,&[row(&session,&time(hour()-48*3_600_000),1)]);let bytes=fs::read(&kept).unwrap();
        let expired=file(temporary.path(),hour()-170*3_600_000,&uuid::Uuid::new_v4(),&[]);
        fs::write(temporary.path().join("unrelated.txt"),"keep unrelated bytes").unwrap();
        let status=writer.status();assert_eq!(status["retentionHours"],168);assert_eq!(status["maxBytes"],536_870_912u64);assert_eq!(fs::read(&kept).unwrap(),bytes);assert!(!expired.exists());assert!(temporary.path().join("unrelated.txt").exists());
    }

    #[test]
    fn capacity_preserves_current_archive_and_pauses_instead_of_erasing_recent_records() {
        let temporary=tempfile::tempdir().unwrap();let writer=writer(temporary.path());let session=uuid::Uuid::new_v4();
        let active=file(temporary.path(),hour(),&session,&[]);fs::write(&active,vec![b'x';256]).unwrap();
        let value=writer.decorate(json!({"event":"api","outcome":"success","method":"catalog"}));
        assert!(!writer.write_records_with_limit(&[value],256));
        assert_eq!(fs::read(&active).unwrap(),vec![b'x';256]);
        let state=writer.state.lock().unwrap();assert!(state.write_paused);assert!(state.limited);assert!(!state.pruned);assert_eq!(state.error,CAPACITY_ERROR);
    }

    #[test]
    fn incoming_record_reserves_space_and_evicts_only_older_closed_archives() {
        let temporary=tempfile::tempdir().unwrap();let writer=writer(temporary.path());
        let value=writer.decorate(json!({"event":"api","outcome":"success","method":"catalog"}));let size=format!("{value}\n").len() as u64;
        let old=file(temporary.path(),hour()-3_600_000,&uuid::Uuid::new_v4(),&[]);fs::write(&old,vec![b'x';size as usize+20]).unwrap();
        assert!(writer.write_records_with_limit(&[value],size+50));assert!(!old.exists());
        let state=writer.state.lock().unwrap();assert!(state.pruned);assert!(!state.write_paused);assert_eq!(state.total,size);
    }

    #[test]
    fn capacity_pause_remembers_required_headroom_across_status_reads() {
        let temporary=tempfile::tempdir().unwrap();let writer=writer(temporary.path());let session=uuid::Uuid::new_v4();
        let value=writer.decorate(json!({"event":"api","outcome":"success","method":"catalog"}));let size=format!("{value}\n").len() as u64;
        let limit=size+100;let active=file(temporary.path(),hour(),&session,&[]);fs::write(&active,vec![b'x';101]).unwrap();
        assert!(!writer.write_records_with_limit(&[value],limit));
        for _ in 0..3 {let status=writer.status_with_limit(limit);assert_eq!(status["writePaused"],true);assert_eq!(status["capacityPruned"],false);assert_eq!(status["error"],CAPACITY_ERROR);assert_eq!(status["retainedBytes"],101);}
        assert_eq!(fs::read(&active).unwrap(),vec![b'x';101]);
    }

    #[tokio::test]
    async fn recent_command_is_finite_flushes_current_events_and_rejects_path_inputs() {
        let temporary=tempfile::tempdir().unwrap();let directory=temporary.path().join("logs");let diagnostics=Diagnostics::new(directory.clone(),"test");
        assert!(diagnostics.command("recent",&json!({"path":"/arbitrary/path"})).await.is_err());assert!(diagnostics.command("recent",&Value::Null).await.is_err());
        let empty=diagnostics.command("recent",&json!({})).await.unwrap();assert_eq!(empty["records"],json!([]));assert_eq!(empty["oldestTime"],Value::Null);assert!(!directory.exists());
        assert!(diagnostics.record(&json!({"event":"authorization","outcome":"partial","authReason":"configuration"}),false));
        let result=diagnostics.command("recent",&json!({})).await.unwrap();assert_eq!(result["records"][0]["authReason"],"configuration");assert_eq!(result["maxRecords"],500);assert_eq!(result["maxBytes"],262_144);
    }

    #[cfg(unix)]
    #[test]
    fn recent_refuses_directory_links_and_skips_file_links_and_foreign_names() {
        use std::os::unix::fs::symlink;
        let temporary=tempfile::tempdir().unwrap();let logs=temporary.path().join("logs");fs::create_dir(&logs).unwrap();
        let outside=temporary.path().join("outside");fs::write(&outside,"fixture-private-outside").unwrap();
        symlink(&outside,logs.join(format!("diagnostics-{}-test-{}.jsonl",hour(),uuid::Uuid::new_v4()))).unwrap();fs::write(logs.join("accounts-v2.encrypted"),"fixture-private-outside").unwrap();
        let result=writer(&logs).recent(true).unwrap();assert_eq!(result["files"],0);assert_eq!(result["records"],json!([]));
        let alias=temporary.path().join("alias");symlink(&logs,&alias).unwrap();assert!(writer(&alias).recent(true).is_err());assert_eq!(fs::read_to_string(outside).unwrap(),"fixture-private-outside");
    }
}
