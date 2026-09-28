use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

use crate::models::archive::{
    ArchiveManifest, ArchiveMode, ArchivePreview, ARCHIVE_FORMAT, ARCHIVE_VERSION,
};
use crate::models::workspace::{
    CollectionsDocument, EnvironmentsDocument, WorkspaceSession, COLLECTIONS_FILE,
    ENVIRONMENTS_FILE, WORKSPACE_MANIFEST_FILE, WORKSPACE_SCHEMA_VERSION,
};
use crate::services::cookie_service::COOKIES_FILE;
use crate::services::storage_service::{read_json, write_json_atomic};
use crate::services::workspace_service;

mod format;
mod reader;
mod writer;

use format::{
    checksum, COLLECTIONS_PATH, COOKIES_PATH, ENVIRONMENTS_PATH, MAX_ARCHIVE_ENTRIES,
    MAX_ENTRY_SIZE, MAX_TOTAL_SIZE, WORKSPACE_MANIFEST_PATH,
};
use reader::parse_archive;
use writer::{collect_assets, read_file_limited, write_archive};

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
        .map(|(path, bytes)| (path.clone(), checksum(bytes)))
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

    write_archive(destination, &archive_manifest_bytes, &files)
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
            write_json_atomic(&staging.join(COOKIES_FILE), &cookies, "imported cookie jar")?;
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
