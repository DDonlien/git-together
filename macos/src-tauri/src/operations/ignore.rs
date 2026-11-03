use super::{idle, pathspec_input, IndexLock};
use crate::{git::{self, Options}, service::{Context, Service}, util::{self, Result}};
use serde_json::{json, Value};
use std::{fs::{self, File, OpenOptions}, io::{Read, Seek, SeekFrom, Write}, path::{Path, PathBuf}};
use tokio_util::sync::CancellationToken;

const IGNORE_LIMIT: u64 = 1_048_576;

struct IgnoreSnapshot { path: PathBuf, bytes: Option<Vec<u8>>, key: Option<String> }
impl IgnoreSnapshot {
    fn read(root: &Path) -> Result<Self> {
        let path = root.join(".gitignore");
        match fs::symlink_metadata(&path) {
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Self { path, bytes:None, key:None }),
            Err(_) => return Err(".gitignore 无法读取，未修改忽略规则。".into()),
            Ok(_) => (),
        }
        let mut file = crate::platform::open_regular(&path, OpenOptions::new().read(true)).map_err(|_| ".gitignore 必须是普通文件，不能是链接或目录。")?;
        let metadata = file.metadata().map_err(|_| ".gitignore 无法读取。")?;
        #[cfg(unix)] {
            use std::os::unix::fs::MetadataExt;
            if metadata.nlink() != 1 { return Err(".gitignore 存在硬链接，未修改共享文件。".into()); }
        }
        if metadata.len() > IGNORE_LIMIT { return Err(".gitignore 超出可安全修改的范围。".into()); }
        let mut bytes = Vec::new();
        Read::by_ref(&mut file).take(IGNORE_LIMIT + 1).read_to_end(&mut bytes).map_err(|_| ".gitignore 无法读取。")?;
        if bytes.len() as u64 > IGNORE_LIMIT || bytes.contains(&0) || std::str::from_utf8(&bytes).is_err() {
            return Err(".gitignore 不是可安全追加的 UTF-8 文本，原文件未修改。".into());
        }
        Ok(Self { path, bytes:Some(bytes), key:Some(crate::platform::metadata_key(&metadata)) })
    }
    fn verify(&self) -> Result<()> {
        let current = Self::read(self.path.parent().ok_or("忽略文件路径无效。")?)?;
        if current.bytes != self.bytes || current.key != self.key {
            return Err(".gitignore 已变化，请刷新后重试。".into());
        }
        Ok(())
    }
    fn append(&self, pattern: &str) -> Result<IgnoreWrite> {
        self.verify()?;
        let mut options = OpenOptions::new();
        options.read(true).append(true);
        if self.bytes.is_none() { options.create_new(true); }
        let file = crate::platform::open_regular(&self.path, &mut options).map_err(|_| "无法追加 .gitignore；原暂存区未修改。")?;
        if self.key.as_ref().is_some_and(|key| file.metadata().ok().as_ref().map(crate::platform::metadata_key).as_ref() != Some(key)) {
            return Err(".gitignore 已变化，请刷新后重试。".into());
        }
        let original = self.bytes.clone().unwrap_or_default();
        let mut addition = Vec::new();
        if !original.is_empty() && !original.ends_with(b"\n") { addition.push(b'\n'); }
        addition.extend_from_slice(pattern.as_bytes()); addition.push(b'\n');
        if (original.len() + addition.len()) as u64 > IGNORE_LIMIT { return Err(".gitignore 超出可安全修改的范围。".into()); }
        let mut write = IgnoreWrite { path:self.path.clone(), file, original, addition, written:0, key:None };
        while write.written < write.addition.len() {
            match write.file.write(&write.addition[write.written..]) {
                Ok(0) | Err(_) => { write.capture(); return Err(".gitignore 追加未完成，可能已写入部分内容；已保留现有文件，请检查后重试。原暂存区未修改。".into()); }
                Ok(count) => write.written += count,
            }
        }
        write.capture();
        write.file.sync_all().map_err(|_| ".gitignore 追加后保存反馈未完成，已保留现有文件，请检查。原暂存区未修改。")?;
        Ok(write)
    }
}

struct IgnoreWrite { path:PathBuf, file:File, original:Vec<u8>, addition:Vec<u8>, written:usize, key:Option<String> }
impl IgnoreWrite {
    fn capture(&mut self) { self.key = self.file.metadata().ok().map(|metadata| crate::platform::metadata_key(&metadata)); }
    fn matches(&mut self) -> bool {
        let Ok(metadata) = fs::symlink_metadata(&self.path) else { return false; };
        if self.key.as_ref() != Some(&crate::platform::metadata_key(&metadata)) { return false; }
        let mut current = Vec::new();
        if self.file.seek(SeekFrom::Start(0)).is_err() || Read::by_ref(&mut self.file).take(IGNORE_LIMIT+1).read_to_end(&mut current).is_err() { return false; }
        current.len() == self.original.len() + self.written && current.starts_with(&self.original) && current[self.original.len()..] == self.addition[..self.written]
    }
}

