use crate::{git::{self, Options}, operations, remote_control::{RemoteControl, Workspace}, util::{self, text, Result}};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{collections::BTreeSet, fs, io::{Read, Write}, path::{Path, PathBuf}, sync::Arc};
use tokio_util::sync::CancellationToken;

fn secure(root: &Path, relative: &str) -> Result<PathBuf> {
    let relative = util::file_path(relative)?;
    let path = root.join(&relative);
    let mut parent = root.to_path_buf();
    let components: Vec<_> = Path::new(&relative).components().collect();
    for component in components.iter().take(components.len().saturating_sub(1)) {
        parent.push(component.as_os_str());
        match fs::symlink_metadata(&parent) {
            Ok(m) if m.is_dir() && !m.file_type().is_symlink() => (),
            Ok(_) => return Err("文件父目录是链接或不是目录，未执行远端更改。".into()),
            Err(e) if e.kind()==std::io::ErrorKind::NotFound => (),
            Err(_) => return Err("无法检查文件父目录。".into()),
        }
    }
    Ok(path)
}
fn paths(task: &Value, input: &Value) -> Result<Vec<String>> {
    let files=operations::selected_files(task,input)?;
    if files.len()>1000 {return Err("更改文件过多，请在目标设备缩小范围。".into());}
    Ok(operations::selected_paths(&files))
}
fn file_key(root: &Path, task: &Value) -> Result<String> {
    let mut digest=Sha256::new();
    digest.update(text(task,"changeKey"));
    let all=paths(task,&json!({}))?;
    for p in all {
        digest.update(p.as_bytes());
        let file=secure(root,&p)?;
        match fs::symlink_metadata(&file) {
            Ok(m) if m.file_type().is_symlink() => digest.update(fs::read_link(file).map_err(|_|"无法检查文件链接。")?.as_os_str().to_string_lossy().as_bytes()),
            Ok(m) if m.is_file() => {
                let mut f=fs::File::open(file).map_err(|_|"无法检查更改文件内容。")?;
                let mut bytes=[0u8;65536];
                loop {let n=f.read(&mut bytes).map_err(|_|"无法完整读取更改文件。")?;if n==0{break}digest.update(&bytes[..n]);}
            },
            Ok(_) => return Err("远端操作暂不处理子模块或目录更改，请在目标端处理。".into()),
            Err(e) if e.kind()==std::io::ErrorKind::NotFound => digest.update(b"missing"),
            Err(_) => return Err("无法检查更改文件。".into()),
        }
    }
    Ok(digest.finalize().iter().map(|b|format!("{b:02x}")).collect())
}
async fn operation(root: &Path) -> Result<&'static str> {
    for name in ["rebase-merge","rebase-apply","MERGE_HEAD"] {
        let p=git::read(root,&["rev-parse","--path-format=absolute","--git-path",name]).await?;
        if Path::new(p.trim()).exists() {return Ok(if name=="MERGE_HEAD"{"merge"}else{"rebase"});}
    }
    Ok("none")
}
async fn operation_key(root: &Path) -> Result<String> {
    let mut data=vec![];
    for name in ["MERGE_HEAD","rebase-merge","rebase-apply","rebase-merge/head-name","rebase-apply/head-name"] {
        let path=PathBuf::from(git::read(root,&["rev-parse","--path-format=absolute","--git-path",name]).await?.trim());
        if let Ok(metadata)=fs::symlink_metadata(&path) {
            data.extend_from_slice(name.as_bytes());
            data.extend_from_slice(crate::platform::metadata_key(&metadata).as_bytes());
            if metadata.is_file() {data.extend(fs::read(path).map_err(|_|"无法检查Git操作状态。")?);}
        }
    }
    Ok(util::digest(data))
}
pub(crate) async fn verify_file_key(root: &Path, expected: &str) -> Result<()> {
    let current=git::task(root).await?;
    if file_key(root,&current)?!=expected { return Err("目标文件内容已变化，请重新预览。".into()); }
    Ok(())
}
fn public_files(task: &Value, selected: Option<&Value>) -> Result<Value> {
    let input=if let Some(p)=selected {json!({"paths":p})} else {json!({})};
    let files=operations::selected_files(task,&input)?;
    let value=json!(files.iter().map(|file|json!({"path":file["path"],"fromPath":file["previousPath"].as_str(),"status":file["status"],"tracked":file["tracked"]==true || text(file,"status")!="??"})).collect::<Vec<_>>());
    if serde_json::to_vec(&value).map_err(|_|"文件列表无法编码。")?.len()>96*1024 {return Err("远端文件清单过大，请在目标设备缩小范围。".into());}
    Ok(value)
}
pub(crate) async fn run(control: &Arc<RemoteControl>, workspace: &Workspace, job: &Value, cancel: &CancellationToken) -> Result<Value> {
    let context=control.service.context(&workspace.repository).await?;
    let root=control.service.task_root(&context,&workspace.task).await?;
    let action=text(job,"action");
    let kind=text(job,"kind");
    let _foreground=if matches!(kind,"execute"|"retryPush"|"restore") {Some(control.service.remote_mutation()?)}else{None};
    if cancel.is_cancelled(){return Err("远端操作已中止。".into());}
    if matches!(kind,"preview"|"generate") {
        let task=git::task(&root).await?;
        let mode=operation(&root).await?;
        if action!="abort" && mode!="none" {return Err("请先中止或完成目标端正在进行的合并/变基。".into());}
        if action!="abort" {operations::idle(&root).await?;}
        if action!="abort" && task["files"].as_array().is_none_or(|f|f.is_empty()){return Err("目标工作目录没有未提交更改。".into());}
        let selected=job.get("paths");
        let file_list=public_files(&task,selected)?;
        let key=file_key(&root,&task)?;
        let running_ids=control.operation_ids(workspace,text(job,"id"),&[]).await;
        let mut result=json!({"previewId":job["id"],"expiresAt":util::now()+600_000,"branch":task["branch"],"head":task["head"],"changeKey":task["changeKey"],"files":file_list,"summary":"","description":"","operation":mode,"running":!running_ids.is_empty(),"phase":"prepared"});
        if action=="abort" && mode=="none" && result["running"]!=true {return Err("目标工作目录没有进行中的操作。".into());}
        if matches!(action,"commit"|"submit") {
            let mut input=json!({"repositoryId":workspace.repository,"taskId":workspace.task,"expectedHead":task["head"],"changeKey":task["changeKey"],"generationId":job["id"]});
            if let Some(paths)=selected {input["paths"]=paths.clone();}
            match control.service.handle("generateCommitMessage",input,cancel.clone()).await {
                Ok(draft)=>{result["summary"]=draft["summary"].clone();result["description"]=draft["description"].clone();},
                Err(error)=>{result["aiError"]=json!(error.chars().take(900).collect::<String>());},
            }
        }
        control.service.validate(&context).await?;
        let current=git::task(&root).await?;
        if current["head"]!=task["head"] || file_key(&root,&current)?!=key {return Err("目标文件在预览期间发生变化，请重新查看。".into());}
        let mut record=control.records.lock().await.get(text(job,"id")).cloned().ok_or("执行记录不存在。")?;
        record.plan=Some(json!({"requester":job["requesterDeviceId"],"repository":workspace.repository,"task":workspace.task,"action":action,"head":task["head"],"changeKey":task["changeKey"],"fileKey":key,"paths":file_list.as_array().unwrap().iter().map(|f|f["path"].clone()).collect::<Vec<_>>(),"expires":result["expiresAt"],"operation":mode,"operationKey":operation_key(&root).await?,"runningIds":running_ids}));
        control.save_record(text(job,"id"),record).await?;
        return Ok(result);
    }
    if kind=="retryPush" {
        let prior=control.records.lock().await.get(text(job,"previousId")).cloned().ok_or("此前提交结果已不可用。")?;
        let completion=prior.result.ok_or("此前操作尚未完成。")?;
        let commit=text(&completion["result"],"commitId");
        if action!="submit" || commit.is_empty() || completion["result"]["pushed"]==true {return Err("没有待重试的提交推送。".into());}
        let _guard=control.service.claim(&root,cancel).await?;
        control.authorize(job).await?;
        if context.repository["permissions"]["push"]==false {return Err("访问账号目前没有此仓库推送权限。".into());}
        let result=operations::push(&root,&json!({"repositoryId":workspace.repository,"taskId":workspace.task,"expectedHead":commit,"commitId":commit,"operationId":job["id"]}),&context.network,&control.service,&context,cancel).await?;
        return Ok(json!({"phase":"pushed","commitId":result["commitId"],"pushed":true}));
    }
    if kind=="restore" {
        let prior=control.records.lock().await.get(text(job,"previousId")).cloned().ok_or("此前备份记录不可用。")?;
        let completion=prior.result.ok_or("此前操作尚未结束。")?;
        let backup=text(&completion["result"],"backupId");
        if action!="discard" || backup.is_empty(){return Err("没有可恢复的丢弃备份。".into());}
        let _guard=control.service.claim(&root,cancel).await?;
        control.authorize(job).await?;
        restore(control,&root,backup).await?;
        return Ok(json!({"phase":"restored","backupId":backup}));
    }
    if kind!="execute" {return Err("远端命令类型无效。".into());}
    let preview=control.records.lock().await.get(text(job,"previewId")).cloned().and_then(|r|r.plan).ok_or("预览已过期，请重新查看。")?;
    if preview["repository"]!=workspace.repository || preview["task"]!=workspace.task || preview["requester"]!=job["requesterDeviceId"] || preview["action"]!=job["action"] || preview["expires"].as_i64().is_none_or(|t|t<util::now()) {return Err("预览不属于当前操作或已过期。".into());}
    if action=="abort" && preview["runningIds"].as_array().is_some_and(|v|!v.is_empty()) {
        let observed:Vec<String>=preview["runningIds"].as_array().unwrap().iter().filter_map(|v|v.as_str().map(String::from)).collect();
        let current=control.operation_ids(workspace,text(job,"id"),&observed).await;
        if !current.iter().any(|id|observed.contains(id)) {return Err("预览时的操作已结束，请重新查看目标状态。".into());}
        return Ok(json!({"phase":"aborted","cancelRequested":true,"warning":"已请求中止预览中的操作；开始执行的Git事务会安全收尾，请等待目标状态更新。"}));
    }
    let _guard=control.service.claim(&root,cancel).await?;
    let current=git::task(&root).await?;
    if current["head"]!=preview["head"] || file_key(&root,&current)?!=text(&preview,"fileKey") {return Err("目标状态已变化，请重新预览并确认。".into());}
    control.service.validate(&context).await?;
    control.authorize(job).await?;
    if action=="abort" {
        let mode=operation(&root).await?;
        if mode!=text(&preview,"operation") || mode=="none" || operation_key(&root).await?!=text(&preview,"operationKey") {return Err("目标的合并/变基状态已变化。".into());}
        backup(control,&root,&current,&paths(&current,&json!({}))?,text(job,"id"),"abort").await?;
        control.presence.ensure_saved(&root,&paths(&current,&json!({}))?).await?;
        verify_file_key(&root,text(&preview,"fileKey")).await?;
        control.authorize(job).await?;
        git::run(&root,&[mode,"--abort"],Options {write:true,..Default::default()}).await?;
        return Ok(json!({"phase":"aborted","operation":mode,"backupId":job["id"]}));
    }
    if action=="discard" {
        operations::idle(&root).await?;
        let selected=job.get("paths").unwrap_or(&preview["paths"]);
        let chosen=paths(&current,&json!({"paths":selected}))?;
        backup(control,&root,&current,&chosen,text(job,"id"),"discard").await?;
        control.presence.ensure_saved(&root,&chosen).await?;
        verify_file_key(&root,text(&preview,"fileKey")).await?;
        control.authorize(job).await?;
        discard(control,&root,&current,&chosen,text(job,"id")).await?;
        return Ok(json!({"phase":"discarded","backupId":job["id"],"files":public_files(&current,Some(selected))?}));
    }
    if !matches!(action,"commit"|"submit"){return Err("远端操作无效。".into());}
    let selected=job.get("paths").unwrap_or(&preview["paths"]);
    let permitted=preview["paths"].as_array().ok_or("预览范围无效。")?;
    if selected.as_array().is_none_or(|p|p.is_empty() || p.iter().any(|v|!permitted.contains(v))) {return Err("提交文件超出已确认范围。".into());}
    control.presence.ensure_saved(&root,&paths(&current,&json!({"paths":selected}))?).await?;
    verify_file_key(&root,text(&preview,"fileKey")).await?;
    control.authorize(job).await?;
    let result=operations::submit(&root,&json!({"repositoryId":workspace.repository,"taskId":workspace.task,"expectedHead":preview["head"],"changeKey":preview["changeKey"],"operationId":job["id"],"summary":job["summary"],"description":job["description"],"paths":selected}),&control.service,&context,cancel).await?;
    let mut committed=json!({"phase":"committed","commitId":result["commitId"],"pushed":false,"warning":result["warning"].as_str().unwrap_or("")});
    if action=="submit" {
        // Persist the completed commit before a network push can fail or the process can exit.
        let mut record=control.records.lock().await.get(text(job,"id")).cloned().ok_or("提交结果记录不存在。")?;
        let mut pending=committed.clone();
        pending["warning"]=json!("已提交；推送尚未确认，可只重试推送。");
        record.result=Some(json!({"id":job["id"],"ok":true,"result":pending}));
        control.save_record(text(job,"id"),record).await?;
        let push=async {
            control.authorize(job).await?;
            if context.repository["permissions"]["push"]==false {return Err("访问账号目前没有此仓库推送权限。".into());}
            operations::push(&root,&json!({"repositoryId":workspace.repository,"taskId":workspace.task,"expectedHead":result["commitId"],"commitId":result["commitId"],"operationId":uuid::Uuid::new_v4().to_string()}),&context.network,&control.service,&context,cancel).await
        }.await;
        match push {
            Ok(_)=>{committed["phase"]=json!("pushed");committed["pushed"]=json!(true);},
            Err(error)=>committed["warning"]=json!(format!("已提交，推送未确认：{}",error.chars().take(1500).collect::<String>())),
        }
    }
    Ok(committed)
}
fn directory(control: &RemoteControl, id: &str) -> Result<PathBuf> {
    uuid::Uuid::parse_str(id).map_err(|_|"备份编号无效。")?;
    Ok(control.service.root.join("remote-backups").join(id))
}
fn write_json(path: &Path, value: &Value) -> Result<()> {
    let temporary=path.with_extension(format!("tmp-{}",uuid::Uuid::new_v4()));
    let mut file=fs::OpenOptions::new().write(true).create_new(true).open(&temporary).map_err(|_|"无法创建备份记录。")?;
    file.write_all(&serde_json::to_vec(value).map_err(|_|"备份记录无法编码。")?).and_then(|_|file.sync_all()).map_err(|_|"备份记录写入失败。")?;
    fs::rename(temporary,path).map_err(|_|"备份记录保存失败。".to_owned())
}
async fn index_path(root: &Path) -> Result<PathBuf> {
    Ok(PathBuf::from(git::read(root,&["rev-parse","--path-format=absolute","--git-path","index"]).await?.trim()))
}
async fn backup(control: &RemoteControl, root: &Path, task: &Value, paths: &[String], id: &str, mode: &str) -> Result<()> {
    let folder=directory(control,id)?;
    fs::create_dir_all(folder.parent().ok_or("备份目录无效。")?).map_err(|_|"无法创建备份目录。")?;
    fs::create_dir(&folder).map_err(|_|"无法创建独立备份；未丢弃文件。")?;
    #[cfg(unix)] {use std::os::unix::fs::PermissionsExt; fs::set_permissions(&folder,fs::Permissions::from_mode(0o700)).map_err(|_|"无法保护备份目录权限。")?;}
    let index=index_path(root).await?;
    if index.exists(){fs::copy(&index,folder.join("index")).map_err(|_|"无法备份原暂存状态。")?;}
    let mut entries=vec![];
    for (n,path) in paths.iter().enumerate(){
        let file=secure(root,path)?;
        let entry=match fs::symlink_metadata(&file){
            Ok(m) if m.is_file()=>{
                fs::copy(&file,folder.join(n.to_string())).map_err(|_|"文件备份未完成；未丢弃更改。")?;
                json!({"path":path,"kind":"file","number":n,"readonly":m.permissions().readonly()})
            },
            Ok(m) if m.file_type().is_symlink()=>json!({"path":path,"kind":"link","target":fs::read_link(&file).map_err(|_|"无法备份文件链接。")?}),
            Ok(_)=>return Err("无法安全备份目录或子模块更改。".into()),
            Err(e) if e.kind()==std::io::ErrorKind::NotFound=>json!({"path":path,"kind":"missing"}),
            Err(_)=>return Err("无法备份更改文件。".into()),
        };
        entries.push(entry);
    }
    write_json(&folder.join("manifest.json"),&json!({"mode":mode,"task":task["id"],"head":task["head"],"beforeKey":file_key(root,task)?,"entries":entries,"afterKey":null,"afterHead":null}))?;
    Ok(())
}
fn restore_files(root: &Path, folder: &Path, entries: &[Value]) -> Result<()> {
    for entry in entries {
        let file=secure(root,text(entry,"path"))?;
        match fs::symlink_metadata(&file){
            Ok(m) if m.is_file() || m.file_type().is_symlink()=>fs::remove_file(&file).map_err(|_|"无法还原备份文件；原备份已保留。")?,
            Ok(_)=>return Err("恢复目标已变成目录，原备份已保留。".into()),
            Err(e) if e.kind()==std::io::ErrorKind::NotFound=>(),
            Err(_)=>return Err("无法检查恢复目标。".into()),
        }
        match text(entry,"kind"){
            "file"=>{
                fs::create_dir_all(file.parent().ok_or("文件目录无效。")?).map_err(|_|"无法创建恢复目录。")?;
                fs::copy(folder.join(entry["number"].as_u64().ok_or("备份文件编号无效。")?.to_string()),&file).map_err(|_|"备份恢复未完成。")?;
            },
            "link"=>{
                fs::create_dir_all(file.parent().ok_or("链接目录无效。")?).map_err(|_|"无法创建恢复目录。")?;
                #[cfg(unix)] std::os::unix::fs::symlink(text(entry,"target"),&file).map_err(|_|"无法恢复文件链接。")?;
                #[cfg(windows)] std::os::windows::fs::symlink_file(text(entry,"target"),&file).map_err(|_|"无法恢复文件链接；请检查系统链接权限。")?;
            },
            "missing"=>(),
            _=>return Err("备份类型无效。".into()),
        }
    }
    Ok(())
}
async fn discard(control: &RemoteControl, root: &Path, task: &Value, selected: &[String], id: &str) -> Result<()> {
    let folder=directory(control,id)?;
    let index=index_path(root).await?;
    let mut lock=operations::IndexLock::take(PathBuf::from(format!("{}.lock",index.display())))?;
    let current=git::task(root).await?;
    if current["head"]!=task["head"] || file_key(root,&current)?!=file_key(root,task)? {return Err("备份期间目标状态发生变化，未丢弃文件。".into());}
    let temporary=tempfile::Builder::new().prefix("gittogether-discard-").tempdir_in(index.parent().ok_or("Git暂存路径无效。")?).map_err(|_|"无法创建独立暂存区。")?;
    let private=temporary.path().join("index");
    if index.exists(){fs::copy(&index,&private).map_err(|_|"无法复制暂存状态。")?;}
    let environment=vec![("GIT_INDEX_FILE".into(),private.to_string_lossy().into()),("GIT_LITERAL_PATHSPECS".into(),"1".into())];
    let head=text(task,"head");
    let mut tracked=BTreeSet::new();
    if !head.bytes().all(|v|v==b'0'){
        for path in git::read(root,&["ls-tree","-r","--name-only","-z",head]).await?.split('\0').filter(|s|!s.is_empty()){tracked.insert(path.to_owned());}
    }
    let files:Vec<_>=selected.iter().filter(|p|tracked.contains(*p)).map(String::as_str).collect();
    let outcome=async {
        if !files.is_empty(){
            let mut arguments=vec!["restore","--source",head,"--staged","--worktree","--"];
            arguments.extend(&files);
            git::run(root,&arguments,Options {environment:environment.clone(),write:true,..Default::default()}).await?;
        }
        for path in selected.iter().filter(|p|!tracked.contains(*p)){
            git::run(root,&["update-index","--force-remove","--",path],Options {environment:environment.clone(),write:true,..Default::default()}).await?;
            let file=secure(root,path)?;
            match fs::symlink_metadata(&file){
                Ok(m) if m.is_file() || m.file_type().is_symlink()=>fs::remove_file(file).map_err(|_|"无法删除选定的新文件。")?,
                Ok(_)=>return Err("选定路径变为目录，未继续删除。".into()),
                Err(e) if e.kind()==std::io::ErrorKind::NotFound=>(),
                Err(_)=>return Err("无法检查待删除文件。".into()),
            }
        }
        if private.exists(){lock.publish(&index,&fs::read(&private).map_err(|_|"无法读取新的暂存状态。")?)?;}
        Ok::<_,String>(())
    }.await;
    if let Err(error)=outcome{
        let manifest:Value=serde_json::from_slice(&fs::read(folder.join("manifest.json")).map_err(|_|"备份记录无法读取。")?).map_err(|_|"备份记录无效。")?;
        restore_files(root,&folder,manifest["entries"].as_array().ok_or("备份文件清单无效。")?)?;
        return Err(format!("{error}；已还原文件，备份仍保留。"));
    }
    let mut manifest:Value=serde_json::from_slice(&fs::read(folder.join("manifest.json")).map_err(|_|"备份记录无法读取。")?).map_err(|_|"备份记录无效。")?;
    let after=git::task(root).await?;
    manifest["afterKey"]=json!(file_key(root,&after)?);manifest["afterHead"]=after["head"].clone();
    write_json(&folder.join("manifest.json"),&manifest)?;
    Ok(())
}
async fn restore(control: &RemoteControl, root: &Path, id: &str) -> Result<()> {
    let folder=directory(control,id)?;
    let mut manifest:Value=serde_json::from_slice(&fs::read(folder.join("manifest.json")).map_err(|_|"备份记录无法读取。")?).map_err(|_|"备份记录无效。")?;
    if manifest["mode"]!="discard" || manifest["restored"]==true{return Err("该备份不支持自动恢复或已经恢复。".into());}
    let task=git::task(root).await?;
    if task["id"]!=manifest["task"] || task["head"]!=manifest["afterHead"] || file_key(root,&task)?!=text(&manifest,"afterKey"){return Err("目标在丢弃后又有新变化，已保留备份，请在目标设备处理。".into());}
    let entries=manifest["entries"].as_array().ok_or("备份文件清单无效。")?;
    let selected:Vec<String>=entries.iter().filter_map(|e|e["path"].as_str().map(String::from)).collect();
    control.presence.ensure_saved(root,&selected).await?;
    operations::idle(root).await?;
    verify_file_key(root,text(&manifest,"afterKey")).await?;
    let index=index_path(root).await?;
    let mut lock=operations::IndexLock::take(PathBuf::from(format!("{}.lock",index.display())))?;
    restore_files(root,&folder,manifest["entries"].as_array().ok_or("备份文件清单无效。")?)?;
    if folder.join("index").exists(){lock.publish(&index,&fs::read(folder.join("index")).map_err(|_|"原暂存状态无法读取。")?)?;}
    else if index.exists(){fs::remove_file(&index).map_err(|_|"原暂存状态恢复失败。")?;}
    manifest["restored"]=json!(true);
    write_json(&folder.join("manifest.json"),&manifest)?;
    Ok(())
}
