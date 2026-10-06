import { apply_collection_mutation } from "../../wasm/dispatch_web_wasm";
import type { Collection } from "../../../../types/collection";
import { ensureWasmInitialized, wasmError } from "./wasmRuntime";

export interface CoreMutationContext {
  timestamp: string;
  entity_id: string;
  id_prefix: string;
}

export interface CoreCollectionMutationResult {
  collections: Collection[];
  entity: unknown | null;
}

export async function applyCollectionMutationCore(
  collections: Collection[],
  mutation: Record<string, unknown>,
  context: CoreMutationContext,
): Promise<CoreCollectionMutationResult> {
  await ensureWasmInitialized();
  try {
    return apply_collection_mutation(collections, mutation, context) as CoreCollectionMutationResult;
  } catch (error) {
    throw wasmError(error, "The collection operation could not be applied");
  }
}
