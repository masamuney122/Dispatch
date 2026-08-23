use std::path::PathBuf;
use std::sync::Mutex;

use crate::commands::workspace_command::activate_workspace;
use crate::models::archive::{ArchiveMode, ArchivePreview};
use crate::models::environment::AppState;
use crate::models::workspace::{WorkspaceRuntimeState, WorkspaceSession};
use crate::services::archive_service;

#[tauri::command]
pub fn export_workspace_archive(
    runtime: tauri::State<'_, Mutex<WorkspaceRuntimeState>>,
    path: String,
    mode: ArchiveMode,
) -> Result<(), String> {
    let session = runtime
        .lock()
        .map_err(|error| error.to_string())?
        .current_workspace
        .clone()
        .ok_or_else(|| "No workspace is currently open".to_string())?;
    archive_service::export_workspace(&session, &PathBuf::from(path), mode)
}

#[tauri::command]
pub fn inspect_workspace_archive(path: String) -> Result<ArchivePreview, String> {
    archive_service::inspect_archive(&PathBuf::from(path))
}

#[tauri::command]
pub fn import_workspace_archive(
    app_handle: tauri::AppHandle,
    runtime: tauri::State<'_, Mutex<WorkspaceRuntimeState>>,
    environment_state: tauri::State<'_, Mutex<AppState>>,
    archive_path: String,
    destination_parent: String,
    workspace_name: Option<String>,
) -> Result<WorkspaceSession, String> {
    let preview = archive_service::inspect_archive(&PathBuf::from(&archive_path))?;
    let requested_name = workspace_name
        .as_deref()
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .unwrap_or(&preview.workspace_name);
    let directory_name = safe_directory_name(requested_name)?;
    let destination = PathBuf::from(destination_parent).join(directory_name);
    let session = archive_service::import_archive(
        &PathBuf::from(archive_path),
        &destination,
        Some(requested_name),
    )?;
    activate_workspace(&app_handle, &runtime, &environment_state, session)
}

fn safe_directory_name(name: &str) -> Result<String, String> {
    let name = name.trim();
    if name.is_empty()
        || name == "."
        || name == ".."
        || name.contains('/')
        || name.contains('\\')
        || name.contains('\0')
        || name.chars().any(char::is_control)
        || name.chars().any(|character| "<>:\"|?*".contains(character))
        || name.ends_with(' ')
        || name.ends_with('.')
    {
        return Err("Workspace name cannot be used as a directory name".to_string());
    }
    Ok(name.to_string())
}
