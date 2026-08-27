use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;

use chrono::Utc;
use serde_json::{json, Map, Value};

use crate::models::auth::{ApiKeyLocation, AuthConfig, OAuth2GrantType};
use crate::models::collection::{Collection, Folder, SavedRequest};
use crate::models::environment::{AppState, Environment};
use crate::models::openapi::{
    OpenApiExportFormat, OpenApiExportOptions, OpenApiExportResult, OpenApiFolderOrganization,
    OpenApiImportOptions, OpenApiImportPreview, OpenApiImportResult, OpenApiRequestNaming,
    OpenApiSource, OpenApiWarning,
};
use crate::models::request::{ApiRequest, BodyField, RequestBodyType};
use crate::models::workspace::{
    CollectionsDocument, EnvironmentsDocument, WorkspaceSession, COLLECTIONS_FILE,
    ENVIRONMENTS_FILE, WORKSPACE_SCHEMA_VERSION,
};
use crate::services::storage_service::{read_json, write_bytes_atomic, write_json_atomic};
use crate::services::workspace_service::workspace_file;

const MAX_OPENAPI_FILE_SIZE: u64 = 10 * 1024 * 1024;
const MAX_OPERATIONS: usize = 2_000;
const HTTP_METHODS: [&str; 7] = ["get", "post", "put", "patch", "delete", "head", "options"];

#[derive(Default)]
struct ConversionState {
    warnings: Vec<OpenApiWarning>,
    environment_variables: HashMap<String, String>,
}

pub fn inspect_openapi(path: &Path) -> Result<OpenApiImportPreview, String> {
    inspect_openapi_source(&OpenApiSource::File {
        path: path.to_string_lossy().to_string(),
    })
}

pub fn inspect_openapi_source(source: &OpenApiSource) -> Result<OpenApiImportPreview, String> {
    let (spec, fallback_title) = parse_openapi_source(source)?;
    let title = spec
        .pointer("/info/title")
        .and_then(Value::as_str)
        .unwrap_or(&fallback_title)
        .to_string();
    let specification_version = spec
        .get("openapi")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let mut endpoint_count = 0;
    let mut tags = HashSet::new();
    let mut path_folders = HashSet::new();
    let mut warnings = inspect_warnings(&spec);

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
        servers: server_urls(&spec),
        security_schemes: spec
            .pointer("/components/securitySchemes")
            .and_then(Value::as_object)
            .map(|items| items.keys().cloned().collect())
            .unwrap_or_default(),
        warnings,
    })
}

pub fn import_openapi(
    session: &WorkspaceSession,
    app_state: &mut AppState,
    source_path: &Path,
    options: &OpenApiImportOptions,
) -> Result<OpenApiImportResult, String> {
    import_openapi_source(
        session,
        app_state,
        &OpenApiSource::File {
            path: source_path.to_string_lossy().to_string(),
        },
        options,
    )
}

pub fn import_openapi_source(
    session: &WorkspaceSession,
    app_state: &mut AppState,
    source: &OpenApiSource,
    options: &OpenApiImportOptions,
) -> Result<OpenApiImportResult, String> {
    let (spec, fallback_title) = parse_openapi_source(source)?;
    let collections_path = workspace_file(session, COLLECTIONS_FILE);
    let environments_path = workspace_file(session, ENVIRONMENTS_FILE);
    let original_collections: CollectionsDocument =
        read_json(&collections_path, "collections document")?;
    let original_environments: EnvironmentsDocument =
        read_json(&environments_path, "environments document")?;
    validate_workspace_documents(session, &original_collections, &original_environments)?;

    let requested_name = options.collection_name.trim();
    let fallback_name = spec
        .pointer("/info/title")
        .and_then(Value::as_str)
        .unwrap_or(&fallback_title);
    let collection_name = unique_name(
        if requested_name.is_empty() {
            fallback_name
        } else {
            requested_name
        },
        original_collections
            .collections
            .iter()
            .map(|item| item.name.as_str()),
    );
    let server = options
        .selected_server
        .clone()
        .filter(|value| !value.trim().is_empty())
        .or_else(|| server_urls(&spec).into_iter().next());
    let (collection, mut state) =
        convert_to_collection(&spec, collection_name, server.as_deref(), options)?;

    let environment = if options.create_environment {
        if let Some(server_url) = server {
            state
                .environment_variables
                .insert("baseUrl".to_string(), server_url);
        }
        let requested_environment_name = options
            .environment_name
            .as_deref()
            .map(str::trim)
            .filter(|name| !name.is_empty())
            .map(str::to_string)
            .unwrap_or_else(|| format!("{} Environment", collection.name));
        let name = unique_name(
            &requested_environment_name,
            original_environments
                .environments
                .iter()
                .map(|item| item.name.as_str()),
        );
        let now = Utc::now().to_rfc3339();
        Some(Environment {
            id: uuid::Uuid::new_v4().to_string(),
            name,
            variables: state.environment_variables.clone(),
            workspace_id: Some(session.manifest.id.clone()),
            created_at: now.clone(),
            updated_at: now,
        })
    } else {
        None
    };

    let now = Utc::now().to_rfc3339();
    let mut updated_collections = original_collections.clone();
    updated_collections.revision = updated_collections.revision.saturating_add(1);
    updated_collections.updated_at = now.clone();
    updated_collections.collections.push(collection.clone());

    let mut updated_environments = original_environments.clone();
    if let Some(environment) = &environment {
        updated_environments.revision = updated_environments.revision.saturating_add(1);
        updated_environments.updated_at = now;
        updated_environments.environments.push(environment.clone());
    }

    write_json_atomic(
        &collections_path,
        &updated_collections,
        "collections document",
    )?;
    if environment.is_some() {
        if let Err(error) = write_json_atomic(
            &environments_path,
            &updated_environments,
            "environments document",
        ) {
            let rollback = write_json_atomic(
                &collections_path,
                &original_collections,
                "collections rollback",
            );
            return Err(match rollback {
                Ok(()) => format!("OpenAPI import failed and was rolled back: {error}"),
                Err(rollback_error) => format!(
                    "OpenAPI import failed: {error}. Collection rollback also failed: {rollback_error}"
                ),
            });
        }
        app_state.environments = updated_environments.environments;
    }

    Ok(OpenApiImportResult {
        collection,
        environment,
        warnings: state.warnings,
    })
}

