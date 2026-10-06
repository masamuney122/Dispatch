use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ResponseBodyKind {
    Empty,
    Text,
    Binary,
}

pub fn classify_response_body(
    content_type: Option<&str>,
    is_utf8: bool,
    is_empty: bool,
) -> ResponseBodyKind {
    if is_empty {
        return ResponseBodyKind::Empty;
    }
    if content_type.is_some_and(is_textual_content_type) || (content_type.is_none() && is_utf8) {
        ResponseBodyKind::Text
    } else {
        ResponseBodyKind::Binary
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_structured_text_and_binary_media() {
        assert_eq!(
            classify_response_body(
                Some("application/problem+json; charset=utf-8"),
                false,
                false
            ),
            ResponseBodyKind::Text
        );
        assert_eq!(
            classify_response_body(Some("image/png"), true, false),
            ResponseBodyKind::Binary
        );
    }

    #[test]
    fn uses_utf8_only_when_content_type_is_missing() {
        assert_eq!(
            classify_response_body(None, true, false),
            ResponseBodyKind::Text
        );
        assert_eq!(
            classify_response_body(None, false, false),
            ResponseBodyKind::Binary
        );
        assert_eq!(
            classify_response_body(Some("application/octet-stream"), true, false),
            ResponseBodyKind::Binary
        );
    }

    #[test]
    fn empty_payload_wins_over_content_type() {
        assert_eq!(
            classify_response_body(Some("application/json"), true, true),
            ResponseBodyKind::Empty
        );
    }
}
