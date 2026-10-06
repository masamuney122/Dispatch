use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Manager;

use dispatch_core::{
    apply_environment_mutation, EnvironmentMutation, EnvironmentMutationContext,
    EnvironmentMutationResult,
};

use crate::models::environment::{AppState, Environment};
use crate::models::workspace::{WorkspaceRuntimeState, ENVIRONMENTS_FILE};
use crate::services::workspace_document_service::save_environments;
use crate::services::workspace_service::{save_settings, workspace_file};

fn environment_file_path(runtime: &Mutex<WorkspaceRuntimeState>) -> Result<PathBuf, String> {
    let runtime = runtime.lock().map_err(|error| error.to_string())?;
    let session = runtime
        .current_workspace
        .as_ref()
        .ok_or_else(|| "No workspace is currently open".to_string())?;
    Ok(workspace_file(session, ENVIRONMENTS_FILE))
}

fn workspace_id(runtime: &Mutex<WorkspaceRuntimeState>) -> Result<String, String> {
    let runtime = runtime.lock().map_err(|error| error.to_string())?;
    Ok(runtime
        .current_workspace
        .as_ref()
        .ok_or_else(|| "No workspace is currently open".to_string())?
        .manifest
        .id
        .clone())
}

fn mutate_environment_state(
    state: &mut AppState,
    workspace_id: &str,
    mutation: EnvironmentMutation,
    needs_entity_id: bool,
) -> Result<EnvironmentMutationResult, String> {
    let result = apply_environment_mutation(
        &state.environments,
        state.active_environment_id.as_deref(),
        mutation,
        &EnvironmentMutationContext {
            timestamp: chrono::Utc::now().to_rfc3339(),
            entity_id: if needs_entity_id {
                uuid::Uuid::new_v4().to_string()
            } else {
                String::new()
            },
            workspace_id: workspace_id.to_string(),
        },
    )?;
    state.environments = result.environments.clone();
    state.active_environment_id = result.active_environment_id.clone();
    Ok(result)
}

fn result_environment(result: &EnvironmentMutationResult) -> Result<Environment, String> {
    result
        .environment
        .clone()
        .ok_or_else(|| "Environment operation did not return an entity".to_string())
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
    let path = environment_file_path(runtime.inner())?;
    let workspace_id = workspace_id(runtime.inner())?;
    let mut app_state = state.lock().map_err(|e| e.to_string())?;
    let result = mutate_environment_state(
        &mut app_state,
        &workspace_id,
        EnvironmentMutation::Create { name, variables },
        true,
    )?;
    save_environments(&path, &app_state.environments)?;
    result_environment(&result)
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
    let path = environment_file_path(runtime.inner())?;
    let workspace_id = workspace_id(runtime.inner())?;
    let mut app_state = state.lock().map_err(|e| e.to_string())?;
    let result = mutate_environment_state(
        &mut app_state,
        &workspace_id,
        EnvironmentMutation::Update {
            id,
            name,
            variables,
        },
        false,
    )?;
    save_environments(&path, &app_state.environments)?;
    result_environment(&result)
}

#[tauri::command]
pub fn delete_environment(
    app_handle: tauri::AppHandle,
    runtime: tauri::State<'_, Mutex<WorkspaceRuntimeState>>,
    state: tauri::State<'_, Mutex<AppState>>,
    id: String,
) -> Result<(), String> {
    let path = environment_file_path(runtime.inner())?;
    let workspace_id = workspace_id(runtime.inner())?;
    let mut app_state = state.lock().map_err(|e| e.to_string())?;
    mutate_environment_state(
        &mut app_state,
        &workspace_id,
        EnvironmentMutation::Delete { id },
        false,
    )?;
    save_environments(&path, &app_state.environments)?;
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
    environment_file_path(runtime.inner())?;
    let workspace_id = workspace_id(runtime.inner())?;
    let mut app_state = state.lock().map_err(|e| e.to_string())?;
    mutate_environment_state(
        &mut app_state,
        &workspace_id,
        EnvironmentMutation::SetActive { id },
        false,
    )?;
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
