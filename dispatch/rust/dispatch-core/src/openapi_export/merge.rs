use serde_json::{Map, Value, json};

use super::request::example_key;

pub(super) fn merge_export_operations(existing: &mut Value, incoming: Value, request_name: &str) {
    let (Some(existing), Some(mut incoming)) =
        (existing.as_object_mut(), incoming.as_object().cloned())
    else {
        return;
    };
    for key in ["tags", "servers", "security", "x-dispatch-requests"] {
        let Some(values) = incoming
            .remove(key)
            .and_then(|value| value.as_array().cloned())
        else {
            continue;
        };
        let target = existing
            .entry(key.to_string())
            .or_insert_with(|| Value::Array(Vec::new()));
        if let Some(target) = target.as_array_mut() {
            for value in values {
                if !target.contains(&value) {
                    target.push(value);
                }
            }
        }
    }
    let primary_request_name = existing
        .get("x-dispatch-request-names")
        .and_then(Value::as_array)
        .and_then(|names| names.first())
        .and_then(Value::as_str)
        .unwrap_or("request")
        .to_string();
    merge_export_parameters(
        existing,
        incoming.remove("parameters"),
        &primary_request_name,
        request_name,
    );
    merge_export_request_bodies(existing, incoming.remove("requestBody"));
    if let Some(name) = incoming
        .remove("x-dispatch-request-names")
        .and_then(|value| value.as_array().and_then(|values| values.first()).cloned())
    {
        existing
            .entry("x-dispatch-request-names".to_string())
            .or_insert_with(|| Value::Array(Vec::new()))
            .as_array_mut()
            .map(|names| names.push(name));
    }
    let count = existing
        .get("x-dispatch-request-count")
        .and_then(Value::as_u64)
        .unwrap_or(1)
        + 1;
    existing.insert("x-dispatch-request-count".to_string(), json!(count));
}

fn merge_export_parameters(
    operation: &mut Map<String, Value>,
    incoming: Option<Value>,
    primary_request_name: &str,
    request_name: &str,
) {
    let Some(incoming) = incoming.and_then(|value| value.as_array().cloned()) else {
        return;
    };
    let target = operation
        .entry("parameters".to_string())
        .or_insert_with(|| Value::Array(Vec::new()));
    let Some(target) = target.as_array_mut() else {
        return;
    };
    for parameter in incoming {
        let name = parameter.get("name").and_then(Value::as_str);
        let location = parameter.get("in").and_then(Value::as_str);
        let existing = target.iter_mut().find(|candidate| {
            candidate.get("name").and_then(Value::as_str) == name
                && candidate.get("in").and_then(Value::as_str) == location
        });
        if let Some(existing) = existing {
            let next_example = parameter.get("example").cloned();
            if next_example.is_some() && next_example != existing.get("example").cloned() {
                let existing_object = existing.as_object_mut().expect("parameter is an object");
                let previous_example = existing_object.remove("example");
                let examples = existing_object
                    .entry("examples".to_string())
                    .or_insert_with(|| Value::Object(Map::new()));
                if let Some(examples) = examples.as_object_mut() {
                    if let Some(previous_example) = previous_example {
                        examples.insert(
                            example_key(primary_request_name),
                            json!({ "value": previous_example }),
                        );
                    }
                    if let Some(next_example) = next_example {
                        examples
                            .insert(example_key(request_name), json!({ "value": next_example }));
                    }
                }
            }
        } else {
            target.push(parameter);
        }
    }
}

fn merge_export_request_bodies(operation: &mut Map<String, Value>, incoming: Option<Value>) {
    let Some(incoming_content) = incoming
        .as_ref()
        .and_then(|value| value.get("content"))
        .and_then(Value::as_object)
    else {
        return;
    };
    let target_body = operation
        .entry("requestBody".to_string())
        .or_insert_with(|| json!({ "content": {} }));
    let Some(target_content) = target_body
        .get_mut("content")
        .and_then(Value::as_object_mut)
    else {
        return;
    };
    for (media_type, media) in incoming_content {
        if let Some(target_media) = target_content.get_mut(media_type) {
            let incoming_examples = media.get("examples").and_then(Value::as_object);
            let target_examples = target_media
                .as_object_mut()
                .expect("media type is an object")
                .entry("examples".to_string())
                .or_insert_with(|| Value::Object(Map::new()));
            if let (Some(target_examples), Some(incoming_examples)) =
                (target_examples.as_object_mut(), incoming_examples)
            {
                for (name, example) in incoming_examples {
                    target_examples.insert(name.clone(), example.clone());
                }
            }
        } else {
            target_content.insert(media_type.clone(), media.clone());
        }
    }
}
