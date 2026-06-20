import { InMemoryAuditSink } from "@gotomemory/audit";
import { MemoryService } from "@gotomemory/core";
import { EnvelopeCipher } from "@gotomemory/crypto";
import { InMemoryMemoryRepository } from "@gotomemory/db";
import { buildServer } from "./server.js";

/**
 * Runnable gateway with the in-memory dev backend. Set GOTOMEMORY_MASTER_KEY (base64, 32
 * bytes) to persist a stable encryption key; otherwise a random one is generated per boot.
 */
const masterKey = process.env.GOTOMEMORY_MASTER_KEY
  ? Buffer.from(process.env.GOTOMEMORY_MASTER_KEY, "base64")
  : EnvelopeCipher.generateMasterKey();

const service = new MemoryService({
  repo: new InMemoryMemoryRepository(),
  audit: new InMemoryAuditSink(),
  cipher: new EnvelopeCipher(masterKey),
});

const app = buildServer({ service });
const port = Number(process.env.PORT ?? 8787);

app
  .listen({ port, host: "0.0.0.0" })
  .then(() => console.log(`gotomemory gateway listening on :${port}`))
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
