import {
  type AuthProvider,
  createClient,
  type ContextBuildResponse,
  type CreateMemoryRequest,
  type CreatePageRequest,
  type PageResponse,
  type PublicPageResponse,
  type SearchResponse,
  SdkError,
} from "@gotomemory/sdk";
import {
  ArrowRight,
  Brain,
  CheckCircle2,
  Database,
  ExternalLink,
  FileText,
  Github,
  Globe2,
  KeyRound,
  Layers3,
  Link2,
  LogOut,
  Loader2,
  LockKeyhole,
  LayoutDashboard,
  Moon,
  Network,
  Plus,
  RefreshCw,
  Search,
  SearchX,
  Share2,
  ShieldCheck,
  Sparkles,
  Sun,
  Trash2,
  UserRound,
  Workflow,
} from "lucide-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { accessFlags, sensitivityVariant, shortId } from "@/lib/format";
import { buildSandboxedDocument, renderSharedPage } from "@/lib/page-render";
import { cn } from "@/lib/utils";

const MEMORY_TYPES = ["preference", "fact", "note", "instruction", "credential_hint"] as const;
const PAGE_KINDS = ["html", "markdown", "pdf", "docx", "xlsx", "pptx"] as const;
const PAGE = 8;

type Route = "home" | "login" | "dashboard" | "share";
type Client = ReturnType<typeof createClient>;
type UserSession = {
  accessToken: string;
  expiresAt: string;
  provider: AuthProvider;
  user: {
    id: string;
    tenant_id: string;
    provider: AuthProvider;
    provider_user_id: string;
    email: string;
    name: string;
    avatar_url?: string;
  };
};

function currentRoute(): { route: Route; slug?: string } {
  const path = globalThis.location?.pathname ?? "/";
  if (path.startsWith("/p/")) return { route: "share", slug: decodeURIComponent(path.slice(3)) };
  if (path === "/login") return { route: "login" };
  if (path === "/dashboard") return { route: "dashboard" };
  return { route: "home" };
}

function useRoute(): readonly [{ route: Route; slug?: string }, (path: string) => void] {
  const [route, setRoute] = React.useState(currentRoute);
  React.useEffect(() => {
    const onPop = () => setRoute(currentRoute());
    globalThis.addEventListener?.("popstate", onPop);
    return () => globalThis.removeEventListener?.("popstate", onPop);
  }, []);
  const navigate = React.useCallback((path: string) => {
    globalThis.history?.pushState(null, "", path);
    setRoute(currentRoute());
  }, []);
  return [route, navigate] as const;
}

function useSetting(key: string, fallback: string): readonly [string, (v: string) => void] {
  const [value, setValue] = React.useState(() => globalThis.localStorage?.getItem(key) ?? fallback);
  React.useEffect(() => {
    globalThis.localStorage?.setItem(key, value);
  }, [key, value]);
  return [value, setValue] as const;
}

function useTheme(): readonly [boolean, () => void] {
  const [dark, setDark] = React.useState(() => {
    const saved = globalThis.localStorage?.getItem("gm.theme");
    if (saved) return saved === "dark";
    return globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  });
  React.useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    globalThis.localStorage?.setItem("gm.theme", dark ? "dark" : "light");
  }, [dark]);
  return [dark, () => setDark((d) => !d)] as const;
}

function readSession(): UserSession | null {
  const raw = globalThis.localStorage?.getItem("gm.session");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserSession;
  } catch {
    globalThis.localStorage?.removeItem("gm.session");
    return null;
  }
}

function useSession(): readonly [UserSession | null, (session: UserSession) => void, () => void] {
  const [session, setSession] = React.useState<UserSession | null>(readSession);

  const saveSession = React.useCallback((next: UserSession) => {
    globalThis.localStorage?.setItem("gm.session", JSON.stringify(next));
    setSession(next);
  }, []);

  const signOut = React.useCallback(() => {
    globalThis.localStorage?.removeItem("gm.session");
    setSession(null);
  }, []);

  return [session, saveSession, signOut] as const;
}

