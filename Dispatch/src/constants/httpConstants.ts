/**
 * Shared HTTP method color classes used across the application.
 * Centralizes the method → Tailwind color mapping so every component
 * renders consistent badge/text colors.
 */

export const METHOD_HEX_COLORS: Record<string, string> = {
  GET: "#78C895",    // Pastel green
  POST: "#EDB458",   // Pastel orange
  PUT: "#68A5E1",    // Pastel blue
  PATCH: "#AF86D6",  // Pastel purple
  DELETE: "#E47777", // Pastel red
  HEAD: "#66C0C0",   // Pastel cyan
  OPTIONS: "#DD8B5C",// Pastel brown/orange
};

const DEFAULT_METHOD_HEX = "#c4c4c4";

/**
 * Returns the exact pastel HEX color for a given HTTP method to bypass Tailwind caching.
 */
export function getMethodHexColor(method: string): string {
  return METHOD_HEX_COLORS[method.toUpperCase()] || DEFAULT_METHOD_HEX;
}
