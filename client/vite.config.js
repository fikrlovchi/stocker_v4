import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// SPA endi ILDIZDA: stocker.uz ochilganda shu ilova chiqadi. `/app/` eski
// havolalar uchun nginx'da ildizga redirect qilinadi.
export default defineConfig({
  base: "/",
  plugins: [react()],
  server: {
    // Ishlab chiqishda API to'g'ridan-to'g'ri stocker-server'ga ketadi.
    proxy: {
      "/web": { target: "http://127.0.0.1:4044", changeOrigin: true },
    },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
