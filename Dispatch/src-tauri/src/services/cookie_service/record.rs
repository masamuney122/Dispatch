use cookie_store::{CookieDomain, CookieExpiration};
use url::Url;

use crate::models::cookie::{CookieKey, StoredCookie};

pub(super) fn from_store_cookie(cookie: &cookie_store::Cookie<'_>, enabled: bool) -> StoredCookie {
    let same_site = cookie
        .same_site()
        .map(|value| format!("{value:?}").to_ascii_lowercase());
    StoredCookie {
        name: cookie.name().to_string(),
        value: cookie.value().to_string(),
        domain: cookie.domain.as_cow().unwrap_or_default().into_owned(),
        path: cookie.path.as_ref().to_string(),
        expires_at: match cookie.expires {
            CookieExpiration::AtUtc(value) => Some(value.unix_timestamp()),
            CookieExpiration::SessionEnd => None,
        },
        secure: cookie.secure().unwrap_or(false),
        http_only: cookie.http_only().unwrap_or(false),
        same_site,
        host_only: matches!(cookie.domain, CookieDomain::HostOnly(_)),
        enabled,
    }
}

pub(super) fn normalize(cookie: &mut StoredCookie) -> Result<(), String> {
    cookie.name = cookie.name.trim().to_string();
    cookie.domain = normalize_domain(&cookie.domain);
    cookie.path = normalize_path(&cookie.path).to_string();
    cookie.same_site = cookie.same_site.as_deref().and_then(normalize_same_site);
    if cookie.name.is_empty()
        || cookie.name.contains([';', '=', '\r', '\n'])
        || cookie.value.contains(['\r', '\n'])
    {
        return Err("Cookie name or value is invalid".to_string());
    }
    if cookie.domain.is_empty() || cookie.domain.contains(['/', '\r', '\n']) {
        return Err("Cookie domain is invalid".to_string());
    }
    if !cookie.path.starts_with('/') {
        return Err("Cookie path must start with '/'".to_string());
    }
    Ok(())
}

pub(super) fn origin(cookie: &StoredCookie) -> Result<Url, String> {
    let scheme = if cookie.secure { "https" } else { "http" };
    Url::parse(&format!("{scheme}://{}{}", cookie.domain, cookie.path))
        .map_err(|error| format!("Cookie domain or path is invalid: {error}"))
}

pub(super) fn header(cookie: &StoredCookie) -> String {
    let mut parts = vec![format!("{}={}", cookie.name, cookie.value)];
    if !cookie.host_only {
        parts.push(format!("Domain={}", cookie.domain));
    }
    parts.push(format!("Path={}", cookie.path));
    if let Some(expires_at) = cookie.expires_at {
        let max_age = expires_at.saturating_sub(chrono::Utc::now().timestamp());
        parts.push(format!("Max-Age={max_age}"));
    }
    if cookie.secure {
        parts.push("Secure".to_string());
    }
    if cookie.http_only {
        parts.push("HttpOnly".to_string());
    }
    if let Some(same_site) = cookie.same_site.as_deref() {
        parts.push(format!("SameSite={same_site}"));
    }
    parts.join("; ")
}

pub(super) fn normalize_domain(value: &str) -> String {
    value.trim().trim_start_matches('.').to_ascii_lowercase()
}

pub(super) fn normalize_path(value: &str) -> &str {
    let value = value.trim();
    if value.is_empty() {
        "/"
    } else {
        value
    }
}

pub(super) fn is_expired(cookie: &StoredCookie) -> bool {
    cookie
        .expires_at
        .is_some_and(|expires_at| expires_at <= chrono::Utc::now().timestamp())
}

pub(super) fn id(key: &CookieKey) -> String {
    format!(
        "{}\n{}\n{}",
        normalize_domain(&key.domain),
        key.path,
        key.name
    )
}

pub(super) fn signature(cookie: &StoredCookie) -> String {
    format!(
        "{}\n{:?}\n{}\n{}\n{:?}\n{}",
        cookie.value,
        cookie.expires_at,
        cookie.secure,
        cookie.http_only,
        cookie.same_site,
        cookie.host_only
    )
}

fn normalize_same_site(value: &str) -> Option<String> {
    match value.trim().to_ascii_lowercase().as_str() {
        "strict" => Some("strict".to_string()),
        "lax" => Some("lax".to_string()),
        "none" => Some("none".to_string()),
        _ => None,
    }
}
