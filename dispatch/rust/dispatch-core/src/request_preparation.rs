use base64::{Engine, engine::general_purpose::STANDARD};
use serde::{Deserialize, Serialize};

use crate::{
    ApiRequest, BodyField, GlobalHttpSettings, RequestBodyType, apply_request_auth,
    resolve_http_settings,
};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum PreparedBody {
    None,
    Text { value: String },
    FormData { fields: Vec<BodyField> },
    UrlEncoded { value: String },
    Binary { data_base64: String },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PreparedRequest {
    pub request: ApiRequest,
    pub body: PreparedBody,
    pub settings: GlobalHttpSettings,
}

/// Converts a resolved request into a platform-neutral transport plan.
/// Runtime-specific clients remain responsible for FormData/multipart and byte objects.
pub fn prepare_request(
    request: &ApiRequest,
    global_settings: &GlobalHttpSettings,
) -> Result<PreparedRequest, String> {
    let mut prepared = apply_request_auth(request)?;
    let body = if matches!(
        prepared.method.to_ascii_uppercase().as_str(),
        "GET" | "HEAD"
    ) {
        PreparedBody::None
    } else {
        prepare_body(&mut prepared)?
    };
    Ok(PreparedRequest {
        settings: resolve_http_settings(global_settings, &prepared.settings),
        request: prepared,
        body,
    })
}

fn prepare_body(request: &mut ApiRequest) -> Result<PreparedBody, String> {
    match request.body_type {
        RequestBodyType::None => Ok(PreparedBody::None),
        RequestBodyType::Json => text_body(request, "application/json"),
        RequestBodyType::Text => text_body(request, "text/plain; charset=utf-8"),
        RequestBodyType::Html => text_body(request, "text/html; charset=utf-8"),
        RequestBodyType::Xml => text_body(request, "application/xml"),
        RequestBodyType::FormData => {
            remove_header(request, "content-type");
            Ok(PreparedBody::FormData {
                fields: non_empty_fields(request),
            })
        }
        RequestBodyType::XWwwFormUrlencoded => {
            set_default_content_type(request, "application/x-www-form-urlencoded");
            let fields = non_empty_fields(request);
            let value = url::form_urlencoded::Serializer::new(String::new())
                .extend_pairs(
                    fields
                        .iter()
                        .map(|field| (field.key.as_str(), field.value.as_str())),
                )
                .finish();
            Ok(PreparedBody::UrlEncoded { value })
        }
        RequestBodyType::Binary => {
            let binary = request
                .binary
                .clone()
                .ok_or("Choose a binary file before sending the request.")?;
            STANDARD
                .decode(&binary.data_base64)
                .map_err(|error| format!("Invalid binary payload: {error}"))?;
            let mime_type = if binary.mime_type.trim().is_empty() {
                "application/octet-stream"
            } else {
                binary.mime_type.as_str()
            };
            set_default_content_type(request, mime_type);
            Ok(PreparedBody::Binary {
                data_base64: binary.data_base64,
            })
        }
    }
}

fn text_body(request: &mut ApiRequest, content_type: &str) -> Result<PreparedBody, String> {
    set_default_content_type(request, content_type);
    Ok(PreparedBody::Text {
        value: request.body.clone(),
    })
}

fn non_empty_fields(request: &ApiRequest) -> Vec<BodyField> {
    request
        .form_fields
        .iter()
        .filter(|field| !field.key.trim().is_empty())
        .cloned()
        .collect()
}

fn set_default_content_type(request: &mut ApiRequest, value: &str) {
    if !request
        .headers
        .keys()
        .any(|key| key.eq_ignore_ascii_case("content-type"))
    {
        request.headers.insert("Content-Type".into(), value.into());
    }
}

fn remove_header(request: &mut ApiRequest, name: &str) {
    request
        .headers
        .retain(|key, _| !key.eq_ignore_ascii_case(name));
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{AuthConfig, BinaryBody, RequestHttpSettings, RequestScripts};
    use std::collections::HashMap;

    fn request(body_type: RequestBodyType) -> ApiRequest {
        ApiRequest {
            method: "POST".into(),
            url: "https://example.com".into(),
            body: "payload".into(),
            body_type,
            form_fields: vec![
                BodyField {
                    key: String::new(),
                    value: "ignored".into(),
                },
                BodyField {
                    key: "name".into(),
                    value: "Ada Lovelace".into(),
                },
            ],
            binary: None,
            headers: HashMap::new(),
            auth: Some(AuthConfig::Bearer {
                token: "token".into(),
            }),
            settings: RequestHttpSettings::default(),
            scripts: RequestScripts::default(),
        }
    }

    #[test]
    fn prepares_auth_content_type_and_urlencoded_body_together() {
        let prepared = prepare_request(
            &request(RequestBodyType::XWwwFormUrlencoded),
            &Default::default(),
        )
        .unwrap();
        assert_eq!(
            prepared
                .request
                .headers
                .get("Authorization")
                .map(String::as_str),
            Some("Bearer token")
        );
        assert_eq!(
            prepared
                .request
                .headers
                .get("Content-Type")
                .map(String::as_str),
            Some("application/x-www-form-urlencoded")
        );
        assert_eq!(
            prepared.body,
            PreparedBody::UrlEncoded {
                value: "name=Ada+Lovelace".into()
            }
        );
    }

    #[test]
    fn multipart_removes_manual_content_type_and_empty_fields() {
        let mut source = request(RequestBodyType::FormData);
        source.headers.insert(
            "content-TYPE".into(),
            "multipart/form-data; boundary=wrong".into(),
        );
        let prepared = prepare_request(&source, &Default::default()).unwrap();
        assert!(
            !prepared
                .request
                .headers
                .keys()
                .any(|key| key.eq_ignore_ascii_case("content-type"))
        );
        assert!(
            matches!(prepared.body, PreparedBody::FormData { ref fields } if fields.len() == 1)
        );
    }

    #[test]
    fn binary_requires_valid_data_and_uses_octet_stream_fallback() {
        let mut source = request(RequestBodyType::Binary);
        source.binary = Some(BinaryBody {
            name: "file.bin".into(),
            mime_type: String::new(),
            data_base64: "AAEC".into(),
        });
        let prepared = prepare_request(&source, &Default::default()).unwrap();
        assert_eq!(
            prepared
                .request
                .headers
                .get("Content-Type")
                .map(String::as_str),
            Some("application/octet-stream")
        );
        source.binary.as_mut().unwrap().data_base64 = "%%%".into();
        assert!(
            prepare_request(&source, &Default::default())
                .unwrap_err()
                .contains("Invalid binary payload")
        );
    }

    #[test]
    fn get_and_head_requests_have_no_transport_body() {
        let mut source = request(RequestBodyType::Json);
        source.method = "GET".into();
        let prepared = prepare_request(&source, &Default::default()).unwrap();
        assert_eq!(prepared.body, PreparedBody::None);
        assert!(!prepared.request.headers.contains_key("Content-Type"));
    }
}
