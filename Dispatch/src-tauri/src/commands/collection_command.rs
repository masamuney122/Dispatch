use std::path::{Path, PathBuf};
use std::sync::Mutex;

use chrono::Utc;

use crate::models::collection::{Collection, Folder, OrderItem, SavedRequest};
use crate::models::request::{ApiRequest, RequestBodyType};
use crate::models::workspace::{
    CollectionsDocument, WorkspaceRuntimeState, COLLECTIONS_FILE, WORKSPACE_SCHEMA_VERSION,
};
use crate::services::storage_service::{read_json, write_json_atomic};
use crate::services::workspace_service::workspace_file;

fn collections_file_path(runtime: &Mutex<WorkspaceRuntimeState>) -> Result<PathBuf, String> {
    let runtime = runtime.lock().map_err(|error| error.to_string())?;
    let session = runtime
        .current_workspace
        .as_ref()
        .ok_or_else(|| "No workspace is currently open".to_string())?;
    Ok(workspace_file(session, COLLECTIONS_FILE))
}

fn load_from_file(path: &Path) -> Result<Vec<Collection>, String> {
    let document: CollectionsDocument = read_json(path, "collections document")?;
    if document.schema_version != WORKSPACE_SCHEMA_VERSION {
        return Err(format!(
            "Unsupported collections schema version: {}",
            document.schema_version
        ));
    }
    Ok(document.collections)
}

fn write_to_file(path: &Path, collections: &[Collection]) -> Result<(), String> {
    let mut document: CollectionsDocument = read_json(path, "collections document")?;
    document.revision = document.revision.saturating_add(1);
    document.updated_at = Utc::now().to_rfc3339();
    document.collections = collections.to_vec();
    write_json_atomic(path, &document, "collections document")
}

fn max_sibling_order(collection: &Collection, parent_folder_id: &Option<String>) -> i64 {
    let folder_orders = collection
        .folders
        .iter()
        .filter(|folder| &folder.parent_folder_id == parent_folder_id)
        .map(|folder| folder.order);
    let request_orders = collection
        .requests
        .iter()
        .filter(|request| &request.folder_id == parent_folder_id)
        .map(|request| request.order);

    folder_orders.chain(request_orders).max().unwrap_or(-1)
}

// ── Collection CRUD ───────────────────────────────────────────────────────────

#[tauri::command]
pub fn list_collections(
    runtime: tauri::State<'_, Mutex<WorkspaceRuntimeState>>,
) -> Result<Vec<Collection>, String> {
    load_from_file(&collections_file_path(&runtime)?)
}

#[tauri::command]
pub fn create_collection(
    runtime: tauri::State<'_, Mutex<WorkspaceRuntimeState>>,
    name: String,
) -> Result<Collection, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("Collection name cannot be empty.".to_string());
    }

    let path = collections_file_path(&runtime)?;
    let mut collections = load_from_file(&path)?;
    let now = Utc::now().to_rfc3339();
    let collection = Collection {
        id: uuid::Uuid::new_v4().to_string(),
        name: name.to_string(),
        folders: Vec::new(),
        requests: Vec::new(),
        created_at: now.clone(),
        updated_at: now,
    };
    collections.push(collection.clone());
    write_to_file(&path, &collections)?;
    Ok(collection)
}

#[tauri::command]
pub fn delete_collection(
    runtime: tauri::State<'_, Mutex<WorkspaceRuntimeState>>,
    id: String,
) -> Result<(), String> {
    let path = collections_file_path(&runtime)?;
    let mut collections = load_from_file(&path)?;
    let count_before = collections.len();
    collections.retain(|collection| collection.id != id);
    if collections.len() == count_before {
        return Err(format!("Collection not found: {id}"));
    }
    write_to_file(&path, &collections)
}

#[tauri::command]
pub fn rename_collection(
    runtime: tauri::State<'_, Mutex<WorkspaceRuntimeState>>,
    id: String,
    name: String,
) -> Result<(), String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("Collection name cannot be empty.".to_string());
    }

    let path = collections_file_path(&runtime)?;
    let mut collections = load_from_file(&path)?;
    let collection = collections
        .iter_mut()
        .find(|c| c.id == id)
        .ok_or_else(|| format!("Collection not found: {id}"))?;

    collection.name = name.to_string();
    collection.updated_at = Utc::now().to_rfc3339();
    write_to_file(&path, &collections)
}

