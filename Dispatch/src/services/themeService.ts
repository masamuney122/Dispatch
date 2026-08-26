export type AppTheme = "dark" | "light";

const THEME_STORAGE_KEY = "dispatch.theme";

const isTheme = (value: string | null): value is AppTheme =>
  value === "dark" || value === "light";

export function getStoredTheme(): AppTheme {
  try {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(storedTheme) ? storedTheme : "dark";
  } catch {
    return "dark";
  }
}

export function applyTheme(theme: AppTheme): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // The selected theme still applies for the current session when storage is unavailable.
  }
}

export function initializeTheme(): AppTheme {
  const theme = getStoredTheme();
  applyTheme(theme);
  return theme;
}
