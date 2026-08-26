use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;

pub const WORKSPACE_FORMAT: &str = "dispatch-workspace";
pub const WORKSPACE_SCHEMA_VERSION: u32 = 1;
pub const MAX_OPENAPI_SIZE: usize = 10 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorkspaceManifest {
    pub format: String,
    pub schema_version: u32,
    pub id: String,
    pub name: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Folder {
    pub id: String,
    pub name: String,
    pub collection_id: String,
    #[serde(default)]
    pub parent_folder_id: Option<String>,
    #[serde(default)]
    pub order: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SavedRequest {
    pub id: String,
    pub name: String,
    pub request: Value,
    #[serde(default)]
    pub folder_id: Option<String>,
    #[serde(default)]
    pub order: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Collection {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub folders: Vec<Folder>,
    #[serde(default)]
    pub requests: Vec<SavedRequest>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Environment {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub variables: HashMap<String, String>,
    #[serde(default)]
    pub workspace_id: Option<String>,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CollectionsDocument {
    pub schema_version: u32,
    pub workspace_id: String,
    pub revision: u64,
    pub updated_at: String,
    #[serde(default)]
    pub collections: Vec<Collection>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct EnvironmentsDocument {
    pub schema_version: u32,
    pub workspace_id: String,
    pub revision: u64,
    pub updated_at: String,
    #[serde(default)]
    pub environments: Vec<Environment>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorkspaceBundle {
    pub manifest: WorkspaceManifest,
    pub collections: CollectionsDocument,
    pub environments: EnvironmentsDocument,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ResolveResult {
    pub value: String,
    pub unresolved: Vec<String>,
}

#[derive(Debug, Error, PartialEq)]
pub enum WorkspaceError {
    #[error("{file} geçerli JSON değil: {message}")]
    InvalidJson { file: &'static str, message: String },
    #[error("Bu klasör bir Dispatch workspace değil")]
    InvalidFormat,
    #[error("Desteklenmeyen workspace şema sürümü: {0}")]
    UnsupportedSchema(u32),
    #[error("{file} başka bir workspace'e ait")]
    WorkspaceIdMismatch { file: &'static str },
    #[error("{kind} kimliği birden fazla kez kullanılmış: {id}")]
    DuplicateId { kind: &'static str, id: String },
    #[error("'{folder}' klasörü yanlış collection kimliğine bağlı")]
    InvalidFolderCollection { folder: String },
    #[error("'{environment}' environment'ı yanlış workspace kimliğine bağlı")]
    InvalidEnvironmentWorkspace { environment: String },
}

pub fn parse_and_validate(
    manifest_json: &str,
    collections_json: &str,
    environments_json: &str,
) -> Result<WorkspaceBundle, WorkspaceError> {
    let manifest: WorkspaceManifest = parse_json("dispatch.workspace.json", manifest_json)?;
    let collections: CollectionsDocument = parse_json("collections.json", collections_json)?;
    let environments: EnvironmentsDocument = parse_json("environments.json", environments_json)?;

    if manifest.format != WORKSPACE_FORMAT {
        return Err(WorkspaceError::InvalidFormat);
    }
    for schema in [
        manifest.schema_version,
        collections.schema_version,
        environments.schema_version,
    ] {
        if schema != WORKSPACE_SCHEMA_VERSION {
            return Err(WorkspaceError::UnsupportedSchema(schema));
        }
    }
    if collections.workspace_id != manifest.id {
        return Err(WorkspaceError::WorkspaceIdMismatch {
            file: "collections.json",
        });
    }
    if environments.workspace_id != manifest.id {
        return Err(WorkspaceError::WorkspaceIdMismatch {
            file: "environments.json",
        });
    }

    let mut collection_ids = HashSet::new();
    let mut request_ids = HashSet::new();
    let mut folder_ids = HashSet::new();
    for collection in &collections.collections {
        ensure_unique(&mut collection_ids, "Collection", &collection.id)?;
        for folder in &collection.folders {
            ensure_unique(&mut folder_ids, "Klasör", &folder.id)?;
            if folder.collection_id != collection.id {
                return Err(WorkspaceError::InvalidFolderCollection {
                    folder: folder.name.clone(),
                });
            }
        }
        for request in &collection.requests {
            ensure_unique(&mut request_ids, "Request", &request.id)?;
        }
    }

    let mut environment_ids = HashSet::new();
    for environment in &environments.environments {
        ensure_unique(&mut environment_ids, "Environment", &environment.id)?;
        if environment
            .workspace_id
            .as_deref()
            .is_some_and(|id| id != manifest.id)
        {
            return Err(WorkspaceError::InvalidEnvironmentWorkspace {
                environment: environment.name.clone(),
            });
        }
    }

    Ok(WorkspaceBundle {
        manifest,
        collections,
        environments,
    })
}

pub fn resolve_template(input: &str, variables: &HashMap<String, String>) -> ResolveResult {
    let mut value = String::with_capacity(input.len());
    let mut unresolved = Vec::new();
    let mut remaining = input;

    while let Some(start) = remaining.find("{{") {
        value.push_str(&remaining[..start]);
        let after_open = &remaining[start + 2..];
        let Some(end) = after_open.find("}}") else {
            value.push_str(&remaining[start..]);
            remaining = "";
            break;
        };

        let raw_token = &after_open[..end];
        let key = raw_token.trim();
        if let Some(replacement) = variables.get(key) {
            value.push_str(replacement);
        } else {
            value.push_str("{{");
            value.push_str(raw_token);
            value.push_str("}}");
            if !key.is_empty() && !unresolved.iter().any(|item| item == key) {
                unresolved.push(key.to_string());
            }
        }
        remaining = &after_open[end + 2..];
    }
    value.push_str(remaining);

    ResolveResult { value, unresolved }
}

pub fn parse_openapi(content: &str) -> Result<Value, String> {
    if content.len() > MAX_OPENAPI_SIZE {
        return Err("OpenAPI içeriği 10 MB sınırını aşıyor".to_string());
    }
    if content.trim().is_empty() {
        return Err("OpenAPI içeriği boş olamaz".to_string());
    }
    let spec: Value = if content.trim_start().starts_with('{') {
        serde_json::from_str(content).map_err(|error| format!("Geçersiz OpenAPI JSON: {error}"))?
    } else {
        serde_norway::from_str(content)
            .map_err(|error| format!("Geçersiz OpenAPI YAML: {error}"))?
    };
    let version = spec
        .get("openapi")
        .and_then(Value::as_str)
        .ok_or_else(|| "Dosyada OpenAPI versiyonu bulunamadı".to_string())?;
    if !version.starts_with("3.0.") && !version.starts_with("3.1.") {
        return Err(format!(
            "Desteklenmeyen OpenAPI versiyonu {version}. Dispatch Web, OpenAPI 3.0.x ve 3.1.x destekliyor"
        ));
    }
    if !spec.get("paths").is_some_and(Value::is_object) {
        return Err("OpenAPI belgesinde geçerli bir paths alanı bulunamadı".to_string());
    }
    Ok(spec)
}

pub fn serialize_openapi_yaml(spec: &Value) -> Result<String, String> {
    serde_norway::to_string(spec)
        .map(|mut yaml| {
            if !yaml.ends_with('\n') {
                yaml.push('\n');
            }
            yaml
        })
        .map_err(|error| format!("OpenAPI YAML oluşturulamadı: {error}"))
}

fn parse_json<T: for<'de> Deserialize<'de>>(
    file: &'static str,
    json: &str,
) -> Result<T, WorkspaceError> {
    serde_json::from_str(json).map_err(|error| WorkspaceError::InvalidJson {
        file,
        message: error.to_string(),
    })
}

fn ensure_unique(
    ids: &mut HashSet<String>,
    kind: &'static str,
    id: &str,
) -> Result<(), WorkspaceError> {
    if ids.insert(id.to_string()) {
        Ok(())
    } else {
        Err(WorkspaceError::DuplicateId {
            kind,
            id: id.to_string(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const MANIFEST: &str = r#"{
      "format":"dispatch-workspace","schema_version":1,"id":"workspace-1","name":"Demo",
      "created_at":"2026-08-21T00:00:00Z","updated_at":"2026-08-21T00:00:00Z"
    }"#;
    const COLLECTIONS: &str = r#"{
      "schema_version":1,"workspace_id":"workspace-1","revision":0,
      "updated_at":"2026-08-21T00:00:00Z","collections":[]
    }"#;
    const ENVIRONMENTS: &str = r#"{
      "schema_version":1,"workspace_id":"workspace-1","revision":0,
      "updated_at":"2026-08-21T00:00:00Z","environments":[]
    }"#;

    #[test]
    fn validates_a_desktop_workspace() {
        let result = parse_and_validate(MANIFEST, COLLECTIONS, ENVIRONMENTS).unwrap();
        assert_eq!(result.manifest.name, "Demo");
    }

    #[test]
    fn rejects_documents_from_another_workspace() {
        let collections = COLLECTIONS.replace("workspace-1", "workspace-2");
        let error = parse_and_validate(MANIFEST, &collections, ENVIRONMENTS).unwrap_err();
        assert_eq!(
            error,
            WorkspaceError::WorkspaceIdMismatch {
                file: "collections.json"
            }
        );
    }

    #[test]
    fn resolves_known_variables_and_reports_unknown_ones() {
        let variables = HashMap::from([("baseUrl".into(), "https://example.com".into())]);
        let result = resolve_template("{{ baseUrl }}/users/{{missing}}", &variables);
        assert_eq!(result.value, "https://example.com/users/{{missing}}");
        assert_eq!(result.unresolved, vec!["missing"]);
    }

    #[test]
    fn parses_openapi_yaml_and_json() {
        let yaml =
            parse_openapi("openapi: 3.1.0\ninfo:\n  title: Demo\n  version: 1.0.0\npaths: {}\n")
                .unwrap();
        assert_eq!(yaml["info"]["title"], "Demo");

        let json = parse_openapi(
            r#"{"openapi":"3.0.3","info":{"title":"JSON","version":"1"},"paths":{}}"#,
        )
        .unwrap();
        assert_eq!(json["openapi"], "3.0.3");
        assert!(
            serialize_openapi_yaml(&json)
                .unwrap()
                .contains("openapi: 3.0.3")
        );
    }
}
