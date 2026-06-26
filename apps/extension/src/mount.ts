import type { Platform } from "@gotomemory/contracts";
import { adapters } from "@gotomemory/site-adapters";

export function mountContentScript(platform: Platform, root: ParentNode = document): boolean {
  const adapter = adapters[platform];
  const mount = adapter.findMount(root);
  if (!mount || root.querySelector?.("[data-gotomemory-mounted='true']")) {
    return false;
  }

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "gotomemory";
  button.setAttribute("data-gotomemory-mounted", "true");
  button.addEventListener("click", () => {
    const messages = adapter.extractMessages(root);
    const latestTopic = messages.at(-1)?.content ?? "";
    adapter.insertIntoPrompt(`\n\n[gotomemory]\n${latestTopic}`, root);
  });
  mount.append(button);
  return true;
}
