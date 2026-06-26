import type { Platform } from "@gotomemory/contracts";
import { formatAuthorizedMemoryPrompt } from "@gotomemory/core";
import { adapters, type SiteAdapter } from "@gotomemory/site-adapters";

import {
  createRuntimeMessenger,
  type ExtensionMessage,
  type ExtensionMessageResponse
} from "./messaging.js";

type Messenger = ReturnType<typeof createRuntimeMessenger>;

export interface MountOptions {
  root?: ParentNode;
  document?: Document;
  messenger?: Messenger;
}

export function mountContentScript(platform: Platform, options: MountOptions = {}): boolean {
  const doc = options.document ?? document;
  const root = options.root ?? doc;
  const messenger = options.messenger ?? createChromeMessenger();
  const adapter = adapters[platform];
  const mount = adapter.findMount(root);
  if (!mount || root.querySelector?.("[data-gotomemory-mounted='true']")) {
    return false;
  }

  const container = doc.createElement("div");
  container.setAttribute("data-gotomemory-mounted", "true");
  container.append(
    actionButton(doc, "gotomemory: save", "save", () =>
      captureLatestMessage(adapter, messenger, platform, root)
    ),
    actionButton(doc, "gotomemory: inject", "inject", () =>
      injectRelevantMemories(adapter, messenger, platform, root)
    )
  );
  mount.append(container);
  return true;
}

/** Capture: save the latest user message as a memory (spec §6.1 manual capture). */
export async function captureLatestMessage(
  adapter: SiteAdapter,
  messenger: Messenger,
  platform: Platform,
  root: ParentNode = document
): Promise<boolean> {
  const messages = adapter.extractMessages(root);
  const latestUser = [...messages].reverse().find((message) => message.role === "user");
  const candidate = latestUser ?? messages.at(-1);
  if (!candidate) {
    return false;
  }

  await messenger.save({ content: candidate.content, source: platform });
  return true;
}

/**
 * Inject: ask the background for relevant memories for the current topic and
 * insert them, prompt-injection-framed, into the assistant input (spec §6.1, §9).
 * Private memories stay in `needs_confirm` and are not auto-injected.
 */
export async function injectRelevantMemories(
  adapter: SiteAdapter,
  messenger: Messenger,
  platform: Platform,
  root: ParentNode = document
): Promise<boolean> {
  const messages = adapter.extractMessages(root);
  const topic = messages.at(-1)?.content ?? "";
  const context = await messenger.context({ platform, topic });
  if (context.ready.length === 0) {
    return false;
  }

  return adapter.insertIntoPrompt(formatAuthorizedMemoryPrompt(context.ready), root);
}

function actionButton(
  doc: Document,
  label: string,
  action: string,
  handler: () => Promise<unknown>
): HTMLButtonElement {
  const button = doc.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.setAttribute("data-gotomemory-action", action);
  button.addEventListener("click", () => {
    void handler();
  });
  return button;
}

declare const chrome:
  | {
      runtime?: {
        sendMessage?: (message: ExtensionMessage) => Promise<ExtensionMessageResponse>;
      };
    }
  | undefined;

function createChromeMessenger(): Messenger {
  return createRuntimeMessenger(async (message) => {
    const send = chrome?.runtime?.sendMessage;
    if (!send) {
      return { ok: false, error: "chrome.runtime.sendMessage unavailable" };
    }
    return send(message);
  });
}
