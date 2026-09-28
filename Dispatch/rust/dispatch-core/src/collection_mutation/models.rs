use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{ApiRequest, Collection};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct MutationContext {
    pub timestamp: String,
    #[serde(default)]
    pub entity_id: String,
    #[serde(default)]
    pub id_prefix: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct OrderItem {
    pub id: String,
    pub item_type: String,
    pub parent_folder_id: Option<String>,
    pub order: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "action", rename_all = "snake_case")]
pub enum CollectionMutation {
    CreateCollection {
        name: String,
    },
    DeleteCollection {
        collection_id: String,
    },
    RenameCollection {
        collection_id: String,
        name: String,
    },
    CreateFolder {
        collection_id: String,
        name: String,
        parent_folder_id: Option<String>,
    },
    RenameFolder {
        collection_id: String,
        folder_id: String,
        name: String,
    },
    DeleteFolder {
        collection_id: String,
        folder_id: String,
    },
    DuplicateFolder {
        collection_id: String,
        folder_id: String,
    },
    SaveRequest {
        collection_id: String,
        name: String,
        request: ApiRequest,
        folder_id: Option<String>,
    },
    UpdateRequest {
        collection_id: String,
        request_id: String,
        name: String,
        request: ApiRequest,
    },
    RenameRequest {
        collection_id: String,
        request_id: String,
        name: String,
    },
    DuplicateRequest {
        collection_id: String,
        request_id: String,
    },
    DeleteRequest {
        collection_id: String,
        request_id: String,
    },
    Reorder {
        collection_id: String,
        items: Vec<OrderItem>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CollectionMutationResult {
    pub collections: Vec<Collection>,
    pub entity: Option<Value>,
}
