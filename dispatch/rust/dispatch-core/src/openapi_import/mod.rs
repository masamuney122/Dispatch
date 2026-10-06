mod auth;
mod models;
mod request;
mod schema;

use std::collections::{HashMap, HashSet};

use serde::Deserialize;
use serde_json::Value;

use crate::{
    ApiRequest, BodyField, Collection, Folder, OpenApiWarning, RequestBodyType,
    RequestHttpSettings, SavedRequest, inspect_openapi,
};
use request::{ConversionState, convert_operation};

pub use models::{
    OpenApiFolderOrganization, OpenApiImportContext, OpenApiImportDocument, OpenApiImportOptions,
    OpenApiRequestNaming,
};

const HTTP_METHODS: [&str; 7] = ["get", "post", "put", "patch", "delete", "head", "options"];

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DispatchRequestMetadata {
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    method: Option<String>,
    #[serde(default)]
    url: Option<String>,
    #[serde(default)]
    body_type: Option<RequestBodyType>,
    #[serde(default)]
    folder: Option<String>,
    #[serde(default)]
    order: Option<i64>,
    #[serde(default)]
    settings: Option<RequestHttpSettings>,
    #[serde(default)]
    request: Option<ApiRequest>,
}

struct ImportedRequestVariant {
    name: String,
    folder: Option<String>,
    order: Option<i64>,
    request: ApiRequest,
}

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
            let request = convert_operation(
                spec,
                path_name,
                path_item,
                method,
                operation,
                selected_server,
                &mut state,
            );
            let default_name = request_name(
                operation,
                method,
                path_name,
                &request,
                &options.request_naming,
            );
            for variant in dispatch_request_variants(operation, request, default_name) {
                let variant_folder_name = match options.folder_organization {
                    OpenApiFolderOrganization::Tags => variant.folder.as_deref().or(folder_name),
                    OpenApiFolderOrganization::Path => folder_name,
                };
                let folder_id = variant_folder_name
                    .map(|name| ensure_folder(name, context, &mut folders, &mut folder_by_name));
                let sibling_order = requests
                    .iter()
                    .filter(|request: &&SavedRequest| request.folder_id == folder_id)
                    .count() as i64;
                requests.push(SavedRequest {
                    id: format!("{}-request-{}", context.id_prefix, requests.len()),
                    name: variant.name,
                    request: variant.request,
                    folder_id,
                    order: variant.order.unwrap_or(sibling_order),
                    created_at: context.timestamp.clone(),
                    updated_at: context.timestamp.clone(),
                });
            }
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

fn dispatch_request_variants(
    operation: &Value,
    default_request: ApiRequest,
    default_name: String,
) -> Vec<ImportedRequestVariant> {
    let Some(items) = operation
        .get("x-dispatch-requests")
        .and_then(Value::as_array)
        .filter(|items| !items.is_empty())
    else {
        return vec![ImportedRequestVariant {
            name: default_name,
            folder: None,
            order: None,
            request: default_request,
        }];
    };

    let variants = items
        .iter()
        .filter_map(|item| {
            let metadata = serde_json::from_value::<DispatchRequestMetadata>(item.clone()).ok()?;
            if metadata.request.is_none()
                && metadata.name.is_none()
                && metadata.method.is_none()
                && metadata.url.is_none()
            {
                return None;
            }

            let has_full_request = metadata.request.is_some();
            let mut request = metadata.request.unwrap_or_else(|| default_request.clone());
            if let Some(method) = metadata.method.filter(|value| !value.trim().is_empty()) {
                request.method = method;
            }
            if let Some(url) = metadata.url.filter(|value| !value.trim().is_empty()) {
                request.url = url;
            }
            if let Some(body_type) = metadata.body_type {
                request.body_type = body_type;
            }
            if let Some(settings) = metadata.settings {
                request.settings = settings;
            }
            let name = metadata
                .name
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| default_name.clone());
            if !has_full_request {
                apply_dispatch_named_examples(operation, &name, &mut request);
            }

            Some(ImportedRequestVariant {
                name,
                folder: metadata.folder.filter(|value| !value.trim().is_empty()),
                order: metadata.order,
                request,
            })
        })
        .collect::<Vec<_>>();

    if variants.is_empty() {
        vec![ImportedRequestVariant {
            name: default_name,
            folder: None,
            order: None,
            request: default_request,
        }]
    } else {
        variants
    }
}

fn apply_dispatch_named_examples(operation: &Value, request_name: &str, request: &mut ApiRequest) {
    let example_key = dispatch_example_key(request_name);
    if let Some(parameters) = operation.get("parameters").and_then(Value::as_array) {
        for parameter in parameters {
            if parameter.get("in").and_then(Value::as_str) != Some("header") {
                continue;
            }
            let Some(name) = parameter.get("name").and_then(Value::as_str) else {
                continue;
            };
            let Some(value) = named_example_value(parameter, &example_key, request_name) else {
                continue;
            };
            request
                .headers
                .insert(name.to_string(), schema::value_to_text(value.clone()));
        }
    }

    let media_type = match request.body_type {
        RequestBodyType::Json => "application/json",
        RequestBodyType::Text => "text/plain",
        RequestBodyType::Html => "text/html",
        RequestBodyType::Xml => "application/xml",
        RequestBodyType::FormData => "multipart/form-data",
        RequestBodyType::XWwwFormUrlencoded => "application/x-www-form-urlencoded",
        RequestBodyType::None | RequestBodyType::Binary => return,
    };
    let Some(media) = operation.pointer(&format!(
        "/requestBody/content/{}",
        pointer_escape(media_type)
    )) else {
        return;
    };
    let Some(value) = named_example_value(media, &example_key, request_name) else {
        return;
    };

    match request.body_type {
        RequestBodyType::Json => {
            request.body = serde_json::to_string_pretty(value).unwrap_or_default();
        }
        RequestBodyType::Text | RequestBodyType::Html | RequestBodyType::Xml => {
            request.body = schema::value_to_text(value.clone());
        }
        RequestBodyType::FormData | RequestBodyType::XWwwFormUrlencoded => {
            request.body.clear();
            request.form_fields = value
                .as_object()
                .map(|fields| {
                    fields
                        .iter()
                        .map(|(key, value)| BodyField {
                            key: key.clone(),
                            value: schema::value_to_text(value.clone()),
                        })
                        .collect()
                })
                .unwrap_or_default();
        }
        RequestBodyType::None | RequestBodyType::Binary => {}
    }
}

