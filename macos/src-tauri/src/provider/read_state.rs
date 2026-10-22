use crate::util::{self, Result};
use reqwest::header::HeaderMap;
use serde_json::Value;
use std::{
    collections::BTreeMap,
    sync::{
        atomic::{AtomicI64, AtomicUsize, Ordering},
        Arc,
    },
    time::Duration,
};
use tokio::sync::{Mutex, OwnedMutexGuard};
use tokio_util::sync::CancellationToken;

// A service owns this state. Local scans and Provider reconstruction must not
// discard account cooldowns or evict immutable data merely by visiting a repo.
#[derive(Default)]
pub struct ReadState {
    gates: Mutex<BTreeMap<String, Arc<Gate>>>,
    cache: Mutex<Cache>,
}
#[derive(Default)]
struct Gate {
    budget: Arc<Mutex<Budget>>,
    cooldown: AtomicI64,
    waiting: AtomicUsize,
}
#[derive(Default)]
struct Budget {
    next_request: i64,
    failures: u32,
}
struct Waiting(Arc<Gate>);
impl Drop for Waiting {
    fn drop(&mut self) {
        self.0.waiting.fetch_sub(1, Ordering::SeqCst);
    }
}
pub struct Permit {
    budget: OwnedMutexGuard<Budget>,
    waiting: Waiting,
}
impl ReadState {
    pub async fn acquire(&self, key: &str, cancel: &CancellationToken) -> Result<Permit> {
        let gate = self
            .gates
            .lock()
            .await
            .entry(key.into())
            .or_default()
            .clone();
        let waiting = Waiting(gate.clone());
        if gate.waiting.fetch_add(1, Ordering::SeqCst) >= 128 {
            return Err("远端读取排队较多；保留上次结果，稍后自动检查。".into());
        }
        let budget = tokio::select! {
            guard = gate.budget.clone().lock_owned() => guard,
            _ = cancel.cancelled() => return Err("操作已取消。".into()),
        };
        let until = gate.cooldown.load(Ordering::SeqCst);
        if until > util::now() {
            return Err(cooldown_message(until, None));
        }
        let delay = budget.next_request - util::now();
        if delay > 0 {
            tokio::select! {
                _ = tokio::time::sleep(Duration::from_millis(delay as u64)) => (),
                _ = cancel.cancelled() => return Err("操作已取消。".into()),
            }
        }
        Ok(Permit { budget, waiting })
    }
    pub async fn retry_at(&self, key: &str) -> Option<i64> {
        self.gates
            .lock()
            .await
            .get(key)
            .map(|gate| gate.cooldown.load(Ordering::SeqCst))
            .filter(|until| *until > util::now())
    }
    pub async fn cached(&self, key: &str) -> Option<(Value, Option<HeaderMap>)> {
        self.cache.lock().await.get(key)
    }
    pub async fn remember(&self, key: String, value: Value, headers: Option<HeaderMap>) {
        self.cache.lock().await.insert(key, value, headers);
    }
    pub async fn forget(&self, prefix: &str) {
        let mut cache = self.cache.lock().await;
        cache.entries.retain(|key, _| !key.starts_with(prefix));
        cache.bytes = cache.entries.values().map(|entry| entry.bytes).sum();
    }
}
impl Permit {
    pub fn observe(&mut self, status: u16, headers: &HeaderMap, limited: bool) {
        let now = util::now();
        let remaining = number(headers, "x-ratelimit-remaining");
        let reset =
            number(headers, "x-ratelimit-reset").and_then(|seconds| seconds.checked_mul(1_000));
        if limited {
            self.budget.failures = (self.budget.failures + 1).min(6);
            let backoff = (60_000_i64 * 2_i64.pow(self.budget.failures - 1)).min(1_800_000);
            let retry = number(headers, "retry-after")
                .and_then(|seconds| seconds.checked_mul(1_000))
                .and_then(|delay| now.checked_add(delay))
                .or_else(|| {
                    headers
                        .get("retry-after")
                        .and_then(|value| value.to_str().ok())
                        .and_then(|date| chrono::DateTime::parse_from_rfc2822(date).ok())
                        .map(|date| date.timestamp_millis())
                });
            let supplied = retry
                .into_iter()
                .chain(if remaining == Some(0) { reset } else { None })
                .max();
            let until = supplied
                .filter(|time| *time > now)
                .unwrap_or(now + backoff)
                .max(if self.budget.failures > 1 {
                    now + backoff
                } else {
                    now + 1_000
                });
            self.waiting.0.cooldown.store(until, Ordering::SeqCst);
        } else if status < 400 {
            self.budget.failures = 0;
            if remaining == Some(0) {
                self.waiting.0.cooldown.store(
                    reset.filter(|time| *time > now).unwrap_or(now + 60_000),
                    Ordering::SeqCst,
                );
            }
        }
        // Leave roughly 20% of the reported primary budget for other clients.
        // A 250ms floor also spaces responses without budget headers; the 30s
        // cap bounds a queued request, while exhaustion uses the full deadline.
        let spacing = remaining
            .filter(|remaining| *remaining > 0)
            .zip(reset)
            .map(|(remaining, reset)| {
                ((reset - now).max(0) as f64 / remaining as f64 * 1.25) as i64
            })
            .unwrap_or(250)
            .clamp(250, 30_000);
        self.budget.next_request = now + spacing;
    }
}
pub fn rate_limited(status: u16, headers: &HeaderMap, body: &[u8]) -> bool {
    if status == 429 {
        return true;
    }
    if status != 403 {
        return false;
    }
    if number(headers, "x-ratelimit-remaining") == Some(0) || headers.contains_key("retry-after") {
        return true;
    }
    let value: Value = serde_json::from_slice(body).unwrap_or(Value::Null);
    let message = value["message"].as_str().unwrap_or("").to_ascii_lowercase();
    [
        "secondary rate limit",
        "rate limit exceeded",
        "abuse detection",
    ]
    .iter()
    .any(|pattern| message.contains(pattern))
}
fn number(headers: &HeaderMap, name: &str) -> Option<i64> {
    headers
        .get(name)?
        .to_str()
        .ok()?
        .parse()
        .ok()
        .filter(|number| *number >= 0)
}
pub fn cooldown_message(until: i64, status: Option<u16>) -> String {
    let minutes = ((until - util::now()).max(0) + 59_999) / 60_000;
    let status = status
        .map(|status| format!("（HTTP {status}）"))
        .unwrap_or_default();
    format!(
        "远端访问频率受限{status}；约{}分钟后自动检查，已保留上次结果。",
        minutes.max(1)
    )
}

