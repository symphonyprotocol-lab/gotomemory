import { defineContentScript } from "wxt/sandbox";

import { autoMount } from "../src/mount.js";

export default defineContentScript({
  matches: ["https://gemini.google.com/*"],
  runAt: "document_idle",
  main() {
    autoMount("gemini");
  }
});
