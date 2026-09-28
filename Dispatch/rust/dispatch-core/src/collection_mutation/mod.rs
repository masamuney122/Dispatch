mod folder;
mod models;
mod request;

use std::collections::HashMap;

use serde_json::to_value;

use crate::Collection;

pub use models::{CollectionMutation, CollectionMutationResult, MutationContext, OrderItem};

pub fn apply_collection_mutation(
    collections: &[Collection],
    mutation: CollectionMutation,
    context: &MutationContext,
) -> Result<CollectionMutationResult, String> {
    if context.timestamp.trim().is_empty() {
        return Err("Mutation timestamp cannot be empty".to_string());
    }
    let mut collections = collections.to_vec();
    let entity = match mutation {
        CollectionMutation::CreateCollection { name } => {
            let name = folder::non_empty_name(&name, "Collection")?;
            let collection = Collection {
                id: require_entity_id(context)?.to_string(),
                name: name.to_string(),
                folders: Vec::new(),
                requests: Vec::new(),
                created_at: context.timestamp.clone(),
                updated_at: context.timestamp.clone(),
            };
            collections.push(collection.clone());
            Some(to_value(collection).map_err(serialize_error)?)
        }
        CollectionMutation::DeleteCollection { collection_id } => {
            let before = collections.len();
            collections.retain(|item| item.id != collection_id);
            if collections.len() == before {
                return Err(format!("Collection not found: {collection_id}"));
            }
            None
        }
        CollectionMutation::RenameCollection {
            collection_id,
            name,
        } => {
            let name = folder::non_empty_name(&name, "Collection")?;
            let collection = find_collection(&mut collections, &collection_id)?;
            collection.name = name.to_string();
            collection.updated_at = context.timestamp.clone();
            None
        }
        CollectionMutation::CreateFolder {
            collection_id,
            name,
            parent_folder_id,
        } => Some(
            to_value(folder::create(
                find_collection(&mut collections, &collection_id)?,
                &name,
                parent_folder_id,
                context,
            )?)
            .map_err(serialize_error)?,
        ),
        CollectionMutation::RenameFolder {
            collection_id,
            folder_id,
            name,
        } => {
            folder::rename(
                find_collection(&mut collections, &collection_id)?,
                &folder_id,
                &name,
                &context.timestamp,
            )?;
            None
        }
        CollectionMutation::DeleteFolder {
            collection_id,
            folder_id,
        } => {
            folder::delete(
                find_collection(&mut collections, &collection_id)?,
                &folder_id,
                &context.timestamp,
            )?;
            None
        }
        CollectionMutation::DuplicateFolder {
            collection_id,
            folder_id,
        } => Some(
            to_value(folder::duplicate(
                find_collection(&mut collections, &collection_id)?,
                &folder_id,
                context,
            )?)
            .map_err(serialize_error)?,
        ),
        CollectionMutation::SaveRequest {
            collection_id,
            name,
            request: value,
            folder_id,
        } => Some(
            to_value(request::save(
                find_collection(&mut collections, &collection_id)?,
                &name,
                value,
                folder_id,
                context,
            )?)
            .map_err(serialize_error)?,
        ),
        CollectionMutation::UpdateRequest {
            collection_id,
            request_id,
            name,
            request: value,
        } => Some(
            to_value(request::update(
                find_collection(&mut collections, &collection_id)?,
                &request_id,
                &name,
                value,
                &context.timestamp,
            )?)
            .map_err(serialize_error)?,
        ),
        CollectionMutation::RenameRequest {
            collection_id,
            request_id,
            name,
        } => Some(
            to_value(request::rename(
                find_collection(&mut collections, &collection_id)?,
                &request_id,
                &name,
                &context.timestamp,
            )?)
            .map_err(serialize_error)?,
        ),
        CollectionMutation::DuplicateRequest {
            collection_id,
            request_id,
        } => Some(
            to_value(request::duplicate(
                find_collection(&mut collections, &collection_id)?,
                &request_id,
                context,
            )?)
            .map_err(serialize_error)?,
        ),
        CollectionMutation::DeleteRequest {
            collection_id,
            request_id,
        } => {
            request::delete(
                find_collection(&mut collections, &collection_id)?,
                &request_id,
                &context.timestamp,
            )?;
            None
        }
        CollectionMutation::Reorder {
            collection_id,
            items,
        } => {
            reorder(
                find_collection(&mut collections, &collection_id)?,
                &items,
                &context.timestamp,
            )?;
            None
        }
    };
    Ok(CollectionMutationResult {
        collections,
        entity,
    })
}

