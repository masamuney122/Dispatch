use std::collections::HashMap;

use dispatch_core::{
    ApiRequest, Collection, CollectionMutation, Environment, EnvironmentMutation,
    EnvironmentMutationContext, GlobalHttpSettings, MutationContext, OpenApiExportOptions,
    OpenApiImportContext, OpenApiImportOptions,
    apply_collection_mutation as apply_collection_mutation_core,
    apply_environment_mutation as apply_environment_mutation_core,
    classify_response_body as classify_response_body_core,
    create_workspace_bundle as create_workspace_bundle_core,
    export_collection_openapi as export_collection_openapi_core,
    import_openapi as import_openapi_core, inspect_openapi as inspect_openapi_core,
    parse_and_validate, parse_openapi as parse_openapi_core,
    prepare_request as prepare_request_core,
    resolve_request_variables as resolve_request_variables_core,
    serialize_openapi_yaml as serialize_openapi_yaml_core,
};
use serde::Serialize;
use serde_json::Value;
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
pub fn create_workspace_bundle(
    name: &str,
    workspace_id: &str,
    timestamp: &str,
) -> Result<JsValue, JsValue> {
    let bundle = create_workspace_bundle_core(name, workspace_id, timestamp)
        .map_err(|error| JsValue::from_str(&error))?;
    to_json_compatible_value(&bundle)
}

#[wasm_bindgen]
pub fn resolve_request_variables(request: JsValue, variables: JsValue) -> Result<JsValue, JsValue> {
    let request: ApiRequest = serde_wasm_bindgen::from_value(request)
        .map_err(|error| JsValue::from_str(&format!("Request okunamadı: {error}")))?;
    let variables: HashMap<String, String> = serde_wasm_bindgen::from_value(variables)
        .map_err(|error| JsValue::from_str(&format!("Değişkenler okunamadı: {error}")))?;
    to_json_compatible_value(&resolve_request_variables_core(&request, &variables))
}

#[wasm_bindgen]
pub fn prepare_request(request: JsValue, global_settings: JsValue) -> Result<JsValue, JsValue> {
    let request: ApiRequest = serde_wasm_bindgen::from_value(request)
        .map_err(|error| JsValue::from_str(&format!("Request okunamadı: {error}")))?;
    let global_settings: GlobalHttpSettings = serde_wasm_bindgen::from_value(global_settings)
        .map_err(|error| JsValue::from_str(&format!("HTTP ayarları okunamadı: {error}")))?;
    let prepared = prepare_request_core(&request, &global_settings)
        .map_err(|error| JsValue::from_str(&error))?;
    to_json_compatible_value(&prepared)
}

#[wasm_bindgen]
pub fn classify_response_body(
    content_type: Option<String>,
    is_utf8: bool,
    is_empty: bool,
) -> Result<JsValue, JsValue> {
    to_json_compatible_value(&classify_response_body_core(
        content_type.as_deref(),
        is_utf8,
        is_empty,
    ))
}

#[wasm_bindgen]
pub fn apply_collection_mutation(
    collections: JsValue,
    mutation: JsValue,
    context: JsValue,
) -> Result<JsValue, JsValue> {
    let collections: Vec<Collection> = serde_wasm_bindgen::from_value(collections)
        .map_err(|error| JsValue::from_str(&format!("Collection listesi okunamadı: {error}")))?;
    let mutation: CollectionMutation = serde_wasm_bindgen::from_value(mutation)
        .map_err(|error| JsValue::from_str(&format!("Collection işlemi okunamadı: {error}")))?;
    let context: MutationContext = serde_wasm_bindgen::from_value(context)
        .map_err(|error| JsValue::from_str(&format!("Mutation bağlamı okunamadı: {error}")))?;
    let result = apply_collection_mutation_core(&collections, mutation, &context)
        .map_err(|error| JsValue::from_str(&error))?;
    to_json_compatible_value(&result)
}

