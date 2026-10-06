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

pub(super) fn move_between_collections(
    collections: &mut [Collection],
    source_collection_id: &str,
    folder_id: &str,
    target_collection_id: &str,
    target_parent_folder_id: Option<String>,
    timestamp: &str,
) -> Result<Folder, String> {
    if source_collection_id == target_collection_id {
        return Err("Folder already belongs to the target collection".to_string());
    }

    let source_index = collections
        .iter()
        .position(|collection| collection.id == source_collection_id)
        .ok_or_else(|| format!("Collection not found: {source_collection_id}"))?;
    let target_index = collections
        .iter()
        .position(|collection| collection.id == target_collection_id)
        .ok_or_else(|| format!("Collection not found: {target_collection_id}"))?;

    let (source, target) = if source_index < target_index {
        let (before_target, from_target) = collections.split_at_mut(target_index);
        (&mut before_target[source_index], &mut from_target[0])
    } else {
        let (before_source, from_source) = collections.split_at_mut(source_index);
        (&mut from_source[0], &mut before_source[target_index])
    };

    move_subtree(
        source,
        target,
        folder_id,
        target_parent_folder_id,
        timestamp,
    )
}

fn move_subtree(
    source: &mut Collection,
    target: &mut Collection,
    folder_id: &str,
    target_parent_folder_id: Option<String>,
    timestamp: &str,
) -> Result<Folder, String> {
    validate_parent(target, target_parent_folder_id.as_deref())?;
    let source_root = source
        .folders
        .iter()
        .find(|folder| folder.id == folder_id)
        .cloned()
        .ok_or_else(|| format!("Folder not found: {folder_id}"))?;
    let subtree_ids = descendant_ids(&source.folders, folder_id);
    let moved_request_ids = source
        .requests
        .iter()
        .filter(|request| {
            request
                .folder_id
                .as_ref()
                .is_some_and(|id| subtree_ids.contains(id))
        })
        .map(|request| request.id.clone())
        .collect::<HashSet<_>>();

    let target_item_ids = target
        .folders
        .iter()
        .map(|folder| folder.id.clone())
        .chain(target.requests.iter().map(|request| request.id.clone()))
        .collect::<HashSet<_>>();
    if let Some(id) = subtree_ids
        .iter()
        .map(String::as_str)
        .chain(moved_request_ids.iter().map(String::as_str))
        .find(|id| target_item_ids.contains(*id))
    {
        return Err(format!("Target collection already contains item id: {id}"));
    }

    let target_order = sibling_max_order(target, &target_parent_folder_id) + 1;
    let mut moved_folders = source
        .folders
        .iter()
        .filter(|folder| subtree_ids.contains(&folder.id))
        .cloned()
        .collect::<Vec<_>>();
    let mut moved_requests = source
        .requests
        .iter()
        .filter(|request| moved_request_ids.contains(&request.id))
        .cloned()
        .collect::<Vec<_>>();

    for folder in &mut moved_folders {
        folder.collection_id = target.id.clone();
        folder.updated_at = timestamp.to_string();
        if folder.id == folder_id {
            folder.parent_folder_id = target_parent_folder_id.clone();
            folder.order = target_order;
        }
    }
    for request in &mut moved_requests {
        request.updated_at = timestamp.to_string();
    }

    source
        .folders
        .retain(|folder| !subtree_ids.contains(&folder.id));
    source
        .requests
        .retain(|request| !moved_request_ids.contains(&request.id));
    normalize_sibling_orders(source, &source_root.parent_folder_id, timestamp);
    source.updated_at = timestamp.to_string();

    target.folders.extend(moved_folders);
    target.requests.extend(moved_requests);
    target.updated_at = timestamp.to_string();

    target
        .folders
        .iter()
        .find(|folder| folder.id == folder_id)
        .cloned()
        .ok_or_else(|| "Moved folder could not be found in target collection".to_string())
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

fn normalize_sibling_orders(collection: &mut Collection, parent: &Option<String>, timestamp: &str) {
    let mut siblings = collection
        .folders
        .iter()
        .filter(|folder| &folder.parent_folder_id == parent)
        .map(|folder| (folder.order, true, folder.id.clone()))
        .chain(
            collection
                .requests
                .iter()
                .filter(|request| &request.folder_id == parent)
                .map(|request| (request.order, false, request.id.clone())),
        )
        .collect::<Vec<_>>();
    siblings.sort_by(|left, right| {
        left.0
            .cmp(&right.0)
            .then_with(|| right.1.cmp(&left.1))
            .then_with(|| left.2.cmp(&right.2))
    });
    for (order, (_, is_folder, id)) in siblings.into_iter().enumerate() {
        if is_folder {
            if let Some(folder) = collection.folders.iter_mut().find(|folder| folder.id == id) {
                folder.order = order as i64;
                folder.updated_at = timestamp.to_string();
            }
        } else if let Some(request) = collection
            .requests
            .iter_mut()
            .find(|request| request.id == id)
        {
            request.order = order as i64;
            request.updated_at = timestamp.to_string();
        }
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
