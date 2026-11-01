use crate::util::Result;
use std::path::PathBuf;

pub fn data_root() -> Result<PathBuf> {
    crate::platform::data_root()
}
