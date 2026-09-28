mod auth;
mod models;
mod request;
mod schema;

use std::collections::{HashMap, HashSet};

use serde_json::Value;

use crate::{ApiRequest, Collection, Folder, OpenApiWarning, SavedRequest, inspect_openapi};
use request::{ConversionState, convert_operation};

pub use models::{
    OpenApiFolderOrganization, OpenApiImportContext, OpenApiImportDocument, OpenApiImportOptions,
    OpenApiRequestNaming,
};

const HTTP_METHODS: [&str; 7] = ["get", "post", "put", "patch", "delete", "head", "options"];

pub fn import_openapi(
    spec: &Value,
    collection_name: &str,
    selected_server: Option<&str>,
    options: &OpenApiImportOptions,
    context: &OpenApiImportContext,
) -> Result<OpenApiImportDocument, String> {
    validate_context(context)?;
    let mut state = ConversionState {
        warnings: inspect_openapi(spec, "Imported API")?.warnings,
        environment_variables: HashMap::new(),
    };
    let mut folders = Vec::new();
    let mut folder_by_name = HashMap::new();
    let mut requests = Vec::new();
    let paths = spec
        .get("paths")
        .and_then(Value::as_object)
        .ok_or_else(|| "OpenAPI paths are missing".to_string())?;

    if options.folder_organization == OpenApiFolderOrganization::Tags {
        let used_tags = paths
            .values()
            .filter_map(Value::as_object)
            .flat_map(|path_item| path_item.iter())
            .filter(|(method, _)| HTTP_METHODS.contains(&method.as_str()))
            .filter_map(|(_, operation)| {
                operation
                    .get("tags")
                    .and_then(Value::as_array)?
                    .first()?
                    .as_str()
            })
            .collect::<HashSet<_>>();
        if let Some(declared_tags) = spec.get("tags").and_then(Value::as_array) {
            for tag_name in declared_tags
                .iter()
                .filter_map(|tag| tag.get("name").and_then(Value::as_str))
                .filter(|tag_name| used_tags.contains(tag_name))
            {
                ensure_folder(tag_name, context, &mut folders, &mut folder_by_name);
            }
        }
    }

    for (path_name, path_item) in paths {
        if path_item.get("$ref").is_some() {
            continue;
        }
        let Some(path_item_object) = path_item.as_object() else {
            continue;
        };
        for (method, operation) in path_item_object
            .iter()
            .filter(|(key, value)| HTTP_METHODS.contains(&key.as_str()) && value.is_object())
        {
            let folder_name = match options.folder_organization {
                OpenApiFolderOrganization::Tags => operation
                    .get("tags")
                    .and_then(Value::as_array)
                    .and_then(|tags| tags.first())
                    .and_then(Value::as_str),
                OpenApiFolderOrganization::Path => first_static_path_segment(path_name),
            };
            let folder_id = folder_name
                .map(|name| ensure_folder(name, context, &mut folders, &mut folder_by_name));
            let sibling_order = requests
                .iter()
                .filter(|request: &&SavedRequest| request.folder_id == folder_id)
                .count() as i64;
            let request = convert_operation(
                spec,
                path_name,
                path_item,
                method,
                operation,
                selected_server,
                &mut state,
            );
            let name = request_name(
                operation,
                method,
                path_name,
                &request,
                &options.request_naming,
            );
            requests.push(SavedRequest {
                id: format!("{}-request-{}", context.id_prefix, requests.len()),
                name,
                request,
                folder_id,
                order: sibling_order,
                created_at: context.timestamp.clone(),
                updated_at: context.timestamp.clone(),
            });
        }
    }

    if requests.is_empty() {
        return Err("OpenAPI document does not contain any supported operations".to_string());
    }
    Ok(OpenApiImportDocument {
        collection: Collection {
            id: context.collection_id.clone(),
            name: collection_name.to_string(),
            folders,
            requests,
            created_at: context.timestamp.clone(),
            updated_at: context.timestamp.clone(),
        },
        environment_variables: state.environment_variables,
        warnings: state.warnings,
    })
}

fn validate_context(context: &OpenApiImportContext) -> Result<(), String> {
    if context.collection_id.trim().is_empty()
        || context.id_prefix.trim().is_empty()
        || context.timestamp.trim().is_empty()
    {
        return Err("OpenAPI import context is incomplete".to_string());
    }
    Ok(())
}

