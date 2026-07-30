import { defineConfig } from "vitest/config";

import { workspaceAliases } from "./vite.config.js";

export default defineConfig({
  resolve: {
    alias: workspaceAliases
  },
  test: {
    exclude: ["**/node_modules/**", "**/dist/**", "**/dist-types/**"]
  }
});
