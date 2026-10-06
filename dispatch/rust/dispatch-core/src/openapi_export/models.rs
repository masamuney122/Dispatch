use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct OpenApiExportOptions {
    pub title: String,
    pub api_version: String,
    pub format: OpenApiExportFormat,
    pub server_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum OpenApiExportFormat {
    Json,
    Yaml,
}
