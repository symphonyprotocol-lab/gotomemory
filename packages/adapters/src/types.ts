/** Input to every adapter. Memory is always low-privilege context, never a system rule. */
export interface AdapterInput {
  /** Stable behavior rules — go in the system/developer slot. */
  instructionRules: string;
  /** User-authorized memory context (from /context/build). Low-privilege. */
  memoryContext: string;
  /** The user's task or message. */
  userMessage: string;
}

/** Versioned capability declaration for a platform adapter (§7.3). */
export interface CapabilityManifest {
  apiFamily: string;
  payloadStrategy: string;
  /** Memory authority is always below system/developer rules. */
  memoryAuthority: "low";
  maxContextTokens: number;
  supportsToolResultMemory: boolean;
  supportsMidConversationInstruction: boolean;
  version: string;
}

/** Wrap memory with explicit boundary markers so it reads as data, not instructions. */
export function wrapMemory(context: string): string {
  return `[BEGIN USER-AUTHORIZED MEMORY]\n${context}\n[END USER-AUTHORIZED MEMORY]`;
}
