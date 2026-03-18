import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // Ensure Vite uses `apps/web/` as its root, so `/src/main.tsx` resolves.
  root: webRoot,
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:5174",
        changeOrigin: true
      }
    }
  }
});

