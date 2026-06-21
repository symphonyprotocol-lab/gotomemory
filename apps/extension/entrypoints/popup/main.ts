import { createClient } from "@gotomemory/sdk";

const baseUrl = "http://localhost:8787/v1";
const token = "t1:u1";
const client = createClient({ baseUrl, token });

const root = document.getElementById("app");
if (root) {
  root.innerHTML = `
    <input id="q" placeholder="search memory" style="width:200px" />
    <button id="go">Search</button>
    <ul id="r" style="list-style:none;padding-left:0"></ul>`;

  const list = document.getElementById("r") as HTMLUListElement;
  document.getElementById("go")?.addEventListener("click", async () => {
    const q = (document.getElementById("q") as HTMLInputElement).value;
    try {
      const res = await client.memories.search({ query: q, platform: "claude" });
      list.innerHTML =
        res.items.map((i) => `<li>[${i.sensitivity}] ${i.summary_preview}</li>`).join("") ||
        "<li>(no results)</li>";
    } catch {
      list.innerHTML = "<li>error — is the gateway running?</li>";
    }
  });
}
