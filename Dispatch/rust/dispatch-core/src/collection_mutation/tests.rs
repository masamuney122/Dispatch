use super::*;
use crate::{ApiRequest, Folder, RequestBodyType, SavedRequest};

fn api_request() -> ApiRequest {
    ApiRequest {
        method: "GET".into(),
        url: String::new(),
        body: String::new(),
        body_type: RequestBodyType::None,
        form_fields: Vec::new(),
        binary: None,
        headers: Default::default(),
        auth: None,
        settings: Default::default(),
        scripts: Default::default(),
    }
}

fn context(id: &str) -> MutationContext {
    MutationContext {
        timestamp: "2026-01-01T00:00:00Z".into(),
        entity_id: id.into(),
        id_prefix: id.into(),
    }
}

fn collection() -> Collection {
    Collection {
        id: "c1".into(),
        name: "Demo".into(),
        created_at: "old".into(),
        updated_at: "old".into(),
        folders: vec![Folder {
            id: "f1".into(),
            name: "Folder".into(),
            collection_id: "c1".into(),
            parent_folder_id: None,
            order: 0,
            created_at: "old".into(),
            updated_at: "old".into(),
        }],
        requests: vec![SavedRequest {
            id: "r1".into(),
            name: "Request".into(),
            request: api_request(),
            folder_id: None,
            order: 1,
            created_at: "old".into(),
            updated_at: "old".into(),
        }],
    }
}

#[test]
fn folders_and_requests_share_a_sibling_order() {
    let result = apply_collection_mutation(
        &[collection()],
        CollectionMutation::CreateFolder {
            collection_id: "c1".into(),
            name: "Next".into(),
            parent_folder_id: None,
        },
        &context("f2"),
    )
    .unwrap();
    assert_eq!(result.collections[0].folders[1].order, 2);
}

#[test]
fn deleting_a_folder_removes_its_entire_subtree() {
    let mut source = collection();
    source.folders.push(Folder {
        id: "child".into(),
        name: "Child".into(),
        collection_id: "c1".into(),
        parent_folder_id: Some("f1".into()),
        order: 0,
        created_at: "old".into(),
        updated_at: "old".into(),
    });
    source.requests.push(SavedRequest {
        id: "nested".into(),
        name: "Nested".into(),
        request: api_request(),
        folder_id: Some("child".into()),
        order: 0,
        created_at: "old".into(),
        updated_at: "old".into(),
    });
    let result = apply_collection_mutation(
        &[source],
        CollectionMutation::DeleteFolder {
            collection_id: "c1".into(),
            folder_id: "f1".into(),
        },
        &context(""),
    )
    .unwrap();
    assert!(result.collections[0].folders.is_empty());
    assert_eq!(result.collections[0].requests.len(), 1);
}

#[test]
fn duplicate_request_is_inserted_after_the_source() {
    let result = apply_collection_mutation(
        &[collection()],
        CollectionMutation::DuplicateRequest {
            collection_id: "c1".into(),
            request_id: "r1".into(),
        },
        &context("copy"),
    )
    .unwrap();
    let duplicate = &result.collections[0].requests[1];
    assert_eq!(duplicate.name, "Request Copy");
    assert_eq!(duplicate.order, 2);
}

#[test]
fn reorder_rejects_folder_cycles() {
    let source = collection();
    let error = apply_collection_mutation(
        &[source],
        CollectionMutation::Reorder {
            collection_id: "c1".into(),
            items: vec![OrderItem {
                id: "f1".into(),
                item_type: "folder".into(),
                parent_folder_id: Some("f1".into()),
                order: 0,
            }],
        },
        &context(""),
    )
    .unwrap_err();
    assert!(error.contains("descendant"));
}

#[test]
fn reorder_rejects_cycles_created_by_a_batch() {
    let mut source = collection();
    source.folders.push(Folder {
        id: "f2".into(),
        name: "Second".into(),
        collection_id: "c1".into(),
        parent_folder_id: None,
        order: 2,
        created_at: "old".into(),
        updated_at: "old".into(),
    });
    let error = apply_collection_mutation(
        &[source],
        CollectionMutation::Reorder {
            collection_id: "c1".into(),
            items: vec![
                OrderItem {
                    id: "f1".into(),
                    item_type: "folder".into(),
                    parent_folder_id: Some("f2".into()),
                    order: 0,
                },
                OrderItem {
                    id: "f2".into(),
                    item_type: "folder".into(),
                    parent_folder_id: Some("f1".into()),
                    order: 0,
                },
            ],
        },
        &context(""),
    )
    .unwrap_err();
    assert!(error.contains("descendant"));
}