function mockLoginCredential(provider: AuthProvider) {
  return provider === "google"
    ? {
        provider,
        provider_user_id: "mock-google-user-1",
        email: "user@gmail.com",
        name: "Google User",
        mock_access_token: "mock_google_local_credential",
      }
    : {
        provider,
        provider_user_id: "mock-github-user-1",
        email: "user@github.local",
        name: "GitHub User",
        mock_access_token: "mock_github_local_credential",
      };
}

function errorText(err: unknown): string {
  return err instanceof SdkError ? `${err.code}: ${err.message}` : String(err);
}

function parseExpires(value: string): CreatePageRequest["expires_in"] | undefined {
  if (!value.trim()) return undefined;
  const match = /^(\d+)\s*([hd])$/i.exec(value.trim());
  if (!match) throw new Error("expires must look like 2h or 1d");
  const amount = Number(match[1]);
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("expires must be positive");
  return {
    value: amount,
    unit: match[2]!.toLowerCase() === "h" ? "hours" : "days",
  };
}

export default function App(): React.JSX.Element {
  const [baseUrl] = useSetting("gm.baseUrl", "http://localhost:8787/v1");
  const [devToken] = useSetting("gm.token", "t1:u1");
  const [dark, toggleTheme] = useTheme();
  const [session, saveSession, clearSession] = useSession();
  const [route, navigate] = useRoute();
  const authClient = React.useMemo(() => createClient({ baseUrl }), [baseUrl]);
  const client = React.useMemo(
    () => createClient({ baseUrl, token: session?.accessToken ?? devToken }),
    [baseUrl, devToken, session?.accessToken],
  );
  // The public share view must not present the dev token — sending `t1:u1` would let an
  // anonymous visitor read private pages owned by that dev identity. Use only a real session
  // token (or no credential) so private pages stay gated to their owner.
  const shareClient = React.useMemo(
    () =>
      createClient({ baseUrl, ...(session?.accessToken ? { token: session.accessToken } : {}) }),
    [baseUrl, session?.accessToken],
  );

  const loginWithProvider = React.useCallback(
    async (provider: AuthProvider) => {
      const res = await authClient.auth.login(mockLoginCredential(provider));
      saveSession({
        accessToken: res.access_token,
        expiresAt: res.expires_at,
        provider: res.user.provider,
        user: res.user,
      });
      navigate("/dashboard");
    },
    [authClient, navigate, saveSession],
  );

  const signOut = React.useCallback(async () => {
    if (session?.accessToken) await client.auth.logout();
    clearSession();
    navigate("/");
  }, [clearSession, client, navigate, session?.accessToken]);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <ShellHeader
        dark={dark}
        onTheme={toggleTheme}
        session={session}
        onNavigate={navigate}
        onSignOut={signOut}
      />

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-5 px-4 pb-8 pt-28">
        {route.route === "home" && <HomeView />}
        {route.route === "login" && <LoginView onSignIn={loginWithProvider} />}
        {route.route === "dashboard" &&
          (session ? (
            <DashboardView session={session} client={client} />
          ) : (
            <LoginView onSignIn={loginWithProvider} />
          ))}
        {route.route === "share" && <SharedPageView client={shareClient} slug={route.slug ?? ""} />}
      </main>

      <SiteFooter />
    </div>
  );
}

