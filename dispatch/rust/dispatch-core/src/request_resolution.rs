use std::collections::{BTreeSet, HashMap};

use serde::{Deserialize, Serialize};

use crate::{ApiRequest, AuthConfig, BodyField, resolve_template};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RequestResolution {
    pub request: ApiRequest,
    pub unresolved: Vec<String>,
}

/// Resolves request templates without mutating the saved request.
///
/// Resolution is deliberately single-pass: a variable value containing another
/// `{{token}}` is not expanded again. All request-bearing text fields use the
/// same rules on desktop and web.
pub fn resolve_request_variables(
    request: &ApiRequest,
    variables: &HashMap<String, String>,
) -> RequestResolution {
    let mut unresolved = BTreeSet::new();
    let mut resolved = request.clone();

    resolved.url = resolve(&request.url, variables, &mut unresolved);
    resolved.body = resolve(&request.body, variables, &mut unresolved);
    resolved.form_fields = request
        .form_fields
        .iter()
        .map(|field| BodyField {
            key: resolve(&field.key, variables, &mut unresolved),
            value: resolve(&field.value, variables, &mut unresolved),
        })
        .collect();
    resolved.headers = request
        .headers
        .iter()
        .map(|(key, value)| {
            (
                resolve(key, variables, &mut unresolved),
                resolve(value, variables, &mut unresolved),
            )
        })
        .collect();
    resolved.auth = request
        .auth
        .as_ref()
        .map(|auth| resolve_auth(auth, variables, &mut unresolved));

    RequestResolution {
        request: resolved,
        unresolved: unresolved.into_iter().collect(),
    }
}

fn resolve(
    input: &str,
    variables: &HashMap<String, String>,
    unresolved: &mut BTreeSet<String>,
) -> String {
    let result = resolve_template(input, variables);
    unresolved.extend(result.unresolved);
    result.value
}

fn resolve_auth(
    auth: &AuthConfig,
    variables: &HashMap<String, String>,
    unresolved: &mut BTreeSet<String>,
) -> AuthConfig {
    match auth {
        AuthConfig::None => AuthConfig::None,
        AuthConfig::Bearer { token } => AuthConfig::Bearer {
            token: resolve(token, variables, unresolved),
        },
        AuthConfig::Basic { username, password } => AuthConfig::Basic {
            username: resolve(username, variables, unresolved),
            password: resolve(password, variables, unresolved),
        },
        AuthConfig::ApiKey { key, value, add_to } => AuthConfig::ApiKey {
            key: resolve(key, variables, unresolved),
            value: resolve(value, variables, unresolved),
            add_to: add_to.clone(),
        },
        AuthConfig::OAuth2 {
            grant_type,
            access_token_url,
            client_id,
            client_secret,
            scope,
            username,
            password,
            access_token,
            client_authentication,
            authorization_url,
            redirect_uri,
        } => AuthConfig::OAuth2 {
            grant_type: grant_type.clone(),
            access_token_url: resolve(access_token_url, variables, unresolved),
            client_id: resolve(client_id, variables, unresolved),
            client_secret: resolve(client_secret, variables, unresolved),
            scope: resolve(scope, variables, unresolved),
            username: resolve(username, variables, unresolved),
            password: resolve(password, variables, unresolved),
            access_token: resolve(access_token, variables, unresolved),
            client_authentication: client_authentication.clone(),
            authorization_url: resolve(authorization_url, variables, unresolved),
            redirect_uri: resolve(redirect_uri, variables, unresolved),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        OAuth2ClientAuthentication, OAuth2GrantType, RequestBodyType, RequestHttpSettings,
        RequestScripts,
    };

    fn request() -> ApiRequest {
        ApiRequest {
            method: "POST".into(),
            url: "{{baseUrl}}/users/{{missing}}".into(),
            body: r#"{"name":"{{ name }}"}"#.into(),
            body_type: RequestBodyType::Json,
            form_fields: vec![BodyField {
                key: "{{fieldName}}".into(),
                value: "{{name}}".into(),
            }],
            binary: None,
            headers: HashMap::from([("X-{{header}}".into(), "{{token}}".into())]),
            auth: Some(AuthConfig::OAuth2 {
                grant_type: OAuth2GrantType::AuthorizationCode,
                access_token_url: "{{baseUrl}}/token".into(),
                client_id: "client".into(),
                client_secret: "{{secret}}".into(),
                scope: "openid".into(),
                username: String::new(),
                password: String::new(),
                access_token: "{{token}}".into(),
                client_authentication: Some(OAuth2ClientAuthentication::Body),
                authorization_url: "{{baseUrl}}/authorize".into(),
                redirect_uri: "{{callback}}".into(),
            }),
            settings: RequestHttpSettings::default(),
            scripts: RequestScripts::default(),
        }
    }

    #[test]
    fn resolves_all_request_text_fields_and_preserves_the_input() {
        let source = request();
        let result = resolve_request_variables(
            &source,
            &HashMap::from([
                ("baseUrl".into(), "https://example.com".into()),
                ("name".into(), "Ada".into()),
                ("fieldName".into(), "displayName".into()),
                ("header".into(), "Token".into()),
                ("token".into(), "abc".into()),
                ("secret".into(), "shh".into()),
                ("callback".into(), "https://app.test/callback".into()),
            ]),
        );

        assert_eq!(result.request.url, "https://example.com/users/{{missing}}");
        assert_eq!(
            result.request.headers.get("X-Token"),
            Some(&"abc".to_string())
        );
        assert_eq!(result.request.form_fields[0].key, "displayName");
        assert_eq!(result.unresolved, vec!["missing"]);
        assert_eq!(source.url, "{{baseUrl}}/users/{{missing}}");
        assert!(matches!(
            result.request.auth,
            Some(AuthConfig::OAuth2 {
                client_authentication: Some(OAuth2ClientAuthentication::Body),
                ..
            })
        ));
    }

    #[test]
    fn resolution_is_single_pass_and_missing_names_are_sorted_once() {
        let mut source = request();
        source.url = "{{z}}/{{a}}/{{z}}/{{ nested }}".into();
        source.body.clear();
        source.form_fields.clear();
        source.headers.clear();
        source.auth = None;
        let result = resolve_request_variables(
            &source,
            &HashMap::from([("nested".into(), "{{secondPass}}".into())]),
        );

        assert_eq!(result.request.url, "{{z}}/{{a}}/{{z}}/{{secondPass}}");
        assert_eq!(result.unresolved, vec!["a", "z"]);
    }

    #[test]
    fn reports_empty_variable_names() {
        let mut source = request();
        source.url = "https://example.com/{{  }}".into();
        source.body.clear();
        source.form_fields.clear();
        source.headers.clear();
        source.auth = None;

        let result = resolve_request_variables(&source, &HashMap::new());

        assert_eq!(result.unresolved, vec!["(empty variable name)"]);
    }
}
