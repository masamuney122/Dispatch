use std::sync::Mutex;

use crate::models::environment::AppState;
use crate::models::request::ApiRequest;
use crate::models::response::ApiResponse;
use crate::models::workspace::WorkspaceRuntimeState;
use crate::services::{environment_service, http_service};

#[tauri::command]
pub async fn send_request(
    state: tauri::State<'_, Mutex<AppState>>,
    runtime: tauri::State<'_, Mutex<WorkspaceRuntimeState>>,
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

    http_service::send_request_with_settings(request, &global_settings).await
}
