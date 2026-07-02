import type { ReactNode } from "react";

export function App({ pathname: _pathname = window.location.pathname }: { pathname?: string }) {
  return <HomePage />;
}

function HomePage() {
  return (
    <div className="min-h-screen bg-background font-sans text-foreground">
      {/* NAV */}
      <header className="sticky top-0 z-50 border-b border-[#e2e8f0] bg-white/90 backdrop-blur-md backdrop-saturate-150">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between px-8 py-4">
          <div className="flex items-center gap-[11px]">
            <img
              src="/icon.png"
              alt="gotomemory"
              width={36}
              height={36}
              className="h-9 w-9 rounded-[8px]"
            />
            <span className="text-[17px] font-bold tracking-[-0.01em]">gotomemory</span>
          </div>
          <nav className="flex items-center gap-[30px]">
            <a
              href="#extension"
              className="gm-link hidden text-sm font-medium text-[#4d5968] sm:block"
            >
              扩展
            </a>
            <a
              href="#export"
              className="gm-link hidden text-sm font-medium text-[#4d5968] sm:block"
            >
              导出
            </a>
            <a
              href="#privacy"
              className="gm-link hidden text-sm font-medium text-[#4d5968] sm:block"
            >
              隐私
            </a>
            <a
              href="#extension"
              className="gm-btn rounded-[9px] bg-primary px-4 py-[9px] text-sm font-semibold text-white shadow-[0_6px_18px_-8px_rgba(0,184,169,0.65)]"
            >
              安装扩展
            </a>
          </nav>
        </div>
      </header>

      {/* HERO */}
      <section className="mx-auto grid max-w-[1180px] grid-cols-1 items-center gap-16 px-8 pb-[76px] pt-[84px] lg:grid-cols-[1.05fr_0.95fr]">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#9ee3dc] bg-white px-3 py-1.5 font-mono text-[11.5px] uppercase tracking-[0.14em] text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            浏览器扩展优先 · 本地优先
          </div>
          <h1 className="mt-6 font-display text-[44px] font-black leading-[1.06] tracking-[-0.02em] md:text-[62px]">
            你的 AI 记忆，
            <br />
            到处<span className="text-primary">通用</span>。
          </h1>
          <p className="mt-6 max-w-[480px] text-[17.5px] leading-[1.65] text-[#586574]">
            gotomemory 让 ChatGPT、Claude、Gemini
            共享你的偏好、背景和长期上下文。记忆默认存在浏览器扩展本机，
            <strong className="font-semibold text-foreground">不登录、不上传</strong>。
          </p>
          <div className="mt-[34px] flex flex-wrap gap-[14px]">
            <a
              href="#extension"
              className="gm-btn inline-flex items-center gap-[9px] rounded-[14px] bg-primary px-[22px] py-[14px] text-[15px] font-semibold text-white shadow-[0_10px_26px_-10px_rgba(0,184,169,0.62)]"
            >
              看扩展能力
              <ArrowRight />
            </a>
            <a
              href="#export"
              className="gm-btn inline-flex items-center gap-[9px] rounded-[14px] border border-[#d8e3ea] bg-white px-[22px] py-[14px] text-[15px] font-semibold text-foreground shadow-[0_10px_26px_-18px_rgba(22,32,51,0.28)]"
            >
              看导出能力
              <DownloadIcon />
            </a>
          </div>
          <div className="mt-10 flex items-center gap-[18px]">
            <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#7a8491]">
              支持
            </span>
            <div className="flex flex-wrap gap-[10px]">
              {["ChatGPT", "Claude", "Gemini"].map((name) => (
                <span
                  key={name}
                  className="gm-chip rounded-full border border-[#d8e3ea] bg-[#f8fbfc] px-[13px] py-1.5 text-[13px] font-semibold text-[#586574]"
                >
                  {name}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Product mock */}
        <div className="relative">
          <div className="absolute -inset-x-[10px] -bottom-7 -top-[22px] z-0 rounded-[30px] bg-[radial-gradient(120%_100%_at_70%_20%,rgba(0,184,169,0.09),transparent_62%)]" />
          <div className="relative z-10 overflow-hidden rounded-[18px] border border-[#dfe7ee] bg-white shadow-[0_26px_60px_-34px_rgba(22,32,51,0.30)]">
            <div className="flex items-center justify-between border-b border-[#e8eef3] px-[18px] py-[14px]">
              <div className="flex gap-[7px]">
                <span className="h-[11px] w-[11px] rounded-full bg-[#ff4d49]" />
                <span className="h-[11px] w-[11px] rounded-full bg-[#fdb52a]" />
                <span className="h-[11px] w-[11px] rounded-full bg-[#9aa6b2]" />
              </div>
              <span className="rounded-[7px] border border-[#d8e3ea] bg-[#f8fbfc] px-[9px] py-[3px] font-mono text-[11px] tracking-[0.08em]">
                LOCAL
              </span>
            </div>
            <div className="flex flex-col gap-3 p-[18px]">
              <div className="rounded-[12px] border border-[#e3eaf0] bg-[#f8fbfc] px-4 py-[14px]">
                <div className="text-[14.5px] font-bold">ChatGPT</div>
                <div className="mt-[5px] text-[13px] text-[#64707d]">
                  记住：代码示例优先用 TypeScript。
                </div>
              </div>
              <div className="rounded-[12px] border-[1.5px] border-primary bg-[#effcfb] px-4 py-[14px] shadow-[0_8px_22px_-14px_rgba(0,184,169,0.50)]">
                <div className="flex items-center gap-2 text-[14.5px] font-bold text-primary">
                  <img
                    src="/icon.png"
                    alt=""
                    width={20}
                    height={20}
                    className="h-5 w-5 rounded-[5px]"
                  />
                  gotomemory
                </div>
                <div className="mt-[5px] text-[13px] text-[#0f6f67]">已保存到扩展本地存储。</div>
              </div>
              <div className="rounded-[12px] border border-[#e3eaf0] bg-[#f8fbfc] px-4 py-[14px]">
                <div className="text-[14.5px] font-bold">Claude</div>
                <div className="mt-[5px] text-[13px] text-[#64707d]">
                  带入相关记忆：TypeScript 偏好、项目背景。
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* STATS STRIP */}
      <div className="border-y border-[#d5eeee] bg-[#f3fbfa]">
        <div className="mx-auto grid max-w-[1180px] grid-cols-3 px-8">
          <Stat value="3+" label="支持的 AI 助手" divider />
          <Stat value="0" label="默认上传到服务器的字节" divider />
          <Stat value="7" label="本机导出格式" />
        </div>
      </div>

      {/* SECTION 01 — EXTENSION */}
      <section id="extension" className="mx-auto max-w-[1180px] px-8 py-[92px]">
        <SectionHeader
          number="01"
          label="Extension"
          labelTone="solid"
          title="主入口在浏览器扩展里"
          description="用户真实使用 AI 助手的地方是网页对话框，所以保存、带入和导出都从扩展发起。"
        />
        <div className="grid grid-cols-1 gap-[18px] md:grid-cols-3">
          <FeatureCard
            size="md"
            title="跨助手记忆"
            desc="在一个助手里保存偏好或项目背景，在另外两个助手里一键带入。"
            icon={
              <svg {...iconProps} width="22" height="22">
                <rect x="4" y="7" width="16" height="12" rx="2" />
                <path d="M9 7V5a3 3 0 0 1 6 0v2M9 12h.01M15 12h.01M9 16h6" />
              </svg>
            }
          />
          <FeatureCard
            size="md"
            title="站点适配"
            desc="ChatGPT、Claude、Gemini 各自用轻量 content script 读取消息和写入输入框。"
            icon={
              <svg {...iconProps} width="22" height="22">
                <path d="M9 7H7a4 4 0 0 0 0 8h2M15 7h2a4 4 0 0 1 0 8h-2M8 11h8" />
              </svg>
            }
          />
          <FeatureCard
            size="md"
            title="私密确认"
            desc="普通记忆可默认勾选，私密记忆必须由用户确认后才进入对话。"
            icon={
              <svg {...iconProps} width="22" height="22">
                <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" />
                <path d="M9 12l2 2 4-4" />
              </svg>
            }
          />
        </div>
      </section>

      <div className="border-t border-[#e2e8f0]" />

      {/* SECTION 02 — EXPORT */}
      <section
        id="export"
        className="mx-auto grid max-w-[1180px] grid-cols-1 items-start gap-14 px-8 py-[92px] lg:grid-cols-[0.92fr_1.08fr]"
      >
        <div className="lg:sticky lg:top-24">
          <SectionHeader
            number="02"
            label="Export"
            labelTone="outline"
            title={
              <>
                把对话带走，
                <br />
                不生成链接
              </>
            }
            description="对话导出优先在本机完成。用户可以把当前对话保存成 Markdown、文本、Obsidian、PDF 或文档格式，不上传到 gotomemory，也不发布成公开页面。"
            descriptionWidth="max-w-[420px]"
          />
        </div>
        <div className="grid grid-cols-1 gap-[18px] sm:grid-cols-2">
          <FeatureCard
            size="sm"
            title="本机导出"
            desc="导出只是把对话保存到本机，不自动生成链接，也不自动变成长期记忆。"
            icon={
              <svg {...iconProps} width="20" height="20">
                <path d="M12 3v12M7 11l5 5 5-5M5 21h14" />
              </svg>
            }
          />
          <FeatureCard
            size="sm"
            title="多格式"
            desc="Markdown、TXT、Obsidian、PDF 和文档格式可按需扩展。"
            icon={
              <svg {...iconProps} width="20" height="20">
                <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
                <path d="M14 3v5h5M9 13h6M9 17h4" />
              </svg>
            }
          />
          <FeatureCard
            size="sm"
            title="勾选消息"
            desc="用户可以导出完整对话，也可以只导出选中的消息。"
            icon={
              <svg {...iconProps} width="20" height="20">
                <rect x="4" y="4" width="16" height="16" rx="3" />
                <path d="M8.5 12l2.5 2.5L16 9" />
              </svg>
            }
          />
          <FeatureCard
            size="sm"
            title="不发布"
            desc="导出不会创建公开页面，也不会把对话内容上传到 gotomemory。"
            icon={
              <svg {...iconProps} width="20" height="20">
                <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" />
              </svg>
            }
          />
        </div>
      </section>

      <div className="border-t border-[#e2e8f0]" />

      {/* SECTION 03 — PRIVACY */}
      <section id="privacy" className="mx-auto max-w-[1180px] px-8 py-[92px]">
        <SectionHeader number="03" label="Privacy" labelTone="outline" title="默认不上传记忆" />
        <div className="grid grid-cols-1 gap-[18px] sm:grid-cols-2">
          <PrivacyCard
            title="本地是源头"
            desc="记忆主存储在扩展上下文里，跨站点通过 background 消息通道共享。"
            icon={
              <svg {...iconProps} width="23" height="23">
                <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" />
                <path d="M9 12l2 2 4-4" />
              </svg>
            }
          />
          <PrivacyCard
            title="服务器只做必要的事"
            desc="默认记忆和导出不需要服务器；只有后续显式开启的同步才需要登录和网络。"
            icon={
              <svg {...iconProps} width="23" height="23">
                <rect x="5" y="11" width="14" height="9" rx="2" />
                <path d="M8 11V8a4 4 0 0 1 8 0v3" />
              </svg>
            }
          />
        </div>
      </section>

      {/* CTA BAND */}
      <div className="border-t border-[#162033] bg-[#162033] text-white">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-8 px-8 py-14">
          <div>
            <h2 className="font-display text-[30px] font-black tracking-[-0.015em]">
              把记忆装进浏览器，今天就开始。
            </h2>
            <p className="mt-2 text-[15px] text-white/[0.78]">免费安装，不登录、不上传。</p>
          </div>
          <a
            href="#"
            className="gm-btn inline-flex items-center gap-[9px] rounded-[14px] bg-primary px-[26px] py-[15px] text-[15px] font-bold text-white shadow-[0_12px_30px_-12px_rgba(0,184,169,0.55)]"
          >
            安装扩展
            <ArrowRight />
          </a>
        </div>
      </div>

      {/* FOOTER */}
      <footer className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-5 px-8 py-[38px]">
        <div className="flex items-center gap-[10px]">
          <img
            src="/icon.png"
            alt="gotomemory"
            width={28}
            height={28}
            className="h-7 w-7 rounded-[7px]"
          />
          <span className="text-sm font-bold">gotomemory</span>
        </div>
        <span className="font-mono text-[12.5px] tracking-[0.02em] text-[#7a8491]">
          Extension-first local memory for AI assistants.
        </span>
      </footer>
    </div>
  );
}

const iconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const
};

