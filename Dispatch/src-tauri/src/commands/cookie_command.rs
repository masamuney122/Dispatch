use std::sync::Mutex;

use crate::models::cookie::{CookieKey, StoredCookie};
use crate::services::cookie_service::CookieRuntimeState;

#[tauri::command]
pub fn list_cookies(
    state: tauri::State<'_, Mutex<CookieRuntimeState>>,
) -> Result<Vec<StoredCookie>, String> {
    let (jar, _) = state.lock().map_err(|error| error.to_string())?.current()?;
    jar.list()
}

#[tauri::command]
pub fn upsert_cookie(
    state: tauri::State<'_, Mutex<CookieRuntimeState>>,
    previous: Option<CookieKey>,
    cookie: StoredCookie,
) -> Result<Vec<StoredCookie>, String> {
    let (jar, path) = state.lock().map_err(|error| error.to_string())?.current()?;
    jar.upsert(previous.as_ref(), cookie)?;
    jar.save(&path)?;
    jar.list()
}

#[tauri::command]
pub fn set_cookie_enabled(
    state: tauri::State<'_, Mutex<CookieRuntimeState>>,
    key: CookieKey,
    enabled: bool,
) -> Result<Vec<StoredCookie>, String> {
    let (jar, path) = state.lock().map_err(|error| error.to_string())?.current()?;
    jar.set_enabled(&key, enabled)?;
    jar.save(&path)?;
    jar.list()
}

#[tauri::command]
pub fn delete_cookie(
    state: tauri::State<'_, Mutex<CookieRuntimeState>>,
    key: CookieKey,
) -> Result<Vec<StoredCookie>, String> {
    let (jar, path) = state.lock().map_err(|error| error.to_string())?.current()?;
    jar.remove(&key)?;
    jar.save(&path)?;
    jar.list()
}

#[tauri::command]
pub fn clear_cookies(state: tauri::State<'_, Mutex<CookieRuntimeState>>) -> Result<(), String> {
    let (jar, path) = state.lock().map_err(|error| error.to_string())?.current()?;
    jar.clear()?;
    jar.save(&path)
}
