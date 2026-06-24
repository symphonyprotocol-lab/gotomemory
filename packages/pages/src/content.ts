import { createHash } from "node:crypto";
import type { PageKind } from "./types.js";

const MIME: Record<PageKind, string> = {
  html: "text/html",
  markdown: "text/markdown",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

export function mimeFor(kind: PageKind): string {
  return MIME[kind];
}

export function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export function decodeContent(
  content: string | undefined,
  contentBase64: string | undefined,
): string {
  if (content != null) return content;
  if (contentBase64 != null) return Buffer.from(contentBase64, "base64").toString("utf8");
  return "";
}
