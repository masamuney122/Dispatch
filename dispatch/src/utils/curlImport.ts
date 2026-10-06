import type { AuthConfig } from "../types/auth";
import type {
  BodyField,
  HttpMethod,
  RequestBodyType,
} from "../types/request";
import type { HeaderItem, QueryParamItem } from "../types/tab";

export interface CurlImportResult {
  name: string;
  method: HttpMethod;
  url: string;
  queryParams: QueryParamItem[];
  headers: HeaderItem[];
  body: string;
  bodyType: RequestBodyType;
  formFields: BodyField[];
  auth: AuthConfig;
  warnings: string[];
}

const supportedMethods = new Set<HttpMethod>([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
]);

const valueOptions = new Set([
  "--cacert",
  "--cert",
  "--connect-timeout",
  "--cookie-jar",
  "--key",
  "--max-redirs",
  "--max-time",
  "--output",
  "--proxy",
  "--referer",
  "--retry",
  "--user-agent",
]);

const flagOptions = new Set([
  "--compressed",
  "--fail",
  "--fail-with-body",
  "--insecure",
  "--location",
  "--location-trusted",
  "--no-buffer",
  "--silent",
  "--show-error",
  "--verbose",
  "-k",
  "-L",
  "-s",
  "-S",
  "-v",
]);

function tokenizeCurl(command: string): string[] {
  const tokens: string[] = [];
  let token = "";
  let quote: "single" | "double" | null = null;
  let tokenStarted = false;

  const pushToken = () => {
    if (!tokenStarted) return;
    tokens.push(token);
    token = "";
    tokenStarted = false;
  };

  for (let index = 0; index < command.length; index += 1) {
    const character = command[index];
    const next = command[index + 1];

    if (!quote && (character === "\\" || character === "^" || character === "`")) {
      if (next === "\r" && command[index + 2] === "\n") {
        index += 2;
        continue;
      }
      if (next === "\n") {
        index += 1;
        continue;
      }
      if (next !== undefined) {
        token += next;
        tokenStarted = true;
        index += 1;
        continue;
      }
    }

    if (!quote && character === "$" && next === "'") {
      quote = "single";
      tokenStarted = true;
      index += 1;
      continue;
    }

    if (character === "'" && quote !== "double") {
      quote = quote === "single" ? null : "single";
      tokenStarted = true;
      continue;
    }

    if (character === '"' && quote !== "single") {
      quote = quote === "double" ? null : "double";
      tokenStarted = true;
      continue;
    }

    if (quote === "double" && character === "\\" && next !== undefined) {
      token += next;
      tokenStarted = true;
      index += 1;
      continue;
    }

    if (!quote && /\s/.test(character)) {
      pushToken();
      continue;
    }

    token += character;
    tokenStarted = true;
  }

  if (quote) throw new Error("cURL command contains an unclosed quote.");
  pushToken();
  return tokens;
}

function optionValue(
  tokens: string[],
  index: number,
  option: string,
): { value: string; nextIndex: number } {
  const equalsIndex = option.indexOf("=");
  if (equalsIndex >= 0) {
    return {
      value: option.slice(equalsIndex + 1),
      nextIndex: index,
    };
  }

  const value = tokens[index + 1];
  if (value === undefined) throw new Error(`${option} requires a value.`);
  return { value, nextIndex: index + 1 };
}

function splitHeader(header: string): [string, string] {
  const separator = header.indexOf(":");
  if (separator < 1) throw new Error(`Invalid header: ${header}`);
  return [header.slice(0, separator).trim(), header.slice(separator + 1).trim()];
}

function headerValue(headers: HeaderItem[], name: string): string | undefined {
  return headers.find((header) => header.key.toLowerCase() === name.toLowerCase())
    ?.value;
}

function setHeader(headers: HeaderItem[], key: string, value: string) {
  const existing = headers.findIndex(
    (header) => header.key.toLowerCase() === key.toLowerCase(),
  );
  const header = { key, value, enabled: true };
  if (existing >= 0) headers[existing] = header;
  else headers.push(header);
}

