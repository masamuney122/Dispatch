import type { RequestTemplate } from "../types/request";
import { resolveRequestVariablesCore } from "@platform/requestPreparationService";

export class VariableResolutionError extends Error {
  readonly variableNames: string[];

  constructor(variableNames: string[]) {
    const names = [...new Set(variableNames)].sort();
    super(
      `Missing environment variable${
        names.length === 1 ? "" : "s"
      }: ${names.join(
        ", "
      )}. Select an environment or define a value before sending the request.`
    );
    this.name = "VariableResolutionError";
    this.variableNames = names;
  }
}

/**
 * Resolves every request field from one immutable template using the same
 * replacement mechanism. The original request remains untouched.
 */
export const resolveRequestVariables = async (
  template: RequestTemplate,
  variables: Record<string, string>
): Promise<RequestTemplate> => {
  const result = await resolveRequestVariablesCore(template.request, variables);
  if (result.unresolved.length > 0) throw new VariableResolutionError(result.unresolved);
  return { request: result.request, queryParams: template.queryParams };
};