function ShellHeader({
  dark,
  onTheme,
  session,
  onNavigate,
  onSignOut,
}: {
  dark: boolean;
  onTheme: () => void;
  session: UserSession | null;
  onNavigate: (path: string) => void;
  onSignOut: () => void | Promise<void>;
}): React.JSX.Element {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          className="flex w-fit items-center gap-3 text-left"
          type="button"
          onClick={() => onNavigate("/")}
        >
          <BrandMark size="lg" tone="light" />
          <div>
            <h1 className="text-lg font-semibold leading-tight">Gotomemory</h1>
          </div>
        </button>
        <div className="flex flex-wrap items-center gap-1">
          {session ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => onNavigate("/dashboard")}>
                <LayoutDashboard /> Dashboard
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => void onSignOut()}
                aria-label="sign out"
              >
                <LogOut />
              </Button>
            </>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => onNavigate("/login")}>
              <UserRound /> Sign in
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={onTheme} aria-label="toggle theme">
            {dark ? <Sun /> : <Moon />}
          </Button>
        </div>
      </div>
    </header>
  );
}

function BrandMark({
  size = "md",
  tone = "light",
}: {
  size?: "sm" | "md" | "lg";
  tone?: "light" | "dark";
}): React.JSX.Element {
  const sizeClass =
    size === "sm" ? "size-10 rounded-md" : size === "lg" ? "size-10 rounded-lg" : "size-11";
  const svgClass = size === "sm" ? "size-7" : size === "lg" ? "size-7" : "size-8";

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg",
        sizeClass,
        tone === "light" ? "bg-white text-black" : "bg-black text-white",
      )}
      aria-hidden="true"
    >
      <Share2 className={svgClass} strokeWidth={2.3} />
    </div>
  );
}

function SiteFooter(): React.JSX.Element {
  return (
    <footer className="border-t bg-muted/30">
      <div className="mx-auto grid max-w-5xl gap-6 px-4 py-8 md:grid-cols-[1.2fr_0.8fr_0.8fr]">
        <div>
          <div className="mb-3 flex items-center gap-2">
            <BrandMark size="sm" tone="dark" />
            <span className="font-semibold">Gotomemory</span>
          </div>
          <p className="max-w-md text-sm leading-6 text-muted-foreground">
            Governed memory and sharing for agents, apps, and generated artifacts.
          </p>
        </div>

        <div>
          <h4 className="mb-3 text-sm font-semibold">Product</h4>
          <div className="grid gap-2 text-sm text-muted-foreground">
            <a className="w-fit hover:text-foreground" href="#capabilities">
              Capabilities
            </a>
            <a className="w-fit hover:text-foreground" href="#security">
              Security model
            </a>
            <a className="w-fit hover:text-foreground" href="#developers">
              Developer surfaces
            </a>
          </div>
        </div>

        <div>
          <h4 className="mb-3 text-sm font-semibold">Local endpoints</h4>
          <div className="grid gap-2 text-sm text-muted-foreground">
            <code className="break-all rounded-md bg-background px-2 py-1 font-mono text-xs">
              http://localhost:5173
            </code>
            <code className="break-all rounded-md bg-background px-2 py-1 font-mono text-xs">
              http://localhost:8787/v1
            </code>
          </div>
        </div>
      </div>
    </footer>
  );
}

