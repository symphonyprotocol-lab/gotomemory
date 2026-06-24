import { InMemoryAuditSink } from "@gotomemory/audit";
import { MemoryService } from "@gotomemory/core";
import { EnvelopeCipher } from "@gotomemory/crypto";
import { InMemoryAuthRepository, InMemoryMemoryRepository } from "@gotomemory/db";
import { FileSystemPageStorage, InMemoryPageRepository, PageService } from "@gotomemory/pages";
import { combinedAuthResolver } from "./auth.js";
import { AuthService } from "./auth-service.js";
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
const port = Number(process.env.PORT ?? 8787);
const pages = new PageService({
  repo: new InMemoryPageRepository(),
  storage: new FileSystemPageStorage(process.env.GOTOMEMORY_PAGES_DIR ?? ".gotomemory-pages"),
  publicBaseUrl: process.env.GOTOMEMORY_WEB_URL ?? "http://localhost:5173",
});
const authRepo = new InMemoryAuthRepository();
// Mock OAuth login is for local/dev only. It is disabled in production unless explicitly
// re-enabled, so a deployed gateway cannot mint sessions for arbitrary unverified identities.
const allowMockAuth =
  process.env.NODE_ENV !== "production" || process.env.GOTOMEMORY_ALLOW_MOCK_AUTH === "1";
const authService = new AuthService(authRepo, undefined, undefined, allowMockAuth);

const app = buildServer({
  service,
  pages,
  authService,
  // The dev token/header fallback is only enabled outside production; a production boot is
  // session-only so a forged `Bearer tenant:subject` token cannot authenticate.
  auth: combinedAuthResolver(authRepo, {
    allowDevFallback: process.env.NODE_ENV !== "production",
  }),
  cors: true,
});

app
  .listen({ port, host: "0.0.0.0" })
  .then(() => console.log(`gotomemory gateway listening on :${port}`))
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
