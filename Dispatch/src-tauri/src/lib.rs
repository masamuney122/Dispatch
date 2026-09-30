pub mod commands;
pub mod models;
pub mod services;

use models::environment::AppState;
use models::workspace::WorkspaceRuntimeState;
use services::cookie_service::CookieRuntimeState;
use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Mutex::new(AppState::default()))
        .manage(Mutex::new(WorkspaceRuntimeState::default()))
        .manage(Mutex::new(CookieRuntimeState::default()))
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            let app_data_dir = app
                .handle()
                .path()
                .app_data_dir()
                .map_err(|error| format!("Failed to get app data directory: {error}"))?;
            let settings = match services::workspace_service::load_settings(&app_data_dir) {
                Ok(settings) => settings,
                Err(error) => {
                    log::warn!("Application settings could not be loaded: {error}");
                    Default::default()
                }
            };
            let last_workspace_path = settings.last_workspace_path.clone();
            if let Ok(mut runtime) = app.state::<Mutex<WorkspaceRuntimeState>>().lock() {
                runtime.settings = settings;
            }

            if let Some(path) = last_workspace_path {
                match services::workspace_service::open_workspace(&path) {
                    Ok(session) => {
                        if let Err(error) = commands::workspace_command::activate_workspace(
                            app.handle(),
                            app.state::<Mutex<WorkspaceRuntimeState>>().inner(),
                            app.state::<Mutex<AppState>>().inner(),
                            app.state::<Mutex<CookieRuntimeState>>().inner(),
                            session,
                        ) {
                            log::warn!("Last workspace could not be activated: {error}");
                        }
                    }
                    Err(error) => log::warn!("Last workspace could not be opened: {error}"),
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::archive_command::export_workspace_archive,
            commands::archive_command::inspect_workspace_archive,
            commands::archive_command::import_workspace_archive,
            commands::request_command::send_request,
            commands::request_command::send_runner_request,
            commands::request_command::resolve_request_variables,
            commands::oauth_command::get_authorization_code_token,
            commands::openapi_command::inspect_openapi,
            commands::openapi_command::import_openapi,
            commands::openapi_command::export_collection_openapi,
            commands::history_command::save_history,
            commands::history_command::load_history,
            commands::history_command::clear_history,
            commands::history_command::delete_history_item,
            commands::collection_command::list_collections,
            commands::collection_command::create_collection,
            commands::collection_command::rename_collection,
            commands::collection_command::delete_collection,
            commands::collection_command::save_request_to_collection,
            commands::collection_command::update_request_in_collection,
            commands::collection_command::rename_request_in_collection,
            commands::collection_command::duplicate_request_in_collection,
            commands::collection_command::delete_request_from_collection,
            commands::collection_command::create_folder,
            commands::collection_command::rename_folder,
            commands::collection_command::delete_folder,
            commands::collection_command::duplicate_folder,
            commands::collection_command::move_folder,
            commands::collection_command::create_request_in_collection,
            commands::collection_command::reorder_items,
            commands::cookie_command::list_cookies,
            commands::cookie_command::upsert_cookie,
            commands::cookie_command::set_cookie_enabled,
            commands::cookie_command::delete_cookie,
            commands::cookie_command::clear_cookies,
            commands::environment_command::create_environment,
            commands::environment_command::list_environments,
            commands::environment_command::update_environment,
            commands::environment_command::delete_environment,
            commands::environment_command::set_active_environment,
            commands::environment_command::get_active_environment,
            commands::workspace_command::create_workspace,
            commands::workspace_command::open_workspace,
            commands::workspace_command::close_workspace,
            commands::workspace_command::get_current_workspace,
            commands::workspace_command::list_recent_workspaces,
            commands::workspace_command::get_http_settings,
            commands::workspace_command::update_http_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
