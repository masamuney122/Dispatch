use std::path::PathBuf;
use std::sync::Mutex;

use chrono::Utc;
use dispatch_core::{
    apply_collection_mutation, ApiRequest, CollectionMutation, CollectionMutationResult,
    MutationContext, RequestBodyType,
};
use serde::de::DeserializeOwned;

use crate::models::collection::{Collection, Folder, OrderItem, SavedRequest};
use crate::models::workspace::{WorkspaceRuntimeState, COLLECTIONS_FILE};
use crate::services::workspace_document_service::{load_collections, save_collections};
use crate::services::workspace_service::workspace_file;

fn collections_file_path(runtime: &Mutex<WorkspaceRuntimeState>) -> Result<PathBuf, String> {
    let runtime = runtime.lock().map_err(|error| error.to_string())?;
    let session = runtime
        .current_workspace
        .as_ref()
        .ok_or_else(|| "No workspace is currently open".to_string())?;
    Ok(workspace_file(session, COLLECTIONS_FILE))
}

fn mutation_context(needs_entity_id: bool) -> MutationContext {
    MutationContext {
        timestamp: Utc::now().to_rfc3339(),
        entity_id: if needs_entity_id {
            uuid::Uuid::new_v4().to_string()
        } else {
            String::new()
        },
        id_prefix: uuid::Uuid::new_v4().to_string(),
    }
}

fn execute(
    runtime: &Mutex<WorkspaceRuntimeState>,
    mutation: CollectionMutation,
    needs_entity_id: bool,
) -> Result<CollectionMutationResult, String> {
    let path = collections_file_path(runtime)?;
    let collections = load_collections(&path)?;
    let result =
        apply_collection_mutation(&collections, mutation, &mutation_context(needs_entity_id))?;
    save_collections(&path, &result.collections)?;
    Ok(result)
}

fn entity<T: DeserializeOwned>(result: CollectionMutationResult) -> Result<T, String> {
    serde_json::from_value(
        result
            .entity
            .ok_or_else(|| "Collection operation did not return an entity".to_string())?,
    )
    .map_err(|error| format!("Failed to read collection operation result: {error}"))
}

#[tauri::command]
pub fn list_collections(
    runtime: tauri::State<'_, Mutex<WorkspaceRuntimeState>>,
) -> Result<Vec<Collection>, String> {
    load_collections(&collections_file_path(runtime.inner())?)
}

#[tauri::command]
pub fn create_collection(
    runtime: tauri::State<'_, Mutex<WorkspaceRuntimeState>>,
    name: String,
) -> Result<Collection, String> {
    entity(execute(
        runtime.inner(),
        CollectionMutation::CreateCollection { name },
        true,
    )?)
}

#[tauri::command]
pub fn delete_collection(
    runtime: tauri::State<'_, Mutex<WorkspaceRuntimeState>>,
    id: String,
) -> Result<(), String> {
    execute(
        runtime.inner(),
        CollectionMutation::DeleteCollection { collection_id: id },
        false,
    )?;
    Ok(())
}

#[tauri::command]
pub fn rename_collection(
    runtime: tauri::State<'_, Mutex<WorkspaceRuntimeState>>,
    id: String,
    name: String,
) -> Result<(), String> {
    execute(
        runtime.inner(),
        CollectionMutation::RenameCollection {
            collection_id: id,
            name,
        },
        false,
    )?;
    Ok(())
}

#[tauri::command]
pub fn create_folder(
    runtime: tauri::State<'_, Mutex<WorkspaceRuntimeState>>,
    collection_id: String,
    name: String,
    parent_folder_id: Option<String>,
) -> Result<Folder, String> {
    entity(execute(
        runtime.inner(),
        CollectionMutation::CreateFolder {
            collection_id,
            name,
            parent_folder_id,
        },
        true,
    )?)
}

#[tauri::command]
pub fn rename_folder(
    runtime: tauri::State<'_, Mutex<WorkspaceRuntimeState>>,
    collection_id: String,
    folder_id: String,
    name: String,
) -> Result<(), String> {
    execute(
        runtime.inner(),
        CollectionMutation::RenameFolder {
            collection_id,
            folder_id,
            name,
        },
        false,
    )?;
    Ok(())
}

