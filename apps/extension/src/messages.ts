import type { Platform } from "./platform.js";

/**
 * Message protocol between the popup (network + UI) and the content script (DOM). The
 * content script never calls the gateway; the popup never touches the page DOM. Keeping
 * the two split means the privileged network surface stays in one place.
 */
export type ExtMessage =
  | { type: "PING" }
  | { type: "GET_SELECTION" }
  | { type: "INJECT"; text: string };

export interface PingResult {
  platform: Platform | null;
  title: string;
  url: string;
}

export interface SelectionResult {
  text: string;
}

export interface InjectResult {
  ok: boolean;
  reason?: string;
}

const TYPES = new Set(["PING", "GET_SELECTION", "INJECT"]);

export function isExtMessage(value: unknown): value is ExtMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    TYPES.has((value as { type: string }).type)
  );
}
