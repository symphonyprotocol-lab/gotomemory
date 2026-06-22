import { composeTextareaValue } from "../src/inject";
import {
  type ExtMessage,
  type InjectResult,
  isExtMessage,
  type PingResult,
  type SelectionResult,
} from "../src/messages";
import { detectPlatform, findEditor, type Platform } from "../src/platform";

/**
 * Content script: owns the page DOM only. It detects the platform, and on request from the
 * popup it reports the current selection or injects user-authorized memory into the chat
 * composer. It never calls the gateway — the popup does that and hands over plain text.
 */
export default defineContentScript({
  matches: [
    "*://chatgpt.com/*",
    "*://chat.openai.com/*",
    "*://claude.ai/*",
    "*://gemini.google.com/*",
  ],
  main() {
    const platform = detectPlatform(location.hostname);
    if (platform) console.info(`gotomemory: active on ${platform}`);

    browser.runtime.onMessage.addListener((raw: unknown) => {
      if (!isExtMessage(raw)) return undefined;
      const msg: ExtMessage = raw;
      if (msg.type === "PING") {
        return Promise.resolve<PingResult>({ platform, title: document.title, url: location.href });
      }
      if (msg.type === "GET_SELECTION") {
        return Promise.resolve<SelectionResult>({
          text: window.getSelection?.()?.toString() ?? "",
        });
      }
      if (msg.type === "INJECT") {
        return Promise.resolve<InjectResult>(injectMemory(platform, msg.text));
      }
      return undefined;
    });
  },
});

function injectMemory(platform: Platform | null, text: string): InjectResult {
  if (!platform) return { ok: false, reason: "unsupported-site" };
  const el = findEditor(document, platform);
  if (!el) return { ok: false, reason: "editor-not-found" };

  const node = el as HTMLElement;
  node.focus();

  if (node.isContentEditable) {
    // Works across ProseMirror/Lexical/Quill composers and keeps their internal state in sync.
    const ok = document.execCommand("insertText", false, text);
    if (!ok) {
      node.textContent = `${node.textContent ?? ""}${text}`;
      node.dispatchEvent(new InputEvent("input", { bubbles: true }));
    }
    return { ok: true };
  }

  if (node instanceof HTMLTextAreaElement) {
    setNativeValue(node, composeTextareaValue(node.value, text));
    node.dispatchEvent(new Event("input", { bubbles: true }));
    return { ok: true };
  }

  return { ok: false, reason: "unsupported-editor" };
}

/** Set a textarea's value through the native setter so React/Vue controlled inputs update. */
function setNativeValue(el: HTMLTextAreaElement, value: string): void {
  const proto = Object.getPrototypeOf(el) as object;
  const desc = Object.getOwnPropertyDescriptor(proto, "value");
  if (desc?.set) desc.set.call(el, value);
  else el.value = value;
}
