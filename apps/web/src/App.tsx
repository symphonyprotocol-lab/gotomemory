import type { ReactNode } from "react";

import type { Locale } from "@gotomemory/i18n";

import { I18nProvider, useI18n } from "./i18n.js";
import { resolveRoute } from "./routes.js";

const REPO_URL = "https://github.com/symphonyprotocol-lab/gotomemory";

/**
 * The Chrome Web Store listing, or `null` while the extension is still in
 * review. Set this to `https://chromewebstore.google.com/detail/<extension-id>`
 * the moment the listing goes live — it is the only edit needed to turn the
 * install section's "in review" notice into a real install button. Publishing a
 * guessed URL would be worse than saying it isn't ready: visitors would land on
 * a store 404 from a page that promised an install.
 */
const CHROME_WEB_STORE_URL: string | null = null;

export function App({
  pathname = window.location.pathname,
  locale
}: {
  pathname?: string;
  /** Forces a language; without it the browser's (or the visitor's saved) choice wins. */
  locale?: Locale;
}) {
  return (
    <I18nProvider locale={locale}>
      <Page pathname={pathname} />
    </I18nProvider>
  );
}

function Page({ pathname }: { pathname: string }) {
  // Every path resolves to the homepage today (there are deliberately no public
  // share routes). Going through resolveRoute keeps that an explicit decision
  // with one place to change, instead of an ignored prop.
  switch (resolveRoute(pathname)) {
    case "home":
      return <HomePage />;
  }
}

