use std::{
    fs::{File, OpenOptions},
    io,
    mem::{size_of, zeroed},
    os::windows::{
        ffi::OsStrExt,
        fs::{MetadataExt, OpenOptionsExt},
        io::{AsRawHandle, FromRawHandle, OwnedHandle},
    },
    path::{Path, PathBuf},
    ptr::{null, null_mut},
};
use windows_sys::Win32::{
    Foundation::{GlobalFree, LocalFree, HANDLE, INVALID_HANDLE_VALUE},
    Security::{Authorization::*, Cryptography::*, *},
    Storage::FileSystem::*,
    System::{
        Com::CoTaskMemFree,
        DataExchange::*,
        Diagnostics::ToolHelp::*,
        JobObjects::*,
        Memory::*,
        SystemServices::{ACCESS_ALLOWED_ACE_TYPE, ACCESS_DENIED_ACE_TYPE},
        Threading::*,
    },
    UI::{Shell::*, WindowsAndMessaging::*},
};

fn wide(value: &std::ffi::OsStr) -> Vec<u16> {
    value.encode_wide().chain(Some(0)).collect()
}
unsafe fn owned(handle: HANDLE) -> io::Result<OwnedHandle> {
    if handle.is_null() || handle == INVALID_HANDLE_VALUE {
        Err(io::Error::last_os_error())
    } else {
        Ok(OwnedHandle::from_raw_handle(handle))
    }
}
struct Local(*mut std::ffi::c_void);
impl Drop for Local {
    fn drop(&mut self) {
        unsafe {
            LocalFree(self.0);
        }
    }
}
unsafe fn sid_string(sid: PSID) -> io::Result<String> {
    let mut value = null_mut();
    if ConvertSidToStringSidW(sid, &mut value) == 0 {
        return Err(io::Error::last_os_error());
    }
    let _memory = Local(value.cast());
    let mut len = 0;
    while *value.add(len) != 0 {
        len += 1;
    }
    String::from_utf16(std::slice::from_raw_parts(value, len))
        .map_err(|_| io::Error::other("用户标识无效"))
}
fn user_sid() -> io::Result<String> {
    unsafe {
        let mut token = null_mut();
        if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) == 0 {
            return Err(io::Error::last_os_error());
        }
        let token = owned(token)?;
        let mut size = 0;
        GetTokenInformation(token.as_raw_handle(), TokenUser, null_mut(), 0, &mut size);
        let mut data = vec![0usize; (size as usize).div_ceil(size_of::<usize>())];
        if GetTokenInformation(
            token.as_raw_handle(),
            TokenUser,
            data.as_mut_ptr().cast(),
            size,
            &mut size,
        ) == 0
        {
            return Err(io::Error::last_os_error());
        }
        sid_string((*(data.as_ptr().cast::<TOKEN_USER>())).User.Sid)
    }
}
fn protect_handle(handle: HANDLE) -> io::Result<()> {
    let sid = user_sid()?;
    let sddl = wide(std::ffi::OsStr::new(&format!(
        "O:{sid}D:P(A;OICI;FA;;;{sid})(A;OICI;FA;;;SY)"
    )));
    unsafe {
        let mut descriptor = null_mut();
        if ConvertStringSecurityDescriptorToSecurityDescriptorW(
            sddl.as_ptr(),
            SDDL_REVISION_1,
            &mut descriptor,
            null_mut(),
        ) == 0
        {
            return Err(io::Error::last_os_error());
        }
        let _memory = Local(descriptor);
        let mut present = 0;
        let mut defaulted = 0;
        let mut acl = null_mut();
        if GetSecurityDescriptorDacl(descriptor, &mut present, &mut acl, &mut defaulted) == 0 {
            return Err(io::Error::last_os_error());
        }
        let mut owner = null_mut();
        if GetSecurityDescriptorOwner(descriptor, &mut owner, &mut defaulted) == 0 {
            return Err(io::Error::last_os_error());
        }
        let code = SetSecurityInfo(
            handle,
            SE_FILE_OBJECT,
            OWNER_SECURITY_INFORMATION
                | DACL_SECURITY_INFORMATION
                | PROTECTED_DACL_SECURITY_INFORMATION,
            owner,
            null_mut(),
            acl,
            null(),
        );
        if code != 0 {
            return Err(io::Error::from_raw_os_error(code as i32));
        }
    }
    Ok(())
}
pub fn protect_path(path: &Path) -> io::Result<()> {
    let file = OpenOptions::new()
        .access_mode(READ_CONTROL | WRITE_DAC | WRITE_OWNER | FILE_READ_ATTRIBUTES)
        .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE)
        .custom_flags(FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT)
        .open(path)?;
    if file.metadata()?.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
        return Err(io::Error::other("配置目录不能是链接"));
    }
    protect_handle(file.as_raw_handle())
}
pub fn protect_file(file: &File) -> io::Result<()> {
    // Reopen the same file identity rather than following a replaceable name.
    let handle = unsafe {
        owned(ReOpenFile(
            file.as_raw_handle(),
            READ_CONTROL | WRITE_DAC | WRITE_OWNER,
            FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
            0,
        ))?
    };
    protect_handle(handle.as_raw_handle())
}
pub fn private_config(path: &Path) -> io::Result<bool> {
    let current = user_sid()?;
    unsafe {
        let mut owner = null_mut();
        let mut acl = null_mut();
        let mut descriptor = null_mut();
        let code = GetNamedSecurityInfoW(
            wide(path.as_os_str()).as_ptr(),
            SE_FILE_OBJECT,
            OWNER_SECURITY_INFORMATION | DACL_SECURITY_INFORMATION,
            &mut owner,
            null_mut(),
            &mut acl,
            null_mut(),
            &mut descriptor,
        );
        if code != 0 {
            return Err(io::Error::from_raw_os_error(code as i32));
        }
        let _memory = Local(descriptor);
        if owner.is_null() || acl.is_null() || sid_string(owner)? != current {
            return Ok(false);
        }
        for index in 0..(*acl).AceCount as u32 {
            let mut ace = null_mut();
            if GetAce(acl, index, &mut ace) == 0 {
                return Err(io::Error::last_os_error());
            }
            let header = &*ace.cast::<ACE_HEADER>();
            if header.AceType == ACCESS_ALLOWED_ACE_TYPE as u8 {
                let allow = &*ace.cast::<ACCESS_ALLOWED_ACE>();
                let sid = sid_string((&allow.SidStart as *const u32).cast_mut().cast())?;
                if sid != current && sid != "S-1-5-18" && sid != "S-1-5-32-544" {
                    return Ok(false);
                }
            } else if header.AceType != ACCESS_DENIED_ACE_TYPE as u8 {
                return Ok(false);
            }
        }
        Ok(true)
    }
}
pub fn local_app_data() -> io::Result<PathBuf> {
    unsafe {
        let mut value = null_mut();
        let status = SHGetKnownFolderPath(&FOLDERID_LocalAppData, 0, null_mut(), &mut value);
        if status < 0 {
            return Err(io::Error::other("无法读取Windows应用目录"));
        }
        let mut len = 0;
        while *value.add(len) != 0 {
            len += 1;
        }
        use std::os::windows::ffi::OsStringExt;
        let path = std::ffi::OsString::from_wide(std::slice::from_raw_parts(value, len));
        CoTaskMemFree(value.cast());
        Ok(PathBuf::from(path))
    }
}
pub fn protect_data(bytes: &[u8], app: &str, encrypt: bool) -> io::Result<Vec<u8>> {
    let data = CRYPT_INTEGER_BLOB {
        cbData: bytes
            .len()
            .try_into()
            .map_err(|_| io::Error::other("配置内容过大"))?,
        pbData: bytes.as_ptr().cast_mut(),
    };
    let entropy = format!("com.gittogether.standalone:{app}:accounts-v1");
    let entropy = CRYPT_INTEGER_BLOB {
        cbData: entropy.len() as u32,
        pbData: entropy.as_ptr().cast_mut(),
    };
    unsafe {
        let mut output: CRYPT_INTEGER_BLOB = zeroed();
        let success = if encrypt {
            CryptProtectData(
                &data,
                null(),
                &entropy,
                null(),
                null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        } else {
            CryptUnprotectData(
                &data,
                null_mut(),
                &entropy,
                null(),
                null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        };
        if success == 0 {
            return Err(io::Error::last_os_error());
        }
        let _memory = Local(output.pbData.cast());
        Ok(std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec())
    }
}

pub struct Job(OwnedHandle);
impl Job {
    pub fn new() -> io::Result<Self> {
        unsafe {
            let job = owned(CreateJobObjectW(null(), null()))?;
            let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = zeroed();
            limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            if SetInformationJobObject(
                job.as_raw_handle(),
                JobObjectExtendedLimitInformation,
                (&limits as *const JOBOBJECT_EXTENDED_LIMIT_INFORMATION).cast(),
                size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            ) == 0
            {
                return Err(io::Error::last_os_error());
            }
            Ok(Self(job))
        }
    }
    pub fn attach(&self, child: &tokio::process::Child) -> io::Result<()> {
        let handle = child
            .raw_handle()
            .ok_or_else(|| io::Error::other("子进程已结束"))?;
        let pid = child.id().ok_or_else(|| io::Error::other("子进程已结束"))?;
        unsafe {
            if AssignProcessToJobObject(self.0.as_raw_handle(), handle) == 0 {
                return Err(io::Error::last_os_error());
            }
            // The child is created suspended, so it cannot launch descendants
            // before it belongs to the job. Resume only its initial thread.
            let snapshot = owned(CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, 0))?;
            let mut entry: THREADENTRY32 = zeroed();
            entry.dwSize = size_of::<THREADENTRY32>() as u32;
            let mut found = Thread32First(snapshot.as_raw_handle(), &mut entry);
            while found != 0 {
                if entry.th32OwnerProcessID == pid {
                    let thread = owned(OpenThread(THREAD_SUSPEND_RESUME, 0, entry.th32ThreadID))?;
                    if ResumeThread(thread.as_raw_handle()) == u32::MAX {
                        return Err(io::Error::last_os_error());
                    }
                    return Ok(());
                }
                found = Thread32Next(snapshot.as_raw_handle(), &mut entry);
            }
            Err(io::Error::other("无法恢复子进程"))
        }
    }
    pub fn terminate(&self) {
        unsafe {
            TerminateJobObject(self.0.as_raw_handle(), 1);
        }
    }
}
pub fn open(target: &str) -> io::Result<()> {
    if target.contains('\0') {
        return Err(io::Error::other("路径无效"));
    }
    let target = wide(std::ffi::OsStr::new(target));
    let verb = wide(std::ffi::OsStr::new("open"));
    let result = unsafe {
        ShellExecuteW(
            null_mut(),
            verb.as_ptr(),
            target.as_ptr(),
            null(),
            null(),
            SW_SHOWNORMAL,
        )
    };
    if result as isize <= 32 {
        return Err(io::Error::other("系统打开失败"));
    }
    Ok(())
}
pub fn copy_files(files: &[PathBuf]) -> io::Result<()> {
    let mut paths = Vec::<u16>::new();
    for path in files {
        paths.extend(wide(path.as_os_str()));
    }
    paths.push(0);
    unsafe {
        let class = wide(std::ffi::OsStr::new("STATIC"));
        let window = CreateWindowExW(
            0,
            class.as_ptr(),
            null(),
            0,
            0,
            0,
            0,
            0,
            HWND_MESSAGE,
            null_mut(),
            null_mut(),
            null(),
        );
        if window.is_null() {
            return Err(io::Error::last_os_error());
        }
        if OpenClipboard(window) == 0 {
            DestroyWindow(window);
            return Err(io::Error::last_os_error());
        }
        let result = (|| {
            if EmptyClipboard() == 0 {
                return Err(io::Error::last_os_error());
            }
            let memory = GlobalAlloc(
                GMEM_MOVEABLE | GMEM_ZEROINIT,
                size_of::<DROPFILES>() + paths.len() * 2,
            );
            if memory.is_null() {
                return Err(io::Error::last_os_error());
            }
            let ptr = GlobalLock(memory);
            if ptr.is_null() {
                GlobalFree(memory);
                return Err(io::Error::last_os_error());
            }
            let header = ptr.cast::<DROPFILES>();
            (*header).pFiles = size_of::<DROPFILES>() as u32;
            (*header).fWide = 1;
            std::ptr::copy_nonoverlapping(
                paths.as_ptr(),
                (ptr as *mut u8).add(size_of::<DROPFILES>()).cast::<u16>(),
                paths.len(),
            );
            GlobalUnlock(memory);
            if SetClipboardData(15 /* CF_HDROP */, memory).is_null() {
                GlobalFree(memory);
                return Err(io::Error::last_os_error());
            }
            Ok(()) // Clipboard owns the memory after SetClipboardData.
        })();
        CloseClipboard();
        DestroyWindow(window);
        result
    }
}
