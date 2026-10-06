import { apply_environment_mutation } from "../../wasm/dispatch_web_wasm";
import type { Environment } from "../../../../types/environment";
import { ensureWasmInitialized, wasmError } from "./wasmRuntime";

export interface CoreEnvironmentMutationResult {
  environments: Environment[];
  active_environment_id: string | null;
  environment: Environment | null;
}

export async function applyEnvironmentMutationCore(
  environments: Environment[],
  activeEnvironmentId: string | null,
  mutation: Record<string, unknown>,
  context: { timestamp: string; entity_id: string; workspace_id: string },
): Promise<CoreEnvironmentMutationResult> {
  await ensureWasmInitialized();
  try {
    return apply_environment_mutation(
      environments,
      activeEnvironmentId ?? undefined,
      mutation,
      context,
    ) as CoreEnvironmentMutationResult;
  } catch (error) {
    throw wasmError(error, "The environment operation could not be applied");
  }
}
