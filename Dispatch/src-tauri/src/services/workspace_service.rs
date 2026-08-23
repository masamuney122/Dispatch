use std::fs;
use std::path::{Path, PathBuf};

use crate::models::workspace::{
    AppSettings, CollectionsDocument, EnvironmentsDocument, RecentWorkspace, WorkspaceManifest,
    WorkspaceSession, COLLECTIONS_FILE, ENVIRONMENTS_FILE, WORKSPACE_FORMAT,
    WORKSPACE_MANIFEST_FILE, WORKSPACE_SCHEMA_VERSION,
};
use crate::services::storage_service::{read_json, write_json_atomic};

const APP_SETTINGS_FILE: &str = "app-settings.json";
const MAX_RECENT_WORKSPACES: usize = 10;

pub fn create_workspace(root: &Path, name: &str) -> Result<WorkspaceSession, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("Workspace name cannot be empty".to_string());
    }

    if root.exists() {
        if !root.is_dir() {
            return Err(format!(
                "Workspace path is not a directory: {}",
                root.display()
            ));
        }
        let mut entries = fs::read_dir(root)
            .map_err(|error| format!("Failed to inspect workspace directory: {error}"))?;
        if entries.next().is_some() {
            return Err("A new workspace can only be created in an empty directory".to_string());
        }
    } else {
        fs::create_dir_all(root)
            .map_err(|error| format!("Failed to create workspace directory: {error}"))?;
    }

    let manifest = WorkspaceManifest::new(name.to_string());
    let collections = CollectionsDocument::empty(manifest.id.clone());
    let environments = EnvironmentsDocument::empty(manifest.id.clone());

    write_json_atomic(
        &root.join(WORKSPACE_MANIFEST_FILE),
        &manifest,
        "workspace manifest",
    )?;
    write_json_atomic(
        &root.join(COLLECTIONS_FILE),
        &collections,
        "collections document",
    )?;
    write_json_atomic(
        &root.join(ENVIRONMENTS_FILE),
        &environments,
        "environments document",
    )?;
    fs::create_dir_all(root.join("assets"))
        .map_err(|error| format!("Failed to create workspace assets directory: {error}"))?;

    open_workspace(root)
}

pub fn open_workspace(root: &Path) -> Result<WorkspaceSession, String> {
    if !root.is_dir() {
        return Err(format!(
            "Workspace directory does not exist: {}",
            root.display()
        ));
    }

    let root_path = root
        .canonicalize()
        .map_err(|error| format!("Failed to resolve workspace path: {error}"))?;
    let manifest: WorkspaceManifest = read_json(
        &root_path.join(WORKSPACE_MANIFEST_FILE),
        "workspace manifest",
    )?;
    validate_manifest(&manifest)?;

    let collections: CollectionsDocument =
        read_json(&root_path.join(COLLECTIONS_FILE), "collections document")?;
    validate_document_identity(
        collections.schema_version,
        &collections.workspace_id,
        &manifest.id,
        "collections document",
    )?;

    let environments: EnvironmentsDocument =
        read_json(&root_path.join(ENVIRONMENTS_FILE), "environments document")?;
    validate_document_identity(
        environments.schema_version,
        &environments.workspace_id,
        &manifest.id,
        "environments document",
    )?;

    Ok(WorkspaceSession {
        root_path,
        manifest,
    })
}

pub fn load_settings(app_data_dir: &Path) -> Result<AppSettings, String> {
    let path = app_data_dir.join(APP_SETTINGS_FILE);
    if !path.exists() {
        return Ok(AppSettings::default());
    }
    let settings: AppSettings = read_json(&path, "application settings")?;
    if settings.schema_version != WORKSPACE_SCHEMA_VERSION {
        return Err(format!(
            "Unsupported application settings schema version: {}",
            settings.schema_version
        ));
    }
    Ok(settings)
}

pub fn save_settings(app_data_dir: &Path, settings: &AppSettings) -> Result<(), String> {
    write_json_atomic(
        &app_data_dir.join(APP_SETTINGS_FILE),
        settings,
        "application settings",
    )
}

pub fn remember_workspace(settings: &mut AppSettings, session: &WorkspaceSession) {
    let path = session.root_path.clone();
    settings.last_workspace_path = Some(path.clone());
    settings
        .recent_workspaces
        .retain(|workspace| workspace.id != session.manifest.id && workspace.path != path);
    settings.recent_workspaces.insert(
        0,
        RecentWorkspace {
            id: session.manifest.id.clone(),
            name: session.manifest.name.clone(),
            path,
            last_opened_at: chrono::Utc::now().to_rfc3339(),
        },
    );
    settings.recent_workspaces.truncate(MAX_RECENT_WORKSPACES);
}

pub fn workspace_file(session: &WorkspaceSession, file_name: &str) -> PathBuf {
    session.root_path.join(file_name)
}

fn validate_manifest(manifest: &WorkspaceManifest) -> Result<(), String> {
    if manifest.format != WORKSPACE_FORMAT {
        return Err(format!("Unsupported workspace format: {}", manifest.format));
    }
    if manifest.schema_version != WORKSPACE_SCHEMA_VERSION {
        return Err(format!(
            "Unsupported workspace schema version: {}",
            manifest.schema_version
        ));
    }
    if manifest.id.trim().is_empty() || manifest.name.trim().is_empty() {
        return Err("Workspace manifest must contain an id and name".to_string());
    }
    Ok(())
}

fn validate_document_identity(
    schema_version: u32,
    workspace_id: &str,
    expected_workspace_id: &str,
    label: &str,
) -> Result<(), String> {
    if schema_version != WORKSPACE_SCHEMA_VERSION {
        return Err(format!(
            "Unsupported {label} schema version: {schema_version}"
        ));
    }
    if workspace_id != expected_workspace_id {
        return Err(format!("{label} belongs to a different workspace"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{create_workspace, open_workspace};

    #[test]
    fn creates_a_workspace_that_can_be_opened() {
        let root =
            std::env::temp_dir().join(format!("dispatch-workspace-test-{}", uuid::Uuid::new_v4()));

        let created = create_workspace(&root, "Test Workspace").unwrap();
        let opened = open_workspace(&root).unwrap();

        assert_eq!(created.manifest.id, opened.manifest.id);
        assert_eq!(opened.manifest.name, "Test Workspace");
        assert!(root.join("assets").is_dir());

        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_non_workspace_directories() {
        let root = std::env::temp_dir().join(format!(
            "dispatch-not-workspace-test-{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&root).unwrap();

        let result = open_workspace(&root);
        assert!(result.is_err());

        std::fs::remove_dir_all(root).unwrap();
    }
}
