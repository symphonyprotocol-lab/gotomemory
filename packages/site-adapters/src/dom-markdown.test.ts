// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { serializeElementToMarkdown } from "./dom-markdown.js";
import { adapters } from "./index.js";

function element(html: string): Element {
  document.body.innerHTML = html;
  return document.body.firstElementChild!;
}

describe("DOM→Markdown serialization", () => {
  it("re-fences a ChatGPT-style rendered code block and drops its copy chrome", () => {
    // Mirrors chatgpt.com's rendered structure: the language label and copy
    // button live inside <pre> but outside <code>.
    const el = element(`
      <div class="markdown prose">
        <p>Use this:</p>
        <pre><div class="contain-inline-size rounded-md border">
          <div class="flex items-center justify-between px-4">python</div>
          <div class="sticky top-9"><button aria-label="Copy"><span>Copy code</span></button></div>
          <div class="overflow-y-auto"><code class="hljs language-python">def add(a, b):
    return a + b</code></div>
        </div></pre>
      </div>`);

    const markdown = serializeElementToMarkdown(el);
    expect(markdown).toContain("Use this:");
    expect(markdown).toContain("```python\ndef add(a, b):\n    return a + b\n```");
    expect(markdown).not.toContain("Copy code");
    // The floating label is dropped; "python" appears only in the fence info.
    expect(markdown.match(/python/g)).toHaveLength(1);
  });

  it("re-derives pipe tables from rendered <table> markup", () => {
    const el = element(`
      <div><table>
        <thead><tr><th>Name</th><th>Score</th></tr></thead>
        <tbody>
          <tr><td>Ada</td><td>100</td></tr>
          <tr><td>Bob | Bo</td><td>42</td></tr>
        </tbody>
      </table></div>`);

    expect(serializeElementToMarkdown(el)).toBe(
      ["| Name | Score |", "| --- | --- |", "| Ada | 100 |", "| Bob \\| Bo | 42 |"].join("\n")
    );
  });

  it("recovers TeX from KaTeX annotations for display and inline math", () => {
    const el = element(`
      <div>
        <span class="katex-display"><span class="katex">
          <span class="katex-mathml"><math><semantics><mrow></mrow>
            <annotation encoding="application/x-tex">\\int_0^1 x\\,dx = \\frac{1}{2}</annotation>
          </semantics></math></span>
          <span class="katex-html" aria-hidden="true">∫01xdx=21</span>
        </span></span>
        <p>Energy is <span class="katex">
          <span class="katex-mathml"><math><semantics><mrow></mrow>
            <annotation encoding="application/x-tex">E=mc^2</annotation>
          </semantics></math></span>
          <span class="katex-html" aria-hidden="true">E=mc2</span>
        </span> at rest.</p>
      </div>`);

    const markdown = serializeElementToMarkdown(el);
    expect(markdown).toContain("$$\n\\int_0^1 x\\,dx = \\frac{1}{2}\n$$");
    expect(markdown).toContain("Energy is $E=mc^2$ at rest.");
    // The aria-hidden visual rendering must not leak in as duplicate text.
    expect(markdown).not.toContain("∫01");
  });

  it("keeps images, links, emphasis, inline code, and lists", () => {
    const el = element(`
      <div>
        <p><img src="https://example.com/d.png" alt="diagram"></p>
        <p>See <a href="https://example.com/doc">the doc</a> for <strong>bold</strong>,
           <em>italic</em>, <del>gone</del> and <code>inline()</code>.</p>
        <ul><li>one</li><li>two<ul><li>nested</li></ul></li></ul>
        <ol><li>first</li><li>second</li></ol>
        <blockquote><p>quoted</p></blockquote>
        <h3>Sub heading</h3>
        <hr>
      </div>`);

    const markdown = serializeElementToMarkdown(el);
    expect(markdown).toContain("![diagram](https://example.com/d.png)");
    expect(markdown).toContain("[the doc](https://example.com/doc)");
    expect(markdown).toContain("**bold**");
    expect(markdown).toContain("*italic*");
    expect(markdown).toContain("~~gone~~");
    expect(markdown).toContain("`inline()`");
    expect(markdown).toContain("- one\n- two\n  - nested");
    expect(markdown).toContain("1. first\n2. second");
    expect(markdown).toContain("> quoted");
    expect(markdown).toContain("### Sub heading");
    expect(markdown).toContain("---");
  });

  it("drops unsafe image/link targets instead of emitting them", () => {
    const el = element(`
      <div>
        <p><img src="javascript:alert(1)" alt="x"></p>
        <p><a href="javascript:alert(1)">click</a></p>
      </div>`);

    const markdown = serializeElementToMarkdown(el);
    expect(markdown).not.toContain("javascript:");
    expect(markdown).toContain("click");
  });

  it("preserves line breaks in pre-wrap user bubbles and collapses them elsewhere", () => {
    const preWrap = element(
      `<div class="whitespace-pre-wrap">line one
line two</div>`
    );
    expect(serializeElementToMarkdown(preWrap)).toBe("line one\nline two");

    const normal = element(
      `<div><p>wrapped
      onto one line</p></div>`
    );
    expect(serializeElementToMarkdown(normal)).toBe("wrapped onto one line");
  });

  it("extends the fence when the code itself contains backticks", () => {
    const el = element(`<div><pre><code>a \`\`\` b</code></pre></div>`);
    expect(serializeElementToMarkdown(el)).toBe("````\na ``` b\n````");
  });
});