// ── Folder CRUD ───────────────────────────────────────────────────────────────

#[tauri::command]
pub fn create_folder(
    runtime: tauri::State<'_, Mutex<WorkspaceRuntimeState>>,
    collection_id: String,
    name: String,
    parent_folder_id: Option<String>,
) -> Result<Folder, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("Folder name cannot be empty.".to_string());
    }

    let path = collections_file_path(&runtime)?;
    let mut collections = load_from_file(&path)?;
    let collection = collections
        .iter_mut()
        .find(|c| c.id == collection_id)
        .ok_or_else(|| format!("Collection not found: {collection_id}"))?;

    // Validate parent folder exists
    if let Some(ref parent_id) = parent_folder_id {
        if !collection.folders.iter().any(|f| &f.id == parent_id) {
            return Err(format!("Parent folder not found: {parent_id}"));
        }
    }

    // Folders and requests share one sibling order sequence.
    let sibling_max_order = max_sibling_order(collection, &parent_folder_id);

    let now = Utc::now().to_rfc3339();
    let folder = Folder {
        id: uuid::Uuid::new_v4().to_string(),
        name: name.to_string(),
        collection_id: collection_id.clone(),
        parent_folder_id,
        order: sibling_max_order + 1,
        created_at: now.clone(),
        updated_at: now.clone(),
    };
    collection.folders.push(folder.clone());
    collection.updated_at = now;
    write_to_file(&path, &collections)?;
    Ok(folder)
}

#[tauri::command]
pub fn rename_folder(
    runtime: tauri::State<'_, Mutex<WorkspaceRuntimeState>>,
    collection_id: String,
    folder_id: String,
    name: String,
) -> Result<(), String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("Folder name cannot be empty.".to_string());
    }

    let path = collections_file_path(&runtime)?;
    let mut collections = load_from_file(&path)?;
    let collection = collections
        .iter_mut()
        .find(|c| c.id == collection_id)
        .ok_or_else(|| format!("Collection not found: {collection_id}"))?;

    let folder = collection
        .folders
        .iter_mut()
        .find(|f| f.id == folder_id)
        .ok_or_else(|| format!("Folder not found: {folder_id}"))?;

    let now = Utc::now().to_rfc3339();
    folder.name = name.to_string();
    folder.updated_at = now.clone();
    collection.updated_at = now;
    write_to_file(&path, &collections)
}

/// Recursively collects all descendant folder IDs of `root_folder_id`.
fn collect_descendant_folder_ids(folders: &[Folder], root_folder_id: &str) -> Vec<String> {
    let mut result = Vec::new();
    let direct_children: Vec<&Folder> = folders
        .iter()
        .filter(|f| f.parent_folder_id.as_deref() == Some(root_folder_id))
        .collect();
    for child in direct_children {
        result.push(child.id.clone());
        result.extend(collect_descendant_folder_ids(folders, &child.id));
    }
    result
}

#[tauri::command]
pub fn delete_folder(
    runtime: tauri::State<'_, Mutex<WorkspaceRuntimeState>>,
    collection_id: String,
    folder_id: String,
) -> Result<(), String> {
    let path = collections_file_path(&runtime)?;
    let mut collections = load_from_file(&path)?;
    let collection = collections
        .iter_mut()
        .find(|c| c.id == collection_id)
        .ok_or_else(|| format!("Collection not found: {collection_id}"))?;

    if !collection.folders.iter().any(|f| f.id == folder_id) {
        return Err(format!("Folder not found: {folder_id}"));
    }

    // Collect the target folder + all descendants
    let mut all_folder_ids = collect_descendant_folder_ids(&collection.folders, &folder_id);
    all_folder_ids.push(folder_id.clone());

    collection
        .folders
        .retain(|f| !all_folder_ids.contains(&f.id));
    collection.requests.retain(|r| match &r.folder_id {
        Some(fid) => !all_folder_ids.contains(fid),
        None => true,
    });

    collection.updated_at = Utc::now().to_rfc3339();
    write_to_file(&path, &collections)
}

