use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Serialize, Deserialize)]
pub struct ApiResponse {
    pub status: u16,
    pub response_time_ms: u128,
    pub body: String,
    pub body_base64: Option<String>,
    pub body_size: usize,
    pub headers: HashMap<String, String>,
}
