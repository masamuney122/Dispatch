use serde::{Deserialize, Serialize};

use crate::models::collection::Collection;
use crate::models::environment::Environment;

pub use dispatch_core::{
    OpenApiExportFormat, OpenApiExportOptions, OpenApiFolderOrganization, OpenApiImportPreview,
    OpenApiRequestNaming, OpenApiWarning,
};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum OpenApiSource {
    File { path: String },
    Text { content: String },
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct OpenApiImportOptions {
    pub collection_name: String,
    pub selected_server: Option<String>,
    pub create_environment: bool,
    pub environment_name: Option<String>,
    #[serde(default)]
    pub request_naming: OpenApiRequestNaming,
    #[serde(default)]
    pub folder_organization: OpenApiFolderOrganization,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenApiImportResult {
    pub collection: Collection,
    pub environment: Option<Environment>,
    pub warnings: Vec<OpenApiWarning>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenApiExportResult {
    pub path: String,
    /// Number of source requests represented by the document.
    pub request_count: usize,
    /// Number of standard OpenAPI operations after same method/path requests are grouped.
    pub endpoint_count: usize,
    /// Source requests grouped into an existing standard operation.
    pub grouped_request_count: usize,
    pub warnings: Vec<OpenApiWarning>,
}
