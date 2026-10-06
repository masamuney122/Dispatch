use sha2::{Digest, Sha256};

pub(super) const MAX_ARCHIVE_ENTRIES: usize = 1_000;
pub(super) const MAX_ENTRY_SIZE: u64 = 20 * 1024 * 1024;
pub(super) const MAX_TOTAL_SIZE: u64 = 100 * 1024 * 1024;
pub(super) const ARCHIVE_MANIFEST_PATH: &str = "archive.json";
pub(super) const WORKSPACE_MANIFEST_PATH: &str = "workspace/dispatch.workspace.json";
pub(super) const COLLECTIONS_PATH: &str = "workspace/collections.json";
pub(super) const ENVIRONMENTS_PATH: &str = "workspace/environments.json";
pub(super) const COOKIES_PATH: &str = "workspace/cookies.json";
pub(super) const ASSETS_PREFIX: &str = "workspace/assets/";

pub(super) fn checksum(bytes: &[u8]) -> String {
    format!("sha256:{:x}", Sha256::digest(bytes))
}
