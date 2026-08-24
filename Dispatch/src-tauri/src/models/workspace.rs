use std::collections::HashMap;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::models::collection::Collection;
use crate::models::environment::Environment;

pub const WORKSPACE_FORMAT: &str = "dispatch-workspace";
pub const WORKSPACE_SCHEMA_VERSION: u32 = 1;
pub const WORKSPACE_MANIFEST_FILE: &str = "dispatch.workspace.json";
pub const COLLECTIONS_FILE: &str = "collections.json";
pub const ENVIRONMENTS_FILE: &str = "environments.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceManifest {
    pub format: String,
    pub schema_version: u32,
    pub id: String,
    pub name: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CollectionsDocument {
    pub schema_version: u32,
    pub workspace_id: String,
    pub revision: u64,
    pub updated_at: String,
    #[serde(default)]
    pub collections: Vec<Collection>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnvironmentsDocument {
    pub schema_version: u32,
    pub workspace_id: String,
    pub revision: u64,
    pub updated_at: String,
    #[serde(default)]
    pub environments: Vec<Environment>,
}

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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct GlobalHttpSettings {
    pub http_version: crate::models::request::HttpVersionPreference,
    pub verify_ssl: bool,
    pub follow_redirects: bool,
    pub remove_referer_on_redirect: bool,
    pub max_redirects: usize,
}

impl Default for GlobalHttpSettings {
    fn default() -> Self {
        Self {
            http_version: crate::models::request::HttpVersionPreference::Auto,
            verify_ssl: true,
            follow_redirects: true,
            remove_referer_on_redirect: false,
            max_redirects: 10,
        }
    }
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

impl WorkspaceManifest {
    pub fn new(name: String) -> Self {
        let now = chrono::Utc::now().to_rfc3339();
        Self {
            format: WORKSPACE_FORMAT.to_string(),
            schema_version: WORKSPACE_SCHEMA_VERSION,
            id: uuid::Uuid::new_v4().to_string(),
            name,
            created_at: now.clone(),
            updated_at: now,
        }
    }
}

impl CollectionsDocument {
    pub fn empty(workspace_id: String) -> Self {
        Self {
            schema_version: WORKSPACE_SCHEMA_VERSION,
            workspace_id,
            revision: 0,
            updated_at: chrono::Utc::now().to_rfc3339(),
            collections: Vec::new(),
        }
    }
}

impl EnvironmentsDocument {
    pub fn empty(workspace_id: String) -> Self {
        Self {
            schema_version: WORKSPACE_SCHEMA_VERSION,
            workspace_id,
            revision: 0,
            updated_at: chrono::Utc::now().to_rfc3339(),
            environments: Vec::new(),
        }
    }
}