describe("adapter extraction with rendered structure", () => {
  it("captures a ChatGPT assistant turn with fidelity intact end to end", () => {
    document.body.innerHTML = `
      <main>
        <div data-message-author-role="user"><div class="whitespace-pre-wrap">show me the table
please</div></div>
        <div data-message-author-role="assistant"><div class="markdown prose">
          <p>Here you go:</p>
          <table><thead><tr><th>k</th></tr></thead><tbody><tr><td>v</td></tr></tbody></table>
          <pre><div><div class="px-4">ts</div><button>Copy code</button><code class="language-ts">const x = 1;</code></div></pre>
        </div></div>
      </main>`;

    const [user, assistant] = adapters.chatgpt.extractMessages();
    expect(user?.content).toBe("show me the table\nplease");
    expect(assistant?.content).toContain("| k |\n| --- |\n| v |");
    expect(assistant?.content).toContain("```ts\nconst x = 1;\n```");
    expect(assistant?.content).not.toContain("Copy code");
  });

  it("captures a Gemini model response without icon ligature noise", () => {
    document.body.innerHTML = `
      <main>
        <model-response><message-content><div class="markdown">
          <p>Run:</p>
          <code-block>
            <div class="code-block-decoration"><span>bash</span>
              <button mat-icon-button><mat-icon>content_copy</mat-icon></button></div>
            <div class="formatted-code-block-internal-container">
              <pre><code class="language-bash">echo hi</code></pre></div>
          </code-block>
        </div></message-content>
        <div class="response-footer"><button><mat-icon>thumb_up</mat-icon></button></div>
        </model-response>
      </main>`;

    const [message] = adapters.gemini.extractMessages();
    expect(message?.role).toBe("assistant");
    expect(message?.content).toContain("Run:");
    expect(message?.content).toContain("```bash\necho hi\n```");
    expect(message?.content).not.toContain("content_copy");
    expect(message?.content).not.toContain("thumb_up");
  });

  it("captures a Claude response, ignoring its code-block header chrome", () => {
    document.body.innerHTML = `
      <main>
        <div class="font-claude-response">
          <p>Try:</p>
          <pre><div><div class="text-text-300">typescript</div>
            <div class="sticky"><button>Copy</button></div>
            <code class="language-typescript">let a = 2;</code></div></pre>
        </div>
      </main>`;

    const [message] = adapters.claude.extractMessages();
    expect(message?.content).toContain("```typescript\nlet a = 2;\n```");
    expect(message?.content).not.toContain("Copy");
  });
});
