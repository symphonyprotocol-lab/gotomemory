import type { MemoryCategory } from "@gotomemory/contracts";

/**
 * Signals that a line is a durable preference / project background / personal
 * fact rather than a one-off task. They tag saved memories and decide which
 * lines get suggested after an export, so a false positive is noise in the
 * suggestion box and a false negative silently drops a memory worth keeping.
 *
 * Both languages are covered by the same patterns. Two rules for the Latin
 * half: keywords are word-bounded (an unbounded "repo" also matched "report",
 * and "project" matched "projection"), and matching uses the `i` flag rather
 * than lower-casing the input first — `toLocaleLowerCase` turns "I" into a
 * dotless "ı" under a Turkish locale, which would break every "I am …"
 * pattern. Chinese needs neither: no case, no word boundaries.
 */

/** How the user wants things done — standing instructions and tastes. */
const PREFERENCE_SIGNALS =
  /prefer|\balways\b|\bnever\b|\busually\b|\btypically\b|\bnormally\b|\bby default\b|\bdefaults? to\b|\bi (?:like|love|hate|dislike|avoid)\b|\binstead of\b|\bstick to\b|\bfavou?rs?\b|\bkeep (?:it|them|things|responses|answers)\b|优先|喜欢|习惯|默认/i;

/** What the user is working on — the background a new chat has to be told. */
const PROJECT_SIGNALS =
  /\bprojects?\b|\brepo(?:s|sitory|sitories)?\b|\bmonorepo\b|\bcodebase\b|\bworking on\b|\bwe(?:'re| are) building\b|\bgoals?\b|\bobjectives?\b|\bmilestones?\b|\broadmap\b|\bdeadlines?\b|\bsprints?\b|仓库|项目|目标/i;

/** Who the user is — biography that stays true between conversations. */
const FACT_SIGNALS =
  /\bworks? (?:at|for)\b|\blives? in\b|\bbased in\b|\bi(?:'m| am) (?:an?|from)\b|\bmy name is\b|\bborn (?:in|on)\b|\bmy (?:company|team|employer|birthday|timezone)\b|负责|公司|位于|生日|出生|来自/i;

/** First match wins: preference, then project, then fact. */
export function inferCategory(content: string): MemoryCategory {
  if (PREFERENCE_SIGNALS.test(content)) {
    return "preference";
  }
  if (PROJECT_SIGNALS.test(content)) {
    return "project";
  }
  if (FACT_SIGNALS.test(content)) {
    return "fact";
  }
  return "other";
}
