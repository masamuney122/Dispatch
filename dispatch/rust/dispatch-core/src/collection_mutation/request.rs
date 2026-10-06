use crate::{ApiRequest, Collection, SavedRequest};

use super::{MutationContext, folder::validate_parent, require_entity_id, sibling_max_order};

pub(super) fn save(
    collection: &mut Collection,
    name: &str,
    request: ApiRequest,
    folder_id: Option<String>,
    context: &MutationContext,
) -> Result<SavedRequest, String> {
    validate_parent(collection, folder_id.as_deref())?;
    let saved = SavedRequest {
        id: require_entity_id(context)?.to_string(),
        name: request_name(name),
        request,
        order: sibling_max_order(collection, &folder_id) + 1,
        folder_id,
        created_at: context.timestamp.clone(),
        updated_at: context.timestamp.clone(),
    };
    collection.requests.push(saved.clone());
    collection.updated_at = context.timestamp.clone();
    Ok(saved)
}

pub(super) fn update(
    collection: &mut Collection,
    request_id: &str,
    name: &str,
    request: ApiRequest,
    timestamp: &str,
) -> Result<SavedRequest, String> {
    let saved = collection
        .requests
        .iter_mut()
        .find(|item| item.id == request_id)
        .ok_or_else(|| format!("Request not found: {request_id}"))?;
    saved.name = request_name(name);
    saved.request = request;
    saved.updated_at = timestamp.to_string();
    let result = saved.clone();
    collection.updated_at = timestamp.to_string();
    Ok(result)
}

pub(super) fn rename(
    collection: &mut Collection,
    request_id: &str,
    name: &str,
    timestamp: &str,
) -> Result<SavedRequest, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("Request name cannot be empty.".to_string());
    }
    let saved = collection
        .requests
        .iter_mut()
        .find(|item| item.id == request_id)
        .ok_or_else(|| format!("Request not found: {request_id}"))?;
    saved.name = name.to_string();
    saved.updated_at = timestamp.to_string();
    let result = saved.clone();
    collection.updated_at = timestamp.to_string();
    Ok(result)
}

pub(super) fn duplicate(
    collection: &mut Collection,
    request_id: &str,
    context: &MutationContext,
) -> Result<SavedRequest, String> {
    let original = collection
        .requests
        .iter()
        .find(|item| item.id == request_id)
        .cloned()
        .ok_or_else(|| format!("Request not found: {request_id}"))?;
    for folder in collection
        .folders
        .iter_mut()
        .filter(|item| item.parent_folder_id == original.folder_id && item.order > original.order)
    {
        folder.order += 1;
    }
    for request in collection
        .requests
        .iter_mut()
        .filter(|item| item.folder_id == original.folder_id && item.order > original.order)
    {
        request.order += 1;
    }
    let mut duplicate = original;
    duplicate.id = require_entity_id(context)?.to_string();
    duplicate.name = format!("{} Copy", duplicate.name.trim());
    duplicate.order += 1;
    duplicate.created_at = context.timestamp.clone();
    duplicate.updated_at = context.timestamp.clone();
    collection.requests.push(duplicate.clone());
    collection.updated_at = context.timestamp.clone();
    Ok(duplicate)
}

pub(super) fn delete(
    collection: &mut Collection,
    request_id: &str,
    timestamp: &str,
) -> Result<(), String> {
    let before = collection.requests.len();
    collection.requests.retain(|item| item.id != request_id);
    if collection.requests.len() == before {
        return Err(format!("Request not found: {request_id}"));
    }
    collection.updated_at = timestamp.to_string();
    Ok(())
}

fn request_name(name: &str) -> String {
    let name = name.trim();
    if name.is_empty() {
        "Untitled Request".to_string()
    } else {
        name.to_string()
    }
}
