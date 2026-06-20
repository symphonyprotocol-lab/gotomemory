/**
 * Redaction for safe previews and embeddings (system spec §13.3). These patterns are a
 * defense-in-depth backstop, not a classifier — high-risk content should be marked
 * `secret` at write time regardless.
 */
const PATTERNS: Array<[RegExp, string]> = [
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]"],
  [/\b(?:sk|pk|ghp|gho|xox[baprs])[-_][A-Za-z0-9]{8,}\b/g, "[key]"],
  [/\b\d[\d -]{11,17}\d\b/g, "[number]"], // card-like 13-19 digits
  [/\b\d{3}-\d{2}-\d{4}\b/g, "[id]"], // ssn-like
  [/\b[A-Za-z0-9_-]{40,}\b/g, "[token]"], // long opaque tokens
];

/** Replace common sensitive patterns with neutral placeholders. */
export function redact(input: string): string {
  return PATTERNS.reduce((acc, [re, rep]) => acc.replace(re, rep), input);
}

/** True if the text contains a pattern that should never be a plain `normal` memory. */
export function containsSensitivePattern(input: string): boolean {
  return PATTERNS.some(([re]) => {
    re.lastIndex = 0;
    return re.test(input);
  });
}

/** Build a redacted, length-capped preview string for `summary_preview`. */
export function makePreview(summary: string, maxLen = 140): string {
  const r = redact(summary).trim();
  return r.length > maxLen ? `${r.slice(0, maxLen - 1)}…` : r;
}
