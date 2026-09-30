import { useCallback, useState } from "react";
import type { ConsoleEvent } from "../types/console";

const DEFAULT_CONSOLE_HISTORY_LIMIT = 1_000;

export function applyConsoleEvents(
  current: ConsoleEvent[],
  incoming: ConsoleEvent[],
  limit = DEFAULT_CONSOLE_HISTORY_LIMIT,
): ConsoleEvent[] {
  let next = current;
  incoming.forEach((event) => {
    if (event.type === "script" && event.payload.operation === "clear") {
      next = [];
      return;
    }
    next = [...next, event];
  });
  return next.length > limit ? next.slice(next.length - limit) : next;
}

export function useConsoleStore(limit = DEFAULT_CONSOLE_HISTORY_LIMIT) {
  const [events, setEvents] = useState<ConsoleEvent[]>([]);

  const append = useCallback(
    (incoming: ConsoleEvent[]) => {
      if (incoming.length === 0) return;
      setEvents((current) => applyConsoleEvents(current, incoming, limit));
    },
    [limit],
  );

  const clear = useCallback(() => setEvents([]), []);

  return { events, append, clear, limit };
}
