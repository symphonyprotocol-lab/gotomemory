import {
  createClient,
  type ContextBuildResponse,
  type CreateMemoryRequest,
  type SearchResponse,
  SdkError,
} from "@gotomemory/sdk";
import { Brain, Loader2, Plus, Search, Settings2, Sparkles } from "lucide-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { accessFlags, sensitivityVariant, shortId } from "@/lib/format";
import { cn } from "@/lib/utils";

const MEMORY_TYPES = ["preference", "fact", "note", "instruction", "credential_hint"] as const;

function useSetting(key: string, fallback: string): readonly [string, (v: string) => void] {
  const [value, setValue] = React.useState(() => globalThis.localStorage?.getItem(key) ?? fallback);
  React.useEffect(() => {
    globalThis.localStorage?.setItem(key, value);
  }, [key, value]);
  return [value, setValue] as const;
}

function errorText(err: unknown): string {
  return err instanceof SdkError ? `${err.code}: ${err.message}` : String(err);
}

export default function App(): React.JSX.Element {
  const [baseUrl, setBaseUrl] = useSetting("gm.baseUrl", "http://localhost:8787/v1");
  const [token, setToken] = useSetting("gm.token", "t1:u1");
  const [showSettings, setShowSettings] = React.useState(false);
  const client = React.useMemo(() => createClient({ baseUrl, token }), [baseUrl, token]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-8">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Brain className="size-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold leading-tight">gotomemory</h1>
              <p className="text-sm text-muted-foreground">Memory Control Plane</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowSettings((s) => !s)}
            aria-label="settings"
          >
            <Settings2 />
          </Button>
        </header>

        {showSettings && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Connection</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="baseUrl">Gateway base URL</Label>
                <Input id="baseUrl" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="token">Token</Label>
                <Input id="token" value={token} onChange={(e) => setToken(e.target.value)} />
              </div>
            </CardContent>
          </Card>
        )}

        <CreateCard client={client} />
        <SearchCard client={client} />
        <BuildCard client={client} />
      </div>
    </div>
  );
}

type Client = ReturnType<typeof createClient>;

function CreateCard({ client }: { client: Client }): React.JSX.Element {
  const [type, setType] = React.useState<(typeof MEMORY_TYPES)[number]>("preference");
  const [content, setContent] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<React.ReactNode>(null);

  async function save(): Promise<void> {
    if (!content.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await client.memories.create({
        scope: "personal",
        type: type as CreateMemoryRequest["type"],
        content,
        source: "user_explicit",
      });
      setContent("");
      setMsg(
        <span className="text-muted-foreground">
          Saved <code className="font-mono">{shortId(res.id)}</code> as{" "}
          <Badge variant={sensitivityVariant(res.sensitivity ?? "normal")}>{res.sensitivity}</Badge>
        </span>,
      );
    } catch (err) {
      setMsg(<span className="text-destructive">{errorText(err)}</span>);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Plus className="size-4 text-muted-foreground" /> Create
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <select
            value={type}
            onChange={(e) => setType(e.target.value as (typeof MEMORY_TYPES)[number])}
            className={cn(
              "h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            )}
          >
            {MEMORY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <Input
            className="min-w-[200px] flex-1"
            placeholder="memory content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void save()}
          />
          <Button onClick={() => void save()} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Plus />} Save
          </Button>
        </div>
        {msg && <p className="text-sm">{msg}</p>}
      </CardContent>
    </Card>
  );
}

function SearchCard({ client }: { client: Client }): React.JSX.Element {
  const [query, setQuery] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [items, setItems] = React.useState<SearchResponse["items"] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function run(): Promise<void> {
    if (!query.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await client.memories.search({ query, platform: "claude" });
      setItems(res.items);
    } catch (err) {
      setError(errorText(err));
      setItems(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Search className="size-4 text-muted-foreground" /> Search
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex gap-2">
          <Input
            placeholder="query"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void run()}
          />
          <Button variant="secondary" onClick={() => void run()} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Search />} Search
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {items && items.length === 0 && (
          <p className="text-sm text-muted-foreground">No memories.</p>
        )}
        {items && items.length > 0 && (
          <ul className="divide-y rounded-md border">
            {items.map((i) => (
              <li key={i.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <code className="font-mono text-xs text-muted-foreground">{shortId(i.id)}</code>
                <Badge variant={sensitivityVariant(i.sensitivity)}>{i.sensitivity}</Badge>
                <span className="flex-1 truncate">{i.summary_preview}</span>
                <span className="text-xs text-muted-foreground">{accessFlags(i.access)}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function BuildCard({ client }: { client: Client }): React.JSX.Element {
  const [task, setTask] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [res, setRes] = React.useState<ContextBuildResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  async function build(): Promise<void> {
    if (!task.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await client.context.build({ task, platform: "claude", client_id: "console" });
      setRes(r);
      setSelected(new Set((r.confirmation?.preview ?? []).map((p) => p.id)));
    } catch (err) {
      setError(errorText(err));
      setRes(null);
    } finally {
      setBusy(false);
    }
  }

  async function confirm(): Promise<void> {
    if (!res?.confirmation) return;
    setBusy(true);
    try {
      const r = await client.context.confirm({
        decision_id: res.decision_id,
        confirmation_token: res.confirmation.confirmation_token,
        confirmed_memory_ids: [...selected],
      });
      setRes(r);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Sparkles className="size-4 text-muted-foreground" /> Build context
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex gap-2">
          <Input
            placeholder="task"
            value={task}
            onChange={(e) => setTask(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void build()}
          />
          <Button onClick={() => void build()} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Sparkles />} Build
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}

        {res?.requires_confirmation && res.confirmation && (
          <div className="rounded-md border p-3">
            <p className="mb-2 text-sm text-muted-foreground">These memories need confirmation:</p>
            <ul className="flex flex-col gap-1">
              {(res.confirmation.preview ?? []).map((p) => (
                <li key={p.id}>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      onChange={(e) =>
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(p.id);
                          else next.delete(p.id);
                          return next;
                        })
                      }
                    />
                    <Badge variant={sensitivityVariant(p.sensitivity)}>{p.sensitivity}</Badge>
                    <span className="truncate">{p.summary_preview}</span>
                  </label>
                </li>
              ))}
            </ul>
            <Button className="mt-3" size="sm" onClick={() => void confirm()} disabled={busy}>
              Confirm &amp; inject
            </Button>
          </div>
        )}

        {res && !res.requires_confirmation && (
          <>
            <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs">
              {res.context ?? "(nothing injected)"}
            </pre>
            <p className="text-xs text-muted-foreground">
              decision <code className="font-mono">{res.decision_id}</code> · injected{" "}
              {res.memory_ids.length}
            </p>
            {res.omitted.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted-foreground">omitted:</span>
                {res.omitted.map((o) => (
                  <Badge key={o.memory_id} variant="outline">
                    {shortId(o.memory_id)} · {o.reason}
                  </Badge>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
