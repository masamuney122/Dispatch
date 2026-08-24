use std::path::PathBuf;
use std::sync::Mutex;

use crate::models::environment::AppState;
use crate::models::openapi::{
    OpenApiExportOptions, OpenApiExportResult, OpenApiImportOptions, OpenApiImportPreview,
    OpenApiImportResult, OpenApiSource,
};
use crate::models::workspace::WorkspaceRuntimeState;
use crate::services::openapi_service;

#[tauri::command]
pub fn inspect_openapi(source: OpenApiSource) -> Result<OpenApiImportPreview, String> {
    openapi_service::inspect_openapi_source(&source)
}

#[tauri::command]
pub fn import_openapi(
    runtime: tauri::State<'_, Mutex<WorkspaceRuntimeState>>,
    environment_state: tauri::State<'_, Mutex<AppState>>,
    source: OpenApiSource,
    options: OpenApiImportOptions,
) -> Result<OpenApiImportResult, String> {
    let session = runtime
        .lock()
        .map_err(|error| error.to_string())?
        .current_workspace
        .clone()
        .ok_or_else(|| "No workspace is currently open".to_string())?;
    let mut environment_state = environment_state
        .lock()
        .map_err(|error| error.to_string())?;
    openapi_service::import_openapi_source(&session, &mut environment_state, &source, &options)
}

#[tauri::command]
pub fn export_collection_openapi(
    runtime: tauri::State<'_, Mutex<WorkspaceRuntimeState>>,
    collection_id: String,
    path: String,
    options: OpenApiExportOptions,
) -> Result<OpenApiExportResult, String> {
    let session = runtime
        .lock()
        .map_err(|error| error.to_string())?
        .current_workspace
        .clone()
        .ok_or_else(|| "No workspace is currently open".to_string())?;
    openapi_service::export_collection(&session, &collection_id, &PathBuf::from(path), &options)
}
