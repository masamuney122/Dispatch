use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};

mod merge;
mod models;
mod ordering;
mod request;

use crate::Collection;
use merge::merge_export_operations;
pub use models::{OpenApiExportFormat, OpenApiExportOptions};
use ordering::{folder_order_path, full_folder_name, request_order_path};
use request::{
    export_request_body, export_security, export_url_parts, exported_response_status,
    openapi_path_variables,
};

const HTTP_METHODS: [&str; 7] = ["get", "post", "put", "patch", "delete", "head", "options"];

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct OpenApiWarning {
    pub code: String,
    pub message: String,
    pub location: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct OpenApiExportDocument {
    pub content: String,
    pub mime_type: String,
    pub extension: String,
    pub request_count: usize,
    pub endpoint_count: usize,
    pub grouped_request_count: usize,
    pub warnings: Vec<OpenApiWarning>,
}

pub fn export_collection_openapi(
    collection: &Collection,
    options: &OpenApiExportOptions,
) -> Result<OpenApiExportDocument, String> {
    let (spec, request_count, endpoint_count, grouped_request_count, warnings) =
        collection_to_openapi(collection, options);

    let (content, mime_type, extension) = match options.format {
        OpenApiExportFormat::Json => (
            serde_json::to_string_pretty(&spec)
                .map_err(|error| format!("Failed to serialize OpenAPI JSON: {error}"))?,
            "application/json",
            "json",
        ),
        OpenApiExportFormat::Yaml => (
            serde_norway::to_string(&spec)
                .map_err(|error| format!("Failed to serialize OpenAPI YAML: {error}"))?,
            "application/yaml",
            "yaml",
        ),
    };

    Ok(OpenApiExportDocument {
        content: if content.ends_with('\n') {
            content
        } else {
            format!("{content}\n")
        },
        mime_type: mime_type.to_string(),
        extension: extension.to_string(),
        request_count,
        endpoint_count,
        grouped_request_count,
        warnings,
    })
}

fn collection_to_openapi(
    collection: &Collection,
    options: &OpenApiExportOptions,
) -> (Value, usize, usize, usize, Vec<OpenApiWarning>) {
    let title = if options.title.trim().is_empty() {
        &collection.name
    } else {
        options.title.trim()
    };
    let version = if options.api_version.trim().is_empty() {
        "1.0.0"
    } else {
        options.api_version.trim()
    };
    let mut paths = Map::new();
    let mut security_schemes = Map::new();
    let mut warnings = Vec::new();
    let mut request_count = 0usize;
    let mut endpoint_count = 0usize;
    let mut script_request_count = 0usize;
    let mut used_folder_ids = HashSet::new();
    let folder_names = collection
        .folders
        .iter()
        .map(|folder| (folder.id.clone(), full_folder_name(collection, folder)))
        .collect::<HashMap<_, _>>();

    let mut ordered_requests = collection.requests.iter().collect::<Vec<_>>();
    ordered_requests.sort_by(|left, right| {
        request_order_path(collection, left)
            .cmp(&request_order_path(collection, right))
            .then_with(|| left.name.cmp(&right.name))
            .then_with(|| left.id.cmp(&right.id))
    });

    for saved in ordered_requests {
        let (path, query_parameters, detected_server) = export_url_parts(&saved.request.url);
        let method = saved.request.method.to_ascii_lowercase();
        if !HTTP_METHODS.contains(&method.as_str()) {
            warnings.push(warning(
                "unsupported-method",
                "Request method was skipped during export.",
                Some(saved.name.clone()),
            ));
            continue;
        }
        request_count += 1;
        let mut operation = Map::new();
        operation.insert("summary".to_string(), Value::String(saved.name.clone()));
        operation.insert(
            "operationId".to_string(),
            Value::String(format!("dispatch_{}", saved.id.replace('-', "_"))),
        );
        operation.insert("x-dispatch-request-names".to_string(), json!([saved.name]));
        operation.insert("x-dispatch-request-count".to_string(), json!(1));

        let has_server_override = options
            .server_url
            .as_deref()
            .is_some_and(|value| !value.trim().is_empty());
        if !has_server_override {
            if let Some(server) = detected_server {
                if let Some(variable) = server
                    .get("x-dispatch-environment-variable")
                    .and_then(Value::as_str)
                {
                    warnings.push(warning(
                        "unresolved-server-variable",
                        "The base URL is an environment variable. OpenAPI requires a default, so http://localhost was used; set the server value after import or provide a Server URL override.",
                        Some(variable.to_string()),
                    ));
                }
                operation.insert("servers".to_string(), json!([server]));
            }
        }
        if let Some(folder_id) = &saved.folder_id {
            if let Some(tag) = folder_names.get(folder_id) {
                operation.insert("tags".to_string(), json!([tag]));
                operation.insert("x-dispatch-folder".to_string(), Value::String(tag.clone()));
                used_folder_ids.insert(folder_id.clone());
            }
        }
        let mut parameters = Vec::new();
        for variable in openapi_path_variables(&path) {
            parameters.push(json!({
                "name": variable,
                "in": "path",
                "required": true,
                "schema": { "type": "string" }
            }));
        }
        parameters.extend(query_parameters);
        for (key, value) in &saved.request.headers {
            if key.eq_ignore_ascii_case("content-type") || key.eq_ignore_ascii_case("authorization")
            {
                continue;
            }
            parameters.push(json!({
                "name": key,
                "in": "header",
                "required": false,
                "schema": { "type": "string" },
                "example": value
            }));
        }
        if !parameters.is_empty() {
            operation.insert("parameters".to_string(), Value::Array(parameters));
        }
        if let Some(request_body) = export_request_body(&saved.request, &saved.name) {
            operation.insert("requestBody".to_string(), request_body);
        }
        if let Some((name, scheme, requirement)) = export_security(&saved.request.auth) {
            security_schemes.entry(name.clone()).or_insert(scheme);
            let mut security_requirement = Map::new();
            security_requirement.insert(name, requirement);
            operation.insert(
                "security".to_string(),
                Value::Array(vec![Value::Object(security_requirement)]),
            );
        }
        let request_settings = serde_json::to_value(&saved.request.settings).unwrap_or_default();
        if options_object_is_non_empty(&request_settings) {
            operation.insert("x-dispatch-settings".to_string(), request_settings.clone());
        }
        operation.insert(
            "x-dispatch-requests".to_string(),
            json!([{
                "name": saved.name,
                "method": saved.request.method,
                "url": saved.request.url,
                "bodyType": saved.request.body_type,
                "folder": saved.folder_id.as_ref().and_then(|folder_id| folder_names.get(folder_id)),
                "order": saved.order,
                "settings": request_settings,
                "request": saved.request
            }]),
        );
        if !saved.request.scripts.pre_request.trim().is_empty()
            || !saved.request.scripts.post_response.trim().is_empty()
        {
            script_request_count += 1;
        }
        let response_status = exported_response_status(&saved.request.url);
        operation.insert(
            "responses".to_string(),
            json!({ (response_status): { "description": "Expected response" } }),
        );
        let path_item = paths
            .entry(path)
            .or_insert_with(|| Value::Object(Map::new()));
        let Some(path_item_object) = path_item.as_object_mut() else {
            continue;
        };
        if let Some(existing) = path_item_object.get_mut(&method) {
            merge_export_operations(existing, Value::Object(operation), &saved.name);
            warnings.push(warning(
                "duplicate-operation-grouped",
                "Another request uses the same path and method. It was grouped as an OpenAPI example and listed in x-dispatch-request-names.",
                Some(saved.name.clone()),
            ));
        } else {
            path_item_object.insert(method, Value::Object(operation));
            endpoint_count += 1;
        }
    }

    if script_request_count > 0 {
        warnings.push(warning(
            "scripts-not-in-openapi",
            &format!(
                "{script_request_count} request(s) contain pre-request or post-response scripts. OpenAPI has no standard script field, so script source was not exported."
            ),
            None,
        ));
    }

    let mut root = Map::new();
    root.insert("openapi".to_string(), Value::String("3.0.3".to_string()));
    root.insert(
        "info".to_string(),
        json!({ "title": title, "version": version }),
    );
    if let Some(server) = options
        .server_url
        .as_deref()
        .map(str::trim)
        .filter(|item| !item.is_empty())
    {
        root.insert("servers".to_string(), json!([{ "url": server }]));
    }
    let mut ordered_folders = collection
        .folders
        .iter()
        .filter(|folder| used_folder_ids.contains(&folder.id))
        .collect::<Vec<_>>();
    ordered_folders.sort_by(|left, right| {
        folder_order_path(collection, left)
            .cmp(&folder_order_path(collection, right))
            .then_with(|| left.name.cmp(&right.name))
            .then_with(|| left.id.cmp(&right.id))
    });
    if !ordered_folders.is_empty() {
        root.insert(
            "tags".to_string(),
            Value::Array(
                ordered_folders
                    .into_iter()
                    .map(|folder| json!({ "name": full_folder_name(collection, folder) }))
                    .collect(),
            ),
        );
    }
    root.insert("paths".to_string(), Value::Object(paths));
    root.insert(
        "x-dispatch-export".to_string(),
        json!({
            "formatVersion": 2,
            "sourceRequestCount": request_count,
            "operationCount": endpoint_count,
            "groupedRequestCount": request_count.saturating_sub(endpoint_count),
            "scriptRequestCount": script_request_count,
            "notes": "OpenAPI permits one operation per method and path. Grouped Dispatch requests are represented as examples and x-dispatch metadata."
        }),
    );
    if !security_schemes.is_empty() {
        root.insert(
            "components".to_string(),
            json!({ "securitySchemes": security_schemes }),
        );
    }
    (
        Value::Object(root),
        request_count,
        endpoint_count,
        request_count.saturating_sub(endpoint_count),
        warnings,
    )
}

fn options_object_is_non_empty(value: &Value) -> bool {
    value
        .as_object()
        .is_some_and(|settings| !settings.is_empty())
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
    use super::*;

    fn export(collection: Value, format: OpenApiExportFormat) -> OpenApiExportDocument {
        let collection: Collection = serde_json::from_value(collection).unwrap();
        let options = OpenApiExportOptions {
            title: "Mixed API".into(),
            api_version: "1.0.0".into(),
            format,
            server_url: None,
        };
        export_collection_openapi(&collection, &options).unwrap()
    }

    #[test]
    fn preserves_servers_and_groups_duplicate_operations() {
        let collection = json!({
            "id": "collection",
            "name": "Mixed API",
            "folders": [],
            "requests": [
                request("one", "Httpbin query", "GET", "https://httpbin.org/get?tag=one&tag=two", "", "none"),
                request("two", "Local query", "GET", "http://localhost:8080/get?tag=local", "", "none"),
                request("three", "JSON", "POST", "https://httpbin.org/post", "{\"kind\":\"json\"}", "json"),
                request("four", "Text", "POST", "https://httpbin.org/post", "plain text", "text"),
                request("five", "Environment", "GET", "{{Base_Url}}/status/418", "", "none")
            ]
        });
        let result = export(collection, OpenApiExportFormat::Json);
        let spec: Value = serde_json::from_str(&result.content).unwrap();

        assert_eq!(result.request_count, 5);
        assert_eq!(result.endpoint_count, 3);
        assert_eq!(result.grouped_request_count, 2);
        assert_eq!(
            spec["paths"]["/get"]["get"]["servers"],
            json!([{ "url": "https://httpbin.org" }, { "url": "http://localhost:8080" }])
        );
        assert_eq!(
            spec["paths"]["/get"]["get"]["x-dispatch-requests"]
                .as_array()
                .unwrap()
                .len(),
            2
        );
        assert!(
            spec["paths"]["/post"]["post"]["requestBody"]["content"]["application/json"]
                .is_object()
        );
        assert!(spec["paths"]["/post"]["post"]["requestBody"]["content"]["text/plain"].is_object());
        assert_eq!(
            spec["paths"]["/status/418"]["get"]["responses"]
                .as_object()
                .unwrap()
                .keys()
                .next()
                .unwrap(),
            "418"
        );
    }

    #[test]
    fn json_and_yaml_share_the_same_document() {
        let collection = json!({
            "id": "collection",
            "name": "Demo",
            "folders": [],
            "requests": [request("one", "Health", "GET", "https://example.com/health", "", "none")]
        });
        let json_result = export(collection.clone(), OpenApiExportFormat::Json);
        let yaml_result = export(collection, OpenApiExportFormat::Yaml);
        let json_value: Value = serde_json::from_str(&json_result.content).unwrap();
        let yaml_value: Value = serde_norway::from_str(&yaml_result.content).unwrap();
        assert_eq!(json_value, yaml_value);
    }

    #[test]
    fn preserves_nested_folder_order_auth_settings_and_script_warning() {
        let collection = json!({
            "id": "collection",
            "name": "Contract API",
            "folders": [
                { "id": "second", "name": "Second", "parent_folder_id": null, "order": 1 },
                { "id": "first", "name": "First", "parent_folder_id": null, "order": 0 },
                { "id": "nested", "name": "Nested", "parent_folder_id": "first", "order": 0 }
            ],
            "requests": [
                {
                    "id": "secure-request",
                    "name": "Secure request",
                    "request": {
                        "method": "POST",
                        "url": "https://api.example.com/items/{{itemId}}",
                        "body": "{\"enabled\":true}",
                        "body_type": "json",
                        "form_fields": [],
                        "headers": { "X-Trace": "trace-1" },
                        "auth": { "type": "Bearer", "token": "secret" },
                        "settings": { "follow_redirects": false },
                        "scripts": { "pre_request": "pm.variables.set('ready', true);", "post_response": "" }
                    },
                    "folder_id": "nested",
                    "order": 0
                },
                {
                    "id": "second-request",
                    "name": "Second request",
                    "request": {
                        "method": "GET",
                        "url": "https://api.example.com/second",
                        "body": "",
                        "body_type": "none",
                        "form_fields": [],
                        "headers": {},
                        "auth": { "type": "None" },
                        "settings": {},
                        "scripts": { "pre_request": "", "post_response": "" }
                    },
                    "folder_id": "second",
                    "order": 0
                }
            ]
        });

        let result = export(collection, OpenApiExportFormat::Json);
        let spec: Value = serde_json::from_str(&result.content).unwrap();

        assert_eq!(
            spec["tags"],
            json!([{ "name": "First / Nested" }, { "name": "Second" }])
        );
        let operation = &spec["paths"]["/items/{itemId}"]["post"];
        assert!(operation.is_object(), "unexpected paths: {}", spec["paths"]);
        assert_eq!(operation["tags"], json!(["First / Nested"]));
        assert_eq!(
            operation["x-dispatch-settings"],
            json!({ "follow_redirects": false })
        );
        assert_eq!(operation["parameters"][0]["name"], "itemId");
        assert_eq!(operation["parameters"][1]["name"], "X-Trace");
        assert_eq!(operation["security"], json!([{ "bearerAuth": [] }]));
        assert_eq!(
            spec["components"]["securitySchemes"]["bearerAuth"]["scheme"],
            "bearer"
        );
        assert!(
            result
                .warnings
                .iter()
                .any(|warning| warning.code == "scripts-not-in-openapi")
        );
    }

    fn request(
        id: &str,
        name: &str,
        method: &str,
        url: &str,
        body: &str,
        body_type: &str,
    ) -> Value {
        json!({
            "id": id,
            "name": name,
            "request": {
                "method": method,
                "url": url,
                "body": body,
                "body_type": body_type,
                "form_fields": [],
                "headers": {},
                "auth": { "type": "None" },
                "settings": {},
                "scripts": { "pre_request": "", "post_response": "" }
            },
            "folder_id": null,
            "order": 0
        })
    }
}