function LoginView({
  onSignIn,
}: {
  onSignIn: (provider: AuthProvider) => Promise<void>;
}): React.JSX.Element {
  const [busyProvider, setBusyProvider] = React.useState<AuthProvider | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(provider: AuthProvider): Promise<void> {
    setBusyProvider(provider);
    setError(null);
    try {
      await onSignIn(provider);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusyProvider(null);
    }
  }

  return (
    <section className="grid min-h-[620px] overflow-hidden rounded-xl border bg-card md:grid-cols-[0.92fr_1.08fr]">
      <div className="flex flex-col justify-between gap-8 bg-primary p-6 text-primary-foreground md:p-8">
        <div>
          <div className="mb-5 flex items-center gap-3">
            <BrandMark size="sm" tone="dark" />
            <span className="text-sm font-medium text-primary-foreground/75">Gotomemory</span>
          </div>
          <h2 className="max-w-md text-3xl font-semibold leading-tight sm:text-4xl">
            Sign in to your memory workspace.
          </h2>
          <p className="mt-4 max-w-md text-sm leading-6 text-primary-foreground/70">
            Keep agent context, shared artifacts, and governed access tied to one account.
          </p>
        </div>
        <div className="grid gap-3 text-sm text-primary-foreground/75">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4 text-primary-foreground" />
            Provider identity for team-ready access
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4 text-primary-foreground" />
            One dashboard for memories and shares
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4 text-primary-foreground" />
            Secure account state across browser sessions
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center px-5 py-10 md:px-10">
        <Card className="w-full max-w-md border-0 shadow-none">
          <CardHeader className="px-0">
            <CardTitle className="text-2xl">Welcome back</CardTitle>
            <CardDescription>
              Choose an identity provider to continue to your dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 px-0">
            <Button
              className="h-11 justify-start px-4"
              variant="outline"
              onClick={() => void submit("google")}
              disabled={busyProvider !== null}
            >
              {busyProvider === "google" ? (
                <Loader2 className="animate-spin" />
              ) : (
                <span className="flex size-4 items-center justify-center text-sm font-semibold">
                  G
                </span>
              )}
              Continue with Google
            </Button>
            <Button
              className="h-11 justify-start px-4"
              variant="outline"
              onClick={() => void submit("github")}
              disabled={busyProvider !== null}
            >
              {busyProvider === "github" ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Github className="size-4" />
              )}
              Continue with GitHub
            </Button>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <p className="pt-3 text-xs leading-5 text-muted-foreground">
              Access stays scoped to your selected provider identity.
            </p>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function DashboardView({
  session,
  client,
}: {
  session: UserSession;
  client: Client;
}): React.JSX.Element {
  const providerLabel = session.user.provider === "google" ? "Google" : "GitHub";

  return (
    <div className="grid gap-6 pb-10">
      <section className="rounded-xl border bg-card p-6 md:p-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div>
            <Badge variant="secondary">{providerLabel} account</Badge>
            <h2 className="mt-3 text-3xl font-semibold leading-tight">Dashboard</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Signed in as {session.user.email}. Your memory workspace is ready.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Session expires {new Date(session.expiresAt).toLocaleString()}.
            </p>
          </div>
          <div className="flex size-14 items-center justify-center rounded-xl border bg-background">
            <UserRound className="size-7" />
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <DashboardMetric icon={Brain} label="Memories" value="Ready" />
        <DashboardMetric icon={FileText} label="Shared pages" value="Ready" />
        <DashboardMetric icon={ShieldCheck} label="Policy checks" value="Active" />
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border bg-card p-5">
          <div className="mb-4 flex items-center gap-2">
            <Database className="size-5 text-sky-600" />
            <h3 className="font-semibold">Memory activity</h3>
          </div>
          <div className="grid gap-3 text-sm text-muted-foreground">
            <ActivityLine title="Context build" detail="Ready for agent requests" />
            <ActivityLine title="Private memory" detail="Confirmation required before injection" />
            <ActivityLine title="Search" detail="Results return metadata before content access" />
          </div>
        </div>

        <div className="rounded-xl border bg-card p-5">
          <div className="mb-4 flex items-center gap-2">
            <Share2 className="size-5 text-amber-600" />
            <h3 className="font-semibold">Sharing activity</h3>
          </div>
          <div className="grid gap-3 text-sm text-muted-foreground">
            <ActivityLine title="Read-only pages" detail="HTML, Markdown, PDF, Word, Excel, PPTX" />
            <ActivityLine title="Expiration" detail="Permanent or time-limited shares" />
            <ActivityLine title="Public route" detail="Shared artifacts render under /p/:slug" />
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <MemoryConsole client={client} />
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <PagesConsole client={client} />
      </section>
    </div>
  );
}

function DashboardMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}): React.JSX.Element {
  return (
    <div className="rounded-xl border bg-card p-5">
      <Icon className="mb-4 size-5 text-muted-foreground" />
      <div className="text-2xl font-semibold">{value}</div>
      <div className="mt-1 text-sm text-muted-foreground">{label}</div>
    </div>
  );
}

