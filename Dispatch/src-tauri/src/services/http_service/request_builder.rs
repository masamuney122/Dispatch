use std::sync::Arc;
use std::time::Duration;

use base64::Engine;
use dispatch_core::{ApiRequest, GlobalHttpSettings, HttpVersionPreference, PreparedBody};

use crate::services::cookie_service::ManagedCookieJar;

const SUPPORTED_METHODS: [&str; 7] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

pub(super) fn build_client(
    settings: &GlobalHttpSettings,
    cookie_jar: Option<Arc<ManagedCookieJar>>,
) -> Result<reqwest::Client, String> {
    let redirect_policy = if settings.follow_redirects {
        reqwest::redirect::Policy::limited(settings.max_redirects)
    } else {
        reqwest::redirect::Policy::none()
    };
    let mut builder = reqwest::Client::builder()
        .danger_accept_invalid_certs(!settings.verify_ssl)
        .referer(!settings.remove_referer_on_redirect)
        .redirect(redirect_policy);
    if settings.request_timeout_ms > 0 {
        builder = builder.timeout(Duration::from_millis(settings.request_timeout_ms));
    }
    if settings.cookies_enabled {
        if let Some(cookie_jar) = cookie_jar {
            builder = builder.cookie_provider(cookie_jar);
        }
    }
    builder = match settings.http_version {
        HttpVersionPreference::Auto => builder,
        HttpVersionPreference::Http1 => builder.http1_only(),
        HttpVersionPreference::Http2 => builder.http2_prior_knowledge(),
    };
    builder
        .build()
        .map_err(|error| format!("HTTP client could not be configured: {error}"))
}

pub(super) fn build_request(
    client: &reqwest::Client,
    request: &ApiRequest,
    body: &PreparedBody,
) -> Result<reqwest::RequestBuilder, String> {
    let method = request.method.to_uppercase();
    if !SUPPORTED_METHODS.contains(&method.as_str()) {
        return Err(format!("Unsupported HTTP method: {}", request.method));
    }
    let method =
        reqwest::Method::from_bytes(method.as_bytes()).map_err(|error| error.to_string())?;
    let mut builder = client.request(method, &request.url);
    for (key, value) in &request.headers {
        builder = builder.header(key, value);
    }
    apply_body(builder, body)
}

fn apply_body(
    mut builder: reqwest::RequestBuilder,
    body: &PreparedBody,
) -> Result<reqwest::RequestBuilder, String> {
    match body {
        PreparedBody::None => {}
        PreparedBody::Text { value } | PreparedBody::UrlEncoded { value } => {
            builder = builder.body(value.clone());
        }
        PreparedBody::FormData { fields } => {
            let form = fields
                .iter()
                .fold(reqwest::multipart::Form::new(), |form, field| {
                    form.text(field.key.clone(), field.value.clone())
                });
            builder = builder.multipart(form);
        }
        PreparedBody::Binary { data_base64 } => {
            let bytes = base64::engine::general_purpose::STANDARD
                .decode(data_base64)
                .map_err(|error| format!("Invalid binary payload: {error}"))?;
            builder = builder.body(bytes);
        }
    }
    Ok(builder)
}
