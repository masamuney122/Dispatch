use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::models::cookie::StoredCookie;

#[derive(Debug, Serialize, Deserialize)]
pub struct ApiResponse {
    pub status: u16,
    pub response_time_ms: u128,
    pub body: String,
    pub body_base64: Option<String>,
    pub body_size: usize,
    pub headers: HashMap<String, String>,
    #[serde(default)]
    pub cookies: Vec<StoredCookie>,
    pub cookie_handling: String,
}
