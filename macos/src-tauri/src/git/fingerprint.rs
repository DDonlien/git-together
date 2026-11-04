use crate::{
    platform,
    util::{self, Result},
};
use sha2::{Digest, Sha256};
use std::{
    collections::{HashMap, VecDeque},
    fs::{self, Metadata, OpenOptions},
    io::{self, Read},
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
};
use tokio_util::sync::CancellationToken;

const CACHE_LIMIT: usize = 16_384;

struct CachedFile {
    metadata: String,
    content: [u8; 32],
}

#[derive(Default)]
struct FileCache {
    files: HashMap<PathBuf, CachedFile>,
    order: VecDeque<PathBuf>,
}

impl FileCache {
    fn get(&self, path: &Path, metadata: &str) -> Option<[u8; 32]> {
        self.files
            .get(path)
            .filter(|entry| entry.metadata == metadata)
            .map(|entry| entry.content)
    }

    fn insert(&mut self, path: PathBuf, metadata: String, content: [u8; 32]) {
        if !self.files.contains_key(&path) {
            if self.files.len() >= CACHE_LIMIT {
                if let Some(oldest) = self.order.pop_front() {
                    self.files.remove(&oldest);
                }
            }
            self.order.push_back(path.clone());
        }
        self.files.insert(path, CachedFile { metadata, content });
    }
}

fn cache() -> &'static Mutex<FileCache> {
    static CACHE: OnceLock<Mutex<FileCache>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(FileCache::default()))
}

fn check_cancel(cancel: &Option<CancellationToken>) -> Result<()> {
    if cancel.as_ref().is_some_and(CancellationToken::is_cancelled) {
        Err("仓库读取已取消。".into())
    } else {
        Ok(())
    }
}

fn unchanged(path: &Path, expected: &str) -> Result<()> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if platform::metadata_key(&metadata) == expected => Ok(()),
        Ok(_) | Err(_) => Err("本地文件读取期间发生变化，请刷新后重试。".into()),
    }
}

fn file_content(
    path: &Path,
    metadata: &Metadata,
    cancel: &Option<CancellationToken>,
    verify_content: bool,
) -> Result<[u8; 32]> {
    check_cancel(cancel)?;
    let key = platform::metadata_key(metadata);
    let cached = if verify_content {
        None
    } else {
        cache()
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .get(path, &key)
    };
    if let Some(content) = cached {
        unchanged(path, &key)?;
        return Ok(content);
    }

    let mut file = platform::open_regular(path, OpenOptions::new().read(true))
        .map_err(|_| "无法读取本地更改，请检查文件后重试。")?;
    if platform::metadata_key(&file.metadata().map_err(|_| "无法读取本地更改。")?) != key {
        return Err("本地文件读取期间发生变化，请刷新后重试。".into());
    }
    let mut hash = Sha256::new();
    let mut buffer = [0_u8; 128 * 1024];
    loop {
        check_cancel(cancel)?;
        let read = file
            .read(&mut buffer)
            .map_err(|_| "无法读取本地更改，请检查文件后重试。")?;
        if read == 0 {
            break;
        }
        hash.update(&buffer[..read]);
    }
    if platform::metadata_key(&file.metadata().map_err(|_| "无法读取本地更改。")?) != key {
        return Err("本地文件读取期间发生变化，请刷新后重试。".into());
    }
    check_cancel(cancel)?;
    unchanged(path, &key)?;
    let content: [u8; 32] = hash.finalize().into();
    cache()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .insert(path.to_owned(), key, content);
    Ok(content)
}

#[cfg(unix)]
fn mode(metadata: &Metadata) -> u32 {
    use std::os::unix::fs::MetadataExt;
    metadata.mode()
}

#[cfg(windows)]
fn mode(metadata: &Metadata) -> u32 {
    use std::os::windows::fs::MetadataExt;
    metadata.file_attributes()
}

#[cfg(not(any(unix, windows)))]
fn mode(metadata: &Metadata) -> u32 {
    u32::from(metadata.permissions().readonly())
}

fn field(hash: &mut Sha256, bytes: &[u8]) {
    hash.update((bytes.len() as u64).to_be_bytes());
    hash.update(bytes);
}

