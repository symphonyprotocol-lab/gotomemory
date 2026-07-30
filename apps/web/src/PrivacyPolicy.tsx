/**
 * The privacy policy the Chrome Web Store listing points at.
 *
 * It is a separate Vite entry rather than a client-side route, so `/privacy/`
 * is a real file on disk: a policy URL that 404s on a static host — the moment
 * a reviewer or a visitor opens it — is worse than not linking one at all.
 *
 * Everything here describes what the shipped extension actually does. Two
 * claims in particular have to stay true to the code: the single request to
 * `config.gotomemory.dev` (`apps/extension/src/selector-config.ts`), and the
 * absence of sync (`@gotomemory/sync` is deliberately not an extension
 * dependency). If either changes, this page changes in the same commit.
 */

import type { ReactNode } from "react";

import type { Locale } from "@gotomemory/i18n";

import { I18nProvider, useI18n } from "./i18n.js";

/** Bump whenever the wording below changes in a way that affects meaning. */
export const POLICY_UPDATED = "2026-07-30";

/**
 * Role address rather than anyone's personal mailbox — it appears on a public
 * page. It has to actually receive mail before the store listing goes live.
 */
export const PRIVACY_CONTACT_EMAIL = "privacy@gotomemory.dev";

const REPO_URL = "https://github.com/symphonyprotocol-lab/gotomemory";

export function PrivacyPolicy({ locale }: { locale?: Locale }) {
  return (
    <I18nProvider locale={locale} title="web.policy.meta.title">
      <PolicyPage />
    </I18nProvider>
  );
}

function PolicyPage() {
  const { t } = useI18n();
  return (
    <div className="min-h-screen bg-background font-sans text-foreground">
      <header className="border-b border-[#e2e8f0]">
        <div className="mx-auto flex max-w-[820px] items-center justify-between px-8 py-4">
          <a href="/" className="flex items-center gap-[11px]">
            <img
              src="/icon.png"
              alt="GotoMemory"
              width={32}
              height={32}
              className="h-8 w-8 rounded-[8px]"
            />
            <span className="text-[16px] font-bold tracking-[-0.01em]">GotoMemory</span>
          </a>
          <a href="/" className="gm-link text-sm font-medium text-[#4d5968]">
            {t("web.policy.backHome")}
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-[820px] px-8 pb-[80px] pt-[64px]">
        <h1 className="font-display text-[38px] font-black tracking-[-0.02em]">
          {t("web.policy.title")}
        </h1>
        <p className="mt-3 font-mono text-[12.5px] uppercase tracking-[0.1em] text-[#7a8491]">
          {t("web.policy.updated", { date: POLICY_UPDATED })}
        </p>
        <p className="mt-7 rounded-[14px] border border-[#b7ece7] bg-[#f3fbfa] px-[24px] py-[20px] text-[16px] leading-[1.7] text-[#334155]">
          {t("web.policy.lede")}
        </p>

        <Section title={t("web.policy.collect.title")}>
          <Paragraph>{t("web.policy.collect.body")}</Paragraph>
        </Section>

        <Section title={t("web.policy.stored.title")}>
          <Paragraph>{t("web.policy.stored.body")}</Paragraph>
          <List
            items={[
              t("web.policy.stored.item1"),
              t("web.policy.stored.item2"),
              t("web.policy.stored.item3")
            ]}
          />
        </Section>

        <Section title={t("web.policy.network.title")}>
          <Paragraph>{t("web.policy.network.body")}</Paragraph>
          <Paragraph>{t("web.policy.network.note")}</Paragraph>
        </Section>

        <Section title={t("web.policy.permissions.title")}>
          <List items={[t("web.policy.permissions.storage"), t("web.policy.permissions.hosts")]} />
        </Section>

        <Section title={t("web.policy.export.title")}>
          <Paragraph>{t("web.policy.export.body")}</Paragraph>
        </Section>

        <Section title={t("web.policy.thirdParty.title")}>
          <Paragraph>{t("web.policy.thirdParty.body")}</Paragraph>
        </Section>

        <Section title={t("web.policy.control.title")}>
          <Paragraph>{t("web.policy.control.body")}</Paragraph>
        </Section>

        <Section title={t("web.policy.sync.title")}>
          <Paragraph>{t("web.policy.sync.body")}</Paragraph>
        </Section>

        <Section title={t("web.policy.changes.title")}>
          <Paragraph>{t("web.policy.changes.body")}</Paragraph>
        </Section>

        <Section title={t("web.policy.contact.title")}>
          <Paragraph>{t("web.policy.contact.body", { email: PRIVACY_CONTACT_EMAIL })}</Paragraph>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="gm-link mt-3 inline-block font-mono text-[13px] text-[#4d5968]"
          >
            {REPO_URL}
          </a>
        </Section>
      </main>

      <footer className="mx-auto flex max-w-[820px] items-center justify-between gap-5 border-t border-[#e2e8f0] px-8 py-[30px]">
        <span className="text-sm font-bold">GotoMemory</span>
        <span className="font-mono text-[12.5px] text-[#7a8491]">{t("web.footer.tagline")}</span>
      </footer>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-11">
      <h2 className="font-display text-[22px] font-bold tracking-[-0.01em]">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Paragraph({ children }: { children: ReactNode }) {
  return <p className="mt-3 text-[15.5px] leading-[1.75] text-[#4d5968]">{children}</p>;
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="mt-4 flex flex-col gap-3">
      {items.map((item) => (
        <li
          key={item}
          className="border-l-[2.5px] border-[#b7ece7] pl-4 text-[15.5px] leading-[1.75] text-[#4d5968]"
        >
          {item}
        </li>
      ))}
    </ul>
  );
}
