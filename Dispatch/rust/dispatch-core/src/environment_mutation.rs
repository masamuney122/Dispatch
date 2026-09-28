use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::Environment;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct EnvironmentMutationContext {
    pub timestamp: String,
    #[serde(default)]
    pub entity_id: String,
    pub workspace_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "action", rename_all = "snake_case")]
pub enum EnvironmentMutation {
    Create {
        name: String,
        variables: HashMap<String, String>,
    },
    Update {
        id: String,
        name: String,
        variables: HashMap<String, String>,
    },
    Delete {
        id: String,
    },
    SetActive {
        id: Option<String>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct EnvironmentMutationResult {
    pub environments: Vec<Environment>,
    pub active_environment_id: Option<String>,
    pub environment: Option<Environment>,
}

pub fn apply_environment_mutation(
    environments: &[Environment],
    active_environment_id: Option<&str>,
    mutation: EnvironmentMutation,
    context: &EnvironmentMutationContext,
) -> Result<EnvironmentMutationResult, String> {
    validate_context(context)?;
    let mut environments = environments.to_vec();
    let mut active = active_environment_id.map(str::to_string);
    let environment = match mutation {
        EnvironmentMutation::Create { name, variables } => {
            let id = required_entity_id(context)?;
            if environments.iter().any(|item| item.id == id) {
                return Err(format!("Environment id already exists: {id}"));
            }
            let environment = Environment {
                id: id.to_string(),
                name: environment_name(&name)?.to_string(),
                variables: normalize_variables(variables)?,
                workspace_id: Some(context.workspace_id.clone()),
                created_at: context.timestamp.clone(),
                updated_at: context.timestamp.clone(),
            };
            environments.push(environment.clone());
            Some(environment)
        }
        EnvironmentMutation::Update {
            id,
            name,
            variables,
        } => {
            let environment = environments
                .iter_mut()
                .find(|item| item.id == id)
                .ok_or_else(|| format!("Environment not found: {id}"))?;
            environment.name = environment_name(&name)?.to_string();
            environment.variables = normalize_variables(variables)?;
            environment.workspace_id = Some(context.workspace_id.clone());
            environment.updated_at = context.timestamp.clone();
            Some(environment.clone())
        }
        EnvironmentMutation::Delete { id } => {
            let before = environments.len();
            environments.retain(|item| item.id != id);
            if environments.len() == before {
                return Err(format!("Environment not found: {id}"));
            }
            if active.as_deref() == Some(id.as_str()) {
                active = None;
            }
            None
        }
        EnvironmentMutation::SetActive { id } => {
            if let Some(id) = &id
                && !environments.iter().any(|item| &item.id == id)
            {
                return Err(format!("Environment not found: {id}"));
            }
            active = id;
            None
        }
    };

    Ok(EnvironmentMutationResult {
        environments,
        active_environment_id: active,
        environment,
    })
}

pub fn merge_variable_scopes(scopes: &[HashMap<String, String>]) -> HashMap<String, String> {
    let mut merged = HashMap::new();
    for scope in scopes {
        merged.extend(scope.clone());
    }
    merged
}

fn validate_context(context: &EnvironmentMutationContext) -> Result<(), String> {
    if context.timestamp.trim().is_empty() {
        return Err("Environment mutation timestamp cannot be empty".to_string());
    }
    if context.workspace_id.trim().is_empty() {
        return Err("Environment mutation workspace id cannot be empty".to_string());
    }
    Ok(())
}

fn required_entity_id(context: &EnvironmentMutationContext) -> Result<&str, String> {
    let id = context.entity_id.trim();
    if id.is_empty() {
        Err("Environment mutation entity id cannot be empty".to_string())
    } else {
        Ok(id)
    }
}

fn environment_name(name: &str) -> Result<&str, String> {
    let name = name.trim();
    if name.is_empty() {
        Err("Environment name cannot be empty.".to_string())
    } else {
        Ok(name)
    }
}

fn normalize_variables(
    variables: HashMap<String, String>,
) -> Result<HashMap<String, String>, String> {
    let mut normalized = HashMap::with_capacity(variables.len());
    for (raw_name, value) in variables {
        let name = raw_name.trim();
        if name.is_empty() {
            return Err("Environment variable name cannot be empty.".to_string());
        }
        if normalized.insert(name.to_string(), value).is_some() {
            return Err(format!("Duplicate environment variable: {name}"));
        }
    }
    Ok(normalized)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn context(id: &str) -> EnvironmentMutationContext {
        EnvironmentMutationContext {
            timestamp: "2026-01-01T00:00:00Z".into(),
            entity_id: id.into(),
            workspace_id: "workspace-1".into(),
        }
    }

    #[test]
    fn creates_trimmed_workspace_environment() {
        let result = apply_environment_mutation(
            &[],
            None,
            EnvironmentMutation::Create {
                name: "  Local  ".into(),
                variables: HashMap::from([(" baseUrl ".into(), "http://localhost".into())]),
            },
            &context("environment-1"),
        )
        .unwrap();
        let environment = result.environment.unwrap();
        assert_eq!(environment.name, "Local");
        assert_eq!(environment.workspace_id.as_deref(), Some("workspace-1"));
        assert_eq!(environment.variables["baseUrl"], "http://localhost");
    }

    #[test]
    fn deleting_the_active_environment_clears_selection() {
        let environment = Environment {
            id: "environment-1".into(),
            name: "Local".into(),
            variables: HashMap::new(),
            workspace_id: Some("workspace-1".into()),
            created_at: String::new(),
            updated_at: String::new(),
        };
        let result = apply_environment_mutation(
            &[environment],
            Some("environment-1"),
            EnvironmentMutation::Delete {
                id: "environment-1".into(),
            },
            &context(""),
        )
        .unwrap();
        assert!(result.active_environment_id.is_none());
        assert!(result.environments.is_empty());
    }

    #[test]
    fn validates_active_environment_and_variable_names() {
        let error = apply_environment_mutation(
            &[],
            None,
            EnvironmentMutation::SetActive {
                id: Some("missing".into()),
            },
            &context(""),
        )
        .unwrap_err();
        assert!(error.contains("not found"));

        let error = apply_environment_mutation(
            &[],
            None,
            EnvironmentMutation::Create {
                name: "Local".into(),
                variables: HashMap::from([(" ".into(), "value".into())]),
            },
            &context("environment-1"),
        )
        .unwrap_err();
        assert!(error.contains("cannot be empty"));
    }

    #[test]
    fn later_variable_scopes_override_earlier_values() {
        let merged = merge_variable_scopes(&[
            HashMap::from([
                ("host".into(), "default".into()),
                ("token".into(), "old".into()),
            ]),
            HashMap::from([("token".into(), "active".into())]),
        ]);
        assert_eq!(merged["host"], "default");
        assert_eq!(merged["token"], "active");
    }
}
