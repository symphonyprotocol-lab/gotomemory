import type { ContextResponse, Memory } from "@gotomemory/contracts";

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
