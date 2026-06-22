import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import App from "./App.js";

afterEach(cleanup);

describe("console App", () => {
  it("renders the shell with the core actions", () => {
    render(<App />);
    expect(screen.getByText("gotomemory")).toBeTruthy();
    expect(screen.getByRole("button", { name: /search/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /build/i })).toBeTruthy();
    expect(screen.getByPlaceholderText("query")).toBeTruthy();
  });
});
