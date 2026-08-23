use crate::models::history::HistoryItem;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Manager;

use crate::models::workspace::WorkspaceRuntimeState;
use crate::services::storage_service::write_json_atomic;

fn history_file_path(
    app_handle: &tauri::AppHandle,
    runtime: &Mutex<WorkspaceRuntimeState>,
) -> Result<PathBuf, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    let workspace_id = runtime
        .lock()
        .map_err(|error| error.to_string())?
        .current_workspace
        .as_ref()
        .ok_or_else(|| "No workspace is currently open".to_string())?
        .manifest
        .id
        .clone();
    let history_dir = app_data_dir.join("history");

    fs::create_dir_all(&history_dir)
        .map_err(|e| format!("Failed to create app data dir: {}", e))?;

    Ok(history_dir.join(format!("{workspace_id}.json")))
}

#[tauri::command]
pub async fn save_history(
    app_handle: tauri::AppHandle,
    runtime: tauri::State<'_, Mutex<WorkspaceRuntimeState>>,
    item: HistoryItem,
) -> Result<(), String> {
    let path = history_file_path(&app_handle, &runtime)?;

    // Load existing history
    let mut history = load_history_from_file(&path)?;

    // Add new item at the beginning
    history.insert(0, item);

    // Keep max 100 entries
    history.truncate(100);

    // Write back
    write_json_atomic(&path, &history, "history")?;

    Ok(())
}

#[tauri::command]
pub async fn load_history(
    app_handle: tauri::AppHandle,
    runtime: tauri::State<'_, Mutex<WorkspaceRuntimeState>>,
) -> Result<Vec<HistoryItem>, String> {
    let path = history_file_path(&app_handle, &runtime)?;
    load_history_from_file(&path)
}

#[tauri::command]
pub async fn clear_history(
    app_handle: tauri::AppHandle,
    runtime: tauri::State<'_, Mutex<WorkspaceRuntimeState>>,
) -> Result<(), String> {
    let path = history_file_path(&app_handle, &runtime)?;

    if path.exists() {
        fs::remove_file(&path).map_err(|e| format!("Failed to delete history file: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
pub async fn delete_history_item(
    app_handle: tauri::AppHandle,
    runtime: tauri::State<'_, Mutex<WorkspaceRuntimeState>>,
    id: String,
) -> Result<(), String> {
    let path = history_file_path(&app_handle, &runtime)?;
    if !path.exists() {
        return Ok(());
    }

    let mut history = load_history_from_file(&path)?;
    history.retain(|item| item.id != id);

    write_json_atomic(&path, &history, "history")?;

    Ok(())
}

fn load_history_from_file(path: &PathBuf) -> Result<Vec<HistoryItem>, String> {
    if !path.exists() {
        return Ok(Vec::new());
    }

    let content =
        fs::read_to_string(path).map_err(|e| format!("Failed to read history file: {}", e))?;

    if content.trim().is_empty() {
        return Ok(Vec::new());
    }

    serde_json::from_str(&content).map_err(|e| format!("Failed to parse history file: {}", e))
}
