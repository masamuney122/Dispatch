use std::collections::HashMap;

use dispatch_web_core::{parse_and_validate, resolve_template as resolve_template_core};
use serde::Serialize;
use wasm_bindgen::prelude::*;

#[wasm_bindgen(start)]
pub fn start() {
    console_error_panic_hook::set_once();
}

#[wasm_bindgen]
pub fn validate_workspace(
    manifest_json: &str,
    collections_json: &str,
    environments_json: &str,
) -> Result<JsValue, JsValue> {
    let bundle = parse_and_validate(manifest_json, collections_json, environments_json)
        .map_err(|error| JsValue::from_str(&error.to_string()))?;
    to_json_compatible_value(&bundle)
}

#[wasm_bindgen]
pub fn resolve_template(input: &str, variables: JsValue) -> Result<JsValue, JsValue> {
    let variables: HashMap<String, String> = serde_wasm_bindgen::from_value(variables)
        .map_err(|error| JsValue::from_str(&format!("Değişkenler okunamadı: {error}")))?;
    let result = resolve_template_core(input, &variables);
    to_json_compatible_value(&result)
}

fn to_json_compatible_value<T: Serialize>(value: &T) -> Result<JsValue, JsValue> {
    value
        .serialize(&serde_wasm_bindgen::Serializer::json_compatible())
        .map_err(|error| JsValue::from_str(&error.to_string()))
}
