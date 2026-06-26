import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { App } from "./App.js";

describe("web app shell", () => {
  it("renders the web homepage with product capabilities", () => {
    const html = renderToStaticMarkup(<App pathname="/" />);

    expect(html).toContain("gotomemory");
    expect(html).toContain("浏览器扩展");
    expect(html).toContain("本地优先");
    expect(html).toContain("本机导出");
  });

  it("falls back to the homepage for non-public-share paths", () => {
    expect(renderToStaticMarkup(<App pathname="/manage" />)).toContain("浏览器扩展");
    expect(renderToStaticMarkup(<App pathname="/links" />)).toContain("浏览器扩展");
  });

  it("does not expose public share routes", () => {
    const html = renderToStaticMarkup(<App pathname="/p/abcdefghijklmnopqrstuv" />);
    expect(html).toContain("本机导出");
    expect(html).not.toContain("Shared conversation");
  });
});
