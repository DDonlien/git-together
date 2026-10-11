use crate::{git, util::Result};
use std::path::Path;
use url::Url;

// Finder does not inherit a shell's proxy variables. Resolve the existing
// macOS proxy for this URL, including its bypass rules, for this child only.
// Explicit Git configuration and environment choices retain precedence.
pub async fn environment(root: &Path, destination: &str) -> Result<Option<(String, String)>> {
    let url = Url::parse(destination).map_err(|_| "无效的Git远端地址。")?;
    let names = match url.scheme() {
        "https" => ["https_proxy", "HTTPS_PROXY", "all_proxy", "ALL_PROXY"],
        "http" => ["http_proxy", "HTTP_PROXY", "all_proxy", "ALL_PROXY"],
        _ => return Ok(None),
    };
    if names.iter().any(|name| std::env::var_os(name).is_some()) {
        return Ok(None);
    }
    // A successfully read empty value also intentionally disables a proxy.
    if git::read(
        root,
        &["config", "--get-urlmatch", "http.proxy", destination],
    )
    .await
    .is_ok()
    {
        return Ok(None);
    }
    Ok(system_proxy(destination).map(|proxy| (names[0].into(), proxy)))
}

#[cfg(not(target_os = "macos"))]
pub fn system_proxy(_: &str) -> Option<String> {
    None
}

#[cfg(target_os = "macos")]
pub fn system_proxy(destination: &str) -> Option<String> {
    use core_foundation::{
        array::{CFArray, CFArrayRef},
        base::{kCFAllocatorDefault, CFType, TCFType},
        dictionary::{CFDictionary, CFDictionaryRef},
        number::CFNumber,
        string::{CFString, CFStringRef},
        url::{CFURLCreateWithString, CFURLRef, CFURL},
    };
    #[link(name = "CFNetwork", kind = "framework")]
    extern "C" {
        fn CFNetworkCopySystemProxySettings() -> CFDictionaryRef;
        fn CFNetworkCopyProxiesForURL(url: CFURLRef, settings: CFDictionaryRef) -> CFArrayRef;
        static kCFProxyTypeKey: CFStringRef;
        static kCFProxyHostNameKey: CFStringRef;
        static kCFProxyPortNumberKey: CFStringRef;
        static kCFProxyTypeHTTP: CFStringRef;
        static kCFProxyTypeHTTPS: CFStringRef;
        static kCFProxyTypeSOCKS: CFStringRef;
    }
    unsafe {
        let settings = CFNetworkCopySystemProxySettings();
        if settings.is_null() {
            return None;
        }
        let settings = CFDictionary::<CFString, CFType>::wrap_under_create_rule(settings);
        let string = CFString::new(destination);
        let url = CFURLCreateWithString(
            kCFAllocatorDefault,
            string.as_concrete_TypeRef(),
            std::ptr::null(),
        );
        if url.is_null() {
            return None;
        }
        let url = CFURL::wrap_under_create_rule(url);
        let proxies =
            CFNetworkCopyProxiesForURL(url.as_concrete_TypeRef(), settings.as_concrete_TypeRef());
        if proxies.is_null() {
            return None;
        }
        let proxies = CFArray::<CFDictionary<CFString, CFType>>::wrap_under_create_rule(proxies);
        // A first direct entry means that macOS bypasses this destination.
        // PAC entries are not replaced with a different static proxy.
        let first = proxies.get(0)?;
        let kind = first.find(kCFProxyTypeKey)?.downcast::<CFString>()?;
        let scheme = if kind == CFString::wrap_under_get_rule(kCFProxyTypeHTTP)
            || kind == CFString::wrap_under_get_rule(kCFProxyTypeHTTPS)
        {
            "http"
        } else if kind == CFString::wrap_under_get_rule(kCFProxyTypeSOCKS) {
            "socks5h"
        } else {
            return None;
        };
        let host = first
            .find(kCFProxyHostNameKey)?
            .downcast::<CFString>()?
            .to_string();
        let port = first
            .find(kCFProxyPortNumberKey)?
            .downcast::<CFNumber>()?
            .to_i64()?;
        let port = u16::try_from(port).ok().filter(|port| *port > 0)?;
        let mut proxy = Url::parse(&format!("{scheme}://proxy.invalid")).ok()?;
        let host = if host.contains(':') && !host.starts_with('[') {
            format!("[{host}]")
        } else {
            host
        };
        proxy.set_host(Some(&host)).ok()?;
        proxy.set_port(Some(port)).ok()?;
        Some(proxy.into())
    }
}
