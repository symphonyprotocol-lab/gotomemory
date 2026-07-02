import { defineContentScript } from "wxt/sandbox";

import { autoMount } from "../src/mount.js";

export default defineContentScript({
  matches: ["https://claude.ai/*"],
  runAt: "document_idle",
  main() {
    autoMount("claude");
  }
});
