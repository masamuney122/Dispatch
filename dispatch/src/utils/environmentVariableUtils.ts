import type { EnvironmentVariableDraft } from "../components/environment/EnvironmentVariableRow";

export const getDuplicateVariableNames = (
  variables: EnvironmentVariableDraft[]
) => {
  const counts = new Map<string, number>();
  variables.forEach((variable) => {
    const key = variable.key.trim();
    if (key) counts.set(key, (counts.get(key) || 0) + 1);
  });
  return new Set(
    [...counts.entries()]
      .filter(([, count]) => count > 1)
      .map(([key]) => key)
  );
};
