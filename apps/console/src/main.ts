import { createClient, type GotomemoryClient, SdkError } from "@gotomemory/sdk";
import { renderContext, renderItems } from "./ui.js";

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element #${id}`);
  return el;
}

function value(id: string): string {
  return ($(id) as HTMLInputElement).value.trim();
}

function client(): GotomemoryClient {
  return createClient({ baseUrl: value("baseUrl"), token: value("token") });
}

function reportError(target: HTMLElement, err: unknown): void {
  const message = err instanceof SdkError ? `${err.code}: ${err.message}` : String(err);
  target.innerHTML = `<p class="omitted">${message}</p>`;
}

async function onCreate(): Promise<void> {
  const results = $("results");
  try {
    const res = await client().memories.create({
      scope: "personal",
      type: value("type") as "preference",
      content: value("content"),
      source: "user_explicit",
    });
    results.innerHTML = `<li>created <code>${res.id.slice(0, 8)}</code> (${res.sensitivity ?? "?"})</li>`;
  } catch (err) {
    reportError(results, err);
  }
}

async function onSearch(): Promise<void> {
  const results = $("results");
  try {
    const res = await client().memories.search({ query: value("query"), platform: "claude" });
    results.innerHTML = renderItems(res.items);
  } catch (err) {
    reportError(results, err);
  }
}

async function onBuild(): Promise<void> {
  const context = $("context");
  try {
    const res = await client().context.build({
      task: value("task"),
      platform: "claude",
      client_id: "console",
    });
    context.innerHTML = renderContext(res);
  } catch (err) {
    reportError(context, err);
  }
}

$("createBtn").addEventListener("click", () => void onCreate());
$("searchBtn").addEventListener("click", () => void onSearch());
$("buildBtn").addEventListener("click", () => void onBuild());
