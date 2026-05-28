"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

type Theme = "light" | "dark" | "system";

type ThemeContextType = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: "light" | "dark";
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "system";
  return (localStorage.getItem("navara-theme") as Theme) ?? "system";
}

function resolveTheme(theme: Theme): "light" | "dark" {
  if (theme === "system") {
    if (typeof window === "undefined") return "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return theme;
}

let listeners: Array<() => void> = [];
let currentTheme: Theme = "system";

function subscribe(listener: () => void) {
  listeners = [...listeners, listener];
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

function getSnapshot(): Theme {
  return currentTheme;
}

function getServerSnapshot(): Theme {
  return "system";
}

function setThemeExternal(newTheme: Theme) {
  currentTheme = newTheme;
  localStorage.setItem("navara-theme", newTheme);
  const resolved = resolveTheme(newTheme);
  document.documentElement.classList.toggle("dark", resolved === "dark");
  for (const listener of listeners) listener();
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    currentTheme = getStoredTheme();
    const resolved = resolveTheme(currentTheme);
    document.documentElement.classList.toggle("dark", resolved === "dark");
    for (const listener of listeners) listener();
  }, []);

  const resolvedTheme = useMemo(() => resolveTheme(theme), [theme]);

  const value = useMemo(
    () => ({ theme, setTheme: setThemeExternal, resolvedTheme }),
    [theme, resolvedTheme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
}
