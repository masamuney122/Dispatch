use serde_json::Value;

use crate::{ApiKeyLocation, AuthConfig, OAuth2GrantType, OpenApiWarning};

use super::{pointer_escape, schema::resolve_local, warning};

pub(super) fn operation_auth(
    spec: &Value,
    operation: &Value,
    warnings: &mut Vec<OpenApiWarning>,
) -> Option<AuthConfig> {
    let Some(security) = operation.get("security").or_else(|| spec.get("security")) else {
        return None;
    };
    let Some(requirement) = security
        .as_array()
        .and_then(|items| items.first())
        .and_then(Value::as_object)
    else {
        return None;
    };
    let Some(scheme_name) = requirement.keys().next() else {
        return None;
    };
    let pointer = format!(
        "/components/securitySchemes/{}",
        pointer_escape(scheme_name)
    );
    let Some(scheme) = spec
        .pointer(&pointer)
        .and_then(|value| resolve_local(spec, value))
    else {
        return None;
    };

    match scheme
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or_default()
    {
        "http" => http_auth(scheme, scheme_name, warnings),
        "apiKey" => api_key_auth(scheme, scheme_name, warnings),
        "oauth2" => oauth_auth(scheme),
        "openIdConnect" => {
            warnings.push(warning(
                "unsupported-openid-connect",
                "OpenID Connect is not imported.",
                Some(scheme_name.clone()),
            ));
            None
        }
        _ => None,
    }
}

fn http_auth(scheme: &Value, name: &str, warnings: &mut Vec<OpenApiWarning>) -> Option<AuthConfig> {
    match scheme
        .get("scheme")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "basic" => Some(AuthConfig::Basic {
            username: String::new(),
            password: String::new(),
        }),
        "bearer" => Some(AuthConfig::Bearer {
            token: String::new(),
        }),
        other => {
            warnings.push(warning(
                "unsupported-http-auth",
                &format!("HTTP authentication scheme '{other}' is not supported."),
                Some(name.to_string()),
            ));
            None
        }
    }
}

fn api_key_auth(
    scheme: &Value,
    name: &str,
    warnings: &mut Vec<OpenApiWarning>,
) -> Option<AuthConfig> {
    let add_to = match scheme.get("in").and_then(Value::as_str) {
        Some("query") => ApiKeyLocation::QueryParam,
        Some("header") => ApiKeyLocation::Header,
        _ => {
            warnings.push(warning(
                "unsupported-api-key-location",
                "Only header and query API keys are supported.",
                Some(name.to_string()),
            ));
            return None;
        }
    };
    Some(AuthConfig::ApiKey {
        key: scheme
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or("X-API-Key")
            .to_string(),
        value: String::new(),
        add_to,
    })
}

fn oauth_auth(scheme: &Value) -> Option<AuthConfig> {
    let Some(flows) = scheme.get("flows").and_then(Value::as_object) else {
        return None;
    };
    let (grant_type, flow) = if let Some(flow) = flows.get("authorizationCode") {
        (OAuth2GrantType::AuthorizationCode, flow)
    } else if let Some(flow) = flows.get("clientCredentials") {
        (OAuth2GrantType::ClientCredentials, flow)
    } else if let Some(flow) = flows.get("password") {
        (OAuth2GrantType::Password, flow)
    } else {
        return None;
    };
    let scope = flow
        .get("scopes")
        .and_then(Value::as_object)
        .map(|items| items.keys().cloned().collect::<Vec<_>>().join(" "))
        .unwrap_or_default();
    Some(AuthConfig::OAuth2 {
        grant_type,
        access_token_url: flow
            .get("tokenUrl")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        client_id: String::new(),
        client_secret: String::new(),
        scope,
        username: String::new(),
        password: String::new(),
        access_token: String::new(),
        client_authentication: None,
        authorization_url: flow
            .get("authorizationUrl")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        redirect_uri: String::new(),
    })
}