struct Entry {
    value: Value,
    headers: Option<HeaderMap>,
    bytes: usize,
    used: u64,
}
#[derive(Default)]
struct Cache {
    entries: BTreeMap<String, Entry>,
    bytes: usize,
    clock: u64,
}
impl Cache {
    fn get(&mut self, key: &str) -> Option<(Value, Option<HeaderMap>)> {
        self.clock += 1;
        let entry = self.entries.get_mut(key)?;
        entry.used = self.clock;
        Some((entry.value.clone(), entry.headers.clone()))
    }
    fn insert(&mut self, key: String, value: Value, headers: Option<HeaderMap>) {
        const MAX_BYTES: usize = 32 * 1024 * 1024;
        const MAX_ENTRIES: usize = 512;
        let bytes = value.to_string().len()
            + key.len()
            + headers
                .as_ref()
                .map(|headers| {
                    headers
                        .iter()
                        .map(|(name, value)| name.as_str().len() + value.len())
                        .sum::<usize>()
                })
                .unwrap_or(0);
        if let Some(old) = self.entries.remove(&key) {
            self.bytes -= old.bytes;
        }
        if bytes > MAX_BYTES {
            return;
        }
        while self.bytes + bytes > MAX_BYTES || self.entries.len() >= MAX_ENTRIES {
            let key = self
                .entries
                .iter()
                .min_by_key(|(_, entry)| entry.used)
                .map(|(key, _)| key.clone())
                .unwrap();
            self.bytes -= self.entries.remove(&key).unwrap().bytes;
        }
        self.clock += 1;
        self.bytes += bytes;
        self.entries.insert(
            key,
            Entry {
                value,
                headers,
                bytes,
                used: self.clock,
            },
        );
    }
}
