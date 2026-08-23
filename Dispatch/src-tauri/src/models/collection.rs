use serde::{Deserialize, Serialize};

use crate::models::request::ApiRequest;

/// A folder inside a collection. Folders can be nested via `parent_folder_id`.
/// `parent_folder_id == None` means the folder lives at the collection root.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Folder {
    pub id: String,
    pub name: String,
    pub collection_id: String,
    /// None → root of the collection, Some(id) → nested inside that folder
    #[serde(default)]
    pub parent_folder_id: Option<String>,
    /// Sort order within the same parent level. Lower = higher in list.
    #[serde(default)]
    pub order: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SavedRequest {
    pub id: String,
    pub name: String,
    pub request: ApiRequest,
    /// None → root of the collection, Some(id) → inside that folder
    #[serde(default)]
    pub folder_id: Option<String>,
    /// Sort order within the same parent level. Lower = higher in list.
    #[serde(default)]
    pub order: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Collection {
    pub id: String,
    pub name: String,
    /// Flat list of all folders in this collection (tree is built on the frontend).
    #[serde(default)]
    pub folders: Vec<Folder>,
    pub requests: Vec<SavedRequest>,
    pub created_at: String,
    pub updated_at: String,
}

/// Used by the reorder_items command to update positions atomically.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrderItem {
    pub id: String,
    /// "folder" or "request"
    pub item_type: String,
    pub parent_folder_id: Option<String>,
    pub order: i64,
}