fn pattern(path: &str) -> Result<String> {
    util::file_path(path)?;
    if path.chars().any(char::is_control) || path.split('/').any(|part| part.is_empty() || part.trim_end_matches(['.',' ']).eq_ignore_ascii_case(".git"))
        || path.rsplit('/').next().is_some_and(|part| part.trim_end_matches(['.',' ']).eq_ignore_ascii_case(".gitignore")) {
        return Err("此文件不能加入忽略规则。".into());
    }
    let mut pattern = String::from("/");
    for character in path.chars() {
        if matches!(character, '*' | '?' | '[' | ']' | '!' | '#' | ' ') { pattern.push('\\'); }
        pattern.push(character);
    }
    Ok(pattern)
}

pub(super) async fn is_ignored(root: &Path, path: &str, cancel: Option<CancellationToken>) -> Result<bool> {
    // Prefixing ./ prevents names beginning with :(...) becoming pathspec
    // magic. check-ignore rejects GIT_LITERAL_PATHSPECS, so use NUL stdin only.
    let relative = format!("./{path}");
    let value = git::run(root, &["check-ignore", "--no-index", "-z", "--stdin"], Options { stdin:Some(pathspec_input(&[relative.clone()])), cancel, ..Default::default() }).await?;
    Ok(value.split('\0').any(|value| value == relative))
}

fn index_bytes(index: &Path) -> Result<Option<Vec<u8>>> {
    match fs::symlink_metadata(index) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(_) => Err("Git 暂存区无法读取。".into()),
        Ok(metadata) if metadata.len() <= 64_000_000 => {
            let file = crate::platform::open_regular(index, OpenOptions::new().read(true)).map_err(|_| "Git 暂存区必须是普通文件。")?;
            let mut bytes=Vec::new(); file.take(64_000_001).read_to_end(&mut bytes).map_err(|_| "Git 暂存区无法读取。")?;
            if bytes.len()>64_000_000 { return Err("Git 暂存区超出可安全修改的范围。".into()); }
            Ok(Some(bytes))
        }
        Ok(_) => Err("Git 暂存区超出可安全修改的范围。".into()),
    }
}