/// Recursively duplicate a folder subtree, generating new UUIDs for all nodes.
fn duplicate_folder_recursive(
    source_folders: &[Folder],
    source_requests: &[SavedRequest],
    source_id: &str,
    new_parent_folder_id: Option<String>,
    collection_id: &str,
    now: &str,
    next_order: i64,
) -> (Vec<Folder>, Vec<SavedRequest>) {
    let source_folder = match source_folders.iter().find(|f| f.id == source_id) {
        Some(f) => f,
        None => return (vec![], vec![]),
    };

    let new_folder_id = uuid::Uuid::new_v4().to_string();
    let new_folder = Folder {
        id: new_folder_id.clone(),
        name: format!("{} Copy", source_folder.name),
        collection_id: collection_id.to_string(),
        parent_folder_id: new_parent_folder_id,
        order: next_order,
        created_at: now.to_string(),
        updated_at: now.to_string(),
    };

    let mut all_folders = vec![new_folder];
    let mut all_requests: Vec<SavedRequest> = Vec::new();

    // Copy direct requests
    let child_requests: Vec<&SavedRequest> = source_requests
        .iter()
        .filter(|r| r.folder_id.as_deref() == Some(source_id))
        .collect();

    for (i, req) in child_requests.iter().enumerate() {
        all_requests.push(SavedRequest {
            id: uuid::Uuid::new_v4().to_string(),
            name: req.name.clone(),
            request: req.request.clone(),
            folder_id: Some(new_folder_id.clone()),
            order: i as i64,
            created_at: now.to_string(),
            updated_at: now.to_string(),
        });
    }

    // Recurse into child folders
    let child_folders: Vec<&Folder> = source_folders
        .iter()
        .filter(|f| f.parent_folder_id.as_deref() == Some(source_id))
        .collect();

    for (i, child) in child_folders.iter().enumerate() {
        let (sub_folders, sub_requests) = duplicate_folder_recursive(
            source_folders,
            source_requests,
            &child.id,
            Some(new_folder_id.clone()),
            collection_id,
            now,
            i as i64,
        );
        all_folders.extend(sub_folders);
        all_requests.extend(sub_requests);
    }

    (all_folders, all_requests)
}

#[tauri::command]
pub fn duplicate_folder(
    runtime: tauri::State<'_, Mutex<WorkspaceRuntimeState>>,
    collection_id: String,
    folder_id: String,
) -> Result<Folder, String> {
    let path = collections_file_path(&runtime)?;
    let mut collections = load_from_file(&path)?;
    let collection = collections
        .iter_mut()
        .find(|c| c.id == collection_id)
        .ok_or_else(|| format!("Collection not found: {collection_id}"))?;

    let source_folder = collection
        .folders
        .iter()
        .find(|f| f.id == folder_id)
        .ok_or_else(|| format!("Folder not found: {folder_id}"))?;

    let parent_folder_id = source_folder.parent_folder_id.clone();

    // Calculate next order after every folder/request sibling.
    let sibling_max_order = max_sibling_order(collection, &parent_folder_id);

    let now = Utc::now().to_rfc3339();
    let (new_folders, new_requests) = duplicate_folder_recursive(
        &collection.folders.clone(),
        &collection.requests.clone(),
        &folder_id,
        parent_folder_id,
        &collection_id,
        &now,
        sibling_max_order + 1,
    );

    let root_folder = new_folders[0].clone();
    collection.folders.extend(new_folders);
    collection.requests.extend(new_requests);
    collection.updated_at = now;

    write_to_file(&path, &collections)?;
    Ok(root_folder)
}

// ── Request CRUD ──────────────────────────────────────────────────────────────

