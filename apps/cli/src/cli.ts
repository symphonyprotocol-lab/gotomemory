import { createClient, type GotomemoryClient, type SearchRequest, SdkError } from "@gotomemory/sdk";
import { Command } from "commander";
import { exitCodeFor } from "./exit-codes.js";

export { exitCodeFor };

export interface GlobalOptions {
  baseUrl: string;
  token: string;
  json?: boolean;
}

export type ClientFactory = (opts: GlobalOptions) => GotomemoryClient;

const defaultFactory: ClientFactory = (opts) =>
  createClient({ baseUrl: opts.baseUrl, token: opts.token });

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8").trim();
}

function emit(json: boolean | undefined, human: string, data: unknown): void {
  process.stdout.write(json ? `${JSON.stringify(data)}\n` : `${human}\n`);
}

function fail(json: boolean | undefined, err: unknown): never {
  if (err instanceof SdkError) {
    process.stderr.write(
      json
        ? `${JSON.stringify({ error: { code: err.code, message: err.message } })}\n`
        : `error: ${err.code}: ${err.message}\n`,
    );
    process.exit(exitCodeFor(err.code));
  }
  process.stderr.write(`error: ${(err as Error).message}\n`);
  process.exit(1);
}

function csv(value: string | undefined): string[] {
  return value
    ? value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
}

/**
 * Build the `gotomemory` CLI. A client factory can be injected for tests; production uses
 * the SDK against the configured Gateway. Designed to be driven by skills (§16.5): stable
 * `--json` output and exit codes, content read from stdin to keep secrets off argv.
 */
export function buildProgram(factory: ClientFactory = defaultFactory): Command {
  const program = new Command();
  program
    .name("gotomemory")
    .description("gotomemory CLI — governed memory access and skill substrate")
    .option(
      "--base-url <url>",
      "Gateway base URL",
      process.env.GOTOMEMORY_URL ?? "http://localhost:8787/v1",
    )
    .option("--token <token>", "bearer token", process.env.GOTOMEMORY_TOKEN ?? "t1:u1")
    .option("--json", "machine-readable JSON output", false);

  const globals = (cmd: Command): GlobalOptions => cmd.optsWithGlobals() as GlobalOptions;

  const memory = program.command("memory").description("manage memories");

  memory
    .command("create")
    .requiredOption("--type <type>", "memory type")
    .option("--scope <scope>", "scope", "personal")
    .option("--source <source>", "source", "user_explicit")
    .option("--sensitivity <level>", "sensitivity")
    .option("--tags <list>", "comma-separated tags")
    .option("--content <text>", "content (otherwise read from stdin)")
    .action(async (_o, cmd: Command) => {
      const g = globals(cmd);
      const o = cmd.opts();
      try {
        const content = (o.content as string | undefined) ?? (await readStdin());
        const res = await factory(g).memories.create({
          scope: o.scope,
          type: o.type,
          source: o.source,
          content,
          ...(o.sensitivity ? { sensitivity: o.sensitivity } : {}),
          tags: csv(o.tags as string | undefined),
        });
        emit(g.json, `created ${res.id} (${res.sensitivity ?? "?"}, v${res.version})`, res);
      } catch (err) {
        fail(g.json, err);
      }
    });

  memory
    .command("search <query>")
    .option("--platform <platform>")
    .option("--scope <list>", "comma-separated scopes")
    .option("--limit <n>", "limit", "12")
    .action(async (query: string, _o, cmd: Command) => {
      const g = globals(cmd);
      const o = cmd.opts();
      try {
        const res = await factory(g).memories.search({
          query,
          ...(o.platform ? { platform: o.platform } : {}),
          scope: csv(o.scope as string | undefined) as SearchRequest["scope"],
          limit: Number(o.limit),
        });
        const human = res.items
          .map((i) => `${i.id}\t${i.sensitivity}\t${i.summary_preview}`)
          .join("\n");
        emit(g.json, human || "(no results)", res);
      } catch (err) {
        fail(g.json, err);
      }
    });

  memory
    .command("read <id>")
    .requiredOption("--purpose <purpose>", "why the content is needed")
    .action(async (id: string, _o, cmd: Command) => {
      const g = globals(cmd);
      const o = cmd.opts();
      try {
        const res = await factory(g).memories.read(id, o.purpose);
        emit(g.json, res.content, res);
      } catch (err) {
        fail(g.json, err);
      }
    });

  memory.command("delete <id>").action(async (id: string, _o, cmd: Command) => {
    const g = globals(cmd);
    try {
      await factory(g).memories.delete(id);
      emit(g.json, `deleted ${id}`, { id, status: "deleted" });
    } catch (err) {
      fail(g.json, err);
    }
  });

  const context = program.command("context").description("build and confirm model context");

  context
    .command("build")
    .requiredOption("--task <task>", "task description")
    .option("--platform <platform>", "platform", "claude")
    .option("--client-id <id>", "client id", "cli")
    .option("--purpose <purpose>", "purpose")
    .option("--token-budget <n>", "token budget", "1200")
    .action(async (_o, cmd: Command) => {
      const g = globals(cmd);
      const o = cmd.opts();
      try {
        const res = await factory(g).context.build({
          task: o.task,
          platform: o.platform,
          client_id: o.clientId,
          ...(o.purpose ? { purpose: o.purpose } : {}),
          token_budget: Number(o.tokenBudget),
        });
        emit(g.json, res.context ?? "(requires confirmation or nothing to inject)", res);
      } catch (err) {
        fail(g.json, err);
      }
    });

  context
    .command("confirm")
    .requiredOption("--decision-id <id>")
    // Not `--token`: that is the global bearer-credential flag, and a colliding local
    // option would clobber it via optsWithGlobals() and break authentication.
    .requiredOption("--confirmation-token <token>", "confirmation token")
    .requiredOption("--ids <list>", "comma-separated memory ids to confirm")
    .action(async (_o, cmd: Command) => {
      const g = globals(cmd);
      const o = cmd.opts();
      try {
        const res = await factory(g).context.confirm({
          decision_id: o.decisionId,
          confirmation_token: o.confirmationToken,
          confirmed_memory_ids: csv(o.ids as string),
        });
        emit(g.json, res.context ?? "(nothing injected)", res);
      } catch (err) {
        fail(g.json, err);
      }
    });

  return program;
}
