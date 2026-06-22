/**
 * Pure helper for textarea-style editors: append the new context below any draft the user
 * already typed, rather than clobbering it. DOM mutation itself lives in the content script
 * (entrypoints/content.ts); this part is split out so it is unit-testable.
 */
export function composeTextareaValue(existing: string, text: string): string {
  return existing.trim() ? `${existing}\n\n${text}` : text;
}