/// Create a new empty request directly in a collection (optionally inside a folder).
#[tauri::command]
pub fn create_request_in_collection(
    runtime: tauri::State<'_, Mutex<WorkspaceRuntimeState>>,
    collection_id: String,
    folder_id: Option<String>,
    name: String,
) -> Result<SavedRequest, String> {
    let path = collections_file_path(&runtime)?;
    let mut collections = load_from_file(&path)?;
    let collection = collections
        .iter_mut()
        .find(|c| c.id == collection_id)
        .ok_or_else(|| format!("Collection not found: {collection_id}"))?;

    if let Some(ref fid) = folder_id {
        if !collection.folders.iter().any(|f| &f.id == fid) {
            return Err(format!("Folder not found: {fid}"));
        }
    }

    // Folders and requests share one sibling order sequence.
    let sibling_max_order = max_sibling_order(collection, &folder_id);

    let now = Utc::now().to_rfc3339();
    let req_name = if name.trim().is_empty() {
        "New Request".to_string()
    } else {
        name.trim().to_string()
    };
    let saved_request = SavedRequest {
        id: uuid::Uuid::new_v4().to_string(),
        name: req_name,
        request: ApiRequest {
            method: "GET".to_string(),
            url: "".to_string(),
            body: "".to_string(),
            body_type: RequestBodyType::None,
            form_fields: vec![],
            binary: None,
            headers: Default::default(),
            auth: None,
            settings: Default::default(),
        },
        folder_id,
        order: sibling_max_order + 1,
        created_at: now.clone(),
        updated_at: now.clone(),
    };
    collection.requests.push(saved_request.clone());
    collection.updated_at = now;
    write_to_file(&path, &collections)?;
    Ok(saved_request)
}

#[tauri::command]
pub fn save_request_to_collection(
    runtime: tauri::State<'_, Mutex<WorkspaceRuntimeState>>,
    collection_id: String,
    name: String,
    request: ApiRequest,
    folder_id: Option<String>,
) -> Result<SavedRequest, String> {
    let path = collections_file_path(&runtime)?;
    let mut collections = load_from_file(&path)?;
    let collection = collections
        .iter_mut()
        .find(|collection| collection.id == collection_id)
        .ok_or_else(|| format!("Collection not found: {collection_id}"))?;

    if let Some(ref fid) = folder_id {
        if !collection.folders.iter().any(|f| &f.id == fid) {
            return Err(format!("Folder not found: {fid}"));
        }
    }

    let sibling_max_order = max_sibling_order(collection, &folder_id);

    let now = Utc::now().to_rfc3339();
    let saved_request = SavedRequest {
        id: uuid::Uuid::new_v4().to_string(),
        name: if name.trim().is_empty() {
            "Untitled Request".to_string()
        } else {
            name.trim().to_string()
        },
        request,
        folder_id,
        order: sibling_max_order + 1,
        created_at: now.clone(),
        updated_at: now.clone(),
    };
    collection.requests.push(saved_request.clone());
    collection.updated_at = now;
    write_to_file(&path, &collections)?;
    Ok(saved_request)
}

#[tauri::command]
pub fn update_request_in_collection(
    runtime: tauri::State<'_, Mutex<WorkspaceRuntimeState>>,
    collection_id: String,
    request_id: String,
    name: String,
    request: ApiRequest,
) -> Result<SavedRequest, String> {
    let path = collections_file_path(&runtime)?;
    let mut collections = load_from_file(&path)?;
    let collection = collections
        .iter_mut()
        .find(|c| c.id == collection_id)
        .ok_or_else(|| format!("Collection not found: {collection_id}"))?;

    let saved_request = collection
        .requests
        .iter_mut()
        .find(|r| r.id == request_id)
        .ok_or_else(|| format!("Request not found: {request_id}"))?;

    let now = Utc::now().to_rfc3339();
    saved_request.name = if name.trim().is_empty() {
        "Untitled Request".to_string()
    } else {
        name.trim().to_string()
    };
    saved_request.request = request;
    saved_request.updated_at = now.clone();
    collection.updated_at = now;

    let updated_req = saved_request.clone();
    write_to_file(&path, &collections)?;
    Ok(updated_req)
}

