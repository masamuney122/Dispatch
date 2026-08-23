use serde::{Deserialize, Serialize};

use crate::models::collection::Collection;
use crate::models::environment::Environment;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum OpenApiExportFormat {
    Json,
    Yaml,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct OpenApiWarning {
    pub code: String,
    pub message: String,
    pub location: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenApiImportPreview {
    pub title: String,
    pub specification_version: String,
    pub endpoint_count: usize,
    pub folder_count: usize,
    pub servers: Vec<String>,
    pub security_schemes: Vec<String>,
    pub warnings: Vec<OpenApiWarning>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenApiImportOptions {
    pub collection_name: String,
    pub selected_server: Option<String>,
    pub create_environment: bool,
    pub environment_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenApiImportResult {
    pub collection: Collection,
    pub environment: Option<Environment>,
    pub warnings: Vec<OpenApiWarning>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenApiExportOptions {
    pub title: String,
    pub api_version: String,
    pub format: OpenApiExportFormat,
    pub server_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenApiExportResult {
    pub path: String,
    pub endpoint_count: usize,
    pub warnings: Vec<OpenApiWarning>,
}
