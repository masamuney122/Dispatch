import { useState } from "react";
import type { AuthConfig } from "../../types/auth";
import type { OAuth2GrantType } from "../../types/auth";
import { getAuthorizationCodeToken, sendRequest } from "../../services/api";
import { resolveRequestVariables } from "../../services/environmentVariableResolver";
import type { ApiRequest } from "../../types/request";
import { EnvironmentVariableEditor } from "./EnvironmentUrlEditor";

type AuthType = AuthConfig["type"];

interface AuthEditorProps {
  auth: AuthConfig;
  environmentVariables: Record<string, string>;
  onChange: (auth: AuthConfig) => void;
}

const labelClass = "text-zinc-400 font-semibold";
const oauthRowClass = "grid grid-cols-[180px_minmax(0,1fr)] items-center gap-x-6";
const oauthSelectClass =
  "w-full rounded border border-[#383838] bg-[#242424] px-4 font-medium text-zinc-200 focus:outline-none cursor-pointer";
const oauthControlStyle = {
  height: "30px",
  paddingLeft: "16px",
  paddingRight: "16px",
} as const;

interface AuthVariableFieldProps {
  value: string;
  variables: Record<string, string>;
  label: string;
  placeholder?: string;
  sensitive?: boolean;
  onChange: (value: string) => void;
}

const AuthVariableField: React.FC<AuthVariableFieldProps> = ({
  value,
  variables,
  label,
  placeholder,
  sensitive,
  onChange,
}) => (
  <EnvironmentVariableEditor
    value={value}
    variables={variables}
    onChange={onChange}
    placeholder={placeholder}
    ariaLabel={label}
    variant="control"
    sensitive={sensitive}
  />
);

