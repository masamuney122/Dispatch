use std::sync::Mutex;

use crate::models::environment::AppState;
use crate::models::request::ApiRequest;
use crate::models::response::ApiResponse;
use crate::models::workspace::WorkspaceRuntimeState;
use crate::services::cookie_service::CookieRuntimeState;
use crate::services::{environment_service, http_service};

#[tauri::command]
pub async fn send_request(
    state: tauri::State<'_, Mutex<AppState>>,
    runtime: tauri::State<'_, Mutex<WorkspaceRuntimeState>>,
    cookie_runtime: tauri::State<'_, Mutex<CookieRuntimeState>>,
    mut request: ApiRequest,
) -> Result<ApiResponse, String> {
    // Resolve environment variables before sending
    let variables = {
        let app_state = state.lock().map_err(|e| e.to_string())?;
        app_state.active_variables()
    }; // MutexGuard dropped here — lock released before async .await

    environment_service::resolve_request(&mut request, &variables);

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
