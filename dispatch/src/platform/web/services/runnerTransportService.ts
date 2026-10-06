import type { RunnerTransport } from "../../../types/runnerTransport";
import { sendBrowserApiRequest } from "./api";

export async function createRunnerTransport(
  useStoredCookies: boolean,
): Promise<RunnerTransport> {
  return {
    send: (request) => sendBrowserApiRequest(request, useStoredCookies),
    async finish() {
      // Browser cookies are committed by fetch and cannot be rolled back or merged by JavaScript.
    },
  };
}

