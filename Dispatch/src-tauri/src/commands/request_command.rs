use std::sync::Mutex;

use crate::models::response::ApiResponse;
use crate::models::workspace::WorkspaceRuntimeState;
use crate::services::cookie_service::CookieRuntimeState;
use crate::services::http_service;
use dispatch_core::{resolve_request_variables as resolve_core, ApiRequest, RequestResolution};
use std::collections::HashMap;

#[tauri::command]
pub fn resolve_request_variables(
    request: ApiRequest,
    variables: HashMap<String, String>,
) -> RequestResolution {
    resolve_core(&request, &variables)
}

#[tauri::command]
pub async fn send_request(
    runtime: tauri::State<'_, Mutex<WorkspaceRuntimeState>>,
    cookie_runtime: tauri::State<'_, Mutex<CookieRuntimeState>>,
    request: ApiRequest,
) -> Result<ApiResponse, String> {
    let global_settings = runtime
        .lock()
        .map_err(|error| error.to_string())?
        .settings
        .http
        .clone();

    let (cookie_jar, cookie_path) = cookie_runtime
        .lock()
        .map_err(|error| error.to_string())?
        .current()?;
    let before = cookie_jar.snapshot()?;
    let mut response = http_service::send_request_with_cookie_jar(
        request,
        &global_settings,
        Some(cookie_jar.clone()),
    )
    .await?;
    response.cookies = cookie_jar.changed_since(&before)?;
    cookie_jar.save(&cookie_path)?;
    Ok(response)
}
