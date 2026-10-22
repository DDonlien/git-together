use crate::{rpc::call, util::Result};
use serde_json::json;
use std::path::Path;
pub async fn read(root: &Path, args: &[&str]) -> Result<String> {
    if args != ["rev-list", "--count", "@{upstream}..HEAD"] { return Err("Presence 不允许直接运行 Git。".into()); }
    call("unpublished", json!({"path":root})).await?.as_u64().map(|n|n.to_string()).ok_or("未推送提交数量未知。".into())
}
