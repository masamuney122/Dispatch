use serde::{Deserialize, Serialize};

pub use dispatch_core::Environment;

/// Application state holding all environments and the active selection.
/// Wrapped in Mutex and managed by Tauri's .manage() for thread-safe access.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct AppState {
    pub schema_version: u32,
    pub environments: Vec<Environment>,
    pub active_environment_id: Option<String>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            schema_version: 1,
            environments: Vec::new(),
            active_environment_id: None,
        }
    }
}
