import type { ApiRequest, AuthConfig } from "../types/api";
import { resolveTemplate } from "./wasmClient";

async function resolveAuth(
  auth: AuthConfig | undefined,
  variables: Record<string, string>,
  unresolved: Set<string>,
): Promise<AuthConfig | undefined> {
  if (!auth || auth.type === "None") return auth;
  const resolve = async (value: string) => {
    const result = await resolveTemplate(value, variables);
    result.unresolved.forEach((name) => unresolved.add(name));
    return result.value;
  };
  if (auth.type === "Bearer") return { ...auth, token: await resolve(auth.token) };
  if (auth.type === "Basic") {
    return { ...auth, username: await resolve(auth.username), password: await resolve(auth.password) };
  }
  return { ...auth, key: await resolve(auth.key), value: await resolve(auth.value) };
}

export async function resolveRequestVariables(
  request: ApiRequest,
  variables: Record<string, string>,
): Promise<ApiRequest> {
  const unresolved = new Set<string>();
  const resolve = async (value: string) => {
    const result = await resolveTemplate(value, variables);
    result.unresolved.forEach((name) => unresolved.add(name));
    return result.value;
  };

  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(request.headers)) {
    headers[await resolve(key)] = await resolve(value);
  }
  const result: ApiRequest = {
    ...request,
    url: await resolve(request.url),
    body: await resolve(request.body),
    headers,
    auth: await resolveAuth(request.auth, variables, unresolved),
    form_fields: await Promise.all(
      request.form_fields.map(async (field) => ({ key: await resolve(field.key), value: await resolve(field.value) })),
    ),
  };
  if (unresolved.size > 0) {
    throw new Error(`Eksik environment değişkenleri: ${[...unresolved].sort().join(", ")}`);
  }
  return result;
}

