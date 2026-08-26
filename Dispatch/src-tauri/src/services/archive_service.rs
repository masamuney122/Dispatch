use std::collections::{BTreeMap, HashSet};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::Path;

use sha2::{Digest, Sha256};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

use crate::models::archive::{
    ArchiveManifest, ArchiveMode, ArchivePreview, ARCHIVE_FORMAT, ARCHIVE_VERSION,
};
use crate::models::cookie::CookieJarDocument;
use crate::models::workspace::{
    CollectionsDocument, EnvironmentsDocument, WorkspaceManifest, WorkspaceSession,
    COLLECTIONS_FILE, ENVIRONMENTS_FILE, WORKSPACE_FORMAT, WORKSPACE_MANIFEST_FILE,
    WORKSPACE_SCHEMA_VERSION,
};
use crate::services::storage_service::{read_json, replace_file_atomic, write_json_atomic};
use crate::services::workspace_service;
use crate::services::cookie_service::COOKIES_FILE;

const MAX_ARCHIVE_ENTRIES: usize = 1_000;
const MAX_ENTRY_SIZE: u64 = 20 * 1024 * 1024;
const MAX_TOTAL_SIZE: u64 = 100 * 1024 * 1024;
const ARCHIVE_MANIFEST_PATH: &str = "archive.json";
const WORKSPACE_MANIFEST_PATH: &str = "workspace/dispatch.workspace.json";
const COLLECTIONS_PATH: &str = "workspace/collections.json";
const ENVIRONMENTS_PATH: &str = "workspace/environments.json";
const COOKIES_PATH: &str = "workspace/cookies.json";
const ASSETS_PREFIX: &str = "workspace/assets/";

struct ParsedArchive {
    manifest: ArchiveManifest,
    workspace: WorkspaceManifest,
    collections: CollectionsDocument,
    environments: EnvironmentsDocument,
    cookies: Option<CookieJarDocument>,
    assets: BTreeMap<String, Vec<u8>>,
}

