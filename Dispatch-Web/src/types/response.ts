export interface ApiResponse {
    status: number;
    response_time_ms: number;
    body: string;
    headers: Record<string, string>;
}