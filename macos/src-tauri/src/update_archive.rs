use flate2::read::GzDecoder;
use std::{
    io,
    path::{Component, Path},
};

pub fn verify(bytes: &[u8]) -> io::Result<()> {
    let mut archive = tar::Archive::new(GzDecoder::new(bytes));
    let mut info = false;
    let mut executable = false;
    for entry in archive.entries()? {
        let mut entry = entry?;
        let path = entry.path()?.into_owned();
        // Tauri removes one leading component during extraction. AppleDouble at
        // archive root therefore targets the extraction directory itself.
        if !path.starts_with("GitTogether.app")
            || path.components().any(|c| {
                !matches!(c, Component::Normal(_))
                    || c.as_os_str().to_string_lossy().starts_with("._")
            })
        {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                format!("unsupported update archive entry: {}", path.display()),
            ));
        }
        if path == Path::new("GitTogether.app") && !entry.header().entry_type().is_dir() {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "update archive root must be a directory",
            ));
        }
        if entry.header().entry_type().is_file() {
            info |= path == Path::new("GitTogether.app/Contents/Info.plist");
            executable |= path == Path::new("GitTogether.app/Contents/MacOS/gittogether");
        }
        io::copy(&mut entry, &mut io::sink())?;
    }
    if !info || !executable {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "update archive is missing the application plist or executable",
        ));
    }
    Ok(())
}
