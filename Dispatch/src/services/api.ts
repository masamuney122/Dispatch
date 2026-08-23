import { invoke } from "@tauri-apps/api/core";
import type { ApiRequest } from "../types/request";
import type { ApiResponse } from "../types/response";

export async function sendRequest(
    request: ApiRequest
): Promise<ApiResponse> {

    return await invoke<ApiResponse>(
        "send_request",
        { request }
    );

}

export interface AuthorizationCodeRequest {
    authorizationUrl: string;
    accessTokenUrl: string;
    clientId: string;
    clientSecret: string;
    scope: string;
    redirectUri: string;
    clientAuthentication: "header" | "body";
}

export async function getAuthorizationCodeToken(
    request: AuthorizationCodeRequest
): Promise<string> {
    return await invoke<string>("get_authorization_code_token", { request });
}
