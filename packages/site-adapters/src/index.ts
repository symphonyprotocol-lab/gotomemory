import type { ConversationMessage, Platform } from "@gotomemory/contracts";

export interface SiteAdapter {
  platform: Platform;
  host: string;
  messageSelector: string;
  inputSelector: string;
  mountSelector: string;
  extractMessages(root?: ParentNode): ConversationMessage[];
  insertIntoPrompt(text: string, root?: ParentNode): boolean;
  findMount(root?: ParentNode): Element | null;
}

export const adapters: Record<Platform, SiteAdapter> = {
  chatgpt: createAdapter({
    platform: "chatgpt",
    host: "chatgpt.com",
    messageSelector: "[data-message-author-role]",
    inputSelector: "textarea, [contenteditable='true']",
    mountSelector: "main"
  }),
  claude: createAdapter({
    platform: "claude",
    host: "claude.ai",
    messageSelector: "[data-testid='user-message'], [data-testid='assistant-message']",
    inputSelector: "[contenteditable='true'], textarea",
    mountSelector: "main"
  }),
  gemini: createAdapter({
    platform: "gemini",
    host: "gemini.google.com",
    messageSelector: "user-query, model-response, [data-message-role]",
    inputSelector: "[contenteditable='true'], textarea",
    mountSelector: "main"
  })
};

export function getAdapterForUrl(url: string): SiteAdapter | undefined {
  const host = new URL(url).host;
  return Object.values(adapters).find(
    (adapter) => host === adapter.host || host.endsWith(`.${adapter.host}`)
  );
}

function createAdapter(
  config: Omit<SiteAdapter, "extractMessages" | "insertIntoPrompt" | "findMount">
): SiteAdapter {
  return {
    ...config,
    extractMessages(root: ParentNode = document) {
      return Array.from(root.querySelectorAll(config.messageSelector))
        .map((element) => toMessage(config.platform, element))
        .filter((message): message is ConversationMessage => Boolean(message));
    },
    insertIntoPrompt(text: string, root: ParentNode = document) {
      const input = root.querySelector(config.inputSelector);
      if (!input) {
        return false;
      }

      if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) {
        input.value = appendText(input.value, text);
        input.dispatchEvent(
          new InputEvent("input", { bubbles: true, inputType: "insertText", data: text })
        );
        return true;
      }

      if (input instanceof HTMLElement && input.isContentEditable) {
        input.textContent = appendText(input.textContent ?? "", text);
        input.dispatchEvent(
          new InputEvent("input", { bubbles: true, inputType: "insertText", data: text })
        );
        return true;
      }

      return false;
    },
    findMount(root: ParentNode = document) {
      return root.querySelector(config.mountSelector);
    }
  };
}

function toMessage(platform: Platform, element: Element): ConversationMessage | undefined {
  const explicitRole =
    element.getAttribute("data-message-author-role") ?? element.getAttribute("data-message-role");
  const role =
    explicitRole === "user" || explicitRole === "assistant"
      ? explicitRole
      : inferRoleFromElement(platform, element);
  const content = element.textContent?.trim();

  if (!role || !content) {
    return undefined;
  }

  return { role, content };
}

function inferRoleFromElement(
  platform: Platform,
  element: Element
): ConversationMessage["role"] | undefined {
  if (platform === "claude") {
    const testId = element.getAttribute("data-testid");
    if (testId === "user-message") {
      return "user";
    }
    if (testId === "assistant-message") {
      return "assistant";
    }
  }

  if (platform === "gemini") {
    if (element.tagName.toLocaleLowerCase() === "user-query") {
      return "user";
    }
    if (element.tagName.toLocaleLowerCase() === "model-response") {
      return "assistant";
    }
  }

  return undefined;
}

function appendText(existing: string, text: string): string {
  return existing ? `${existing}\n\n${text}` : text;
}
