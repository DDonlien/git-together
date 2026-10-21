use crate::util::Result;

pub fn profile() -> Result<Option<String>> {
    let value = std::env::args()
        .find_map(|arg| arg.strip_prefix("--presence-instance=").map(str::to_owned));
    if let Some(id) = &value {
        if id.is_empty()
            || id.len() > 64
            || !id
                .bytes()
                .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
        {
            return Err("实例名称只能包含小写字母、数字和连字符，最长64个字符。".into());
        }
    }
    Ok(value)
}
