use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::models::auth::AuthConfig;

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum HttpVersionPreference {
    Auto,
    Http1,
    Http2,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum CookieCredentials {
    Omit,
    SameOrigin,
    Include,
}

impl Default for CookieCredentials {
    fn default() -> Self {
        Self::SameOrigin
    }
}

impl Default for HttpVersionPreference {
    fn default() -> Self {
        Self::Auto
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct RequestHttpSettings {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub http_version: Option<HttpVersionPreference>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub verify_ssl: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub follow_redirects: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub remove_referer_on_redirect: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_redirects: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cookie_credentials: Option<CookieCredentials>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum RequestBodyType {
    None,
    #[default]
    Json,
    Text,
    Html,
    Xml,
    FormData,
    XWwwFormUrlencoded,
    Binary,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BodyField {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BinaryBody {
    pub name: String,
    pub mime_type: String,
    pub data_base64: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiRequest {
    pub method: String,
    pub url: String,
    pub body: String,
    #[serde(default)]
    pub body_type: RequestBodyType,
    #[serde(default)]
    pub form_fields: Vec<BodyField>,
    #[serde(default)]
    pub binary: Option<BinaryBody>,
    #[serde(default)]
    pub headers: HashMap<String, String>,
    #[serde(default)]
    pub auth: Option<AuthConfig>,
    #[serde(default)]
    pub settings: RequestHttpSettings,
}

#[cfg(test)]
mod tests {
    use super::RequestHttpSettings;

    #[test]
    fn empty_request_settings_serialize_without_null_overrides() {
        let value =
            serde_json::to_value(RequestHttpSettings::default()).expect("serialize settings");
        assert_eq!(value, serde_json::json!({}));
    }
}
