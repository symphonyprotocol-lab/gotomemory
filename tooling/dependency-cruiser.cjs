/**
 * Dependency-boundary rules — the executable form of monorepo-guide §5.2.
 * Imports resolve through pnpm workspace symlinks to packages/<name>, so the
 * path-based rules below fire on the real target paths.
 *
 * Run via: pnpm boundaries
 */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment: "Circular dependencies make the build graph and ownership unclear.",
      from: {},
      to: { circular: true },
    },
    {
      name: "packages-no-apps",
      severity: "error",
      comment: "Libraries (packages/*) must never depend on deployables (apps/*).",
      from: { path: "^packages/" },
      to: { path: "^apps/" },
    },
    {
      name: "thin-clients-no-server-internals",
      severity: "error",
      comment:
        "SDK/CLI and frontends only talk to the Gateway via sdk-ts; they must not bundle " +
        "server logic, storage, or crypto (zero-privilege boundary).",
      from: { path: "^(packages/(sdk-ts|cli)|apps/(cli|mcp-server|console|extension))/" },
      to: { path: "^packages/(core|db|crypto|audit|policy)/" },
    },
    {
      name: "adapters-no-storage-or-crypto",
      severity: "error",
      comment:
        "Adapters consume already-redacted Memory Context from core; they must not reach " +
        "into db or crypto (cannot see unredacted bodies).",
      from: { path: "^packages/adapters/" },
      to: { path: "^packages/(db|crypto)/" },
    },
    {
      name: "policy-no-db",
      severity: "error",
      comment: "Policy evaluation must not read storage directly.",
      from: { path: "^packages/policy/" },
      to: { path: "^packages/db/" },
    },
    {
      name: "contracts-is-leaf",
      severity: "error",
      comment:
        "contracts is the single source of truth and must not depend on other internal packages.",
      from: { path: "^packages/contracts/" },
      to: { path: "^packages/(core|db|crypto|audit|policy|adapters|sdk-ts|cli|testing)/" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    includeOnly: "^(apps|packages)/",
    tsPreCompilationDeps: true,
    exclude: { path: "(\\.test\\.|/__tests__/|/dist/|/generated/|/\\.wxt/|/\\.output/)" },
  },
};
