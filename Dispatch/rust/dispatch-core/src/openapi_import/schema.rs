use serde_json::{Map, Value, json};

pub(super) fn resolve_local<'a>(spec: &'a Value, value: &'a Value) -> Option<&'a Value> {
    let mut current = value;
    for _ in 0..16 {
        let Some(reference) = current.get("$ref").and_then(Value::as_str) else {
            return Some(current);
        };
        current = spec.pointer(reference.strip_prefix('#')?)?;
    }
    None
}

pub(super) fn generate_example(spec: &Value, schema_value: &Value, depth: usize) -> Value {
    if depth > 8 {
        return Value::Null;
    }
    let Some(schema) = resolve_local(spec, schema_value) else {
        return Value::Null;
    };
    if let Some(value) = schema.get("example").or_else(|| schema.get("default")) {
        return value.clone();
    }
    if let Some(value) = schema
        .get("enum")
        .and_then(Value::as_array)
        .and_then(|items| items.first())
    {
        return value.clone();
    }
    match schema
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or_else(|| {
            if schema.get("properties").is_some() {
                "object"
            } else {
                "string"
            }
        }) {
        "object" => {
            let mut result = Map::new();
            if let Some(properties) = schema.get("properties").and_then(Value::as_object) {
                for (key, value) in properties {
                    result.insert(key.clone(), generate_example(spec, value, depth + 1));
                }
            }
            Value::Object(result)
        }
        "array" => Value::Array(vec![
            schema
                .get("items")
                .map(|item| generate_example(spec, item, depth + 1))
                .unwrap_or(Value::Null),
        ]),
        "integer" => json!(0),
        "number" => json!(0.0),
        "boolean" => json!(true),
        _ => Value::String("string".to_string()),
    }
}

pub(super) fn parameter_example(spec: &Value, parameter: &Value) -> Option<Value> {
    parameter.get("example").cloned().or_else(|| {
        parameter
            .get("schema")
            .and_then(|value| resolve_local(spec, value))
            .and_then(|schema| {
                schema
                    .get("example")
                    .or_else(|| schema.get("default"))
                    .or_else(|| schema.get("enum").and_then(Value::as_array)?.first())
                    .cloned()
            })
    })
}

pub(super) fn value_to_text(value: Value) -> String {
    match value {
        Value::String(value) => value,
        Value::Null => String::new(),
        other => other.to_string(),
    }
}