fn ensure_folder(
    name: &str,
    context: &OpenApiImportContext,
    folders: &mut Vec<Folder>,
    folder_by_name: &mut HashMap<String, String>,
) -> String {
    if let Some(id) = folder_by_name.get(name) {
        return id.clone();
    }
    let id = format!("{}-folder-{}", context.id_prefix, folders.len());
    folder_by_name.insert(name.to_string(), id.clone());
    folders.push(Folder {
        id: id.clone(),
        name: name.to_string(),
        collection_id: context.collection_id.clone(),
        parent_folder_id: None,
        order: folders.len() as i64,
        created_at: context.timestamp.clone(),
        updated_at: context.timestamp.clone(),
    });
    id
}

fn request_name(
    operation: &Value,
    method: &str,
    path: &str,
    request: &ApiRequest,
    strategy: &OpenApiRequestNaming,
) -> String {
    match strategy {
        OpenApiRequestNaming::Path => format!("{} {path}", method.to_uppercase()),
        OpenApiRequestNaming::Url => request.url.clone(),
        OpenApiRequestNaming::Fallback => operation
            .get("summary")
            .or_else(|| operation.get("operationId"))
            .and_then(Value::as_str)
            .filter(|value| !value.trim().is_empty())
            .map(|value| value.trim().to_string())
            .or_else(|| {
                operation
                    .get("description")
                    .and_then(Value::as_str)
                    .and_then(|description| {
                        description.lines().find(|line| !line.trim().is_empty())
                    })
                    .map(|line| line.trim().to_string())
            })
            .or_else(|| (!request.url.trim().is_empty()).then(|| request.url.clone()))
            .unwrap_or_else(|| format!("{} {path}", method.to_uppercase())),
    }
}

fn import_server_url(server: &Value, variables: &mut HashMap<String, String>) -> String {
    let mut url = server
        .get("url")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim_end_matches('/')
        .to_string();
    if let Some(definitions) = server.get("variables").and_then(Value::as_object) {
        for (name, definition) in definitions {
            let default = definition
                .get("default")
                .cloned()
                .map(schema::value_to_text)
                .unwrap_or_default();
            variables.entry(name.clone()).or_insert(default);
            url = url.replace(&format!("{{{name}}}"), &format!("{{{{{name}}}}}"));
        }
    }
    url
}

fn ensure_leading_slash(value: &str) -> String {
    if value.starts_with('/') {
        value.to_string()
    } else {
        format!("/{value}")
    }
}

fn encode_query_part(value: &str) -> String {
    if value.contains("{{") {
        value.to_string()
    } else {
        url::form_urlencoded::byte_serialize(value.as_bytes()).collect()
    }
}

fn first_static_path_segment(path: &str) -> Option<&str> {
    path.split('/').map(str::trim).find(|segment| {
        !segment.is_empty() && !(segment.starts_with('{') && segment.ends_with('}'))
    })
}

fn pointer_escape(value: &str) -> String {
    value.replace('~', "~0").replace('/', "~1")
}