#[tauri::command]
pub fn rename_request_in_collection(
    runtime: tauri::State<'_, Mutex<WorkspaceRuntimeState>>,
    collection_id: String,
    request_id: String,
    name: String,
) -> Result<SavedRequest, String> {
    let trimmed_name = name.trim();
    if trimmed_name.is_empty() {
        return Err("Request name cannot be empty.".to_string());
    }

    let path = collections_file_path(&runtime)?;
    let mut collections = load_from_file(&path)?;
    let collection = collections
        .iter_mut()
        .find(|collection| collection.id == collection_id)
        .ok_or_else(|| format!("Collection not found: {collection_id}"))?;
    let request = collection
        .requests
        .iter_mut()
        .find(|request| request.id == request_id)
        .ok_or_else(|| format!("Request not found: {request_id}"))?;

    let now = Utc::now().to_rfc3339();
    request.name = trimmed_name.to_string();
    request.updated_at = now.clone();
    let updated = request.clone();
    collection.updated_at = now;
    write_to_file(&path, &collections)?;
    Ok(updated)
}

#[tauri::command]
pub fn duplicate_request_in_collection(
    runtime: tauri::State<'_, Mutex<WorkspaceRuntimeState>>,
    collection_id: String,
    request_id: String,
) -> Result<SavedRequest, String> {
    let path = collections_file_path(&runtime)?;
    let mut collections = load_from_file(&path)?;
    let collection = collections
        .iter_mut()
        .find(|collection| collection.id == collection_id)
        .ok_or_else(|| format!("Collection not found: {collection_id}"))?;
    let original = collection
        .requests
        .iter()
        .find(|request| request.id == request_id)
        .cloned()
        .ok_or_else(|| format!("Request not found: {request_id}"))?;

    for folder in collection.folders.iter_mut().filter(|folder| {
        folder.parent_folder_id == original.folder_id && folder.order > original.order
    }) {
        folder.order += 1;
    }
    for request in collection
        .requests
        .iter_mut()
        .filter(|request| request.folder_id == original.folder_id && request.order > original.order)
    {
        request.order += 1;
    }

    let now = Utc::now().to_rfc3339();
    let mut duplicate = original;
    duplicate.id = uuid::Uuid::new_v4().to_string();
    duplicate.name = format!("{} Copy", duplicate.name.trim());
    duplicate.order += 1;
    duplicate.created_at = now.clone();
    duplicate.updated_at = now.clone();
    collection.requests.push(duplicate.clone());
    collection.updated_at = now;
    write_to_file(&path, &collections)?;
    Ok(duplicate)
}

#[tauri::command]
pub fn delete_request_from_collection(
    runtime: tauri::State<'_, Mutex<WorkspaceRuntimeState>>,
    collection_id: String,
    request_id: String,
) -> Result<(), String> {
    let path = collections_file_path(&runtime)?;
    let mut collections = load_from_file(&path)?;
    let collection = collections
        .iter_mut()
        .find(|collection| collection.id == collection_id)
        .ok_or_else(|| format!("Collection not found: {collection_id}"))?;
    let original_len = collection.requests.len();
    collection
        .requests
        .retain(|request| request.id != request_id);
    if collection.requests.len() == original_len {
        return Err(format!("Request not found: {request_id}"));
    }
    collection.updated_at = Utc::now().to_rfc3339();
    write_to_file(&path, &collections)
}

/// Atomically update parent_folder_id and order for a batch of items.
/// This is called after every drag-and-drop reorder.
#[tauri::command]
pub fn reorder_items(
    runtime: tauri::State<'_, Mutex<WorkspaceRuntimeState>>,
    collection_id: String,
    items: Vec<OrderItem>,
) -> Result<(), String> {
    let path = collections_file_path(&runtime)?;
    let mut collections = load_from_file(&path)?;
    let collection = collections
        .iter_mut()
        .find(|c| c.id == collection_id)
        .ok_or_else(|| format!("Collection not found: {collection_id}"))?;

    let now = Utc::now().to_rfc3339();

    for item in &items {
        match item.item_type.as_str() {
            "folder" => {
                if let Some(folder) = collection.folders.iter_mut().find(|f| f.id == item.id) {
                    folder.parent_folder_id = item.parent_folder_id.clone();
                    folder.order = item.order;
                    folder.updated_at = now.clone();
                }
            }
            "request" => {
                if let Some(req) = collection.requests.iter_mut().find(|r| r.id == item.id) {
                    req.folder_id = item.parent_folder_id.clone();
                    req.order = item.order;
                    req.updated_at = now.clone();
                }
            }
            _ => {}
        }
    }

    collection.updated_at = now;
    write_to_file(&path, &collections)
}
