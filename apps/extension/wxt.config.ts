import { defineConfig } from "wxt";

import { hostPermissions } from "./src/manifest.js";

export default defineConfig({
  manifest: {
    name: "gotomemory",
    description: "Local-first memory sharing across AI assistants.",
    version: "0.0.0",
    manifest_version: 3,
    permissions: ["storage"],
    host_permissions: hostPermissions
  }
});
