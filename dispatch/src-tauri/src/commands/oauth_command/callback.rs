use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{IpAddr, TcpListener, TcpStream};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex, OnceLock,
};
use std::time::{Duration, Instant};

const CALLBACK_TIMEOUT: Duration = Duration::from_secs(180);
static ACTIVE_CALLBACK_ATTEMPT: OnceLock<Mutex<Option<Arc<AtomicBool>>>> = OnceLock::new();

pub(super) struct AuthorizationCallback {
    pub(super) code: String,
    pub(super) state: String,
}

pub(super) fn begin_callback_attempt() -> (Arc<AtomicBool>, bool) {
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

pub(super) fn finish_callback_attempt(cancellation: &Arc<AtomicBool>) {
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

pub(super) fn callback_listener(redirect_uri: &str) -> Result<TcpListener, String> {
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

pub(super) fn wait_for_callback(
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
                let callback = read_callback(&mut stream, &expected_path)?;
                if let Some(callback) = callback {
                    return Ok(callback);
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(100));
            }
            Err(error) => return Err(format!("OAuth callback listener failed: {error}")),
        }
    }
    Err("Timed out waiting for authorization (3 minutes)".into())
}

fn read_callback(
    stream: &mut TcpStream,
    expected_path: &str,
) -> Result<Option<AuthorizationCallback>, String> {
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
        respond_to_browser(stream, false, "Unexpected callback path.");
        return Ok(None);
    }

    let query = callback
        .query_pairs()
        .into_owned()
        .collect::<HashMap<_, _>>();
    if let Some(error) = query.get("error") {
        let description = query
            .get("error_description")
            .map(String::as_str)
            .unwrap_or(error);
        respond_to_browser(stream, false, description);
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
        stream,
        true,
        "The authorization code was received securely.",
    );
    Ok(Some(AuthorizationCallback { code, state }))
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
