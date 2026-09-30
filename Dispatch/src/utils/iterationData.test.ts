import { describe, expect, it } from "vitest";
import {
  parseCsvIterationData,
  parseIterationDataFile,
  parseJsonIterationData,
} from "./iterationData";

describe("iteration data parsing", () => {
  it("normalizes JSON values to strings", () => {
    expect(parseJsonIterationData('[{"id":42,"active":true,"name":"Ada"}]')).toEqual([
      { id: "42", active: "true", name: "Ada" },
    ]);
  });

  it("parses quoted CSV fields and escaped quotes", () => {
    expect(
      parseCsvIterationData('id,name,note\r\n1,"Ada, Lovelace","said ""hello"""'),
    ).toEqual([{ id: "1", name: "Ada, Lovelace", note: 'said "hello"' }]);
  });

  it("selects the parser from the file extension", () => {
    expect(parseIterationDataFile("users.csv", "id\n7")).toEqual([{ id: "7" }]);
    expect(parseIterationDataFile("users.json", '[{"id":"8"}]')).toEqual([{ id: "8" }]);
  });
});

