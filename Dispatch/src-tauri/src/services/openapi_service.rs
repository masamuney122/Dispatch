use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;

use chrono::Utc;
use dispatch_core::{
    export_collection_openapi as export_collection_openapi_core,
    import_openapi as import_openapi_core, parse_openapi,
    OpenApiImportContext as CoreImportContext, OpenApiImportOptions as CoreImportOptions,
    MAX_OPENAPI_SIZE,
};
use serde_json::Value;

use crate::models::environment::{AppState, Environment};
use crate::models::openapi::{
    OpenApiExportOptions, OpenApiExportResult, OpenApiImportOptions, OpenApiImportPreview,
    OpenApiImportResult, OpenApiSource, OpenApiWarning,
};
use crate::models::workspace::{
    CollectionsDocument, EnvironmentsDocument, WorkspaceSession, COLLECTIONS_FILE,
    ENVIRONMENTS_FILE, WORKSPACE_SCHEMA_VERSION,
};
use crate::services::storage_service::{read_json, write_bytes_atomic, write_json_atomic};
use crate::services::workspace_service::workspace_file;

const HTTP_METHODS: [&str; 7] = ["get", "post", "put", "patch", "delete", "head", "options"];

#[derive(Default)]
struct ConversionState {
    warnings: Vec<OpenApiWarning>,
    environment_variables: HashMap<String, String>,
}

pub fn inspect_openapi(path: &Path) -> Result<OpenApiImportPreview, String> {
    inspect_openapi_source(&OpenApiSource::File {
        path: path.to_string_lossy().to_string(),
    })
}

pub fn inspect_openapi_source(source: &OpenApiSource) -> Result<OpenApiImportPreview, String> {
    let (spec, fallback_title) = parse_openapi_source(source)?;
    inspect_document(&spec, &fallback_title)
}

fn inspect_document(spec: &Value, fallback_title: &str) -> Result<OpenApiImportPreview, String> {
    dispatch_core::inspect_openapi(spec, fallback_title)
}

pub fn import_openapi(
    session: &WorkspaceSession,
    app_state: &mut AppState,
    source_path: &Path,
    options: &OpenApiImportOptions,
) -> Result<OpenApiImportResult, String> {
    import_openapi_source(
        session,
        app_state,
        &OpenApiSource::File {
            path: source_path.to_string_lossy().to_string(),
        },
        options,
    )
}

pub fn import_openapi_source(
    session: &WorkspaceSession,
    app_state: &mut AppState,
    source: &OpenApiSource,
    options: &OpenApiImportOptions,
) -> Result<OpenApiImportResult, String> {
    let (spec, fallback_title) = parse_openapi_source(source)?;
    let collections_path = workspace_file(session, COLLECTIONS_FILE);
    let environments_path = workspace_file(session, ENVIRONMENTS_FILE);
    let original_collections: CollectionsDocument =
        read_json(&collections_path, "collections document")?;
    let original_environments: EnvironmentsDocument =
        read_json(&environments_path, "environments document")?;
    validate_workspace_documents(session, &original_collections, &original_environments)?;

    let requested_name = options.collection_name.trim();
    let fallback_name = spec
        .pointer("/info/title")
        .and_then(Value::as_str)
        .unwrap_or(&fallback_title);
    let collection_name = unique_name(
        if requested_name.is_empty() {
            fallback_name
        } else {
            requested_name
        },
        original_collections
            .collections
            .iter()
            .map(|item| item.name.as_str()),
    );
    let discovered_servers = server_urls(&spec);
    let server = options
        .selected_server
        .clone()
        .filter(|value| !value.trim().is_empty())
        .or_else(|| {
            (discovered_servers.len() == 1 && !discovered_servers[0].contains('{'))
                .then(|| discovered_servers[0].clone())
        });
    let import_id = uuid::Uuid::new_v4().to_string();
    let import_context = CoreImportContext {
        collection_id: uuid::Uuid::new_v4().to_string(),
        id_prefix: import_id,
        timestamp: Utc::now().to_rfc3339(),
    };
    let core_options = CoreImportOptions {
        request_naming: options.request_naming.clone(),
        folder_organization: options.folder_organization.clone(),
    };
    let imported = import_openapi_core(
        &spec,
        &collection_name,
        server.as_deref(),
        &core_options,
        &import_context,
    )?;
    let collection = imported.collection;
    let mut state = ConversionState {
        warnings: imported.warnings,
        environment_variables: imported.environment_variables,
    };

    let environment = if options.create_environment {
        if let Some(server_url) = server {
            state
                .environment_variables
                .insert("baseUrl".to_string(), server_url);
        }
        let requested_environment_name = options
            .environment_name
            .as_deref()
            .map(str::trim)
            .filter(|name| !name.is_empty())
            .map(str::to_string)
            .unwrap_or_else(|| format!("{} Environment", collection.name));
        let name = unique_name(
            &requested_environment_name,
            original_environments
                .environments
                .iter()
                .map(|item| item.name.as_str()),
        );
        let now = Utc::now().to_rfc3339();
        Some(Environment {
            id: uuid::Uuid::new_v4().to_string(),
            name,
            variables: state.environment_variables.clone(),
            workspace_id: Some(session.manifest.id.clone()),
            created_at: now.clone(),
            updated_at: now,
        })
    } else {
        None
    };

    let now = Utc::now().to_rfc3339();
    let mut updated_collections = original_collections.clone();
    updated_collections.revision = updated_collections.revision.saturating_add(1);
    updated_collections.updated_at = now.clone();
    updated_collections.collections.push(collection.clone());

    let mut updated_environments = original_environments.clone();
    if let Some(environment) = &environment {
        updated_environments.revision = updated_environments.revision.saturating_add(1);
        updated_environments.updated_at = now;
        updated_environments.environments.push(environment.clone());
    }

    write_json_atomic(
        &collections_path,
        &updated_collections,
        "collections document",
    )?;
    if environment.is_some() {
        if let Err(error) = write_json_atomic(
            &environments_path,
            &updated_environments,
            "environments document",
        ) {
            let rollback = write_json_atomic(
                &collections_path,
                &original_collections,
                "collections rollback",
            );
            return Err(match rollback {
                Ok(()) => format!("OpenAPI import failed and was rolled back: {error}"),
                Err(rollback_error) => format!(
                    "OpenAPI import failed: {error}. Collection rollback also failed: {rollback_error}"
                ),
            });
        }
        app_state.environments = updated_environments.environments;
    }

    Ok(OpenApiImportResult {
        collection,
        environment,
        warnings: state.warnings,
    })
}

