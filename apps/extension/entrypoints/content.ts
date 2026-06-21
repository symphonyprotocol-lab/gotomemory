import { detectPlatform } from "../src/platform";

export default defineContentScript({
  matches: [
    "*://chatgpt.com/*",
    "*://chat.openai.com/*",
    "*://claude.ai/*",
    "*://gemini.google.com/*",
  ],
  main() {
    const platform = detectPlatform(location.hostname);
    if (platform) {
      // A real build would surface an "inject memory" affordance here; the popup drives it.
      console.info(`gotomemory: active on ${platform}`);
    }
  },
});
