import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { App } from "./App.js";

describe("web app shell", () => {
  it("renders the web homepage with export-first positioning", () => {
    const html = renderToStaticMarkup(<App pathname="/" locale="zh" />);

    expect(html).toContain("GotoMemory");
    expect(html).toContain("最好用的 AI 对话");
    expect(html).toContain("导出");
    expect(html).toContain("告诉一个助手，所有助手都记得");
    expect(html).toContain("浏览器扩展");
    expect(html).toContain("本地优先");
    expect(html).toContain("本机导出");
  });

  it("mentions export before cross-assistant memory in the hero", () => {
    const html = renderToStaticMarkup(<App pathname="/" locale="zh" />);

    const exportIndex = html.indexOf("最好用的 AI 对话");
    const memoryIndex = html.indexOf("告诉一个助手，所有助手都记得");
    expect(exportIndex).toBeGreaterThan(-1);
    expect(memoryIndex).toBeGreaterThan(-1);
    expect(exportIndex).toBeLessThan(memoryIndex);
  });

  it("falls back to the homepage for non-public-share paths", () => {
    expect(renderToStaticMarkup(<App pathname="/manage" locale="zh" />)).toContain("浏览器扩展");
    expect(renderToStaticMarkup(<App pathname="/links" locale="zh" />)).toContain("浏览器扩展");
  });

  it("does not expose public share routes", () => {
    const html = renderToStaticMarkup(<App pathname="/p/abcdefghijklmnopqrstuv" locale="zh" />);
    expect(html).toContain("本机导出");
    expect(html).not.toContain("Shared conversation");
  });
});

describe("web app header", () => {
  it("links to the repository from the header, labelled for screen readers", () => {
    const html = renderToStaticMarkup(<App pathname="/" locale="zh" />);
    const header = html.slice(0, html.indexOf("</header>"));

    expect(header).toContain("https://github.com/symphonyprotocol-lab/gotomemory");
    // Icon-only link: without the label it reads as an unnamed link.
    expect(header).toContain('aria-label="GitHub 仓库"');
    expect(header).toContain('rel="noreferrer"');
  });
});

describe("web app install guidance", () => {
  it("sends every install call-to-action to the install section", () => {
    const html = renderToStaticMarkup(<App pathname="/" locale="zh" />);

    // The nav button and the closing band both said "install" while pointing at
    // a feature section (and at "#", which did nothing at all).
    expect(html).toContain('href="#install"');
    expect(html).not.toContain('href="#"');
    const installLinks = html.match(/href="#install"/g) ?? [];
    expect(installLinks.length).toBeGreaterThanOrEqual(2);
  });

  it("points visitors at the store, not at a local build", () => {
    const html = renderToStaticMarkup(<App pathname="/" locale="zh" />);

    expect(html).toContain('id="install"');
    expect(html).toContain("从应用商店一键安装");
    // This page is for visitors, so build tooling has no business on it.
    expect(html).not.toContain("pnpm");
    expect(html).not.toContain("chrome://extensions");
    expect(html).not.toContain(".output");
  });

  it("keeps the install steps in order", () => {
    const html = renderToStaticMarkup(<App pathname="/" locale="en" />);

    const add = html.indexOf("Add to Chrome");
    const open = html.indexOf("Open an AI chat");
    const use = html.indexOf("Export a chat or save a memory");
    expect(add).toBeGreaterThan(-1);
    expect(add).toBeLessThan(open);
    expect(open).toBeLessThan(use);
  });

  /**
   * The store listing does not exist yet, so the section must say so rather
   * than link to a guessed URL that would land visitors on a store 404.
   */
  it("admits the listing is pending instead of faking an install link", () => {
    const html = renderToStaticMarkup(<App pathname="/" locale="zh" />);

    expect(html).toContain("正在上架应用商店");
    expect(html).toContain("github.com/symphonyprotocol-lab/gotomemory");
    expect(html).not.toContain("chromewebstore.google.com");
  });
});

describe("web app language", () => {
  it("renders the same page in English, with no Chinese left behind", () => {
    const html = renderToStaticMarkup(<App pathname="/" locale="en" />);

    expect(html).toContain("The best way to");
    expect(html).toContain("Tell one assistant, and they all remember");
    expect(html).toContain("Local-first");
    // The language toggle is the one place the other language may appear.
    const withoutToggle = html.replace(
      /<button[^>]*data-testid="language-toggle"[\s\S]*?<\/button>/,
      ""
    );
    expect(withoutToggle).not.toMatch(/[一-龥]/);
  });

  it("offers a switch to the other language, labelled in that language", () => {
    expect(renderToStaticMarkup(<App pathname="/" locale="en" />)).toContain(">中文</button>");
    expect(renderToStaticMarkup(<App pathname="/" locale="zh" />)).toContain(">EN</button>");
  });

  it("keeps export-before-memory ordering in English too", () => {
    const html = renderToStaticMarkup(<App pathname="/" locale="en" />);

    expect(html.indexOf("The best way to")).toBeLessThan(
      html.indexOf("Tell one assistant, and they all remember")
    );
  });
});
