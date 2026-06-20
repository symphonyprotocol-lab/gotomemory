import type { Policy } from "@gotomemory/policy";

/**
 * Default per-tenant policy set used when no custom policies are configured. It encodes
 * the MVP "must-win" behavior (system spec §19.1):
 *  - any sensitivity can be created/updated/deleted by the owner,
 *  - read up to `private`,
 *  - inject up to `private` (normal auto-injects, private downgrades to confirm),
 *  - `secret` exceeds the inject/read ceiling, so it is omitted by default.
 */
export function defaultPolicies(tenantId: string): Policy[] {
  const base = {
    tenantId,
    subjectId: "*",
    subjectType: "user",
    platform: null,
    clientId: null,
    scope: null,
    purpose: null,
    memoryType: null,
    tag: null,
    expiresAt: null,
    precedence: 100,
  } as const;
  return [
    {
      ...base,
      id: "default-create",
      effect: "allow",
      action: "create",
      maxSensitivity: "secret",
      injectionMode: "never",
    },
    {
      ...base,
      id: "default-read",
      effect: "allow",
      action: "read",
      maxSensitivity: "private",
      injectionMode: "never",
    },
    {
      ...base,
      id: "default-inject",
      effect: "allow",
      action: "inject",
      maxSensitivity: "private",
      injectionMode: "auto",
    },
    {
      ...base,
      id: "default-update",
      effect: "allow",
      action: "update",
      maxSensitivity: "secret",
      injectionMode: "never",
    },
    {
      ...base,
      id: "default-delete",
      effect: "allow",
      action: "delete",
      maxSensitivity: "secret",
      injectionMode: "never",
    },
  ];
}
