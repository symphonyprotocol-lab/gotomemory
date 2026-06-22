import { containsSensitivePattern } from "@gotomemory/crypto";
import type { EmbeddingPolicy, Freshness, Sensitivity } from "@gotomemory/db";
import { sensitivityRank } from "@gotomemory/policy";

export interface Classification {
  sensitivity: Sensitivity;
  summarySensitivity: Sensitivity;
  embeddingPolicy: EmbeddingPolicy;
  freshness: Freshness;
}

/**
 * Minimal structural input for {@link classify}. A {@link CreateMemoryRequest} is assignable
 * here, and `updateMemory` reuses it so create and update share identical classification.
 */
export interface ClassifyInput {
  type: string;
  content: string;
  sensitivity?: Sensitivity;
  freshness?: Freshness;
  predicate?: string | null;
}

/**
 * Resolve the privacy-bearing fields for a candidate memory (§13.3, §14.1). Submitted
 * sensitivity is a floor, never a ceiling — detected secrets or credential hints upgrade it.
 */
export function classify(req: ClassifyInput): Classification {
  let sensitivity: Sensitivity = req.sensitivity ?? "normal";

  if (req.type === "credential_hint") {
    sensitivity = "secret";
  } else if (
    containsSensitivePattern(req.content) &&
    sensitivityRank(sensitivity) < sensitivityRank("private")
  ) {
    sensitivity = "private";
  }

  const embeddingPolicy: EmbeddingPolicy =
    sensitivity === "secret" ? "disabled" : sensitivity === "private" ? "redacted_only" : "allowed";

  const freshness: Freshness = req.freshness ?? (req.predicate ? "current_state" : "timeless");

  // summary_sensitivity must be >= sensitivity (§8.1).
  return { sensitivity, summarySensitivity: sensitivity, embeddingPolicy, freshness };
}

export function deriveSummary(content: string, maxLen = 160): string {
  const firstLine = content.split("\n")[0]?.trim() ?? content.trim();
  return firstLine.length > maxLen ? `${firstLine.slice(0, maxLen - 1)}…` : firstLine;
}