pub fn export_collection(
    session: &WorkspaceSession,
    collection_id: &str,
    destination: &Path,
    options: &OpenApiExportOptions,
) -> Result<OpenApiExportResult, String> {
    let collections_path = workspace_file(session, COLLECTIONS_FILE);
    let document: CollectionsDocument = read_json(&collections_path, "collections document")?;
    let collection = document
        .collections
        .iter()
        .find(|item| item.id == collection_id)
        .ok_or_else(|| format!("Collection not found: {collection_id}"))?;
    let exported = export_collection_openapi_core(collection, options)?;
    write_bytes_atomic(destination, exported.content.as_bytes(), "OpenAPI export")?;
    Ok(OpenApiExportResult {
        path: destination.to_string_lossy().to_string(),
        request_count: exported.request_count,
        endpoint_count: exported.endpoint_count,
        grouped_request_count: exported.grouped_request_count,
        warnings: exported.warnings,
    })
}

fn parse_openapi_source(source: &OpenApiSource) -> Result<(Value, String), String> {
    let (content, fallback_title) = match source {
        OpenApiSource::File { path } => {
            let path = Path::new(path);
            let metadata = fs::metadata(path)
                .map_err(|error| format!("Failed to inspect OpenAPI file: {error}"))?;
            if metadata.len() > MAX_OPENAPI_SIZE as u64 {
                return Err("OpenAPI file is larger than 10 MB".to_string());
            }
            let content = fs::read_to_string(path)
                .map_err(|error| format!("Failed to read OpenAPI file: {error}"))?;
            (content, file_stem(path).to_string())
        }
        OpenApiSource::Text { content } => {
            if content.len() > MAX_OPENAPI_SIZE {
                return Err("OpenAPI text is larger than 10 MB".to_string());
            }
            (content.clone(), "Imported API".to_string())
        }
    };

    let spec = parse_openapi(&content)?;
    Ok((spec, fallback_title))
}

fn server_urls(spec: &Value) -> Vec<String> {
    let mut result = Vec::new();
    let mut append = |servers: Option<&Vec<Value>>| {
        for url in servers
            .into_iter()
            .flatten()
            .filter_map(|item| item.get("url").and_then(Value::as_str))
        {
            if !result.iter().any(|existing| existing == url) {
                result.push(url.to_string());
            }
        }
    };
    append(spec.get("servers").and_then(Value::as_array));
    if let Some(paths) = spec.get("paths").and_then(Value::as_object) {
        for path_item in paths.values() {
            append(path_item.get("servers").and_then(Value::as_array));
            for method in HTTP_METHODS {
                append(
                    path_item
                        .get(method)
                        .and_then(|operation| operation.get("servers"))
                        .and_then(Value::as_array),
                );
            }
        }
    }
    result
}

fn unique_name<'a>(requested: &str, existing: impl Iterator<Item = &'a str>) -> String {
    let names = existing.collect::<HashSet<_>>();
    if !names.contains(requested) {
        return requested.to_string();
    }
    let imported = format!("{requested} (Imported)");
    if !names.contains(imported.as_str()) {
        return imported;
    }
    for number in 2.. {
        let candidate = format!("{requested} (Imported {number})");
        if !names.contains(candidate.as_str()) {
            return candidate;
        }
    }
    unreachable!()
}

fn file_stem(path: &Path) -> &str {
    path.file_stem()
        .and_then(|item| item.to_str())
        .unwrap_or("Imported API")
}