fn find_collection<'a>(
    collections: &'a mut [Collection],
    id: &str,
) -> Result<&'a mut Collection, String> {
    collections
        .iter_mut()
        .find(|item| item.id == id)
        .ok_or_else(|| format!("Collection not found: {id}"))
}

fn reorder(
    collection: &mut Collection,
    items: &[OrderItem],
    timestamp: &str,
) -> Result<(), String> {
    let orders = items
        .iter()
        .map(|item| (item.id.as_str(), item))
        .collect::<HashMap<_, _>>();
    for item in items {
        folder::validate_parent(collection, item.parent_folder_id.as_deref())?;
        match item.item_type.as_str() {
            "folder" if collection.folders.iter().any(|value| value.id == item.id) => {}
            "request" if collection.requests.iter().any(|value| value.id == item.id) => {}
            "folder" => return Err(format!("Folder not found: {}", item.id)),
            "request" => return Err(format!("Request not found: {}", item.id)),
            other => return Err(format!("Unsupported order item type: {other}")),
        }
    }
    validate_final_folder_tree(collection, &orders)?;
    for folder in &mut collection.folders {
        if let Some(item) = orders.get(folder.id.as_str()) {
            folder.parent_folder_id = item.parent_folder_id.clone();
            folder.order = item.order;
            folder.updated_at = timestamp.to_string();
        }
    }
    for request in &mut collection.requests {
        if let Some(item) = orders.get(request.id.as_str()) {
            request.folder_id = item.parent_folder_id.clone();
            request.order = item.order;
            request.updated_at = timestamp.to_string();
        }
    }
    collection.updated_at = timestamp.to_string();
    Ok(())
}

fn validate_final_folder_tree(
    collection: &Collection,
    orders: &HashMap<&str, &OrderItem>,
) -> Result<(), String> {
    let parents = collection
        .folders
        .iter()
        .map(|folder| {
            let parent = orders
                .get(folder.id.as_str())
                .map(|item| item.parent_folder_id.clone())
                .unwrap_or_else(|| folder.parent_folder_id.clone());
            (folder.id.as_str(), parent)
        })
        .collect::<HashMap<_, _>>();
    for folder in &collection.folders {
        let mut visited = std::collections::HashSet::new();
        let mut current = Some(folder.id.as_str());
        while let Some(id) = current {
            if !visited.insert(id) {
                return Err("A folder cannot be moved into itself or its descendant".to_string());
            }
            current = parents.get(id).and_then(|parent| parent.as_deref());
        }
    }
    Ok(())
}

fn sibling_max_order(collection: &Collection, parent: &Option<String>) -> i64 {
    collection
        .folders
        .iter()
        .filter(|item| &item.parent_folder_id == parent)
        .map(|item| item.order)
        .chain(
            collection
                .requests
                .iter()
                .filter(|item| &item.folder_id == parent)
                .map(|item| item.order),
        )
        .max()
        .unwrap_or(-1)
}

fn require_entity_id(context: &MutationContext) -> Result<&str, String> {
    let id = context.entity_id.trim();
    if id.is_empty() {
        Err("Mutation entity id cannot be empty".to_string())
    } else {
        Ok(id)
    }
}

fn serialize_error(error: serde_json::Error) -> String {
    format!("Mutation result could not be serialized: {error}")
}

#[cfg(test)]
mod tests;