#[wasm_bindgen]
pub fn apply_environment_mutation(
    environments: JsValue,
    active_environment_id: Option<String>,
    mutation: JsValue,
    context: JsValue,
) -> Result<JsValue, JsValue> {
    let environments: Vec<Environment> = serde_wasm_bindgen::from_value(environments)
        .map_err(|error| JsValue::from_str(&format!("Environment listesi okunamadı: {error}")))?;
    let mutation: EnvironmentMutation = serde_wasm_bindgen::from_value(mutation)
        .map_err(|error| JsValue::from_str(&format!("Environment işlemi okunamadı: {error}")))?;
    let context: EnvironmentMutationContext = serde_wasm_bindgen::from_value(context)
        .map_err(|error| JsValue::from_str(&format!("Environment bağlamı okunamadı: {error}")))?;
    let result = apply_environment_mutation_core(
        &environments,
        active_environment_id.as_deref(),
        mutation,
        &context,
    )
    .map_err(|error| JsValue::from_str(&error))?;
    to_json_compatible_value(&result)
}

#[wasm_bindgen]
pub fn parse_openapi(content: &str) -> Result<JsValue, JsValue> {
    let spec = parse_openapi_core(content).map_err(|error| JsValue::from_str(&error))?;
    to_json_compatible_value(&spec)
}

#[wasm_bindgen]
pub fn serialize_openapi_yaml(spec: JsValue) -> Result<String, JsValue> {
    let spec: Value = serde_wasm_bindgen::from_value(spec)
        .map_err(|error| JsValue::from_str(&format!("OpenAPI verisi okunamadı: {error}")))?;
    serialize_openapi_yaml_core(&spec).map_err(|error| JsValue::from_str(&error))
}

#[wasm_bindgen]
pub fn export_collection_openapi(
    collection: JsValue,
    options: JsValue,
) -> Result<JsValue, JsValue> {
    let collection: Collection = serde_wasm_bindgen::from_value(collection)
        .map_err(|error| JsValue::from_str(&format!("Collection okunamadı: {error}")))?;
    let options: OpenApiExportOptions = serde_wasm_bindgen::from_value(options)
        .map_err(|error| JsValue::from_str(&format!("OpenAPI ayarları okunamadı: {error}")))?;
    let result = export_collection_openapi_core(&collection, &options)
        .map_err(|error| JsValue::from_str(&error))?;
    to_json_compatible_value(&result)
}

#[wasm_bindgen]
pub fn inspect_openapi(spec: JsValue, fallback_title: &str) -> Result<JsValue, JsValue> {
    let spec: Value = serde_wasm_bindgen::from_value(spec)
        .map_err(|error| JsValue::from_str(&format!("OpenAPI verisi okunamadı: {error}")))?;
    let preview =
        inspect_openapi_core(&spec, fallback_title).map_err(|error| JsValue::from_str(&error))?;
    to_json_compatible_value(&preview)
}

#[wasm_bindgen]
pub fn import_openapi(
    spec: JsValue,
    collection_name: &str,
    selected_server: Option<String>,
    options: JsValue,
    context: JsValue,
) -> Result<JsValue, JsValue> {
    let spec: Value = serde_wasm_bindgen::from_value(spec)
        .map_err(|error| JsValue::from_str(&format!("OpenAPI verisi okunamadı: {error}")))?;
    let options: OpenApiImportOptions = serde_wasm_bindgen::from_value(options)
        .map_err(|error| JsValue::from_str(&format!("OpenAPI ayarları okunamadı: {error}")))?;
    let context: OpenApiImportContext = serde_wasm_bindgen::from_value(context)
        .map_err(|error| JsValue::from_str(&format!("Import bağlamı okunamadı: {error}")))?;
    let result = import_openapi_core(
        &spec,
        collection_name,
        selected_server.as_deref(),
        &options,
        &context,
    )
    .map_err(|error| JsValue::from_str(&error))?;
    to_json_compatible_value(&result)
}

fn to_json_compatible_value<T: Serialize>(value: &T) -> Result<JsValue, JsValue> {
    value
        .serialize(&serde_wasm_bindgen::Serializer::json_compatible())
        .map_err(|error| JsValue::from_str(&error.to_string()))
}
