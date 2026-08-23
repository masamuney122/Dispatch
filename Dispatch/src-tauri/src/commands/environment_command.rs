use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::Manager;

use crate::models::environment::{AppState, Environment};
use crate::models::workspace::{
    EnvironmentsDocument, WorkspaceRuntimeState, ENVIRONMENTS_FILE, WORKSPACE_SCHEMA_VERSION,
};
use crate::services::storage_service::{read_json, write_json_atomic};
use crate::services::workspace_service::{save_settings, workspace_file};

fn environment_file_path(runtime: &Mutex<WorkspaceRuntimeState>) -> Result<PathBuf, String> {
    let runtime = runtime.lock().map_err(|error| error.to_string())?;
    let session = runtime
        .current_workspace
        .as_ref()
        .ok_or_else(|| "No workspace is currently open".to_string())?;
    Ok(workspace_file(session, ENVIRONMENTS_FILE))
}

fn persist_environment_state(path: &Path, state: &AppState) -> Result<(), String> {
    let mut document: EnvironmentsDocument = read_json(path, "environments document")?;
    if document.schema_version != WORKSPACE_SCHEMA_VERSION {
        return Err(format!(
            "Unsupported environments schema version: {}",
            document.schema_version
        ));
    }
    document.revision = document.revision.saturating_add(1);
    document.updated_at = chrono::Utc::now().to_rfc3339();
    document.environments = state.environments.clone();
    write_json_atomic(path, &document, "environments document")
}

fn persist_active_environment(
    app_handle: &tauri::AppHandle,
    runtime: &Mutex<WorkspaceRuntimeState>,
    active_environment_id: Option<&str>,
) -> Result<(), String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to get app data directory: {error}"))?;
    let mut runtime = runtime.lock().map_err(|error| error.to_string())?;
    let workspace_id = runtime
        .current_workspace
        .as_ref()
        .ok_or_else(|| "No workspace is currently open".to_string())?
        .manifest
        .id
        .clone();

    match active_environment_id {
        Some(id) => {
            runtime
                .settings
                .active_environment_by_workspace
                .insert(workspace_id, id.to_string());
        }
        None => {
            runtime
                .settings
                .active_environment_by_workspace
                .remove(&workspace_id);
        }
    }
    save_settings(&app_data_dir, &runtime.settings)
}

#[tauri::command]
pub fn create_environment(
    runtime: tauri::State<'_, Mutex<WorkspaceRuntimeState>>,
    state: tauri::State<'_, Mutex<AppState>>,
    name: String,
    variables: std::collections::HashMap<String, String>,
) -> Result<Environment, String> {
    let path = environment_file_path(&runtime)?;
    let now = chrono::Utc::now().to_rfc3339();
    let env = Environment {
        id: uuid::Uuid::new_v4().to_string(),
        name,
        variables,
        workspace_id: None,
        created_at: now.clone(),
        updated_at: now,
    };

    let mut app_state = state.lock().map_err(|e| e.to_string())?;
    app_state.environments.push(env.clone());
    persist_environment_state(&path, &app_state)?;

    Ok(env)
}

#[tauri::command]
pub fn list_environments(
    runtime: tauri::State<'_, Mutex<WorkspaceRuntimeState>>,
    state: tauri::State<'_, Mutex<AppState>>,
) -> Result<Vec<Environment>, String> {
    environment_file_path(&runtime)?;
    let app_state = state.lock().map_err(|e| e.to_string())?;
    Ok(app_state.environments.clone())
}

#[tauri::command]
pub fn update_environment(
    runtime: tauri::State<'_, Mutex<WorkspaceRuntimeState>>,
    state: tauri::State<'_, Mutex<AppState>>,
    id: String,
    name: String,
    variables: std::collections::HashMap<String, String>,
) -> Result<Environment, String> {
    let path = environment_file_path(&runtime)?;
    let mut app_state = state.lock().map_err(|e| e.to_string())?;

    let updated = {
        let env = app_state
            .environments
            .iter_mut()
            .find(|e| e.id == id)
            .ok_or_else(|| format!("Environment not found: {}", id))?;

        env.name = name;
        env.variables = variables;
        env.updated_at = chrono::Utc::now().to_rfc3339();
        env.clone()
    };
    persist_environment_state(&path, &app_state)?;

    Ok(updated)
}

#[tauri::command]
pub fn delete_environment(
    app_handle: tauri::AppHandle,
    runtime: tauri::State<'_, Mutex<WorkspaceRuntimeState>>,
    state: tauri::State<'_, Mutex<AppState>>,
    id: String,
) -> Result<(), String> {
    let path = environment_file_path(&runtime)?;
    let mut app_state = state.lock().map_err(|e| e.to_string())?;

    // If deleting the active environment, deactivate it
    if app_state.active_environment_id.as_deref() == Some(&id) {
        app_state.active_environment_id = None;
    }

    let before = app_state.environments.len();
    app_state.environments.retain(|e| e.id != id);

    if app_state.environments.len() == before {
        return Err(format!("Environment not found: {}", id));
    }
    persist_environment_state(&path, &app_state)?;
    persist_active_environment(
        &app_handle,
        &runtime,
        app_state.active_environment_id.as_deref(),
    )?;

    Ok(())
}

#[tauri::command]
pub fn set_active_environment(
    app_handle: tauri::AppHandle,
    runtime: tauri::State<'_, Mutex<WorkspaceRuntimeState>>,
    state: tauri::State<'_, Mutex<AppState>>,
    id: Option<String>,
) -> Result<(), String> {
    environment_file_path(&runtime)?;
    let mut app_state = state.lock().map_err(|e| e.to_string())?;

    // Validate that the environment exists (if setting, not clearing)
    if let Some(ref env_id) = id {
        if !app_state.environments.iter().any(|e| &e.id == env_id) {
            return Err(format!("Environment not found: {}", env_id));
        }
    }

    app_state.active_environment_id = id;
    persist_active_environment(
        &app_handle,
        &runtime,
        app_state.active_environment_id.as_deref(),
    )?;
    Ok(())
}

#[tauri::command]
pub fn get_active_environment(
    runtime: tauri::State<'_, Mutex<WorkspaceRuntimeState>>,
    state: tauri::State<'_, Mutex<AppState>>,
) -> Result<Option<Environment>, String> {
    environment_file_path(&runtime)?;
    let app_state = state.lock().map_err(|e| e.to_string())?;

    let active = app_state
        .active_environment_id
        .as_ref()
        .and_then(|id| app_state.environments.iter().find(|e| &e.id == id))
        .cloned();

    Ok(active)
}