function bodyTypeFor(contentType: string | undefined, body: string): RequestBodyType {
  const normalized = contentType?.toLowerCase() || "";
  if (normalized.includes("json")) return "json";
  if (normalized.includes("xml")) return "xml";
  if (normalized.includes("html")) return "html";
  if (normalized.includes("application/x-www-form-urlencoded")) {
    return "x-www-form-urlencoded";
  }
  if (normalized.startsWith("text/")) return "text";

  try {
    JSON.parse(body);
    return "json";
  } catch {
    return "text";
  }
}

function formFieldsFromEncodedBody(body: string): BodyField[] {
  const fields: BodyField[] = [];
  new URLSearchParams(body).forEach((value, key) => fields.push({ key, value }));
  return fields;
}

function looksLikeEncodedForm(body: string): boolean {
  return (
    body.length > 0 &&
    body.split("&").every((field) => {
      const separator = field.indexOf("=");
      return separator > 0;
    })
  );
}

function importedRequestName(method: HttpMethod, url: string): string {
  try {
    const parsed = new URL(url.replace(/\{\{[^{}]+\}\}/g, "variable"));
    const path = parsed.pathname === "/" ? "" : parsed.pathname;
    return `${method} ${parsed.hostname}${path}`;
  } catch {
    return `${method} Imported request`;
  }
}

