import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Resolve workspace packages to their TypeScript source, mirroring the
// extension's wxt config: `vite dev` then works without a prior `tsc` build,
// and a fixed string is never served from a stale dist/.
export const workspaceAliases = {
  "@gotomemory/i18n": fileURLToPath(new URL("../../packages/i18n/src/index.ts", import.meta.url))
};

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: workspaceAliases
  },
  build: {
    // Two real HTML entries, so /privacy/ resolves as a file on any static host
    // — the store listing links to it, and a client-side route would need
    // SPA-fallback config we do not control at the hosting layer.
    rollupOptions: {
      input: {
        home: fileURLToPath(new URL("index.html", import.meta.url)),
        privacy: fileURLToPath(new URL("privacy/index.html", import.meta.url))
      }
    }
  },
  server: {
    port: 5173
  }
});
