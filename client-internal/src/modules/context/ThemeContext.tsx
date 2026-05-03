import { createContext, useContext, useMemo } from "react";

const ThemeContext = createContext({
  mode: "light",
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const value = useMemo(
    () => ({
      mode: "light",
    }),
    []
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