fn named_example_value<'a>(
    container: &'a Value,
    key: &str,
    request_name: &str,
) -> Option<&'a Value> {
    let examples = container.get("examples")?.as_object()?;
    examples
        .get(key)
        .or_else(|| {
            examples.values().find(|example| {
                example.get("summary").and_then(Value::as_str) == Some(request_name)
            })
        })
        .and_then(|example| example.get("value"))
}

fn dispatch_example_key(name: &str) -> String {
    let value = name
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() {
                character
            } else {
                '_'
            }
        })
        .collect::<String>()
        .trim_matches('_')
        .to_string();
    if value.is_empty() {
        "request".to_string()
    } else {
        value
    }
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

    #[test]
    fn expands_legacy_dispatch_request_metadata() {
        let spec = json!({
            "openapi": "3.0.3",
            "info": { "title": "Dispatch export", "version": "1" },
            "paths": {
                "/get": {
                    "get": {
                        "summary": "Primary request",
                        "tags": ["Primary"],
                        "x-dispatch-request-count": 2,
                        "x-dispatch-requests": [
                            {
                                "name": "First request",
                                "method": "GET",
                                "url": "https://one.example.com/get",
                                "bodyType": "none",
                                "folder": "First folder",
                                "settings": {}
                            },
                            {
                                "name": "Second request",
                                "method": "GET",
                                "url": "https://two.example.com/get?variant=2",
                                "bodyType": "none",
                                "folder": "Second folder",
                                "settings": { "follow_redirects": false }
                            }
                        ],
                        "responses": { "200": { "description": "OK" } }
                    }
                }
            }
        });

        let imported = import_openapi(
            &spec,
            "Dispatch export",
            None,
            &OpenApiImportOptions::default(),
            &context(),
        )
        .unwrap();

        assert_eq!(imported.collection.requests.len(), 2);
        assert_eq!(imported.collection.requests[0].name, "First request");
        assert_eq!(
            imported.collection.requests[1].request.url,
            "https://two.example.com/get?variant=2"
        );
        assert_eq!(
            imported.collection.requests[1]
                .request
                .settings
                .follow_redirects,
            Some(false)
        );
        let folder_names = imported
            .collection
            .folders
            .iter()
            .map(|folder| folder.name.as_str())
            .collect::<Vec<_>>();
        assert!(folder_names.contains(&"First folder"));
        assert!(folder_names.contains(&"Second folder"));
    }

    #[test]
    fn dispatch_export_import_round_trip_preserves_grouped_requests() {
        use crate::{
            Collection, OpenApiExportFormat, OpenApiExportOptions, export_collection_openapi,
        };

        let source: Collection = serde_json::from_value(json!({
            "id": "source",
            "name": "Round trip",
            "folders": [],
            "requests": [
                {
                    "id": "one",
                    "name": "JSON variant",
                    "request": {
                        "method": "POST",
                        "url": "https://api.example.com/items",
                        "body": "{\"kind\":\"json\"}",
                        "body_type": "json",
                        "form_fields": [],
                        "headers": { "X-Variant": "json" },
                        "auth": { "type": "Bearer", "token": "token-one" },
                        "settings": { "follow_redirects": false },
                        "scripts": { "pre_request": "console.log('before');", "post_response": "" }
                    },
                    "folder_id": null,
                    "order": 0
                },
                {
                    "id": "two",
                    "name": "Text variant",
                    "request": {
                        "method": "POST",
                        "url": "https://api.example.com/items?format=text",
                        "body": "plain text",
                        "body_type": "text",
                        "form_fields": [],
                        "headers": { "X-Variant": "text" },
                        "auth": { "type": "Basic", "username": "user", "password": "pass" },
                        "settings": { "verify_ssl": false },
                        "scripts": { "pre_request": "", "post_response": "console.log('after');" }
                    },
                    "folder_id": null,
                    "order": 1
                }
            ]
        }))
        .unwrap();
        let exported = export_collection_openapi(
            &source,
            &OpenApiExportOptions {
                title: "Round trip".into(),
                api_version: "1.0.0".into(),
                format: OpenApiExportFormat::Json,
                server_url: None,
            },
        )
        .unwrap();
        let spec: Value = serde_json::from_str(&exported.content).unwrap();
        let imported = import_openapi(
            &spec,
            "Round trip",
            None,
            &OpenApiImportOptions::default(),
            &context(),
        )
        .unwrap();

        assert_eq!(exported.endpoint_count, 1);
        assert_eq!(imported.collection.requests.len(), source.requests.len());
        assert_eq!(
            imported.collection.requests[0].request,
            source.requests[0].request
        );
        assert_eq!(
            imported.collection.requests[1].request,
            source.requests[1].request
        );
    }
}
