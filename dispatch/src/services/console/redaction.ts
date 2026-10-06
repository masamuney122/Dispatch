import type { AuthConfig } from "../../types/auth";
import type { ApiRequest } from "../../types/request";
import type { ApiResponse } from "../../types/response";
import type { ScriptConsoleValue } from "../../types/script";

const REDACTED = "<redacted>";
const OMITTED_BINARY = "<binary data omitted>";
const SENSITIVE_NAME = /(^|[-_])(authorization|proxy-authorization|cookie|set-cookie|api[-_]?key|token|access[-_]?token|refresh[-_]?token|secret|client[-_]?secret|password|passwd|session|signature|sig)($|[-_])/i;

const secretValuesFromAuth = (auth?: AuthConfig): string[] => {
  if (!auth || auth.type === "None") return [];
  if (auth.type === "Bearer") return [auth.token];
  if (auth.type === "Basic") return [auth.password];
  if (auth.type === "ApiKey") return [auth.value];
  return [auth.client_secret, auth.password, auth.access_token];
};

const normalizeSecrets = (values: string[]) =>
  [...new Set(values.map((value) => value.trim()).filter((value) => value.length >= 4))]
    .sort((left, right) => right.length - left.length);

export function knownSecretsForRequest(
  request: ApiRequest,
  additional: string[] = [],
): string[] {
  const headerSecrets = Object.entries(request.headers)
    .filter(([name]) => SENSITIVE_NAME.test(name))
    .map(([, value]) => value);
  return normalizeSecrets([
    ...additional,
    ...secretValuesFromAuth(request.auth),
    ...headerSecrets,
  ]);
}

export function redactText(value: string, secrets: string[]): string {
  const knownSecretsRedacted = normalizeSecrets(secrets).reduce(
    (current, secret) => current.split(secret).join(REDACTED),
    value,
  );
  return knownSecretsRedacted
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, `Bearer ${REDACTED}`)
    .replace(/\bBasic\s+[A-Za-z0-9+/=]+/gi, `Basic ${REDACTED}`)
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, REDACTED);
}

function redactStructuredValue(value: unknown, secrets: string[]): unknown {
  if (typeof value === "string") return redactText(value, secrets);
  if (Array.isArray(value)) {
    return value.map((item) => redactStructuredValue(item, secrets));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        SENSITIVE_NAME.test(key)
          ? REDACTED
          : redactStructuredValue(item, secrets),
      ]),
    );
  }
  return value;
}

function redactBody(body: string, secrets: string[]): string {
  if (!body) return body;
  try {
    return JSON.stringify(redactStructuredValue(JSON.parse(body), secrets), null, 2);
  } catch {
    return redactText(body, secrets);
  }
}

function redactUrl(rawUrl: string, secrets: string[]): string {
  try {
    const url = new URL(rawUrl);
    for (const [key] of url.searchParams) {
      if (SENSITIVE_NAME.test(key)) url.searchParams.set(key, REDACTED);
    }
    return redactText(url.toString(), secrets);
  } catch {
    return redactText(rawUrl, secrets);
  }
}

function redactHeaders(
  headers: Record<string, string>,
  secrets: string[],
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [
      name,
      SENSITIVE_NAME.test(name) ? REDACTED : redactText(value, secrets),
    ]),
  );
}

function redactAuth(auth: AuthConfig | undefined): AuthConfig | undefined {
  if (!auth || auth.type === "None") return auth;
  if (auth.type === "Bearer") return { ...auth, token: REDACTED };
  if (auth.type === "Basic") return { ...auth, password: REDACTED };
  if (auth.type === "ApiKey") return { ...auth, value: REDACTED };
  return {
    ...auth,
    client_secret: auth.client_secret ? REDACTED : "",
    password: auth.password ? REDACTED : "",
    access_token: auth.access_token ? REDACTED : "",
  };
}

export function redactRequest(
  request: ApiRequest,
  additionalSecrets: string[] = [],
): ApiRequest {
  const secrets = knownSecretsForRequest(request, additionalSecrets);
  return {
    ...structuredClone(request),
    url: redactUrl(request.url, secrets),
    headers: redactHeaders(request.headers, secrets),
    body: redactBody(request.body, secrets),
    form_fields: request.form_fields.map((field) => ({
      key: field.key,
      value: SENSITIVE_NAME.test(field.key)
        ? REDACTED
        : redactText(field.value, secrets),
    })),
    binary: request.binary
      ? { ...request.binary, data_base64: OMITTED_BINARY }
      : undefined,
    auth: redactAuth(request.auth),
  };
}

export function redactResponse(
  response: ApiResponse,
  secrets: string[],
): ApiResponse {
  const cookieSecrets = (response.cookies || []).map((cookie) => cookie.value);
  const allSecrets = normalizeSecrets([...secrets, ...cookieSecrets]);
  return {
    ...structuredClone(response),
    headers: redactHeaders(response.headers, allSecrets),
    request_headers: response.request_headers
      ? redactHeaders(response.request_headers, allSecrets)
      : undefined,
    body: redactBody(response.body, allSecrets),
    body_base64: response.body_base64 ? OMITTED_BINARY : response.body_base64,
    cookies: response.cookies?.map((cookie) => ({
      ...cookie,
      value: REDACTED,
    })),
  };
}

function redactConsoleValue(
  value: ScriptConsoleValue,
  secrets: string[],
  key?: string,
): ScriptConsoleValue {
  if (key && SENSITIVE_NAME.test(key)) {
    return { kind: "string", value: REDACTED };
  }
  if (value.kind === "string") {
    return { ...value, value: redactText(value.value, secrets) };
  }
  if (value.kind === "array") {
    return {
      ...value,
      items: value.items.map((item) => redactConsoleValue(item, secrets)),
    };
  }
  if (value.kind === "object") {
    return {
      ...value,
      entries: value.entries.map((entry) => ({
        key: entry.key,
        value: redactConsoleValue(entry.value, secrets, entry.key),
      })),
    };
  }
  return value;
}

export const redactConsoleValues = (
  values: ScriptConsoleValue[],
  secrets: string[],
) => values.map((value) => redactConsoleValue(value, secrets));

export const isSensitiveName = (name: string) => SENSITIVE_NAME.test(name);
