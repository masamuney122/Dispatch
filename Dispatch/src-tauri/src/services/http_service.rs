use base64::Engine;
use reqwest::header::CONTENT_TYPE;

use crate::models::request::{ApiRequest, HttpVersionPreference, RequestBodyType};
use crate::models::response::ApiResponse;
use crate::models::workspace::GlobalHttpSettings;

use std::collections::HashMap;
use std::time::Instant;

const SUPPORTED_METHODS: [&str; 7] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

pub async fn send_request(request: ApiRequest) -> Result<ApiResponse, String> {
    send_request_with_settings(request, &GlobalHttpSettings::default()).await
}

pub async fn send_request_with_settings(
    request: ApiRequest,
    global_settings: &GlobalHttpSettings,
) -> Result<ApiResponse, String> {
    let start = Instant::now();
    let method = request.method.to_uppercase();

    if !SUPPORTED_METHODS.contains(&method.as_str()) {
        return Err(format!("Unsupported HTTP method: {}", request.method));
    }

    let http_version = request
        .settings
        .http_version
        .unwrap_or(global_settings.http_version);
    let verify_ssl = request
        .settings
        .verify_ssl
        .unwrap_or(global_settings.verify_ssl);
    let follow_redirects = request
        .settings
        .follow_redirects
        .unwrap_or(global_settings.follow_redirects);
    let remove_referer = request
        .settings
        .remove_referer_on_redirect
        .unwrap_or(global_settings.remove_referer_on_redirect);
    let max_redirects = request
        .settings
        .max_redirects
        .unwrap_or(global_settings.max_redirects)
        .clamp(1, 100);

    let redirect_policy = if follow_redirects {
        reqwest::redirect::Policy::limited(max_redirects)
    } else {
        reqwest::redirect::Policy::none()
    };
    let mut client_builder = reqwest::Client::builder()
        .danger_accept_invalid_certs(!verify_ssl)
        .referer(!remove_referer)
        .redirect(redirect_policy);
    client_builder = match http_version {
        HttpVersionPreference::Auto => client_builder,
        HttpVersionPreference::Http1 => client_builder.http1_only(),
        HttpVersionPreference::Http2 => client_builder.http2_prior_knowledge(),
    };
    let client = client_builder
        .build()
        .map_err(|error| format!("HTTP client could not be configured: {error}"))?;
    let mut builder = client.request(
        reqwest::Method::from_bytes(method.as_bytes()).map_err(|error| error.to_string())?,
        &request.url,
    );

    for (key, value) in &request.headers {
        builder = builder.header(key, value);
    }

    if let Some(auth) = request.auth.clone() {
        builder = auth.apply(builder);
    }

    builder = apply_body(builder, &request)?;

    let response = builder.send().await.map_err(|error| error.to_string())?;
    let status_code = response.status().as_u16();
    let response_headers: HashMap<String, String> = response
        .headers()
        .iter()
        .map(|(name, value)| {
            (
                name.to_string(),
                value.to_str().unwrap_or("<binary>").to_string(),
            )
        })
        .collect();
    let content_type = response_headers
        .iter()
        .find(|(name, _)| name.eq_ignore_ascii_case(CONTENT_TYPE.as_str()))
        .map(|(_, value)| value.as_str());
    let bytes = response.bytes().await.map_err(|error| error.to_string())?;
    let body_size = bytes.len();
    let should_decode_as_text = content_type.is_some_and(is_textual_content_type)
        || (content_type.is_none() && std::str::from_utf8(&bytes).is_ok());
    let (body, body_base64) = if should_decode_as_text {
        (String::from_utf8_lossy(&bytes).into_owned(), None)
    } else if bytes.is_empty() {
        (String::new(), None)
    } else {
        (
            String::new(),
            Some(base64::engine::general_purpose::STANDARD.encode(&bytes)),
        )
    };

    Ok(ApiResponse {
        status: status_code,
        response_time_ms: start.elapsed().as_millis(),
        body,
        body_base64,
        body_size,
        headers: response_headers,
    })
}

