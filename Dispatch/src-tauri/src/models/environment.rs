use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// A named environment containing key/value variables.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Environment {
    pub id: String,
    pub name: String,
    pub variables: HashMap<String, String>,
    #[serde(default)]
    pub workspace_id: Option<String>,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,
}

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

impl AppState {
    /// Returns the variables of the active environment, or an empty map if none is active.
    pub fn active_variables(&self) -> HashMap<String, String> {
        self.active_environment_id
            .as_ref()
            .and_then(|id| self.environments.iter().find(|e| &e.id == id))
            .map(|e| e.variables.clone())
            .unwrap_or_default()
    }
}