export function parseCurlCommand(command: string): CurlImportResult {
  const tokens = tokenizeCurl(command.trim());
  if (tokens.length === 0) throw new Error("Paste a cURL command first.");

  const executable = tokens.shift()?.toLowerCase().replace(/\.exe$/, "");
  if (executable !== "curl") {
    throw new Error("The command must start with curl or curl.exe.");
  }

  let url = "";
  let explicitMethod: string | null = null;
  let head = false;
  let useGet = false;
  let auth: AuthConfig = { type: "None" };
  const headers: HeaderItem[] = [];
  const dataParts: string[] = [];
  const formFields: BodyField[] = [];
  const warnings: string[] = [];
  let jsonBody = false;
  let hasUrlEncodedData = false;
  let usesDefaultDataContentType = false;

  for (let index = 0; index < tokens.length; index += 1) {
    const option = tokens[index];

    if (option === "--") {
      if (!url && tokens[index + 1]) url = tokens[index + 1];
      break;
    }

    if (option === "-X" || option === "--request" || option.startsWith("--request=")) {
      const result = optionValue(tokens, index, option);
      explicitMethod = result.value;
      index = result.nextIndex;
      continue;
    }
    if (option.startsWith("-X") && option.length > 2) {
      explicitMethod = option.slice(2);
      continue;
    }

    if (option === "--url" || option.startsWith("--url=")) {
      const result = optionValue(tokens, index, option);
      url = result.value;
      index = result.nextIndex;
      continue;
    }

    if (option === "-H" || option === "--header" || option.startsWith("--header=")) {
      const result = optionValue(tokens, index, option);
      const [key, value] = splitHeader(result.value);
      setHeader(headers, key, value);
      index = result.nextIndex;
      continue;
    }
    if (option.startsWith("-H") && option.length > 2) {
      const [key, value] = splitHeader(option.slice(2));
      setHeader(headers, key, value);
      continue;
    }

    const isDataOption = ["-d", "--data", "--data-raw", "--data-binary", "--data-ascii", "--data-urlencode"].some(
      (name) => option === name || option.startsWith(`${name}=`),
    );
    if (isDataOption || (option.startsWith("-d") && option.length > 2)) {
      const result = option.startsWith("-d") && option !== "-d"
        ? { value: option.slice(2), nextIndex: index }
        : optionValue(tokens, index, option);
      if (result.value.startsWith("@")) {
        warnings.push(
          `File reference ${result.value} was kept as text because browser imports cannot read cURL file paths.`,
        );
      }
      dataParts.push(result.value);
      if (option.startsWith("--data-urlencode")) hasUrlEncodedData = true;
      if (!option.startsWith("--data-binary")) {
        usesDefaultDataContentType = true;
      }
      index = result.nextIndex;
      continue;
    }

    if (option === "--json" || option.startsWith("--json=")) {
      const result = optionValue(tokens, index, option);
      dataParts.push(result.value);
      jsonBody = true;
      index = result.nextIndex;
      continue;
    }

    if (option === "-F" || option === "--form" || option.startsWith("--form=")) {
      const result = optionValue(tokens, index, option);
      const separator = result.value.indexOf("=");
      if (separator < 1) throw new Error(`Invalid form field: ${result.value}`);
      const key = result.value.slice(0, separator);
      const value = result.value.slice(separator + 1);
      if (value.startsWith("@") || value.startsWith("<")) {
        warnings.push(
          `Form file reference ${value} was kept as text; select the file manually after import.`,
        );
      }
      formFields.push({ key, value });
      index = result.nextIndex;
      continue;
    }

    if (option === "-u" || option === "--user" || option.startsWith("--user=")) {
      const result = optionValue(tokens, index, option);
      const separator = result.value.indexOf(":");
      auth = {
        type: "Basic",
        username: separator >= 0 ? result.value.slice(0, separator) : result.value,
        password: separator >= 0 ? result.value.slice(separator + 1) : "",
      };
      index = result.nextIndex;
      continue;
    }

    if (option === "--oauth2-bearer" || option.startsWith("--oauth2-bearer=")) {
      const result = optionValue(tokens, index, option);
      auth = { type: "Bearer", token: result.value };
      index = result.nextIndex;
      continue;
    }

    if (option === "-A" || option === "--user-agent" || option.startsWith("--user-agent=")) {
      const result = optionValue(tokens, index, option);
      setHeader(headers, "User-Agent", result.value);
      index = result.nextIndex;
      continue;
    }

    if (option === "-b" || option === "--cookie" || option.startsWith("--cookie=")) {
      const result = optionValue(tokens, index, option);
      setHeader(headers, "Cookie", result.value);
      index = result.nextIndex;
      continue;
    }

    if (option === "-I" || option === "--head") {
      head = true;
      continue;
    }
    if (option === "-G" || option === "--get") {
      useGet = true;
      continue;
    }

    const longOptionName = option.split("=", 1)[0];
    if (valueOptions.has(longOptionName)) {
      const result = optionValue(tokens, index, option);
      warnings.push(`${longOptionName} is a transport option and was not imported.`);
      index = result.nextIndex;
      continue;
    }
    if (flagOptions.has(option)) {
      warnings.push(`${option} is a transport option and was not imported.`);
      continue;
    }

    if (option.startsWith("-")) {
      warnings.push(`Unsupported cURL option was ignored: ${option}`);
      continue;
    }

    if (!url) url = option;
    else warnings.push(`Unexpected argument was ignored: ${option}`);
  }

  if (!url) throw new Error("The cURL command does not contain a URL.");

  if (jsonBody) {
    if (!headerValue(headers, "Content-Type")) {
      setHeader(headers, "Content-Type", "application/json");
    }
    if (!headerValue(headers, "Accept")) {
      setHeader(headers, "Accept", "application/json");
    }
  }

  const body = dataParts.join("&");
  if (
    body &&
    usesDefaultDataContentType &&
    !headerValue(headers, "Content-Type")
  ) {
    setHeader(headers, "Content-Type", "application/x-www-form-urlencoded");
  }
  if (useGet && body) {
    url += `${url.includes("?") ? "&" : "?"}${body}`;
  }

  const normalizedMethod = (
    explicitMethod || (head ? "HEAD" : useGet ? "GET" : body || formFields.length ? "POST" : "GET")
  ).toUpperCase();
  if (!supportedMethods.has(normalizedMethod as HttpMethod)) {
    throw new Error(`HTTP method ${normalizedMethod} is not supported by Dispatch.`);
  }
  const method = normalizedMethod as HttpMethod;

  let bodyType: RequestBodyType = "none";
  let importedBody = useGet ? "" : body;
  let importedFormFields = formFields;
  if (formFields.length > 0) {
    bodyType = "form-data";
    importedBody = "";
  } else if (body && !useGet) {
    bodyType = jsonBody
      ? "json"
      : bodyTypeFor(headerValue(headers, "Content-Type"), body);
    if (
      hasUrlEncodedData ||
      (bodyType === "x-www-form-urlencoded" && looksLikeEncodedForm(body))
    ) {
      bodyType = "x-www-form-urlencoded";
      importedFormFields = formFieldsFromEncodedBody(body);
      importedBody = "";
    } else if (bodyType === "x-www-form-urlencoded") {
      bodyType = "text";
    }
  }

  return {
    name: importedRequestName(method, url),
    method,
    url,
    queryParams: [],
    headers,
    body: importedBody,
    bodyType,
    formFields: importedFormFields,
    auth,
    warnings: [...new Set(warnings)],
  };
}
