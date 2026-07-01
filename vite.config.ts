import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;
const devHost = host || "127.0.0.1";
const apiTarget = "http://127.0.0.1:3001";

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  optimizeDeps: {
    // The app has several heavy, lazy-only surfaces (charts, node builder,
    // markdown artifacts, AI streaming helpers). Letting Vite crawl the whole
    // graph on cold start can leave dev stuck in a deps_temp directory and the
    // browser waiting on JavaScript. Disable cold-start discovery/prebundling
    // and let secondary-view packages load only when their route is requested.
    noDiscovery: true,
    holdUntilCrawlEnd: false,
    include: [],
    exclude: [
      "@tauri-apps/api",
      "@tauri-apps/plugin-sql",
      "@xyflow/react",
      "ai",
      "react-markdown",
      "recharts",
      "remark-gfm",
    ],
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: devHost,
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
      },
    },
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