pub async fn file(root: &Path, input: &Value, service: &Service, context: &Context, cancel: &CancellationToken) -> Result<Value> {
    service.validate(context).await?;
    if cancel.is_cancelled() { return Err("忽略操作已取消。".into()); }
    let path = input["path"].as_str().ok_or("忽略文件路径无效。")?;
    let pattern = pattern(path)?;
    let target = crate::files::relative(root, path, false)?;
    let metadata = fs::symlink_metadata(&target).map_err(|_| "文件已不存在，请刷新后重试。")?;
    if !metadata.is_file() || crate::platform::is_link(&metadata) { return Err("只能忽略普通文件，不能忽略目录或链接。".into()); }
    let target_key = crate::platform::metadata_key(&metadata);
    idle(root).await?;
    let index = PathBuf::from(git::read(root, &["rev-parse","--path-format=absolute","--git-path","index"]).await?.trim());
    let mut lock = IndexLock::take(PathBuf::from(format!("{}.lock",index.display())))?;
    let original_index = index_bytes(&index)?;
    let before = git::task_summary(root).await?;
    if before["id"] != input["taskId"] || before["head"] != input["expectedHead"] || before["changeKey"] != input["changeKey"] {
        return Err("分支、提交或文件更改已变化，请刷新后重试。".into());
    }
    let literal = format!(":(literal){path}");
    if !git::read(root, &["diff","--cached","--name-only","--ita-visible-in-index","-z","--",&literal]).await?.is_empty() {
        return Err("此文件包含已暂存的更改，请先提交或取消暂存后再忽略；文件和暂存区均未修改。".into());
    }
    let tracked = !git::read(root, &["ls-files","--cached","-z","--",&literal]).await?.is_empty();
    let snapshot = IgnoreSnapshot::read(root)?;
    let has_pattern = snapshot.bytes.as_ref().is_some_and(|bytes| std::str::from_utf8(bytes).unwrap().lines().any(|line| line.trim_end_matches('\r') == pattern));
    let append = !has_pattern || !is_ignored(root,path,Some(cancel.clone())).await?;
    let temporary = tempfile::Builder::new().prefix("gittogether-ignore-").tempdir_in(index.parent().ok_or("Git 暂存区路径无效。")?).map_err(|_| "无法创建安全暂存区。")?;
    let private = temporary.path().join("index");
    if tracked {
        fs::write(&private, original_index.as_ref().ok_or("Git 暂存区已变化。")?).map_err(|_| "无法复制原暂存区。")?;
        git::run(root, &["rm","--cached","--quiet","--pathspec-from-file=-","--pathspec-file-nul"], Options { environment:vec![("GIT_INDEX_FILE".into(),private.to_string_lossy().into()),("GIT_LITERAL_PATHSPECS".into(),"1".into())], stdin:Some(pathspec_input(&[path.into()])), cancel:Some(cancel.clone()),write:true,..Default::default() }).await?;
    }
    snapshot.verify()?;
    let current=git::task_summary(root).await?;
    if current["id"] != before["id"] || current["head"] != before["head"] || current["changeKey"] != before["changeKey"] || index_bytes(&index)? != original_index {
        return Err("工作目录或暂存区已变化，请刷新后重试。".into());
    }
    service.validate(context).await?;
    if cancel.is_cancelled() { return Err("忽略操作已取消。".into()); }
    let mut written = if append { Some(snapshot.append(&pattern)?) } else { None };
    let publication: Result<()> = async {
        if !is_ignored(root,path,None).await? { return Err("其他 .gitignore 规则覆盖了此文件的忽略规则，未停止跟踪。".into()); }
        service.validate(context).await?;
        let after=git::READ_CONTEXT.scope(Options::default(),git::task_summary(root)).await?;
        let current_target = fs::symlink_metadata(&target).map_err(|_| "文件已变化，未停止跟踪。")?;
        if after["id"] != before["id"] || after["head"] != before["head"] || crate::platform::metadata_key(&current_target) != target_key || index_bytes(&index)? != original_index {
            return Err("工作目录或暂存区已变化，未停止跟踪。".into());
        }
        if let Some(write) = written.as_mut() { if !write.matches() { return Err(".gitignore 在操作期间已变化，未停止跟踪。".into()); } }
        else { snapshot.verify()?; }
        if tracked { lock.publish(&index,&fs::read(&private).map_err(|_| "安全暂存区无法读取。")?)?; }
        Ok(())
    }.await;
    if let Err(error) = publication {
        // An editor can change this file between a comparison and truncation
        // or unlink. Keep additive writes on failure rather than risk deleting
        // any concurrent user content while trying to roll our append back.
        return Err(if written.is_some() { format!("{error} .gitignore 可能已改变，已保留现有内容；原暂存区未修改，请检查忽略文件后重试。") } else { error });
    }
    drop(lock);
    let after=git::READ_CONTEXT.scope(Options::default(),git::task_summary(root)).await.map_err(|_| "忽略设置已保存，但刷新工作目录失败，请重新读取。")?;
    Ok(json!({"taskId":after["id"],"files":after["files"],"changeKey":after["changeKey"],"stoppedTracking":tracked}))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn additive_ignore_write_never_truncates_concurrent_or_replacement_content() {
        let temporary=tempfile::tempdir().unwrap();
        let path=temporary.path().join(".gitignore");
        fs::write(&path,"# user original without newline").unwrap();
        let snapshot=IgnoreSnapshot::read(temporary.path()).unwrap();
        let mut written=snapshot.append("/target.txt").unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(),"# user original without newline\n/target.txt\n");
        fs::write(&path,"concurrent editor bytes\n").unwrap();
        assert!(!written.matches());
        drop(written);
        assert_eq!(fs::read_to_string(&path).unwrap(),"concurrent editor bytes\n");
        let snapshot=IgnoreSnapshot::read(temporary.path()).unwrap();
        let written=snapshot.append("/another.txt").unwrap();
        fs::rename(&path,temporary.path().join("preserved-original")).unwrap();
        fs::write(&path,"replacement editor bytes\n").unwrap();
        drop(written);
        assert_eq!(fs::read_to_string(&path).unwrap(),"replacement editor bytes\n");
    }

    #[test]
    fn invalid_or_oversize_ignore_text_is_never_overwritten() {
        let temporary=tempfile::tempdir().unwrap();
        let path=temporary.path().join(".gitignore");
        for bytes in [vec![0xff,0x00],vec![b'#';IGNORE_LIMIT as usize]] {
            fs::write(&path,&bytes).unwrap();
            match IgnoreSnapshot::read(temporary.path()) {
                Ok(snapshot) => assert!(snapshot.append("/target.txt").is_err()),
                Err(_) => (),
            }
            assert_eq!(fs::read(&path).unwrap(),bytes);
        }
    }
}