fn is_textual_content_type(content_type: &str) -> bool {
    let mime = content_type
        .split(';')
        .next()
        .unwrap_or_default()
        .trim()
        .to_ascii_lowercase();
    mime.starts_with("text/")
        || mime.ends_with("+json")
        || mime.ends_with("+xml")
        || matches!(
            mime.as_str(),
            "application/json"
                | "application/xml"
                | "application/javascript"
                | "application/x-javascript"
                | "application/graphql"
                | "application/sql"
                | "application/x-www-form-urlencoded"
                | "image/svg+xml"
        )
}

fn apply_body(
    mut builder: reqwest::RequestBuilder,
    request: &ApiRequest,
) -> Result<reqwest::RequestBuilder, String> {
    let has_content_type = request
        .headers
        .keys()
        .any(|key| key.eq_ignore_ascii_case(CONTENT_TYPE.as_str()));

    match request.body_type {
        RequestBodyType::None => {}
        RequestBodyType::Json => {
            if !has_content_type {
                builder = builder.header(CONTENT_TYPE, "application/json");
            }
            builder = builder.body(request.body.clone());
        }
        RequestBodyType::Text => {
            if !has_content_type {
                builder = builder.header(CONTENT_TYPE, "text/plain; charset=utf-8");
            }
            builder = builder.body(request.body.clone());
        }
        RequestBodyType::Html => {
            if !has_content_type {
                builder = builder.header(CONTENT_TYPE, "text/html; charset=utf-8");
            }
            builder = builder.body(request.body.clone());
        }
        RequestBodyType::Xml => {
            if !has_content_type {
                builder = builder.header(CONTENT_TYPE, "application/xml");
            }
            builder = builder.body(request.body.clone());
        }
        RequestBodyType::FormData => {
            let form = request
                .form_fields
                .iter()
                .filter(|field| !field.key.trim().is_empty())
                .fold(reqwest::multipart::Form::new(), |form, field| {
                    form.text(field.key.clone(), field.value.clone())
                });
            builder = builder.multipart(form);
        }
        RequestBodyType::XWwwFormUrlencoded => {
            let encoded = url::form_urlencoded::Serializer::new(String::new())
                .extend_pairs(
                    request
                        .form_fields
                        .iter()
                        .filter(|field| !field.key.trim().is_empty())
                        .map(|field| (field.key.as_str(), field.value.as_str())),
                )
                .finish();
            if !has_content_type {
                builder = builder.header(CONTENT_TYPE, "application/x-www-form-urlencoded");
            }
            builder = builder.body(encoded);
        }
        RequestBodyType::Binary => {
            let binary = request
                .binary
                .as_ref()
                .ok_or("Choose a binary file before sending the request.")?;
            let bytes = base64::engine::general_purpose::STANDARD
                .decode(&binary.data_base64)
                .map_err(|error| format!("Invalid binary payload: {error}"))?;
            if !has_content_type {
                let mime_type = if binary.mime_type.is_empty() {
                    "application/octet-stream"
                } else {
                    &binary.mime_type
                };
                builder = builder.header(CONTENT_TYPE, mime_type);
            }
            builder = builder.body(bytes);
        }
    }

    Ok(builder)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::request::{BinaryBody, BodyField, RequestHttpSettings};
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::sync::mpsc::{self, Receiver};
    use std::thread;

    fn capture_one_request() -> (String, Receiver<String>) {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind test server");
        let address = listener.local_addr().expect("read test address");
        let (sender, receiver) = mpsc::channel();

        thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("accept request");
            let mut bytes = Vec::new();
            let mut chunk = [0_u8; 4096];
            let mut expected_length = None;

            loop {
                let size = stream.read(&mut chunk).expect("read request");
                if size == 0 {
                    break;
                }
                bytes.extend_from_slice(&chunk[..size]);

                if expected_length.is_none() {
                    if let Some(header_end) = bytes.windows(4).position(|part| part == b"\r\n\r\n")
                    {
                        let headers = String::from_utf8_lossy(&bytes[..header_end]);
                        expected_length = headers
                            .lines()
                            .find_map(|line| line.split_once(':'))
                            .filter(|(name, _)| name.eq_ignore_ascii_case("content-length"))
                            .and_then(|(_, value)| value.trim().parse::<usize>().ok());
                        if expected_length.unwrap_or(0) == 0 {
                            break;
                        }
                    }
                }

                if let (Some(header_end), Some(content_length)) = (
                    bytes.windows(4).position(|part| part == b"\r\n\r\n"),
                    expected_length,
                ) {
                    if bytes.len() >= header_end + 4 + content_length {
                        break;
                    }
                }
            }

            sender
                .send(String::from_utf8_lossy(&bytes).into_owned())
                .expect("send captured request");
            let _ = stream
                .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok");
        });

        (format!("http://{address}"), receiver)
    }

    fn request(url: String, method: &str, body_type: RequestBodyType) -> ApiRequest {
        ApiRequest {
            method: method.to_string(),
            url,
            body: String::new(),
            body_type,
            form_fields: Vec::new(),
            binary: None,
            headers: HashMap::new(),
            auth: None,
            settings: Default::default(),
        }
    }

    fn serve_one_response(response: Vec<u8>) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind test server");
        let address = listener.local_addr().expect("read test address");

        thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("accept request");
            let mut received = Vec::new();
            let mut chunk = [0_u8; 1024];
            while !received.windows(4).any(|part| part == b"\r\n\r\n") {
                let size = stream.read(&mut chunk).expect("read request");
                if size == 0 {
                    break;
                }
                received.extend_from_slice(&chunk[..size]);
            }
            stream.write_all(&response).expect("write response");
        });

        format!("http://{address}")
    }

    #[test]
    fn decompresses_gzip_response_body() {
        const COMPRESSED_BODY: &[u8] = &[
            0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03, 0xab, 0x56, 0x4a, 0xaf,
            0xca, 0x2c, 0x28, 0x48, 0x4d, 0x51, 0xb2, 0x2a, 0x29, 0x2a, 0x4d, 0xd5, 0x51, 0xca,
            0x4d, 0x2d, 0x2e, 0x4e, 0x4c, 0x4f, 0x55, 0xb2, 0x52, 0x72, 0xc9, 0x2c, 0x2e, 0x48,
            0x2c, 0x49, 0xce, 0x50, 0xaa, 0x05, 0x00, 0xf7, 0x9e, 0x8f, 0xfd, 0x25, 0x00, 0x00,
            0x00,
        ];
        let mut raw_response = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Encoding: gzip\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            COMPRESSED_BODY.len()
        )
        .into_bytes();
        raw_response.extend_from_slice(COMPRESSED_BODY);

        let url = serve_one_response(raw_response);
        let response = tauri::async_runtime::block_on(send_request(request(
            url,
            "GET",
            RequestBodyType::None,
        )))
        .expect("send gzip request");

        assert_eq!(response.body, r#"{"gzipped":true,"message":"Dispatch"}"#);
        assert!(response.body_base64.is_none());
        assert_eq!(response.body_size, 37);
    }

    #[test]
    fn preserves_binary_response_body_as_base64() {
        const PNG_PREFIX: &[u8] = &[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
        let mut raw_response = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: image/png\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            PNG_PREFIX.len()
        )
        .into_bytes();
        raw_response.extend_from_slice(PNG_PREFIX);

        let url = serve_one_response(raw_response);
        let response = tauri::async_runtime::block_on(send_request(request(
            url,
            "GET",
            RequestBodyType::None,
        )))
        .expect("send binary response request");

        assert!(response.body.is_empty());
        assert_eq!(response.body_base64.as_deref(), Some("iVBORw0KGgo="));
        assert_eq!(response.body_size, PNG_PREFIX.len());
    }

    #[test]
    fn sends_head_and_options_requests() {
        for method in ["HEAD", "OPTIONS"] {
            let (url, received) = capture_one_request();
            tauri::async_runtime::block_on(send_request(request(
                url,
                method,
                RequestBodyType::None,
            )))
            .expect("send supported method");
            assert!(received
                .recv()
                .expect("captured request")
                .starts_with(&format!("{method} / HTTP/1.1")));
        }
    }

    #[test]
    fn request_setting_can_disable_redirect_following() {
        let url = serve_one_response(
            b"HTTP/1.1 302 Found\r\nLocation: http://127.0.0.1:9/final\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".to_vec(),
        );
        let mut configured = request(url, "GET", RequestBodyType::None);
        configured.settings = RequestHttpSettings {
            follow_redirects: Some(false),
            ..Default::default()
        };

        let response = tauri::async_runtime::block_on(send_request(configured))
            .expect("return redirect response without following it");

        assert_eq!(response.status, 302);
    }

    #[test]
    fn encodes_urlencoded_and_binary_bodies() {
        let (url, received) = capture_one_request();
        let mut form_request = request(url, "POST", RequestBodyType::XWwwFormUrlencoded);
        form_request.form_fields = vec![BodyField {
            key: "name".into(),
            value: "Dispatch".into(),
        }];
        tauri::async_runtime::block_on(send_request(form_request)).expect("send form request");
        let form_message = received.recv().expect("captured form request");
        assert!(form_message.contains("content-type: application/x-www-form-urlencoded"));
        assert!(form_message.ends_with("name=Mini+Postman"));

        let (url, received) = capture_one_request();
        let mut binary_request = request(url, "POST", RequestBodyType::Binary);
        binary_request.binary = Some(BinaryBody {
            name: "sample.bin".into(),
            mime_type: "application/octet-stream".into(),
            data_base64: "AQID".into(),
        });
        tauri::async_runtime::block_on(send_request(binary_request)).expect("send binary request");
        let binary_message = received.recv().expect("captured binary request");
        assert!(binary_message.contains("content-type: application/octet-stream"));
        assert!(binary_message.ends_with("\u{1}\u{2}\u{3}"));
    }

    #[test]
    fn sends_json_text_xml_and_multipart_bodies() {
        for (body_type, content_type, body) in [
            (RequestBodyType::Json, "application/json", "{\"ok\":true}"),
            (
                RequestBodyType::Text,
                "text/plain; charset=utf-8",
                "plain text",
            ),
            (
                RequestBodyType::Html,
                "text/html; charset=utf-8",
                "<p>ok</p>",
            ),
            (RequestBodyType::Xml, "application/xml", "<ok>true</ok>"),
        ] {
            let (url, received) = capture_one_request();
            let mut typed_request = request(url, "POST", body_type);
            typed_request.body = body.into();
            tauri::async_runtime::block_on(send_request(typed_request))
                .expect("send typed body request");
            let message = received.recv().expect("captured typed body request");
            assert!(message.contains(&format!("content-type: {content_type}")));
            assert!(message.ends_with(body));
        }

        let (url, received) = capture_one_request();
        let mut multipart_request = request(url, "POST", RequestBodyType::FormData);
        multipart_request.form_fields = vec![BodyField {
            key: "title".into(),
            value: "Dispatch".into(),
        }];
        tauri::async_runtime::block_on(send_request(multipart_request))
            .expect("send multipart request");
        let multipart_message = received.recv().expect("captured multipart request");
        assert!(multipart_message.contains("content-type: multipart/form-data; boundary="));
        assert!(multipart_message.contains("name=\"title\""));
        assert!(multipart_message.contains("Dispatch"));
    }
}
