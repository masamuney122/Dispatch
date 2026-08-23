use crate::models::auth::AuthConfig;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryItem {
    pub id: String,
    pub method: String,
    pub url: String,
    pub body: String,
    pub status: Option<u16>,
    pub response_time_ms: Option<u128>,
    pub timestamp: String,
    pub error: Option<String>,
    #[serde(default)]
    pub auth: Option<AuthConfig>,
}
