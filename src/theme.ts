import { useCallback, useEffect, useState } from "react";

export type Theme = "dark" | "light";

export const THEME_KEY = "warera.theme";

export function isTheme(value: unknown): value is Theme {
  return value === "dark" || value === "light";
}

/** Anything other than a theme we know — no entry, a stale value — reads as the default. */
export function parseTheme(value: unknown): Theme {
  return isTheme(value) ? value : "dark";
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() =>
    typeof document === "undefined" ? "dark" : parseTheme(document.documentElement.dataset.theme),
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // A blocked localStorage costs the preference across reloads, not the toggle.
    }
  }, [theme]);

  const toggle = useCallback(() => setTheme(current => (current === "dark" ? "light" : "dark")), []);

  return { theme, toggle };
}
