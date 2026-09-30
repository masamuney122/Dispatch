use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::models::cookie::StoredCookie;

#[derive(Debug, Serialize, Deserialize)]
pub struct ResponseNetworkInfo {
    pub transport: String,
    pub http_version: Option<String>,
    pub remote_address: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ApiResponse {
    pub status: u16,
    pub response_time_ms: u128,
    pub body: String,
    pub body_base64: Option<String>,
    pub body_size: usize,
    pub headers: HashMap<String, String>,
    #[serde(default)]
    pub request_headers: HashMap<String, String>,
    pub network: ResponseNetworkInfo,
    #[serde(default)]
    pub cookies: Vec<StoredCookie>,
    pub cookie_handling: String,
}
