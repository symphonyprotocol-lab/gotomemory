import { createClient, type GotomemoryClient, SdkError } from "@gotomemory/sdk";
import { loadSettings, saveSettings, type Settings } from "../../src/config";
import type { ExtMessage, InjectResult, SelectionResult } from "../../src/messages";
import { detectPlatform, type Platform } from "../../src/platform";
import { escapeHtml, renderOmitted, renderResults } from "../../src/render";

const root = document.getElementById("app");
if (root) void init(root);

async function init(app: HTMLElement): Promise<void> {
  let settings = await loadSettings(browser.storage.local);

  app.innerHTML = `
    <style>
      #app { font: 13px/1.5 system-ui, sans-serif; }
      #app .row { display: flex; gap: 6px; margin: 8px 0; }
      #app input { flex: 1; padding: 5px 7px; border: 1px solid #d2d6dc; border-radius: 6px; font: inherit; }
      #app button { padding: 5px 10px; border: 1px solid #0f766e; background: #0f766e; color: #fff;
        border-radius: 6px; font: inherit; cursor: pointer; white-space: nowrap; }
      #app button.ghost { background: #fff; color: #0f766e; }
      #app button:disabled { opacity: .55; cursor: default; }
      #app .status { font-size: 12px; padding: 5px 8px; border-radius: 6px; background: #f1f5f4; margin: 6px 0; }
      #app .status b { color: #0f766e; }
      #app .status.warn { background: #fff7ed; color: #b45309; }
      #app ul { list-style: none; padding: 0; margin: 6px 0; }
      #app li { padding: 4px 0; border-bottom: 1px solid #eef1f5; }
      #app .sens { font-size: 11px; padding: 0 6px; border-radius: 99px; background: #eef2ff; }
      #app .sens.private { background: #fff7ed; } #app .sens.secret { background: #fef2f2; }
      #app em { color: #607080; font-size: 11px; }
      #app .muted { color: #6b716c; font-size: 12px; }
      #app pre { background: #f7f8fa; padding: 8px; border-radius: 6px; white-space: pre-wrap;
        max-height: 130px; overflow: auto; font-size: 11px; }
      #app details { margin-top: 10px; border-top: 1px solid #eef1f5; padding-top: 6px; }
      #app summary { cursor: pointer; color: #607080; font-size: 12px; }
    </style>
    <div class="status" id="status">检测中…</div>
    <div class="row"><input id="task" placeholder="任务（构建并注入相关记忆）" /><button id="build">构建并注入</button></div>
    <div class="row"><input id="q" placeholder="搜索记忆" /><button id="search" class="ghost">搜索</button></div>
    <div class="row"><button id="save" class="ghost" style="flex:1">保存选中文本为记忆</button></div>
    <div id="out"></div>
    <details>
      <summary>设置（Gateway 连接）</summary>
      <div class="row" style="margin-top:8px"><input id="baseUrl" placeholder="Base URL" /></div>
      <div class="row"><input id="token" placeholder="Token (tenant:subject)" /><button id="saveCfg">保存</button></div>
    </details>`;

  const $ = <T extends HTMLElement = HTMLElement>(id: string) => app.querySelector<T>(`#${id}`)!;
  const statusEl = $("status");
  const out = $("out");
  const baseUrlInput = $<HTMLInputElement>("baseUrl");
  const tokenInput = $<HTMLInputElement>("token");
  baseUrlInput.value = settings.baseUrl;
  tokenInput.value = settings.token;

  const client = (): GotomemoryClient => createClient(settings);
  const info = (html: string) => (out.innerHTML = html);
  const fail = (err: unknown) =>
    info(
      `<p class="muted">${escapeHtml(err instanceof SdkError ? `${err.code}: ${err.message}` : String(err))}</p>`,
    );

  // ---- platform detection for the active tab --------------------------------
  let platform: Platform | null = null;
  let tabId: number | undefined;
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    tabId = tab?.id;
    platform = tab?.url ? detectPlatform(new URL(tab.url).hostname) : null;
  } catch {
    /* no tab access */
  }
  if (platform) {
    statusEl.innerHTML = `当前平台：<b>${platform}</b> · 网关 ${escapeHtml(settings.baseUrl)}`;
  } else {
    statusEl.className = "status warn";
    statusEl.textContent = "当前页面不是受支持的 AI 平台（注入不可用，搜索仍可用）";
  }

  // ---- send a message to the page's content script --------------------------
  async function toContent<R>(msg: ExtMessage): Promise<R | null> {
    if (tabId == null) return null;
    try {
      return (await browser.tabs.sendMessage(tabId, msg)) as R;
    } catch {
      return null; // content script not present on this page
    }
  }

  async function injectText(text: string): Promise<void> {
    const res = await toContent<InjectResult>({ type: "INJECT", text });
    if (res?.ok) info(`<p class="muted">已注入 ${text.length} 字到输入框。</p>`);
    else info(`<p class="muted">注入失败：${escapeHtml(res?.reason ?? "页面无内容脚本")}</p>`);
  }

  // ---- actions --------------------------------------------------------------
  $("saveCfg").addEventListener("click", async () => {
    settings = { baseUrl: baseUrlInput.value.trim(), token: tokenInput.value.trim() } as Settings;
    await saveSettings(browser.storage.local, settings);
    info(`<p class="muted">设置已保存。</p>`);
  });

  $("search").addEventListener("click", async () => {
    const query = $<HTMLInputElement>("q").value.trim();
    if (!query) return;
    info("搜索中…");
    try {
      const res = await client().memories.search({ query, platform: platform ?? "claude" });
      out.innerHTML = `<ul>${renderResults(res.items)}</ul>`;
    } catch (err) {
      fail(err);
    }
  });

  $("build").addEventListener("click", async () => {
    const task = $<HTMLInputElement>("task").value.trim();
    if (!task) return;
    info("构建上下文…");
    try {
      const res = await client().context.build({
        task,
        platform: platform ?? "claude",
        client_id: "extension",
      });
      if (res.requires_confirmation && res.confirmation) {
        renderConfirm(res.decision_id, res.confirmation);
        return;
      }
      if (res.context) await injectText(res.context);
      else info(`<p class="muted">没有可注入的记忆。</p>${renderOmitted(res)}`);
    } catch (err) {
      fail(err);
    }
  });

  $("save").addEventListener("click", async () => {
    const sel = await toContent<SelectionResult>({ type: "GET_SELECTION" });
    const text = sel?.text?.trim();
    if (!text) {
      info(`<p class="muted">请先在页面中选中要保存的文本。</p>`);
      return;
    }
    try {
      const res = await client().memories.create({
        scope: "personal",
        type: "note",
        source: "manual",
        content: text,
      });
      info(`<p class="muted">已保存（${escapeHtml(res.sensitivity ?? "?")}）。</p>`);
    } catch (err) {
      fail(err);
    }
  });

  // ---- confirmation flow for private/confirm-gated memory -------------------
  function renderConfirm(
    decisionId: string,
    confirmation: NonNullable<
      Awaited<ReturnType<GotomemoryClient["context"]["build"]>>["confirmation"]
    >,
  ): void {
    const items = confirmation.preview ?? [];
    out.innerHTML = `<p class="muted">以下记忆需确认后注入：</p><ul>${items
      .map(
        (i) =>
          `<li><label><input type="checkbox" class="cf" value="${escapeHtml(i.id)}" checked /> ` +
          `<span class="sens ${escapeHtml(i.sensitivity)}">${escapeHtml(i.sensitivity)}</span> ` +
          `${escapeHtml(i.summary_preview)}</label></li>`,
      )
      .join("")}</ul><div class="row"><button id="doConfirm">确认并注入</button></div>`;

    $("doConfirm").addEventListener("click", async () => {
      const ids = [...out.querySelectorAll<HTMLInputElement>(".cf:checked")].map((c) => c.value);
      info("确认中…");
      try {
        const res = await client().context.confirm({
          decision_id: decisionId,
          confirmation_token: confirmation.confirmation_token,
          confirmed_memory_ids: ids,
        });
        if (res.context) await injectText(res.context);
        else info(`<p class="muted">没有可注入的记忆。</p>${renderOmitted(res)}`);
      } catch (err) {
        fail(err);
      }
    });
  }
}
