use crate::util::Result;
use std::{
    fs, io,
    path::{Path, PathBuf},
};

#[cfg(windows)]
mod windows;

pub fn home() -> Result<PathBuf> {
    let variable = if cfg!(windows) { "USERPROFILE" } else { "HOME" };
    std::env::var_os(variable)
        .map(PathBuf::from)
        .ok_or("无法读取用户目录。".into())
}

pub fn data_root() -> Result<PathBuf> {
    #[cfg(windows)]
    return Ok(windows::local_app_data()
        .map_err(|_| "无法读取Windows应用目录。")?
        .join("GitTogether-Standalone-Demo"));
    #[cfg(target_os = "macos")]
    return Ok(home()?.join("Library/Application Support/GitTogether-Standalone-Demo"));
    #[cfg(not(any(windows, target_os = "macos")))]
    return Ok(home()?.join(".local/share/GitTogether-Standalone-Demo"));
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

pub fn protect_file_path(path: &Path) -> io::Result<()> {
    private_file(&open_regular(path, &mut fs::OpenOptions::new().read(true))?)
}

/// Preserve no-follow reads on both platforms, including Windows reparse points.
pub fn open_regular(path: &Path, options: &mut fs::OpenOptions) -> io::Result<fs::File> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NOFOLLOW).mode(0o600);
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        options.custom_flags(windows_sys::Win32::Storage::FileSystem::FILE_FLAG_OPEN_REPARSE_POINT);
    }
    let file = options.open(path)?;
    let metadata = file.metadata()?;
    if !metadata.is_file() || is_link(&metadata) {
        return Err(io::Error::new(io::ErrorKind::InvalidInput, "不是普通文件"));
    }
    Ok(file)
}

pub fn is_link(metadata: &fs::Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        metadata.file_attributes()
            & windows_sys::Win32::Storage::FileSystem::FILE_ATTRIBUTE_REPARSE_POINT
            != 0
    }
    #[cfg(not(windows))]
    {
        metadata.file_type().is_symlink()
    }
}

pub fn executable(metadata: &fs::Metadata) -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        metadata.is_file() && metadata.permissions().mode() & 0o111 != 0
    }
    #[cfg(not(unix))]
    {
        metadata.is_file()
    }
}

pub fn file_mode(metadata: &fs::Metadata) -> u32 {
    if cfg!(unix) && executable(metadata) {
        0o755
    } else {
        0o644
    }
}

pub fn metadata_key(metadata: &fs::Metadata) -> String {
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        format!(
            "{}:{}:{}:{}:{}:{}:{}",
            metadata.mode(),
            metadata.len(),
            metadata.mtime(),
            metadata.mtime_nsec(),
            metadata.ctime(),
            metadata.ctime_nsec(),
            metadata.ino()
        )
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        format!(
            "{}:{}:{}:{}",
            metadata.file_attributes(),
            metadata.file_size(),
            metadata.last_write_time(),
            metadata.creation_time()
        )
    }
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

pub fn copy_link(source: &Path, destination: &Path) -> io::Result<()> {
    let target = fs::read_link(source)?;
    #[cfg(unix)]
    return std::os::unix::fs::symlink(target, destination);
    #[cfg(windows)]
    {
        if fs::metadata(source)?.is_dir() {
            std::os::windows::fs::symlink_dir(target, destination)
        } else {
            std::os::windows::fs::symlink_file(target, destination)
        }
    }
}

pub struct ChildGroup {
    #[cfg(windows)]
    job: windows::Job,
}
impl ChildGroup {
    pub fn prepare(command: &mut tokio::process::Command) -> Result<Self> {
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            command.as_std_mut().process_group(0);
            Ok(Self {})
        }
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.as_std_mut().creation_flags(
                windows_sys::Win32::System::Threading::CREATE_NO_WINDOW
                    | windows_sys::Win32::System::Threading::CREATE_SUSPENDED,
            );
            Ok(Self {
                job: windows::Job::new().map_err(|_| "无法创建子进程控制组。")?,
            })
        }
    }
    pub fn attach(&self, child: &tokio::process::Child) -> Result<()> {
        #[cfg(windows)]
        self.job
            .attach(child)
            .map_err(|_| "无法接管子进程，请稍后重试。")?;
        #[cfg(unix)]
        let _ = child;
        Ok(())
    }
    pub fn terminate(&self, pid: u32) {
        #[cfg(unix)]
        if pid > 0 {
            unsafe {
                libc::kill(-(pid as i32), libc::SIGKILL);
            }
        }
        #[cfg(windows)]
        {
            let _ = pid;
            self.job.terminate();
        }
    }
}

#[cfg(windows)]
pub fn protect_data(bytes: &[u8], app: &str, encrypt: bool) -> io::Result<Vec<u8>> {
    windows::protect_data(bytes, app, encrypt)
}
#[cfg(windows)]
pub fn open(target: &str) -> Result<()> {
    windows::open(target).map_err(|_| "系统未打开这个文件或页面。".into())
}
#[cfg(windows)]
pub fn copy_files(files: &[PathBuf]) -> Result<()> {
    windows::copy_files(files).map_err(|_| "无法把日志文件复制到剪贴板。".into())
}
