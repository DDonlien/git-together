use crate::{
    ai, credentials, graph_operations,
    diagnostics::Diagnostics,
    git, github_token,
    oauth::Authorization,
    operations::{self, SyncPlan},
    provider::{self, Network, Provider},
    util::{self, text, Result},
};
use serde_json::{json, Value};
use std::{
    collections::{BTreeMap, VecDeque},
    fs,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        Arc, Weak,
    },
    time::Duration,
};
use tokio::sync::{watch, Mutex, OwnedMutexGuard, OwnedRwLockReadGuard, RwLock};
use tokio_util::sync::CancellationToken;

struct State {
    value: Value,
    revision: u64,
    error: String,
}
#[derive(Clone, Default)]
struct TokenRefreshState {
    generation: String,
    pending: Option<github_token::Grant>,
    retry_after: i64,
    error: String,
}
#[derive(Clone)]
pub struct Context {
    pub repository: Value,
    pub link: Value,
    pub provider: Provider,
    pub identity: String,
    pub network: Network,
}
struct PendingFetch {
    result: watch::Receiver<Option<Result<Value>>>,
    cancel: CancellationToken,
    waiters: AtomicUsize,
}
struct FetchWaiter(Arc<PendingFetch>);
impl Drop for FetchWaiter {
    fn drop(&mut self) {
        if self.0.waiters.fetch_sub(1, Ordering::SeqCst) == 1 {
            self.0.cancel.cancel();
        }
    }
}
pub struct Service {
    pub instance: String,
    pub root: PathBuf,
    pub persistent: bool,
    pub client: reqwest::Client,
    pub diagnostics: Diagnostics,
    pub authorization: Authorization,
    reference: Weak<Service>,
    token_refresh: Mutex<BTreeMap<String, TokenRefreshState>>,
    token_leases: Mutex<BTreeMap<String, Arc<RwLock<()>>>>,
    state: RwLock<State>,
    locks: Mutex<BTreeMap<PathBuf, Arc<Mutex<()>>>>,
    serial: Mutex<BTreeMap<String, Arc<Mutex<()>>>>,
    readers: Mutex<BTreeMap<String, Provider>>,
    results: Mutex<VecDeque<(String, String, Value)>>,
    plans: Mutex<BTreeMap<String, (String, SyncPlan)>>,
    pub file_state: std::sync::Mutex<crate::files::State>,
    merge_plans: Mutex<BTreeMap<String, (String, Arc<graph_operations::MergePlan>)>>,
    cancelled_graph_preparations: Mutex<VecDeque<(String, i64)>>,
    generations: Mutex<BTreeMap<PathBuf, (String, CancellationToken)>>,
    fetching: Mutex<BTreeMap<String, Arc<PendingFetch>>>,
    foreground: std::sync::Mutex<BTreeMap<&'static str, usize>>,
    background: std::sync::Mutex<CancellationToken>,
    pub active: AtomicUsize,
    pub installing: AtomicBool,
    running_targets: std::sync::Mutex<BTreeMap<String, (String, String, CancellationToken)>>,
}
struct Active<'a>(&'a AtomicUsize);
struct TargetOperation<'a>(&'a Service, String);
impl Drop for TargetOperation<'_> {
    fn drop(&mut self) {
        self.0
            .running_targets
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .remove(&self.1);
    }
}
impl Drop for Active<'_> {
    fn drop(&mut self) {
        self.0.fetch_sub(1, Ordering::SeqCst);
    }
}
pub(crate) struct Foreground<'a> {
    operations: &'a std::sync::Mutex<BTreeMap<&'static str, usize>>,
    name: &'static str,
}
impl Drop for Foreground<'_> {
    fn drop(&mut self) {
        let mut operations = self.operations.lock().unwrap_or_else(|e| e.into_inner());
        let count = operations.get_mut(self.name).unwrap();
        *count -= 1;
        if *count == 0 {
            operations.remove(self.name);
        }
    }
}
pub struct InstallReservation<'a>(&'a Service);
impl Drop for InstallReservation<'_> {
    fn drop(&mut self) {
        let mut background = self.0.background.lock().unwrap_or_else(|e| e.into_inner());
        if background.is_cancelled() {
            *background = CancellationToken::new();
        }
        self.0.installing.store(false, Ordering::SeqCst);
    }
}
impl Service {
    pub(crate) fn remote_mutation(&self) -> Result<Foreground<'_>> {
        self.foreground("远端文件变更")
    }
    pub(crate) async fn control_tasks(&self, repository: &str) -> Result<Vec<Value>> {
        let context = self.context(repository).await?;
        let mut tasks = vec![];
        if context.link.is_null() {
            return Ok(tasks);
        }
        for item in roots(&context.link)? {
            let root = self
                .validate_path(&context.repository, text(&item, "path"))
                .await?;
            // Presence needs changed paths and task identity, not complete trees or history.
            let entry=git::worktrees(&root).await?.into_iter().find(|v|text(v,"path")==root.to_string_lossy()).ok_or("工作目录不属于此仓库。")?;
            let status=git::read(&root,&["status","--porcelain=v1","-z","--untracked-files=all"]).await?;
            let branch=text(&entry,"branch");tasks.push(json!({"id":format!("worktree:{branch}:{}",root.display()),"path":root.to_string_lossy(),"branch":branch,"head":entry["head"],"files":git::changes(&status)}));
        }
        self.validate(&context).await?;
        Ok(tasks)
    }
    pub(crate) fn target_operation_ids(
        &self,
        repository: &str,
        task: &str,
        cancel_ids: &[String],
    ) -> Vec<String> {
        let key = format!("{repository}:{task}");
        let jobs = self
            .running_targets
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        jobs.iter()
            .filter_map(|(id, (target, _, token))| {
                if target != &key {
                    return None;
                }
                let tagged = format!("service:{id}");
                if cancel_ids.contains(&tagged) {
                    token.cancel();
                }
                Some(tagged)
            })
            .collect()
    }
    pub fn new(root: PathBuf, persistent: bool, component: &str) -> Result<Arc<Self>> {
        let client = provider::client()?;
        let mut value = json!({"version":2,"accounts":[],"repositories":[],"links":[]});
        let mut error = String::new();
        if persistent {
            match credentials::load(&root.join("accounts-v2.encrypted"), "GitTogether") {
                Ok(Some(saved)) => {
                    if valid_state(&saved) {
                        value = saved
                    } else {
                        error = "账号存储格式无效；未覆盖原始文件。".into()
                    }
                }
                Ok(None) => (),
                Err(e) => error = e,
            }
        }
        let diagnostics = Diagnostics::new(root.join("logs"), component);
        let service = Arc::new_cyclic(|weak| Self {
            instance: uuid::Uuid::new_v4().to_string(),
            root: root.clone(),
            persistent,
            client: client.clone(),
            diagnostics,
            authorization: Authorization::new(
                weak.clone(),
                root.clone(),
                client.clone(),
                component == "preview",
            ),
            reference: weak.clone(),
            token_refresh: Mutex::new(BTreeMap::new()),
            token_leases: Mutex::new(BTreeMap::new()),
            state: RwLock::new(State {
                value,
                revision: 0,
                error,
            }),
            locks: Mutex::new(BTreeMap::new()),
            serial: Mutex::new(BTreeMap::new()),
            readers: Mutex::new(BTreeMap::new()),
            results: Mutex::new(VecDeque::new()),
            plans: Mutex::new(BTreeMap::new()),
            file_state: std::sync::Mutex::new(crate::files::State::default()),
            merge_plans: Mutex::new(BTreeMap::new()),
            cancelled_graph_preparations: Mutex::new(VecDeque::new()),
            generations: Mutex::new(BTreeMap::new()),
            fetching: Mutex::new(BTreeMap::new()),
            active: AtomicUsize::new(0),
            installing: AtomicBool::new(false),
            running_targets: std::sync::Mutex::new(BTreeMap::new()),
            foreground: std::sync::Mutex::new(BTreeMap::new()),
            background: std::sync::Mutex::new(CancellationToken::new()),
        });
        service
            .diagnostics
            .record(&json!({"event":"lifecycle","outcome":"start"}), false);
        if !service.state.try_read().expect("new account state is uncontended").error.is_empty() {
            service.diagnostics.record(&json!({"event":"storage","outcome":"failure","code":"permission","authorizationStage":"storage-load","authReason":"storage"}),false);
        }
        Ok(service)
    }
    fn catalog_value(&self, state: &State) -> Value {
        json!({"instanceId":self.instance,"revision":state.revision,"accounts":state.value["accounts"].as_array().unwrap().iter().map(|a|a["account"].clone()).collect::<Vec<_>>(),"repositories":state.value["repositories"],"links":state.value["links"],"credentialStorage":if self.persistent{"encrypted"}else{"session"}})
    }
    pub async fn catalog(&self) -> Result<Value> {
        let state = self.state.read().await;
        if !state.error.is_empty() {
            return Err(state.error.clone());
        }
        Ok(self.catalog_value(&state))
    }
    fn repository_storage(&self) -> Result<PathBuf> {
        if self.persistent {
            return Ok(self.root.join("repositories"));
        }
        let home = crate::platform::home()?;
        Ok(PathBuf::from(home).join(".gittogether/repositories"))
    }
    async fn materialized_link(
        &self,
        context: &Context,
        cancel: &CancellationToken,
    ) -> Result<Value> {
        let mut link = context.link.clone();
        if !link.is_null() && !link["worktrees"].is_array() {
            let workspace = self.local_workspace(context, cancel).await?;
            link["worktrees"] = json!(workspace["tasks"]
                .as_array()
                .unwrap()
                .iter()
                .map(|task| json!({"path":task["path"],"branch":task["branch"]}))
                .collect::<Vec<_>>());
        }
        Ok(link)
    }
    async fn mutate<F>(&self, change: F) -> Result<Value>
    where
        F: FnOnce(&mut Value) -> Result<()>,
    {
        let mut state = self.state.write().await;
        if !state.error.is_empty() {
            return Err(state.error.clone());
        }
        let mut next = state.value.clone();
        change(&mut next)?;
        if !valid_state(&next) {
            return Err("账号配置校验失败，原文件未修改。".into());
        }
        if self.persistent {
            credentials::save(&self.root.join("accounts-v2.encrypted"), &next)?;
        }
        state.value = next;
        state.revision += 1;
        Ok(self.catalog_value(&state))
    }
    async fn serial(&self, key: String) -> OwnedMutexGuard<()> {
        let lock = self
            .serial
            .lock()
            .await
            .entry(key)
            .or_insert_with(|| Arc::new(Mutex::new(())))
            .clone();
        lock.lock_owned().await
    }
    pub async fn context(&self, id: &str) -> Result<Context> {
        let (repository, link, saved) = {
            let state = self.state.read().await;
            if !state.error.is_empty() {
                return Err(state.error.clone());
            }
            let r = state.value["repositories"]
                .as_array()
                .unwrap()
                .iter()
                .find(|r| text(r, "id") == id)
                .cloned()
                .ok_or("仓库不存在，请重新加载列表。")?;
            let a = state.value["accounts"]
                .as_array()
                .unwrap()
                .iter()
                .find(|a| a["account"]["id"] == r["accountId"])
                .cloned()
                .ok_or("访问账号已移除。")?;
            let l = state.value["links"]
                .as_array()
                .unwrap()
                .iter()
                .find(|l| text(l, "repositoryId") == id)
                .cloned()
                .unwrap_or(Value::Null);
            (r, l, a)
        };
        if !repository_accessible(&repository, &link) { return Err("应用账号无法访问该仓库，请检查仓库授权；已有本地目录可选系统认证。".into()); }
        let identity = context_identity(&repository, &link, &saved);
        let pkey = format!("{id}:{identity}");
        let mut readers = self.readers.lock().await;
        let provider = if let Some(p) = readers.get(&pkey) {
            p.clone()
        } else {
            if readers.len() >= 16 {
                if let Some(k) = readers.keys().next().cloned() {
                    readers.remove(&k);
                }
            }
            let p = self.account_provider(&saved);
            readers.insert(pkey, p.clone());
            p
        };
        let network =
            Network::new(&repository, &provider)?.for_link(&link).with_diagnostics(self.diagnostics.clone());
        Ok(Context {
            repository,
            link,
            provider,
            identity,
            network,
        })
    }
    pub async fn validate(&self, context: &Context) -> Result<()> {
        let state = self.state.read().await;
        let r = state.value["repositories"]
            .as_array()
            .unwrap()
            .iter()
            .find(|r| r["id"] == context.repository["id"])
            .ok_or("仓库已移除。")?;
        let a = state.value["accounts"]
            .as_array()
            .unwrap()
            .iter()
            .find(|a| a["account"]["id"] == r["accountId"])
            .ok_or("访问账号已移除。")?;
        let l = state.value["links"]
            .as_array()
            .unwrap()
            .iter()
            .find(|l| l["repositoryId"] == r["id"])
            .cloned()
            .unwrap_or(Value::Null);
        if !repository_accessible(r, &l) || context_identity(r, &l, a) != context.identity {
            return Err("账号、仓库或目录关联已变化，请重新读取或预览。".into());
        }
        Ok(())
    }
    pub async fn validate_path(&self, repo: &Value, input: &str) -> Result<PathBuf> {
        let selected = util::absolute(input)?;
        let top = git::read(&selected, &["rev-parse", "--show-toplevel"]).await?;
        let root = dunce::canonicalize(top.trim()).map_err(|_| "工作目录不可读取。")?;
        let names = git::read(&root, &["remote"]).await?;
        let expected = util::identity(text(repo, "url")).ok_or("仓库远端无效。")?;
        for name in names.lines() {
            let url = git::read(&root, &["remote", "get-url", name]).await?;
            if util::identity(url.trim()).as_ref() == Some(&expected) || git::remote_identity(url.trim()).await?.as_ref() == Some(&expected) {
                return Ok(root);
            }
        }
        Err("这个工作目录的远端不是目标仓库，没有保存关联。".into())
    }
    pub(crate) async fn task_root(&self, context: &Context, id: &str) -> Result<PathBuf> {
        for item in roots(&context.link)? {
            if !id.ends_with(&format!(":{}", text(&item, "path"))) {
                continue;
            }
            let root = self
                .validate_path(&context.repository, text(&item, "path"))
                .await?;
            let task = git::task(&root).await?;
            if text(&task, "id") == id {
                return Ok(root);
            }
        }
        Err("这个任务不属于已关联工作目录。".into())
    }
    pub(crate) async fn claim(
        &self,
        root: &Path,
        cancel: &CancellationToken,
    ) -> Result<OwnedMutexGuard<()>> {
        let wait = async {
            loop {
                let common = operations::common(root).await?;
                let lock = self
                    .locks
                    .lock()
                    .await
                    .entry(common.clone())
                    .or_insert_with(|| Arc::new(Mutex::new(())))
                    .clone();
                let guard = lock.lock_owned().await;
                if operations::common(root).await? == common {
                    return Ok(guard);
                }
            }
        };
        tokio::select! {r=tokio::time::timeout(Duration::from_secs(180),wait)=>r.map_err(|_|"等待当前 Git 操作超时，请稍后重试。".to_string())?,_=cancel.cancelled()=>Err("等待 Git 操作已取消。".into())}
    }
    async fn saved(&self, id: &str) -> Result<Value> {
        self.state.read().await.value["accounts"]
            .as_array()
            .unwrap()
            .iter()
            .find(|a| text(&a["account"], "id") == id)
            .cloned()
            .ok_or("账号不存在，请重新加载列表。".into())
    }
    fn account_provider(&self, saved: &Value) -> Provider {
        Provider::new(
            saved["account"].clone(),
            text(saved, "token").into(),
            self.client.clone(),
        )
        .with_authorization(self.reference.clone(), github_token::generation(saved))
        .with_diagnostics(self.diagnostics.clone())
    }
    fn authorization_log(
        &self,
        saved: &Value,
        stage: &str,
        outcome: &str,
        reason: &str,
        status: Option<u16>,
    ) {
        let mut value = json!({"event":"authorization","method":"refresh","provider":"github","outcome":outcome,"authorizationStage":stage,"authReason":reason,"resource":&util::digest(text(&saved["account"],"id"))[..24]});
        if let Some(status) = status {
            value["httpStatus"] = json!(status);
        }
        if let Some(ms) = github_token::remaining(&saved["account"]["authorizationExpiresAt"]) {
            value["expiresInSeconds"] = json!(ms / 1000);
        }
        if let Some(ms) = github_token::remaining(&saved["githubOAuth"]["expiresAt"]) {
            value["refreshExpiresInSeconds"] = json!(ms / 1000);
        }
        self.diagnostics.record(&value, false);
    }
    async fn github_token_lock(&self, id: &str) -> Arc<RwLock<()>> {
        self.token_leases.lock().await.entry(id.into()).or_default().clone()
    }
    pub(crate) async fn lease_github_token(
        &self,
        id: &str,
        generation: &str,
        cancel: &CancellationToken,
        minimum_validity: i64,
    ) -> Result<(String, OwnedRwLockReadGuard<()>)> {
        let lock = self.github_token_lock(id).await;
        loop {
            let token = self.github_token(id, generation, None, cancel, minimum_validity).await?;
            let lease = tokio::select! {
                lease = lock.clone().read_owned() => lease,
                _ = cancel.cancelled() => return Err("操作已取消。".into()),
            };
            let saved = self.saved(id).await?;
            if github_token::generation(&saved) != generation {
                return Err("账号凭据已更新，请重新读取。".into());
            }
            // A renewal may have completed while this caller waited for its lease.
            if text(&saved, "token") == token {
                return Ok((token, lease));
            }
        }
    }
    pub(crate) async fn github_token(
        &self,
        id: &str,
        generation: &str,
        rejected: Option<&str>,
        cancel: &CancellationToken,
        minimum_validity: i64,
    ) -> Result<String> {
        let saved = self.saved(id).await?;
        if github_token::generation(&saved) != generation {
            return Err("账号凭据已更新，请重新读取。".into());
        }
        let refresh_state = self
            .token_refresh
            .lock()
            .await
            .get(id)
            .filter(|state| state.generation == generation)
            .cloned();
        if let Some(state) = &refresh_state {
            if state.retry_after > util::now() {
                return Err(state.error.clone());
            }
        }
        let pending = refresh_state.is_some_and(|state| state.pending.is_some());
        let due = github_token::remaining(&saved["account"]["authorizationExpiresAt"])
            .is_some_and(|ms| ms <= minimum_validity);
        if !pending
            && rejected.is_none()
            && saved["githubOAuth"].is_null()
            && github_token::remaining(&saved["account"]["authorizationExpiresAt"])
                .is_none_or(|ms| ms > 0)
        {
            return Ok(text(&saved, "token").into());
        }
        if !pending && !due && rejected.is_none() {
            return Ok(text(&saved, "token").into());
        }
        if !pending && rejected.is_some_and(|token| token != text(&saved, "token")) {
            return Ok(text(&saved, "token").into());
        }
        let service = self.reference.upgrade().ok_or("账号服务已退出。")?;
        let id = id.to_owned();
        let generation = generation.to_owned();
        let rejected = rejected.map(str::to_owned);
        // A dropped HTTP/IPC caller must not drop a token that GitHub has already rotated.
        let worker = tokio::spawn(async move {
            service
                .renew_github_token(&id, &generation, rejected.as_deref(), minimum_validity)
                .await
        });
        tokio::select! {
            result = worker => result.map_err(|_| "GitHub续期未完成，请稍后重试。".to_string())?,
            _ = cancel.cancelled() => Err("操作已取消；已开始的授权续期会安全保存。".into()),
        }
    }
    async fn renew_github_token(
        &self,
        id: &str,
        generation: &str,
        rejected: Option<&str>,
        minimum_validity: i64,
    ) -> Result<String> {
        let _guard = self.serial(format!("authorization:{id}")).await;
        // Git and its LFS/hooks reuse one token. Rotation revokes that token,
        // so wait for every process using it before exchanging the refresh pair.
        let lock = self.github_token_lock(id).await;
        let _leases = lock.write().await;
        let saved = self.saved(id).await?;
        if github_token::generation(&saved) != generation {
            return Err("账号凭据已更新，请重新读取。".into());
        }
        let state = {
            let mut states = self.token_refresh.lock().await;
            let state = states.entry(id.into()).or_default();
            if state.generation != generation {
                *state = TokenRefreshState {
                    generation: generation.into(),
                    ..Default::default()
                };
            }
            state.clone()
        };
        let due = github_token::remaining(&saved["account"]["authorizationExpiresAt"])
            .is_some_and(|ms| ms <= minimum_validity);
        if state.pending.is_none()
            && (!due && rejected.is_none()
                || rejected.is_some_and(|token| token != text(&saved, "token")))
        {
            return Ok(text(&saved, "token").into());
        }
        if state.retry_after > util::now() {
            return Err(state.error);
        }
        let _saving = self.foreground("GitHub授权续期")?;
        let grant = if let Some(grant) = state.pending {
            grant
        } else {
            let Some(refresh) = saved["githubOAuth"].as_object() else {
                let expired = github_token::remaining(&saved["account"]["authorizationExpiresAt"])
                    .is_some_and(|ms| ms <= 0);
                if !expired && rejected.is_none() {
                    return Ok(text(&saved, "token").into());
                }
                let message = if saved["authorizationId"].is_null()
                    && (saved["account"]["authorizationExpiresAt"].is_string()
                        || text(&saved, "token").starts_with("ghu_"))
                {
                    "这份GitHub授权已失效，旧版本没有保存续期凭据；请在设置中重新网页授权一次，之后会自动续期。"
                } else {
                    "当前GitHub令牌已失效且不支持自动续期，请在设置中更新令牌或重新网页授权。"
                };
                self.authorization_log(
                    &saved,
                    "refresh-unavailable",
                    "failure",
                    "missing-refresh",
                    rejected.map(|_| 401),
                );
                self.token_refresh.lock().await.insert(
                    id.into(),
                    TokenRefreshState {
                        generation: generation.into(),
                        retry_after: util::now() + 300_000,
                        error: message.into(),
                        ..Default::default()
                    },
                );
                return Err(message.into());
            };
            let refresh: github_token::RefreshCredential =
                serde_json::from_value(json!(refresh))
                    .map_err(|_| "GitHub续期配置无效，请重新网页授权。".to_string())?;
            if github_token::remaining(&json!(refresh.expires_at)).is_some_and(|ms| ms <= 0) {
                let message = "GitHub续期凭据已到期，请在设置中重新进行网页授权。";
                self.authorization_log(
                    &saved,
                    "refresh-unavailable",
                    "failure",
                    "refresh-expired",
                    None,
                );
                self.token_refresh.lock().await.insert(
                    id.into(),
                    TokenRefreshState {
                        generation: generation.into(),
                        retry_after: util::now() + 300_000,
                        error: message.into(),
                        ..Default::default()
                    },
                );
                return Err(message.into());
            }
            self.authorization_log(
                &saved,
                "refresh-start",
                "start",
                if rejected.is_some() {
                    "rejected"
                } else if github_token::remaining(&saved["account"]["authorizationExpiresAt"])
                    .is_some_and(|ms| ms > 0)
                {
                    "expiring"
                } else {
                    "expired"
                },
                rejected.map(|_| 401),
            );
            match github_token::renew(&self.client, &self.root, &refresh).await {
                Ok(grant) => grant,
                Err(failure) => {
                    self.authorization_log(
                        &saved,
                        "refresh-failed",
                        "failure",
                        failure.reason,
                        failure.status,
                    );
                    self.token_refresh.lock().await.insert(
                        id.into(),
                        TokenRefreshState {
                            generation: generation.into(),
                            retry_after: util::now() + 60_000,
                            error: failure.message.clone(),
                            ..Default::default()
                        },
                    );
                    return Err(failure.message);
                }
            }
        };
        self.token_refresh.lock().await.insert(
            id.into(),
            TokenRefreshState {
                generation: generation.into(),
                pending: Some(grant.clone()),
                ..Default::default()
            },
        );
        let result = self
            .mutate(|next| {
                let account = next["accounts"]
                    .as_array_mut()
                    .unwrap()
                    .iter_mut()
                    .find(|saved| text(&saved["account"], "id") == id)
                    .ok_or("账号已移除。")?;
                if github_token::generation(account) != generation {
                    return Err("账号凭据已更新，请重新读取。".into());
                }
                account["token"] = json!(grant.token);
                account["githubOAuth"] =
                    serde_json::to_value(&grant.refresh).map_err(|_| "GitHub续期配置编码失败。")?;
                account["account"]["authorizationExpiresAt"] = json!(grant.expires_at);
                account["account"].as_object_mut().unwrap().remove("error");
                Ok(())
            })
            .await;
        if result.is_err() {
            let unchanged = self
                .saved(id)
                .await
                .is_ok_and(|saved| github_token::generation(&saved) == generation);
            if !unchanged {
                self.token_refresh.lock().await.remove(id);
            } else {
                let mut states = self.token_refresh.lock().await;
                let state = states.get_mut(id).unwrap();
                state.retry_after = util::now() + 15_000;
                state.error =
                    "GitHub续期已完成，但系统加密保存暂未成功；稍后会重试保存，请暂缓重启。".into();
            }
            self.authorization_log(
                &saved,
                "refresh-failed",
                "failure",
                if unchanged { "storage" } else { "stale" },
                None,
            );
            return Err(if unchanged {
                "GitHub续期已完成，但系统加密保存暂未成功；稍后会重试保存，请暂缓重启。".into()
            } else {
                "账号已更新或移除，旧授权续期结果未应用。".into()
            });
        }
        self.token_refresh.lock().await.remove(id);
        let updated = self.saved(id).await?;
        self.authorization_log(
            &updated,
            "refresh-complete",
            "success",
            "renewed",
            Some(200),
        );
        Ok(grant.token)
    }
    pub async fn connect(
        &self,
        input: &Value,
        expires: Option<String>,
        refresh: Option<github_token::RefreshCredential>,
        reauthorize: bool,
    ) -> Result<Value> {
        util::allowed(input, &["provider", "host", "token", "name"])?;
        let kind = util::field(input, "provider", 32)?;
        let host = provider::host(&kind, &util::field(input, "host", 512)?)?;
        let token = util::field(input, "token", 4096)?;
        let name = util::field(input, "name", 120)?;
        if token.is_empty() || token.chars().any(char::is_whitespace) {
            return Err("请输入有效的访问令牌。".into());
        }
        let c = CancellationToken::new();
        let provisional = Provider::new(
            json!({"provider":kind,"host":host}),
            token.clone(),
            self.client.clone(),
        ).with_diagnostics(self.diagnostics.clone());
        let user = provisional.user(&c).await?;
        let login = util::field(&user, "login", 120)?;
        if login.is_empty() || login.contains('/') || login.chars().any(char::is_whitespace) {
            return Err("无法识别账号身份。".into());
        }
        let existing = {
            let state = self.state.read().await;
            state.value["accounts"]
                .as_array()
                .unwrap()
                .iter()
                .find(|a| {
                    a["account"]["provider"] == kind
                        && a["account"]["host"] == host
                        && text(&a["account"], "login").eq_ignore_ascii_case(&login)
                })
                .cloned()
        };
        if existing.is_some() && !reauthorize {
            return Err("这个账号已经添加。同一服务可以添加其他账号。".into());
        }
        let id = existing
            .as_ref()
            .map(|a| text(&a["account"], "id").to_owned())
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        let display = if !name.is_empty() {
            name
        } else if let Some(a) = &existing {
            text(&a["account"], "name").into()
        } else if !text(&user, "name").is_empty() {
            text(&user, "name").into()
        } else {
            login.clone()
        };
        let mut account = json!({"id":id,"provider":kind,"host":host,"login":login,"name":display,"updatedAt":""});
        if let Some(e) = expires {
            account["authorizationExpiresAt"] = json!(e);
        }
        let p = Provider::new(account.clone(), token.clone(), self.client.clone())
            .with_diagnostics(self.diagnostics.clone());
        let repos = match p.repositories(&c, user["id"].as_u64()).await {
            Ok(v) => {
                account["updatedAt"] = json!(util::iso());
                Some(v)
            }
            Err(e) => {
                account["error"] = json!(e);
                None
            }
        };
        let catalog=self.mutate(|next| {
            let duplicate = next["accounts"].as_array().unwrap().iter().position(|a| {
                a["account"]["provider"] == kind
                    && a["account"]["host"] == host
                    && text(&a["account"], "login").eq_ignore_ascii_case(&login)
            });
            if let Some(i) = duplicate {
                if !reauthorize || next["accounts"][i]["account"]["id"] != id {
                    return Err("这个账号已经添加。".into());
                }
                next["accounts"][i] = json!({"account":account,"token":token,"authorizationId":uuid::Uuid::new_v4().to_string(),"githubOAuth":refresh});
                if let Some(repos) = repos {
                    replace_repositories(next, &id, repos);
                }
            } else {
                next["accounts"]
                    .as_array_mut()
                    .unwrap()
                    .push(json!({"account":account,"token":token,"authorizationId":uuid::Uuid::new_v4().to_string(),"githubOAuth":refresh}));
                if let Some(repos) = repos {
                    next["repositories"].as_array_mut().unwrap().extend(repos);
                }
            }
            Ok(())
        })
        .await?;
        if kind == "github" {
            self.authorization_log(
                &json!({"account":account,"githubOAuth":refresh}),
                "token-received",
                "success",
                "granted",
                None,
            );
        }
        Ok(catalog)
    }
    async fn refresh(&self, id: &str, cancel: &CancellationToken) -> Result<Value> {
        let _guard = self.serial(format!("refresh:{id}")).await;
        let saved = self.saved(id).await?;
        let p = self.account_provider(&saved);
        let result = p.repositories(cancel, None).await;
        if cancel.is_cancelled() {
            return Err("账号刷新已取消。".into());
        }
        self.mutate(|next| {
            if cancel.is_cancelled() {
                return Err("账号刷新已取消。".into());
            }
            let i = next["accounts"]
                .as_array()
                .unwrap()
                .iter()
                .position(|a| text(&a["account"], "id") == id)
                .ok_or("账号已移除。")?;
            if github_token::generation(&next["accounts"][i]) != github_token::generation(&saved) {
                return Err("账号凭据已更新，请重新读取。".into());
            }
            match result {
                Ok(repos) => {
                    next["accounts"][i]["account"]
                        .as_object_mut()
                        .unwrap()
                        .remove("error");
                    next["accounts"][i]["account"]["updatedAt"] = json!(util::iso());
                    replace_repositories(next, id, repos);
                }
                Err(e) => next["accounts"][i]["account"]["error"] = json!(e),
            }
            Ok(())
        })
        .await
    }
    async fn update_account(&self, input: &Value, cancel: &CancellationToken) -> Result<Value> {
        util::allowed(input, &["accountId", "name", "token"])?;
        let id = util::field(input, "accountId", 100)?;
        let name = util::field(input, "name", 120)?;
        if name.is_empty() {
            return Err("请输入账号名称。".into());
        }
        let token = if input["token"].is_null() {
            String::new()
        } else {
            util::field(input, "token", 4096)?
        };
        if token.chars().any(char::is_whitespace) {
            return Err("请输入有效令牌。".into());
        }
        let saved = self.saved(&id).await?;
        let mut repos = None;
        if !token.is_empty() {
            let p = Provider::new(saved["account"].clone(), token.clone(), self.client.clone()).with_diagnostics(self.diagnostics.clone());
            let user = p.user(cancel).await?;
            if !text(&user, "login").eq_ignore_ascii_case(text(&saved["account"], "login")) {
                return Err("新令牌不属于这个账号，请添加另一个账号。".into());
            }
            repos = Some(p.repositories(cancel, user["id"].as_u64()).await?);
        }
        self.mutate(|next| {
            let i = next["accounts"]
                .as_array()
                .unwrap()
                .iter()
                .position(|a| text(&a["account"], "id") == id)
                .ok_or("账号已移除。")?;
            if github_token::generation(&next["accounts"][i]) != github_token::generation(&saved) {
                return Err("账号凭据已更新，请重新打开编辑。".into());
            }
            next["accounts"][i]["account"]["name"] = json!(name);
            if let Some(repos) = repos {
                next["accounts"][i]["token"] = json!(token);
                next["accounts"][i]["authorizationId"] = json!(uuid::Uuid::new_v4().to_string());
                next["accounts"][i].as_object_mut().unwrap().remove("githubOAuth");
                next["accounts"][i]["account"]["updatedAt"] = json!(util::iso());
                for key in ["error", "authorizationExpiresAt"] {
                    next["accounts"][i]["account"]
                        .as_object_mut()
                        .unwrap()
                        .remove(key);
                }
                replace_repositories(next, &id, repos);
            }
            Ok(())
        })
        .await
    }
    async fn local_workspace(
        &self,
        context: &Context,
        cancel: &CancellationToken,
    ) -> Result<Value> {
        let mut tasks = Vec::new();
        let mut commits = Vec::new();
        for item in roots(&context.link)? {
            if cancel.is_cancelled() {
                return Err("读取已取消。".into());
            }
            let result = async {
                let root = self
                    .validate_path(&context.repository, text(&item, "path"))
                    .await?;
                let task = git::task(&root).await?;
                let commits = git::history(&root).await?;
                Ok::<_, String>((task, commits))
            }
            .await;
            match result{Ok((t,c))=>{tasks.push(t);commits.extend(c);},Err(e)=>tasks.push(json!({"id":format!("worktree:{}:{}",text(&item,"branch"),text(&item,"path")),"path":item["path"],"branch":if text(&item,"branch").is_empty(){"未读取分支"}else{text(&item,"branch")},"head":"","files":[],"tree":[],"error":format!("{e} 工作目录不可用或远端已变化，请重新关联。")}))}
        }
        self.validate(context).await?;
        Ok(
            json!({"source":"local","complete":tasks.iter().all(|t|t["error"]==""),"tasks":tasks,"commits":git::merge_history(commits)}),
        )
    }
    async fn fetch(
        self: &Arc<Self>,
        context: &Context,
        cancel: &CancellationToken,
    ) -> Result<Value> {
        let key = format!("{}:{}", text(&context.repository, "id"), context.identity);
        let mut pending = self.fetching.lock().await;
        let entry = if let Some(existing) = pending.get(&key) {
            existing.clone()
        } else {
            if pending.len() >= 128 {
                return Err("正在检查的仓库较多，请稍后重试。".into());
            }
            let (sender, receiver) = watch::channel(None);
            let entry = Arc::new(PendingFetch {
                result: receiver,
                cancel: self
                    .background
                    .lock()
                    .unwrap_or_else(|e| e.into_inner())
                    .child_token(),
                waiters: AtomicUsize::new(0),
            });
            pending.insert(key.clone(), entry.clone());
            let service = self.clone();
            let context = context.clone();
            let cancel = entry.cancel.clone();
            self.active.fetch_add(1, Ordering::SeqCst);
            tokio::spawn(async move {
                let _active = Active(&service.active);
                let value = service.fetch_once(&context, &cancel).await;
                sender.send_replace(Some(value));
                service.fetching.lock().await.remove(&key);
            });
            entry
        };
        entry.waiters.fetch_add(1, Ordering::SeqCst);
        let mut result = entry.result.clone();
        let _waiter = FetchWaiter(entry);
        drop(pending);
        loop {
            let completed = result.borrow_and_update().clone();
            if let Some(completed) = completed {
                self.validate(context).await?;
                return completed;
            }
            tokio::select! {
                changed = result.changed() => { changed.map_err(|_| "远端检查未完成，请重试。".to_string())?; },
                _ = cancel.cancelled() => return Err("远端检查已取消。".into()),
            }
        }
    }
    async fn fetch_once(&self, context: &Context, cancel: &CancellationToken) -> Result<Value> {
        let _serial = self
            .serial(format!(
                "fetch:{}:{}",
                text(&context.repository, "id"),
                context.identity
            ))
            .await;
        self.validate(context).await?;
        let mut groups: BTreeMap<PathBuf, (PathBuf, Vec<String>)> = BTreeMap::new();
        if !context.link.is_null() {
            for item in roots(&context.link)? {
                let root = self
                    .validate_path(&context.repository, text(&item, "path"))
                    .await?;
                let t = git::task(&root).await?;
                if t["branch"] == "Detached HEAD" {
                    continue;
                }
                let common = operations::common(&root).await?;
                groups
                    .entry(common)
                    .or_insert_with(|| (root, Vec::new()))
                    .1
                    .push(text(&t, "branch").into());
            }
        }
        let mut branches = 0;
        for (_, (root, mut names)) in groups {
            names.sort();
            names.dedup();
            let _guard = self.claim(&root, cancel).await?;
            self.validate(context).await?;
            context.network.fetch(&root, &names, cancel).await?;
            branches += names.len();
        }
        self.validate(context).await?;
        Ok(json!({"branches":branches,"checkedAt":util::now()}))
    }
    async fn previous(&self, id: &str, identity: &str) -> Result<Option<Value>> {
        if let Some((_, i, v)) = self.results.lock().await.iter().find(|(k, _, _)| k == id) {
            if i != identity {
                return Err("操作标识已被使用，请重新确认。".into());
            }
            return Ok(Some(v.clone()));
        }
        Ok(None)
    }
    async fn remember(&self, id: String, identity: String, v: Value) {
        let mut results = self.results.lock().await;
        if results.len() >= 128 {
            results.pop_front();
        }
        results.push_back((id, identity, v));
    }
    pub async fn handle(
        self: &Arc<Self>,
        method: &str,
        input: Value,
        cancel: CancellationToken,
    ) -> Result<Value> {
        if !input.is_object()
            || serde_json::to_vec(&input).map_err(|_| "请求无效。")?.len() > 32_768
        {
            return Err("无效或过大的请求。".into());
        }
        if self.installing.load(Ordering::SeqCst) {
            return Err("正在安装更新，请稍后重试。".into());
        }
        let _target = if matches!(
            method,
            "submitCommit" | "pushCommit" | "applySync" | "generateCommitMessage" | "prepareGraphMerge" | "applyGraphMerge" | "executeGraph" | "createGraphWorktree"
        ) {
            let id = uuid::Uuid::new_v4().to_string();
            let key = format!(
                "{}:{}",
                text(&input, "repositoryId"),
                text(&input, "taskId")
            );
            self.running_targets
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .insert(id.clone(), (key, method.into(), cancel.clone()));
            Some(TargetOperation(self, id))
        } else {
            None
        };
        let foreground = match method {
            "submitCommit" => Some("提交"),
            "pushCommit" => Some("推送"),
            "applySync" | "applyFileOperation" => Some("文件变更"),
            "applyGraphMerge" | "executeGraph" => Some("图谱操作"),
            "createGraphWorktree" => Some("创建工作目录"),
            "downloadBranch" => Some("分支下载"),
            "connect" | "updateAccount" | "removeAccount" => Some("保存账号"),
            "link" | "unlink" | "matchAccountRepositories" | "setRepositoryAuthentication" => Some("保存仓库关联"),
            _ => None,
        }
        .map(|name| self.foreground(name))
        .transpose()?;
        self.active.fetch_add(1, Ordering::SeqCst);
        let _active = Active(&self.active);
        if self.installing.load(Ordering::SeqCst) {
            return Err("正在安装更新，请稍后重试。".into());
        }
        let started = util::now();
        self.diagnostics.record(
            &json!({"event":"api","outcome":"start","method":method}),
            false,
        );
        let background = self
            .background
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .child_token();
        let request = git::READ_CONTEXT.scope(
            git::Options {
                diagnostics: Some(self.diagnostics.clone()),
                resource: if text(&input, "repositoryId").is_empty() {
                    String::new()
                } else {
                    util::digest(text(&input, "repositoryId").as_bytes())[..24].into()
                },
                cancel: Some(cancel.clone()),
                ..git::Options::default()
            },
            self.dispatch(method, &input, &cancel),
        );
        tokio::pin!(request);
        let result = tokio::select! {
            result = &mut request => result,
            _ = background.cancelled(), if foreground.is_none() => {
                // Let the existing cancellation paths finish their cleanup. Installation
                // never waits for these readers or the separately owned fetch jobs.
                cancel.cancel();
                request.await
            }
        };
        let failures = result
            .as_ref()
            .ok()
            .and_then(|value| value["tasks"].as_array())
            .map(|tasks| {
                tasks
                    .iter()
                    .filter(|task| !text(task, "error").is_empty())
                    .count()
            })
            .unwrap_or(0);
        let mut details = json!({"event":"api","outcome":match &result {
            Err(error) if cancel.is_cancelled() || git::diagnostic_code(error) == "aborted" => "cancelled",
            Err(_) => "failure", Ok(_) if failures > 0 => "partial", Ok(_) => "success"
        },"method":method,"durationMs":(util::now()-started).max(0)});
        if let Err(error) = &result {
            details["code"] = json!(git::diagnostic_code(error));
        }
        if failures > 0 {
            details["failures"] = json!(failures);
        }
        details["activeRequests"] = json!(self.active.load(Ordering::SeqCst));
        if let Ok(value) = &result {
            if let Some(tasks) = value["tasks"].as_array() {
                details["tasks"] = json!(tasks.len());
                details["items"] = json!(tasks
                    .iter()
                    .map(|task| task["tree"].as_array().map_or(0, Vec::len))
                    .sum::<usize>());
            }
        }
        if !text(&input, "repositoryId").is_empty() {
            details["resource"] =
                json!(&util::digest(text(&input, "repositoryId").as_bytes())[..24]);
        }
        self.diagnostics.record(&details, false);
        result
    }
    pub(crate) async fn graph_workspace(&self, context: &Context, cancel: &CancellationToken) -> Result<Value> {
        self.local_workspace(context, cancel).await
    }
    async fn graph_dispatch(&self, method: &str, input: &Value, context: &Context, cancel: &CancellationToken) -> Result<Value> {
        if method == "openCommit" {
            util::allowed(input, &["repositoryId", "commitId"])?;
            let sha = util::sha(text(input,"commitId"))?;
            let commit=context.provider.commit(&context.repository,&sha,cancel).await?;
            if commit["id"]!=sha{return Err("远端没有返回对应提交，未打开其他页面。".into());}
            let suffix = match text(&context.provider.account,"provider") {"gitlab"=>format!("/-/commit/{sha}"),"gitea"=>format!("/commit/{sha}"),_=>format!("/commit/{sha}")};
            self.validate(context).await?;
            open(&format!("{}{suffix}",text(&context.repository,"url").trim_end_matches('/'))).await?;
            return Ok(json!({"opened":true}));
        }
        let task_id=util::field(input,"taskId",4096)?;
        if method=="discardGraphMerge" {
            util::allowed(input,&["repositoryId","taskId","planId"])?;
            let id=util::field(input,"planId",100)?;let mut plans=self.merge_plans.lock().await;
            if let Some((identity,plan))=plans.get(&id) {if *identity!=context.identity||plan.public["taskId"]!=task_id{return Err("预览不属于当前工作目录。".into());}}
            return Ok(json!({"discarded":plans.remove(&id).is_some()}));
        }
        let root=self.task_root(context,&task_id).await?;
        match method {
            "graphSources"=>{util::allowed(input,&["repositoryId","taskId"])?;graph_operations::sources(self,context,&root,cancel).await},
            "graphPreview"=>{util::allowed(input,&["repositoryId","taskId","expectedHead","changeKey","commitId","action","mainline"])?;graph_operations::preview(&root,input,self,context,cancel).await},
            "cancelGraphPreparation"=>{
                util::allowed(input,&["repositoryId","taskId","generationId"])?;
                uuid::Uuid::parse_str(&util::field(input,"generationId",100)?).map_err(|_|"准备标识无效。")?;
                let key=util::digest(format!("{}:{}:{}",text(input,"repositoryId"),task_id,text(input,"generationId")));
                let mut cancelled=self.cancelled_graph_preparations.lock().await;
                cancelled.retain(|(_,created)|util::now()-created<120_000);
                if cancelled.len()>=128{cancelled.pop_front();}
                cancelled.push_back((key,util::now()));drop(cancelled);
                let jobs=self.generations.lock().await;
                if let Some((id,token))=jobs.get(&root){if id==text(input,"generationId"){token.cancel();}}
                Ok(json!({"cancelled":true}))
            },
            "prepareGraphMerge"=>{
                util::allowed(input,&["repositoryId","taskId","expectedHead","changeKey","sources","generationId"])?;
                let generation=util::field(input,"generationId",100)?;uuid::Uuid::parse_str(&generation).map_err(|_|"准备标识无效。")?;
                let token=cancel.child_token();
                for attempt in 0..=50 {
                    let mut jobs=self.generations.lock().await;
                    if let Some((_,previous))=jobs.get(&root) {
                        if !previous.is_cancelled()||attempt==50{return Err("此工作目录正在准备 AI 操作，请稍后重试。".into());}
                        drop(jobs);
                        tokio::select!{_=tokio::time::sleep(Duration::from_millis(100))=>(),_=token.cancelled()=>return Err("同步准备已取消。".into())}
                    } else {jobs.insert(root.clone(),(generation.clone(),token.clone()));break;}
                }
                let key=util::digest(format!("{}:{}:{}",text(input,"repositoryId"),task_id,text(input,"generationId")));
                if self.cancelled_graph_preparations.lock().await.iter().any(|(id,created)|*id==key&&util::now()-created<120_000){token.cancel();}
                let result=graph_operations::prepare(&root,input,self,context,&token).await;
                self.generations.lock().await.remove(&root);
                let plan=result?;self.validate(context).await?;
                if token.is_cancelled(){return Err("同步准备已取消。".into());}
                let public=plan.public.clone();let mut plans=self.merge_plans.lock().await;
                plans.retain(|_,(_,plan)|util::now()-plan.created<600_000);
                if plans.len()>=32{return Err("合并预览已达上限，请关闭旧预览。".into());}
                plans.insert(text(&public,"id").into(),(context.identity.clone(),Arc::new(plan)));Ok(public)
            },
            "applyGraphMerge"|"executeGraph"|"createGraphWorktree"=>{
                util::allowed(input,if method=="applyGraphMerge" {&["repositoryId","taskId","planId","operationId","summary","description"]}else{&["repositoryId","taskId","expectedHead","changeKey","commitId","action","name","resetMode","mainline","parentPath","folderName","operationId"]})?;
                let operation=util::field(input,"operationId",100)?;uuid::Uuid::parse_str(&operation).map_err(|_|"操作标识无效。")?;
                let identity=util::digest(format!("{method}:{input}"));
                if let Some(result)=self.previous(&operation,&identity).await? {return Ok(result);}
                let _guard=self.claim(&root,cancel).await?;self.validate(context).await?;
                if let Some(result)=self.previous(&operation,&identity).await? {return Ok(result);}
                let result=if method=="applyGraphMerge" {
                    let id=util::field(input,"planId",100)?;
                    let plan={let plans=self.merge_plans.lock().await;let (owner,plan)=plans.get(&id).ok_or("预览已过期，请重新准备。")?;if *owner!=context.identity||plan.public["repositoryId"]!=input["repositoryId"]||plan.public["taskId"]!=task_id||util::now()-plan.created>=600_000{return Err("预览已变化或过期，请重新准备。".into());}plan.clone()};
                    let result=graph_operations::apply(&plan,input,self,context,cancel).await?;
                    self.merge_plans.lock().await.remove(&id);result
                } else if method=="createGraphWorktree" {
                    let previous=self.materialized_link(context,cancel).await?;
                    let path=graph_operations::worktree(&root,input,self,context,cancel).await?;
                    let name=text(input,"name");let item=json!({"branch":name,"path":path.to_string_lossy()});
                    let catalog=self.mutate(|next| {check_context(next,context)?;merge_link(next,text(input,"repositoryId"),text(&context.link,"path"),&previous,vec![item],Some(name))}).await;
                    let task=git::task(&root).await?;let mut result=json!({"taskId":task["id"],"head":task["head"],"branch":task["branch"],"unchanged":true,"worktreePath":path.to_string_lossy()});
                    match catalog {Ok(catalog)=>result["catalog"]=catalog,Err(_)=>result["warning"]=json!("工作目录已创建，但关联保存未完成；请手动关联这个目录，不要重复创建。")}result
                } else {graph_operations::execute(&root,input,self,context,cancel).await?};
                self.remember(operation,identity,result.clone()).await;Ok(result)
            },_=>Err("不支持该图谱操作。".into())
        }
    }
    async fn dispatch(
        self: &Arc<Self>,
        method: &str,
        input: &Value,
        cancel: &CancellationToken,
    ) -> Result<Value> {
        if method == "status" {
            util::allowed(input, &[])?;
            return Ok(
                json!({"instanceId":self.instance,"version":crate::VERSION,"backend":"rust","githubWebAuth":true}),
            );
        }
        if method == "openLocalDirectory" {
            util::allowed(input, &["path"])?;
            let selected = util::field(input, "path", 4096)?;
            let directory = tokio::task::spawn_blocking(move || -> Result<PathBuf> {
                let directory = util::absolute(&selected)?;
                if !directory.is_dir() {
                    return Err("请选择本地文件夹。".into());
                }
                Ok(directory)
            })
            .await
            .map_err(|_| "目录验证未完成。")??;
            open(directory.to_str().ok_or("目录路径无法读取。")?).await?;
            return Ok(json!({"opened":true}));
        }
        self.catalog().await?;
        match method {
            "catalog" => {
                util::allowed(input, &[])?;
                return self.catalog().await;
            }
            "openRepository" => {
                util::allowed(input, &["repositoryId"])?;
                let id = util::field(input, "repositoryId", 160)?;
                let catalog = self.catalog().await?;
                let repository = catalog["repositories"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .find(|repository| text(repository, "id") == id)
                    .ok_or("仓库不存在，请重新加载列表。")?;
                let url =
                    url::Url::parse(text(repository, "url")).map_err(|_| "远端仓库地址无效。")?;
                if !matches!(url.scheme(), "https" | "http")
                    || url.host_str().is_none()
                    || !url.username().is_empty()
                    || url.password().is_some()
                {
                    return Err("远端仓库地址无效。".into());
                }
                open(url.as_str()).await?;
                return Ok(json!({"opened":true}));
            }
            "accountRepositoryAccess" | "openAccountAccessSettings" => {
                util::allowed(input, &["accountId"])?;
                let id = util::field(input, "accountId", 100)?;
                let saved = self.saved(&id).await?;
                if method == "openAccountAccessSettings" {
                    if text(&saved["account"], "provider") != "github" { return Err("请到该服务的账号设置管理仓库授权。".into()); }
                    let target = if crate::repository_access::github_app(&saved) { "https://github.com/settings/installations" } else if text(&saved, "token").starts_with("gho_") { "https://github.com/settings/applications" } else { "https://github.com/settings/tokens" };
                    open(target).await?;
                    return Ok(json!({"opened":true}));
                }
                let repositories = self.catalog().await?["repositories"].as_array().unwrap().iter()
                    .filter(|repo| text(repo, "accountId") == id).cloned().collect::<Vec<_>>();
                let result = crate::repository_access::inspect(&saved, &self.account_provider(&saved), &repositories, cancel).await?;
                if github_token::generation(&self.saved(&id).await?) != github_token::generation(&saved) { return Err("账号已重新授权，请重新检查。".into()); }
                return Ok(result);
            }
            "setRepositoryAuthentication" => {
                util::allowed(input, &["repositoryId", "authentication"])?;
                let id = util::field(input, "repositoryId", 160)?;
                let mode = util::field(input, "authentication", 16)?;
                if !matches!(mode.as_str(), "system" | "account") { return Err("认证方式无效。".into()); }
                let _guard = self.serial(format!("link:{id}")).await;
                if self.running_targets.lock().unwrap_or_else(|e| e.into_inner()).values().any(|(key, _, _)| key.starts_with(&format!("{id}:"))) { return Err("仓库操作正在执行，完成后可切换认证方式。".into()); }
                return self.mutate(|next| {
                    let link = next["links"].as_array_mut().unwrap().iter_mut().find(|link| text(link, "repositoryId") == id).ok_or("请先关联本地目录。")?;
                    link["authentication"] = json!(mode);
                    Ok(())
                }).await;
            }
            "connect" => return self.connect(input, None, None, false).await,
            "updateAccount" => return self.update_account(input, cancel).await,
            "refresh" => {
                util::allowed(input, &["accountId"])?;
                return self
                    .refresh(&util::field(input, "accountId", 100)?, cancel)
                    .await;
            }
            "githubAuthStart" => {
                util::allowed(input, &["name"])?;
                return self
                    .authorization
                    .device_start(&util::field(input, "name", 120)?)
                    .await;
            }
            "githubAuthPoll" => {
                util::allowed(input, &["sessionId"])?;
                return self
                    .authorization
                    .device_poll(&util::field(input, "sessionId", 100)?)
                    .await;
            }
            "githubAuthCancel" => {
                util::allowed(input, &["sessionId"])?;
                return self
                    .authorization
                    .cancel(&util::field(input, "sessionId", 100)?)
                    .await;
            }
            "removeAccount" => {
                util::allowed(input, &["accountId"])?;
                let id = util::field(input, "accountId", 100)?;
                return self
                    .mutate(|next| {
                        let ids: Vec<Value> = next["repositories"]
                            .as_array()
                            .unwrap()
                            .iter()
                            .filter(|r| text(r, "accountId") == id)
                            .map(|r| r["id"].clone())
                            .collect();
                        next["accounts"]
                            .as_array_mut()
                            .unwrap()
                            .retain(|a| text(&a["account"], "id") != id);
                        next["repositories"]
                            .as_array_mut()
                            .unwrap()
                            .retain(|r| text(r, "accountId") != id);
                        next["links"]
                            .as_array_mut()
                            .unwrap()
                            .retain(|l| !ids.contains(&l["repositoryId"]));
                        Ok(())
                    })
                    .await;
            }
            "matchAccountRepositories" => {
                util::allowed(input, &["accountId", "path"])?;
                return self.match_repositories(input, cancel).await;
            }
            _ => (),
        }
        let id = util::field(input, "repositoryId", 160)?;
        let context = self.context(&id).await?;
        if matches!(method, "graphSources" | "graphPreview" | "prepareGraphMerge" | "cancelGraphPreparation" | "discardGraphMerge" | "applyGraphMerge" | "executeGraph" | "createGraphWorktree" | "openCommit") {
            return self.graph_dispatch(method, input, &context, cancel).await;
        }
        match method {
            "link" => {
                util::allowed(input, &["repositoryId", "path", "branch"])?;
                let selected = util::absolute(&util::field(input, "path", 4096)?)?;
                let branch = input
                    .get("branch")
                    .map(|_| util::field(input, "branch", 1024))
                    .transpose()?;
                let branch = branch.as_deref();
                let found = discover(
                    &selected,
                    std::slice::from_ref(&context.repository),
                    branch,
                    cancel,
                )
                .await?
                .remove(&id)
                .unwrap_or_default();
                if found.is_empty() {
                    return Err("未找到目标仓库及分支的工作目录，没有保存关联。".into());
                }
                let previous = self.materialized_link(&context, cancel).await?;
                self.validate(&context).await?;
                return self
                    .mutate(|next| {
                        check_context(next, &context)?;
                        merge_link(
                            next,
                            &id,
                            selected.to_string_lossy().as_ref(),
                            &previous,
                            found,
                            branch,
                        )
                    })
                    .await;
            }
            "unlink" => {
                util::allowed(input, &["repositoryId", "branch"])?;
                let branch = input
                    .get("branch")
                    .map(|_| util::field(input, "branch", 1024))
                    .transpose()?;
                let branch = branch.as_deref();
                let actual = if branch.is_some() && !context.link.is_null() {
                    self.local_workspace(&context, cancel).await?["tasks"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .map(|t| json!({"branch":t["branch"],"path":t["path"]}))
                        .collect::<Vec<_>>()
                } else {
                    Vec::new()
                };
                return self
                    .mutate(|next| {
                        check_context(next, &context)?;
                        next["links"]
                            .as_array_mut()
                            .unwrap()
                            .retain(|l| text(l, "repositoryId") != id);
                        if let Some(b) = branch {
                            let kept: Vec<_> = actual
                                .into_iter()
                                .filter(|w| text(w, "branch") != b)
                                .collect();
                            if !kept.is_empty() {
                                let mut link = context.link.clone();
                                link["worktrees"] = json!(kept);
                                next["links"].as_array_mut().unwrap().push(link);
                            }
                        }
                        Ok(())
                    })
                    .await;
            }
            "downloadBranch" => {
                util::allowed(
                    input,
                    &["repositoryId", "branch", "parentPath", "folderName"],
                )?;
                let _serial = self.serial(format!("download:{id}")).await;
                self.validate(&context).await?;
                let mut existing = if context.link.is_null() {
                    Vec::new()
                } else {
                    roots(&self.materialized_link(&context, cancel).await?)?
                };
                let branch = util::field(input, "branch", 1024)?;
                if existing.iter().any(|w| text(w, "branch") == branch) || existing.len() >= 64 {
                    return Err("分支已关联或工作目录已达64个，请整理关联后重试。".into());
                }
                let branches = context
                    .provider
                    .branches(&context.repository, cancel)
                    .await?
                    .0;
                if !branches.iter().any(|(b, _)| b == &branch) {
                    return Err("远端分支已经不存在，请刷新列表。".into());
                }
                let path = operations::download(
                    &self.repository_storage()?,
                    &context.repository,
                    input,
                    &context.network,
                    cancel,
                )
                .await?;
                let result=async{self.validate_path(&context.repository,path.to_str().ok_or("下载路径无法读取。")?).await?;self.validate(&context).await?;existing.push(json!({"branch":branch,"path":path.to_string_lossy()}));self.mutate(|next|{check_context(next,&context)?;next["links"].as_array_mut().unwrap().retain(|l|text(l,"repositoryId")!=id);next["links"].as_array_mut().unwrap().push(json!({"repositoryId":id,"path":if context.link.is_null(){path.to_string_lossy().to_string()}else{text(&context.link,"path").into()},"worktrees":existing,"authentication":if context.link.is_null() || context.link["authentication"]=="account" {"account"}else{"system"}}));Ok(())}).await}.await;
                return result
                    .map_err(|e| format!("{e} 下载目录已保留：{}，可重新关联。", path.display()));
            }
            "localWorkspace" => {
                util::allowed(input, &["repositoryId"])?;
                return self.local_workspace(&context, cancel).await;
            }
            "snapshot" => {
                util::allowed(input, &["repositoryId"])?;
                let w = self.local_workspace(&context, cancel).await?;
                let t = w["tasks"]
                    .as_array()
                    .unwrap()
                    .first()
                    .ok_or("本地目录尚未关联。")?;
                if !text(t, "error").is_empty() {
                    return Err(text(t, "error").to_owned());
                }
                return Ok(
                    json!({"path":t["path"],"branch":t["branch"],"files":t["files"],"commits":w["commits"]}),
                );
            }
            "fetchRepository" => {
                util::allowed(input, &["repositoryId"])?;
                return self.fetch(&context, cancel).await;
            }
            "remoteWorkspace" | "remoteHistory" | "remoteCommit" | "remoteFile" => {
                let result = match method {
                    "remoteWorkspace" => {
                        util::allowed(input, &["repositoryId", "checkParticipation"])?;
                        let check_participation = match input.get("checkParticipation") {
                            None => false,
                            Some(Value::Bool(value)) => *value,
                            _ => return Err("分支参与记录选项必须为布尔值。".into()),
                        };
                        context
                            .provider
                            .workspace(&context.repository, cancel, check_participation)
                            .await?
                    }
                    "remoteHistory" => {
                        util::allowed(input, &["repositoryId", "head", "page"])?;
                        let head = util::sha(text(input, "head"))?;
                        let page = input["page"]
                            .as_u64()
                            .filter(|page| (2..=9_007_199_254_740_991).contains(page))
                            .ok_or("提交历史页码超出数值范围。")?;
                        let value = context
                            .provider
                            .history_page(&context.repository, &head, page, cancel)
                            .await?;
                        json!({"head":value["head"],"page":value["page"],"commits":value["commits"],"hasMore":value["hasMore"]})
                    }
                    "remoteCommit" => {
                        util::allowed(input, &["repositoryId", "commitId"])?;
                        context
                            .provider
                            .commit(
                                &context.repository,
                                &util::sha(text(input, "commitId"))?,
                                cancel,
                            )
                            .await?
                    }
                    _ => {
                        util::allowed(input, &["repositoryId", "commitId", "path"])?;
                        context
                            .provider
                            .file(
                                &context.repository,
                                &util::sha(text(input, "commitId"))?,
                                text(input, "path"),
                                cancel,
                            )
                            .await?
                    }
                };
                self.validate(&context).await?;
                return Ok(result);
            }
            "discardSync" => {
                util::allowed(input, &["repositoryId", "taskId", "planId"])?;
                let plan_id = util::field(input, "planId", 100)?;
                let mut plans = self.plans.lock().await;
                if let Some((_, p)) = plans.get(&plan_id) {
                    if p.public["repositoryId"] != id || p.public["taskId"] != input["taskId"] {
                        return Err("预览不属于此工作目录。".into());
                    }
                }
                return Ok(json!({"discarded":plans.remove(&plan_id).is_some()}));
            }
            _ => (),
        }
        if method == "openFile" && input["source"] == "remote" {
            return self.open_remote(input).await;
        }
        let task_id = if input["taskId"].is_null() && method == "diff" {
            let w = self.local_workspace(&context, cancel).await?;
            text(&w["tasks"][0], "id").to_owned()
        } else {
            util::field(input, "taskId", 4096)?
        };
        let operation = if matches!(method, "submitCommit" | "pushCommit" | "applySync" | "applyFileOperation") {
            let operation = util::field(input, "operationId", 100)?;
            uuid::Uuid::parse_str(&operation).map_err(|_| "操作标识无效。")?;
            let identity = util::digest(format!("{method}:{input}:{}", context.identity));
            if let Some(v) = self.previous(&operation, &identity).await? {
                return Ok(v);
            }
            Some((operation, identity))
        } else {
            None
        };
        let root = self.task_root(&context, &task_id).await?;
        match method {
            "localCommit" => {
                util::allowed(input, &["repositoryId", "taskId", "commitId"])?;
                let result = git::commit(&root, text(input, "commitId")).await?;
                self.validate(&context).await?;
                Ok(result)
            }
            "diff" => {
                util::allowed(input, &["repositoryId", "taskId", "commitId", "path"])?;
                let result =
                    git::diff(&root, text(input, "path"), input["commitId"].as_str()).await?;
                self.validate(&context).await?;
                Ok(json!({"text":result}))
            }
            "openDirectory" => {
                util::allowed(input, &["repositoryId", "taskId"])?;
                self.validate(&context).await?;
                open(root.to_str().ok_or("目录路径无法读取。")?).await?;
                Ok(json!({"opened":true}))
            }
            "localDirectory" => {
                util::allowed(input, &["repositoryId", "taskId", "path"])?;
                let result = crate::files::directory(&root, text(input, "path")).await?;
                self.validate(&context).await?;
                Ok(result)
            }
            "prepareFileOperation" => {
                util::allowed(input, &["repositoryId", "taskId", "operation", "paths", "sourceTaskId", "dropId", "destination", "name"])?;
                let source_root = if text(input, "dropId").is_empty() {
                    Some(self.task_root(&context, if text(input, "sourceTaskId").is_empty() { &task_id } else { text(input, "sourceTaskId") }).await?)
                } else {
                    None
                };
                let sources = if let Some(source_root) = &source_root {
                    input["paths"].as_array().ok_or("请选择文件。")?.iter().map(|path| crate::files::relative(source_root, path.as_str().ok_or("来源路径无效。")?, false)).collect::<Result<Vec<_>>>()?
                } else {
                    if text(input, "operation") == "delete" { return Err("拖入文件只能复制或移动。".into()); }
                    self.file_state.lock().unwrap_or_else(|e| e.into_inner()).sources(text(input, "dropId"))?
                };
                let operation = text(input, "operation").to_owned();
                let destination = text(input, "destination").to_owned();
                let name = text(input, "name").to_owned();
                let target_root = root.clone();
                let plan = tokio::task::spawn_blocking(move || crate::files::prepare(&target_root, source_root, sources, &operation, &destination, &name)).await.map_err(|_| "文件操作预览失败。")??;
                self.validate(&context).await?;
                self.file_state.lock().unwrap_or_else(|e| e.into_inner()).save(format!("{}:{task_id}:{}", context.identity, root.display()), plan)
            }
            "discardFileOperation" => {
                util::allowed(input, &["repositoryId", "taskId", "planId"])?;
                self.file_state.lock().unwrap_or_else(|e| e.into_inner()).discard(text(input, "planId"), &format!("{}:{task_id}:{}", context.identity, root.display()));
                Ok(json!({"discarded":true}))
            }
            "applyFileOperation" => {
                util::allowed(input, &["repositoryId", "taskId", "planId", "operationId"])?;
                let _guard = self.claim(&root, cancel).await?;
                self.validate(&context).await?;
                let (operation, identity) = operation.unwrap();
                if let Some(value) = self.previous(&operation, &identity).await? { return Ok(value); }
                let plan = self.file_state.lock().unwrap_or_else(|e| e.into_inner()).take(text(input, "planId"), &format!("{}:{task_id}:{}", context.identity, root.display()))?;
                // Once confirmed, complete this bounded write independently of a
                // hidden/cancelled renderer request, just like local Commit.
                let result = tokio::task::spawn_blocking(move || crate::files::apply(plan)).await.map_err(|_| "文件操作未完成，请重新读取目录。")??;
                self.remember(operation, identity, result.clone()).await;
                Ok(result)
            }
            "openFile" => {
                util::allowed(input, &["repositoryId", "source", "taskId", "path"])?;
                if input["source"] != "local" {
                    return Err("无效的文件来源。".into());
                }
                let path = util::file_path(text(input, "path"))?;
                if Path::new(&path).components().any(|part| part.as_os_str().to_string_lossy().eq_ignore_ascii_case(".git")) { return Err("不能打开Git元数据。".into()); }
                let file =
                    dunce::canonicalize(root.join(path)).map_err(|_| "文件不存在或不可读取。")?;
                if !file.starts_with(&root)
                    || file
                        .components()
                        .any(|c| c.as_os_str().to_string_lossy().eq_ignore_ascii_case(".git"))
                {
                    return Err("文件链接指向工作目录外部，未打开。".into());
                }
                self.validate(&context).await?;
                open(file.to_str().ok_or("文件路径无法读取。")?).await?;
                Ok(json!({"opened":true}))
            }
            "generateCommitMessage" => {
                util::allowed(
                    input,
                    &[
                        "repositoryId",
                        "taskId",
                        "expectedHead",
                        "changeKey",
                        "generationId",
                        "paths",
                    ],
                )?;
                util::sha(text(input, "expectedHead"))?;
                if text(input, "changeKey").len() != 64
                    || !util::valid_sha(text(input, "changeKey"))
                {
                    return Err("工作目录状态无效，请刷新。".into());
                }
                let id = util::field(input, "generationId", 100)?;
                uuid::Uuid::parse_str(&id).map_err(|_| "AI 生成标识无效。")?;
                let c = cancel.child_token();
                {
                    let mut jobs = self.generations.lock().await;
                    if jobs.contains_key(&root) {
                        return Err("这个工作目录正在生成提交说明，请稍后重试。".into());
                    }
                    jobs.insert(root.clone(), (id, c.clone()));
                }
                let result = ai::generate(&root, input, &c, self, &context).await;
                self.generations.lock().await.remove(&root);
                self.validate(&context).await?;
                result
            }
            "cancelCommitGeneration" => {
                util::allowed(input, &["repositoryId", "taskId", "generationId"])?;
                let jobs = self.generations.lock().await;
                let cancelled = if let Some((id, c)) = jobs.get(&root) {
                    if id == text(input, "generationId") {
                        c.cancel();
                        true
                    } else {
                        false
                    }
                } else {
                    false
                };
                Ok(json!({"cancelled":cancelled}))
            }
            "prepareSync" => {
                util::allowed(input, &["repositoryId", "taskId", "mode"])?;
                let _guard = self.claim(&root, cancel).await?;
                self.validate(&context).await?;
                let plan = operations::prepare(
                    &root,
                    input,
                    &context.network,
                    &self.repository_storage()?,
                    cancel,
                )
                .await?;
                self.validate(&context).await?;
                let value = plan.public.clone();
                let mut plans = self.plans.lock().await;
                plans.retain(|_, (_, p)| util::now() - p.created < 600_000);
                if plans.len() >= 64 {
                    return Err("操作预览已达上限，请关闭旧预览。".into());
                }
                plans.insert(text(&value, "id").into(), (context.identity, plan));
                Ok(value)
            }
            "submitCommit" | "pushCommit" | "applySync" => {
                let allowed = match method {
                    "submitCommit" => vec![
                        "repositoryId",
                        "taskId",
                        "expectedHead",
                        "changeKey",
                        "operationId",
                        "summary",
                        "description",
                        "paths",
                    ],
                    "pushCommit" => vec![
                        "repositoryId",
                        "taskId",
                        "expectedHead",
                        "commitId",
                        "operationId",
                    ],
                    _ => vec!["repositoryId", "taskId", "planId", "operationId"],
                };
                util::allowed(input, &allowed)?;
                let _guard = self.claim(&root, cancel).await?;
                self.validate(&context).await?;
                let (op, identity) = operation.unwrap();
                if let Some(v) = self.previous(&op, &identity).await? {
                    return Ok(v);
                }
                let result = match method {
                    "submitCommit" => {
                        util::sha(text(input, "expectedHead"))?;
                        if text(input, "changeKey").len() != 64
                            || !util::valid_sha(text(input, "changeKey"))
                        {
                            return Err("工作目录状态无效，请刷新。".into());
                        }
                        operations::submit(&root, input, self, &context, cancel).await?
                    }
                    "pushCommit" => {
                        if context.link["authentication"] == "account" && context.repository["permissions"]["push"] == false {
                            return Err("访问账号目前没有此仓库推送权限。".into());
                        }
                        util::sha(text(input, "expectedHead"))?;
                        operations::push(&root, input, &context.network, self, &context, cancel)
                            .await?
                    }
                    _ => {
                        let plan_id = util::field(input, "planId", 100)?;
                        let mut plans = self.plans.lock().await;
                        let (i, p) = plans.get(&plan_id).ok_or("预览已过期，请重新预览。")?;
                        if *i != context.identity
                            || p.public["repositoryId"] != id
                            || p.public["taskId"] != task_id
                            || util::now() - p.created >= 600_000
                        {
                            return Err("预览已变化或过期，请重新预览。".into());
                        }
                        let (_, p) = plans.remove(&plan_id).unwrap();
                        drop(plans);
                        operations::apply(p, &context.network, cancel, self, &context).await?
                    }
                };
                self.remember(op, identity, result.clone()).await;
                Ok(result)
            }
            _ => Err("不支持该操作。".into()),
        }
    }
    async fn match_repositories(&self, input: &Value, cancel: &CancellationToken) -> Result<Value> {
        let id = util::field(input, "accountId", 100)?;
        let saved = self.saved(&id).await?;
        let contexts = {
            let state = self.state.read().await;
            state.value["repositories"]
                .as_array()
                .unwrap()
                .iter()
                .filter(|r| text(r, "accountId") == id && r["available"] == true)
                .cloned()
                .collect::<Vec<_>>()
        };
        let selected = util::absolute(&util::field(input, "path", 4096)?)?;
        let found = discover(&selected, &contexts, None, cancel).await?;
        let mut expected = Vec::new();
        for r in &contexts {
            if found.get(text(r, "id")).is_some_and(|v| !v.is_empty()) {
                let c = self.context(text(r, "id")).await?;
                let previous = self.materialized_link(&c, cancel).await?;
                expected.push((c, previous));
            }
        }
        let ids: Vec<_> = expected
            .iter()
            .map(|(c, _)| c.repository["id"].clone())
            .collect();
        let catalog = self
            .mutate(|next| {
                if !next["accounts"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .any(|a| a["account"]["id"] == saved["account"]["id"] && github_token::generation(a) == github_token::generation(&saved))
                {
                    return Err("账号已更新或移除，请重新匹配。".into());
                }
                for (c, previous) in expected {
                    check_context(next, &c)?;
                    merge_link(
                        next,
                        text(&c.repository, "id"),
                        selected.to_string_lossy().as_ref(),
                        &previous,
                        found
                            .get(text(&c.repository, "id"))
                            .cloned()
                            .unwrap_or_default(),
                        None,
                    )?;
                }
                Ok(())
            })
            .await?;
        Ok(json!({"catalog":catalog,"matchedRepositoryIds":ids}))
    }
    pub async fn open_remote(&self, input: &Value) -> Result<Value> {
        util::allowed(input, &["repositoryId", "source", "commitId", "path"])?;
        let context = self
            .context(&util::field(input, "repositoryId", 160)?)
            .await?;
        let id = util::sha(text(input, "commitId"))?;
        let path = util::file_path(text(input, "path"))?;
        let mut url =
            url::Url::parse(text(&context.repository, "url")).map_err(|_| "远端仓库地址无效。")?;
        {
            let mut p = url.path_segments_mut().map_err(|_| "远端地址无效。")?;
            if context.provider.kind() == "gitea" {
                p.extend(["src", "commit", &id]);
            } else {
                if context.provider.kind() == "gitlab" {
                    p.push("-");
                }
                p.extend(["blob", &id]);
            }
            p.extend(path.split('/'));
        }
        self.validate(&context).await?;
        open(url.as_str()).await?;
        Ok(json!({"opened":true}))
    }
    fn foreground(&self, name: &'static str) -> Result<Foreground<'_>> {
        let mut operations = self.foreground.lock().unwrap_or_else(|e| e.into_inner());
        if self.installing.load(Ordering::SeqCst) {
            return Err("正在安装更新，请稍后重试。".into());
        }
        *operations.entry(name).or_default() += 1;
        Ok(Foreground {
            operations: &self.foreground,
            name,
        })
    }
    pub async fn reserve_install(&self) -> Result<InstallReservation<'_>> {
        self.installing
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .map_err(|_| "更新安装正在进行中。".to_string())?;
        let reservation = InstallReservation(self);
        let pending_save = {
            let accounts=self.state.read().await;
            let mut states=self.token_refresh.lock().await;
            states.retain(|id,state|accounts.value["accounts"].as_array().unwrap().iter().any(|saved|text(&saved["account"],"id")==id && github_token::generation(saved)==state.generation));
            states.values().any(|state|state.pending.is_some())
        };
        if pending_save { return Err("GitHub续期凭据尚未完成加密保存，请稍后重试更新；下载包已保留。".into()); }
        let operations = self.foreground.lock().unwrap_or_else(|e| e.into_inner());
        if !operations.is_empty() {
            return Err(format!(
                "正在执行{}，请完成后再重启更新。已下载的更新已保留。",
                operations.keys().copied().collect::<Vec<_>>().join("、")
            ));
        }
        if self.authorization.busy() {
            return Err("请先完成或取消正在进行的账号授权，已下载的更新已保留。".into());
        }
        self.background
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .cancel();
        Ok(reservation)
    }
    pub async fn web(&self, method: &str, input: Value) -> Result<Value> {
        if self.installing.load(Ordering::SeqCst) {
            return Err("正在安装更新，请稍后重试。".into());
        }
        let _foreground = self.foreground("账号授权")?;
        self.active.fetch_add(1, Ordering::SeqCst);
        let _active = Active(&self.active);
        if self.installing.load(Ordering::SeqCst) {
            return Err("正在安装更新，请稍后重试。".into());
        }
        self.authorization.web(method, input).await
    }
}
#[cfg(not(windows))]
pub async fn open(target: &str) -> Result<()> {
    let status = tokio::process::Command::new("/usr/bin/open")
        .arg("--")
        .arg(target)
        .status()
        .await
        .map_err(|_| "系统无法打开这个文件或页面。")?;
    if status.success() {
        Ok(())
    } else {
        Err("系统未打开这个文件或页面。".into())
    }
}
fn valid_state(v: &Value) -> bool {
    v["version"] == 2
        && v["accounts"].as_array().is_some_and(|a| {
            a.iter().all(|a| {
                a["token"].is_string()
                    && github_token::valid_refresh(&a["githubOAuth"])
                    && (a["authorizationId"].is_null() || uuid::Uuid::parse_str(text(a,"authorizationId")).is_ok())
                    && ["id", "provider", "host", "login", "name", "updatedAt"]
                        .iter()
                        .all(|k| a["account"][k].is_string())
                    && provider::supported(text(&a["account"], "provider"))
            })
        })
        && v["repositories"].as_array().is_some_and(|r| {
            r.iter().all(|r| {
                [
                    "id",
                    "accountId",
                    "name",
                    "fullName",
                    "description",
                    "defaultBranch",
                    "url",
                ]
                .iter()
                .all(|k| r[k].is_string())
                    && r["remoteId"].is_u64()
                    && r["private"].is_boolean()
                    && r["available"].is_boolean()
            })
        })
        && v["links"].as_array().is_some_and(|l| {
            l.iter().all(|l| {
                l["repositoryId"].is_string()
                    && l["path"].is_string()
                    && (l["authentication"].is_null() || matches!(text(l,"authentication"), "system" | "account"))
                    && (l["worktrees"].is_null()
                        || l["worktrees"].as_array().is_some_and(|w| {
                            w.len() <= 64
                                && w.iter()
                                    .all(|w| w["branch"].is_string() && w["path"].is_string())
                        }))
            })
        })
}
fn roots(link: &Value) -> Result<Vec<Value>> {
    if link.is_null() {
        return Err("请先关联本地目录。".into());
    }
    Ok(link["worktrees"]
        .as_array()
        .cloned()
        .unwrap_or_else(|| vec![json!({"path":link["path"],"branch":""})]))
}
fn repository_accessible(repository: &Value, link: &Value) -> bool {
    repository["available"] == true || !link.is_null() && text(link, "authentication") != "account"
}
fn context_identity(r: &Value, l: &Value, a: &Value) -> String {
    util::digest(
        json!([
            a["account"]["id"],
            a["account"]["provider"],
            a["account"]["host"],
            a["account"]["login"],
            github_token::generation(a),
            r["accountId"],
            r["fullName"],
            r["url"],
            r["defaultBranch"],
            r["permissions"],
            l
        ])
        .to_string(),
    )
}
fn check_context(next: &Value, c: &Context) -> Result<()> {
    let r = next["repositories"]
        .as_array()
        .unwrap()
        .iter()
        .find(|r| r["id"] == c.repository["id"])
        .ok_or("仓库已移除。")?;
    let a = next["accounts"]
        .as_array()
        .unwrap()
        .iter()
        .find(|a| a["account"]["id"] == r["accountId"])
        .ok_or("账号已移除。")?;
    let l = next["links"]
        .as_array()
        .unwrap()
        .iter()
        .find(|l| l["repositoryId"] == r["id"])
        .cloned()
        .unwrap_or(Value::Null);
    if context_identity(r, &l, a) != c.identity || !repository_accessible(r, &l) {
        Err("账号、仓库或关联已经变化，请重新读取。".into())
    } else {
        Ok(())
    }
}
fn replace_repositories(next: &mut Value, id: &str, repos: Vec<Value>) {
    // Only a fully successful paginated listing reaches this function. Its
    // contents are authoritative, including the removal of deleted repos.
    // Failed listings never replace the cache; local directory mappings are
    // retained without keeping an absent remote repository visible.
    next["repositories"]
        .as_array_mut()
        .unwrap()
        .retain(|r| text(r, "accountId") != id);
    next["repositories"].as_array_mut().unwrap().extend(repos);
}
fn merge_link(
    next: &mut Value,
    id: &str,
    path: &str,
    previous: &Value,
    found: Vec<Value>,
    branch: Option<&str>,
) -> Result<()> {
    let mut retained = if previous.is_null() {
        Vec::new()
    } else {
        roots(previous)?
    };
    retained.retain(|w| {
        !found.iter().any(|f| f["path"] == w["path"])
            && branch.is_none_or(|b| text(w, "branch") != b)
    });
    retained.extend(found);
    if retained.len() > 64 {
        return Err("关联工作目录超过64个，尚未保存。".into());
    }
    let primary = if branch.is_some() && !previous.is_null() {
        text(previous, "path")
    } else {
        path
    };
    next["links"]
        .as_array_mut()
        .unwrap()
        .retain(|l| text(l, "repositoryId") != id);
    next["links"]
        .as_array_mut()
        .unwrap()
        .push(json!({"repositoryId":id,"path":primary,"worktrees":retained,"authentication":if previous["authentication"] == "account" {"account"}else{"system"}}));
    Ok(())
}
async fn discover(
    root: &Path,
    repos: &[Value],
    branch: Option<&str>,
    cancel: &CancellationToken,
) -> Result<BTreeMap<String, Vec<Value>>> {
    let mut found: BTreeMap<String, Vec<Value>> = repos
        .iter()
        .map(|r| (text(r, "id").into(), Vec::new()))
        .collect();
    let mut pending = VecDeque::from([(root.to_owned(), 0)]);
    let mut expanded = 0;
    let mut matched_paths = std::collections::BTreeSet::new();
    while let Some((path, depth)) = pending.pop_front() {
        if cancel.is_cancelled() {
            return Err("目录扫描已取消。".into());
        }
        if matched_paths.contains(&path) {
            continue;
        }
        // A worktree's marker can be a directory or a gitdir file. Check it
        // directly before enumerating any project files or generated folders.
        let marker = match fs::symlink_metadata(path.join(".git")) {
            Ok(metadata) => Some(metadata.file_type()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
            Err(_) => return Err("无法读取目录的Git标记；尚未保存关联。".into()),
        };
        if let Some(marker) = marker {
            if marker.is_symlink() || !(marker.is_dir() || marker.is_file()) {
                continue;
            }
            let names = git::read(&path, &["remote"]).await?;
            let mut identities = Vec::new();
            for n in names.lines() {
                identities.push(git::remote_identity(
                    git::read(&path, &["remote", "get-url", n]).await?.trim(),
                ).await?);
            }
            let matches: Vec<_> = repos
                .iter()
                .filter(|r| identities.contains(&util::identity(text(r, "url"))))
                .collect();
            if !matches.is_empty() {
                for t in git::worktrees(&path).await? {
                    let p = PathBuf::from(text(&t, "path"));
                    if t["bare"] == true
                        || t["prunable"] == true
                        || !p.starts_with(root)
                        || branch.is_some_and(|b| text(&t, "branch") != b)
                    {
                        continue;
                    }
                    let mut parent = root.to_owned();
                    let mut symlink = false;
                    for part in p.strip_prefix(root).unwrap().components() {
                        parent.push(part);
                        if fs::symlink_metadata(&parent).is_ok_and(|m| m.file_type().is_symlink()) {
                            symlink = true;
                            break;
                        }
                    }
                    if symlink {
                        continue;
                    }
                    let mut own_identities = Vec::new();
                    for name in git::read(&p, &["remote"]).await?.lines() {
                        own_identities.push(git::remote_identity(
                            git::read(&p, &["remote", "get-url", name]).await?.trim(),
                        ).await?);
                    }
                    for r in &matches {
                        let expected = util::identity(text(r, "url"));
                        if expected.is_none() || !own_identities.contains(&expected) {
                            continue;
                        }
                        matched_paths.insert(p.clone());
                        let out = found.get_mut(text(r, "id")).unwrap();
                        if !out.iter().any(|w| w["path"] == t["path"]) {
                            out.push(json!({"branch":t["branch"],"path":t["path"]}));
                            if out.len() > 64 {
                                return Err("匹配工作目录超过64个，请缩小目录范围。".into());
                            }
                        }
                    }
                }
            }
            continue;
        }
        // The selected parent is depth zero. A deep unrelated subtree is not
        // a failed match: stop this branch and keep checking its siblings.
        if depth >= 6 {
            continue;
        }
        expanded += 1;
        if expanded > 4000 {
            return Err("需要展开的候选父目录超过4000个；请选择更具体的项目父目录，原关联未改变。".into());
        }
        let mut dirs: Vec<_> = fs::read_dir(&path)
            .map_err(|_| "所选目录不可读取。")?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(|_| "目录扫描未完成。")?
            .into_iter()
            .filter(|e| {
                e.file_type().is_ok_and(|t| t.is_dir() && !t.is_symlink())
                    && !matches!(
                        e.file_name().to_str(),
                        Some(".git" | "node_modules" | ".cache" | "_builds")
                    )
            })
            .map(|e| e.path())
            .collect();
        dirs.sort();
        for d in dirs {
            pending.push_back((d, depth + 1));
        }
    }
    Ok(found)
}

#[cfg(windows)]
pub async fn open(target: &str) -> Result<()> {
    crate::platform::open(target)
}
