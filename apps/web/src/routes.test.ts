import { describe, expect, it } from "vitest";

import { resolveRoute } from "./routes.js";

describe("web routing", () => {
  it("maps web routes to app screens", () => {
    expect(resolveRoute("/")).toBe("home");
    expect(resolveRoute("/manage")).toBe("home");
    expect(resolveRoute("/links")).toBe("home");
    expect(resolveRoute("/p/abcdefghijklmnopqrstuv")).toBe("home");
  });
});