function ActivityLine({ title, detail }: { title: string; detail: string }): React.JSX.Element {
  return (
    <div className="grid gap-1 rounded-lg border bg-background px-3 py-2">
      <span className="font-medium text-foreground">{title}</span>
      <span>{detail}</span>
    </div>
  );
}

function HomeView(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-12 pb-10">
      <section className="relative overflow-hidden rounded-xl border bg-card">
        <div className="relative grid gap-8 px-5 py-10 md:grid-cols-[0.92fr_1.08fr] md:items-center md:px-8 md:py-14">
          <div className="flex flex-col justify-center gap-6">
            <div className="flex w-fit items-center gap-2 rounded-md border bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground">
              <ShieldCheck className="size-3.5 text-emerald-600" />
              Governed memory for every AI surface
            </div>
            <div>
              <h2 className="text-4xl font-semibold leading-tight sm:text-5xl">Gotomemory</h2>
              <p className="mt-4 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
                A governed memory workspace for agents, apps, and teams. Capture durable context,
                enforce sensitivity rules, and share generated work as read-only pages from one
                connected place.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-nowrap">
              <Button size="lg" asChild>
                <a href="#capabilities">
                  Explore capabilities <ArrowRight />
                </a>
              </Button>
              <Button size="lg" variant="secondary" asChild>
                <a href="#developers">
                  Developer surfaces <Link2 />
                </a>
              </Button>
            </div>
            <div className="grid max-w-xl grid-cols-3 gap-3 text-sm">
              <Metric value="6" label="artifact formats" />
              <Metric value="3" label="access modes" />
              <Metric value="1" label="policy path" />
            </div>
          </div>

          <ProductPreview />
        </div>
      </section>

      <section id="capabilities" className="scroll-mt-28 grid gap-4 md:grid-cols-3">
        <FeatureCard
          icon={Brain}
          title="Governed Memory"
          accent="text-sky-600"
          body="Create explicit facts, preferences, instructions, and notes, then search or inject only the context allowed for the current task."
        />
        <FeatureCard
          icon={ShieldCheck}
          title="Policy First"
          accent="text-emerald-600"
          body="Normal memories can flow automatically, private memories require confirmation, and secret material stays out of search and injection."
        />
        <FeatureCard
          icon={FileText}
          title="Pages"
          accent="text-amber-600"
          body="Turn agent output into read-only HTML, Markdown, PDF, Word, Excel, or PowerPoint shares with optional expiration."
        />
      </section>

      <section className="grid gap-8 md:grid-cols-[0.85fr_1.15fr] md:items-start">
        <div>
          <p className="text-sm font-medium text-muted-foreground">How it works</p>
          <h3 className="mt-2 text-2xl font-semibold leading-tight">
            A single governed route from memory to action.
          </h3>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Every client goes through the Gateway and SDK, so CLI commands, MCP tools, the browser
            extension, and the web surface all share the same policy checks and audit semantics.
          </p>
        </div>
        <div className="grid gap-3">
          <FlowStep
            icon={Database}
            title="Capture"
            body="Save memory with type, source, sensitivity, freshness, and version metadata."
          />
          <FlowStep
            icon={Workflow}
            title="Govern"
            body="Build context through policy decisions, confirmation tokens, and omitted reasons."
          />
          <FlowStep
            icon={Globe2}
            title="Share"
            body="Publish generated artifacts to frontend-rendered, read-only URLs under /p/:slug."
          />
        </div>
      </section>

      <section id="security" className="scroll-mt-28 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border bg-card p-5">
          <div className="mb-4 flex items-center gap-2">
            <LockKeyhole className="size-5 text-emerald-600" />
            <h3 className="font-semibold">Security model</h3>
          </div>
          <ul className="grid gap-3 text-sm text-muted-foreground">
            <CheckItem>Search results never return raw memory content.</CheckItem>
            <CheckItem>Private context needs an explicit confirmation step.</CheckItem>
            <CheckItem>
              Gateway returns page data; the frontend sanitizes and renders shares.
            </CheckItem>
            <CheckItem>Expiring shares become unavailable through the public data API.</CheckItem>
          </ul>
        </div>
        <div id="developers" className="scroll-mt-28 rounded-xl border bg-card p-5">
          <div className="mb-4 flex items-center gap-2">
            <KeyRound className="size-5 text-sky-600" />
            <h3 className="font-semibold">Developer surfaces</h3>
          </div>
          <div className="grid gap-2 text-sm">
            <CodeLine label="CLI" value="gotomemory pages publish --kind markdown" />
            <CodeLine label="MCP" value="share_generated_page, build_memory_context" />
            <CodeLine label="API" value="POST /v1/pages, GET /v1/pages/public/:slug" />
            <CodeLine label="Web" value="/, /p/:slug" />
          </div>
        </div>
      </section>

      <section className="rounded-xl border bg-primary p-6 text-primary-foreground md:p-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-2xl font-semibold leading-tight">Start with local memory.</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-primary-foreground/75">
              Run the Gateway, connect agents, publish a page, and verify the same governed memory
              path from CLI, MCP, and browser workflows.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" asChild>
              <a href="#capabilities">Explore capabilities</a>
            </Button>
            <Button variant="outline" className="bg-transparent" asChild>
              <a href="#developers">View developer surfaces</a>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

function Metric({ value, label }: { value: string; label: string }): React.JSX.Element {
  return (
    <div className="rounded-lg border bg-background/75 px-3 py-2">
      <div className="text-lg font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function ProductPreview(): React.JSX.Element {
  return (
    <div className="homepage-preview relative overflow-hidden rounded-xl border bg-background shadow-sm">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="size-2 rounded-full bg-emerald-500" />
          <span className="text-xs font-medium text-muted-foreground">live context plan</span>
        </div>
        <Badge variant="secondary">policy checked</Badge>
      </div>
      <div className="grid gap-3 p-4">
        <div className="rounded-lg border p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            <Brain className="size-4 text-sky-600" /> Build context
          </div>
          <div className="space-y-2 text-xs text-muted-foreground">
            <div className="h-2 w-4/5 rounded bg-muted" />
            <div className="h-2 w-3/5 rounded bg-muted" />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
            <div className="mb-1 flex items-center gap-2 text-xs font-semibold">
              <CheckCircle2 className="size-3.5" /> normal
            </div>
            <p className="text-xs opacity-80">Injected automatically</p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-950 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
            <div className="mb-1 flex items-center gap-2 text-xs font-semibold">
              <ShieldCheck className="size-3.5" /> private
            </div>
            <p className="text-xs opacity-80">Requires confirmation</p>
          </div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Layers3 className="size-4 text-amber-600" /> Shared page
            </div>
            <span className="font-mono text-xs text-muted-foreground">/p/r7K2mQ</span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {["html", "md", "pdf", "xlsx"].map((kind) => (
              <div
                key={kind}
                className="rounded-md bg-muted px-2 py-2 text-center text-xs font-medium"
              >
                {kind}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="absolute bottom-3 right-3 hidden items-center gap-2 rounded-md border bg-background px-3 py-2 text-xs shadow-sm sm:flex">
        <Network className="size-3.5 text-sky-600" />
        Gateway API
      </div>
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  body,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  accent: string;
}): React.JSX.Element {
  return (
    <div className="rounded-xl border bg-card p-5">
      <div
        className={cn("mb-4 flex size-10 items-center justify-center rounded-lg bg-muted", accent)}
      >
        <Icon className="size-5" />
      </div>
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
    </div>
  );
}

function FlowStep({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
}): React.JSX.Element {
  return (
    <div className="grid grid-cols-[40px_1fr] gap-3 rounded-xl border bg-card p-4">
      <div className="flex size-10 items-center justify-center rounded-lg bg-muted text-foreground">
        <Icon className="size-5" />
      </div>
      <div>
        <h4 className="font-medium">{title}</h4>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}

function CheckItem({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <li className="flex gap-2">
      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
      <span>{children}</span>
    </li>
  );
}

function CodeLine({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="grid gap-1 rounded-lg border bg-background px-3 py-2 sm:grid-cols-[72px_1fr]">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <code className="break-words font-mono text-xs">{value}</code>
    </div>
  );
}

function MemoryConsole({ client }: { client: Client }): React.JSX.Element {
  return (
    <>
      <CreateCard client={client} />
      <SearchCard client={client} />
      <BuildCard client={client} />
    </>
  );
}

function PagesConsole({ client }: { client: Client }): React.JSX.Element {
  return (
    <>
      <PublishPageCard client={client} />
      <PageListCard client={client} />
    </>
  );
}

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
  const [limit, setLimit] = React.useState(PAGE);
  const [error, setError] = React.useState<string | null>(null);

  async function run(nextLimit: number): Promise<void> {
    if (!query.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await client.memories.search({ query, platform: "claude", limit: nextLimit });
      setItems(res.items);
      setLimit(nextLimit);
    } catch (err) {
      setError(errorText(err));
      setItems(null);
    } finally {
      setBusy(false);
    }
  }

  const canLoadMore = items != null && items.length === limit;

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
            onKeyDown={(e) => e.key === "Enter" && void run(PAGE)}
          />
          <Button variant="secondary" onClick={() => void run(PAGE)} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Search />} Search
          </Button>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {items != null && items.length === 0 && (
          <div className="flex flex-col items-center gap-2 rounded-md border border-dashed py-10 text-muted-foreground">
            <SearchX className="size-6" />
            <p className="text-sm">No memories match this query.</p>
          </div>
        )}

        {items != null && items.length > 0 && (
          <>
            <p className="text-xs text-muted-foreground">
              {items.length} result{items.length === 1 ? "" : "s"}
            </p>
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
            {canLoadMore && (
              <Button
                variant="ghost"
                size="sm"
                className="self-center"
                onClick={() => void run(limit + PAGE)}
                disabled={busy}
              >
                {busy ? <Loader2 className="animate-spin" /> : null} Load more
              </Button>
            )}
          </>
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

function PublishPageCard({ client }: { client: Client }): React.JSX.Element {
  const [title, setTitle] = React.useState("");
  const [kind, setKind] = React.useState<(typeof PAGE_KINDS)[number]>("markdown");
  const [visibility, setVisibility] = React.useState<CreatePageRequest["visibility"]>("unlisted");
  const [expires, setExpires] = React.useState("");
  const [content, setContent] = React.useState("# Shared page\n\nWrite something worth sharing.");
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<React.ReactNode>(null);

  async function publish(): Promise<void> {
    if (!title.trim() || !content.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const expiresIn = parseExpires(expires);
      const res = await client.pages.create({
        title,
        kind,
        content,
        visibility,
        source: "console",
        ...(expiresIn ? { expires_in: expiresIn } : {}),
      });
      setMsg(
        <span className="flex flex-wrap items-center gap-2 text-muted-foreground">
          Published <code className="font-mono">{shortId(res.id)}</code>
          <a className="inline-flex items-center gap-1 underline" href={res.url} target="_blank">
            {res.url} <ExternalLink className="size-3" />
          </a>
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
          <Plus className="size-4 text-muted-foreground" /> Publish page
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="grid gap-3 md:grid-cols-[1fr_150px_140px_110px]">
          <Input placeholder="title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as (typeof PAGE_KINDS)[number])}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
          >
            {PAGE_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as CreatePageRequest["visibility"])}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
          >
            <option value="unlisted">unlisted</option>
            <option value="public">public</option>
            <option value="private">private</option>
          </select>
          <Input
            placeholder="2h / 1d"
            value={expires}
            onChange={(e) => setExpires(e.target.value)}
          />
        </div>
        <Textarea
          className="min-h-36 font-mono"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => void publish()} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Link2 />} Publish
          </Button>
          <p className="text-xs text-muted-foreground">
            Empty expiration means permanent. File artifacts can also be published through CLI or
            MCP.
          </p>
        </div>
        {msg && <p className="text-sm">{msg}</p>}
      </CardContent>
    </Card>
  );
}

function PageListCard({ client }: { client: Client }): React.JSX.Element {
  const [busy, setBusy] = React.useState(false);
  const [items, setItems] = React.useState<PageResponse[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  async function load(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const res = await client.pages.list(20);
      setItems(res.items ?? []);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function unpublish(id: string): Promise<void> {
    setBusy(true);
    try {
      await client.pages.unpublish(id);
      await load();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  React.useEffect(() => {
    void load();
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <FileText className="size-4 text-muted-foreground" /> Shared pages
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            {items.length} page{items.length === 1 ? "" : "s"}
          </p>
          <Button variant="secondary" size="sm" onClick={() => void load()} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />} Refresh
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <ul className="divide-y rounded-md border">
          {items.map((page) => (
            <li key={page.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
              <Badge variant="outline">{page.kind}</Badge>
              <Badge variant={page.status === "active" ? "secondary" : "outline"}>
                {page.status}
              </Badge>
              <span className="min-w-40 flex-1 truncate">{page.title}</span>
              <a
                className="inline-flex items-center gap-1 underline"
                href={page.url}
                target="_blank"
              >
                Open <ExternalLink className="size-3" />
              </a>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void unpublish(page.id)}
                disabled={busy}
              >
                <Trash2 /> Unpublish
              </Button>
            </li>
          ))}
        </ul>
        {items.length === 0 && (
          <p className="text-sm text-muted-foreground">No shared pages yet.</p>
        )}
      </CardContent>
    </Card>
  );
}

function SharedPageView({ client, slug }: { client: Client; slug: string }): React.JSX.Element {
  const [page, setPage] = React.useState<PublicPageResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    setPage(null);
    setError(null);
    void client.pages
      .getPublic(slug)
      .then((res) => {
        if (active) setPage(res);
      })
      .catch((err: unknown) => {
        if (active) setError(errorText(err));
      });
    return () => {
      active = false;
    };
  }, [client, slug]);

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Shared page unavailable</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (!page) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="mr-2 animate-spin" /> Loading shared page
      </div>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl">
      <article className="rounded-lg border bg-card p-6 shadow-sm">
        <header className="mb-5 border-b pb-4">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge variant="outline">{page.kind}</Badge>
            <Badge variant="secondary">{page.visibility}</Badge>
            {page.expires_at ? (
              <span className="text-xs text-muted-foreground">expires {page.expires_at}</span>
            ) : (
              <span className="text-xs text-muted-foreground">permanent</span>
            )}
          </div>
          <h2 className="text-2xl font-semibold leading-tight">{page.title}</h2>
          {page.description && (
            <p className="mt-2 text-sm text-muted-foreground">{page.description}</p>
          )}
        </header>
        {page.kind === "html" || page.kind === "markdown" ? (
          // Untrusted page HTML is isolated in a sandboxed iframe (no allow-scripts, opaque
          // origin) so it cannot execute scripts or reach this origin's session storage.
          <iframe
            title={page.title}
            sandbox=""
            className="shared-page-frame"
            srcDoc={buildSandboxedDocument(renderSharedPage(page))}
          />
        ) : (
          <div
            className="shared-page-content"
            dangerouslySetInnerHTML={{ __html: renderSharedPage(page) }}
          />
        )}
      </article>
    </main>
  );
}
