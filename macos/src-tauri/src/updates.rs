use crate::{service::Service, util};
use serde_json::{json, Value};
use std::sync::{Arc, Mutex};
use tauri_plugin_updater::{Update, UpdaterExt};
pub struct Updates {
    status: Arc<Mutex<Value>>,
    operation: tokio::sync::Mutex<()>,
    ready: tokio::sync::Mutex<Option<(Update, Option<Vec<u8>>)>>,
}
impl Updates {
    pub fn new() -> Self {
        Self {
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
    pub async fn check(&self, app: &tauri::AppHandle) -> Value {
        if cfg!(debug_assertions) {
            return self.status();
        }
        let Ok(_guard) = self.operation.try_lock() else {
            return self.status();
        };
        self.set(json!({"phase":"checking"}));
        let result = async {
            let updater = app
                .updater_builder()
                .timeout(std::time::Duration::from_secs(30))
                .build()
                .map_err(|_| "更新器配置不可用。".to_string())?;
            updater
                .check()
                .await
                .map_err(|_| "无法检查更新，请检查网络后重试。".to_string())
        }
        .await;
        match result {
            Ok(Some(u)) => {
                if !trusted(&u) {
                    return self.error("更新来源身份不匹配，未下载。");
                }
                let version = u.version.clone();
                *self.ready.lock().await = Some((u, None));
                self.set(
                    json!({"phase":"available","availableVersion":version,"checkedAt":util::now()}),
                )
            }
            Ok(None) => {
                *self.ready.lock().await = None;
                self.set(json!({"phase":"current","checkedAt":util::now()}))
            }
            Err(e) => self.error(&e),
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
                *self.ready.lock().await = Some((update, Some(bytes)));
                self.set(json!({"phase":"ready","availableVersion":version,"percent":100}))
            }
            Err(_) => self.error("更新下载或签名校验失败，请重试。"),
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
        service.authorization.prune().await;
        let _reservation = match service.reserve_install().await {
            Ok(reservation) => reservation,
            Err(message) => return self.retry_install(&update.version, &message),
        };
        self.set(json!({"phase":"installing","availableVersion":update.version}));
        let result = update.install(bytes);
        if result.is_err() {
            return self.retry_install(
                &update.version,
                "更新安装未完成，已下载的更新已保留，请检查应用目录权限后重试。",
            );
        }
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
