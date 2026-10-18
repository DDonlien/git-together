use crate::util::Result;
#[cfg(not(windows))]
use aes_gcm::{
    aead::{rand_core::RngCore, Aead, OsRng},
    Aes256Gcm, KeyInit,
};
#[cfg(not(windows))]
use cbc::cipher::{block_padding::Pkcs7, BlockDecryptMut, KeyIvInit};
use serde_json::Value;
#[cfg(not(windows))]
use sha2::{Digest, Sha256};
use std::{fs, path::Path};

#[cfg(target_os = "macos")]
fn password(app: &str, create: bool) -> Result<Vec<u8>> {
    // Preserve Electron's keychain identity. No prompts or unlock requests are
    // initiated by migration; inaccessible originals are left byte-for-byte intact.
    #[link(name = "Security", kind = "framework")]
    extern "C" {
        fn SecKeychainSetUserInteractionAllowed(allowed: bool) -> i32;
    }
    unsafe {
        SecKeychainSetUserInteractionAllowed(false);
    }
    let service = format!("{app} Safe Storage");
    match security_framework::passwords::get_generic_password(&service, app) {
        Ok(value) => Ok(value),
        Err(error) if create && error.code() == -25300 => {
            use base64::{engine::general_purpose::STANDARD, Engine};
            let mut random = [0u8; 32];
            OsRng.fill_bytes(&mut random);
            let value = STANDARD.encode(random).into_bytes();
            security_framework::passwords::set_generic_password(&service, app, &value)
                .map_err(|_| "无法创建系统加密存储；没有保存明文账号。")?;
            Ok(value)
        }
        Err(_) => Err("系统加密存储目前不可读取；原账号配置已保留，请稍后重试。".into()),
    }
}
#[cfg(not(any(target_os = "macos", windows)))]
fn password(_: &str, _: bool) -> Result<Vec<u8>> {
    Err("此发布的系统加密存储仅支持macOS。".into())
}

pub fn load(path: &Path, app: &str) -> Result<Option<Value>> {
    let bytes = match fs::read(path) {
        Ok(v) => v,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err("无法读取账号配置；原文件未修改。".into()),
    };
    if bytes.len() > 16_000_000 {
        return Err("账号配置超出可读取范围；原文件未修改。".into());
    }
    #[cfg(windows)]
    let plain = crate::platform::protect_data(
        bytes
            .strip_prefix(b"GTTW1")
            .ok_or("账号配置格式无法识别；原文件未修改。")?,
        app,
        false,
    )
    .map_err(|_| "Windows账号配置无法解密；原文件未修改。")?;
    #[cfg(not(windows))]
    let plain = {
        let secret = password(app, false)?;
        let plain = if bytes.starts_with(b"v10") {
            // Chromium 142/Electron 39: PBKDF2-SHA1, saltysalt, 1003 iterations,
            // AES-128-CBC and a 16-space IV. Read compatibility only; new writes use GCM.
            let mut key = [0u8; 16];
            pbkdf2::pbkdf2_hmac::<sha1::Sha1>(&secret, b"saltysalt", 1003, &mut key);
            cbc::Decryptor::<aes::Aes128>::new(&key.into(), &[b' '; 16].into())
                .decrypt_padded_vec_mut::<Pkcs7>(&bytes[3..])
                .map_err(|_| "旧账号配置无法解密；原文件未修改。")?
        } else if bytes.starts_with(b"GTT1") && bytes.len() >= 32 {
            let key = Sha256::digest(&secret);
            Aes256Gcm::new(&key)
                .decrypt((&bytes[4..16]).into(), &bytes[16..])
                .map_err(|_| "账号配置认证失败；原文件未修改。")?
        } else {
            return Err("账号配置格式无法识别；原文件未修改。".into());
        };
        plain
    };
    serde_json::from_slice(&plain)
        .map(Some)
        .map_err(|_| "账号配置内容无效；原文件未修改。".into())
}
pub fn save(path: &Path, value: &Value) -> Result<()> {
    #[cfg(windows)]
    let bytes = {
        let plain = serde_json::to_vec(value).map_err(|_| "账号配置编码失败。")?;
        let encrypted = crate::platform::protect_data(&plain, "GitTogether", true)
            .map_err(|_| "Windows系统加密失败；没有保存明文账号。")?;
        let mut bytes = b"GTTW1".to_vec();
        bytes.extend(encrypted);
        bytes
    };
    #[cfg(not(windows))]
    let bytes = {
        let secret = password("GitTogether", true)?;
        let key = Sha256::digest(secret);
        let mut nonce = [0u8; 12];
        OsRng.fill_bytes(&mut nonce);
        let data = serde_json::to_vec(value).map_err(|_| "账号配置编码失败。")?;
        let encrypted = Aes256Gcm::new(&key)
            .encrypt((&nonce).into(), data.as_slice())
            .map_err(|_| "账号配置加密失败。")?;
        let mut bytes = b"GTT1".to_vec();
        bytes.extend(nonce);
        bytes.extend(encrypted);
        bytes
    };
    let directory = path.parent().ok_or("账号目录无效。")?;
    crate::platform::private_directory(directory).map_err(|_| "无法保护账号配置目录。")?;
    let mut temporary =
        tempfile::NamedTempFile::new_in(directory).map_err(|_| "无法保存账号配置。")?;
    use std::io::Write;
    crate::platform::private_file(temporary.as_file()).map_err(|_| "无法保护账号配置。")?;
    temporary
        .write_all(&bytes)
        .and_then(|_| temporary.as_file().sync_all())
        .map_err(|_| "无法保存账号配置；原文件未修改。")?;
    temporary
        .persist(path)
        .map_err(|_| "无法发布账号配置；原文件未修改。")?;
    Ok(())
}