export const AuthEditor: React.FC<AuthEditorProps> = ({
  auth,
  environmentVariables,
  onChange,
}) => {
  const [tokenLoading, setTokenLoading] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);

  const handleTypeChange = (type: AuthType) => {
    if (type === "None") {
      onChange({ type: "None" });
    } else if (type === "Bearer") {
      onChange({ type: "Bearer", token: "" });
    } else if (type === "Basic") {
      onChange({ type: "Basic", username: "", password: "" });
    } else if (type === "ApiKey") {
      onChange({ type: "ApiKey", key: "", value: "", add_to: "Header" });
    } else if (type === "OAuth2") {
      onChange({
        type: "OAuth2",
        grant_type: "client_credentials",
        access_token_url: "",
        client_id: "",
        client_secret: "",
        scope: "",
        username: "",
        password: "",
        access_token: "",
        client_authentication: "header",
        authorization_url: "",
        redirect_uri: "http://127.0.0.1:8765/callback",
      });
    }
  };

  const handleGetToken = async () => {
    if (auth.type !== "OAuth2") return;
    setTokenLoading(true);
    setTokenError(null);

    try {
      const resolvedTemplate = await resolveRequestVariables(
        {
          request: {
            method: "POST",
            url: auth.access_token_url,
            headers: {},
            body: "",
            body_type: "none",
            form_fields: [],
            auth,
          },
          queryParams: [],
        },
        environmentVariables,
      );
      const resolvedAuth = resolvedTemplate.request.auth;
      if (!resolvedAuth || resolvedAuth.type !== "OAuth2") {
        throw new Error("OAuth settings could not be resolved.");
      }

      if (resolvedAuth.grant_type === "authorization_code") {
        const authorizationUrl = resolvedAuth.authorization_url || resolvedAuth.access_token_url.replace(/\/token(?:\?.*)?$/, "/authorize");
        const token = await getAuthorizationCodeToken({
          authorizationUrl,
          accessTokenUrl: resolvedAuth.access_token_url,
          clientId: resolvedAuth.client_id,
          clientSecret: resolvedAuth.client_secret,
          scope: resolvedAuth.scope,
          redirectUri: resolvedAuth.redirect_uri || "http://127.0.0.1:8765/callback",
          clientAuthentication: resolvedAuth.client_authentication || "header",
        });
        onChange({ ...auth, access_token: token });
        return;
      }

      const form_fields: { key: string; value: string }[] = [];
      form_fields.push({ key: "grant_type", value: resolvedAuth.grant_type });
      if (resolvedAuth.scope) form_fields.push({ key: "scope", value: resolvedAuth.scope });

      if (resolvedAuth.grant_type === "password") {
        form_fields.push({ key: "username", value: resolvedAuth.username });
        form_fields.push({ key: "password", value: resolvedAuth.password });
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/x-www-form-urlencoded",
      };

      if (resolvedAuth.client_authentication === "body") {
        form_fields.push({ key: "client_id", value: resolvedAuth.client_id });
        if (resolvedAuth.client_secret) form_fields.push({ key: "client_secret", value: resolvedAuth.client_secret });
      } else {
        const credentials = btoa(`${resolvedAuth.client_id}:${resolvedAuth.client_secret}`);
        headers["Authorization"] = `Basic ${credentials}`;
      }

      const request: ApiRequest = {
        method: "POST",
        url: resolvedAuth.access_token_url,
        headers,
        body: "",
        body_type: "x-www-form-urlencoded",
        form_fields,
      };

      const response = await sendRequest(request);

      if (response.status < 200 || response.status >= 300) {
        throw new Error(`HTTP ${response.status}: ${response.body}`);
      }

      let data;
      try {
        data = JSON.parse(response.body);
      } catch (e) {
        throw new Error(`Failed to parse response: ${response.body}`, { cause: e });
      }

      const token = data?.access_token;
      if (!token) {
        throw new Error("No access_token in response");
      }

      onChange({ ...auth, access_token: token });
    } catch (err) {
      setTokenError(err instanceof Error ? err.message : String(err));
    } finally {
      setTokenLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 shrink-0 font-sans text-xs">
      <div className="flex items-center justify-between select-none">
        <span className="font-bold text-zinc-300 text-xs tracking-wide">Authorization</span>
      </div>

      <div className="border border-[#383838] rounded-lg bg-[#202020] shadow-sm flex flex-col" style={{ padding: '32px 40px', gap: '12px' }}>
        <div className={oauthRowClass}>
          <label className={labelClass}>Auth Type</label>
          <select
            value={auth.type}
            onChange={(e) => handleTypeChange(e.target.value as AuthType)}
            className={oauthSelectClass}
            style={oauthControlStyle}
          >
            <option value="None">No Auth</option>
            <option value="Bearer">Bearer Token</option>
            <option value="Basic">Basic Auth</option>
            <option value="ApiKey">API Key</option>
            <option value="OAuth2">OAuth 2.0</option>
          </select>
        </div>

        {auth.type === "None" && (
          <div className="py-6 text-center text-zinc-500 font-medium">
            <span>This request does not use any authorization.</span>
          </div>
        )}

        {auth.type === "Bearer" && (
          <div className={oauthRowClass}>
            <label className={labelClass}>Token</label>
            <AuthVariableField
              value={auth.token || ""}
              variables={environmentVariables}
              onChange={(value) => onChange({ ...auth, token: value })}
              placeholder="e.g. eyJhbGciOi..."
              label="Bearer token"
              sensitive
            />
          </div>
        )}

        {auth.type === "Basic" && (
          <div className="flex flex-col" style={{ gap: '12px' }}>
            <div className={oauthRowClass}>
              <label className={labelClass}>Username</label>
              <AuthVariableField
                value={auth.username || ""}
                variables={environmentVariables}
                onChange={(value) => onChange({ ...auth, username: value })}
                placeholder="Username"
                label="Basic auth username"
              />
            </div>
            <div className={oauthRowClass}>
              <label className={labelClass}>Password</label>
              <AuthVariableField
                value={auth.password || ""}
                variables={environmentVariables}
                onChange={(value) => onChange({ ...auth, password: value })}
                placeholder="Password"
                label="Basic auth password"
                sensitive
              />
            </div>
          </div>
        )}

        {auth.type === "ApiKey" && (
          <div className="flex flex-col" style={{ gap: '12px' }}>
            <div className={oauthRowClass}>
              <label className={labelClass}>Key</label>
              <AuthVariableField
                value={auth.key || ""}
                variables={environmentVariables}
                onChange={(value) => onChange({ ...auth, key: value })}
                placeholder="e.g. X-API-Key"
                label="API key name"
              />
            </div>
            <div className={oauthRowClass}>
              <label className={labelClass}>Value</label>
              <AuthVariableField
                value={auth.value || ""}
                variables={environmentVariables}
                onChange={(value) => onChange({ ...auth, value })}
                placeholder="e.g. 12345abcdef"
                label="API key value"
                sensitive
              />
            </div>
            <div className={oauthRowClass}>
              <label className={labelClass}>Add To</label>
              <select
                value={auth.add_to || "Header"}
                onChange={(e) => onChange({ ...auth, add_to: e.target.value as "Header" | "QueryParam" })}
                className={oauthSelectClass}
                style={oauthControlStyle}
              >
                <option value="Header">Header</option>
                <option value="QueryParam">Query Params</option>
              </select>
            </div>
          </div>
        )}

        {auth.type === "OAuth2" && (
          <div className="flex flex-col" style={{ gap: '12px' }}>
            {/* Grant Type */}
            <div className={oauthRowClass}>
              <label className={labelClass}>Grant Type</label>
              <select
                value={auth.grant_type}
                onChange={(e) =>
                  onChange({ ...auth, grant_type: e.target.value as OAuth2GrantType })
                }
                className={oauthSelectClass}
                style={oauthControlStyle}
              >
                <option value="client_credentials">Client Credentials</option>
                <option value="password">Password Credentials</option>
                <option value="authorization_code">Authorization Code</option>
              </select>
            </div>

            {/* Access Token URL */}
            <div className={oauthRowClass}>
              <label className={labelClass}>Token URL</label>
              <AuthVariableField
                value={auth.access_token_url}
                variables={environmentVariables}
                onChange={(value) => onChange({ ...auth, access_token_url: value })}
                placeholder="https://auth.example.com/oauth/token"
                label="OAuth token URL"
              />
            </div>

            {auth.grant_type === "authorization_code" && (
              <>
                <div className={oauthRowClass}>
                  <label className={labelClass}>Authorization URL</label>
                  <AuthVariableField
                    value={auth.authorization_url || ""}
                    variables={environmentVariables}
                    onChange={(value) => onChange({ ...auth, authorization_url: value })}
                    placeholder="http://127.0.0.1:8080/oauth/authorize"
                    label="OAuth authorization URL"
                  />
                </div>
                <div className={oauthRowClass}>
                  <label className={labelClass}>Redirect URI</label>
                  <AuthVariableField
                    value={auth.redirect_uri || "http://127.0.0.1:8765/callback"}
                    variables={environmentVariables}
                    onChange={(value) => onChange({ ...auth, redirect_uri: value })}
                    label="OAuth redirect URI"
                  />
                </div>
              </>
            )}

            {/* Client ID */}
            <div className={oauthRowClass}>
              <label className={labelClass}>Client ID</label>
              <AuthVariableField
                value={auth.client_id}
                variables={environmentVariables}
                onChange={(value) => onChange({ ...auth, client_id: value })}
                placeholder="your-client-id"
                label="OAuth client ID"
              />
            </div>

            {/* Client Secret */}
            <div className={oauthRowClass}>
              <label className={labelClass}>Client Secret</label>
              <AuthVariableField
                value={auth.client_secret}
                variables={environmentVariables}
                onChange={(value) => onChange({ ...auth, client_secret: value })}
                placeholder="your-client-secret"
                label="OAuth client secret"
                sensitive
              />
            </div>

            {/* Scope */}
            <div className={oauthRowClass}>
              <label className={labelClass}>Scope</label>
              <AuthVariableField
                value={auth.scope}
                variables={environmentVariables}
                onChange={(value) => onChange({ ...auth, scope: value })}
                placeholder="e.g. read write"
                label="OAuth scope"
              />
            </div>

            {/* Client Authentication */}
            <div className={oauthRowClass}>
              <label className={labelClass}>Client Authentication</label>
              <select
                value={auth.client_authentication || "header"}
                onChange={(e) =>
                  onChange({ ...auth, client_authentication: e.target.value as "header" | "body" })
                }
                className={oauthSelectClass}
                style={oauthControlStyle}
              >
                <option value="header">Send as Basic Auth header</option>
                <option value="body">Send client credentials in body</option>
              </select>
            </div>

            {/* Username / Password (only for password grant) */}
            {auth.grant_type === "password" && (
              <>
                <div className={oauthRowClass}>
                  <label className={labelClass}>Username</label>
                  <AuthVariableField
                    value={auth.username}
                    variables={environmentVariables}
                    onChange={(value) => onChange({ ...auth, username: value })}
                    placeholder="Resource owner username"
                    label="OAuth resource owner username"
                  />
                </div>
                <div className={oauthRowClass}>
                  <label className={labelClass}>Password</label>
                  <AuthVariableField
                    value={auth.password}
                    variables={environmentVariables}
                    onChange={(value) => onChange({ ...auth, password: value })}
                    placeholder="Resource owner password"
                    label="OAuth resource owner password"
                    sensitive
                  />
                </div>
              </>
            )}

            {/* Divider */}
            <div className="border-t border-[#2e2e2e]" />

            {/* Access Token Display + Get Token Button */}
            <div className={oauthRowClass}>
              <label className={labelClass}>Access Token</label>
              <AuthVariableField
                value={auth.access_token}
                variables={environmentVariables}
                onChange={(value) => onChange({ ...auth, access_token: value })}
                placeholder="Paste or fetch token..."
                label="OAuth access token"
                sensitive
              />
            </div>

            <div className={oauthRowClass}>
              <div />
              <div className="flex items-center gap-4">
                <button
                type="button"
                onClick={() => { void handleGetToken(); }}
                disabled={tokenLoading || !auth.access_token_url || !auth.client_id}
                className="rounded-md bg-[#3467d6] hover:bg-[#4076e6] active:bg-[#2958bf] disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold transition-colors flex items-center gap-2"
                style={{ padding: '10px 20px' }}
              >
                {tokenLoading ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span>Fetching...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                    </svg>
                    <span>Get New Access Token</span>
                  </>
                )}
                </button>

                {auth.access_token && !tokenLoading && (
                  <span className="flex items-center gap-1.5 text-emerald-400 text-xs font-medium">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                  Token available
                  </span>
                )}
              </div>
            </div>

            {tokenError && (
              <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded-md text-red-400 text-xs" style={{ padding: '10px 16px' }}>
                <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <span>{tokenError}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
