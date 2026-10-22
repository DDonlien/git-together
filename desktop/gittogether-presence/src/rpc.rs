use crate::util::Result;
use serde_json::{json, Value};
use std::{collections::BTreeMap, sync::{Mutex, OnceLock}, io::Write};
use tokio::sync::oneshot;
type Reply = oneshot::Sender<Result<Value>>;
static WAITERS: OnceLock<Mutex<BTreeMap<String, Reply>>> = OnceLock::new();
static OUTPUT: Mutex<()> = Mutex::new(());
pub fn send(value: &Value) -> Result<()> {
    let _lock = OUTPUT.lock().map_err(|_|"Presence 输出已关闭。")?;
    let mut output = std::io::stdout().lock();
    serde_json::to_writer(&mut output,value).map_err(|e|e.to_string())?;
    output.write_all(b"\n").and_then(|_|output.flush()).map_err(|e|e.to_string())
}
pub async fn call(method: &str, input: Value) -> Result<Value> {
    let id=uuid::Uuid::new_v4().to_string(); let (tx,rx)=oneshot::channel();
    WAITERS.get_or_init(Default::default).lock().map_err(|_|"Presence 请求已关闭。")?.insert(id.clone(),tx);
    if let Err(e)=send(&json!({"callbackId":id,"method":method,"input":input})) { WAITERS.get().unwrap().lock().unwrap().remove(&id); return Err(e) }
    let result = tokio::time::timeout(std::time::Duration::from_secs(1800),rx).await;
    WAITERS.get().unwrap().lock().unwrap().remove(&id);
    result.map_err(|_|"Desktop 执行响应超时。")?.map_err(|_|"Desktop 执行连接已关闭。")?
}
pub fn reply(value: Value) {
    if let Some(id)=value["callbackId"].as_str() {
        if let Some(tx)=WAITERS.get_or_init(Default::default).lock().unwrap().remove(id) {
            let _=tx.send(if value["ok"]==true {Ok(value["value"].clone())}else{Err(value["error"].as_str().unwrap_or("Desktop 执行失败。").to_owned())});
        }
    }
}
