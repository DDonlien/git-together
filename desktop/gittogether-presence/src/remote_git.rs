use crate::{remote_control::{RemoteControl, Workspace}, rpc::call, util::Result};
use serde_json::{json, Value};
use std::sync::Arc;
use tokio_util::sync::CancellationToken;
pub async fn run(control: &Arc<RemoteControl>, workspace: &Workspace, job: &Value, cancel: &CancellationToken) -> Result<Value> {
    if cancel.is_cancelled() { return Err("远端操作已取消，未提交给 Desktop。".into()); }
    // Once handed off, keep the original operation alive until Desktop reports
    // its outcome. Cancellation must never turn an in-flight commit into a
    // falsely reported abort or permit an account change during that commit.
    let previous = if let Some(id)=job["previousId"].as_str() {
        control.records.lock().await.get(id).and_then(|r|r.result.clone()).unwrap_or(Value::Null)
    }else {Value::Null};
    call("execute", json!({"repositoryId":workspace.repository,"taskId":workspace.task,"job":job,"previousResult":previous["result"]})).await
}
