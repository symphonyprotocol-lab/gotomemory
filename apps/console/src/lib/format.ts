import type { SearchResponse } from "@gotomemory/sdk";

type Item = SearchResponse["items"][number];
type Sensitivity = Item["sensitivity"];
type BadgeVariant = "secondary" | "warning" | "destructive" | "outline";

/** Map a sensitivity level to a Badge variant (system spec colour cues). */
export function sensitivityVariant(sensitivity: Sensitivity): BadgeVariant {
  switch (sensitivity) {
    case "secret":
      return "destructive";
    case "private":
      return "warning";
    case "public":
      return "outline";
    default:
      return "secondary";
  }
}

export function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}

/** Human-readable access summary for a search result. */
export function accessFlags(access: Item["access"]): string {
  return [
    access.can_read_content ? "read" : "",
    access.can_inject ? "inject" : "",
    access.requires_confirmation ? "confirm" : "",
  ]
    .filter(Boolean)
    .join(" · ");
}
