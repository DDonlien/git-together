use regex::Regex;
use serde_json::{json, Value};
use std::{error::Error, io};
use tauri_plugin_updater::Error as UpdaterError;

pub struct UpdateFailure {
    pub message: &'static str,
    pub details: Value,
}
impl UpdateFailure {
    pub fn new(error: &UpdaterError, method: &str) -> Self {
        let mut chain = Vec::new();
        // UpdaterError::Io is transparent, so its source() can skip the wrapped
        // io::Error. Read that errno before walking nested tar/network causes.
        let mut system_code = match error {
            UpdaterError::Io(e) => e.raw_os_error(),
            _ => None,
        };
        let mut cause: Option<&(dyn Error + 'static)> = Some(error);
        while let Some(error) = cause {
            if let Some(io) = error.downcast_ref::<io::Error>() {
                system_code = io.raw_os_error().or(system_code);
            }
            chain.push(error.to_string());
            cause = error.source();
        }
        let extracting =
            method == "install" && chain.iter().any(|s| s.contains("failed to unpack"));
        let metadata = extracting && chain.iter().any(|s| s.contains("`._GitTogether.app`"));
        let error_type = match error {
            UpdaterError::Io(_) => "Io",
            UpdaterError::Reqwest(_) => "Reqwest",
            UpdaterError::Minisign(_)
            | UpdaterError::Base64(_)
            | UpdaterError::SignatureUtf8(_) => "Signature",
            UpdaterError::SignedVersionMismatch { .. } | UpdaterError::MissingSignedVersion => {
                "Version"
            }
            UpdaterError::PreviousAppNotRestored(_) => "Restore",
            _ => "Updater",
        };
        let (code, message) = if metadata {
            ("ERR_UPDATER_INVALID_ARCHIVE", "更新包包含不兼容的 macOS 元数据，无法解压安装。请重新检查并下载更新，或使用完整安装包。")
        } else {
            match error {
                UpdaterError::Reqwest(e) if e.is_timeout() => {
                    ("ETIMEDOUT", "更新请求超时，请检查网络后重试。")
                }
                UpdaterError::Reqwest(e) if e.status().is_some() => {
                    ("ERR_UPDATER_HTTP", "更新服务返回错误，请稍后重试。")
                }
                UpdaterError::Reqwest(_) => {
                    ("connection", "无法连接更新服务，请检查网络和代理后重试。")
                }
                UpdaterError::Minisign(_)
                | UpdaterError::Base64(_)
                | UpdaterError::SignatureUtf8(_) => (
                    "ERR_UPDATER_INVALID_SIGNATURE",
                    "更新包签名校验失败，未安装。请重新下载更新。",
                ),
                UpdaterError::SignedVersionMismatch { .. } | UpdaterError::MissingSignedVersion => {
                    (
                        "ERR_UPDATER_VERSION",
                        "更新包签名与发布版本不匹配，未安装。请重新检查更新。",
                    )
                }
                UpdaterError::InvalidUpdaterFormat | UpdaterError::BinaryNotFoundInArchive => (
                    "ERR_UPDATER_INVALID_ARCHIVE",
                    "更新包格式不适用于当前应用，未安装。请重新下载更新。",
                ),
                UpdaterError::TempDirNotOnSameMountPoint => {
                    ("EXDEV", "无法在应用所在磁盘准备更新，请检查该磁盘后重试。")
                }
                UpdaterError::TempDirNotFound => (
                    "ERR_UPDATER_TEMP_DIR",
                    "无法创建更新临时目录，请检查磁盘空间和临时目录后重试。",
                ),
                UpdaterError::PreviousAppNotRestored(_) => (
                    "ERR_UPDATER_RESTORE",
                    "更新替换失败，旧应用未能恢复到原位置。已保留备份，请使用完整安装包恢复。",
                ),
                #[cfg(windows)]
                UpdaterError::Io(e) => match system_code {
                    Some(5) => ("EACCES", "系统拒绝写入更新文件，请检查应用目录权限后重试。"),
                    Some(32) | Some(33) => (
                        "EBUSY",
                        "更新文件正在被其他程序占用，请关闭相关程序后重试。",
                    ),
                    Some(112) | Some(39) => {
                        ("ENOSPC", "磁盘空间不足，无法安装更新。请释放空间后重试。")
                    }
                    Some(19) => ("EROFS", "应用所在位置只读，请将应用放到可写位置后重试。"),
                    Some(17) => (
                        "EXDEV",
                        "更新临时目录与应用不在同一磁盘，请使用完整安装包。",
                    ),
                    Some(2) | Some(3) => (
                        "ENOENT",
                        "更新所需文件或应用目录不存在，请使用完整安装包恢复。",
                    ),
                    _ if e.kind() == io::ErrorKind::InvalidData
                        || e.kind() == io::ErrorKind::UnexpectedEof =>
                    {
                        (
                            "ERR_UPDATER_INVALID_ARCHIVE",
                            "更新包损坏或格式不兼容，请重新下载更新。",
                        )
                    }
                    _ if e.kind() == io::ErrorKind::PermissionDenied => (
                        "permission",
                        "系统拒绝更新文件操作，请检查应用目录权限后重试。",
                    ),
                    _ => (
                        "unknown",
                        "Windows更新安装失败，请查看日志后重试或使用完整安装包。",
                    ),
                },
                #[cfg(not(windows))]
                UpdaterError::Io(e) => match system_code {
                    Some(libc::EACCES) => (
                        "EACCES",
                        "系统拒绝写入更新文件，请检查应用目录写入权限或 macOS 应用访问限制后重试。",
                    ),
                    Some(libc::EPERM) => (
                        "EPERM",
                        "系统阻止了更新文件操作，请检查 macOS 应用访问限制及目录状态后重试。",
                    ),
                    Some(libc::ENOSPC) => {
                        ("ENOSPC", "磁盘空间不足，无法安装更新。请释放空间后重试。")
                    }
                    Some(libc::EROFS) => {
                        ("EROFS", "应用所在位置只读，请将应用放到可写位置后重试。")
                    }
                    Some(libc::EXDEV) => (
                        "EXDEV",
                        "更新临时目录与应用不在同一文件系统，无法替换。请使用完整安装包。",
                    ),
                    Some(libc::ENOENT) => (
                        "ENOENT",
                        "更新所需文件或应用目录不存在，请使用完整安装包恢复。",
                    ),
                    Some(libc::EBUSY) => ("EBUSY", "更新文件正在被占用，请稍后重试。"),
                    Some(libc::EISDIR) | Some(libc::ENOTDIR) => (
                        "ERR_UPDATER_INVALID_ARCHIVE",
                        "更新包的文件与目录结构不兼容，请重新下载更新。",
                    ),
                    Some(libc::EIO) => ("EIO", "磁盘读写失败，无法安装更新。请检查磁盘后重试。"),
                    _ if e.kind() == io::ErrorKind::InvalidData
                        || e.kind() == io::ErrorKind::UnexpectedEof =>
                    {
                        (
                            "ERR_UPDATER_INVALID_ARCHIVE",
                            "更新包损坏或目录结构不兼容，请重新下载更新。",
                        )
                    }
                    _ if e.kind() == io::ErrorKind::PermissionDenied => (
                        "permission",
                        "系统拒绝更新文件操作，请检查应用访问限制后重试。",
                    ),
                    _ => (
                        "unknown",
                        "更新文件操作失败，具体系统错误已写入日志。请查看日志后重试。",
                    ),
                },
                UpdaterError::ReleaseNotFound
                | UpdaterError::Serialization(_)
                | UpdaterError::Semver(_)
                | UpdaterError::TargetNotFound(_)
                | UpdaterError::TargetsNotFound(_) => (
                    "ERR_UPDATER_INVALID_RELEASE_FEED",
                    "更新发布信息无效或缺少当前平台的安装包，请稍后重新检查。",
                ),
                _ => (
                    "unknown",
                    match method {
                        "check" => "无法配置或检查更新，具体错误已写入日志。",
                        "download" => "更新下载失败，具体错误已写入日志。请重试。",
                        _ => "更新安装失败，具体错误已写入日志。请查看日志后重试。",
                    },
                ),
            }
        };
        // The native updater can include temporary paths and request URLs in its
        // error chain. Keep the actual cause/errno while removing those locations.
        let locations = Regex::new(r#"`/[^`]*`|"/[^"]*"|https?://[^\s`"']+|/(?:Users|var|private|Volumes|Applications|tmp)/[^\n`"']+"#).unwrap();
        let chain: Vec<String> = chain
            .into_iter()
            .take(8)
            .map(|s| {
                locations
                    .replace_all(&s, "<location>")
                    .chars()
                    .take(1024)
                    .collect()
            })
            .collect();
        let mut details = json!({"code":code,"updaterError":error_type,"updateStage":if extracting {"extract"} else {method},"errorChain":chain});
        if let Some(code) = system_code {
            details["systemCode"] = json!(code);
        }
        if let UpdaterError::Reqwest(e) = error {
            if let Some(status) = e.status() {
                details["httpStatus"] = json!(status.as_u16());
            }
        }
        Self { message, details }
    }
}
