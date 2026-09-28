use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::{Collection, OpenApiWarning};

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum OpenApiRequestNaming {
    #[default]
    Fallback,
    Path,
    Url,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum OpenApiFolderOrganization {
    #[default]
    Tags,
    Path,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct OpenApiImportOptions {
    #[serde(default)]
    pub request_naming: OpenApiRequestNaming,
    #[serde(default)]
    pub folder_organization: OpenApiFolderOrganization,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct OpenApiImportContext {
    pub collection_id: String,
    pub id_prefix: String,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct OpenApiImportDocument {
    pub collection: Collection,
    pub environment_variables: HashMap<String, String>,
    pub warnings: Vec<OpenApiWarning>,
}
