use crate::models::response::ApiResponse;
use crate::models::workspace::GlobalHttpSettings;
use dispatch_core::{prepare_request, ApiRequest};

use std::sync::Arc;
use std::time::Instant;

use crate::services::cookie_service::ManagedCookieJar;

mod request_builder;
mod response;

use request_builder::{build_client, build_request};
use response::into_api_response;

pub async fn send_request(request: ApiRequest) -> Result<ApiResponse, String> {
    send_request_with_settings(request, &GlobalHttpSettings::default()).await
}

pub async fn send_request_with_settings(
    request: ApiRequest,
    global_settings: &GlobalHttpSettings,
) -> Result<ApiResponse, String> {
    send_request_with_cookie_jar(request, global_settings, None).await
}

pub async fn send_request_with_cookie_jar(
    request: ApiRequest,
    global_settings: &GlobalHttpSettings,
    cookie_jar: Option<Arc<ManagedCookieJar>>,
) -> Result<ApiResponse, String> {
    let prepared = prepare_request(&request, global_settings)?;
    let start = Instant::now();
    let client = build_client(&prepared.settings, cookie_jar)?;
    let builder = build_request(&client, &prepared.request, &prepared.body)?;
    let request = builder.build().map_err(|error| error.to_string())?;
    let request_headers = request
        .headers()
        .iter()
        .map(|(name, value)| {
            (
                name.to_string(),
                value.to_str().unwrap_or("<binary>").to_string(),
            )
        })
        .collect();
    let response = client
        .execute(request)
        .await
        .map_err(|error| error.to_string())?;
    let mut response =
        into_api_response(response, start, prepared.settings.max_response_size_mb).await?;
    response.request_headers = request_headers;
    Ok(response)
}

#[cfg(test)]
mod tests {
    use super::*;
    use dispatch_core::{BinaryBody, BodyField, RequestBodyType, RequestHttpSettings};
    use std::collections::HashMap;
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
            scripts: Default::default(),
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
    fn rejects_response_over_configured_size_limit() {
        let url = serve_one_response(
            b"HTTP/1.1 200 OK\r\nContent-Length: 1048577\r\nConnection: close\r\n\r\n".to_vec(),
        );
        let configured = request(url, "GET", RequestBodyType::None);
        let settings = GlobalHttpSettings {
            max_response_size_mb: 1,
            ..Default::default()
        };

        let error =
            tauri::async_runtime::block_on(send_request_with_settings(configured, &settings))
                .expect_err("reject oversized response");
        assert!(error.contains("configured 1 MB limit"));
    }

    #[test]
    fn stores_redirect_cookies_and_sends_them_to_the_redirect_target() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind redirect server");
        let address = listener.local_addr().expect("read redirect address");
        let (sender, receiver) = mpsc::channel();

        thread::spawn(move || {
            let (mut first, _) = listener.accept().expect("accept first request");
            let mut bytes = [0_u8; 2048];
            let _ = first.read(&mut bytes).expect("read first request");
            first
                .write_all(
                    b"HTTP/1.1 302 Found\r\nLocation: /final\r\nSet-Cookie: session=redirected; Path=/; HttpOnly\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
                )
                .expect("write redirect response");
            drop(first);

            let (mut second, _) = listener.accept().expect("accept redirected request");
            let size = second.read(&mut bytes).expect("read redirected request");
            sender
                .send(String::from_utf8_lossy(&bytes[..size]).into_owned())
                .expect("send redirected request");
            second
                .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok")
                .expect("write final response");
        });

        let jar = Arc::new(ManagedCookieJar::default());
        let response = tauri::async_runtime::block_on(send_request_with_cookie_jar(
            request(
                format!("http://{address}/start"),
                "GET",
                RequestBodyType::None,
            ),
            &GlobalHttpSettings::default(),
            Some(jar.clone()),
        ))
        .expect("follow redirect with cookie jar");

        assert_eq!(response.status, 200);
        assert!(receiver
            .recv()
            .expect("redirected request")
            .to_ascii_lowercase()
            .contains("cookie: session=redirected"));
        assert_eq!(jar.list().expect("list jar")[0].name, "session");
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
        assert!(form_message.ends_with("name=Dispatch"));

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
