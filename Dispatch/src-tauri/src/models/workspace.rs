use std::collections::HashMap;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

pub use dispatch_core::{
    CollectionsDocument, EnvironmentsDocument, GlobalHttpSettings, WorkspaceManifest,
    WORKSPACE_FORMAT, WORKSPACE_SCHEMA_VERSION,
};

pub const WORKSPACE_MANIFEST_FILE: &str = "dispatch.workspace.json";
pub const COLLECTIONS_FILE: &str = "collections.json";
pub const ENVIRONMENTS_FILE: &str = "environments.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceSession {
    pub root_path: PathBuf,
    pub manifest: WorkspaceManifest,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecentWorkspace {
    pub id: String,
    pub name: String,
    pub path: PathBuf,
    pub last_opened_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct AppSettings {
    pub schema_version: u32,
    pub last_workspace_path: Option<PathBuf>,
    pub recent_workspaces: Vec<RecentWorkspace>,
    pub active_environment_by_workspace: HashMap<String, String>,
    pub http: GlobalHttpSettings,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            schema_version: WORKSPACE_SCHEMA_VERSION,
            last_workspace_path: None,
            recent_workspaces: Vec::new(),
            active_environment_by_workspace: HashMap::new(),
            http: GlobalHttpSettings::default(),
        }
    }
}

#[derive(Debug, Default)]
pub struct WorkspaceRuntimeState {
    pub current_workspace: Option<WorkspaceSession>,
    pub settings: AppSettings,
}
