use base64::Engine;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::net::{IpAddr, TcpListener, TcpStream};
use std::process::Command;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex, OnceLock,
};
use std::time::{Duration, Instant};

const CALLBACK_TIMEOUT: Duration = Duration::from_secs(180);
static ACTIVE_CALLBACK_ATTEMPT: OnceLock<Mutex<Option<Arc<AtomicBool>>>> = OnceLock::new();

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthorizationCodeRequest {
    authorization_url: String,
    access_token_url: String,
    client_id: String,
    client_secret: String,
    scope: String,
    redirect_uri: String,
    client_authentication: String,
}

#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: String,
}

struct AuthorizationCallback {
    code: String,
    state: String,
}

fn begin_callback_attempt() -> (Arc<AtomicBool>, bool) {
    let cancellation = Arc::new(AtomicBool::new(false));
    let mut active_attempt = ACTIVE_CALLBACK_ATTEMPT
        .get_or_init(|| Mutex::new(None))
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let replaced_previous = active_attempt.is_some();
    if let Some(previous) = active_attempt.replace(cancellation.clone()) {
        previous.store(true, Ordering::Release);
    }
    (cancellation, replaced_previous)
}

fn finish_callback_attempt(cancellation: &Arc<AtomicBool>) {
    let mut active_attempt = ACTIVE_CALLBACK_ATTEMPT
        .get_or_init(|| Mutex::new(None))
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if active_attempt
        .as_ref()
        .is_some_and(|active| Arc::ptr_eq(active, cancellation))
    {
        *active_attempt = None;
    }
}

fn open_system_browser(url: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let mut command = {
        let mut command = Command::new("open");
        command.arg(url);
        command
    };

    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = Command::new("cmd");
        command.args(["/C", "start", "", url]);
        command
    };

    #[cfg(all(unix, not(target_os = "macos")))]
    let mut command = {
        let mut command = Command::new("xdg-open");
        command.arg(url);
        command
    };

    command
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Could not open the system browser: {error}"))
}

fn callback_listener(redirect_uri: &str) -> Result<TcpListener, String> {
    let redirect =
        url::Url::parse(redirect_uri).map_err(|error| format!("Invalid redirect URI: {error}"))?;
    if redirect.scheme() != "http" {
        return Err(
            "Authorization Code redirect URI must use a local http loopback address".into(),
        );
    }

    let host = redirect
        .host_str()
        .ok_or_else(|| "Redirect URI has no host".to_string())?;
    let is_loopback = host.eq_ignore_ascii_case("localhost")
        || host
            .parse::<IpAddr>()
            .map(|address| address.is_loopback())
            .unwrap_or(false);
    if !is_loopback {
        return Err("Redirect URI must use localhost or a loopback IP address".into());
    }

    let port = redirect
        .port_or_known_default()
        .ok_or_else(|| "Redirect URI must include a port".to_string())?;
    let bind_host = if host.eq_ignore_ascii_case("localhost") {
        "127.0.0.1"
    } else {
        host
    };
    let listener = TcpListener::bind((bind_host, port)).map_err(|error| {
        format!("Could not listen on OAuth callback {bind_host}:{port}: {error}")
    })?;
    listener
        .set_nonblocking(true)
        .map_err(|error| format!("Could not configure OAuth callback listener: {error}"))?;
    Ok(listener)
}

fn respond_to_browser(stream: &mut TcpStream, success: bool, detail: &str) {
    let (title, color) = if success {
        ("Authorization complete", "#22c55e")
    } else {
        ("Authorization failed", "#ef4444")
    };
    let safe_detail = detail
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;");
    let body = format!(
        "<!doctype html><html><head><meta charset=\"utf-8\"><title>{title}</title></head>\
         <body style=\"margin:0;background:#1e1e1e;color:#e4e4e7;font-family:system-ui;display:grid;place-items:center;min-height:100vh\">\
         <main style=\"text-align:center;padding:40px\"><div style=\"font-size:42px;color:{color}\">{}</div>\
         <h1>{title}</h1><p style=\"color:#a1a1aa\">{safe_detail}</p>\
         <p style=\"color:#71717a\">You can close this tab and return to Dispatch.</p></main></body></html>",
        if success { "✓" } else { "×" }
    );
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.len(),
        body
    );
    let _ = stream.write_all(response.as_bytes());
    let _ = stream.flush();
}

