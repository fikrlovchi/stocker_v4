import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// SPA hozircha `/app/` yo'lida turadi: `stocker.uz` ildizida eski EJS panel
// ishlab turibdi va bo'limlar ko'chib bo'lguncha o'chirilmaydi. Bo'limlar
// to'liq ko'chgach base '/' ga o'zgaradi va nginx ildizni shu yerga qaratadi.
export default defineConfig({
  base: "/app/",
  plugins: [react()],
  server: {
    // Ishlab chiqishda API to'g'ridan-to'g'ri stocker-server'ga ketadi.
    proxy: {
      "/web": { target: "http://127.0.0.1:4044", changeOrigin: true },
    },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
