mod credentials;
mod git;
mod instances;
mod platform;
mod presence;
mod remote_control;
mod remote_git;
mod rpc;
mod service;
mod util;
use serde_json::{json, Value};
use std::{path::PathBuf,sync::Arc};
use tokio::io::{AsyncBufReadExt, BufReader};
#[tokio::main]
async fn main() {
    if let Err(e)=run().await {eprintln!("Presence: {e}");std::process::exit(1)}
}
async fn run() -> util::Result<()> {
    let root=std::env::args().nth(1).map(PathBuf::from).ok_or("Presence 缺少私有配置目录。")?;
    // Storage callbacks must be serviced while persisted state is still loading.
    let (sender, mut requests) = tokio::sync::mpsc::unbounded_channel::<util::Result<Value>>();
    tokio::spawn(async move {
        let result: util::Result<()> = async {
            let mut input = BufReader::new(tokio::io::stdin()).lines();
            while let Some(line) = input.next_line().await.map_err(|e| e.to_string())? {
                if line.len() > 16 * 1024 * 1024 { return Err("Presence 请求过大。".into()) }
                let value: Value = serde_json::from_str(&line).map_err(|e| e.to_string())?;
                if value.get("callbackId").is_some() { rpc::reply(value) }
                else if sender.send(Ok(value)).is_err() { break }
            }
            Ok(())
        }.await;
        if let Err(error) = result { let _ = sender.send(Err(error)); }
    });
    let service=Arc::new(service::Service{root:root.clone()});
    let presence=presence::Presence::new(root,true,service.clone()).await?;
    let control=remote_control::RemoteControl::new(service,presence.clone(),true).await?;
    while let Some(value) = requests.recv().await {
        let value = value?;
        let p=presence.clone();let c=control.clone();
        tokio::spawn(async move {
            let result:util::Result<Value>=async {
                let method=value["method"].as_str().ok_or("Presence 方法无效。")?;
                let group=value["group"].as_str().ok_or("Presence 请求无效。")?;
                if group=="internal" && method=="ensureSaved" {
                    let root=value["input"]["path"].as_str().ok_or("工作目录无效。")?;
                    let paths:Vec<String>=serde_json::from_value(value["input"]["paths"].clone()).map_err(|_|"文件范围无效。")?;
                    p.ensure_saved(std::path::Path::new(root),&paths).await?;
                    return Ok(json!({"saved":true}));
                }
                if group=="control" {return c.command(method,value["input"].clone()).await}
                if group!="presence" {return Err("此进程只提供 Presence。".into())}
                if matches!(method,"register"|"login"|"logout"|"configure"|"selectServer"|"removeServer") && c.busy().await {return Err("请先等待远端操作结束。".into())}
                if method=="logout" && p.signed_in() {c.forget_account(true).await?;}
                p.command(method,value["input"].clone()).await
            }.await;
            let reply=match result {Ok(v)=>json!({"id":value["id"],"ok":true,"value":v}),Err(e)=>json!({"id":value["id"],"ok":false,"error":e})};
            if let Err(e)=rpc::send(&reply) {eprintln!("Presence: {e}")}
        });
    }
    Ok(())
}