fn wait_for_callback(
    listener: TcpListener,
    redirect_uri: &str,
    cancellation: &AtomicBool,
) -> Result<AuthorizationCallback, String> {
    let redirect = url::Url::parse(redirect_uri).map_err(|error| error.to_string())?;
    let expected_path = redirect.path().to_string();
    let deadline = Instant::now() + CALLBACK_TIMEOUT;

    while Instant::now() < deadline {
        if cancellation.load(Ordering::Acquire) {
            return Err("OAuth authorization was replaced by a newer attempt".into());
        }
        match listener.accept() {
            Ok((mut stream, _)) => {
                let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
                let mut buffer = [0_u8; 16_384];
                let bytes_read = stream
                    .read(&mut buffer)
                    .map_err(|error| format!("Could not read OAuth callback: {error}"))?;
                let request = String::from_utf8_lossy(&buffer[..bytes_read]);
                let request_target = request
                    .lines()
                    .next()
                    .and_then(|line| line.split_whitespace().nth(1))
                    .ok_or_else(|| "OAuth callback request was malformed".to_string())?;
                let callback = url::Url::parse(&format!("http://localhost{request_target}"))
                    .map_err(|error| format!("Invalid OAuth callback: {error}"))?;

                if callback.path() != expected_path {
                    respond_to_browser(&mut stream, false, "Unexpected callback path.");
                    continue;
                }

                let query: std::collections::HashMap<String, String> =
                    callback.query_pairs().into_owned().collect();
                if let Some(error) = query.get("error") {
                    let description = query
                        .get("error_description")
                        .map(String::as_str)
                        .unwrap_or(error);
                    respond_to_browser(&mut stream, false, description);
                    return Err(format!(
                        "Authorization server returned {error}: {description}"
                    ));
                }

                let code = query
                    .get("code")
                    .cloned()
                    .ok_or_else(|| "Authorization callback has no code".to_string())?;
                let state = query
                    .get("state")
                    .cloned()
                    .ok_or_else(|| "Authorization callback has no state".to_string())?;
                respond_to_browser(
                    &mut stream,
                    true,
                    "The authorization code was received securely.",
                );
                return Ok(AuthorizationCallback { code, state });
            }
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(100));
            }
            Err(error) => return Err(format!("OAuth callback listener failed: {error}")),
        }
    }

    Err("Timed out waiting for authorization (3 minutes)".into())
}

#[tauri::command]
pub async fn get_authorization_code_token(
    request: AuthorizationCodeRequest,
) -> Result<String, String> {
    let (cancellation, replaced_previous) = begin_callback_attempt();
    if replaced_previous {
        // The callback listener is non-blocking and observes cancellation every 100 ms.
        // Give the previous attempt enough time to drop its socket before rebinding.
        std::thread::sleep(Duration::from_millis(150));
    }

    let verifier = format!(
        "{}{}",
        uuid::Uuid::new_v4().simple(),
        uuid::Uuid::new_v4().simple()
    );
    let challenge = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .encode(Sha256::digest(verifier.as_bytes()));
    let state = uuid::Uuid::new_v4().to_string();
    let listener = match callback_listener(&request.redirect_uri) {
        Ok(listener) => listener,
        Err(error) => {
            finish_callback_attempt(&cancellation);
            return Err(error);
        }
    };

    let mut authorization_url = url::Url::parse(&request.authorization_url)
        .map_err(|error| format!("Invalid authorization URL: {error}"))?;
    authorization_url
        .query_pairs_mut()
        .append_pair("response_type", "code")
        .append_pair("client_id", &request.client_id)
        .append_pair("redirect_uri", &request.redirect_uri)
        .append_pair("state", &state)
        .append_pair("code_challenge", &challenge)
        .append_pair("code_challenge_method", "S256")
        .append_pair("scope", &request.scope);

    // Google uses these optional parameters to ensure the account selector is
    // visible and a refresh token can be issued on the first consent.
    if authorization_url.host_str() == Some("accounts.google.com") {
        authorization_url
            .query_pairs_mut()
            .append_pair("access_type", "offline")
            .append_pair("prompt", "consent select_account");
    }

    let redirect_uri = request.redirect_uri.clone();
    let callback_cancellation = cancellation.clone();
    let callback_task = tauri::async_runtime::spawn_blocking(move || {
        wait_for_callback(listener, &redirect_uri, &callback_cancellation)
    });
    if let Err(error) = open_system_browser(authorization_url.as_str()) {
        cancellation.store(true, Ordering::Release);
        let _ = callback_task.await;
        finish_callback_attempt(&cancellation);
        return Err(error);
    }
    let callback_result = callback_task
        .await
        .map_err(|error| format!("OAuth callback task failed: {error}"));
    finish_callback_attempt(&cancellation);
    let callback = callback_result??;
    if callback.state != state {
        return Err("Authorization callback state does not match".into());
    }

    let mut form = vec![
        ("grant_type", "authorization_code"),
        ("code", callback.code.as_str()),
        ("redirect_uri", request.redirect_uri.as_str()),
        ("code_verifier", verifier.as_str()),
    ];
    if request.client_authentication == "body" {
        form.push(("client_id", request.client_id.as_str()));
        if !request.client_secret.is_empty() {
            form.push(("client_secret", request.client_secret.as_str()));
        }
    }

    let client = reqwest::Client::new();
    let mut token_request = client.post(&request.access_token_url).form(&form);
    if request.client_authentication != "body" {
        token_request = token_request.basic_auth(&request.client_id, Some(&request.client_secret));
    }

    let token_response = token_request
        .send()
        .await
        .map_err(|error| format!("Token request failed: {error}"))?;
    let status = token_response.status();
    let body = token_response
        .text()
        .await
        .map_err(|error| error.to_string())?;
    if !status.is_success() {
        return Err(format!("Token endpoint returned HTTP {status}: {body}"));
    }
    serde_json::from_str::<TokenResponse>(&body)
        .map(|response| response.access_token)
        .map_err(|error| format!("Invalid token response: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_non_loopback_callback() {
        let error = callback_listener("https://example.com/callback")
            .expect_err("non-loopback callback must fail");
        assert!(error.contains("local http loopback"));
    }

    #[test]
    fn newer_callback_attempt_cancels_the_previous_one() {
        let (first, _) = begin_callback_attempt();
        let (second, replaced_previous) = begin_callback_attempt();

        assert!(replaced_previous);
        assert!(first.load(Ordering::Acquire));
        assert!(!second.load(Ordering::Acquire));

        finish_callback_attempt(&second);
    }
}
