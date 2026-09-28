use std::collections::HashMap;

use serde_json::Value;

use crate::{
    ApiRequest, BodyField, OpenApiWarning, RequestBodyType, RequestHttpSettings, RequestScripts,
};

use super::{
    auth::operation_auth,
    encode_query_part, ensure_leading_slash, import_server_url,
    schema::{generate_example, parameter_example, resolve_local, value_to_text},
    warning,
};

pub(super) struct ConversionState {
    pub warnings: Vec<OpenApiWarning>,
    pub environment_variables: HashMap<String, String>,
}

pub(super) fn convert_operation(
    spec: &Value,
    path_name: &str,
    path_item: &Value,
    method: &str,
    operation: &Value,
    selected_server: Option<&str>,
    state: &mut ConversionState,
) -> ApiRequest {
    let mut url_path = path_name.to_string();
    let mut query = Vec::<(String, String)>::new();
    let mut headers = HashMap::new();
    for parameter_list in [path_item.get("parameters"), operation.get("parameters")]
        .into_iter()
        .flatten()
        .filter_map(Value::as_array)
    {
        for parameter_value in parameter_list {
            let Some(parameter) = resolve_local(spec, parameter_value) else {
                state.warnings.push(warning(
                    "unsupported-reference",
                    "A parameter reference could not be resolved.",
                    Some(format!("{} {}", method.to_uppercase(), path_name)),
                ));
                continue;
            };
            let Some(name) = parameter.get("name").and_then(Value::as_str) else {
                continue;
            };
            let example = parameter_example(spec, parameter)
                .map(value_to_text)
                .unwrap_or_else(|| format!("{{{{{name}}}}}"));
            match parameter
                .get("in")
                .and_then(Value::as_str)
                .unwrap_or_default()
            {
                "path" => {
                    url_path = url_path.replace(&format!("{{{name}}}"), &format!("{{{{{name}}}}}"));
                    state
                        .environment_variables
                        .entry(name.to_string())
                        .or_insert_with(|| {
                            if example.starts_with("{{") {
                                String::new()
                            } else {
                                example.clone()
                            }
                        });
                }
                "query" => query.push((name.to_string(), example)),
                "header" => {
                    headers.insert(name.to_string(), example);
                }
                "cookie" => state.warnings.push(warning(
                    "unsupported-cookie-parameter",
                    "Cookie parameters are not imported.",
                    Some(format!("{} {}", method.to_uppercase(), path_name)),
                )),
                _ => {}
            }
        }
    }

    let mut url = if selected_server.is_some() {
        format!("{{{{baseUrl}}}}{}", ensure_leading_slash(&url_path))
    } else if let Some(server) = operation
        .get("servers")
        .and_then(Value::as_array)
        .and_then(|items| items.first())
        .or_else(|| {
            path_item
                .get("servers")
                .and_then(Value::as_array)
                .and_then(|items| items.first())
        })
        .or_else(|| {
            spec.get("servers")
                .and_then(Value::as_array)
                .and_then(|items| items.first())
        })
    {
        format!(
            "{}{}",
            import_server_url(server, &mut state.environment_variables),
            ensure_leading_slash(&url_path)
        )
    } else {
        url_path
    };
    if !query.is_empty() {
        let encoded = query
            .iter()
            .map(|(key, value)| format!("{}={}", encode_query_part(key), encode_query_part(value)))
            .collect::<Vec<_>>()
            .join("&");
        url.push(if url.contains('?') { '&' } else { '?' });
        url.push_str(&encoded);
    }

    let (body, body_type, form_fields) = request_body(spec, operation, &mut headers, state);
    let auth = operation_auth(spec, operation, &mut state.warnings);
    ApiRequest {
        method: method.to_uppercase(),
        url,
        body,
        body_type,
        form_fields,
        binary: None,
        headers,
        auth,
        settings: RequestHttpSettings::default(),
        scripts: RequestScripts::default(),
    }
}

fn request_body(
    spec: &Value,
    operation: &Value,
    headers: &mut HashMap<String, String>,
    state: &mut ConversionState,
) -> (String, RequestBodyType, Vec<BodyField>) {
    let Some(body_value) = operation.get("requestBody") else {
        return (String::new(), RequestBodyType::None, Vec::new());
    };
    let Some(body) = resolve_local(spec, body_value) else {
        state.warnings.push(warning(
            "unsupported-request-body-reference",
            "Request body reference could not be resolved.",
            None,
        ));
        return (String::new(), RequestBodyType::None, Vec::new());
    };
    let Some(content) = body.get("content").and_then(Value::as_object) else {
        return (String::new(), RequestBodyType::None, Vec::new());
    };
    let choices = [
        ("application/json", RequestBodyType::Json),
        (
            "application/x-www-form-urlencoded",
            RequestBodyType::XWwwFormUrlencoded,
        ),
        ("multipart/form-data", RequestBodyType::FormData),
        ("application/xml", RequestBodyType::Xml),
        ("text/html", RequestBodyType::Html),
        ("text/plain", RequestBodyType::Text),
    ];
    let Some((content_type, body_type, media)) = choices
        .into_iter()
        .find_map(|(name, kind)| content.get(name).map(|media| (name, kind, media)))
    else {
        state.warnings.push(warning(
            "unsupported-request-body-content-type",
            "No supported request body content type was found.",
            None,
        ));
        return (String::new(), RequestBodyType::None, Vec::new());
    };
    headers
        .entry("Content-Type".to_string())
        .or_insert_with(|| content_type.to_string());
    let schema = media
        .get("schema")
        .and_then(|value| resolve_local(spec, value));
    let example = media
        .get("example")
        .cloned()
        .or_else(|| schema.and_then(|value| value.get("example").cloned()))
        .or_else(|| schema.map(|value| generate_example(spec, value, 0)));

    match body_type {
        RequestBodyType::Json => (
            example
                .and_then(|value| serde_json::to_string_pretty(&value).ok())
                .unwrap_or_default(),
            body_type,
            Vec::new(),
        ),
        RequestBodyType::XWwwFormUrlencoded | RequestBodyType::FormData => {
            let fields = example
                .and_then(|value| value.as_object().cloned())
                .map(|values| {
                    values
                        .into_iter()
                        .map(|(key, value)| BodyField {
                            key,
                            value: value_to_text(value),
                        })
                        .collect()
                })
                .unwrap_or_default();
            (String::new(), body_type, fields)
        }
        RequestBodyType::Xml | RequestBodyType::Html | RequestBodyType::Text => (
            example.map(value_to_text).unwrap_or_default(),
            body_type,
            Vec::new(),
        ),
        _ => (String::new(), RequestBodyType::None, Vec::new()),
    }
}
