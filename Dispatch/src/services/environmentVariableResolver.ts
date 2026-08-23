import type { AuthConfig } from "../types/auth";
import type { ApiRequest } from "../types/request";
import type { QueryParamItem } from "../types/tab";

interface RequestTemplate {
  request: ApiRequest;
  queryParams: QueryParamItem[];
}

export class VariableResolutionError extends Error {
  readonly variableNames: string[];

  constructor(variableNames: string[]) {
    const names = [...new Set(variableNames)].sort();
    super(
      `Missing environment variable${
        names.length === 1 ? "" : "s"
      }: ${names.join(
        ", "
      )}. Select an environment or define a value before sending the request.`
    );
    this.name = "VariableResolutionError";
    this.variableNames = names;
  }
}

const resolveValue = (
  template: string,
  variables: Record<string, string>,
  missing: Set<string>
) =>
  template.replace(/{{\s*([^{}]*?)\s*}}/g, (match, capturedName: string) => {
    const name = capturedName.trim();
    if (!name || !Object.hasOwn(variables, name)) {
      missing.add(name || "(empty variable name)");
      return match;
    }
    return variables[name];
  });

const resolveAuth = (
  auth: AuthConfig | undefined,
  variables: Record<string, string>,
  missing: Set<string>
): AuthConfig | undefined => {
  if (!auth || auth.type === "None") return auth;
  if (auth.type === "Bearer") {
    return {
      ...auth,
      token: resolveValue(auth.token || "", variables, missing),
    };
  }
  if (auth.type === "Basic") {
    return {
      ...auth,
      username: resolveValue(auth.username || "", variables, missing),
      password: resolveValue(auth.password || "", variables, missing),
    };
  }
  if (auth.type === "ApiKey") {
    return {
      ...auth,
      key: resolveValue(auth.key || "", variables, missing),
      value: resolveValue(auth.value || "", variables, missing),
    };
  }
  if (auth.type === "OAuth2") {
    return {
      ...auth,
      access_token_url: resolveValue(auth.access_token_url || "", variables, missing),
      client_id: resolveValue(auth.client_id || "", variables, missing),
      client_secret: resolveValue(auth.client_secret || "", variables, missing),
      scope: resolveValue(auth.scope || "", variables, missing),
      username: resolveValue(auth.username || "", variables, missing),
      password: resolveValue(auth.password || "", variables, missing),
      access_token: resolveValue(auth.access_token || "", variables, missing),
    };
  }
  return auth;
};

/**
 * Resolves every request field from one immutable template using the same
 * replacement mechanism. The original request remains untouched.
 */
export const resolveRequestVariables = (
  template: RequestTemplate,
  variables: Record<string, string>
): RequestTemplate => {
  const missing = new Set<string>();
  const headers = Object.fromEntries(
    Object.entries(template.request.headers).map(([key, value]) => [
      resolveValue(key, variables, missing),
      resolveValue(value, variables, missing),
    ])
  );

  const resolved: RequestTemplate = {
    request: {
      ...template.request,
      url: resolveValue(template.request.url, variables, missing),
      body: resolveValue(template.request.body, variables, missing),
      headers,
      auth: resolveAuth(template.request.auth, variables, missing),
      form_fields: template.request.form_fields.map((field) => ({
        key: resolveValue(field.key, variables, missing),
        value: resolveValue(field.value, variables, missing),
      })),
      binary: template.request.binary
        ? { ...template.request.binary }
        : undefined,
    },
    queryParams: template.queryParams.map((parameter) => ({
      key: resolveValue(parameter.key, variables, missing),
      value: resolveValue(parameter.value, variables, missing),
    })),
  };

  if (missing.size > 0) {
    throw new VariableResolutionError([...missing]);
  }
  return resolved;
};
