import { createContext, useContext, useEffect, useState } from "react";
import { useAccentColor } from "@/hooks/useAccentColor";

type Theme = "dark" | "light";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
  accentColor: string;
  themeName: string;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = localStorage.getItem("theme") as Theme;
    return stored || "dark";
  });

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setThemeState(prev => prev === "dark" ? "light" : "dark");
  };

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
  };

  return (
    <ThemeContext.Provider value={{ 
      theme, 
      toggleTheme, 
      setTheme, 
      accentColor: "25 95% 53%", 
      themeName: "Default" 
    }}>
      <ThemeProviderInner>{children}</ThemeProviderInner>
    </ThemeContext.Provider>
  );
}

// Inner component that can use hooks requiring AuthProvider
function ThemeProviderInner({ children }: { children: React.ReactNode }) {
  // Apply accent color from shop - this hook handles the CSS variable updates
  useAccentColor();
  
  return <>{children}</>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
