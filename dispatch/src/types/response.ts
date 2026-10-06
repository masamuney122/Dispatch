import type { StoredCookie } from "./cookie";

export interface ResponseNetworkInfo {
    transport: "desktop" | "browser";
    http_version?: string | null;
    remote_address?: string | null;
}

export interface ApiResponse {
    status: number;
    response_time_ms: number;
    body: string;
    body_base64?: string | null;
    body_size?: number;
    headers: Record<string, string>;
    request_headers?: Record<string, string>;
    network?: ResponseNetworkInfo;
    cookies?: StoredCookie[];
    cookie_handling?: "workspace" | "browser";
}
