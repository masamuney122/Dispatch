use std::fs::{self, File};
use std::io::Write;
use std::path::Path;

use serde::de::DeserializeOwned;
use serde::Serialize;

pub fn read_json<T: DeserializeOwned>(path: &Path, label: &str) -> Result<T, String> {
    let content = fs::read_to_string(path)
        .map_err(|error| format!("Failed to read {label} at {}: {error}", path.display()))?;

    if content.trim().is_empty() {
        return Err(format!("{label} is empty: {}", path.display()));
    }

    serde_json::from_str(&content)
        .map_err(|error| format!("Failed to parse {label} at {}: {error}", path.display()))
}

pub fn write_json_atomic<T: Serialize>(path: &Path, value: &T, label: &str) -> Result<(), String> {
    let mut json = serde_json::to_vec_pretty(value)
        .map_err(|error| format!("Failed to serialize {label}: {error}"))?;
    json.push(b'\n');
    write_bytes_atomic(path, &json, label)
}

pub fn write_bytes_atomic(path: &Path, bytes: &[u8], label: &str) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| format!("{label} path has no parent: {}", path.display()))?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Failed to create {}: {error}", parent.display()))?;

    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| format!("Invalid {label} file name: {}", path.display()))?;
    let temp_path = parent.join(format!(".{file_name}.{}.tmp", uuid::Uuid::new_v4()));

    let result = (|| -> Result<(), String> {
        let mut file = File::create(&temp_path)
            .map_err(|error| format!("Failed to create temporary {label}: {error}"))?;
        file.write_all(bytes)
            .map_err(|error| format!("Failed to write temporary {label}: {error}"))?;
        file.sync_all()
            .map_err(|error| format!("Failed to sync temporary {label}: {error}"))?;
        drop(file);

        replace_file_atomic(&temp_path, path, label)
    })();

    if result.is_err() && temp_path.exists() {
        let _ = fs::remove_file(&temp_path);
    }
    result
}

pub fn replace_file_atomic(
    temp_path: &Path,
    target_path: &Path,
    label: &str,
) -> Result<(), String> {
    match fs::rename(temp_path, target_path) {
        Ok(()) => Ok(()),
        Err(first_error) if target_path.exists() => {
            // Windows cannot always rename over an existing file. Keep the previous
            // file recoverable until the new one has been moved into place.
            let backup_path = target_path.with_extension(format!("{}.bak", uuid::Uuid::new_v4()));
            fs::rename(target_path, &backup_path).map_err(|error| {
                format!(
                    "Failed to prepare existing {label} for replacement after {first_error}: {error}"
                )
            })?;

            match fs::rename(temp_path, target_path) {
                Ok(()) => {
                    let _ = fs::remove_file(backup_path);
                    Ok(())
                }
                Err(error) => {
                    let _ = fs::rename(&backup_path, target_path);
                    Err(format!("Failed to replace {label}: {error}"))
                }
            }
        }
        Err(error) => Err(format!("Failed to replace {label}: {error}")),
    }
}

#[cfg(test)]
mod tests {
    use super::{read_json, write_json_atomic};
    use serde::{Deserialize, Serialize};

    #[derive(Debug, PartialEq, Serialize, Deserialize)]
    struct Example {
        value: String,
    }

    #[test]
    fn atomically_writes_and_replaces_json() {
        let directory =
            std::env::temp_dir().join(format!("dispatch-storage-test-{}", uuid::Uuid::new_v4()));
        let path = directory.join("example.json");

        write_json_atomic(
            &path,
            &Example {
                value: "one".into(),
            },
            "example",
        )
        .unwrap();
        write_json_atomic(
            &path,
            &Example {
                value: "two".into(),
            },
            "example",
        )
        .unwrap();

        let stored: Example = read_json(&path, "example").unwrap();
        assert_eq!(
            stored,
            Example {
                value: "two".into()
            }
        );

        std::fs::remove_dir_all(directory).unwrap();
    }
}
