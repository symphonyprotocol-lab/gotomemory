import { defineConfig } from "wxt";

export default defineConfig({
  manifest: {
    name: "gotomemory",
    description: "Inject user-authorized memory into ChatGPT, Claude, and Gemini.",
    permissions: ["storage", "activeTab"],
  },
});
