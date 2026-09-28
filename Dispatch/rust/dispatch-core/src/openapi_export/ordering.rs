use std::collections::HashSet;

use crate::{Collection, Folder, SavedRequest};

pub(super) fn folder_order_path(collection: &Collection, folder: &Folder) -> Vec<(i64, usize)> {
    let mut path = Vec::new();
    let mut current = Some(folder);
    let mut visited = HashSet::new();
    while let Some(item) = current {
        if !visited.insert(item.id.as_str()) {
            break;
        }
        let source_index = collection
            .folders
            .iter()
            .position(|candidate| candidate.id == item.id)
            .unwrap_or(usize::MAX);
        path.push((item.order, source_index));
        current = item.parent_folder_id.as_deref().and_then(|parent_id| {
            collection
                .folders
                .iter()
                .find(|candidate| candidate.id == parent_id)
        });
    }
    path.reverse();
    path
}

pub(super) fn request_order_path(
    collection: &Collection,
    request: &SavedRequest,
) -> Vec<(i64, usize)> {
    let mut path = request
        .folder_id
        .as_deref()
        .and_then(|folder_id| {
            collection
                .folders
                .iter()
                .find(|folder| folder.id == folder_id)
        })
        .map(|folder| folder_order_path(collection, folder))
        .unwrap_or_default();
    let source_index = collection
        .requests
        .iter()
        .position(|candidate| candidate.id == request.id)
        .unwrap_or(usize::MAX);
    path.push((request.order, source_index));
    path
}

pub(super) fn full_folder_name(collection: &Collection, folder: &Folder) -> String {
    let mut names = vec![folder.name.clone()];
    let mut parent = folder.parent_folder_id.as_deref();
    let mut visited = HashSet::new();
    while let Some(parent_id) = parent {
        if !visited.insert(parent_id.to_string()) {
            break;
        }
        let Some(parent_folder) = collection.folders.iter().find(|item| item.id == parent_id)
        else {
            break;
        };
        names.push(parent_folder.name.clone());
        parent = parent_folder.parent_folder_id.as_deref();
    }
    names.reverse();
    names.join(" / ")
}
