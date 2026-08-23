use std::collections::HashMap;

use crate::models::auth::AuthConfig;
use crate::models::request::ApiRequest;

/// Resolve `{{variableName}}` patterns in a template string.
///
/// - Known variables are replaced with their values.
/// - Unknown variables are left as-is (e.g., `{{unknown}}` stays in the output).
/// - Single-pass: no recursive replacement, no regex dependency.
pub fn resolve_template(template: &str, variables: &HashMap<String, String>) -> String {
    if variables.is_empty() || !template.contains("{{") {
        return template.to_string();
    }

    let mut result = String::with_capacity(template.len());
    let bytes = template.as_bytes();
    let len = bytes.len();
    let mut i = 0;

    while i < len {
        if i + 1 < len && bytes[i] == b'{' && bytes[i + 1] == b'{' {
            // Found opening `{{`
            let start = i;
            i += 2; // skip `{{`

            // Scan for closing `}}`
            let var_start = i;
            let mut found_closing = false;

            while i + 1 < len {
                if bytes[i] == b'}' && bytes[i + 1] == b'}' {
                    found_closing = true;
                    break;
                }
                i += 1;
            }

            if found_closing {
                let var_name = &template[var_start..i];
                let trimmed = var_name.trim();
                i += 2; // skip `}}`

                match variables.get(trimmed) {
                    Some(value) => result.push_str(value),
                    None => {
                        // Leave unresolved — push back original `{{varName}}`
                        result.push_str(&template[start..i]);
                    }
                }
            } else {
                // Unclosed `{{` — push everything from `{{` to end as-is
                result.push_str(&template[start..]);
                break;
            }
        } else {
            result.push(bytes[i] as char);
            i += 1;
        }
    }

    result
}

/// Resolve all `{{variable}}` patterns in an ApiRequest's fields.
///
/// Resolves: url, body, header values, and auth credential fields.
/// Header keys are NOT resolved (header names should be literal).
pub fn resolve_request(request: &mut ApiRequest, variables: &HashMap<String, String>) {
    if variables.is_empty() {
        return;
    }

    request.url = resolve_template(&request.url, variables);
    request.body = resolve_template(&request.body, variables);
    request.form_fields = request
        .form_fields
        .iter()
        .map(|field| crate::models::request::BodyField {
            key: resolve_template(&field.key, variables),
            value: resolve_template(&field.value, variables),
        })
        .collect();

    // Resolve header values (not keys — header names should be literal)
    request.headers = request
        .headers
        .iter()
        .map(|(k, v)| (k.clone(), resolve_template(v, variables)))
        .collect();

    // Resolve auth credential fields
    if let Some(ref mut auth) = request.auth {
        resolve_auth(auth, variables);
    }
}

/// Resolve variables inside auth configuration fields.
fn resolve_auth(auth: &mut AuthConfig, variables: &HashMap<String, String>) {
    match auth {
        AuthConfig::None => {}
        AuthConfig::Bearer { token } => {
            *token = resolve_template(token, variables);
        }
        AuthConfig::Basic { username, password } => {
            *username = resolve_template(username, variables);
            *password = resolve_template(password, variables);
        }
        AuthConfig::ApiKey { key, value, .. } => {
            *key = resolve_template(key, variables);
            *value = resolve_template(value, variables);
        }
        AuthConfig::OAuth2 {
            access_token_url,
            client_id,
            client_secret,
            scope,
            username,
            password,
            access_token,
            ..
        } => {
            *access_token_url = resolve_template(access_token_url, variables);
            *client_id = resolve_template(client_id, variables);
            *client_secret = resolve_template(client_secret, variables);
            *scope = resolve_template(scope, variables);
            *username = resolve_template(username, variables);
            *password = resolve_template(password, variables);
            *access_token = resolve_template(access_token, variables);
        }
    }
}