#[tauri::command]
pub fn delete_folder(
    runtime: tauri::State<'_, Mutex<WorkspaceRuntimeState>>,
    collection_id: String,
    folder_id: String,
) -> Result<(), String> {
    execute(
        runtime.inner(),
        CollectionMutation::DeleteFolder {
            collection_id,
            folder_id,
        },
        false,
    )?;
    Ok(())
}

#[tauri::command]
pub fn duplicate_folder(
    runtime: tauri::State<'_, Mutex<WorkspaceRuntimeState>>,
    collection_id: String,
    folder_id: String,
) -> Result<Folder, String> {
    entity(execute(
        runtime.inner(),
        CollectionMutation::DuplicateFolder {
            collection_id,
            folder_id,
        },
        false,
    )?)
}

#[tauri::command]
pub fn create_request_in_collection(
    runtime: tauri::State<'_, Mutex<WorkspaceRuntimeState>>,
    collection_id: String,
    folder_id: Option<String>,
    name: String,
) -> Result<SavedRequest, String> {
    let request = ApiRequest {
        method: "GET".to_string(),
        url: String::new(),
        body: String::new(),
        body_type: RequestBodyType::None,
        form_fields: Vec::new(),
        binary: None,
        headers: Default::default(),
        auth: None,
        settings: Default::default(),
        scripts: Default::default(),
    };
    save_request_to_collection(
        runtime,
        collection_id,
        if name.trim().is_empty() {
            "New Request".to_string()
        } else {
            name
        },
        request,
        folder_id,
    )
}

#[tauri::command]
pub fn save_request_to_collection(
    runtime: tauri::State<'_, Mutex<WorkspaceRuntimeState>>,
    collection_id: String,
    name: String,
    request: ApiRequest,
    folder_id: Option<String>,
) -> Result<SavedRequest, String> {
    entity(execute(
        runtime.inner(),
        CollectionMutation::SaveRequest {
            collection_id,
            name,
            request,
            folder_id,
        },
        true,
    )?)
}

#[tauri::command]
pub fn update_request_in_collection(
    runtime: tauri::State<'_, Mutex<WorkspaceRuntimeState>>,
    collection_id: String,
    request_id: String,
    name: String,
    request: ApiRequest,
) -> Result<SavedRequest, String> {
    entity(execute(
        runtime.inner(),
        CollectionMutation::UpdateRequest {
            collection_id,
            request_id,
            name,
            request,
        },
        false,
    )?)
}

#[tauri::command]
pub fn rename_request_in_collection(
    runtime: tauri::State<'_, Mutex<WorkspaceRuntimeState>>,
    collection_id: String,
    request_id: String,
    name: String,
) -> Result<SavedRequest, String> {
    entity(execute(
        runtime.inner(),
        CollectionMutation::RenameRequest {
            collection_id,
            request_id,
            name,
        },
        false,
    )?)
}

#[tauri::command]
pub fn duplicate_request_in_collection(
    runtime: tauri::State<'_, Mutex<WorkspaceRuntimeState>>,
    collection_id: String,
    request_id: String,
) -> Result<SavedRequest, String> {
    entity(execute(
        runtime.inner(),
        CollectionMutation::DuplicateRequest {
            collection_id,
            request_id,
        },
        true,
    )?)
}

#[tauri::command]
pub fn delete_request_from_collection(
    runtime: tauri::State<'_, Mutex<WorkspaceRuntimeState>>,
    collection_id: String,
    request_id: String,
) -> Result<(), String> {
    execute(
        runtime.inner(),
        CollectionMutation::DeleteRequest {
            collection_id,
            request_id,
        },
        false,
    )?;
    Ok(())
}

#[tauri::command]
pub fn reorder_items(
    runtime: tauri::State<'_, Mutex<WorkspaceRuntimeState>>,
    collection_id: String,
    items: Vec<OrderItem>,
) -> Result<(), String> {
    execute(
        runtime.inner(),
        CollectionMutation::Reorder {
            collection_id,
            items,
        },
        false,
    )?;
    Ok(())
}
