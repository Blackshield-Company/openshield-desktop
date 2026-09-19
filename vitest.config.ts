import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    // Resolve svelte (and friends) to their browser entries — the default
    // 'node' condition pulls in svelte's server renderer and mount() dies.
    conditions: ["browser"],
    alias: {
      $lib: path.resolve(__dirname, "src/lib"),
      "$app/environment": path.resolve(__dirname, "tests/stubs/app-environment.ts"),
    },
  },
  test: {
    environment: "jsdom",
    // jsdom only exposes localStorage on a non-opaque origin.
    environmentOptions: {
      jsdom: { url: "http://localhost/" },
    },
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
  },
});
