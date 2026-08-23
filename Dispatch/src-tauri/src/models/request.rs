use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::models::auth::AuthConfig;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum RequestBodyType {
    None,
    #[default]
    Json,
    Text,
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
}
