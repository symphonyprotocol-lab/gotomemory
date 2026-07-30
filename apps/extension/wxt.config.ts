import { fileURLToPath } from "node:url";

import { defineConfig } from "wxt";

import {
  defaultLocale,
  extensionVersion,
  hostPermissions,
  manifestDescription,
  manifestName,
  permissions
} from "./src/manifest.js";

// Bundle the workspace packages from their TypeScript source, not their built
// `dist/`. Otherwise `wxt build` ships stale dependency code unless every
// package's dist is rebuilt first — a foot-gun that silently dropped fixes.
const workspaceSrc = (pkg: string): string =>
  fileURLToPath(new URL(`../../packages/${pkg}/src/index.ts`, import.meta.url));

const workspaceAliases = Object.fromEntries(
  ["contracts", "core", "export", "i18n", "retrieval", "site-adapters", "store"].map((pkg) => [
    `@gotomemory/${pkg}`,
    workspaceSrc(pkg)
  ])
);

// WXT targets Manifest V3 by default; set it via manifestVersion (not the
// inline manifest field, which WXT ignores).
export default defineConfig({
  manifestVersion: 3,
  // Without this the store upload is named after the package —
  // "gotomemoryextension-<version>-chrome.zip".
  zip: {
    name: "gotomemory"
  },
  manifest: {
    name: manifestName,
    description: manifestDescription,
    default_locale: defaultLocale,
    version: extensionVersion,
    permissions,
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
