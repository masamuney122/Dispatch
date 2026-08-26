import type { StoredCookie } from "./cookie";

export interface ApiResponse {
    status: number;
    response_time_ms: number;
    body: string;
    body_base64?: string | null;
    body_size?: number;
    headers: Record<string, string>;
    cookies?: StoredCookie[];
    cookie_handling?: "workspace" | "browser";
}
