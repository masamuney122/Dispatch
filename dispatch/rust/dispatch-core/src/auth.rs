use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum ApiKeyLocation {
    Header,
    QueryParam,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum OAuth2GrantType {
    ClientCredentials,
    Password,
    AuthorizationCode,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum OAuth2ClientAuthentication {
    Header,
    Body,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
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
        #[serde(default, skip_serializing_if = "Option::is_none")]
        client_authentication: Option<OAuth2ClientAuthentication>,
        #[serde(default)]
        authorization_url: String,
        #[serde(default)]
        redirect_uri: String,
    },
}