pub fn export_collection(
    session: &WorkspaceSession,
    collection_id: &str,
    destination: &Path,
    options: &OpenApiExportOptions,
) -> Result<OpenApiExportResult, String> {
    let collections_path = workspace_file(session, COLLECTIONS_FILE);
    let document: CollectionsDocument = read_json(&collections_path, "collections document")?;
    let collection = document
        .collections
        .iter()
        .find(|item| item.id == collection_id)
        .ok_or_else(|| format!("Collection not found: {collection_id}"))?;
    let (spec, endpoint_count, warnings) = collection_to_openapi(collection, options);
    let mut bytes = match options.format {
        OpenApiExportFormat::Json => serde_json::to_vec_pretty(&spec)
            .map_err(|error| format!("Failed to serialize OpenAPI JSON: {error}"))?,
        OpenApiExportFormat::Yaml => serde_norway::to_string(&spec)
            .map_err(|error| format!("Failed to serialize OpenAPI YAML: {error}"))?
            .into_bytes(),
    };
    if !bytes.ends_with(b"\n") {
        bytes.push(b'\n');
    }
    write_bytes_atomic(destination, &bytes, "OpenAPI export")?;
    Ok(OpenApiExportResult {
        path: destination.to_string_lossy().to_string(),
        endpoint_count,
        warnings,
    })
}

fn parse_openapi_source(source: &OpenApiSource) -> Result<(Value, String), String> {
    let (content, format_hint, fallback_title) = match source {
        OpenApiSource::File { path } => {
            let path = Path::new(path);
            let metadata = fs::metadata(path)
                .map_err(|error| format!("Failed to inspect OpenAPI file: {error}"))?;
            if metadata.len() > MAX_OPENAPI_FILE_SIZE {
                return Err("OpenAPI file is larger than 10 MB".to_string());
            }
            let content = fs::read_to_string(path)
                .map_err(|error| format!("Failed to read OpenAPI file: {error}"))?;
            let extension = path
                .extension()
                .and_then(|item| item.to_str())
                .map(str::to_string);
            (content, extension, file_stem(path).to_string())
        }
        OpenApiSource::Text { content } => {
            if content.len() as u64 > MAX_OPENAPI_FILE_SIZE {
                return Err("OpenAPI text is larger than 10 MB".to_string());
            }
            (content.clone(), None, "Imported API".to_string())
        }
    };

    let spec = parse_openapi_content(&content, format_hint.as_deref())?;
    Ok((spec, fallback_title))
}

fn parse_openapi_content(content: &str, format_hint: Option<&str>) -> Result<Value, String> {
    if content.trim().is_empty() {
        return Err("OpenAPI file is empty".to_string());
    }
    let spec: Value = if format_hint.is_some_and(|hint| hint.eq_ignore_ascii_case("json"))
        || content.trim_start().starts_with('{')
    {
        serde_json::from_str(&content).map_err(|error| format!("Invalid OpenAPI JSON: {error}"))?
    } else {
        serde_norway::from_str(&content)
            .map_err(|error| format!("Invalid OpenAPI YAML: {error}"))?
    };
    let version = spec
        .get("openapi")
        .and_then(Value::as_str)
        .ok_or_else(|| "File does not contain an OpenAPI version".to_string())?;
    if !version.starts_with("3.0.") && !version.starts_with("3.1.") {
        return Err(format!(
            "Unsupported OpenAPI version {version}. Dispatch currently supports OpenAPI 3.0.x and 3.1.x"
        ));
    }
    if !spec.get("paths").is_some_and(Value::is_object) {
        return Err("OpenAPI document does not contain a valid paths object".to_string());
    }
    Ok(spec)
}

