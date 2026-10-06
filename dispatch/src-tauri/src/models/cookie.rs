use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CookieKey {
    pub domain: String,
    pub path: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct StoredCookie {
    pub name: String,
    pub value: String,
    pub domain: String,
    pub path: String,
    pub expires_at: Option<i64>,
    pub secure: bool,
    pub http_only: bool,
    pub same_site: Option<String>,
    pub host_only: bool,
    pub enabled: bool,
}

impl StoredCookie {
    pub fn key(&self) -> CookieKey {
        CookieKey {
            domain: self.domain.clone(),
            path: self.path.clone(),
            name: self.name.clone(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CookieJarDocument {
    pub schema_version: u32,
    #[serde(default)]
    pub cookies: Vec<StoredCookie>,
}

impl Default for CookieJarDocument {
    fn default() -> Self {
        Self {
            schema_version: 1,
            cookies: Vec::new(),
        }
    }
}