fn warning(code: &str, message: &str, location: Option<String>) -> OpenApiWarning {
    OpenApiWarning {
        code: code.to_string(),
        message: message.to_string(),
        location,
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn context() -> OpenApiImportContext {
        OpenApiImportContext {
            collection_id: "collection-1".into(),
            id_prefix: "import-1".into(),
            timestamp: "2026-01-01T00:00:00Z".into(),
        }
    }

    #[test]
    fn imports_parameters_body_auth_and_declared_tag_order() {
        let spec = json!({
            "openapi": "3.1.0",
            "info": { "title": "Pet API" },
            "servers": [{ "url": "https://api.example.com" }],
            "tags": [{ "name": "Admin" }, { "name": "Pets" }],
            "components": {
                "securitySchemes": { "BearerAuth": { "type": "http", "scheme": "bearer" } },
                "schemas": { "Pet": { "type": "object", "properties": { "name": { "type": "string" } } } }
            },
            "paths": {
                "/pets/{id}": {
                    "post": {
                        "summary": "Update pet",
                        "tags": ["Pets"],
                        "security": [{ "BearerAuth": [] }],
                        "parameters": [
                            { "name": "id", "in": "path", "schema": { "type": "string", "example": "42" } },
                            { "name": "expand", "in": "query", "schema": { "default": "owner" } }
                        ],
                        "requestBody": { "content": { "application/json": { "schema": { "$ref": "#/components/schemas/Pet" } } } }
                    }
                }
            }
        });
        let imported = import_openapi(
            &spec,
            "Pet API",
            Some("https://api.example.com"),
            &OpenApiImportOptions::default(),
            &context(),
        )
        .unwrap();
        assert_eq!(imported.collection.folders[0].name, "Pets");
        assert_eq!(imported.collection.requests[0].id, "import-1-request-0");
        let request = &imported.collection.requests[0].request;
        assert_eq!(request.url, "{{baseUrl}}/pets/{{id}}?expand=owner");
        assert_eq!(request.body_type, crate::RequestBodyType::Json);
        assert!(matches!(
            request.auth,
            Some(crate::AuthConfig::Bearer { .. })
        ));
        assert_eq!(imported.environment_variables["id"], "42");
    }

    #[test]
    fn preserves_operation_servers_and_supports_path_naming() {
        let spec = json!({
            "openapi": "3.0.3",
            "info": { "title": "Mixed" },
            "paths": {
                "/remote": { "get": { "servers": [{ "url": "https://api.example.com" }] } },
                "/variable/{id}": { "get": {
                    "servers": [{ "url": "{Base_Url}", "variables": { "Base_Url": { "default": "https://variable.example.com" } } }],
                    "parameters": [{ "name": "id", "in": "path", "schema": { "type": "string" } }]
                } }
            }
        });
        let options = OpenApiImportOptions {
            request_naming: OpenApiRequestNaming::Path,
            folder_organization: OpenApiFolderOrganization::Path,
        };
        let imported = import_openapi(&spec, "Mixed", None, &options, &context()).unwrap();
        assert_eq!(imported.collection.requests[0].name, "GET /remote");
        assert_eq!(
            imported.collection.requests[0].request.url,
            "https://api.example.com/remote"
        );
        assert_eq!(
            imported.collection.requests[1].request.url,
            "{{Base_Url}}/variable/{{id}}"
        );
        assert_eq!(
            imported.environment_variables["Base_Url"],
            "https://variable.example.com"
        );
    }

    #[test]
    fn keeps_document_and_sibling_order() {
        let spec: Value = serde_norway::from_str(
            r#"openapi: 3.1.0
info:
  title: Store
paths:
  /auth/register:
    post:
      summary: Register
      tags: [Auth]
  /auth/login:
    post:
      summary: Login
      tags: [Auth]
  /products:
    get:
      summary: Products
      tags: [Catalog]
"#,
        )
        .unwrap();
        let imported = import_openapi(
            &spec,
            "Store",
            None,
            &OpenApiImportOptions::default(),
            &context(),
        )
        .unwrap();
        assert_eq!(
            imported
                .collection
                .requests
                .iter()
                .map(|item| item.name.as_str())
                .collect::<Vec<_>>(),
            ["Register", "Login", "Products"]
        );
        assert_eq!(
            imported
                .collection
                .requests
                .iter()
                .map(|item| item.order)
                .collect::<Vec<_>>(),
            [0, 1, 0]
        );
    }

    #[test]
    fn supports_url_naming_and_path_folders() {
        let spec = json!({
            "openapi": "3.0.3",
            "info": { "title": "Options" },
            "paths": {
                "/{tenant}/users/{id}": { "get": { "summary": "User" } },
                "/admin/login": { "post": { "summary": "Login" } }
            }
        });
        let options = OpenApiImportOptions {
            request_naming: OpenApiRequestNaming::Url,
            folder_organization: OpenApiFolderOrganization::Path,
        };
        let imported = import_openapi(
            &spec,
            "Options",
            Some("https://api.example.com"),
            &options,
            &context(),
        )
        .unwrap();
        assert_eq!(
            imported
                .collection
                .folders
                .iter()
                .map(|item| item.name.as_str())
                .collect::<Vec<_>>(),
            ["users", "admin"]
        );
        assert_eq!(
            imported.collection.requests[0].name,
            "{{baseUrl}}/{tenant}/users/{id}"
        );
    }
}
