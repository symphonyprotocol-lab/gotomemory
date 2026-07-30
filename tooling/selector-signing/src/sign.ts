/**
 * Sign a selector-overrides document for the remote config channel.
 *
 *   pnpm --filter @gotomemory/selector-signing run sign -- \
 *     --key selector-signing-key.json \
 *     --in overrides.json \
 *     --version 2 \
 *     --out selector-overrides.v1.json
 *
 * Bump `--version` on every publish. The number is signed with the selectors
 * and extensions reject any config older than the newest they have accepted,
 * so a stale-but-validly-signed document cannot be replayed at them.
 *
 * `--in` is the plain overrides JSON, e.g.
 *   { "chatgpt": { "messageSelector": "[data-turn]" } }
 * The output is the `{ payload, signature }` wire document to upload to
 * https://config.gotomemory.dev/selector-overrides.v1.json (serve with CORS
 * `Access-Control-Allow-Origin: *` and content-type application/json).
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import type { SelectorOverrides } from "@gotomemory/site-adapters";

import { signSelectorOverrides } from "./signing.js";

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const keyPath = argValue("--key");
  const inPath = argValue("--in");
  const outPath = argValue("--out") ?? "selector-overrides.v1.json";
  const version = Number(argValue("--version"));
  if (!keyPath || !inPath || !Number.isInteger(version) || version < 1) {
    throw new Error(
      "usage: sign --key <private-jwk.json> --in <overrides.json> --version <n> [--out <file>]\n" +
        "  --version must increase with every published config: extensions refuse\n" +
        "  any document older than the newest one they have already accepted."
    );
  }

  const privateKeyJwk = JSON.parse(await readFile(path.resolve(keyPath), "utf8")) as JsonWebKey;
  const overrides = JSON.parse(await readFile(path.resolve(inPath), "utf8")) as SelectorOverrides;

  const signed = await signSelectorOverrides(overrides, privateKeyJwk, version);
  await writeFile(path.resolve(outPath), `${JSON.stringify(signed, null, 2)}\n`);

  console.log(`signed config written to ${path.resolve(outPath)}`);
  console.log(`payload: ${signed.payload}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