fn snapshot(
    root: &Path,
    head: &str,
    status: &str,
    index: &str,
    paths: &[String],
    cancel: &Option<CancellationToken>,
    verify_content: bool,
) -> Result<String> {
    let mut hash = Sha256::new();
    for value in [head.as_bytes(), status.as_bytes(), index.as_bytes()] {
        field(&mut hash, value);
    }
    for path in paths {
        check_cancel(cancel)?;
        util::file_path(path)?;
        field(&mut hash, path.as_bytes());
        let target = root.join(path);
        match fs::symlink_metadata(&target) {
            Err(error) if error.kind() == io::ErrorKind::NotFound => field(&mut hash, b"missing"),
            Err(_) => return Err("无法完整检查本地更改，请刷新后重试。".into()),
            Ok(metadata) => {
                field(&mut hash, &mode(&metadata).to_be_bytes());
                if platform::is_link(&metadata) {
                    let key = platform::metadata_key(&metadata);
                    let link =
                        fs::read_link(&target).map_err(|_| "无法读取本地链接，请刷新后重试。")?;
                    unchanged(&target, &key)?;
                    field(&mut hash, b"link");
                    field(&mut hash, link.as_os_str().as_encoded_bytes());
                } else if metadata.is_file() {
                    field(&mut hash, b"file");
                    field(
                        &mut hash,
                        &file_content(&target, &metadata, cancel, verify_content)?,
                    );
                } else {
                    // Preserve the previous conservative check for submodules and
                    // special files, which cannot be read as regular file bytes.
                    field(&mut hash, b"other");
                    field(&mut hash, platform::metadata_key(&metadata).as_bytes());
                }
            }
        }
    }
    Ok(format!("{:x}", hash.finalize()))
}

pub(super) async fn change_key(
    root: &Path,
    head: &str,
    status: &str,
    index: &str,
    paths: Vec<String>,
    cancel: Option<CancellationToken>,
    verify_content: bool,
) -> Result<String> {
    let root = root.to_owned();
    let head = head.to_owned();
    let status = status.to_owned();
    let index = index.to_owned();
    tokio::task::spawn_blocking(move || {
        snapshot(
            &root,
            &head,
            &status,
            &index,
            &paths,
            &cancel,
            verify_content,
        )
    })
    .await
    .map_err(|_| "本地更改检查未完成。")?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn metadata_changes_do_not_mask_content_changes() {
        let temporary = tempfile::tempdir().unwrap();
        let root = temporary.path();
        let path = root.join("modified.txt");
        fs::write(&path, b"first").unwrap();
        let paths = vec!["modified.txt".into()];
        let fingerprint =
            || snapshot(root, "head", "status", "index", &paths, &None, false).unwrap();
        let original = fingerprint();
        let modified = fs::metadata(&path).unwrap().modified().unwrap();

        // Restoring the same modification time can change ctime without
        // changing the file. That is not a different commit snapshot.
        let file = OpenOptions::new().write(true).open(&path).unwrap();
        file.set_times(fs::FileTimes::new().set_modified(modified))
            .unwrap();
        assert_eq!(fingerprint(), original);

        // A same-length edit with its modification time restored must still
        // be caught; ctime remains part of the content-cache invalidation key.
        fs::write(&path, b"other").unwrap();
        let file = OpenOptions::new().write(true).open(&path).unwrap();
        file.set_times(fs::FileTimes::new().set_modified(modified))
            .unwrap();
        assert_ne!(fingerprint(), original);
    }

    #[test]
    fn operation_verification_reads_content_even_if_cached_metadata_matches() {
        let temporary = tempfile::tempdir().unwrap();
        let root = temporary.path();
        let path = root.join("modified.txt");
        fs::write(&path, b"first").unwrap();
        let paths = vec!["modified.txt".into()];
        let original = snapshot(root, "head", "status", "index", &paths, &None, false).unwrap();
        fs::write(&path, b"other").unwrap();

        // Simulate a filesystem returning unchanged metadata for different
        // contents. A write operation must not trust the observation cache.
        let metadata = platform::metadata_key(&fs::symlink_metadata(&path).unwrap());
        cache()
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .files
            .get_mut(&path)
            .unwrap()
            .metadata = metadata;
        assert_eq!(
            snapshot(root, "head", "status", "index", &paths, &None, false).unwrap(),
            original
        );
        assert_ne!(
            snapshot(root, "head", "status", "index", &paths, &None, true).unwrap(),
            original
        );
    }

    #[cfg(unix)]
    #[test]
    fn link_target_and_file_mode_remain_part_of_the_snapshot() {
        use std::os::unix::fs::{symlink, PermissionsExt};
        let temporary = tempfile::tempdir().unwrap();
        let root = temporary.path();
        let path = root.join("file");
        fs::write(&path, b"content").unwrap();
        fs::set_permissions(&path, fs::Permissions::from_mode(0o644)).unwrap();
        let link = root.join("link");
        symlink("first", &link).unwrap();
        let paths = vec!["file".into(), "link".into()];
        let fingerprint =
            || snapshot(root, "head", "status", "index", &paths, &None, false).unwrap();
        let original = fingerprint();
        fs::remove_file(&link).unwrap();
        symlink("other", &link).unwrap();
        let changed_link = fingerprint();
        assert_ne!(changed_link, original);
        fs::set_permissions(&path, fs::Permissions::from_mode(0o755)).unwrap();
        assert_ne!(fingerprint(), changed_link);
    }

    #[test]
    fn cancellation_stops_snapshot_reads() {
        let token = CancellationToken::new();
        token.cancel();
        let temporary = tempfile::tempdir().unwrap();
        assert!(snapshot(
            temporary.path(),
            "head",
            "status",
            "index",
            &["file".into()],
            &Some(token),
            true
        )
        .unwrap_err()
        .contains("取消"));
    }
}
