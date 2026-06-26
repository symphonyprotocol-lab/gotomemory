import type { ContextResponse, Memory, SharedConversation } from "@gotomemory/contracts";
import { renderConversationHtml } from "@gotomemory/render";

export interface MemoryPanelProps {
  context: ContextResponse;
  selectedPrivateIds?: string[];
}

export function MemoryPanel({ context, selectedPrivateIds = [] }: MemoryPanelProps) {
  return (
    <section aria-label="gotomemory context">
      <MemoryGroup title="Ready" memories={context.ready} />
      <MemoryGroup
        title="Confirm"
        memories={context.needs_confirm.filter((memory) => selectedPrivateIds.includes(memory.id))}
      />
    </section>
  );
}

export function SharePreview({ share }: { share: SharedConversation }) {
  return (
    <article aria-label={share.title}>
      <h1>{share.title}</h1>
      <div dangerouslySetInnerHTML={{ __html: renderConversationHtml(share.messages) }} />
    </article>
  );
}

function MemoryGroup({ title, memories }: { title: string; memories: Memory[] }) {
  return (
    <section>
      <h2>{title}</h2>
      <ul>
        {memories.map((memory) => (
          <li key={memory.id}>{memory.content}</li>
        ))}
      </ul>
    </section>
  );
}
