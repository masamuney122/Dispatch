import init from "../../wasm/dispatch_web_wasm";

let initialization: Promise<unknown> | undefined;

export function ensureWasmInitialized(): Promise<unknown> {
  initialization ??= init();
  return initialization;
}

export function wasmError(error: unknown, fallback: string): Error {
  return new Error(typeof error === "string" ? error : fallback, { cause: error });
}
