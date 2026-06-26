export * from "../generated/client.js";
export * from "../generated/types.js";
export * from "./validation.js";

export const LOCAL_USER_ID = "local";
export const SUPPORTED_PLATFORMS = ["chatgpt", "claude", "gemini"] as const;

export function isSupportedPlatform(value: string): value is (typeof SUPPORTED_PLATFORMS)[number] {
  return SUPPORTED_PLATFORMS.includes(value as (typeof SUPPORTED_PLATFORMS)[number]);
}

export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${String(value)}`);
}
