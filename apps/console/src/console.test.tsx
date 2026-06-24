import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App.js";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

describe("console App", () => {
  it("renders the integrated home entry", () => {
    window.history.pushState(null, "", "/");
    render(<App />);
    expect(screen.getByRole("heading", { name: "Gotomemory", level: 2 })).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /explore capabilities/i }).length).toBeGreaterThan(
      0,
    );
    expect(screen.getAllByRole("link", { name: /developer surfaces/i }).length).toBeGreaterThan(0);
  });

  it("keeps removed console and pages routes on the home entry", () => {
    window.history.pushState(null, "", "/console");
    render(<App />);
    expect(screen.getByRole("heading", { name: "Gotomemory", level: 2 })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /search/i })).toBeNull();
    cleanup();

    window.history.pushState(null, "", "/pages");
    render(<App />);
    expect(screen.getByRole("heading", { name: "Gotomemory", level: 2 })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /publish/i })).toBeNull();
  });

  it("signs in with a provider and opens the dashboard", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              access_token: "gtms_test",
              token_type: "Bearer",
              expires_at: "2026-07-01T00:00:00.000Z",
              user: {
                id: "usr_google_mock-google-user-1",
                tenant_id: "t1",
                provider: "google",
                provider_user_id: "mock-google-user-1",
                email: "user@gmail.com",
                name: "Google User",
              },
            }),
            { status: 201, headers: { "content-type": "application/json" } },
          ),
      ),
    );
    window.history.pushState(null, "", "/login");
    render(<App />);

    expect(screen.getByRole("button", { name: /continue with google/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /continue with github/i })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /continue with google/i }));

    const heading = await screen.findByRole("heading", { name: "Dashboard", level: 2 });
    expect(window.location.pathname).toBe("/dashboard");
    expect(heading).toBeTruthy();
    expect(fetch).toHaveBeenCalled();
    expect(screen.getByText(/signed in as user@gmail.com/i)).toBeTruthy();
  });
});
