import { fileURLToPath } from "node:url";

import { defineConfig } from "wxt";

import { hostPermissions } from "./src/manifest.js";

// Bundle the workspace packages from their TypeScript source, not their built
// `dist/`. Otherwise `wxt build` ships stale dependency code unless every
// package's dist is rebuilt first — a foot-gun that silently dropped fixes.
const workspaceSrc = (pkg: string): string =>
  fileURLToPath(new URL(`../../packages/${pkg}/src/index.ts`, import.meta.url));

const workspaceAliases = Object.fromEntries(
  ["contracts", "core", "export", "render", "retrieval", "site-adapters", "store"].map((pkg) => [
    `@gotomemory/${pkg}`,
    workspaceSrc(pkg)
  ])
);

// WXT targets Manifest V3 by default; set it via manifestVersion (not the
// inline manifest field, which WXT ignores).
export default defineConfig({
  manifestVersion: 3,
  manifest: {
    name: "gotomemory",
    description: "Local-first memory sharing across AI assistants.",
    version: "0.0.0",
    permissions: ["storage"],
    host_permissions: hostPermissions,
    icons: {
      "16": "icon-16.png",
      "32": "icon-32.png",
      "48": "icon-48.png",
      "96": "icon-96.png",
      "128": "icon-128.png"
    },
    action: {
      default_icon: {
        "16": "icon-16.png",
        "32": "icon-32.png",
        "48": "icon-48.png",
        "96": "icon-96.png",
        "128": "icon-128.png"
      }
    }
  },
  vite: () => ({
    resolve: {
      alias: workspaceAliases
    }
  })
});
