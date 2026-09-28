use std::collections::BTreeMap;
use std::fs::{self, File};
use std::io::Write;
use std::path::Path;

use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipWriter};

use crate::services::storage_service::replace_file_atomic;

use super::format::{ARCHIVE_MANIFEST_PATH, ASSETS_PREFIX, MAX_ENTRY_SIZE};

pub(super) fn write_archive(
    destination: &Path,
    manifest: &[u8],
    files: &BTreeMap<String, Vec<u8>>,
) -> Result<(), String> {
    let parent = destination
        .parent()
        .ok_or_else(|| "Export destination must have a parent directory".to_string())?;
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
        write_entry(&mut writer, ARCHIVE_MANIFEST_PATH, manifest)?;
        for (path, bytes) in files {
            write_entry(&mut writer, path, bytes)?;
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

pub(super) fn collect_assets(
    root: &Path,
    files: &mut BTreeMap<String, Vec<u8>>,
) -> Result<(), String> {
    if !root.exists() {
        return Ok(());
    }
    collect_assets_recursive(root, root, files)
}

pub(super) fn read_file_limited(path: &Path, limit: u64) -> Result<Vec<u8>, String> {
    let metadata = fs::metadata(path)
        .map_err(|error| format!("Failed to inspect {}: {error}", path.display()))?;
    if metadata.len() > limit {
        return Err(format!("File exceeds size limit: {}", path.display()));
    }
    fs::read(path).map_err(|error| format!("Failed to read {}: {error}", path.display()))
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
            files.insert(
                format!("{ASSETS_PREFIX}{relative}"),
                read_file_limited(&path, MAX_ENTRY_SIZE)?,
            );
        }
    }
    Ok(())
}

fn write_entry(writer: &mut ZipWriter<File>, path: &str, bytes: &[u8]) -> Result<(), String> {
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
