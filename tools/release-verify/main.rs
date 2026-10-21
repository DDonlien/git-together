// Validates the unchanged 0.33.0 acceptance rules; no application backend is linked.
mod legacy_archive;
use base64::{engine::general_purpose::STANDARD, Engine};
use minisign_verify::{PublicKey, Signature};
fn run() -> Result<(), String> {
    let a: Vec<_> = std::env::args().skip(1).collect();
    if a.len() != 4 && a.len() != 5 {
        return Err("需要公开配置、更新包、签名文件和版本。".into());
    }
    let config: serde_json::Value =
        serde_json::from_slice(&std::fs::read(&a[0]).map_err(|_| "无法读取公开更新配置。")?)
            .map_err(|_| "公开更新配置无效。")?;
    let key = config["plugins"]["updater"]["pubkey"]
        .as_str()
        .ok_or("更新公钥缺失。")?;
    let key = String::from_utf8(STANDARD.decode(key).map_err(|_| "更新公钥无效。")?)
        .map_err(|_| "更新公钥无效。")?;
    let sig = std::fs::read_to_string(&a[2]).map_err(|_| "无法读取更新签名。")?;
    let sig = String::from_utf8(
        STANDARD
            .decode(sig.trim())
            .map_err(|_| "更新签名编码无效。")?,
    )
    .map_err(|_| "更新签名编码无效。")?;
    let signature = Signature::decode(&sig).map_err(|_| "更新签名无效。")?;
    let key = PublicKey::decode(&key).map_err(|_| "更新公钥无效。")?;
    let bytes = std::fs::read(&a[1]).map_err(|_| "更新包无法读取。")?;
    key.verify(&bytes, &signature, true)
        .map_err(|_| "更新包签名校验失败。")?;
    if !signature
        .trusted_comment()
        .split('\t')
        .any(|f| f.strip_prefix("version:") == Some(&a[3]))
    {
        return Err("更新签名没有绑定本次版本。".into());
    }
    let verified = if a
        .get(4)
        .is_some_and(|platform| platform.starts_with("windows-"))
    {
        legacy_archive::verify_windows_installer(&bytes)
    } else {
        legacy_archive::verify_macos(&bytes)
    };
    verified.map_err(|e| format!("更新包解压结构校验失败：{e}"))?;
    Ok(())
}
fn main() {
    match run() {
        Ok(()) => println!("Tauri 更新包签名、版本及解压结构校验通过。"),
        Err(e) => {
            eprintln!("{e}");
            std::process::exit(1);
        }
    }
}