function Stat({ value, label, divider }: { value: string; label: string; divider?: boolean }) {
  return (
    <div className={`px-2 py-[26px] ${divider ? "border-r border-[#9ee3dc]" : ""}`}>
      <div className="font-mono text-[30px] font-semibold tracking-[-0.02em] text-primary">
        {value}
      </div>
      <div className="mt-1 text-[13.5px] text-[#64707d]">{label}</div>
    </div>
  );
}

function SectionHeader({
  number,
  label,
  labelTone,
  title,
  description,
  descriptionWidth = "max-w-[560px]"
}: {
  number: string;
  label: string;
  labelTone: "solid" | "outline";
  title: ReactNode;
  description?: string;
  descriptionWidth?: string;
}) {
  return (
    <div className="mb-10 flex items-start gap-[18px]">
      <span className="pt-1.5 font-mono text-[13px] font-semibold text-[#ff4d49]">{number}</span>
      <div>
        <span
          className={
            labelTone === "solid"
              ? "inline-block rounded-md bg-[#ff4d49] px-[10px] py-1 font-mono text-[11px] uppercase tracking-[0.14em] text-white"
              : "inline-block rounded-md border border-[#b7ece7] bg-[#f8fefe] px-[10px] py-1 font-mono text-[11px] uppercase tracking-[0.14em] text-primary"
          }
        >
          {label}
        </span>
        <h2 className="mt-[14px] font-display text-[34px] font-black tracking-[-0.015em]">
          {title}
        </h2>
        {description ? (
          <p className={`mt-3 ${descriptionWidth} text-[16px] leading-[1.6] text-[#586574]`}>
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  desc,
  size
}: {
  icon: ReactNode;
  title: string;
  desc: string;
  size: "md" | "sm";
}) {
  const md = size === "md";
  return (
    <div
      className={`gm-card rounded-[14px] border border-[#e2e8f0] bg-white shadow-[0_12px_30px_-24px_rgba(22,32,51,0.25)] ${md ? "p-[26px]" : "p-6"}`}
    >
      <div
        className={`flex items-center justify-center bg-[#effcfb] text-primary ${
          md ? "h-11 w-11 rounded-[11px]" : "h-10 w-10 rounded-[10px]"
        }`}
      >
        {icon}
      </div>
      <h3 className={`mt-[18px] font-display font-bold ${md ? "text-[18px]" : "text-[16.5px]"}`}>
        {title}
      </h3>
      <p
        className={`mt-[9px] leading-[1.6] text-[#64707d] ${md ? "text-[14.5px]" : "mt-2 text-[13.5px]"}`}
      >
        {desc}
      </p>
    </div>
  );
}

function PrivacyCard({ icon, title, desc }: { icon: ReactNode; title: string; desc: string }) {
  return (
    <div className="gm-card rounded-[14px] border border-[#e2e8f0] bg-white p-[30px] shadow-[0_12px_30px_-24px_rgba(22,32,51,0.25)]">
      <div className="flex h-[46px] w-[46px] items-center justify-center rounded-[12px] bg-[#162033] text-white">
        {icon}
      </div>
      <h3 className="mt-[18px] font-display text-[19px] font-bold">{title}</h3>
      <p className="mt-[10px] text-[15px] leading-[1.65] text-[#64707d]">{desc}</p>
    </div>
  );
}

function ArrowRight() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3v12M7 11l5 5 5-5M5 21h14" />
    </svg>
  );
}