fn inspect_warnings(spec: &Value) -> Vec<OpenApiWarning> {
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

fn convert_to_collection(
    spec: &Value,
    collection_name: String,
    selected_server: Option<&str>,
    options: &OpenApiImportOptions,
) -> Result<(Collection, ConversionState), String> {
    let collection_id = uuid::Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    let mut state = ConversionState {
        warnings: inspect_warnings(spec),
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
                    .and_then(Value::as_array)
                    .and_then(|tags| tags.first())
                    .and_then(Value::as_str)
            })
            .collect::<HashSet<_>>();
        if let Some(declared_tags) = spec.get("tags").and_then(Value::as_array) {
            for tag_name in declared_tags
                .iter()
                .filter_map(|tag| tag.get("name").and_then(Value::as_str))
                .filter(|tag_name| used_tags.contains(tag_name))
            {
                ensure_import_folder(
                    tag_name,
                    &collection_id,
                    &now,
                    &mut folders,
                    &mut folder_by_name,
                );
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
            .filter(|(key, _)| HTTP_METHODS.contains(&key.as_str()))
        {
            let folder_name = match options.folder_organization {
                OpenApiFolderOrganization::Tags => {
                    let tags = operation.get("tags").and_then(Value::as_array);
                    if tags.is_some_and(|items| items.len() > 1) {
                        state.warnings.push(warning(
                            "multiple-tags",
                            "Only the first operation tag was used as its folder.",
                            Some(format!("{} {}", method.to_uppercase(), path_name)),
                        ));
                    }
                    tags.and_then(|items| items.first()).and_then(Value::as_str)
                }
                OpenApiFolderOrganization::Path => first_static_path_segment(path_name),
            };
            let folder_id = folder_name.map(|name| {
                ensure_import_folder(
                    name,
                    &collection_id,
                    &now,
                    &mut folders,
                    &mut folder_by_name,
                )
            });
            let sibling_order = requests
                .iter()
                .filter(|request: &&SavedRequest| request.folder_id == folder_id)
                .count() as i64;
            let request = convert_operation(
                spec,
                path_name,
                path_item,
                method.as_str(),
                operation,
                selected_server,
                &mut state,
            );
            let name = imported_request_name(
                operation,
                method,
                path_name,
                &request,
                &options.request_naming,
            );
            requests.push(SavedRequest {
                id: uuid::Uuid::new_v4().to_string(),
                name,
                request,
                folder_id,
                order: sibling_order,
                created_at: now.clone(),
                updated_at: now.clone(),
            });
        }
    }

    if requests.is_empty() {
        return Err("OpenAPI document does not contain any supported operations".to_string());
    }
    Ok((
        Collection {
            id: collection_id,
            name: collection_name,
            folders,
            requests,
            created_at: now.clone(),
            updated_at: now,
        },
        state,
    ))
}

fn ensure_import_folder(
    name: &str,
    collection_id: &str,
    now: &str,
    folders: &mut Vec<Folder>,
    folder_by_name: &mut HashMap<String, String>,
) -> String {
    if let Some(id) = folder_by_name.get(name) {
        return id.clone();
    }
    let id = uuid::Uuid::new_v4().to_string();
    folder_by_name.insert(name.to_string(), id.clone());
    folders.push(Folder {
        id: id.clone(),
        name: name.to_string(),
        collection_id: collection_id.to_string(),
        parent_folder_id: None,
        order: folders.len() as i64,
        created_at: now.to_string(),
        updated_at: now.to_string(),
    });
    id
}

fn convert_operation(
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
            let location = parameter
                .get("in")
                .and_then(Value::as_str)
                .unwrap_or_default();
            let example = parameter_example(spec, parameter)
                .map(value_to_text)
                .unwrap_or_else(|| format!("{{{{{name}}}}}"));
            match location {
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
    let auth = operation_auth(spec, operation, state);
    ApiRequest {
        method: method.to_uppercase(),
        url,
        body,
        body_type,
        form_fields,
        binary: None,
        headers,
        auth,
        settings: Default::default(),
        scripts: Default::default(),
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
        RequestBodyType::Json => {
            let text = example
                .and_then(|value| serde_json::to_string_pretty(&value).ok())
                .unwrap_or_default();
            (text, RequestBodyType::Json, Vec::new())
        }
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
        RequestBodyType::Xml | RequestBodyType::Html | RequestBodyType::Text => {
            let text = example.map(value_to_text).unwrap_or_default();
            (text, body_type, Vec::new())
        }
        _ => (String::new(), RequestBodyType::None, Vec::new()),
    }
}

fn operation_auth(
    spec: &Value,
    operation: &Value,
    state: &mut ConversionState,
) -> Option<AuthConfig> {
    let security = operation.get("security").or_else(|| spec.get("security"))?;
    let first_requirement = security.as_array()?.first()?.as_object()?;
    let scheme_name = first_requirement.keys().next()?;
    let pointer = format!(
        "/components/securitySchemes/{}",
        pointer_escape(scheme_name)
    );
    let scheme_value = spec.pointer(&pointer)?;
    let scheme = resolve_local(spec, scheme_value)?;
    match scheme
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or_default()
    {
        "http" => match scheme
            .get("scheme")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_ascii_lowercase()
            .as_str()
        {
            "basic" => Some(AuthConfig::Basic {
                username: String::new(),
                password: String::new(),
            }),
            "bearer" => Some(AuthConfig::Bearer {
                token: String::new(),
            }),
            other => {
                state.warnings.push(warning(
                    "unsupported-http-auth",
                    &format!("HTTP authentication scheme '{other}' is not supported."),
                    Some(scheme_name.clone()),
                ));
                None
            }
        },
        "apiKey" => {
            let key = scheme
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or("X-API-Key")
                .to_string();
            let add_to = match scheme.get("in").and_then(Value::as_str) {
                Some("query") => ApiKeyLocation::QueryParam,
                Some("header") => ApiKeyLocation::Header,
                _ => {
                    state.warnings.push(warning(
                        "unsupported-api-key-location",
                        "Only header and query API keys are supported.",
                        Some(scheme_name.clone()),
                    ));
                    return None;
                }
            };
            Some(AuthConfig::ApiKey {
                key,
                value: String::new(),
                add_to,
            })
        }
        "oauth2" => oauth_auth(scheme),
        "openIdConnect" => {
            state.warnings.push(warning(
                "unsupported-openid-connect",
                "OpenID Connect is not imported.",
                Some(scheme_name.clone()),
            ));
            None
        }
        _ => None,
    }
}

fn oauth_auth(scheme: &Value) -> Option<AuthConfig> {
    let flows = scheme.get("flows")?.as_object()?;
    let (grant_type, flow) = if let Some(flow) = flows.get("authorizationCode") {
        (OAuth2GrantType::AuthorizationCode, flow)
    } else if let Some(flow) = flows.get("clientCredentials") {
        (OAuth2GrantType::ClientCredentials, flow)
    } else {
        (OAuth2GrantType::Password, flows.get("password")?)
    };
    let scope = flow
        .get("scopes")
        .and_then(Value::as_object)
        .map(|items| items.keys().cloned().collect::<Vec<_>>().join(" "))
        .unwrap_or_default();
    Some(AuthConfig::OAuth2 {
        grant_type,
        access_token_url: flow
            .get("tokenUrl")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        client_id: String::new(),
        client_secret: String::new(),
        scope,
        username: String::new(),
        password: String::new(),
        access_token: String::new(),
        authorization_url: flow
            .get("authorizationUrl")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        redirect_uri: String::new(),
    })
}

fn collection_to_openapi(
    collection: &Collection,
    options: &OpenApiExportOptions,
) -> (Value, usize, Vec<OpenApiWarning>) {
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
    let mut endpoint_count = 0;
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
        let (path, query_parameters, _detected_server) = export_url_parts(&saved.request.url);
        let method = saved.request.method.to_ascii_lowercase();
        if !HTTP_METHODS.contains(&method.as_str()) {
            warnings.push(warning(
                "unsupported-method",
                "Request method was skipped during export.",
                Some(saved.name.clone()),
            ));
            continue;
        }
        let path_item = paths
            .entry(path.clone())
            .or_insert_with(|| Value::Object(Map::new()));
        let Some(path_item_object) = path_item.as_object_mut() else {
            continue;
        };
        if path_item_object.contains_key(&method) {
            warnings.push(warning("duplicate-operation", "Another request already uses the same path and method; the later request was skipped.", Some(saved.name.clone())));
            continue;
        }
        let mut operation = Map::new();
        operation.insert("summary".to_string(), Value::String(saved.name.clone()));
        if let Some(folder_id) = &saved.folder_id {
            if let Some(tag) = folder_names.get(folder_id) {
                operation.insert("tags".to_string(), json!([tag]));
                used_folder_ids.insert(folder_id.clone());
            }
        }
        let mut parameters = Vec::new();
        for variable in dispatch_variables(&path) {
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
        if let Some(request_body) = export_request_body(&saved.request) {
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
        operation.insert(
            "responses".to_string(),
            json!({ "200": { "description": "Successful response" } }),
        );
        path_item_object.insert(method, Value::Object(operation));
        endpoint_count += 1;
    }

    let server = options
        .server_url
        .as_deref()
        .map(str::trim)
        .filter(|item| !item.is_empty());
    let mut root = Map::new();
    root.insert("openapi".to_string(), Value::String("3.0.3".to_string()));
    root.insert(
        "info".to_string(),
        json!({ "title": title, "version": version }),
    );
    if let Some(server) = server {
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
    if !security_schemes.is_empty() {
        root.insert(
            "components".to_string(),
            json!({ "securitySchemes": security_schemes }),
        );
    }
    (Value::Object(root), endpoint_count, warnings)
}

fn folder_order_path(collection: &Collection, folder: &Folder) -> Vec<(i64, usize)> {
    let mut path = Vec::new();
    let mut current = Some(folder);
    let mut visited = HashSet::new();

    while let Some(item) = current {
        if !visited.insert(item.id.as_str()) {
            break;
        }
        let source_index = collection
            .folders
            .iter()
            .position(|candidate| candidate.id == item.id)
            .unwrap_or(usize::MAX);
        path.push((item.order, source_index));
        current = item.parent_folder_id.as_deref().and_then(|parent_id| {
            collection
                .folders
                .iter()
                .find(|candidate| candidate.id == parent_id)
        });
    }

    path.reverse();
    path
}

fn request_order_path(collection: &Collection, request: &SavedRequest) -> Vec<(i64, usize)> {
    let mut path = request
        .folder_id
        .as_deref()
        .and_then(|folder_id| {
            collection
                .folders
                .iter()
                .find(|folder| folder.id == folder_id)
        })
        .map(|folder| folder_order_path(collection, folder))
        .unwrap_or_default();
    let source_index = collection
        .requests
        .iter()
        .position(|candidate| candidate.id == request.id)
        .unwrap_or(usize::MAX);
    path.push((request.order, source_index));
    path
}

fn export_url_parts(url: &str) -> (String, Vec<Value>, Option<String>) {
    let mut raw = url.to_string();
    let mut server = None;
    if raw.starts_with("{{baseUrl}}") {
        raw = raw.trim_start_matches("{{baseUrl}}").to_string();
    } else if let Ok(parsed) = url::Url::parse(url) {
        server = Some(format!(
            "{}://{}{}",
            parsed.scheme(),
            parsed.host_str().unwrap_or_default(),
            parsed
                .port()
                .map(|port| format!(":{port}"))
                .unwrap_or_default()
        ));
        raw = parsed[url::Position::BeforePath..].to_string();
    }
    let (path_part, query_part) = raw.split_once('?').unwrap_or((&raw, ""));
    let mut path = ensure_leading_slash(path_part).to_string();
    for variable in dispatch_variables(&path) {
        path = path.replace(&format!("{{{{{variable}}}}}"), &format!("{{{variable}}}"));
    }
    let parameters = url::form_urlencoded::parse(query_part.as_bytes())
        .map(|(key, value)| {
            json!({
                "name": key,
                "in": "query",
                "required": false,
                "schema": { "type": "string" },
                "example": value
            })
        })
        .collect();
    (path, parameters, server)
}

fn export_request_body(request: &ApiRequest) -> Option<Value> {
    let (content_type, example) = match &request.body_type {
        RequestBodyType::None | RequestBodyType::Binary => return None,
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
    media.insert("example".to_string(), example);
    let mut content = Map::new();
    content.insert(content_type.to_string(), Value::Object(media));
    Some(json!({ "content": content }))
}

fn export_security(auth: &Option<AuthConfig>) -> Option<(String, Value, Value)> {
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
                "apiKeyAuth".to_string(),
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
                OAuth2GrantType::ClientCredentials => {
                    json!({ "tokenUrl": access_token_url, "scopes": scopes })
                }
                OAuth2GrantType::Password => {
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
            Some((
                "oauth2".to_string(),
                json!({ "type": "oauth2", "flows": flows }),
                json!([]),
            ))
        }
    }
}

fn generate_example(spec: &Value, schema_value: &Value, depth: usize) -> Value {
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
        "array" => Value::Array(vec![schema
            .get("items")
            .map(|item| generate_example(spec, item, depth + 1))
            .unwrap_or(Value::Null)]),
        "integer" => json!(0),
        "number" => json!(0.0),
        "boolean" => json!(true),
        _ => Value::String("string".to_string()),
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

fn parameter_example(spec: &Value, parameter: &Value) -> Option<Value> {
    parameter.get("example").cloned().or_else(|| {
        parameter
            .get("schema")
            .and_then(|value| resolve_local(spec, value))
            .and_then(|schema| {
                schema
                    .get("example")
                    .or_else(|| schema.get("default"))
                    .cloned()
            })
    })
}

fn resolve_local<'a>(spec: &'a Value, value: &'a Value) -> Option<&'a Value> {
    let mut current = value;
    for _ in 0..16 {
        let Some(reference) = current.get("$ref").and_then(Value::as_str) else {
            return Some(current);
        };
        let pointer = reference.strip_prefix('#')?;
        current = spec.pointer(pointer)?;
    }
    None
}

fn imported_request_name(
    operation: &Value,
    method: &str,
    path: &str,
    request: &ApiRequest,
    strategy: &OpenApiRequestNaming,
) -> String {
    match strategy {
        OpenApiRequestNaming::Path => format!("{} {path}", method.to_uppercase()),
        OpenApiRequestNaming::Url => request.url.clone(),
        OpenApiRequestNaming::Fallback => fallback_operation_name(operation, method, path, request),
    }
}

fn fallback_operation_name(
    operation: &Value,
    method: &str,
    path: &str,
    request: &ApiRequest,
) -> String {
    operation
        .get("summary")
        .or_else(|| operation.get("operationId"))
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .map(|value| value.trim().to_string())
        .or_else(|| {
            operation
                .get("description")
                .and_then(Value::as_str)
                .and_then(|description| description.lines().find(|line| !line.trim().is_empty()))
                .map(|line| line.trim().to_string())
        })
        .or_else(|| (!request.url.trim().is_empty()).then(|| request.url.clone()))
        .unwrap_or_else(|| format!("{} {path}", method.to_uppercase()))
}

fn server_urls(spec: &Value) -> Vec<String> {
    spec.get("servers")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.get("url").and_then(Value::as_str).map(str::to_string))
                .collect()
        })
        .unwrap_or_default()
}

fn unique_name<'a>(requested: &str, existing: impl Iterator<Item = &'a str>) -> String {
    let names = existing.collect::<HashSet<_>>();
    if !names.contains(requested) {
        return requested.to_string();
    }
    let imported = format!("{requested} (Imported)");
    if !names.contains(imported.as_str()) {
        return imported;
    }
    for number in 2.. {
        let candidate = format!("{requested} (Imported {number})");
        if !names.contains(candidate.as_str()) {
            return candidate;
        }
    }
    unreachable!()
}

fn full_folder_name(collection: &Collection, folder: &Folder) -> String {
    let mut names = vec![folder.name.clone()];
    let mut parent = folder.parent_folder_id.as_deref();
    let mut visited = HashSet::new();
    while let Some(parent_id) = parent {
        if !visited.insert(parent_id.to_string()) {
            break;
        }
        let Some(parent_folder) = collection.folders.iter().find(|item| item.id == parent_id)
        else {
            break;
        };
        names.push(parent_folder.name.clone());
        parent = parent_folder.parent_folder_id.as_deref();
    }
    names.reverse();
    names.join(" / ")
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

fn value_to_text(value: Value) -> String {
    match value {
        Value::String(value) => value,
        Value::Null => String::new(),
        other => other.to_string(),
    }
}

fn encode_query_part(value: &str) -> String {
    if value.contains("{{") {
        return value.to_string();
    }
    url::form_urlencoded::byte_serialize(value.as_bytes()).collect()
}

fn ensure_leading_slash(value: &str) -> String {
    if value.starts_with('/') {
        value.to_string()
    } else {
        format!("/{value}")
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

fn file_stem(path: &Path) -> &str {
    path.file_stem()
        .and_then(|item| item.to_str())
        .unwrap_or("Imported API")
}

fn warning(code: &str, message: &str, location: Option<String>) -> OpenApiWarning {
    OpenApiWarning {
        code: code.to_string(),
        message: message.to_string(),
        location,
    }
}

fn validate_workspace_documents(
    session: &WorkspaceSession,
    collections: &CollectionsDocument,
    environments: &EnvironmentsDocument,
) -> Result<(), String> {
    if collections.schema_version != WORKSPACE_SCHEMA_VERSION
        || environments.schema_version != WORKSPACE_SCHEMA_VERSION
    {
        return Err("Workspace documents use an unsupported schema version".to_string());
    }
    if collections.workspace_id != session.manifest.id
        || environments.workspace_id != session.manifest.id
    {
        return Err("Workspace documents belong to another workspace".to_string());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        collection_to_openapi, convert_to_collection, dispatch_variables, export_collection,
        import_openapi, infer_schema, inspect_openapi, inspect_openapi_source,
    };
    use crate::models::collection::{Collection, Folder, SavedRequest};
    use crate::models::environment::AppState;
    use crate::models::openapi::{
        OpenApiExportFormat, OpenApiExportOptions, OpenApiFolderOrganization, OpenApiImportOptions,
        OpenApiRequestNaming, OpenApiSource,
    };
    use crate::models::request::{ApiRequest, RequestBodyType};
    use crate::services::workspace_service;
    use serde_json::json;
    use std::collections::HashMap;

    #[test]
    fn exports_root_tags_in_collection_folder_order() {
        let folder = |id: &str, name: &str, order: i64| Folder {
            id: id.to_string(),
            name: name.to_string(),
            collection_id: "collection".to_string(),
            parent_folder_id: None,
            order,
            created_at: String::new(),
            updated_at: String::new(),
        };
        let request = |id: &str, path: &str, folder_id: &str, order: i64| SavedRequest {
            id: id.to_string(),
            name: id.to_string(),
            request: ApiRequest {
                method: "GET".to_string(),
                url: format!("https://httpbin.org/{path}"),
                body: String::new(),
                body_type: RequestBodyType::None,
                form_fields: Vec::new(),
                binary: None,
                headers: HashMap::new(),
                auth: None,
                settings: Default::default(),
                scripts: Default::default(),
            },
            folder_id: Some(folder_id.to_string()),
            order,
            created_at: String::new(),
            updated_at: String::new(),
        };
        let collection = Collection {
            id: "collection".to_string(),
            name: "HTTP tests".to_string(),
            folders: vec![
                folder("07", "07 - CORS", 6),
                folder("01", "01 - Basics", 0),
                folder("02", "02 - Headers", 1),
            ],
            requests: vec![
                request("cors", "anything", "07", 0),
                request("basics second", "aaa-second", "01", 1),
                request("headers", "headers", "02", 0),
                request("basics first", "zzz-first", "01", 0),
            ],
            created_at: String::new(),
            updated_at: String::new(),
        };
        let (spec, _, _) = collection_to_openapi(
            &collection,
            &OpenApiExportOptions {
                title: String::new(),
                api_version: "1.0.0".to_string(),
                format: OpenApiExportFormat::Yaml,
                server_url: None,
            },
        );

        assert_eq!(
            spec["tags"],
            json!([
                { "name": "01 - Basics" },
                { "name": "02 - Headers" },
                { "name": "07 - CORS" }
            ])
        );

        let yaml = serde_norway::to_string(&spec).unwrap();
        let basics_first = yaml.find("  /zzz-first:").unwrap();
        let basics_second = yaml.find("  /aaa-second:").unwrap();
        let headers = yaml.find("  /headers:").unwrap();
        let cors = yaml.find("  /anything:").unwrap();
        assert!(basics_first < basics_second);
        assert!(basics_second < headers);
        assert!(headers < cors);
    }

    #[test]
    fn imports_paths_tags_parameters_and_json_body() {
        let spec = json!({
            "openapi": "3.0.3",
            "info": { "title": "Pet API", "version": "1.0.0" },
            "paths": {
                "/pets/{id}": {
                    "get": {
                        "summary": "Get pet",
                        "tags": ["Pets"],
                        "parameters": [
                            { "name": "id", "in": "path", "required": true, "schema": { "type": "string", "example": "42" } },
                            { "name": "expand", "in": "query", "schema": { "type": "string", "default": "owner" } }
                        ]
                    }
                }
            }
        });
        let (collection, state) = convert_to_collection(
            &spec,
            "Pet API".into(),
            Some("https://example.com"),
            &OpenApiImportOptions::default(),
        )
        .unwrap();
        assert_eq!(collection.folders.len(), 1);
        assert_eq!(collection.requests.len(), 1);
        assert_eq!(
            collection.requests[0].request.url,
            "{{baseUrl}}/pets/{{id}}?expand=owner"
        );
        assert_eq!(state.environment_variables["id"], "42");
    }

    #[test]
    fn imports_requests_in_openapi_document_order() {
        let spec: serde_json::Value = serde_norway::from_str(
            r#"openapi: 3.1.0
info:
  title: E-commerce API
  version: 1.0.0
paths:
  /auth/register:
    post:
      summary: Create a new user account
  /auth/login:
    post:
      summary: Login and get access token
  /products:
    get:
      summary: List all products with filters
  /addresses:
    post:
      summary: Add a new address
    get:
      summary: Get your saved addresses
"#,
        )
        .unwrap();

        let (collection, _) = convert_to_collection(
            &spec,
            "E-commerce API".to_string(),
            None,
            &OpenApiImportOptions::default(),
        )
        .unwrap();
        let request_names = collection
            .requests
            .iter()
            .map(|request| request.name.as_str())
            .collect::<Vec<_>>();

        assert_eq!(
            request_names,
            vec![
                "Create a new user account",
                "Login and get access token",
                "List all products with filters",
                "Add a new address",
                "Get your saved addresses",
            ]
        );
        assert_eq!(
            collection
                .requests
                .iter()
                .map(|request| request.order)
                .collect::<Vec<_>>(),
            vec![0, 1, 2, 3, 4]
        );
    }

    #[test]
    fn inspects_openapi_yaml_supplied_as_text() {
        let preview = inspect_openapi_source(&OpenApiSource::Text {
            content: r#"openapi: 3.1.0
info:
  title: Text API
  version: 1.0.0
servers:
  - url: https://api.example.com
paths:
  /users:
    get:
      tags: [Users]
  /orders/{id}:
    get:
      tags: [Orders]
"#
            .to_string(),
        })
        .unwrap();

        assert_eq!(preview.title, "Text API");
        assert_eq!(preview.specification_version, "3.1.0");
        assert_eq!(preview.endpoint_count, 2);
        assert_eq!(preview.tag_folder_count, 2);
        assert_eq!(preview.path_folder_count, 2);
        assert_eq!(preview.servers, ["https://api.example.com"]);

        let json_preview = inspect_openapi_source(&OpenApiSource::Text {
            content: r#"{
              "openapi": "3.0.3",
              "info": { "title": "JSON Text API", "version": "1.0.0" },
              "paths": { "/health": { "get": { "summary": "Health" } } }
            }"#
            .to_string(),
        })
        .unwrap();
        assert_eq!(json_preview.title, "JSON Text API");
        assert_eq!(json_preview.endpoint_count, 1);
    }

    #[test]
    fn applies_request_naming_and_folder_organization_options() {
        let spec = json!({
            "openapi": "3.1.0",
            "info": { "title": "Options API", "version": "1.0.0" },
            "tags": [
                { "name": "Admin" },
                { "name": "Users" }
            ],
            "paths": {
                "/{tenantId}/users/{id}": {
                    "parameters": [
                        { "name": "tenantId", "in": "path", "required": true, "schema": { "type": "string" } },
                        { "name": "id", "in": "path", "required": true, "schema": { "type": "string" } }
                    ],
                    "get": { "summary": "Get user", "tags": ["Users"] }
                },
                "/admin/login": {
                    "post": { "summary": "Login", "tags": ["Admin"] }
                }
            }
        });

        let tag_options = OpenApiImportOptions {
            folder_organization: OpenApiFolderOrganization::Tags,
            ..OpenApiImportOptions::default()
        };
        let (tag_collection, _) =
            convert_to_collection(&spec, "Tags".to_string(), None, &tag_options).unwrap();
        assert_eq!(
            tag_collection
                .folders
                .iter()
                .map(|folder| folder.name.as_str())
                .collect::<Vec<_>>(),
            vec!["Admin", "Users"]
        );

        let path_options = OpenApiImportOptions {
            request_naming: OpenApiRequestNaming::Path,
            folder_organization: OpenApiFolderOrganization::Path,
            ..OpenApiImportOptions::default()
        };
        let (path_collection, _) = convert_to_collection(
            &spec,
            "Paths".to_string(),
            Some("https://api.example.com"),
            &path_options,
        )
        .unwrap();
        assert_eq!(
            path_collection
                .folders
                .iter()
                .map(|folder| folder.name.as_str())
                .collect::<Vec<_>>(),
            vec!["users", "admin"]
        );
        assert_eq!(
            path_collection.requests[0].name,
            "GET /{tenantId}/users/{id}"
        );

        let url_options = OpenApiImportOptions {
            request_naming: OpenApiRequestNaming::Url,
            folder_organization: OpenApiFolderOrganization::Path,
            ..OpenApiImportOptions::default()
        };
        let (url_collection, _) = convert_to_collection(
            &spec,
            "URLs".to_string(),
            Some("https://api.example.com"),
            &url_options,
        )
        .unwrap();
        assert_eq!(
            url_collection.requests[0].name,
            "{{baseUrl}}/{{tenantId}}/users/{{id}}"
        );
    }

    #[test]
    fn finds_dispatch_variables() {
        assert_eq!(
            dispatch_variables("/{{one}}/{{two}}/{{one}}"),
            vec!["one", "two"]
        );
    }

    #[test]
    fn infers_json_schema() {
        let schema = infer_schema(&json!({ "name": "Dispatch", "active": true }));
        assert_eq!(schema["properties"]["name"]["type"], "string");
        assert_eq!(schema["properties"]["active"]["type"], "boolean");
    }

    #[test]
    fn imports_and_exports_a_yaml_document_inside_a_workspace() {
        let root =
            std::env::temp_dir().join(format!("dispatch-openapi-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        let source = root.join("pet-api.yaml");
        std::fs::write(
            &source,
            r#"openapi: 3.0.3
info:
  title: Pet API
  version: 1.0.0
servers:
  - url: https://pets.example.com
paths:
  /pets:
    post:
      summary: Create pet
      tags: [Pets]
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                name:
                  type: string
      responses:
        '201':
          description: Created
"#,
        )
        .unwrap();
        let workspace =
            workspace_service::create_workspace(&root.join("workspace"), "Test").unwrap();
        let preview = inspect_openapi(&source).unwrap();
        assert_eq!(preview.endpoint_count, 1);

        let mut app_state = AppState::default();
        let imported = import_openapi(
            &workspace,
            &mut app_state,
            &source,
            &OpenApiImportOptions {
                collection_name: "Pet API".to_string(),
                selected_server: Some("https://pets.example.com".to_string()),
                create_environment: true,
                environment_name: Some("Pet Environment".to_string()),
                ..OpenApiImportOptions::default()
            },
        )
        .unwrap();
        assert_eq!(imported.collection.requests.len(), 1);
        let imported_body: serde_json::Value =
            serde_json::from_str(&imported.collection.requests[0].request.body).unwrap();
        assert_eq!(imported_body["name"], "string");
        assert_eq!(app_state.environments.len(), 1);
        assert_eq!(
            app_state.environments[0].variables["baseUrl"],
            "https://pets.example.com"
        );

        let destination = root.join("exported.json");
        let exported = export_collection(
            &workspace,
            &imported.collection.id,
            &destination,
            &OpenApiExportOptions {
                title: "Pet API".to_string(),
                api_version: "1.0.0".to_string(),
                format: OpenApiExportFormat::Json,
                server_url: Some("https://pets.example.com".to_string()),
            },
        )
        .unwrap();
        assert_eq!(exported.endpoint_count, 1);
        let exported_value: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(destination).unwrap()).unwrap();
        assert_eq!(exported_value["openapi"], "3.0.3");
        assert!(exported_value["paths"]["/pets"]["post"].is_object());

        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn accepts_openapi_31_yaml_documents() {
        let root =
            std::env::temp_dir().join(format!("dispatch-openapi-31-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        let source = root.join("storefront.yaml");
        std::fs::write(
            &source,
            r#"openapi: 3.1.0
info:
  title: Storefront API
  version: 1.0.0
servers:
  - url: https://storefront.example.com/v1
components:
  securitySchemes:
    BearerAuth:
      type: http
      scheme: bearer
paths:
  /products/{id}:
    get:
      summary: Get product
      security:
        - BearerAuth: []
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Product
"#,
        )
        .unwrap();

        let preview = inspect_openapi(&source).unwrap();
        assert_eq!(preview.specification_version, "3.1.0");
        assert_eq!(preview.endpoint_count, 1);
        assert_eq!(preview.servers, ["https://storefront.example.com/v1"]);
        assert_eq!(preview.security_schemes, ["BearerAuth"]);

        std::fs::remove_dir_all(root).unwrap();
    }
}
