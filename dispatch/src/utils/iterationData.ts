function stringifyRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Iteration data rows must be JSON objects.");
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      item == null
        ? ""
        : typeof item === "string"
          ? item
          : JSON.stringify(item),
    ]),
  );
}

export function parseJsonIterationData(source: string): Array<Record<string, string>> {
  const parsed: unknown = JSON.parse(source);
  if (!Array.isArray(parsed)) {
    throw new Error("Iteration JSON must contain an array of objects.");
  }
  return parsed.map(stringifyRecord);
}

function parseCsvRows(source: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"') {
      if (quoted && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error("Iteration CSV contains an unterminated quoted value.");
  row.push(field);
  if (row.some((value) => value.length > 0)) rows.push(row);
  return rows;
}

export function parseCsvIterationData(source: string): Array<Record<string, string>> {
  const rows = parseCsvRows(source);
  if (rows.length === 0) return [];
  const headers = rows[0].map((header) => header.trim());
  if (headers.some((header) => !header)) {
    throw new Error("Iteration CSV headers cannot be empty.");
  }
  return rows.slice(1).map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])),
  );
}

export function parseIterationDataFile(
  fileName: string,
  source: string,
): Array<Record<string, string>> {
  return fileName.toLowerCase().endsWith(".csv")
    ? parseCsvIterationData(source)
    : parseJsonIterationData(source);
}

