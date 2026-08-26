use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};

use cookie_store::{CookieDomain, CookieExpiration, CookieStore};
use reqwest::cookie::CookieStore as ReqwestCookieStore;
use reqwest::header::HeaderValue;
use url::Url;

use crate::models::cookie::{CookieJarDocument, CookieKey, StoredCookie};
use crate::models::workspace::WorkspaceSession;
use crate::services::storage_service::{read_json, write_json_atomic};

pub const COOKIES_FILE: &str = "cookies.json";

#[derive(Debug, Default)]
pub struct ManagedCookieJar {
    store: RwLock<CookieStore>,
    disabled: RwLock<Vec<StoredCookie>>,
}

impl ManagedCookieJar {
    pub fn load(path: &Path) -> Result<Self, String> {
        if !path.exists() {
            return Ok(Self::default());
        }
        let document: CookieJarDocument = read_json(path, "workspace cookie jar")?;
        if document.schema_version != 1 {
            return Err(format!(
                "Unsupported cookie jar schema version: {}",
                document.schema_version
            ));
        }

        let jar = Self::default();
        for cookie in document.cookies {
            if cookie.enabled {
                jar.insert_enabled(&cookie)?;
            } else if !is_expired(&cookie) {
                jar.disabled
                    .write()
                    .map_err(|error| error.to_string())?
                    .push(cookie);
            }
        }
        Ok(jar)
    }

    pub fn save(&self, path: &Path) -> Result<(), String> {
        let document = CookieJarDocument {
            schema_version: 1,
            cookies: self.list()?,
        };
        write_json_atomic(path, &document, "workspace cookie jar")
    }

    pub fn list(&self) -> Result<Vec<StoredCookie>, String> {
        let store = self.store.read().map_err(|error| error.to_string())?;
        let mut cookies = store
            .iter_unexpired()
            .map(|cookie| stored_cookie(cookie, true))
            .collect::<Vec<_>>();
        drop(store);
        cookies.extend(
            self.disabled
                .read()
                .map_err(|error| error.to_string())?
                .iter()
                .filter(|cookie| !is_expired(cookie))
                .cloned(),
        );
        cookies.sort_by(|left, right| {
            left.domain
                .cmp(&right.domain)
                .then(left.path.cmp(&right.path))
                .then(left.name.cmp(&right.name))
        });
        Ok(cookies)
    }

    pub fn snapshot(&self) -> Result<HashMap<String, String>, String> {
        Ok(self
            .list()?
            .into_iter()
            .filter(|cookie| cookie.enabled)
            .map(|cookie| (cookie_id(&cookie.key()), cookie_signature(&cookie)))
            .collect())
    }

    pub fn changed_since(
        &self,
        before: &HashMap<String, String>,
    ) -> Result<Vec<StoredCookie>, String> {
        Ok(self
            .list()?
            .into_iter()
            .filter(|cookie| {
                cookie.enabled
                    && before
                        .get(&cookie_id(&cookie.key()))
                        .is_none_or(|value| value != &cookie_signature(cookie))
            })
            .collect())
    }

    pub fn upsert(
        &self,
        previous: Option<&CookieKey>,
        mut cookie: StoredCookie,
    ) -> Result<(), String> {
        normalize_cookie(&mut cookie)?;
        if let Some(previous) = previous {
            self.remove(previous)?;
        } else {
            self.remove(&cookie.key())?;
        }
        if cookie.enabled {
            self.insert_enabled(&cookie)
        } else {
            self.disabled
                .write()
                .map_err(|error| error.to_string())?
                .push(cookie);
            Ok(())
        }
    }

    pub fn set_enabled(&self, key: &CookieKey, enabled: bool) -> Result<(), String> {
        let existing = self
            .list()?
            .into_iter()
            .find(|cookie| cookie.key() == *key)
            .ok_or_else(|| "Cookie could not be found".to_string())?;
        let mut updated = existing;
        updated.enabled = enabled;
        self.upsert(Some(key), updated)
    }

    pub fn remove(&self, key: &CookieKey) -> Result<(), String> {
        self.store
            .write()
            .map_err(|error| error.to_string())?
            .remove(
                &normalize_domain(&key.domain),
                normalize_path(&key.path),
                &key.name,
            );
        self.disabled
            .write()
            .map_err(|error| error.to_string())?
            .retain(|cookie| cookie.key() != *key);
        Ok(())
    }

    pub fn clear(&self) -> Result<(), String> {
        self.store
            .write()
            .map_err(|error| error.to_string())?
            .clear();
        self.disabled
            .write()
            .map_err(|error| error.to_string())?
            .clear();
        Ok(())
    }

    fn insert_enabled(&self, cookie: &StoredCookie) -> Result<(), String> {
        if is_expired(cookie) {
            return Ok(());
        }
        let origin = cookie_origin(cookie)?;
        let raw = cookie_header(cookie)?;
        self.store
            .write()
            .map_err(|error| error.to_string())?
            .parse(&raw, &origin)
            .map(|_| ())
            .map_err(|error| format!("Cookie could not be stored: {error}"))
    }
}

