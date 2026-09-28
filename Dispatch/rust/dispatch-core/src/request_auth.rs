use base64::{Engine, engine::general_purpose::STANDARD};

use crate::{ApiKeyLocation, ApiRequest, AuthConfig};

/// Applies authentication to a cloned request, leaving the saved request intact.
/// Network clients only need to translate the resulting URL and headers.
pub fn apply_request_auth(request: &ApiRequest) -> Result<ApiRequest, String> {
    let mut prepared = request.clone();
    let Some(auth) = request.auth.as_ref() else {
        return Ok(prepared);
    };

    match auth {
        AuthConfig::None => {}
        AuthConfig::Bearer { token } => {
            prepared
                .headers
                .insert("Authorization".into(), format!("Bearer {token}"));
        }
        AuthConfig::Basic { username, password } => {
            let credentials = STANDARD.encode(format!("{username}:{password}"));
            prepared
                .headers
                .insert("Authorization".into(), format!("Basic {credentials}"));
        }
        AuthConfig::ApiKey {
            key,
            value,
            add_to: ApiKeyLocation::Header,
        } => {
            prepared.headers.insert(key.clone(), value.clone());
        }
        AuthConfig::ApiKey {
            key,
            value,
            add_to: ApiKeyLocation::QueryParam,
        } => {
            let mut url = url::Url::parse(&prepared.url)
                .map_err(|error| format!("API key URL'i geçersiz: {error}"))?;
            let existing = url
                .query_pairs()
                .filter(|(name, _)| name != key)
                .map(|(name, value)| (name.into_owned(), value.into_owned()))
                .collect::<Vec<_>>();
            url.set_query(None);
            url.query_pairs_mut()
                .extend_pairs(existing)
                .append_pair(key, value);
            prepared.url = url.into();
        }
        AuthConfig::OAuth2 { access_token, .. } if !access_token.is_empty() => {
            prepared
                .headers
                .insert("Authorization".into(), format!("Bearer {access_token}"));
        }
        AuthConfig::OAuth2 { .. } => {}
    }

    Ok(prepared)
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use super::*;
    use crate::{RequestBodyType, RequestHttpSettings, RequestScripts};

    fn request(auth: AuthConfig) -> ApiRequest {
        ApiRequest {
            method: "GET".into(),
            url: "https://example.com/users?existing=1".into(),
            body: String::new(),
            body_type: RequestBodyType::None,
            form_fields: Vec::new(),
            binary: None,
            headers: HashMap::from([("Authorization".into(), "old".into())]),
            auth: Some(auth),
            settings: RequestHttpSettings::default(),
            scripts: RequestScripts::default(),
        }
    }

    #[test]
    fn auth_overrides_an_existing_authorization_header_without_mutating_source() {
        let source = request(AuthConfig::Basic {
            username: "ada".into(),
            password: "secret".into(),
        });
        let prepared = apply_request_auth(&source).unwrap();

        assert_eq!(
            prepared.headers.get("Authorization").map(String::as_str),
            Some("Basic YWRhOnNlY3JldA==")
        );
        assert_eq!(
            source.headers.get("Authorization").map(String::as_str),
            Some("old")
        );
    }

    #[test]
    fn api_key_query_preserves_existing_parameters() {
        let mut source = request(AuthConfig::ApiKey {
            key: "api_key".into(),
            value: "a b".into(),
            add_to: ApiKeyLocation::QueryParam,
        });
        source.url.push_str("&api_key=old");
        let prepared = apply_request_auth(&source).unwrap();

        assert_eq!(
            prepared.url,
            "https://example.com/users?existing=1&api_key=a+b"
        );
    }
}
