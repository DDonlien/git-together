use crate::util::Result;
use std::{fs, io, path::{Path, PathBuf}};
#[cfg(windows)]
mod windows;
pub fn home() -> Result<PathBuf> {
    let variable = if cfg!(windows) { "USERPROFILE" } else { "HOME" };
    std::env::var_os(variable)
        .map(PathBuf::from)
        .ok_or("无法读取用户目录。".into())
}
pub(crate) fn device_name() -> String {
    #[cfg(unix)]
    {
        let mut bytes = [0u8; 256];
        if unsafe { libc::gethostname(bytes.as_mut_ptr().cast(), bytes.len()) } == 0 {
            if let Ok(name) = std::ffi::CStr::from_bytes_until_nul(&bytes) {
                let value = name.to_string_lossy();
                if !value.is_empty() { return value.chars().take(120).collect(); }
            }
        }
    }
    std::env::var("COMPUTERNAME").or_else(|_| std::env::var("HOSTNAME")).ok().filter(|s|!s.is_empty()).unwrap_or_else(||"我的电脑".into()).chars().take(120).collect()
}
pub fn private_directory(path: &Path) -> io::Result<()> {
    fs::create_dir_all(path)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o700))?;
    }
    #[cfg(windows)]
    windows::protect_path(path)?;
    Ok(())
}
pub fn private_file(file: &fs::File) -> io::Result<()> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        file.set_permissions(fs::Permissions::from_mode(0o600))?;
    }
    #[cfg(windows)]
    windows::protect_file(file)?;
    Ok(())
}
pub fn private_config(path: &Path, metadata: &fs::Metadata) -> io::Result<bool> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        let _ = path;
        Ok(metadata.mode() & 0o077 == 0 && metadata.uid() == unsafe { libc::geteuid() })
    }
    #[cfg(windows)]
    {
        let _ = metadata;
        windows::private_config(path)
    }
}
#[cfg(windows)]
pub fn protect_data(bytes: &[u8], app: &str, encrypt: bool) -> io::Result<Vec<u8>> {
    windows::protect_data(bytes, app, encrypt)
}
