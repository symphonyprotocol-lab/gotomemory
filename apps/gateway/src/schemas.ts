import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { parse as parseYaml } from "yaml";

/**
 * Request-body validation derived from the OpenAPI document (§9) — the same single source
 * of truth the TS/Python types are generated from, so validation can never drift from the
 * published contract. OpenAPI 3.1 component schemas are JSON Schema 2020-12, so AJV (via
 * Fastify) can consume them directly once internal refs are rehomed under `definitions`.
 */
const SCHEMA_ID = "gotomemory";

interface OpenApiDoc {
  components?: { schemas?: Record<string, unknown> };
}

let cached: Record<string, unknown> | undefined;

/** The OpenAPI component schemas as one Fastify-registerable JSON Schema (memoized). */
export function openApiSchema(): Record<string, unknown> {
  if (cached) return cached;
  const require = createRequire(import.meta.url);
  const path = require.resolve("@gotomemory/contracts/openapi.yaml");
  const doc = parseYaml(readFileSync(path, "utf8")) as OpenApiDoc;
  const schemas = doc.components?.schemas ?? {};
  // Rehome `#/components/schemas/X` -> `#/definitions/X` so every $ref resolves within the
  // one registered document (a JSON round-trip rewrites the refs in nested schemas too).
  cached = JSON.parse(
    JSON.stringify({ $id: SCHEMA_ID, definitions: schemas }).replaceAll(
      "#/components/schemas/",
      "#/definitions/",
    ),
  ) as Record<string, unknown>;
  return cached;
}

/** A `$ref` to one named request schema in the registered document. */
export function ref(name: string): { $ref: string } {
  return { $ref: `${SCHEMA_ID}#/definitions/${name}` };
}
