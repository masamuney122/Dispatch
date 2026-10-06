use std::collections::HashSet;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::OpenApiWarning;

const HTTP_METHODS: [&str; 7] = ["get", "post", "put", "patch", "delete", "head", "options"];
const MAX_OPERATIONS: usize = 2_000;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct OpenApiImportPreview {
    pub title: String,
    pub specification_version: String,
    pub endpoint_count: usize,
    pub folder_count: usize,
    pub tag_folder_count: usize,
    pub path_folder_count: usize,
    pub servers: Vec<String>,
    pub security_schemes: Vec<String>,
    pub warnings: Vec<OpenApiWarning>,
}

pub fn inspect_openapi(spec: &Value, fallback_title: &str) -> Result<OpenApiImportPreview, String> {
    let title = spec
        .pointer("/info/title")
        .and_then(Value::as_str)
        .unwrap_or(fallback_title)
        .to_string();
    let specification_version = spec
        .get("openapi")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let mut endpoint_count = 0;
    let mut tags = HashSet::new();
    let mut path_folders = HashSet::new();
    let mut warnings = document_warnings(spec);

    if let Some(paths) = spec.get("paths").and_then(Value::as_object) {
        for (path_name, path_item) in paths {
            if path_item.get("$ref").is_some() {
                warnings.push(warning(
                    "external-or-path-reference",
                    "Referenced Path Item objects are not imported in the first version.",
                    Some(path_name.clone()),
                ));
                continue;
            }
            if path_item.as_object().is_some_and(|item| {
                item.keys()
                    .any(|method| HTTP_METHODS.contains(&method.as_str()))
            }) {
                if let Some(folder_name) = first_static_path_segment(path_name) {
                    path_folders.insert(folder_name.to_string());
                }
            }
            for method in HTTP_METHODS {
                if let Some(operation) = path_item.get(method) {
                    endpoint_count += 1;
                    if endpoint_count > MAX_OPERATIONS {
                        return Err(format!(
                            "OpenAPI document contains more than {MAX_OPERATIONS} operations"
                        ));
                    }
                    if let Some(operation_tags) = operation.get("tags").and_then(Value::as_array) {
                        if let Some(tag) = operation_tags.first().and_then(Value::as_str) {
                            tags.insert(tag.to_string());
                        }
                        if operation_tags.len() > 1 {
                            warnings.push(warning(
                                "multiple-tags",
                                "Operation has multiple tags; the first tag will be used as its folder.",
                                Some(format!("{} {}", method.to_uppercase(), path_name)),
                            ));
                        }
                    }
                }
            }
        }
    }

    Ok(OpenApiImportPreview {
        title,
        specification_version,
        endpoint_count,
        folder_count: tags.len(),
        tag_folder_count: tags.len(),
        path_folder_count: path_folders.len(),
        servers: server_urls(spec),
        security_schemes: spec
            .pointer("/components/securitySchemes")
            .and_then(Value::as_object)
            .map(|items| items.keys().cloned().collect())
            .unwrap_or_default(),
        warnings,
    })
}

fn document_warnings(spec: &Value) -> Vec<OpenApiWarning> {
    let mut warnings = Vec::new();
    if spec.get("webhooks").is_some() {
        warnings.push(warning(
            "unsupported-webhooks",
            "Webhooks are not imported.",
            None,
        ));
    }
    if let Some(paths) = spec.get("paths").and_then(Value::as_object) {
        for (path_name, path_item) in paths {
            for method in HTTP_METHODS {
                if let Some(operation) = path_item.get(method) {
                    if operation.get("callbacks").is_some() {
                        warnings.push(warning(
                            "unsupported-callback",
                            "Callbacks are not imported.",
                            Some(format!("{} {}", method.to_uppercase(), path_name)),
                        ));
                    }
                }
            }
        }
    }
    warnings
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

fn first_static_path_segment(path: &str) -> Option<&str> {
    path.split('/').map(str::trim).find(|segment| {
        !segment.is_empty() && !(segment.starts_with('{') && segment.ends_with('}'))
    })
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

    #[test]
    fn inspects_tags_paths_servers_and_unsupported_features() {
        let spec = json!({
            "openapi": "3.1.0",
            "info": { "title": "Demo" },
            "webhooks": {},
            "servers": [{ "url": "https://root.example.com" }],
            "paths": {
                "/users/{id}": {
                    "get": {
                        "tags": ["Users", "Read"],
                        "callbacks": {},
                        "servers": [{ "url": "https://users.example.com" }]
                    }
                }
            },
            "components": { "securitySchemes": { "BearerAuth": {} } }
        });
        let preview = inspect_openapi(&spec, "Fallback").unwrap();
        assert_eq!(preview.title, "Demo");
        assert_eq!(preview.endpoint_count, 1);
        assert_eq!(preview.tag_folder_count, 1);
        assert_eq!(preview.path_folder_count, 1);
        assert_eq!(preview.servers.len(), 2);
        assert_eq!(preview.security_schemes, ["BearerAuth"]);
        assert_eq!(preview.warnings.len(), 3);
    }
}
