/**
 * ChatGPT-shaped conversation fixtures served to the loaded extension.
 *
 * The DOM mirrors the structures the site adapters and the DOM→Markdown
 * serializer rely on: `[data-message-author-role]` turns, `whitespace-pre-wrap`
 * user bubbles, a rendered assistant code block whose language label and copy
 * button live inside <pre> but outside <code>, and a contenteditable composer
 * (`#prompt-textarea`) so injection exercises the execCommand path that only a
 * real browser can run.
 */

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="zh">
<head><meta charset="utf-8"><title>${title}</title></head>
<body>
<main>${body}</main>
</body>
</html>`;
}

const COMPOSER = `<div id="prompt-textarea" contenteditable="true" style="min-height:40px;border:1px solid #ccc"></div>`;

/** Conversation A: the memory source the user saves from. */
export const SEED_CONVERSATION_PATH = "/c/seed-conv";
export const SEED_CONVERSATION = page(
  "TypeScript 偏好讨论",
  `
  <div data-message-author-role="user"><div class="whitespace-pre-wrap">以后代码示例优先用 TypeScript</div></div>
  <div data-message-author-role="assistant"><div class="markdown prose">
    <p>好的，例如：</p>
    <pre><div class="contain-inline-size">
      <div class="flex items-center px-4">ts</div>
      <div class="sticky top-9"><button aria-label="Copy"><span>Copy code</span></button></div>
      <code class="hljs language-ts">const x: number = 1;</code>
    </div></pre>
  </div></div>
  ${COMPOSER}`
);

/** Conversation B: a different thread where the saved memory should inject. */
export const TARGET_CONVERSATION_PATH = "/c/target-conv";
export const TARGET_CONVERSATION = page(
  "新项目求助",
  `
  <div data-message-author-role="user"><div class="whitespace-pre-wrap">帮我看看这个 TypeScript 项目的配置</div></div>
  ${COMPOSER}`
);

export function routeFixture(url: string): string | null {
  const pathname = new URL(url, "http://fixture.local").pathname;
  if (pathname === SEED_CONVERSATION_PATH) {
    return SEED_CONVERSATION;
  }
  if (pathname === TARGET_CONVERSATION_PATH) {
    return TARGET_CONVERSATION;
  }
  return null;
}
