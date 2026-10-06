use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};

use cookie_store::CookieStore;
use reqwest::cookie::CookieStore as ReqwestCookieStore;
use reqwest::header::HeaderValue;
use url::Url;

use crate::models::cookie::{CookieJarDocument, CookieKey, StoredCookie};
use crate::models::workspace::WorkspaceSession;
use crate::services::storage_service::{read_json, write_json_atomic};

mod record;

use record::{
    from_store_cookie, header as cookie_header, id as cookie_id, is_expired, normalize,
    normalize_domain, normalize_path, origin as cookie_origin, signature as cookie_signature,
};

pub const COOKIES_FILE: &str = "cookies.json";

#[derive(Debug, Default)]
pub struct ManagedCookieJar {
    store: RwLock<CookieStore>,
    disabled: RwLock<Vec<StoredCookie>>,
}

impl ManagedCookieJar {
    pub fn from_cookies(cookies: &[StoredCookie]) -> Result<Self, String> {
        let jar = Self::default();
        for cookie in cookies {
            jar.upsert(None, cookie.clone())?;
        }
        Ok(jar)
    }

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
            .map(|cookie| from_store_cookie(cookie, true))
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
        normalize(&mut cookie)?;
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
        let raw = cookie_header(cookie);
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
            let record = from_store_cookie(&parsed, false);
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

#[cfg(test)]
mod tests {
    use super::*;

    fn capture(jar: &ManagedCookieJar, url: &str, headers: &[&str]) {
        let values = headers
            .iter()
            .map(|value| HeaderValue::from_str(value).unwrap())
            .collect::<Vec<_>>();
        let mut values = values.iter();
        ReqwestCookieStore::set_cookies(jar, &mut values, &Url::parse(url).unwrap());
    }

    fn request_cookie(jar: &ManagedCookieJar, url: &str) -> Option<String> {
        ReqwestCookieStore::cookies(jar, &Url::parse(url).unwrap())
            .and_then(|value| value.to_str().ok().map(str::to_string))
    }

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
    fn creates_an_isolated_runner_cookie_jar_from_a_snapshot() {
        let workspace_jar = ManagedCookieJar::default();
        let cookie = sample_cookie();
        workspace_jar
            .upsert(None, cookie.clone())
            .expect("insert workspace cookie");

        let runner_jar =
            ManagedCookieJar::from_cookies(&workspace_jar.list().unwrap()).expect("clone jar");
        capture(
            &runner_jar,
            "https://example.com/api/login",
            &["session=runner; Path=/api; Secure"],
        );

        assert_eq!(
            request_cookie(&workspace_jar, "https://example.com/api/users").as_deref(),
            Some("session=abc123")
        );
        assert_eq!(
            request_cookie(&runner_jar, "https://example.com/api/users").as_deref(),
            Some("session=runner")
        );
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

    #[test]
    fn captures_replaces_and_deletes_response_cookies() {
        let jar = ManagedCookieJar::default();
        capture(
            &jar,
            "http://api.example.test/login",
            &["session=old; Path=/; HttpOnly; SameSite=Lax"],
        );
        assert_eq!(
            request_cookie(&jar, "http://api.example.test/users").as_deref(),
            Some("session=old")
        );

        capture(
            &jar,
            "http://api.example.test/login",
            &["session=new; Path=/; HttpOnly; SameSite=Lax"],
        );
        assert_eq!(
            request_cookie(&jar, "http://api.example.test/users").as_deref(),
            Some("session=new")
        );
        assert_eq!(jar.list().unwrap().len(), 1);

        capture(
            &jar,
            "http://api.example.test/logout",
            &["session=; Path=/; Max-Age=0"],
        );
        assert!(request_cookie(&jar, "http://api.example.test/users").is_none());
        assert!(jar.list().unwrap().is_empty());
    }

    #[test]
    fn respects_host_only_domain_path_boundary_and_secure_rules() {
        let jar = ManagedCookieJar::default();
        capture(
            &jar,
            "https://api.example.test/api/login",
            &[
                "host_only=1; Path=/",
                "shared=1; Domain=example.test; Path=/",
                "scoped=1; Path=/api",
                "secure_only=1; Path=/; Secure",
            ],
        );

        let exact_https = request_cookie(&jar, "https://api.example.test/api/users").unwrap();
        assert!(exact_https.contains("host_only=1"));
        assert!(exact_https.contains("shared=1"));
        assert!(exact_https.contains("scoped=1"));
        assert!(exact_https.contains("secure_only=1"));

        let sibling = request_cookie(&jar, "https://sub.example.test/api/users").unwrap();
        assert!(!sibling.contains("host_only=1"));
        assert!(sibling.contains("shared=1"));
        assert!(!sibling.contains("scoped=1"));
        assert!(!sibling.contains("secure_only=1"));

        let path_boundary = request_cookie(&jar, "https://api.example.test/apix").unwrap();
        assert!(!path_boundary.contains("scoped=1"));

        let insecure = request_cookie(&jar, "http://api.example.test/api/users").unwrap();
        assert!(!insecure.contains("secure_only=1"));
    }

    #[test]
    fn captures_multiple_set_cookie_headers_and_keeps_path_variants() {
        let jar = ManagedCookieJar::default();
        capture(
            &jar,
            "http://example.test/api/login",
            &[
                "session=root; Path=/",
                "session=api; Path=/api",
                "theme=dark; Path=/",
            ],
        );

        let root = request_cookie(&jar, "http://example.test/home").unwrap();
        assert!(root.contains("session=root"));
        assert!(!root.contains("session=api"));
        assert!(root.contains("theme=dark"));

        let api = request_cookie(&jar, "http://example.test/api/users").unwrap();
        assert!(api.contains("session=api"));
        assert!(api.contains("session=root"));
        assert!(api.contains("theme=dark"));
        assert_eq!(jar.list().unwrap().len(), 3);
    }

    #[test]
    fn clear_removes_enabled_and_disabled_cookies() {
        let jar = ManagedCookieJar::default();
        capture(
            &jar,
            "http://example.test/",
            &["enabled=1; Path=/", "disabled=1; Path=/"],
        );
        let disabled = jar
            .list()
            .unwrap()
            .into_iter()
            .find(|cookie| cookie.name == "disabled")
            .unwrap();
        jar.set_enabled(&disabled.key(), false).unwrap();
        jar.clear().unwrap();
        assert!(jar.list().unwrap().is_empty());
        assert!(request_cookie(&jar, "http://example.test/").is_none());
    }
}
