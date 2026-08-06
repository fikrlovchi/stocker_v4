import { createContext, useContext, useEffect, useState } from "react";

// Mavzu `<html data-theme>` atributiga yoziladi — CSS tokenlari shu bo'yicha
// almashadi (styles.css). Tanlov localStorage'da: har kirishda qayta
// tanlash kerak emas.
const STORED = "stocker.theme";
const ThemeContext = createContext({ theme: "dark", setTheme: () => {} });

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem(STORED) || "dark");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(STORED, theme);
  }, [theme]);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
