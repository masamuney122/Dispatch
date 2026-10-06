import type { AuthConfig } from "./auth";

export interface HistoryItem {
    id: string;
    method: string;
    url: string;
    body: string;
    status: number | null;
    response_time_ms: number | null;
    timestamp: string;
    error: string | null;
    auth?: AuthConfig;
}
