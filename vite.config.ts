import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      "/api": "https://day-streak-counter-1.onrender.com",
    },
  },
  preview: {
    port: 4173,
    host: true,
    proxy: {
      "/api": "https://day-streak-counter-1.onrender.com",
    },
  }
});