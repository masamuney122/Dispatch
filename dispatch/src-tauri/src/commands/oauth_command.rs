use base64::Engine;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::sync::atomic::Ordering;
use std::time::Duration;

mod browser;
mod callback;

use browser::open_system_browser;
use callback::{
    begin_callback_attempt, callback_listener, finish_callback_attempt, wait_for_callback,
};

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
