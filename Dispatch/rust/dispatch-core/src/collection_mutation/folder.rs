use std::collections::{HashMap, HashSet};

use crate::{Collection, Folder, SavedRequest};

use super::{MutationContext, require_entity_id, sibling_max_order};

pub(super) fn create(
    collection: &mut Collection,
    name: &str,
    parent_folder_id: Option<String>,
    context: &MutationContext,
) -> Result<Folder, String> {
    let name = non_empty_name(name, "Folder")?;
    validate_parent(collection, parent_folder_id.as_deref())?;
    let folder = Folder {
        id: require_entity_id(context)?.to_string(),
        name: name.to_string(),
        collection_id: collection.id.clone(),
        order: sibling_max_order(collection, &parent_folder_id) + 1,
        parent_folder_id,
        created_at: context.timestamp.clone(),
        updated_at: context.timestamp.clone(),
    };
    collection.folders.push(folder.clone());
    collection.updated_at = context.timestamp.clone();
    Ok(folder)
}

pub(super) fn rename(
    collection: &mut Collection,
    folder_id: &str,
    name: &str,
    timestamp: &str,
) -> Result<(), String> {
    let name = non_empty_name(name, "Folder")?;
    let folder = collection
        .folders
        .iter_mut()
        .find(|item| item.id == folder_id)
        .ok_or_else(|| format!("Folder not found: {folder_id}"))?;
    folder.name = name.to_string();
    folder.updated_at = timestamp.to_string();
    collection.updated_at = timestamp.to_string();
    Ok(())
}

pub(super) fn delete(
    collection: &mut Collection,
    folder_id: &str,
    timestamp: &str,
) -> Result<(), String> {
    if !collection.folders.iter().any(|item| item.id == folder_id) {
        return Err(format!("Folder not found: {folder_id}"));
    }
    let ids = descendant_ids(&collection.folders, folder_id);
    collection
        .folders
        .retain(|folder| !ids.contains(&folder.id));
    collection.requests.retain(|request| {
        request
            .folder_id
            .as_ref()
            .is_none_or(|id| !ids.contains(id))
    });
    collection.updated_at = timestamp.to_string();
    Ok(())
}

pub(super) fn duplicate(
    collection: &mut Collection,
    folder_id: &str,
    context: &MutationContext,
) -> Result<Folder, String> {
    if context.id_prefix.trim().is_empty() {
        return Err("Mutation id prefix cannot be empty".to_string());
    }
    let source = collection
        .folders
        .iter()
        .find(|item| item.id == folder_id)
        .cloned()
        .ok_or_else(|| format!("Folder not found: {folder_id}"))?;
    let subtree = descendant_ids(&collection.folders, folder_id);
    shift_siblings_after(collection, &source.parent_folder_id, source.order);

    let source_folders = collection.folders.clone();
    let source_requests = collection.requests.clone();
    let mut ordered_ids = source_folders
        .iter()
        .filter(|item| subtree.contains(&item.id))
        .map(|item| item.id.clone())
        .collect::<Vec<_>>();
    ordered_ids.sort_by_key(|id| depth(&source_folders, id));
    let id_map = ordered_ids
        .iter()
        .enumerate()
        .map(|(index, id)| (id.clone(), format!("{}-folder-{index}", context.id_prefix)))
        .collect::<HashMap<_, _>>();

    let copied_folders = source_folders
        .into_iter()
        .filter(|item| subtree.contains(&item.id))
        .map(|mut item| {
            let is_root = item.id == folder_id;
            item.id = id_map[&item.id].clone();
            item.name = if is_root {
                format!("{} Copy", item.name.trim())
            } else {
                item.name
            };
            item.parent_folder_id = if is_root {
                source.parent_folder_id.clone()
            } else {
                item.parent_folder_id
                    .as_ref()
                    .and_then(|id| id_map.get(id))
                    .cloned()
            };
            if is_root {
                item.order = source.order + 1;
            }
            item.created_at = context.timestamp.clone();
            item.updated_at = context.timestamp.clone();
            item
        })
        .collect::<Vec<_>>();
    let copied_requests = source_requests
        .into_iter()
        .filter(|item| {
            item.folder_id
                .as_ref()
                .is_some_and(|id| subtree.contains(id))
        })
        .enumerate()
        .map(|(index, mut item)| {
            item.id = format!("{}-request-{index}", context.id_prefix);
            item.folder_id = item
                .folder_id
                .as_ref()
                .and_then(|id| id_map.get(id))
                .cloned();
            item.created_at = context.timestamp.clone();
            item.updated_at = context.timestamp.clone();
            item
        })
        .collect::<Vec<SavedRequest>>();

    let root_id = id_map[folder_id].clone();
    collection.folders.extend(copied_folders);
    collection.requests.extend(copied_requests);
    collection.updated_at = context.timestamp.clone();
    collection
        .folders
        .iter()
        .find(|item| item.id == root_id)
        .cloned()
        .ok_or_else(|| "Duplicated folder could not be created".to_string())
}

pub(super) fn descendant_ids(folders: &[Folder], root_id: &str) -> HashSet<String> {
    let mut ids = HashSet::from([root_id.to_string()]);
    let mut changed = true;
    while changed {
        changed = false;
        for folder in folders {
            if folder
                .parent_folder_id
                .as_ref()
                .is_some_and(|id| ids.contains(id))
                && ids.insert(folder.id.clone())
            {
                changed = true;
            }
        }
    }
    ids
}

pub(super) fn validate_parent(
    collection: &Collection,
    parent_id: Option<&str>,
) -> Result<(), String> {
    if let Some(id) = parent_id
        && !collection.folders.iter().any(|item| item.id == id)
    {
        return Err(format!("Parent folder not found: {id}"));
    }
    Ok(())
}

pub(super) fn non_empty_name<'a>(name: &'a str, kind: &str) -> Result<&'a str, String> {
    let name = name.trim();
    if name.is_empty() {
        Err(format!("{kind} name cannot be empty."))
    } else {
        Ok(name)
    }
}

fn shift_siblings_after(collection: &mut Collection, parent: &Option<String>, order: i64) {
    for folder in collection
        .folders
        .iter_mut()
        .filter(|item| &item.parent_folder_id == parent && item.order > order)
    {
        folder.order += 1;
    }
    for request in collection
        .requests
        .iter_mut()
        .filter(|item| &item.folder_id == parent && item.order > order)
    {
        request.order += 1;
    }
}

fn depth(folders: &[Folder], id: &str) -> usize {
    let mut current = folders
        .iter()
        .find(|item| item.id == id)
        .and_then(|item| item.parent_folder_id.as_deref());
    let mut value = 0;
    while let Some(parent) = current {
        value += 1;
        current = folders
            .iter()
            .find(|item| item.id == parent)
            .and_then(|item| item.parent_folder_id.as_deref());
    }
    value
}
