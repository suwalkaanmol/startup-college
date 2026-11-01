import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Relative asset URLs so the app works from the /travel/ subfolder.
  base: "./",
  // Build straight into /travel/ (parent of client/): travel/index.html + travel/assets/ + travel/config.js
  build: { outDir: "..", emptyOutDir: false },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
      },
      "/socket.io": {
        target: "http://localhost:5000",
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
