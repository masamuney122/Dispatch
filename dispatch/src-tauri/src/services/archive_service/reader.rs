use std::collections::{BTreeMap, HashSet};
use std::fs::File;
use std::io::Read;
use std::path::Path;

use zip::ZipArchive;

use crate::models::archive::{ArchiveManifest, ARCHIVE_FORMAT, ARCHIVE_VERSION};
use crate::models::cookie::CookieJarDocument;
use crate::models::workspace::{
    CollectionsDocument, EnvironmentsDocument, WorkspaceManifest, WORKSPACE_FORMAT,
    WORKSPACE_SCHEMA_VERSION,
};

use super::format::{
    checksum, ARCHIVE_MANIFEST_PATH, ASSETS_PREFIX, COLLECTIONS_PATH, COOKIES_PATH,
    ENVIRONMENTS_PATH, MAX_ARCHIVE_ENTRIES, MAX_ENTRY_SIZE, MAX_TOTAL_SIZE,
    WORKSPACE_MANIFEST_PATH,
};

pub(super) struct ParsedArchive {
    pub(super) manifest: ArchiveManifest,
    pub(super) workspace: WorkspaceManifest,
    pub(super) collections: CollectionsDocument,
    pub(super) environments: EnvironmentsDocument,
    pub(super) cookies: Option<CookieJarDocument>,
    pub(super) assets: BTreeMap<String, Vec<u8>>,
}

pub(super) fn parse_archive(path: &Path) -> Result<ParsedArchive, String> {
    let file =
        File::open(path).map_err(|error| format!("Failed to open Dispatch archive: {error}"))?;
    let mut archive =
        ZipArchive::new(file).map_err(|error| format!("Invalid Dispatch ZIP archive: {error}"))?;
    if archive.len() > MAX_ARCHIVE_ENTRIES {
        return Err("Archive contains too many entries".to_string());
    }

    let mut files = BTreeMap::<String, Vec<u8>>::new();
    let mut total_size = 0_u64;
    for index in 0..archive.len() {
        let entry = archive
            .by_index(index)
            .map_err(|error| format!("Failed to read archive entry: {error}"))?;
        let name = entry.name().to_string();
        validate_archive_path(&name)?;
        if entry.is_dir() {
            if name != "workspace/" && name != ASSETS_PREFIX {
                return Err(format!("Unexpected archive directory: {name}"));
            }
            continue;
        }
        if entry
            .unix_mode()
            .is_some_and(|mode| mode & 0o170000 == 0o120000)
        {
            return Err(format!(
                "Symbolic links are not allowed in archives: {name}"
            ));
        }
        if !is_allowed_archive_file(&name) {
            return Err(format!("Unexpected archive entry: {name}"));
        }
        if entry.size() > MAX_ENTRY_SIZE {
            return Err(format!("Archive entry is too large: {name}"));
        }
        total_size = total_size.saturating_add(entry.size());
        if total_size > MAX_TOTAL_SIZE {
            return Err("Archive uncompressed size exceeds the limit".to_string());
        }

        let mut bytes = Vec::with_capacity(entry.size() as usize);
        entry
            .take(MAX_ENTRY_SIZE + 1)
            .read_to_end(&mut bytes)
            .map_err(|error| format!("Failed to read archive entry {name}: {error}"))?;
        if bytes.len() as u64 > MAX_ENTRY_SIZE {
            return Err(format!(
                "Archive entry expanded beyond its size limit: {name}"
            ));
        }
        if files.insert(name.clone(), bytes).is_some() {
            return Err(format!("Archive contains a duplicate entry: {name}"));
        }
    }

    decode_archive(files)
}

fn decode_archive(files: BTreeMap<String, Vec<u8>>) -> Result<ParsedArchive, String> {
    let manifest: ArchiveManifest = parse_required(&files, ARCHIVE_MANIFEST_PATH)?;
    if manifest.format != ARCHIVE_FORMAT || manifest.archive_version != ARCHIVE_VERSION {
        return Err("Unsupported Dispatch archive format or version".to_string());
    }

    let content_paths = files
        .keys()
        .filter(|path| path.as_str() != ARCHIVE_MANIFEST_PATH)
        .collect::<HashSet<_>>();
    let checksum_paths = manifest.checksums.keys().collect::<HashSet<_>>();
    if content_paths != checksum_paths {
        return Err("Archive checksum list does not match its contents".to_string());
    }
    for (entry_path, expected) in &manifest.checksums {
        let bytes = files
            .get(entry_path)
            .ok_or_else(|| format!("Missing checksummed entry: {entry_path}"))?;
        if &checksum(bytes) != expected {
            return Err(format!("Checksum mismatch for archive entry: {entry_path}"));
        }
    }

    let workspace: WorkspaceManifest = parse_required(&files, WORKSPACE_MANIFEST_PATH)?;
    if workspace.format != WORKSPACE_FORMAT
        || workspace.schema_version != WORKSPACE_SCHEMA_VERSION
        || workspace.id != manifest.workspace_id
    {
        return Err("Archive contains an invalid workspace manifest".to_string());
    }
    let collections: CollectionsDocument = parse_required(&files, COLLECTIONS_PATH)?;
    let environments: EnvironmentsDocument = parse_required(&files, ENVIRONMENTS_PATH)?;
    if collections.schema_version != WORKSPACE_SCHEMA_VERSION
        || environments.schema_version != WORKSPACE_SCHEMA_VERSION
        || collections.workspace_id != workspace.id
        || environments.workspace_id != workspace.id
    {
        return Err("Archive workspace documents are inconsistent".to_string());
    }
    let cookies = files
        .get(COOKIES_PATH)
        .map(|bytes| {
            let document: CookieJarDocument = serde_json::from_slice(bytes)
                .map_err(|error| format!("Invalid {COOKIES_PATH}: {error}"))?;
            if document.schema_version != 1 {
                return Err("Archive contains an unsupported cookie jar".to_string());
            }
            Ok(document)
        })
        .transpose()?;
    let assets = files
        .into_iter()
        .filter_map(|(path, bytes)| {
            path.strip_prefix(ASSETS_PREFIX)
                .filter(|relative| !relative.is_empty())
                .map(|relative| (relative.to_string(), bytes))
        })
        .collect();

    Ok(ParsedArchive {
        manifest,
        workspace,
        collections,
        environments,
        cookies,
        assets,
    })
}

fn parse_required<T: serde::de::DeserializeOwned>(
    files: &BTreeMap<String, Vec<u8>>,
    path: &str,
) -> Result<T, String> {
    let bytes = files
        .get(path)
        .ok_or_else(|| format!("Archive is missing required entry: {path}"))?;
    serde_json::from_slice(bytes).map_err(|error| format!("Invalid {path}: {error}"))
}

fn validate_archive_path(path: &str) -> Result<(), String> {
    if path.is_empty()
        || path.starts_with('/')
        || path.starts_with('\\')
        || path.contains('\\')
        || path
            .split('/')
            .any(|component| component == ".." || component == ".")
    {
        return Err(format!("Unsafe archive path: {path}"));
    }
    Ok(())
}

fn is_allowed_archive_file(path: &str) -> bool {
    matches!(
        path,
        ARCHIVE_MANIFEST_PATH
            | WORKSPACE_MANIFEST_PATH
            | COLLECTIONS_PATH
            | ENVIRONMENTS_PATH
            | COOKIES_PATH
    ) || path.starts_with(ASSETS_PREFIX)
}
