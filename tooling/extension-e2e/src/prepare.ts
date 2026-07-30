/**
 * Build the real extension and derive an E2E-loadable copy.
 *
 * `wxt build` produces the production MV3 bundle in
 * `apps/extension/.output/chrome-mv3`. Its content scripts only match the real
 * assistant hosts, so the copy at `.output/chrome-mv3-e2e` gets the local
 * fixture origin added to the ChatGPT content script's matches (and to
 * host_permissions). The production bundle itself is left untouched — the E2E
 * suite drives the exact bytes that would ship, plus one extra match pattern.
 */

import { spawnSync } from "node:child_process";
import { cp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const outputDir = path.join(repoRoot, "apps/extension/.output/chrome-mv3");
const e2eDir = path.join(repoRoot, "apps/extension/.output/chrome-mv3-e2e");

const LOCAL_MATCHES = ["http://127.0.0.1/*", "http://localhost/*"];

interface ManifestShape {
  host_permissions?: string[];
  content_scripts?: Array<{ matches?: string[] }>;
}

async function main(): Promise<void> {
  console.log("building extension (wxt build)...");
  const build = spawnSync("pnpm", ["--filter", "@gotomemory/extension", "run", "build:ext"], {
    cwd: repoRoot,
    stdio: "inherit"
  });
  if (build.status !== 0) {
    throw new Error(`wxt build failed with exit code ${build.status}`);
  }

  await rm(e2eDir, { recursive: true, force: true });
  await cp(outputDir, e2eDir, { recursive: true });

  const manifestPath = path.join(e2eDir, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as ManifestShape;
  manifest.host_permissions = [...(manifest.host_permissions ?? []), ...LOCAL_MATCHES];
  for (const script of manifest.content_scripts ?? []) {
    if (script.matches?.some((match) => match.includes("chatgpt.com"))) {
      script.matches.push(...LOCAL_MATCHES);
    }
  }
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`e2e bundle ready at ${e2eDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
