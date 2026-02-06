"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Theme = "dark" | "light";
type ThemeOverride = Theme | null; // null = follow system

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function getSystemTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [override, setOverride] = useState<ThemeOverride>(null);
  const [systemTheme, setSystemTheme] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  // The actual theme being displayed
  const theme: Theme = override ?? systemTheme;

  // Initialize from localStorage and system preference
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    // Check for new key first, then migrate from old key if needed
    let stored = localStorage.getItem("theme-override");
    if (!stored) {
      const oldStored = localStorage.getItem("theme");
      if (oldStored === "light" || oldStored === "dark") {
        stored = oldStored;
        localStorage.removeItem("theme"); // Clean up old key
      }
    }
    if (stored === "light" || stored === "dark") {
      setOverride(stored);
    }
    setSystemTheme(getSystemTheme());

    // Listen for system theme changes
    const mediaQuery = window.matchMedia("(prefers-color-scheme: light)");
    const handleChange = (e: MediaQueryListEvent) => {
      setSystemTheme(e.matches ? "light" : "dark");
    };
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  // Apply theme to document and persist override
  useEffect(() => {
    if (mounted) {
      if (override) {
        localStorage.setItem("theme-override", override);
      } else {
        localStorage.removeItem("theme-override");
      }
      document.documentElement.classList.toggle("light", theme === "light");
    }
  }, [override, theme, mounted]);

  const toggleTheme = () => {
    const newTheme: Theme = theme === "dark" ? "light" : "dark";

    // If the new theme matches system, remove override (follow system)
    // Otherwise, set explicit override
    if (newTheme === systemTheme) {
      setOverride(null);
    } else {
      setOverride(newTheme);
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
