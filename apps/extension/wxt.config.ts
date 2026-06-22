import { defineConfig } from "wxt";

export default defineConfig({
  manifest: {
    name: "gotomemory",
    description: "Inject user-authorized memory into ChatGPT, Claude, and Gemini.",
    permissions: ["storage", "activeTab"],
    // Lets the popup reach a local gateway directly. Point the extension at a different
    // host in Settings, and add its origin here (or grant it at runtime) for non-local use.
    host_permissions: ["http://localhost/*", "http://127.0.0.1/*"],
  },
});
