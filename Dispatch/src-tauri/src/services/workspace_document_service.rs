use std::path::Path;

use chrono::Utc;
use dispatch_core::{Collection, Environment};

use crate::models::workspace::{
    CollectionsDocument, EnvironmentsDocument, WORKSPACE_SCHEMA_VERSION,
};
use crate::services::storage_service::{read_json, write_json_atomic};

pub fn load_collections(path: &Path) -> Result<Vec<Collection>, String> {
    let document: CollectionsDocument = read_json(path, "collections document")?;
    validate_schema("collections", document.schema_version)?;
    Ok(document.collections)
}

pub fn save_collections(path: &Path, collections: &[Collection]) -> Result<(), String> {
    let mut document: CollectionsDocument = read_json(path, "collections document")?;
    validate_schema("collections", document.schema_version)?;
    document.revision = document.revision.saturating_add(1);
    document.updated_at = Utc::now().to_rfc3339();
    document.collections = collections.to_vec();
    write_json_atomic(path, &document, "collections document")
}

pub fn save_environments(path: &Path, environments: &[Environment]) -> Result<(), String> {
    let mut document: EnvironmentsDocument = read_json(path, "environments document")?;
    validate_schema("environments", document.schema_version)?;
    document.revision = document.revision.saturating_add(1);
    document.updated_at = Utc::now().to_rfc3339();
    document.environments = environments.to_vec();
    write_json_atomic(path, &document, "environments document")
}

fn validate_schema(document_name: &str, schema_version: u32) -> Result<(), String> {
    if schema_version == WORKSPACE_SCHEMA_VERSION {
        Ok(())
    } else {
        Err(format!(
            "Unsupported {document_name} schema version: {schema_version}"
        ))
    }
}
