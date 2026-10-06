use serde_json::{Map, Value, json};

use crate::{ApiKeyLocation, ApiRequest, AuthConfig, BodyField, OAuth2GrantType, RequestBodyType};

pub(super) fn example_key(name: &str) -> String {
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

pub(super) fn exported_response_status(url: &str) -> String {
    let raw_path = url::Url::parse(url)
        .map(|url| url.path().to_string())
        .unwrap_or_else(|_| url.split('?').next().unwrap_or(url).to_string());
    let segments = raw_path.split('/').collect::<Vec<_>>();
    for pair in segments.windows(2) {
        if pair[0] == "status"
            && pair[1].len() == 3
            && pair[1]
                .parse::<u16>()
                .is_ok_and(|status| (100..=599).contains(&status))
        {
            return pair[1].to_string();
        }
    }
    "200".to_string()
}

pub(super) fn export_url_parts(url: &str) -> (String, Vec<Value>, Option<Value>) {
    let mut raw = url.to_string();
    let mut server = None;
    if let Some(variable_end) = raw.strip_prefix("{{").and_then(|value| value.find("}}")) {
        let variable = raw[2..variable_end + 2].trim().to_string();
        raw = raw[variable_end + 4..].to_string();
        if !variable.is_empty() {
            server = Some(json!({
                "url": format!("{{{variable}}}"),
                "description": format!("Dispatch environment variable: {variable}"),
                "variables": {
                    (variable.clone()): {
                        "default": "http://localhost",
                        "description": format!("Set this to the value of {{{{{variable}}}}} before sending requests.")
                    }
                },
                "x-dispatch-environment-variable": variable
            }));
        }
    } else if let Ok(parsed) = url::Url::parse(url) {
        server = Some(json!({
            "url": format!(
                "{}://{}{}",
                parsed.scheme(),
                parsed.host_str().unwrap_or_default(),
                parsed.port().map(|port| format!(":{port}")).unwrap_or_default()
            )
        }));
        raw = parsed[url::Position::BeforePath..].to_string();
        raw = raw
            .replace("%7B%7B", "{{")
            .replace("%7D%7D", "}}")
            .replace("%7b%7b", "{{")
            .replace("%7d%7d", "}}");
    }
    let (path_part, query_part) = raw.split_once('?').unwrap_or((&raw, ""));
    let mut path = ensure_leading_slash(path_part);
    for variable in dispatch_variables(&path) {
        path = path.replace(&format!("{{{{{variable}}}}}"), &format!("{{{variable}}}"));
    }
    let mut query_values = Vec::<(String, Vec<String>)>::new();
    for (key, value) in url::form_urlencoded::parse(query_part.as_bytes()) {
        if let Some((_, values)) = query_values.iter_mut().find(|(name, _)| name == &key) {
            values.push(value.into_owned());
        } else {
            query_values.push((key.into_owned(), vec![value.into_owned()]));
        }
    }
    let parameters = query_values
        .into_iter()
        .map(|(key, values)| {
            if values.len() == 1 {
                json!({
                    "name": key,
                    "in": "query",
                    "required": false,
                    "schema": { "type": "string" },
                    "example": values[0]
                })
            } else {
                json!({
                    "name": key,
                    "in": "query",
                    "required": false,
                    "schema": { "type": "array", "items": { "type": "string" } },
                    "style": "form",
                    "explode": true,
                    "example": values
                })
            }
        })
        .collect();
    (path, parameters, server)
}

pub(super) fn export_request_body(request: &ApiRequest, request_name: &str) -> Option<Value> {
    let (content_type, example) = match &request.body_type {
        RequestBodyType::None => return None,
        RequestBodyType::Binary => {
            let binary = request.binary.as_ref()?;
            let mut media = Map::new();
            media.insert(
                "schema".to_string(),
                json!({ "type": "string", "format": "binary" }),
            );
            media.insert(
                "x-dispatch-file-name".to_string(),
                Value::String(binary.name.clone()),
            );
            let mut content = Map::new();
            content.insert(binary.mime_type.clone(), Value::Object(media));
            return Some(json!({ "content": content }));
        }
        RequestBodyType::Json => {
            let value = serde_json::from_str(&request.body)
                .unwrap_or_else(|_| Value::String(request.body.clone()));
            ("application/json", value)
        }
        RequestBodyType::Text => ("text/plain", Value::String(request.body.clone())),
        RequestBodyType::Html => ("text/html", Value::String(request.body.clone())),
        RequestBodyType::Xml => ("application/xml", Value::String(request.body.clone())),
        RequestBodyType::FormData => (
            "multipart/form-data",
            form_fields_value(&request.form_fields),
        ),
        RequestBodyType::XWwwFormUrlencoded => (
            "application/x-www-form-urlencoded",
            form_fields_value(&request.form_fields),
        ),
    };
    let mut media = Map::new();
    media.insert("schema".to_string(), infer_schema(&example));
    media.insert(
        "examples".to_string(),
        json!({ example_key(request_name): { "summary": request_name, "value": example } }),
    );
    let mut content = Map::new();
    content.insert(content_type.to_string(), Value::Object(media));
    Some(json!({ "content": content }))
}

pub(super) fn export_security(auth: &Option<AuthConfig>) -> Option<(String, Value, Value)> {
    match auth.as_ref()? {
        AuthConfig::None => None,
        AuthConfig::Bearer { .. } => Some((
            "bearerAuth".to_string(),
            json!({ "type": "http", "scheme": "bearer" }),
            json!([]),
        )),
        AuthConfig::Basic { .. } => Some((
            "basicAuth".to_string(),
            json!({ "type": "http", "scheme": "basic" }),
            json!([]),
        )),
        AuthConfig::ApiKey { key, add_to, .. } => {
            let location = match add_to {
                ApiKeyLocation::Header => "header",
                ApiKeyLocation::QueryParam => "query",
            };
            Some((
                format!("apiKey_{}_{}", component_key(key), location),
                json!({ "type": "apiKey", "name": key, "in": location }),
                json!([]),
            ))
        }
        AuthConfig::OAuth2 {
            grant_type,
            access_token_url,
            authorization_url,
            scope,
            ..
        } => {
            let scopes = scope
                .split_whitespace()
                .map(|item| (item.to_string(), Value::String(String::new())))
                .collect::<Map<_, _>>();
            let flow = match grant_type {
                OAuth2GrantType::AuthorizationCode => {
                    json!({ "authorizationUrl": authorization_url, "tokenUrl": access_token_url, "scopes": scopes })
                }
                OAuth2GrantType::ClientCredentials | OAuth2GrantType::Password => {
                    json!({ "tokenUrl": access_token_url, "scopes": scopes })
                }
            };
            let flow_name = match grant_type {
                OAuth2GrantType::AuthorizationCode => "authorizationCode",
                OAuth2GrantType::ClientCredentials => "clientCredentials",
                OAuth2GrantType::Password => "password",
            };
            let mut flows = Map::new();
            flows.insert(flow_name.to_string(), flow);
            let endpoint = if authorization_url.is_empty() {
                access_token_url
            } else {
                authorization_url
            };
            Some((
                format!("oauth2_{}_{}", flow_name, component_key(endpoint)),
                json!({ "type": "oauth2", "flows": flows }),
                json!([]),
            ))
        }
    }
}

pub(super) fn openapi_path_variables(value: &str) -> Vec<String> {
    let mut variables = Vec::new();
    let mut rest = value;
    while let Some(start) = rest.find('{') {
        let after_start = &rest[start + 1..];
        let Some(end) = after_start.find('}') else {
            break;
        };
        let name = after_start[..end].trim();
        if !name.is_empty() && !name.contains('{') && !variables.iter().any(|item| item == name) {
            variables.push(name.to_string());
        }
        rest = &after_start[end + 1..];
    }
    variables
}

fn component_key(value: &str) -> String {
    let normalized = value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() {
                character
            } else {
                '_'
            }
        })
        .collect::<String>();
    if normalized.is_empty() {
        "key".to_string()
    } else {
        normalized
    }
}