impl ReqwestCookieStore for ManagedCookieJar {
    fn set_cookies(&self, cookie_headers: &mut dyn Iterator<Item = &HeaderValue>, url: &Url) {
        let (Ok(mut store), Ok(mut disabled)) = (self.store.write(), self.disabled.write()) else {
            return;
        };
        for header in cookie_headers {
            let Ok(value) = header.to_str() else {
                continue;
            };
            let Ok(parsed) = cookie_store::Cookie::parse(value.to_string(), url) else {
                continue;
            };
            let record = stored_cookie(&parsed, false);
            if let Some(index) = disabled
                .iter()
                .position(|cookie| cookie.key() == record.key())
            {
                if parsed.is_expired() {
                    disabled.remove(index);
                } else {
                    disabled[index] = record;
                }
            } else {
                let _ = store.insert(parsed.into_owned(), url);
            }
        }
    }

    fn cookies(&self, url: &Url) -> Option<HeaderValue> {
        let store = self.store.read().ok()?;
        let value = store
            .get_request_values(url)
            .map(|(name, value)| format!("{name}={value}"))
            .collect::<Vec<_>>()
            .join("; ");
        (!value.is_empty())
            .then(|| HeaderValue::from_str(&value).ok())
            .flatten()
    }
}

#[derive(Debug)]
pub struct CookieRuntimeState {
    jar: Arc<ManagedCookieJar>,
    path: Option<PathBuf>,
}

impl Default for CookieRuntimeState {
    fn default() -> Self {
        Self {
            jar: Arc::new(ManagedCookieJar::default()),
            path: None,
        }
    }
}

impl CookieRuntimeState {
    pub fn activate(&mut self, session: &WorkspaceSession) -> Result<(), String> {
        let path = session.root_path.join(COOKIES_FILE);
        self.jar = Arc::new(ManagedCookieJar::load(&path)?);
        self.path = Some(path);
        Ok(())
    }

    pub fn deactivate(&mut self) {
        self.jar = Arc::new(ManagedCookieJar::default());
        self.path = None;
    }

    pub fn current(&self) -> Result<(Arc<ManagedCookieJar>, PathBuf), String> {
        Ok((
            Arc::clone(&self.jar),
            self.path
                .clone()
                .ok_or_else(|| "No workspace is currently open".to_string())?,
        ))
    }
}

pub fn create_empty_cookie_jar(root: &Path) -> Result<(), String> {
    write_json_atomic(
        &root.join(COOKIES_FILE),
        &CookieJarDocument::default(),
        "workspace cookie jar",
    )
}

fn stored_cookie(cookie: &cookie_store::Cookie<'_>, enabled: bool) -> StoredCookie {
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

fn normalize_cookie(cookie: &mut StoredCookie) -> Result<(), String> {
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

fn cookie_origin(cookie: &StoredCookie) -> Result<Url, String> {
    let scheme = if cookie.secure { "https" } else { "http" };
    Url::parse(&format!("{scheme}://{}{}", cookie.domain, cookie.path))
        .map_err(|error| format!("Cookie domain or path is invalid: {error}"))
}

fn cookie_header(cookie: &StoredCookie) -> Result<String, String> {
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
    Ok(parts.join("; "))
}

fn normalize_domain(value: &str) -> String {
    value.trim().trim_start_matches('.').to_ascii_lowercase()
}

fn normalize_path(value: &str) -> &str {
    let value = value.trim();
    if value.is_empty() {
        "/"
    } else {
        value
    }
}

fn normalize_same_site(value: &str) -> Option<String> {
    match value.trim().to_ascii_lowercase().as_str() {
        "strict" => Some("strict".to_string()),
        "lax" => Some("lax".to_string()),
        "none" => Some("none".to_string()),
        _ => None,
    }
}

fn is_expired(cookie: &StoredCookie) -> bool {
    cookie
        .expires_at
        .is_some_and(|expires_at| expires_at <= chrono::Utc::now().timestamp())
}

fn cookie_id(key: &CookieKey) -> String {
    format!(
        "{}\n{}\n{}",
        normalize_domain(&key.domain),
        key.path,
        key.name
    )
}

fn cookie_signature(cookie: &StoredCookie) -> String {
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

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_cookie() -> StoredCookie {
        StoredCookie {
            name: "session".to_string(),
            value: "abc123".to_string(),
            domain: "example.com".to_string(),
            path: "/api".to_string(),
            expires_at: None,
            secure: true,
            http_only: true,
            same_site: Some("lax".to_string()),
            host_only: true,
            enabled: true,
        }
    }

    #[test]
    fn matches_toggles_and_persists_workspace_cookies() {
        let jar = ManagedCookieJar::default();
        let cookie = sample_cookie();
        jar.upsert(None, cookie.clone()).expect("insert cookie");

        let matching_url = Url::parse("https://example.com/api/users").unwrap();
        let outside_path = Url::parse("https://example.com/other").unwrap();
        assert_eq!(
            ReqwestCookieStore::cookies(&jar, &matching_url)
                .and_then(|value| value.to_str().ok().map(str::to_string))
                .as_deref(),
            Some("session=abc123")
        );
        assert!(ReqwestCookieStore::cookies(&jar, &outside_path).is_none());

        jar.set_enabled(&cookie.key(), false)
            .expect("disable cookie");
        assert!(ReqwestCookieStore::cookies(&jar, &matching_url).is_none());

        let root =
            std::env::temp_dir().join(format!("dispatch-cookie-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        let path = root.join(COOKIES_FILE);
        jar.save(&path).expect("save jar");
        let loaded = ManagedCookieJar::load(&path).expect("load jar");
        let cookies = loaded.list().expect("list loaded jar");
        assert_eq!(cookies.len(), 1);
        assert!(!cookies[0].enabled);
        assert_eq!(cookies[0].same_site.as_deref(), Some("lax"));
        std::fs::remove_dir_all(root).unwrap();
    }
}
