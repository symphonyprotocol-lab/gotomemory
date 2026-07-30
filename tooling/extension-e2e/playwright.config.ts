import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./src",
  testMatch: /.*\.spec\.ts/,
  // One worker: the suite shares a single persistent browser context (the
  // loaded extension's background state is the thing under test).
  workers: 1,
  timeout: 60_000,
  reporter: "list"
});
