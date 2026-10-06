import type { ApiRequest } from "./request";
import type { ApiResponse } from "./response";

export interface RunnerTransport {
  send: (request: ApiRequest) => Promise<ApiResponse>;
  finish: (saveCookies: boolean) => Promise<void>;
}