fn infer_schema(value: &Value) -> Value {
    match value {
        Value::Object(values) => {
            let properties = values
                .iter()
                .map(|(key, value)| (key.clone(), infer_schema(value)))
                .collect::<Map<_, _>>();
            json!({ "type": "object", "properties": properties })
        }
        Value::Array(values) => {
            json!({ "type": "array", "items": values.first().map(infer_schema).unwrap_or_else(|| json!({})) })
        }
        Value::Bool(_) => json!({ "type": "boolean" }),
        Value::Number(value) if value.is_i64() || value.is_u64() => json!({ "type": "integer" }),
        Value::Number(_) => json!({ "type": "number" }),
        Value::Null => json!({ "nullable": true }),
        Value::String(_) => json!({ "type": "string" }),
    }
}

fn dispatch_variables(value: &str) -> Vec<String> {
    let mut variables = Vec::new();
    let mut rest = value;
    while let Some(start) = rest.find("{{") {
        let after_start = &rest[start + 2..];
        let Some(end) = after_start.find("}}") else {
            break;
        };
        let name = after_start[..end].trim();
        if !name.is_empty() && !variables.iter().any(|item| item == name) {
            variables.push(name.to_string());
        }
        rest = &after_start[end + 2..];
    }
    variables
}

fn form_fields_value(fields: &[BodyField]) -> Value {
    Value::Object(
        fields
            .iter()
            .map(|field| (field.key.clone(), Value::String(field.value.clone())))
            .collect(),
    )
}

fn ensure_leading_slash(value: &str) -> String {
    if value.starts_with('/') {
        value.to_string()
    } else {
        format!("/{value}")
    }
}
