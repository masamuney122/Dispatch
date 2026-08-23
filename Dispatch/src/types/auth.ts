export type OAuth2GrantType = "client_credentials" | "password" | "authorization_code";

export type AuthConfig =
    | { type: "None" }
    | { type: "Bearer"; token: string }
    | { type: "Basic"; username: string; password: string }
    | { type: "ApiKey"; key: string; value: string; add_to: "Header" | "QueryParam" }
    | {
        type: "OAuth2";
        grant_type: OAuth2GrantType;
        access_token_url: string;
        client_id: string;
        client_secret: string;
        scope: string;
        username: string;
        password: string;
        access_token: string;
        client_authentication?: "header" | "body";
        authorization_url?: string;
        redirect_uri?: string;
      };
