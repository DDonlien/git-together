use crate::{credentials, presence::{self, Presence}, remote_git, service::Service, util::{self, text, Result}};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{collections::BTreeMap, sync::Arc, time::Duration};
use tokio::sync::{Mutex, RwLock, watch};
use tokio_util::sync::CancellationToken;

#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Project {
    pub repository_id: String,
    pub team_id: Option<String>,
}
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Configuration {
    enabled: bool, name: String, server_url: String, binding: String,
    device_id: String, user_id: String, device_token: String, projects: Vec<Project>,
}
#[derive(Clone, Serialize, Deserialize)]
pub(crate) struct Record {
    pub hash: String, pub result: Option<Value>, pub plan: Option<Value>,
}
#[derive(Clone)]
pub(crate) struct Workspace {
    pub id: String, pub repository: String, pub task: String, pub public: Value,
}
pub struct RemoteControl {
    pub(crate) service: Arc<Service>,
    pub(crate) presence: Arc<Presence>,
    persistent: bool,
    config: watch::Sender<Configuration>,
    state: RwLock<Value>,
    settings: Mutex<()>,
    pub(crate) records: Mutex<BTreeMap<String, Record>>,
    workspaces: RwLock<BTreeMap<String, Workspace>>,
    running: Mutex<BTreeMap<String, (String, CancellationToken)>>,
    client: reqwest::Client,
    storage_error: String,
}
impl RemoteControl {
    pub fn new(service: Arc<Service>, presence: Arc<Presence>, persistent: bool) -> Result<Arc<Self>> {
        let root = &service.root;
        let loaded=(|| -> Result<(Configuration,BTreeMap<String,Record>)> {
            let config = if persistent { credentials::load(&root.join("remote-control-v1.encrypted"), "GitTogether")? } else { None };
            let config: Configuration = config.map(serde_json::from_value).transpose().map_err(|_| "远端控制配置无效；原文件已保留。")?.unwrap_or_default();
            let records=if persistent {credentials::load(&root.join("remote-control-journal-v1.encrypted"), "GitTogether")?.map(serde_json::from_value).transpose().map_err(|_|"远端执行记录无效；请保留原文件并检查。")?.unwrap_or_default()} else {BTreeMap::new()};
            Ok((config,records))
        })();
        let (config,records,storage_error)=match loaded {Ok((c,r))=>(c,r,String::new()),Err(e)=>(Configuration::default(),BTreeMap::new(),e)};
        let (config, mut receiver) = watch::channel(config);
        let control = Arc::new(Self {
            service, presence, persistent, config, state: RwLock::new(json!({"connection":"disabled","error":storage_error,"devices":[],"jobs":[],"teams":[],"repositories":[]})),
            settings: Mutex::new(()), records: Mutex::new(records), workspaces: RwLock::new(BTreeMap::new()), running: Mutex::new(BTreeMap::new()),
            client: reqwest::Client::builder().redirect(reqwest::redirect::Policy::none()).timeout(Duration::from_secs(12)).build().map_err(|_| "远端控制网络服务无法启动。")?,
            storage_error,
        });
        let weak = Arc::downgrade(&control);
        tauri::async_runtime::spawn(async move {
            let mut retry = 2u64;
            loop {
                let config = receiver.borrow_and_update().clone();
                let Some(control) = weak.upgrade() else { break };
                if config.enabled && !config.device_token.is_empty() {
                    match control.poll(&config).await {
                        Ok(()) => retry = 2,
                        Err(error) => {
                            let mut state = control.state.write().await;
                            state["connection"] = json!("offline");
                            state["error"] = json!(error);
                            if let Some(devices) = state["devices"].as_array_mut() { for device in devices { device["online"] = json!(false); } }
                            retry = (retry * 2).min(30);
                        }
                    }
                }
                drop(control);
                tokio::select! { _ = tokio::time::sleep(Duration::from_secs(retry)) => {}, result = receiver.changed() => { if result.is_err() { break; } retry = 2; } }
            }
        });
        Ok(control)
    }
    pub fn enabled(&self) -> bool { let c=self.config.borrow(); c.enabled && !c.device_token.is_empty() && self.bound(&c).is_ok() }
    pub async fn busy(&self) -> bool { !self.running.lock().await.is_empty() }
    pub async fn forget_account(&self, revoke: bool) -> Result<()> {
        let _guard=self.settings.lock().await;
        if self.busy().await {return Err("远端操作正在执行，请先等待完成或中止，再退出账号。".into());}
        let old=self.config.borrow().clone();
        let warning=if revoke && !old.device_token.is_empty() {self.http(&old,"revoke",Some(&json!({"deviceId":old.device_id}))).await.err().map(|e|format!("本机已停止接收；服务器设备撤销暂未完成：{e}")).unwrap_or_default()}else{String::new()};
        self.save_config(Configuration::default()).await?;
        self.workspaces.write().await.clear();
        *self.state.write().await=json!({"connection":"disabled","error":warning,"devices":[],"jobs":[],"teams":[],"repositories":[]});
        Ok(())
    }
    fn bound(&self, c: &Configuration) -> Result<()> {
        if c.binding != self.presence.account_binding()? { return Err("Presence账号或服务器已改变，请重新登记此设备。".into()); }
        Ok(())
    }
    async fn decode(mut response: reqwest::Response) -> Result<Value> {
        let success=response.status().is_success();
        let mut bytes=vec![];
        while let Some(chunk)=response.chunk().await.map_err(|_|"远端控制响应未完成。")? {
            if bytes.len()+chunk.len()>4*1024*1024 {return Err("远端控制响应过大。".into());}
            bytes.extend_from_slice(&chunk);
        }
        let value:Value=serde_json::from_slice(&bytes).map_err(|_|"服务器尚不支持远端控制或响应格式无效。")?;
        if !success {return Err(value["message"].as_str().unwrap_or("服务器拒绝了远端控制请求。").chars().take(1900).collect());}
        Ok(value)
    }
    async fn http(&self, c: &Configuration, route: &str, input: Option<&Value>) -> Result<Value> {
        self.bound(c)?;
        let url = presence::server_url(&c.server_url)?.join(&format!("v1/control/{route}")).map_err(|_| "远端控制地址无效。")?;
        let request = if let Some(value) = input { self.client.post(url).json(value) } else { self.client.get(url) };
        let response = request.bearer_auth(&c.device_token).send().await.map_err(|_| "远端控制连接失败；可重新连接后查询命令结果。")?;
        if route=="state" && matches!(response.status().as_u16(),401|403) {self.state.write().await["deviceRevoked"]=json!(true);}
        Self::decode(response).await
    }
    async fn save_config(&self, c: Configuration) -> Result<()> {
        if self.persistent { credentials::save(&self.service.root.join("remote-control-v1.encrypted"), &serde_json::to_value(&c).map_err(|_| "设备配置无法编码。")?)?; }
        self.config.send_replace(c);
        Ok(())
    }
    pub(crate) async fn save_record(&self, id: &str, record: Record) -> Result<()> {
        let mut records = self.records.lock().await;
        if records.len() >= 512 && !records.contains_key(id) {
            let removable = records.iter().find(|(_, record)| record.result.is_some()).map(|(id, _)| id.clone());
            if let Some(id) = removable { records.remove(&id); } else { return Err("执行中的远端命令过多。".into()); }
        }
        let mut next = records.clone();
        next.insert(id.into(), record);
        if self.persistent { credentials::save(&self.service.root.join("remote-control-journal-v1.encrypted"), &serde_json::to_value(&next).map_err(|_| "执行记录无法编码。")?)?; }
        *records = next;
        Ok(())
    }
    async fn local_repositories(&self) -> Result<Value> {
        let c = self.config.borrow().clone();
        let catalog = self.service.catalog().await?;
        Ok(json!(catalog["repositories"].as_array().ok_or("仓库清单无法读取。")?.iter().filter(|r| r["available"] == true).map(|r| {
            let project = c.projects.iter().find(|p| p.repository_id == r["id"]);
            json!({"id":r["id"],"name":r["fullName"],"remoteId":repository_id(text(r,"url")).unwrap_or_default(),"enabled":project.is_some(),"teamId":project.and_then(|p|p.team_id.clone())})
        }).collect::<Vec<_>>()))
    }
    async fn snapshot(&self) -> Result<Value> {
        let c = self.config.borrow().clone();
        let mut state = self.state.read().await.clone();
        let bound=!c.device_token.is_empty() && state["deviceRevoked"]!=true && self.bound(&c).is_ok();
        if !bound {state["devices"]=json!([]);state["jobs"]=json!([]);state["teams"]=json!([]);state["repositories"]=json!([]);state["connection"]=json!("disabled");}
        state["enabled"] = json!(c.enabled && bound);
        state["registered"] = json!(bound);
        state["deviceId"] = json!(if bound {&c.device_id}else{""});
        state["userId"] = json!(if bound {&c.user_id}else{""});
        state["name"] = json!(c.name);
        state["localRepositories"] = self.local_repositories().await?;
        Ok(state)
    }
    pub async fn command(self: &Arc<Self>, method: &str, input: Value) -> Result<Value> {
        if !input.is_object() || serde_json::to_vec(&input).map_err(|_| "控制请求无效。")?.len() > 128 * 1024 { return Err("控制请求无效或过大。".into()); }
        if method!="status" && !self.storage_error.is_empty() {return Err(format!("远端控制已停用，原记录未覆盖：{}",self.storage_error));}
        match method {
            "status" => self.snapshot().await,
            "enroll" => {
                util::allowed(&input, &["name","registrationKey"])?;
                let _guard = self.settings.lock().await;
                let (url, token) = self.presence.access()?;
                let supplied = input["registrationKey"].as_str().filter(|s|!s.trim().is_empty()).map(|s|s.trim().to_owned());
                let registration = if self.presence.signed_in() {token.clone()} else if let Some(key)=supplied { key } else {
                    let private = presence::private_json(&crate::platform::home()?.join(".config/git-presence/control-access.local.json"))?;
                    if let Some(access)=private {
                        if presence::server_url(text(&access,"serverUrl"))?.as_str()!=url { return Err("设备登记授权属于其他服务器，请填写当前服务器的登记密钥。".into()); }
                        util::field(&access,"registrationKey",512)?
                    } else {token.clone()}
                };
                let name = util::field(&input, "name", 120)?;
                if name.trim().is_empty() { return Err("请输入设备名称。".into()); }
                let old = self.config.borrow().clone();
                if !old.device_token.is_empty() && self.state.read().await["deviceRevoked"]!=true && self.bound(&old).is_ok() {
                    return Err("此设备已登记；可以修改名称或先撤销旧设备。".into());
                }
                let address = presence::server_url(&url)?.join("v1/control/enroll").map_err(|_| "登记地址无效。")?;
                let response = self.client.post(address).bearer_auth(&registration).header("X-Presence-Account",&token).json(&json!({"name":name})).send().await.map_err(|_| "设备登记未完成，请检查服务器。")?;
                let value=Self::decode(response).await?;
                let id = util::field(&value, "deviceId", 100)?;
                uuid::Uuid::parse_str(&id).map_err(|_| "服务器返回无效设备身份。")?;
                let credential = util::field(&value, "deviceToken", 512)?;
                if credential.len() < 32 { return Err("服务器返回无效设备凭证。".into()); }
                self.save_config(Configuration { enabled: true, name, server_url: url.clone(), binding: self.presence.account_binding()?, device_id: id, user_id: util::field(&value, "userId", 160)?, device_token: credential, projects: vec![] }).await?;
                self.state.write().await["deviceRevoked"]=json!(false);
                self.snapshot().await
            }
            "configure" => {
                #[derive(Deserialize)] #[serde(rename_all="camelCase",deny_unknown_fields)]
                struct Input { enabled: bool, name: String, projects: Vec<Project> }
                let value: Input = serde_json::from_value(input).map_err(|_| "远端控制设置无效。")?;
                if value.name.trim().is_empty() || value.name.len()>120 || value.projects.len()>64 { return Err("设备名称或项目范围无效。".into()); }
                let _guard = self.settings.lock().await;
                let mut c = self.config.borrow().clone();
                if c.device_token.is_empty() { return Err("请先登记此设备。".into()); }
                if !value.enabled {
                    c.enabled=false; c.name=value.name.trim().into(); c.projects=value.projects;
                    self.save_config(c.clone()).await?;
                    self.workspaces.write().await.clear();
                    let mut feedback=String::new();
                    if let Err(error)=self.http(&c,"announce",Some(&json!({"name":c.name,"workspaces":[]}))).await {feedback=format!("本机已停用；服务器暂未更新：{error}");}
                    let mut state=self.state.write().await;
                    state["connection"]=json!("disabled");state["error"]=json!(feedback);
                    drop(state);
                    return self.snapshot().await;
                }
                self.bound(&c)?;
                let catalog = self.service.catalog().await?;
                let allowed = self.state.read().await["repositories"].clone();
                let teams = self.state.read().await["teams"].clone();
                let mut ids = std::collections::BTreeSet::new();
                for p in &value.projects {
                    if !ids.insert(&p.repository_id) { return Err("纳管项目重复。".into()); }
                    let repository = catalog["repositories"].as_array().unwrap().iter().find(|r| r["id"] == p.repository_id).ok_or("项目不属于此设备已保存的仓库。")?;
                    let remote = repository_id(text(repository,"url"))?;
                    if self.state.read().await["personalControl"]!=true && !allowed.as_array().is_some_and(|a|a.iter().any(|v| v==&remote)) { return Err("服务器尚未授权此项目，请先开通。".into()); }
                    if let Some(team) = &p.team_id {
                        if !teams.as_array().is_some_and(|a|a.iter().any(|t| t["id"]==*team && t["projects"].as_array().is_some_and(|r|r.iter().any(|v|v==&remote)))) { return Err("此项目不在指定团队的纳管范围。".into()); }
                    }
                }
                if self.presence.signed_in() {
                    let remotes=value.projects.iter().filter_map(|p|catalog["repositories"].as_array()?.iter().find(|r|r["id"]==p.repository_id)).map(|r|repository_id(text(r,"url"))).collect::<Result<Vec<_>>>()?;
                    self.presence.bind_account_repositories(remotes,vec![]).await?;
                }
                c.enabled = value.enabled; c.name = value.name.trim().into(); c.projects = value.projects;
                if !c.enabled {
                    self.http(&c, "announce", Some(&json!({"name":c.name,"workspaces":[]}))).await?;
                    self.workspaces.write().await.clear();
                }
                self.save_config(c).await?;
                if !self.enabled() { self.state.write().await["connection"] = json!("disabled"); }
                self.snapshot().await
            }
            "request" => {
                let c = self.config.borrow().clone();
                if !c.enabled { return Err("请先启用远端控制。".into()); }
                util::allowed(&input, &["id","deviceId","workspaceId","repositoryId","action","kind","previewId","previousId","paths","summary","description"])?;
                uuid::Uuid::parse_str(text(&input,"id")).map_err(|_| "控制命令编号无效。")?;
                self.http(&c, "requests", Some(&input)).await
            }
            "cancel" | "revoke" => {
                let c = self.config.borrow().clone();
                util::allowed(&input, &[if method=="cancel" {"id"} else {"deviceId"}])?;
                self.http(&c, method, Some(&input)).await?;
                if method=="revoke" && input["deviceId"]==c.device_id {
                    self.save_config(Configuration { name:c.name, ..Default::default() }).await?;
                    self.workspaces.write().await.clear();
                    *self.state.write().await=json!({"connection":"disabled","error":"","devices":[],"jobs":[],"teams":[],"repositories":[]});
                }
                self.snapshot().await
            }
            _ => Err("未知的远端控制操作。".into()),
        }
    }
    async fn mapped(&self, c: &Configuration, allowed: &Value) -> Result<BTreeMap<String, Workspace>> {
        let catalog = self.service.catalog().await?;
        let mut result = BTreeMap::new();
        for p in &c.projects {
            let repository = catalog["repositories"].as_array().unwrap().iter().find(|r|r["id"]==p.repository_id).ok_or("已开放的项目被移除，请更新远端控制设置。")?;
            let remote = repository_id(text(repository,"url"))?;
            let _ = allowed;
            let tasks = self.service.control_tasks(&p.repository_id).await?;
            for task in &tasks {
                let id = util::digest(format!("{remote}:{}",text(task,"path")));
                let actions = if task["branch"]=="Detached HEAD" { vec!["abort"] } else { vec!["commit","submit","abort","discard"] };
                let public = json!({"id":id,"repositoryId":remote,"branch":task["branch"],"head":task["head"],"teamId":p.team_id,"actions":actions});
                result.insert(id.clone(), Workspace { id, repository:p.repository_id.clone(), task:text(task,"id").into(), public });
            }
        }
        Ok(result)
    }
    async fn poll(self: &Arc<Self>, c: &Configuration) -> Result<()> {
        let mut state = self.http(c, "state", None).await?;
        if state["version"]!=1 || state["deviceId"]!=c.device_id || state["userId"]!=c.user_id || !state["devices"].is_array() || !state["pending"].is_array() { return Err("远端控制身份或状态无效。".into()); }
        let mapped = self.mapped(c, &state["repositories"]).await?;
        self.http(c, "announce", Some(&json!({"name":c.name,"workspaces":mapped.values().map(|w|&w.public).collect::<Vec<_>>()}))).await?;
        *self.workspaces.write().await = mapped;
        state["connection"] = json!("connected"); state["error"] = json!("");
        let pending = state["pending"].as_array().unwrap().clone();
        if self.config.borrow().device_id != c.device_id || !self.enabled() { return Ok(()); }
        *self.state.write().await = state;
        for job in pending {
            let id = util::field(&job,"id",100)?;
            uuid::Uuid::parse_str(&id).map_err(|_|"服务器返回无效命令编号。")?;
            let mut running = self.running.lock().await;
            if running.contains_key(&id) || (running.len()>=8 && job["action"]!="abort") { continue; }
            let cancel = CancellationToken::new();
            running.insert(id.clone(), (text(&job,"workspaceId").into(), cancel.clone()));
            drop(running);
            let control = self.clone();
            tauri::async_runtime::spawn(async move {
                let result = control.run_job(job, cancel).await;
                if let Err(error) = result { control.state.write().await["error"] = json!(error); }
                control.running.lock().await.remove(&id);
            });
        }
        Ok(())
    }
    pub(crate) async fn authorize(&self, job: &Value) -> Result<Workspace> {
        let c = self.config.borrow().clone();
        if !c.enabled || c.device_id != text(job,"deviceId") { return Err("此设备已停用或命令目标已变化。".into()); }
        let workspace = self.workspaces.read().await.get(text(job,"workspaceId")).cloned().ok_or("目标工作目录未开放远端控制。")?;
        if !c.projects.iter().any(|p| p.repository_id==workspace.repository && json!(p.team_id)==workspace.public["teamId"]) {return Err("此项目的本机远端控制授权已撤销。".into());}
        if workspace.public["repositoryId"]!=job["repositoryId"] { return Err("命令不属于此项目。".into()); }
        self.http(&c,"claim",Some(&json!({"id":job["id"]}))).await?;
        Ok(workspace)
    }
    pub(crate) async fn operation_ids(&self, workspace: &Workspace, excluding: &str, cancel_ids: &[String]) -> Vec<String> {
        let mut ids = self.service.target_operation_ids(&workspace.repository, &workspace.task, cancel_ids);
        let active = self.running.lock().await;
        for (id, (target, token)) in active.iter() {
            if id!=excluding && target==&workspace.id {
                let tagged = format!("remote:{id}");
                if cancel_ids.contains(&tagged) { token.cancel(); }
                ids.push(tagged);
            }
        }
        ids
    }
    async fn run_job(self: &Arc<Self>, job: Value, cancel: CancellationToken) -> Result<()> {
        let workspace = self.authorize(&job).await?;
        let id = text(&job,"id");
        let keys=["id","deviceId","workspaceId","repositoryId","action","kind","previewId","previousId","paths","summary","description","requesterDeviceId"];
        let request: Value = job.as_object().ok_or("远端命令无效。")?.iter().filter(|(k,_)|keys.contains(&k.as_str())).map(|(k,v)|(k.clone(),v.clone())).collect::<serde_json::Map<_,_>>().into();
        let hash = util::digest(serde_json::to_vec(&request).map_err(|_|"命令无法编码。")?);
        let previous = self.records.lock().await.get(id).cloned();
        let completion = if let Some(previous) = previous {
            if previous.hash!=hash { return Err("命令编号与原请求不一致，拒绝执行。".into()); }
            previous.result.unwrap_or_else(|| json!({"id":id,"ok":false,"result":{"phase":"interrupted"},"error":"目标进程曾在执行中退出；已保留现场，请重新查看目标状态。不会自动重复提交。"}))
        } else {
            self.save_record(id, Record {hash:hash.clone(),result:None,plan:None}).await?;
            let result = remote_git::run(self,&workspace,&job,&cancel).await;
            let completion = match result {
                Ok(result) => json!({"id":id,"ok":true,"result":result}),
                Err(error) => json!({"id":id,"ok":false,"error":error.chars().take(1900).collect::<String>()}),
            };
            let plan = self.records.lock().await.get(id).and_then(|record|record.plan.clone());
            self.save_record(id,Record {hash,result:Some(completion.clone()),plan}).await?;
            completion
        };
        let c = self.config.borrow().clone();
        self.http(&c,"finish",Some(&completion)).await?;
        Ok(())
    }
}
pub(crate) fn repository_id(input: &str) -> Result<String> {
    let url=url::Url::parse(input).map_err(|_|"仓库远端身份无效。")?;
    let host=url.host_str().ok_or("仓库远端身份无效。")?;
    let authority=if let Some(port)=url.port(){format!("{host}:{port}")}else{host.to_owned()};
    Ok(format!("{}{}",authority,url.path().trim_end_matches('/')).to_lowercase())
}
