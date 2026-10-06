import { invoke } from "@tauri-apps/api/core";
import {
  deleteCookie,
  loadCookieManager,
  saveCookie,
} from "../../../services/cookieService";
import type { StoredCookie } from "../../../types/cookie";
import type { ApiResponse } from "../../../types/response";
import type { RunnerTransport } from "../../../types/runnerTransport";

interface RunnerRequestResponse {
  response: ApiResponse;
  cookies: StoredCookie[];
}

const cookieId = (cookie: StoredCookie) =>
  `${cookie.domain.toLowerCase()}\n${cookie.path}\n${cookie.name}`;

export async function createRunnerTransport(
  useStoredCookies: boolean,
): Promise<RunnerTransport> {
  const initial = useStoredCookies
    ? (await loadCookieManager()).cookies
    : [];
  let cookies = structuredClone(initial);

  return {
    async send(request) {
      const result = await invoke<RunnerRequestResponse>("send_runner_request", {
        request,
        cookies,
      });
      cookies = result.cookies;
      return result.response;
    },
    async finish(saveCookies) {
      if (!saveCookies) return;
      const currentIds = new Set(cookies.map(cookieId));
      for (const cookie of initial) {
        if (!currentIds.has(cookieId(cookie))) {
          await deleteCookie({
            domain: cookie.domain,
            path: cookie.path,
            name: cookie.name,
          });
        }
      }
      for (const cookie of cookies) await saveCookie(cookie);
    },
  };
}