pub fn export_workspace(
    session: &WorkspaceSession,
    destination: &Path,
    mode: ArchiveMode,
) -> Result<(), String> {
    if destination.is_dir() {
        return Err(format!(
            "Export destination is a directory: {}",
            destination.display()
        ));
    }
    let parent = destination
        .parent()
        .ok_or_else(|| "Export destination must have a parent directory".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Failed to create export directory: {error}"))?;

    let mut files = BTreeMap::<String, Vec<u8>>::new();
    files.insert(
        WORKSPACE_MANIFEST_PATH.to_string(),
        read_file_limited(
            &workspace_service::workspace_file(session, WORKSPACE_MANIFEST_FILE),
            MAX_ENTRY_SIZE,
        )?,
    );
    files.insert(
        COLLECTIONS_PATH.to_string(),
        read_file_limited(
            &workspace_service::workspace_file(session, COLLECTIONS_FILE),
            MAX_ENTRY_SIZE,
        )?,
    );

    let environments_path = workspace_service::workspace_file(session, ENVIRONMENTS_FILE);
    let environments_bytes = match mode {
        ArchiveMode::Backup => read_file_limited(&environments_path, MAX_ENTRY_SIZE)?,
        ArchiveMode::SafeShare => {
            let mut document: EnvironmentsDocument =
                read_json(&environments_path, "environments document")?;
            for environment in &mut document.environments {
                for value in environment.variables.values_mut() {
                    value.clear();
                }
            }
            serde_json::to_vec_pretty(&document)
                .map_err(|error| format!("Failed to serialize safe-share environments: {error}"))?
        }
    };
    files.insert(ENVIRONMENTS_PATH.to_string(), environments_bytes);
    let cookies_path = workspace_service::workspace_file(session, COOKIES_FILE);
    if matches!(mode, ArchiveMode::Backup) && cookies_path.exists() {
        files.insert(
            COOKIES_PATH.to_string(),
            read_file_limited(&cookies_path, MAX_ENTRY_SIZE)?,
        );
    }
    collect_assets(&session.root_path.join("assets"), &mut files)?;

    if files.len() + 1 > MAX_ARCHIVE_ENTRIES {
        return Err("Workspace contains too many files to export".to_string());
    }
    let total_size: u64 = files.values().map(|bytes| bytes.len() as u64).sum();
    if total_size > MAX_TOTAL_SIZE {
        return Err("Workspace is too large to export".to_string());
    }

    let checksums = files
        .iter()
        .map(|(path, bytes)| (path.clone(), sha256(bytes)))
        .collect();
    let archive_manifest = ArchiveManifest {
        format: ARCHIVE_FORMAT.to_string(),
        archive_version: ARCHIVE_VERSION,
        exported_at: chrono::Utc::now().to_rfc3339(),
        workspace_id: session.manifest.id.clone(),
        mode,
        checksums,
    };
    let archive_manifest_bytes = serde_json::to_vec_pretty(&archive_manifest)
        .map_err(|error| format!("Failed to serialize archive manifest: {error}"))?;

    let temp_path = parent.join(format!(
        ".{}.{}.tmp",
        destination
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("workspace.dispatch"),
        uuid::Uuid::new_v4()
    ));

    let result = (|| -> Result<(), String> {
        let file = File::create(&temp_path)
            .map_err(|error| format!("Failed to create export archive: {error}"))?;
        let mut writer = ZipWriter::new(file);
        write_archive_entry(&mut writer, ARCHIVE_MANIFEST_PATH, &archive_manifest_bytes)?;
        for (path, bytes) in &files {
            write_archive_entry(&mut writer, path, bytes)?;
        }
        let file = writer
            .finish()
            .map_err(|error| format!("Failed to finish export archive: {error}"))?;
        file.sync_all()
            .map_err(|error| format!("Failed to sync export archive: {error}"))?;
        replace_file_atomic(&temp_path, destination, "Dispatch archive")
    })();

    if result.is_err() && temp_path.exists() {
        let _ = fs::remove_file(temp_path);
    }
    result
}

pub fn inspect_archive(path: &Path) -> Result<ArchivePreview, String> {
    let parsed = parse_archive(path)?;
    Ok(ArchivePreview {
        workspace_name: parsed.workspace.name,
        collection_count: parsed.collections.collections.len(),
        environment_count: parsed.environments.environments.len(),
        mode: parsed.manifest.mode,
    })
}

pub fn import_archive(
    archive_path: &Path,
    destination: &Path,
    workspace_name: Option<&str>,
) -> Result<WorkspaceSession, String> {
    if destination.exists() {
        return Err("Import destination must not already exist".to_string());
    }
    let parsed = parse_archive(archive_path)?;
    let name = workspace_name
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .unwrap_or(&parsed.workspace.name);
    let parent = destination
        .parent()
        .ok_or_else(|| "Import destination must have a parent directory".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Failed to create import parent directory: {error}"))?;
    let staging = parent.join(format!(".dispatch-import-{}", uuid::Uuid::new_v4()));

    let result = (|| -> Result<WorkspaceSession, String> {
        let staged_session = workspace_service::create_workspace(&staging, name)?;
        let now = chrono::Utc::now().to_rfc3339();
        let collections = CollectionsDocument {
            schema_version: WORKSPACE_SCHEMA_VERSION,
            workspace_id: staged_session.manifest.id.clone(),
            revision: 0,
            updated_at: now.clone(),
            collections: parsed.collections.collections,
        };
        let environments = EnvironmentsDocument {
            schema_version: WORKSPACE_SCHEMA_VERSION,
            workspace_id: staged_session.manifest.id.clone(),
            revision: 0,
            updated_at: now,
            environments: parsed.environments.environments,
        };
        write_json_atomic(
            &staging.join(COLLECTIONS_FILE),
            &collections,
            "imported collections document",
        )?;
        write_json_atomic(
            &staging.join(ENVIRONMENTS_FILE),
            &environments,
            "imported environments document",
        )?;
        if let Some(cookies) = parsed.cookies {
            write_json_atomic(
                &staging.join(COOKIES_FILE),
                &cookies,
                "imported cookie jar",
            )?;
        }

        for (relative_path, bytes) in parsed.assets {
            let asset_path = staging.join("assets").join(relative_path);
            let asset_parent = asset_path
                .parent()
                .ok_or_else(|| "Imported asset has no parent directory".to_string())?;
            fs::create_dir_all(asset_parent)
                .map_err(|error| format!("Failed to create imported asset directory: {error}"))?;
            fs::write(&asset_path, bytes)
                .map_err(|error| format!("Failed to write imported asset: {error}"))?;
        }

        fs::rename(&staging, destination)
            .map_err(|error| format!("Failed to finalize imported workspace: {error}"))?;
        workspace_service::open_workspace(destination)
    })();

    if result.is_err() && staging.exists() {
        let _ = fs::remove_dir_all(&staging);
    }
    result
}

fn parse_archive(path: &Path) -> Result<ParsedArchive, String> {
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
        if let Some(mode) = entry.unix_mode() {
            if mode & 0o170000 == 0o120000 {
                return Err(format!(
                    "Symbolic links are not allowed in archives: {name}"
                ));
            }
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

    let archive_manifest: ArchiveManifest = parse_required(&files, ARCHIVE_MANIFEST_PATH)?;
    if archive_manifest.format != ARCHIVE_FORMAT
        || archive_manifest.archive_version != ARCHIVE_VERSION
    {
        return Err("Unsupported Dispatch archive format or version".to_string());
    }

    let content_paths: HashSet<&String> = files
        .keys()
        .filter(|path| path.as_str() != ARCHIVE_MANIFEST_PATH)
        .collect();
    let checksum_paths: HashSet<&String> = archive_manifest.checksums.keys().collect();
    if content_paths != checksum_paths {
        return Err("Archive checksum list does not match its contents".to_string());
    }
    for (entry_path, expected) in &archive_manifest.checksums {
        let actual = sha256(
            files
                .get(entry_path)
                .ok_or_else(|| format!("Missing checksummed entry: {entry_path}"))?,
        );
        if &actual != expected {
            return Err(format!("Checksum mismatch for archive entry: {entry_path}"));
        }
    }

    let workspace: WorkspaceManifest = parse_required(&files, WORKSPACE_MANIFEST_PATH)?;
    if workspace.format != WORKSPACE_FORMAT
        || workspace.schema_version != WORKSPACE_SCHEMA_VERSION
        || workspace.id != archive_manifest.workspace_id
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
        manifest: archive_manifest,
        workspace,
        collections,
        environments,
        cookies,
        assets,
    })
}

fn collect_assets(root: &Path, files: &mut BTreeMap<String, Vec<u8>>) -> Result<(), String> {
    if !root.exists() {
        return Ok(());
    }
    collect_assets_recursive(root, root, files)
}

fn collect_assets_recursive(
    root: &Path,
    directory: &Path,
    files: &mut BTreeMap<String, Vec<u8>>,
) -> Result<(), String> {
    for entry in fs::read_dir(directory)
        .map_err(|error| format!("Failed to read assets directory: {error}"))?
    {
        let entry = entry.map_err(|error| format!("Failed to inspect asset: {error}"))?;
        let path = entry.path();
        let metadata = fs::symlink_metadata(&path)
            .map_err(|error| format!("Failed to inspect asset metadata: {error}"))?;
        if metadata.file_type().is_symlink() {
            return Err(format!(
                "Workspace assets cannot contain symlinks: {}",
                path.display()
            ));
        }
        if metadata.is_dir() {
            collect_assets_recursive(root, &path, files)?;
        } else if metadata.is_file() {
            let relative = path
                .strip_prefix(root)
                .map_err(|error| format!("Failed to resolve asset path: {error}"))?;
            let relative = relative
                .to_str()
                .ok_or_else(|| "Asset paths must be valid UTF-8".to_string())?
                .replace('\\', "/");
            let archive_path = format!("{ASSETS_PREFIX}{relative}");
            files.insert(archive_path, read_file_limited(&path, MAX_ENTRY_SIZE)?);
        }
    }
    Ok(())
}

fn write_archive_entry(
    writer: &mut ZipWriter<File>,
    path: &str,
    bytes: &[u8],
) -> Result<(), String> {
    let options = SimpleFileOptions::default()
        .compression_method(CompressionMethod::Deflated)
        .unix_permissions(0o644);
    writer
        .start_file(path, options)
        .map_err(|error| format!("Failed to add {path} to archive: {error}"))?;
    writer
        .write_all(bytes)
        .map_err(|error| format!("Failed to write {path} to archive: {error}"))
}

fn read_file_limited(path: &Path, limit: u64) -> Result<Vec<u8>, String> {
    let metadata = fs::metadata(path)
        .map_err(|error| format!("Failed to inspect {}: {error}", path.display()))?;
    if metadata.len() > limit {
        return Err(format!("File exceeds size limit: {}", path.display()));
    }
    fs::read(path).map_err(|error| format!("Failed to read {}: {error}", path.display()))
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

fn sha256(bytes: &[u8]) -> String {
    format!("sha256:{:x}", Sha256::digest(bytes))
}

#[cfg(test)]
mod tests {
    use super::{export_workspace, import_archive, inspect_archive};
    use crate::models::archive::ArchiveMode;
    use crate::models::cookie::{CookieJarDocument, StoredCookie};
    use crate::models::workspace::{EnvironmentsDocument, ENVIRONMENTS_FILE};
    use crate::services::cookie_service::COOKIES_FILE;
    use crate::services::storage_service::{read_json, write_json_atomic};
    use crate::services::workspace_service;

    #[test]
    fn exports_and_imports_a_safe_share_archive() {
        let test_root =
            std::env::temp_dir().join(format!("dispatch-archive-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&test_root).unwrap();
        let source_path = test_root.join("source");
        let source = workspace_service::create_workspace(&source_path, "Source").unwrap();
        let environments_path = source_path.join(ENVIRONMENTS_FILE);
        let mut environments: EnvironmentsDocument =
            read_json(&environments_path, "environments").unwrap();
        environments
            .environments
            .push(crate::models::environment::Environment {
                id: "env-1".into(),
                name: "Local".into(),
                variables: [("TOKEN".into(), "secret".into())].into(),
                workspace_id: None,
                created_at: String::new(),
                updated_at: String::new(),
            });
        write_json_atomic(&environments_path, &environments, "environments").unwrap();
        let cookies = CookieJarDocument {
            schema_version: 1,
            cookies: vec![StoredCookie {
                name: "session".into(),
                value: "secret-cookie".into(),
                domain: "example.com".into(),
                path: "/".into(),
                expires_at: None,
                secure: true,
                http_only: true,
                same_site: Some("lax".into()),
                host_only: true,
                enabled: true,
            }],
        };
        write_json_atomic(&source_path.join(COOKIES_FILE), &cookies, "cookies").unwrap();

        let archive_path = test_root.join("source.dispatch");
        export_workspace(&source, &archive_path, ArchiveMode::SafeShare).unwrap();
        let preview = inspect_archive(&archive_path).unwrap();
        assert_eq!(preview.environment_count, 1);

        let imported_path = test_root.join("imported");
        import_archive(&archive_path, &imported_path, Some("Imported")).unwrap();
        let imported: EnvironmentsDocument =
            read_json(&imported_path.join(ENVIRONMENTS_FILE), "environments").unwrap();
        assert_eq!(imported.environments[0].variables["TOKEN"], "");
        let safe_share_cookies: CookieJarDocument =
            read_json(&imported_path.join(COOKIES_FILE), "cookies").unwrap();
        assert!(safe_share_cookies.cookies.is_empty());

        let backup_path = test_root.join("source-backup.dispatch");
        export_workspace(&source, &backup_path, ArchiveMode::Backup).unwrap();
        let restored_path = test_root.join("restored");
        import_archive(&backup_path, &restored_path, Some("Restored")).unwrap();
        let restored_cookies: CookieJarDocument =
            read_json(&restored_path.join(COOKIES_FILE), "cookies").unwrap();
        assert_eq!(restored_cookies.cookies[0].value, "secret-cookie");

        std::fs::remove_dir_all(test_root).unwrap();
    }
}
