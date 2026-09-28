use serde_json::Value;

pub const MAX_OPENAPI_SIZE: usize = 10 * 1024 * 1024;

pub fn parse_openapi(content: &str) -> Result<Value, String> {
    if content.len() > MAX_OPENAPI_SIZE {
        return Err("OpenAPI içeriği 10 MB sınırını aşıyor".to_string());
    }
    if content.trim().is_empty() {
        return Err("OpenAPI içeriği boş olamaz".to_string());
    }
    let spec: Value = if content.trim_start().starts_with('{') {
        serde_json::from_str(content).map_err(|error| format!("Geçersiz OpenAPI JSON: {error}"))?
    } else {
        serde_norway::from_str(content)
            .map_err(|error| format!("Geçersiz OpenAPI YAML: {error}"))?
    };
    let version = spec
        .get("openapi")
        .and_then(Value::as_str)
        .ok_or_else(|| "Dosyada OpenAPI versiyonu bulunamadı".to_string())?;
    if !version.starts_with("3.0.") && !version.starts_with("3.1.") {
        return Err(format!(
            "Desteklenmeyen OpenAPI versiyonu {version}. Dispatch Web, OpenAPI 3.0.x ve 3.1.x destekliyor"
        ));
    }
    if !spec.get("paths").is_some_and(Value::is_object) {
        return Err("OpenAPI belgesinde geçerli bir paths alanı bulunamadı".to_string());
    }
    Ok(spec)
}

pub fn serialize_openapi_yaml(spec: &Value) -> Result<String, String> {
    serde_norway::to_string(spec)
        .map(|mut yaml| {
            if !yaml.ends_with('\n') {
                yaml.push('\n');
            }
            yaml
        })
        .map_err(|error| format!("OpenAPI YAML oluşturulamadı: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_openapi_yaml_and_json() {
        let yaml =
            parse_openapi("openapi: 3.1.0\ninfo:\n  title: Demo\n  version: 1.0.0\npaths: {}\n")
                .unwrap();
        assert_eq!(yaml["info"]["title"], "Demo");

        let json = parse_openapi(
            r#"{"openapi":"3.0.3","info":{"title":"JSON","version":"1"},"paths":{}}"#,
        )
        .unwrap();
        assert_eq!(json["openapi"], "3.0.3");
        assert!(
            serialize_openapi_yaml(&json)
                .unwrap()
                .contains("openapi: 3.0.3")
        );
    }
}
