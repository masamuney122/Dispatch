use std::collections::HashMap;
use std::time::Instant;

use base64::Engine;
use dispatch_core::{classify_response_body, ResponseBodyKind};
use reqwest::header::CONTENT_TYPE;

use crate::models::response::ApiResponse;

pub(super) async fn into_api_response(
    response: reqwest::Response,
    started_at: Instant,
) -> Result<ApiResponse, String> {
    let status = response.status().as_u16();
    let headers = response
        .headers()
        .iter()
        .map(|(name, value)| {
            (
                name.to_string(),
                value.to_str().unwrap_or("<binary>").to_string(),
            )
        })
        .collect::<HashMap<_, _>>();
    let content_type = headers
        .iter()
        .find(|(name, _)| name.eq_ignore_ascii_case(CONTENT_TYPE.as_str()))
        .map(|(_, value)| value.as_str());
    let bytes = response.bytes().await.map_err(|error| error.to_string())?;
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
        cookies: Vec::new(),
        cookie_handling: "workspace".to_string(),
    })
}
