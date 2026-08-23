import { useState } from "react";
import type { AuthConfig } from "../../types/auth";
import type { OAuth2GrantType } from "../../types/auth";
import { getAuthorizationCodeToken, sendRequest } from "../../services/api";
import type { ApiRequest } from "../../types/request";

type AuthType = AuthConfig["type"];

interface AuthEditorProps {
  auth: AuthConfig;
  onChange: (auth: AuthConfig) => void;
}

const inputClass =
  "bg-[#242424] border border-[#383838] rounded font-mono text-zinc-200 focus:outline-none focus:border-zinc-500";
const labelClass = "text-zinc-400 font-semibold";
const oauthRowClass = "grid grid-cols-[180px_minmax(0,1fr)] items-center gap-x-6";
const oauthInputClass = `w-full px-4 ${inputClass}`;
const oauthSelectClass =
  "w-full rounded border border-[#383838] bg-[#242424] px-4 font-medium text-zinc-200 focus:outline-none cursor-pointer";
const oauthControlStyle = {
  height: "30px",
  paddingLeft: "16px",
  paddingRight: "16px",
} as const;

export const AuthEditor: React.FC<AuthEditorProps> = ({ auth, onChange }) => {
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
      if (auth.grant_type === "authorization_code") {
        const authorizationUrl = auth.authorization_url || auth.access_token_url.replace(/\/token(?:\?.*)?$/, "/authorize");
        const token = await getAuthorizationCodeToken({
          authorizationUrl,
          accessTokenUrl: auth.access_token_url,
          clientId: auth.client_id,
          clientSecret: auth.client_secret,
          scope: auth.scope,
          redirectUri: auth.redirect_uri || "http://127.0.0.1:8765/callback",
          clientAuthentication: auth.client_authentication || "header",
        });
        onChange({ ...auth, authorization_url: authorizationUrl, access_token: token });
        return;
      }

      const form_fields: { key: string; value: string }[] = [];
      form_fields.push({ key: "grant_type", value: auth.grant_type });
      if (auth.scope) form_fields.push({ key: "scope", value: auth.scope });

      if (auth.grant_type === "password") {
        form_fields.push({ key: "username", value: auth.username });
        form_fields.push({ key: "password", value: auth.password });
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/x-www-form-urlencoded",
      };

      if (auth.client_authentication === "body") {
        form_fields.push({ key: "client_id", value: auth.client_id });
        if (auth.client_secret) form_fields.push({ key: "client_secret", value: auth.client_secret });
      } else {
        const credentials = btoa(`${auth.client_id}:${auth.client_secret}`);
        headers["Authorization"] = `Basic ${credentials}`;
      }

      const request: ApiRequest = {
        method: "POST",
        url: auth.access_token_url,
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
            <input
              type="text"
              value={auth.token || ""}
              onChange={(e) => onChange({ ...auth, token: e.target.value })}
              placeholder="e.g. eyJhbGciOi..."
              className={oauthInputClass}
              style={oauthControlStyle}
            />
          </div>
        )}

        {auth.type === "Basic" && (
          <div className="flex flex-col" style={{ gap: '12px' }}>
            <div className={oauthRowClass}>
              <label className={labelClass}>Username</label>
              <input
                type="text"
                value={auth.username || ""}
                onChange={(e) => onChange({ ...auth, username: e.target.value })}
                placeholder="Username"
                className={oauthInputClass}
                style={oauthControlStyle}
              />
            </div>
            <div className={oauthRowClass}>
              <label className={labelClass}>Password</label>
              <input
                type="password"
                value={auth.password || ""}
                onChange={(e) => onChange({ ...auth, password: e.target.value })}
                placeholder="Password"
                className={oauthInputClass}
                style={oauthControlStyle}
              />
            </div>
          </div>
        )}

        {auth.type === "ApiKey" && (
          <div className="flex flex-col" style={{ gap: '12px' }}>
            <div className={oauthRowClass}>
              <label className={labelClass}>Key</label>
              <input
                type="text"
                value={auth.key || ""}
                onChange={(e) => onChange({ ...auth, key: e.target.value })}
                placeholder="e.g. X-API-Key"
                className={oauthInputClass}
                style={oauthControlStyle}
              />
            </div>
            <div className={oauthRowClass}>
              <label className={labelClass}>Value</label>
              <input
                type="text"
                value={auth.value || ""}
                onChange={(e) => onChange({ ...auth, value: e.target.value })}
                placeholder="e.g. 12345abcdef"
                className={oauthInputClass}
                style={oauthControlStyle}
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
              <input
                type="text"
                value={auth.access_token_url}
                onChange={(e) => onChange({ ...auth, access_token_url: e.target.value })}
                placeholder="https://auth.example.com/oauth/token"
                className={oauthInputClass}
                style={oauthControlStyle}
              />
            </div>

            {auth.grant_type === "authorization_code" && (
              <>
                <div className={oauthRowClass}>
                  <label className={labelClass}>Authorization URL</label>
                  <input
                    type="text"
                    value={auth.authorization_url || ""}
                    onChange={(e) => onChange({ ...auth, authorization_url: e.target.value })}
                    placeholder="http://127.0.0.1:8080/oauth/authorize"
                    className={oauthInputClass}
                    style={oauthControlStyle}
                  />
                </div>
                <div className={oauthRowClass}>
                  <label className={labelClass}>Redirect URI</label>
                  <input
                    type="text"
                    value={auth.redirect_uri || "http://127.0.0.1:8765/callback"}
                    onChange={(e) => onChange({ ...auth, redirect_uri: e.target.value })}
                    className={oauthInputClass}
                    style={oauthControlStyle}
                  />
                </div>
              </>
            )}

            {/* Client ID */}
            <div className={oauthRowClass}>
              <label className={labelClass}>Client ID</label>
              <input
                type="text"
                value={auth.client_id}
                onChange={(e) => onChange({ ...auth, client_id: e.target.value })}
                placeholder="your-client-id"
                className={oauthInputClass}
                style={oauthControlStyle}
              />
            </div>

            {/* Client Secret */}
            <div className={oauthRowClass}>
              <label className={labelClass}>Client Secret</label>
              <input
                type="password"
                value={auth.client_secret}
                onChange={(e) => onChange({ ...auth, client_secret: e.target.value })}
                placeholder="your-client-secret"
                className={oauthInputClass}
                style={oauthControlStyle}
              />
            </div>

            {/* Scope */}
            <div className={oauthRowClass}>
              <label className={labelClass}>Scope</label>
              <input
                type="text"
                value={auth.scope}
                onChange={(e) => onChange({ ...auth, scope: e.target.value })}
                placeholder="e.g. read write"
                className={oauthInputClass}
                style={oauthControlStyle}
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
                  <input
                    type="text"
                    value={auth.username}
                    onChange={(e) => onChange({ ...auth, username: e.target.value })}
                    placeholder="Resource owner username"
                    className={oauthInputClass}
                    style={oauthControlStyle}
                  />
                </div>
                <div className={oauthRowClass}>
                  <label className={labelClass}>Password</label>
                  <input
                    type="password"
                    value={auth.password}
                    onChange={(e) => onChange({ ...auth, password: e.target.value })}
                    placeholder="Resource owner password"
                    className={oauthInputClass}
                    style={oauthControlStyle}
                  />
                </div>
              </>
            )}

            {/* Divider */}
            <div className="border-t border-[#2e2e2e]" />

            {/* Access Token Display + Get Token Button */}
            <div className={oauthRowClass}>
              <label className={labelClass}>Access Token</label>
              <input
                type="text"
                value={auth.access_token}
                onChange={(e) => onChange({ ...auth, access_token: e.target.value })}
                placeholder="Paste or fetch token..."
                className={oauthInputClass}
                style={oauthControlStyle}
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
