use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

pub const ARCHIVE_FORMAT: &str = "dispatch-archive";
pub const ARCHIVE_VERSION: u32 = 1;

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ArchiveMode {
    Backup,
    SafeShare,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArchiveManifest {
    pub format: String,
    pub archive_version: u32,
    pub exported_at: String,
    pub workspace_id: String,
    pub mode: ArchiveMode,
    pub checksums: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArchivePreview {
    pub workspace_name: String,
    pub collection_count: usize,
    pub environment_count: usize,
    pub mode: ArchiveMode,
}
