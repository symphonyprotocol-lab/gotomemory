import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Download,
  FileText,
  Lock,
  MonitorSmartphone,
  ShieldCheck,
  Sparkles
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Badge } from "./components/ui/badge.js";
import { buttonVariants } from "./components/ui/button.js";
import { Card, CardDescription, CardHeader, CardTitle } from "./components/ui/card.js";
import { Separator } from "./components/ui/separator.js";
import { cn } from "./lib/utils.js";

export function App({ pathname: _pathname = window.location.pathname }: { pathname?: string }) {
  return <HomePage />;
}

function HomePage() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <a className="flex items-center gap-2 font-semibold" href="/">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            </span>
            <span>gotomemory</span>
          </a>
          <div className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a className="transition-colors hover:text-foreground" href="#extension">
              扩展
            </a>
            <a className="transition-colors hover:text-foreground" href="#export">
              导出
            </a>
            <a className="transition-colors hover:text-foreground" href="#privacy">
              隐私
            </a>
          </div>
        </nav>
      </header>

      <main>
        <section className="border-b">
          <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl items-center gap-10 px-5 py-14 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="max-w-3xl">
              <Badge variant="secondary" className="mb-5">
                浏览器扩展优先，本地优先
              </Badge>
              <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-normal md:text-6xl">
                你的 AI 记忆，到处通用。
              </h1>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
                gotomemory 让 ChatGPT、Claude、Gemini
                共享你的偏好、背景和长期上下文。记忆默认存在浏览器扩展本机，不登录、不上传。
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <a
                  className={cn(buttonVariants({ size: "lg" }), "w-full sm:w-auto")}
                  href="#extension"
                >
                  看扩展能力
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </a>
                <a
                  className={cn(
                    buttonVariants({ variant: "outline", size: "lg" }),
                    "w-full sm:w-auto"
                  )}
                  href="#export"
                >
                  看导出能力
                  <Download className="h-4 w-4" aria-hidden="true" />
                </a>
              </div>
            </div>

            <div
              aria-label="gotomemory product preview"
              className="rounded-lg border bg-card p-4 shadow-line"
            >
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-accent" />
                  <span className="h-2.5 w-2.5 rounded-full bg-primary" />
                  <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground" />
                </div>
                <Badge variant="outline">Local</Badge>
              </div>
              <div className="space-y-3">
                <div className="message-bubble ml-8">
                  <p className="font-medium">ChatGPT</p>
                  <p className="mt-1 text-muted-foreground">记住：代码示例优先用 TypeScript。</p>
                </div>
                <div className="message-bubble mr-8 border-primary/30">
                  <p className="font-medium text-primary">gotomemory</p>
                  <p className="mt-1 text-muted-foreground">已保存到扩展本地存储。</p>
                </div>
                <div className="message-bubble ml-8">
                  <p className="font-medium">Claude</p>
                  <p className="mt-1 text-muted-foreground">
                    带入相关记忆：TypeScript 偏好、项目背景。
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="extension" className="mx-auto max-w-6xl px-5 py-16">
          <div className="mb-8 max-w-2xl">
            <Badge variant="accent">Extension</Badge>
            <h2 className="mt-4 text-3xl font-semibold tracking-normal">主入口在浏览器扩展里</h2>
            <p className="mt-3 leading-7 text-muted-foreground">
              用户真实使用 AI 助手的地方是网页对话框，所以保存、带入和导出都从扩展发起。
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <FeatureCard
              icon={Bot}
              title="跨助手记忆"
              description="在一个助手里保存偏好或项目背景，在另外两个助手里一键带入。"
            />
            <FeatureCard
              icon={MonitorSmartphone}
              title="站点适配"
              description="ChatGPT、Claude、Gemini 各自用轻量 content script 读取消息和写入输入框。"
            />
            <FeatureCard
              icon={CheckCircle2}
              title="私密确认"
              description="普通记忆可默认勾选，私密记忆必须由用户确认后才进入对话。"
            />
          </div>
        </section>

        <Separator />

        <section id="export" className="mx-auto max-w-6xl px-5 py-16">
          <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
            <div>
              <Badge variant="secondary">Export</Badge>
              <h2 className="mt-4 text-3xl font-semibold tracking-normal">
                把对话带走，不生成链接
              </h2>
              <p className="mt-3 leading-7 text-muted-foreground">
                对话导出优先在本机完成。用户可以把当前对话保存成 Markdown、文本、Obsidian、PDF
                或文档格式，不上传到 gotomemory，也不发布成公开页面。
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FeatureCard
                icon={Download}
                title="本机导出"
                description="导出只是把对话保存到本机，不自动生成链接，也不自动变成长期记忆。"
              />
              <FeatureCard
                icon={FileText}
                title="多格式"
                description="Markdown、TXT、Obsidian、PDF 和文档格式可按需扩展。"
              />
              <FeatureCard
                icon={CheckCircle2}
                title="勾选消息"
                description="用户可以导出完整对话，也可以只导出选中的消息。"
              />
              <FeatureCard
                icon={ShieldCheck}
                title="不发布"
                description="导出不会创建公开页面，也不会把对话内容上传到 gotomemory。"
              />
            </div>
          </div>
        </section>

        <section id="privacy" className="border-y bg-card">
          <div className="mx-auto grid max-w-6xl gap-8 px-5 py-14 md:grid-cols-3">
            <div className="md:col-span-1">
              <Badge variant="outline">Privacy</Badge>
              <h2 className="mt-4 text-3xl font-semibold tracking-normal">默认不上传记忆</h2>
            </div>
            <div className="grid gap-4 md:col-span-2 sm:grid-cols-2">
              <PrivacyPoint
                icon={ShieldCheck}
                title="本地是源头"
                text="记忆主存储在扩展上下文里，跨站点通过 background 消息通道共享。"
              />
              <PrivacyPoint
                icon={Lock}
                title="服务器只做必要的事"
                text="默认记忆和导出不需要服务器；只有后续显式开启的同步才需要登录和网络。"
              />
            </div>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span>gotomemory</span>
        <span>Extension-first local memory for AI assistants.</span>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  description
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-secondary text-primary">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
    </Card>
  );
}

function PrivacyPoint({
  icon: Icon,
  title,
  text
}: {
  icon: LucideIcon;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-lg border bg-background p-5">
      <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
      <h3 className="mt-4 font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
    </div>
  );
}