function HomePage() {
  const { t } = useI18n();
  return (
    <div className="min-h-screen bg-background font-sans text-foreground">
      {/* NAV */}
      <header className="sticky top-0 z-50 border-b border-[#e2e8f0] bg-white/90 backdrop-blur-md backdrop-saturate-150">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between px-8 py-4">
          <div className="flex items-center gap-[11px]">
            <img
              src="/icon.png"
              alt="GotoMemory"
              width={36}
              height={36}
              className="h-9 w-9 rounded-[8px]"
            />
            <span className="text-[17px] font-bold tracking-[-0.01em]">GotoMemory</span>
          </div>
          <nav className="flex items-center gap-[30px]">
            <a
              href="#export"
              className="gm-link hidden text-sm font-medium text-[#4d5968] sm:block"
            >
              {t("web.nav.export")}
            </a>
            <a
              href="#memory"
              className="gm-link hidden text-sm font-medium text-[#4d5968] sm:block"
            >
              {t("web.nav.memory")}
            </a>
            <a
              href="#privacy"
              className="gm-link hidden text-sm font-medium text-[#4d5968] sm:block"
            >
              {t("web.nav.privacy")}
            </a>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              aria-label={t("web.nav.github")}
              title={t("web.nav.github")}
              // Hidden on narrow screens like the other nav items: the header
              // there only fits the wordmark, the language toggle and the
              // install button. The install section still links the repo.
              className="gm-link hidden text-[#4d5968] sm:block"
            >
              <GitHubIcon />
            </a>
            <LanguageToggle />
            <a
              href="#install"
              className="gm-btn rounded-[9px] bg-primary px-4 py-[9px] text-sm font-semibold text-white shadow-[0_6px_18px_-8px_rgba(0,184,169,0.65)]"
            >
              {t("web.nav.install")}
            </a>
          </nav>
        </div>
      </header>

      {/* HERO */}
      <section className="mx-auto grid max-w-[1180px] grid-cols-1 items-center gap-16 px-8 pb-[76px] pt-[84px] lg:grid-cols-[1.05fr_0.95fr]">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#9ee3dc] bg-white px-3 py-1.5 font-mono text-[11.5px] uppercase tracking-[0.14em] text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            {t("web.hero.badge")}
          </div>
          <h1 className="mt-6 font-display text-[44px] font-black leading-[1.06] tracking-[-0.02em] md:text-[62px]">
            {t("web.hero.titleLead")}
            <br />
            <span className="text-primary">{t("web.hero.titleAccent")}</span>
            {t("web.hero.titleTail")}
          </h1>
          <p className="mt-6 max-w-[480px] text-[17.5px] leading-[1.65] text-[#586574]">
            {t("web.hero.leadA")}
            <strong className="font-semibold text-foreground">{t("web.hero.leadStrong")}</strong>
            {t("web.hero.leadB")}
          </p>
          <p className="mt-4 max-w-[480px] text-[15px] leading-[1.65] text-[#586574]">
            {t("web.hero.sub")}
          </p>
          <div className="mt-[34px] flex flex-wrap gap-[14px]">
            <a
              href="#export"
              className="gm-btn inline-flex items-center gap-[9px] rounded-[14px] bg-primary px-[22px] py-[14px] text-[15px] font-semibold text-white shadow-[0_10px_26px_-10px_rgba(0,184,169,0.62)]"
            >
              {t("web.hero.ctaExport")}
              <DownloadIcon />
            </a>
            <a
              href="#memory"
              className="gm-btn inline-flex items-center gap-[9px] rounded-[14px] border border-[#d8e3ea] bg-white px-[22px] py-[14px] text-[15px] font-semibold text-foreground shadow-[0_10px_26px_-18px_rgba(22,32,51,0.28)]"
            >
              {t("web.hero.ctaMemory")}
              <ArrowRight />
            </a>
          </div>
          <div className="mt-10 flex items-center gap-[18px]">
            <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#7a8491]">
              {t("web.hero.supports")}
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
                <div className="text-[14.5px] font-bold">{t("web.hero.mockChatTitle")}</div>
                <div className="mt-[5px] text-[13px] text-[#64707d]">
                  {t("web.hero.mockChatBody")}
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
                  GotoMemory
                </div>
                <div className="mt-[5px] text-[13px] text-[#0f6f67]">
                  {t("web.hero.mockAppBody")}
                </div>
              </div>
              <div className="rounded-[12px] border border-[#e3eaf0] bg-[#f8fbfc] px-4 py-[14px]">
                <div className="text-[14.5px] font-bold">{t("web.hero.mockNotesTitle")}</div>
                <div className="mt-[5px] text-[13px] text-[#64707d]">
                  {t("web.hero.mockNotesBody")}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* STATS STRIP */}
      <div className="border-y border-[#d5eeee] bg-[#f3fbfa]">
        <div className="mx-auto grid max-w-[1180px] grid-cols-3 px-8">
          <Stat value="1" label={t("web.stats.clicks")} divider />
          <Stat value="0" label={t("web.stats.uploads")} divider />
          <Stat value="7" label={t("web.stats.formats")} />
        </div>
      </div>

      {/* SECTION 01 — EXPORT */}
      <section
        id="export"
        className="mx-auto grid max-w-[1180px] scroll-mt-20 grid-cols-1 items-start gap-14 px-8 py-[92px] lg:grid-cols-[0.92fr_1.08fr]"
      >
        <div className="lg:sticky lg:top-24">
          <SectionHeader
            number="01"
            label="Export"
            labelTone="solid"
            title={
              <>
                {t("web.export.titleLead")}
                <br />
                {t("web.export.titleTail")}
              </>
            }
            description={t("web.export.description")}
            descriptionWidth="max-w-[420px]"
          />
        </div>
        <div className="grid grid-cols-1 gap-[18px] sm:grid-cols-2">
          <FeatureCard
            size="sm"
            title={t("web.export.card1.title")}
            desc={t("web.export.card1.desc")}
            icon={
              <svg {...iconProps} width="20" height="20">
                <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
                <path d="M14 3v5h5M9 13h6M9 17h4" />
              </svg>
            }
          />
          <FeatureCard
            size="sm"
            title={t("web.export.card2.title")}
            desc={t("web.export.card2.desc")}
            icon={
              <svg {...iconProps} width="20" height="20">
                <path d="M12 3v12M7 11l5 5 5-5M5 21h14" />
              </svg>
            }
          />
          <FeatureCard
            size="sm"
            title={t("web.export.card3.title")}
            desc={t("web.export.card3.desc")}
            icon={
              <svg {...iconProps} width="20" height="20">
                <rect x="4" y="4" width="16" height="16" rx="3" />
                <path d="M8.5 12l2.5 2.5L16 9" />
              </svg>
            }
          />
          <FeatureCard
            size="sm"
            title={t("web.export.card4.title")}
            desc={t("web.export.card4.desc")}
            icon={
              <svg {...iconProps} width="20" height="20">
                <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" />
              </svg>
            }
          />
        </div>
      </section>

      <div className="border-t border-[#e2e8f0]" />

      {/* SECTION 02 — MEMORY */}
      <section id="memory" className="mx-auto max-w-[1180px] scroll-mt-20 px-8 py-[92px]">
        <SectionHeader
          number="02"
          label="Memory"
          labelTone="outline"
          title={t("web.memory.title")}
          description={t("web.memory.description")}
        />
        <div className="grid grid-cols-1 gap-[18px] md:grid-cols-3">
          <FeatureCard
            size="md"
            title={t("web.memory.card1.title")}
            desc={t("web.memory.card1.desc")}
            icon={
              <svg {...iconProps} width="22" height="22">
                <rect x="4" y="7" width="16" height="12" rx="2" />
                <path d="M9 7V5a3 3 0 0 1 6 0v2M9 12h.01M15 12h.01M9 16h6" />
              </svg>
            }
          />
          <FeatureCard
            size="md"
            title={t("web.memory.card2.title")}
            desc={t("web.memory.card2.desc")}
            icon={
              <svg {...iconProps} width="22" height="22">
                <path d="M9 7H7a4 4 0 0 0 0 8h2M15 7h2a4 4 0 0 1 0 8h-2M8 11h8" />
              </svg>
            }
          />
          <FeatureCard
            size="md"
            title={t("web.memory.card3.title")}
            desc={t("web.memory.card3.desc")}
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

      {/* SECTION 03 — PRIVACY */}
      <section id="privacy" className="mx-auto max-w-[1180px] scroll-mt-20 px-8 py-[92px]">
        <SectionHeader
          number="03"
          label="Privacy"
          labelTone="outline"
          title={t("web.privacy.title")}
        />
        <div className="grid grid-cols-1 gap-[18px] sm:grid-cols-2">
          <PrivacyCard
            title={t("web.privacy.card1.title")}
            desc={t("web.privacy.card1.desc")}
            icon={
              <svg {...iconProps} width="23" height="23">
                <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" />
                <path d="M9 12l2 2 4-4" />
              </svg>
            }
          />
          <PrivacyCard
            title={t("web.privacy.card2.title")}
            desc={t("web.privacy.card2.desc")}
            icon={
              <svg {...iconProps} width="23" height="23">
                <rect x="5" y="11" width="14" height="9" rx="2" />
                <path d="M8 11V8a4 4 0 0 1 8 0v3" />
              </svg>
            }
          />
        </div>
      </section>

      <div className="border-t border-[#e2e8f0]" />

      {/* SECTION 04 — INSTALL */}
      <section
        id="install"
        className="mx-auto max-w-[1180px] scroll-mt-20 px-8 py-[92px]"
        aria-labelledby="install-title"
      >
        <SectionHeader
          number="04"
          label="Install"
          labelTone="solid"
          titleId="install-title"
          title={t("web.install.title")}
          description={t("web.install.description")}
        />
        <StoreCallout />

        <div className="mt-[26px] grid grid-cols-1 gap-[18px] md:grid-cols-3">
          <InstallStep
            step={1}
            title={t("web.install.step1.title")}
            desc={t("web.install.step1.desc")}
          />
          <InstallStep
            step={2}
            title={t("web.install.step2.title")}
            desc={t("web.install.step2.desc")}
          >
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
          </InstallStep>
          <InstallStep
            step={3}
            title={t("web.install.step3.title")}
            desc={t("web.install.step3.desc")}
          />
        </div>
      </section>

      {/* CTA BAND */}
      <div className="border-t border-[#162033] bg-[#162033] text-white">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-8 px-8 py-14">
          <div>
            <h2 className="font-display text-[30px] font-black tracking-[-0.015em]">
              {t("web.cta.title")}
            </h2>
            <p className="mt-2 text-[15px] text-white/[0.78]">{t("web.cta.sub")}</p>
          </div>
          <a
            href="#install"
            className="gm-btn inline-flex items-center gap-[9px] rounded-[14px] bg-primary px-[26px] py-[15px] text-[15px] font-bold text-white shadow-[0_12px_30px_-12px_rgba(0,184,169,0.55)]"
          >
            {t("web.cta.button")}
            <ArrowRight />
          </a>
        </div>
      </div>

      {/* FOOTER */}
      <footer className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-5 px-8 py-[38px]">
        <div className="flex items-center gap-[10px]">
          <img
            src="/icon.png"
            alt="GotoMemory"
            width={28}
            height={28}
            className="h-7 w-7 rounded-[7px]"
          />
          <span className="text-sm font-bold">GotoMemory</span>
        </div>
        <div className="flex items-center gap-[22px]">
          {/* The store listing points here too, so it must stay reachable. */}
          <a href="/privacy/" className="gm-link text-[13.5px] font-medium text-[#4d5968]">
            {t("web.footer.privacy")}
          </a>
          <span className="font-mono text-[12.5px] tracking-[0.02em] text-[#7a8491]">
            {t("web.footer.tagline")}
          </span>
        </div>
      </footer>
    </div>
  );
}

