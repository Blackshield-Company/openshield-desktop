import { defineConfig, type Plugin } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// WebKitGTK (Tauri on Linux) refuses modulepreload/crossorigin hints that
// Vite injects into the built index.html. Strip them so the shell boots clean.
function stripCrossorigin(): Plugin {
  return {
    name: "openshield-strip-crossorigin",
    apply: "build",
    transformIndexHtml(html: string) {
      return html.replace(/ crossorigin(?:="[^"]*")?/g, "");
    },
  };
}

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [sveltekit(), stripCrossorigin()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
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
