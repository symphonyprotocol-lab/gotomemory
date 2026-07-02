import { defineContentScript } from "wxt/sandbox";

import { autoMount } from "../src/mount.js";

export default defineContentScript({
  matches: ["https://chatgpt.com/*"],
  runAt: "document_idle",
  main() {
    autoMount("chatgpt");
  }
});
