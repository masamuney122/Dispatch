use serde::{Deserialize, Serialize};

/// Where to attach an API Key: as a header or as a query parameter.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ApiKeyLocation {
    Header,
    QueryParam,
}

/// OAuth2 grant type.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OAuth2GrantType {
    ClientCredentials,
    Password,
    AuthorizationCode,
}

/// Authentication configuration for a request.
///
/// Each variant maps to a standard authentication mechanism.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum AuthConfig {
    None,
    Bearer {
        token: String,
    },
    Basic {
        username: String,
        password: String,
    },
    ApiKey {
        key: String,
        value: String,
        add_to: ApiKeyLocation,
    },
    OAuth2 {
        grant_type: OAuth2GrantType,
        access_token_url: String,
        client_id: String,
        client_secret: String,
        scope: String,
        username: String,
        password: String,
        access_token: String,
        #[serde(default)]
        authorization_url: String,
        #[serde(default)]
        redirect_uri: String,
    },
}

impl AuthConfig {
    /// Apply authentication to a reqwest RequestBuilder.
    pub fn apply(self, builder: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        match self {
            AuthConfig::None => builder,
            AuthConfig::Bearer { token } => builder.bearer_auth(token),
            AuthConfig::Basic { username, password } => {
                builder.basic_auth(username, Some(password))
            }
            AuthConfig::ApiKey { key, value, add_to } => match add_to {
                ApiKeyLocation::Header => builder.header(key, value),
                ApiKeyLocation::QueryParam => builder.query(&[(key, value)]),
            },
            AuthConfig::OAuth2 { access_token, .. } => {
                if access_token.is_empty() {
                    builder
                } else {
                    builder.bearer_auth(access_token)
                }
            }
        }
    }
}
