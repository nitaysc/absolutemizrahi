import { createContext, useContext, useState, useCallback } from "react";

interface ThemePreviewContextType {
  previewColor: string | null;
  setPreviewColor: (color: string | null) => void;
  clearPreview: () => void;
}

const ThemePreviewContext = createContext<ThemePreviewContextType | undefined>(undefined);

export function ThemePreviewProvider({ children }: { children: React.ReactNode }) {
  const [previewColor, setPreviewColorState] = useState<string | null>(null);

  const setPreviewColor = useCallback((color: string | null) => {
    setPreviewColorState(color);
  }, []);

  const clearPreview = useCallback(() => {
    setPreviewColorState(null);
  }, []);

  return (
    <ThemePreviewContext.Provider value={{ previewColor, setPreviewColor, clearPreview }}>
      {children}
    </ThemePreviewContext.Provider>
  );
}

export function useThemePreview() {
  const context = useContext(ThemePreviewContext);
  if (!context) {
    throw new Error("useThemePreview must be used within a ThemePreviewProvider");
  }
  return context;
}
