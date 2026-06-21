import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 3000,
    // Проксируем API запросы на бэкенд при локальной разработке
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    // Оптимизация для мобильных устройств
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom", "react-router-dom"],
          twa: ["@twa-dev/sdk"],
        },
        entryFileNames: "assets/index-v5-[hash].js",
        chunkFileNames: "assets/[name]-v5-[hash].js",
      },
    },
  },
});
