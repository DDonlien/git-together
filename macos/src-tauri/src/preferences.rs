use crate::util::{self, Result};
use rusty_leveldb::{LdbIterator, Options, DB};
use serde_json::Value;
use std::{fs, os::unix::fs::PermissionsExt, path::Path};
pub fn legacy(root: &Path) -> Result<Option<String>> {
    let cached = root.join("preferences-migration-v1.json");
    if cached.exists() {
        let bytes = fs::read(cached).map_err(|_| "旧偏好迁移记录无法读取。")?;
        if bytes.len() > 2_000_000 {
            return Err("旧偏好迁移记录过大。".into());
        }
        let v: Value = serde_json::from_slice(&bytes).map_err(|_| "旧偏好迁移记录无效。")?;
        return Ok(v["preferences"].as_str().map(str::to_owned));
    }
    let source = root.join("Local Storage/leveldb");
    if !source.exists() {
        return Ok(None);
    }
    let temporary = tempfile::Builder::new()
        .prefix("gittogether-preferences-")
        .tempdir()
        .map_err(|_| "无法创建偏好迁移副本。")?;
    let mut bytes = 0;
    // Read a private snapshot. Never lock, compact or modify Electron's live DB.
    for entry in fs::read_dir(&source).map_err(|_| "旧偏好目录不可读取。")? {
        let entry = entry.map_err(|_| "旧偏好目录读取未完成。")?;
        let m = fs::symlink_metadata(entry.path()).map_err(|_| "旧偏好文件不可读取。")?;
        let name = entry.file_name();
        let s = name.to_string_lossy();
        if !m.is_file() || m.file_type().is_symlink() || s == "LOCK" || s.starts_with("LOG") {
            continue;
        }
        if !(s == "CURRENT"
            || s.starts_with("MANIFEST-")
            || s.ends_with(".ldb")
            || s.ends_with(".log"))
        {
            continue;
        }
        bytes += m.len();
        if bytes > 32_000_000 {
            return Err("旧偏好目录超过迁移读取上限；原目录未修改。".into());
        }
        fs::copy(entry.path(), temporary.path().join(name))
            .map_err(|_| "旧偏好副本读取未完成。")?;
    }
    let mut db = DB::open(
        temporary.path(),
        Options {
            create_if_missing: false,
            ..Default::default()
        },
    )
    .map_err(|_| "旧偏好副本暂不可读取；原目录未修改。")?;
    let mut iter = db.new_iter().map_err(|_| "旧偏好索引暂不可读取。")?;
    let mut found = None;
    while iter.advance() {
        let Some((key, value)) = iter.current() else {
            continue;
        };
        if !key.starts_with(b"_file://")
            || !key.ends_with(b"\x01gittogether.preferences.v2")
            || value.is_empty()
            || value.len() > 2_000_000
        {
            continue;
        }
        let decoded = match value[0] {
            1 => value[1..]
                .iter()
                .map(|b| char::from(*b))
                .collect::<String>(),
            0 => {
                if (value.len() - 1) % 2 != 0 {
                    continue;
                }
                let units: Vec<_> = value[1..]
                    .chunks_exact(2)
                    .map(|b| u16::from_le_bytes([b[0], b[1]]))
                    .collect();
                let Ok(s) = String::from_utf16(&units) else {
                    continue;
                };
                s
            }
            _ => continue,
        };
        if serde_json::from_str::<Value>(&decoded).is_ok_and(|v| v.is_object()) {
            found = Some(decoded);
        }
    }
    if let Some(value) = &found {
        fs::create_dir_all(root).map_err(|_| "偏好迁移记录目录不可写。")?;
        let mut file =
            tempfile::NamedTempFile::new_in(root).map_err(|_| "偏好迁移记录无法保存。")?;
        file.as_file()
            .set_permissions(fs::Permissions::from_mode(0o600))
            .map_err(|_| "偏好迁移记录保护失败。")?;
        use std::io::Write;
        file.write_all(json_record(value).as_bytes())
            .and_then(|_| file.as_file().sync_all())
            .map_err(|_| "偏好迁移记录无法保存。")?;
        file.persist(cached).map_err(|_| "偏好迁移记录无法发布。")?;
    }
    Ok(found)
}
fn json_record(value: &str) -> String {
    serde_json::json!({"version":1,"preferences":value,"migratedAt":util::iso()}).to_string()
}