/**
 * Two languages means a toggle, not a menu: the button shows the language you
 * would switch *to*, in that language, so it reads correctly either way round.
 */
function LanguageToggle() {
  const { locale, t, setLocale } = useI18n();
  const next = locale === "zh" ? "en" : "zh";
  return (
    <button
      type="button"
      onClick={() => setLocale(next)}
      lang={next === "zh" ? "zh-CN" : "en"}
      aria-label={t("web.lang.switchLabel")}
      data-testid="language-toggle"
      className="gm-link rounded-[8px] border border-[#d8e3ea] px-[10px] py-[5px] text-[13px] font-semibold text-[#4d5968]"
    >
      {t("web.lang.switch")}
    </button>
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
  titleId,
  description,
  descriptionWidth = "max-w-[560px]"
}: {
  number: string;
  label: string;
  labelTone: "solid" | "outline";
  title: ReactNode;
  titleId?: string;
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
        <h2
          id={titleId}
          className="mt-[14px] font-display text-[34px] font-black tracking-[-0.015em]"
        >
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

function InstallStep({
  step,
  title,
  desc,
  children
}: {
  step: number;
  title: string;
  desc: string;
  children?: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="gm-card flex flex-col rounded-[14px] border border-[#e2e8f0] bg-white p-[26px] shadow-[0_12px_30px_-24px_rgba(22,32,51,0.25)]">
      <div
        className="flex h-9 w-9 items-center justify-center rounded-full bg-[#effcfb] font-mono text-[15px] font-semibold text-primary"
        aria-label={t("web.install.stepLabel", { number: step })}
      >
        {step}
      </div>
      <h3 className="mt-[18px] font-display text-[18px] font-bold">{title}</h3>
      <p className="mt-[9px] text-[14.5px] leading-[1.6] text-[#64707d]">{desc}</p>
      {children ? <div className="mt-auto pt-[18px]">{children}</div> : null}
    </div>
  );
}

/**
 * The one place the install section commits to an action: the store button once
 * the listing is live, and an honest "in review" notice until then. Both states
 * keep the repository link, which is the only thing a curious visitor can act
 * on before the extension ships.
 */
function StoreCallout() {
  const { t } = useI18n();
  const listed = CHROME_WEB_STORE_URL !== null;
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-6 rounded-[16px] border px-[26px] py-[24px] ${
        listed ? "border-[#b7ece7] bg-[#f3fbfa]" : "border-[#e2e8f0] bg-[#f8fbfc]"
      }`}
    >
      <div>
        <h3 className="font-display text-[18px] font-bold">
          {listed ? t("web.nav.install") : t("web.install.pendingTitle")}
        </h3>
        <p className="mt-1.5 max-w-[620px] text-[14.5px] leading-[1.6] text-[#586574]">
          {listed ? t("web.install.browsers") : t("web.install.pendingNote")}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-[14px]">
        {CHROME_WEB_STORE_URL !== null ? (
          <a
            href={CHROME_WEB_STORE_URL}
            target="_blank"
            rel="noreferrer"
            className="gm-btn inline-flex items-center gap-[9px] rounded-[14px] bg-primary px-[24px] py-[14px] text-[15px] font-semibold text-white shadow-[0_10px_26px_-10px_rgba(0,184,169,0.62)]"
          >
            {t("web.install.storeCta")}
            <ArrowRight />
          </a>
        ) : null}
        <a
          href={REPO_URL}
          target="_blank"
          rel="noreferrer"
          className="gm-btn inline-flex items-center gap-[9px] rounded-[12px] border border-[#d8e3ea] bg-white px-[18px] py-[11px] text-[14px] font-semibold text-foreground shadow-[0_10px_26px_-18px_rgba(22,32,51,0.28)]"
        >
          {t("web.install.repo")}
          <ArrowRight />
        </a>
      </div>
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

/** GitHub's own mark, so the header link is recognisable without a text label. */
function GitHubIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.012 8.012 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
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
