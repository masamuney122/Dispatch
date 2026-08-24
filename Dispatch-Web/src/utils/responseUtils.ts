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

export type ResponseBodyKind = "empty" | "json" | "html" | "xml" | "text" | "image" | "audio" | "video" | "pdf" | "binary";

export const getResponseBodyKind = (
  contentType: string | undefined,
  body: string,
  bodyBase64?: string | null,
): ResponseBodyKind => {
  if (!body && !bodyBase64) return "empty";
  const mime = contentType?.split(";", 1)[0].trim().toLowerCase() || "";
  if (mime.includes("json") || (!mime && prettyJson(body).isJson)) return "json";
  if (mime === "text/html" || mime === "application/xhtml+xml") return "html";
  if (mime.includes("xml")) return "xml";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  if (mime === "application/pdf") return "pdf";
  if (bodyBase64) return "binary";
  return "text";
};

export const responseKindLabel = (kind: ResponseBodyKind): string => ({
  empty: "Body",
  json: "JSON",
  html: "HTML",
  xml: "XML",
  text: "Text",
  image: "Image",
  audio: "Audio",
  video: "Video",
  pdf: "PDF",
  binary: "Binary",
}[kind]);

export const responseDataUrl = (
  contentType: string | undefined,
  body: string,
  bodyBase64?: string | null,
): string | null => {
  const mime = contentType?.split(";", 1)[0].trim() || "application/octet-stream";
  if (bodyBase64) return `data:${mime};base64,${bodyBase64}`;
  if (mime.toLowerCase() === "image/svg+xml" && body) {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(body)}`;
  }
  return null;
};

export const binaryHexPreview = (bodyBase64?: string | null, limit = 512): string => {
  if (!bodyBase64) return "";
  const binary = atob(bodyBase64);
  const length = Math.min(binary.length, limit);
  const rows: string[] = [];
  for (let offset = 0; offset < length; offset += 16) {
    const values = Array.from(binary.slice(offset, Math.min(offset + 16, length)))
      .map((character) => character.charCodeAt(0).toString(16).padStart(2, "0"))
      .join(" ");
    rows.push(`${offset.toString(16).padStart(8, "0")}  ${values}`);
  }
  if (binary.length > limit) rows.push(`… ${binary.length - limit} more bytes`);
  return rows.join("\n");
};

export const getStatusStyle = (status: number): string => {
  if (status >= 200 && status < 300) return "text-emerald-400";
  if (status >= 300 && status < 400) return "text-sky-400";
  if (status >= 400 && status < 500) return "text-amber-400";
  return "text-rose-400";
};
