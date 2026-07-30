// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { App } from "./App.js";

// Tells React this is an act()-aware environment, so state updates flush
// synchronously instead of warning.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** jsdom pins navigator.language to en-US; pretend the visitor's browser differs. */
function withBrowserLanguages(tags: string[]): void {
  Object.defineProperty(window.navigator, "languages", { value: tags, configurable: true });
  Object.defineProperty(window.navigator, "language", { value: tags[0], configurable: true });
}

function render(): { container: HTMLElement; unmount: () => void } {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(<App pathname="/" />));
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    }
  };
}

describe("web language selection", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    withBrowserLanguages(["en-US"]);
    window.localStorage.clear();
  });

  it("defaults to the browser's language", () => {
    withBrowserLanguages(["zh-CN", "en-US"]);
    const { container, unmount } = render();

    expect(container.textContent).toContain("最好用的 AI 对话");
    expect(document.documentElement.lang).toBe("zh-CN");
    unmount();
  });

  it("falls back to English for a language we do not ship", () => {
    withBrowserLanguages(["de-DE"]);
    const { container, unmount } = render();

    expect(container.textContent).toContain("The best way to");
    expect(document.documentElement.lang).toBe("en-US");
    unmount();
  });

  it("switches language on click and remembers the choice", () => {
    withBrowserLanguages(["en-US"]);
    const first = render();

    act(() => {
      first.container.querySelector<HTMLButtonElement>('[data-testid="language-toggle"]')!.click();
    });

    expect(first.container.textContent).toContain("最好用的 AI 对话");
    expect(window.localStorage.getItem("gotomemory:locale")).toBe("zh");
    first.unmount();

    // A later visit keeps the choice, even though the browser still says en-US.
    const second = render();
    expect(second.container.textContent).toContain("最好用的 AI 对话");
    second.unmount();
  });

  it("updates the document title and lang when the language changes", () => {
    withBrowserLanguages(["en-US"]);
    const { container, unmount } = render();

    expect(document.title).toContain("Export AI chats");

    act(() => {
      container.querySelector<HTMLButtonElement>('[data-testid="language-toggle"]')!.click();
    });

    expect(document.documentElement.lang).toBe("zh-CN");
    expect(document.title).toContain("AI 对话导出");
    unmount();
  });
});
