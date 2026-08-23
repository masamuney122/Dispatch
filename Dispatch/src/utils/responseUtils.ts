/** Shared utilities for the response panel. */

export const STATUS_TEXT: Record<number, string> = {
  200: "OK", 201: "Created", 202: "Accepted", 204: "No Content",
  301: "Moved Permanently", 302: "Found", 304: "Not Modified",
  400: "Bad Request", 401: "Unauthorized", 403: "Forbidden",
  404: "Not Found", 405: "Method Not Allowed", 500: "Internal Server Error",
  502: "Bad Gateway", 503: "Service Unavailable",
};

export const formatSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const getHeader = (headers: Record<string, string>, name: string): string | undefined =>
  Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1];

export const prettyJson = (body: string): { value: string; isJson: boolean } => {
  try {
    return { value: JSON.stringify(JSON.parse(body), null, 4), isJson: true };
  } catch {
    return { value: body, isJson: false };
  }
};

export const getStatusStyle = (status: number): string => {
  if (status >= 200 && status < 300) return "text-emerald-400";
  if (status >= 300 && status < 400) return "text-sky-400";
  if (status >= 400 && status < 500) return "text-amber-400";
  return "text-rose-400";
};
