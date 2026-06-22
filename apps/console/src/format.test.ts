import { describe, expect, it } from "vitest";
import { accessFlags, sensitivityVariant, shortId } from "./lib/format.js";

describe("format helpers", () => {
  it("maps sensitivity to badge variants", () => {
    expect(sensitivityVariant("secret")).toBe("destructive");
    expect(sensitivityVariant("private")).toBe("warning");
    expect(sensitivityVariant("normal")).toBe("secondary");
    expect(sensitivityVariant("public")).toBe("outline");
  });

  it("shortens long ids only", () => {
    expect(shortId("abcdef1234567")).toBe("abcdef12");
    expect(shortId("short")).toBe("short");
  });

  it("summarizes access flags", () => {
    expect(
      accessFlags({ can_read_content: true, can_inject: true, requires_confirmation: false }),
    ).toBe("read · inject");
    expect(
      accessFlags({ can_read_content: false, can_inject: false, requires_confirmation: true }),
    ).toBe("confirm");
  });
});
