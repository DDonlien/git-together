use crate::{
    diagnostics::Diagnostics, service::Service, update_archive, update_error::UpdateFailure, util,
};
use serde_json::{json, Value};
use std::sync::{Arc, Mutex};
use tauri_plugin_updater::{Update, UpdaterExt};
pub struct Updates {
    diagnostics: Diagnostics,
    status: Arc<Mutex<Value>>,
    operation: tokio::sync::Mutex<()>,
    ready: tokio::sync::Mutex<Option<(Update, Option<Vec<u8>>)>>,
}
impl Updates {
    pub fn new(diagnostics: Diagnostics) -> Self {
        Self {
            diagnostics,
            status: Arc::new(Mutex::new(
                json!({"phase":if cfg!(debug_assertions){"unavailable"}else{"idle"},"currentVersion":crate::VERSION}),
            )),
            operation: tokio::sync::Mutex::new(()),
            ready: tokio::sync::Mutex::new(None),
        }
    }
    pub fn status(&self) -> Value {
        self.status
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
    }
    fn set(&self, v: Value) -> Value {
        let mut v = v;
        v["currentVersion"] = json!(crate::VERSION);
        *self.status.lock().unwrap_or_else(|e| e.into_inner()) = v.clone();
        v
    }
    fn error(&self, message: &str) -> Value {
        self.set(json!({"phase":"error","message":message}))
    }
    fn retry_install(&self, version: &str, message: &str) -> Value {
        self.set(
            json!({"phase":"ready","availableVersion":version,"percent":100,"message":message}),
        )
    }
    fn record(
        &self,
        method: &str,
        outcome: &str,
        started: i64,
        version: Option<&str>,
        failure: Option<&UpdateFailure>,
    ) {
        let mut event = json!({"event":"update","method":method,"outcome":outcome,"durationMs":(util::now()-started).max(0)});
        if let Some(version) = version {
            event["updateVersion"] = json!(version);
        }
        if let Some(failure) = failure {
            event
                .as_object_mut()
                .unwrap()
                .extend(failure.details.as_object().unwrap().clone());
        }
        self.diagnostics.record(&event, false);
    }
    pub async fn check(&self, app: &tauri::AppHandle) -> Value {
        if cfg!(debug_assertions) {
            return self.status();
        }
        let Ok(_guard) = self.operation.try_lock() else {
            return self.status();
        };
        self.set(json!({"phase":"checking"}));
        let started = util::now();
        self.record("check", "start", started, None, None);
        let result = async {
            let updater = app
                .updater_builder()
                .timeout(std::time::Duration::from_secs(30))
                .build()?;
            updater.check().await
        }
        .await;
        match result {
            Ok(Some(u)) => {
                if !trusted(&u) {
                    self.record("check", "rejected", started, Some(&u.version), None);
                    return self.error("更新来源身份不匹配，未下载。");
                }
                let version = u.version.clone();
                self.record("check", "available", started, Some(&version), None);
                *self.ready.lock().await = Some((u, None));
                self.set(
                    json!({"phase":"available","availableVersion":version,"checkedAt":util::now()}),
                )
            }
            Ok(None) => {
                self.record("check", "current", started, None, None);
                *self.ready.lock().await = None;
                self.set(json!({"phase":"current","checkedAt":util::now()}))
            }
            Err(e) => {
                let failure = UpdateFailure::new(&e, "check");
                self.record("check", "failure", started, None, Some(&failure));
                self.error(failure.message)
            }
        }
    }
    pub async fn download(&self) -> Value {
        if cfg!(debug_assertions) {
            return self.status();
        }
        let Ok(_guard) = self.operation.try_lock() else {
            return self.status();
        };
        let update = {
            let ready = self.ready.lock().await;
            let Some((u, _)) = ready.as_ref() else {
                return self.error("请先检查更新。");
            };
            u.clone()
        };
        if !trusted(&update) {
            return self.error("更新来源身份不匹配，未下载。");
        }
        let version = update.version.clone();
        let started = util::now();
        self.record("download", "start", started, Some(&version), None);
        self.set(json!({"phase":"downloading","availableVersion":version,"percent":0}));
        let state = self.status.clone();
        let mut downloaded = 0u64;
        let result = update
            .download(
                move |n, total| {
                    downloaded += n as u64;
                    let mut status = state.lock().unwrap_or_else(|e| e.into_inner());
                    if let Some(total) = total.filter(|v| *v > 0) {
                        status["percent"] =
                            json!(((downloaded as f64) / (total as f64) * 100.).min(100.));
                    }
                },
                || {},
            )
            .await;
        match result {
            Ok(bytes) => {
                self.record("download", "ready", started, Some(&version), None);
                *self.ready.lock().await = Some((update, Some(bytes)));
                self.set(json!({"phase":"ready","availableVersion":version,"percent":100}))
            }
            Err(e) => {
                let failure = UpdateFailure::new(&e, "download");
                self.record(
                    "download",
                    "failure",
                    started,
                    Some(&version),
                    Some(&failure),
                );
                self.error(failure.message)
            }
        }
    }
    pub async fn install(&self, app: tauri::AppHandle, service: &Arc<Service>) -> Value {
        if cfg!(debug_assertions) {
            return self.status();
        }
        let Ok(_guard) = self.operation.try_lock() else {
            return self.status();
        };
        let ready = self.ready.lock().await;
        let Some((update, Some(bytes))) = ready.as_ref() else {
            return self.error("请先下载更新。");
        };
        let started = util::now();
        self.record("install", "start", started, Some(&update.version), None);
        service.authorization.prune().await;
        let _reservation = match service.reserve_install().await {
            Ok(reservation) => reservation,
            Err(message) => {
                self.record("install", "blocked", started, Some(&update.version), None);
                return self.retry_install(&update.version, &message);
            }
        };
        self.set(json!({"phase":"installing","availableVersion":update.version}));
        let result = update_archive::verify(bytes)
            .map_err(tauri_plugin_updater::Error::from)
            .and_then(|()| update.install(bytes));
        if let Err(e) = result {
            let failure = UpdateFailure::new(&e, "install");
            self.record(
                "install",
                "failure",
                started,
                Some(&update.version),
                Some(&failure),
            );
            return self.retry_install(
                &update.version,
                &format!("{} 已下载的更新已保留。", failure.message),
            );
        }
        self.record("install", "success", started, Some(&update.version), None);
        service.authorization.stop();
        app.restart();
    }
}
fn trusted(u: &Update) -> bool {
    u.download_url.scheme() == "https"
        && u.download_url.host_str() == Some("github.com")
        && u.download_url
            .path()
            .starts_with("/DDonlien/git-together/releases/download/")
        && u.download_url.username().is_empty()
        && u.download_url.password().is_none()
        && u.download_url.path().ends_with(".app.tar.gz")
}
