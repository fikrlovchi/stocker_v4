import React from "react";
import { createRoot } from "react-dom/client";
import "./i18n";
import "./styles.css";
import App from "./App";
import { AuthProvider } from "./auth";
import { ThemeProvider } from "./theme";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>
);