fn validate_workspace_documents(
    session: &WorkspaceSession,
    collections: &CollectionsDocument,
    environments: &EnvironmentsDocument,
) -> Result<(), String> {
    if collections.schema_version != WORKSPACE_SCHEMA_VERSION
        || environments.schema_version != WORKSPACE_SCHEMA_VERSION
    {
        return Err("Workspace documents use an unsupported schema version".to_string());
    }
    if collections.workspace_id != session.manifest.id
        || environments.workspace_id != session.manifest.id
    {
        return Err("Workspace documents belong to another workspace".to_string());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{export_collection, import_openapi, inspect_openapi, inspect_openapi_source};
    use crate::models::environment::AppState;
    use crate::models::openapi::{
        OpenApiExportFormat, OpenApiExportOptions, OpenApiImportOptions, OpenApiSource,
    };
    use crate::services::workspace_service;

    #[test]
    fn inspects_openapi_yaml_supplied_as_text() {
        let preview = inspect_openapi_source(&OpenApiSource::Text {
            content: r#"openapi: 3.1.0
info:
  title: Text API
  version: 1.0.0
servers:
  - url: https://api.example.com
paths:
  /users:
    get:
      tags: [Users]
  /orders/{id}:
    get:
      tags: [Orders]
"#
            .to_string(),
        })
        .unwrap();

        assert_eq!(preview.title, "Text API");
        assert_eq!(preview.specification_version, "3.1.0");
        assert_eq!(preview.endpoint_count, 2);
        assert_eq!(preview.tag_folder_count, 2);
        assert_eq!(preview.path_folder_count, 2);
        assert_eq!(preview.servers, ["https://api.example.com"]);

        let json_preview = inspect_openapi_source(&OpenApiSource::Text {
            content: r#"{
              "openapi": "3.0.3",
              "info": { "title": "JSON Text API", "version": "1.0.0" },
              "paths": { "/health": { "get": { "summary": "Health" } } }
            }"#
            .to_string(),
        })
        .unwrap();
        assert_eq!(json_preview.title, "JSON Text API");
        assert_eq!(json_preview.endpoint_count, 1);
    }

    #[test]
    fn imports_and_exports_a_yaml_document_inside_a_workspace() {
        let root =
            std::env::temp_dir().join(format!("dispatch-openapi-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        let source = root.join("pet-api.yaml");
        std::fs::write(
            &source,
            r#"openapi: 3.0.3
info:
  title: Pet API
  version: 1.0.0
servers:
  - url: https://pets.example.com
paths:
  /pets:
    post:
      summary: Create pet
      tags: [Pets]
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                name:
                  type: string
      responses:
        '201':
          description: Created
"#,
        )
        .unwrap();
        let workspace =
            workspace_service::create_workspace(&root.join("workspace"), "Test").unwrap();
        let preview = inspect_openapi(&source).unwrap();
        assert_eq!(preview.endpoint_count, 1);

        let mut app_state = AppState::default();
        let imported = import_openapi(
            &workspace,
            &mut app_state,
            &source,
            &OpenApiImportOptions {
                collection_name: "Pet API".to_string(),
                selected_server: Some("https://pets.example.com".to_string()),
                create_environment: true,
                environment_name: Some("Pet Environment".to_string()),
                ..OpenApiImportOptions::default()
            },
        )
        .unwrap();
        assert_eq!(imported.collection.requests.len(), 1);
        let imported_body: serde_json::Value =
            serde_json::from_str(&imported.collection.requests[0].request.body).unwrap();
        assert_eq!(imported_body["name"], "string");
        assert_eq!(app_state.environments.len(), 1);
        assert_eq!(
            app_state.environments[0].variables["baseUrl"],
            "https://pets.example.com"
        );

        let destination = root.join("exported.json");
        let exported = export_collection(
            &workspace,
            &imported.collection.id,
            &destination,
            &OpenApiExportOptions {
                title: "Pet API".to_string(),
                api_version: "1.0.0".to_string(),
                format: OpenApiExportFormat::Json,
                server_url: Some("https://pets.example.com".to_string()),
            },
        )
        .unwrap();
        assert_eq!(exported.endpoint_count, 1);
        let exported_value: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(destination).unwrap()).unwrap();
        assert_eq!(exported_value["openapi"], "3.0.3");
        assert!(exported_value["paths"]["/pets"]["post"].is_object());

        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn accepts_openapi_31_yaml_documents() {
        let root =
            std::env::temp_dir().join(format!("dispatch-openapi-31-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        let source = root.join("storefront.yaml");
        std::fs::write(
            &source,
            r#"openapi: 3.1.0
info:
  title: Storefront API
  version: 1.0.0
servers:
  - url: https://storefront.example.com/v1
components:
  securitySchemes:
    BearerAuth:
      type: http
      scheme: bearer
paths:
  /products/{id}:
    get:
      summary: Get product
      security:
        - BearerAuth: []
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Product
"#,
        )
        .unwrap();

        let preview = inspect_openapi(&source).unwrap();
        assert_eq!(preview.specification_version, "3.1.0");
        assert_eq!(preview.endpoint_count, 1);
        assert_eq!(preview.servers, ["https://storefront.example.com/v1"]);
        assert_eq!(preview.security_schemes, ["BearerAuth"]);

        std::fs::remove_dir_all(root).unwrap();
    }
}
