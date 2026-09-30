use std::collections::HashMap;
use std::time::Instant;

use base64::Engine;
use dispatch_core::{classify_response_body, ResponseBodyKind};
use reqwest::header::CONTENT_TYPE;

use crate::models::response::{ApiResponse, ResponseNetworkInfo};

pub(super) async fn into_api_response(
    mut response: reqwest::Response,
    started_at: Instant,
    max_response_size_mb: usize,
) -> Result<ApiResponse, String> {
    let status = response.status().as_u16();
    let network = ResponseNetworkInfo {
        transport: "desktop".to_string(),
        http_version: Some(format!("{:?}", response.version())),
        remote_address: response.remote_addr().map(|address| address.to_string()),
    };
    let mut headers = HashMap::<String, String>::new();
    for (name, value) in response.headers() {
        let name = name.to_string();
        let value = value.to_str().unwrap_or("<binary>");
        headers
            .entry(name.clone())
            .and_modify(|existing| {
                existing.push_str(if name.eq_ignore_ascii_case("set-cookie") {
                    "\n"
                } else {
                    ", "
                });
                existing.push_str(value);
            })
            .or_insert_with(|| value.to_string());
    }
    let content_type = headers
        .iter()
        .find(|(name, _)| name.eq_ignore_ascii_case(CONTENT_TYPE.as_str()))
        .map(|(_, value)| value.as_str());
    let maximum_bytes = max_response_size_mb.saturating_mul(1024 * 1024);
    if maximum_bytes > 0
        && response
            .content_length()
            .is_some_and(|length| length > maximum_bytes as u64)
    {
        return Err(format!(
            "Response exceeds the configured {max_response_size_mb} MB limit."
        ));
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|error| error.to_string())? {
        if maximum_bytes > 0 && bytes.len().saturating_add(chunk.len()) > maximum_bytes {
            return Err(format!(
                "Response exceeds the configured {max_response_size_mb} MB limit."
            ));
        }
        bytes.extend_from_slice(&chunk);
    }
    let body_size = bytes.len();
    let (body, body_base64) = match classify_response_body(
        content_type,
        std::str::from_utf8(&bytes).is_ok(),
        bytes.is_empty(),
    ) {
        ResponseBodyKind::Text => (String::from_utf8_lossy(&bytes).into_owned(), None),
        ResponseBodyKind::Binary => (
            String::new(),
            Some(base64::engine::general_purpose::STANDARD.encode(&bytes)),
        ),
        ResponseBodyKind::Empty => (String::new(), None),
    };

    Ok(ApiResponse {
        status,
        response_time_ms: started_at.elapsed().as_millis(),
        body,
        body_base64,
        body_size,
        headers,
        request_headers: HashMap::new(),
        network,
        cookies: Vec::new(),
        cookie_handling: "workspace".to_string(),
    })
}
