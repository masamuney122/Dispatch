use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Serialize, Deserialize)]
pub struct ApiResponse {
    pub status: u16,
    pub response_time_ms: u128,
    pub body: String,
    pub headers: HashMap<String, String>,
}
