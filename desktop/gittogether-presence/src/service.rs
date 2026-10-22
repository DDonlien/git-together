use crate::{rpc::call, util::Result};
use serde_json::{json, Value};
use std::path::PathBuf;

// This service has no Git executable or Git credentials. Every Git fact and
// operation comes from the parent Desktop process over its private stdio pipe.
pub struct Service { pub root: PathBuf }
impl Service {
    pub async fn catalog(&self) -> Result<Value> { call("catalog", json!({})).await }
    pub async fn control_tasks(&self, repository: &str) -> Result<Vec<Value>> {
        serde_json::from_value(call("tasks", json!({"repositoryId":repository})).await?).map_err(|e|e.to_string())
    }
}
pub async fn open(url: &str) -> Result<()> { call("open", json!({"url":url})).await?; Ok(()) }
