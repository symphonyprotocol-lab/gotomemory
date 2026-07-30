/**
 * Generate the production selector-signing keypair.
 *
 *   pnpm --filter @gotomemory/selector-signing run keygen [-- --out <file>] [--force]
 *
 * Writes the PRIVATE key JWK to the output file (default
 * ./selector-signing-key.json, git-ignored, chmod 600 — move it to the team
 * secret store, do not leave it on disk) and prints the PUBLIC key constant to
 * paste into apps/extension/src/selector-config.ts.
 */

import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { generateSigningKeyPair, publicKeySnippet } from "./signing.js";

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const outPath = path.resolve(argValue("--out") ?? "selector-signing-key.json");
  if (existsSync(outPath) && !process.argv.includes("--force")) {
    throw new Error(
      `${outPath} already exists; pass --force to overwrite (old key stops verifying!)`
    );
  }

  const pair = await generateSigningKeyPair();
  await writeFile(outPath, `${JSON.stringify(pair.privateKeyJwk, null, 2)}\n`, { mode: 0o600 });

  console.log(`private key written to ${outPath} (keep offline; git-ignored)`);
  console.log("");
  console.log("paste into apps/extension/src/selector-config.ts:");
  console.log("");
  console.log(publicKeySnippet(pair.publicKeyJwk));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
