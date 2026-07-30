/**
 * Static presentation of the floating panel: stylesheet, logo, icons, and
 * markup. No behavior lives here — mount.ts wires the handlers. Split out so
 * the mount logic is readable without scrolling through 300 lines of CSS.
 *
 * The markup ships without literal text: every label carries a `data-gm-t*`
 * key that `applyPanelText` resolves. That way switching language re-labels the
 * live panel instead of re-rendering it, so no event listener is ever lost.
 */

import type { MessageKey, Translator } from "@gotomemory/i18n";

export const PANEL_STYLE = `
  :host { all: initial; }
  /* The [hidden] attribute is how the suggestion box, undo link, and drawer back
     button toggle. Their own rules set an explicit display (display:flex, or
     display:inline via all:unset), which would otherwise override the UA
     [hidden]{display:none}. Force it so "hidden" actually hides. */
  [hidden] { display: none !important; }
  @property --gm-angle { syntax: "<angle>"; inherits: false; initial-value: 0deg; }
  :host {
    --gm-bg: #ffffff; --gm-head-bg: #ffffff; --gm-border: #d8e3ea;
    --gm-text: #162033; --gm-muted: #586574;
    --gm-surface: #effcfb; --gm-surface-hover: #dff7f5; --gm-item-bg: #f8fbfc; --gm-item-text: #253246;
    --gm-primary: #00b8a9; --gm-primary-hover: #009c91; --gm-on-primary: #ffffff;
    --gm-ok: #0f766e; --gm-warn: #b97800; --gm-danger: #ff4d49; --gm-danger-bg: #ffe8e5;
    --gm-focus: rgba(0, 184, 169, 0.24);
    --gm-shadow: 0 14px 36px rgba(22, 32, 51, 0.14);
  }
  @media (prefers-color-scheme: dark) {
    :host {
      --gm-bg: #162033; --gm-head-bg: #1d2a3e; --gm-border: #34425a;
      --gm-text: #f7f2e7; --gm-muted: #b8c0ca;
      --gm-surface: #243449; --gm-surface-hover: #2e4058; --gm-item-bg: #1d2a3e; --gm-item-text: #f2eee5;
      --gm-primary: #00d3c2; --gm-primary-hover: #00b8a9; --gm-on-primary: #162033;
      --gm-ok: #6ee7d8; --gm-warn: #fdb52a; --gm-danger: #ff8b80; --gm-danger-bg: #3f2b36;
      --gm-focus: rgba(0, 211, 194, 0.28);
      --gm-shadow: 0 8px 28px rgba(0, 0, 0, 0.42);
    }
  }
  .gm-card {
    position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; width: 248px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    background: var(--gm-bg); color: var(--gm-text); border: 1px solid var(--gm-border);
    border-radius: 14px; box-shadow: var(--gm-shadow); overflow: hidden;
  }
  /* Busy indicator: a light dot sweeping around the card border while an action
     runs. A conic gradient masked to a 2px ring; the bright arc rotates via the
     registered --gm-angle. Hidden (opacity 0) unless .gm-busy is set. */
  .gm-card::after {
    content: ""; position: absolute; inset: 0; border-radius: inherit; padding: 1.6px;
    pointer-events: none; opacity: 0; transition: opacity 0.2s ease;
    background: conic-gradient(from var(--gm-angle),
      transparent 0 76%, var(--gm-primary) 86% 90%, transparent 100%);
    -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
    -webkit-mask-composite: xor;
    mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
    mask-composite: exclude;
  }
  .gm-card.gm-busy::after { opacity: 1; animation: gm-beam 1.1s linear infinite; }
  @keyframes gm-beam { to { --gm-angle: 360deg; } }
  /* Collapsed: the settings drawer lives in the hidden body, so its gear is
     useless — hide it too, leaving just save / inject / expand. */
  .gm-card.gm-collapsed [data-gotomemory-settings-toggle] { display: none; }
  .gm-head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 13px 10px; background: var(--gm-head-bg); font-size: 13px; font-weight: 700;
    border-bottom: 1px solid var(--gm-border);
  }
  .gm-brand { display: flex; align-items: center; gap: 7px; }
  .gm-logo { width: 18px; height: 18px; flex: none; border-radius: 4px; object-fit: contain; background: #fff; }
  .gm-head-actions { display: flex; align-items: center; gap: 4px; }
  .gm-iconbtn {
    all: unset; box-sizing: border-box; cursor: pointer; color: var(--gm-muted);
    width: 26px; height: 26px; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center;
    line-height: 0; transition: color 0.15s ease, background 0.15s ease, transform 0.15s ease;
  }
  .gm-iconbtn:hover { background: var(--gm-surface); color: var(--gm-primary); transform: translateY(-1px); }
  .gm-iconbtn:focus-visible { outline: 2px solid var(--gm-focus); outline-offset: 1px; }
  .gm-iconbtn svg { width: 16px; height: 16px; }
  .gm-iconbtn.gm-flash-ok { color: var(--gm-ok); }
  .gm-iconbtn.gm-flash-warn { color: var(--gm-warn); }
  .gm-toggle {
    all: unset; box-sizing: border-box; cursor: pointer; color: var(--gm-muted); line-height: 0;
    width: 26px; height: 26px; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center;
    transition: color 0.15s ease, background 0.15s ease, transform 0.15s ease;
  }
  .gm-toggle:hover { background: var(--gm-surface); color: var(--gm-primary); transform: translateY(-1px); }
  .gm-toggle:focus-visible { outline: 2px solid var(--gm-focus); outline-offset: 1px; }
  .gm-toggle svg { width: 16px; height: 16px; }
  .gm-body { display: flex; flex-direction: column; gap: 10px; padding: 13px 12px 14px; }
  .gm-card.gm-collapsed .gm-body { display: none; }
  .gm-btn {
    all: unset; box-sizing: border-box; cursor: pointer; text-align: center;
    min-height: 36px; padding: 9px 12px; border-radius: 9px; font-size: 13px; font-weight: 700;
    background: var(--gm-primary); color: var(--gm-on-primary);
    box-shadow: 0 10px 22px -14px rgba(0, 184, 169, 0.7);
    transition: background 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
  }
  .gm-btn:hover { background: var(--gm-primary-hover); transform: translateY(-1px); box-shadow: 0 12px 24px -14px rgba(0, 184, 169, 0.82); }
  .gm-btn:focus-visible { outline: 2px solid var(--gm-focus); outline-offset: 2px; }
  .gm-btn.gm-secondary {
    background: var(--gm-surface); color: var(--gm-text); border: 1px solid transparent; box-shadow: none;
    font-weight: 650;
  }
  .gm-btn.gm-secondary:hover { background: var(--gm-surface-hover); border-color: #b7ece7; color: #0c6f68; }
  /* Status sits outside .gm-body so its text feedback is visible even while the
     panel is collapsed; it takes no space when empty. */
  .gm-status { font-size: 11.5px; color: var(--gm-muted); text-align: center; padding: 0 12px 11px; }
  .gm-card.gm-collapsed .gm-status { padding-top: 10px; }
  .gm-status:empty { display: none; }
  .gm-status.gm-ok { color: var(--gm-ok); }
  .gm-status.gm-warn { color: var(--gm-warn); }
  .gm-item { background: var(--gm-item-bg); border-radius: 8px; padding: 8px 9px; display: flex; flex-direction: column; gap: 6px; }
  .gm-item-text {
    font-size: 12px; line-height: 1.4; color: var(--gm-item-text);
    overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  }
  .gm-item-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .gm-item-right { display: flex; align-items: center; gap: 6px; flex: none; }
  .gm-item-time { font-size: 10px; color: var(--gm-muted); white-space: nowrap; }
  .gm-tags { display: flex; gap: 5px; }
  .gm-tag { font-size: 10px; color: var(--gm-muted); background: var(--gm-surface); border-radius: 5px; padding: 1px 6px; }
  .gm-tag.gm-private { color: var(--gm-warn); }
  /* The privacy tag doubles as its own toggle; off-state is muted, on-state marked. */
  button.gm-tag { all: unset; box-sizing: border-box; cursor: pointer;
    font-size: 10px; border-radius: 5px; padding: 1px 6px;
    background: var(--gm-surface); color: var(--gm-muted); }
  button.gm-tag.gm-tag-toggle { opacity: 0.5; }
  button.gm-tag:hover { opacity: 1; color: var(--gm-warn); }
  button.gm-tag.gm-tag-on { opacity: 1; color: var(--gm-warn); font-weight: 700; }
  button.gm-tag:focus-visible { outline: 2px solid var(--gm-focus); outline-offset: 1px; }
  .gm-tag.gm-role-me { color: var(--gm-on-primary); background: var(--gm-primary); }
  .gm-tag.gm-role-ai { color: var(--gm-ok); }
  .gm-item.gm-answer { border-left: 2px solid var(--gm-primary); }
  .gm-del { all: unset; cursor: pointer; color: var(--gm-muted); font-size: 12px; padding: 2px 7px; border-radius: 5px; }
  .gm-del:hover { background: var(--gm-danger-bg); color: var(--gm-danger); }
  .gm-empty { font-size: 12px; color: var(--gm-muted); text-align: center; padding: 8px 0; }
  .gm-divider { height: 1px; background: var(--gm-border); margin: 1px 0 0; }
  .gm-row { display: grid; grid-template-columns: 1fr auto; gap: 7px; align-items: center; }
  .gm-select {
    all: unset; box-sizing: border-box; cursor: pointer; min-width: 0; height: 34px;
    /* all:unset drops the UA vertical centering; line-height = content box height
       (34px − 2×1px border) re-centers the selected text to match .gm-mini. */
    line-height: 32px;
    background: var(--gm-surface); color: var(--gm-text); font-size: 12px; padding: 0 28px 0 10px;
    border: 1px solid transparent; border-radius: 9px;
    background-image:
      linear-gradient(45deg, transparent 50%, var(--gm-muted) 50%),
      linear-gradient(135deg, var(--gm-muted) 50%, transparent 50%);
    background-position: calc(100% - 15px) 14px, calc(100% - 10px) 14px;
    background-size: 5px 5px, 5px 5px;
    background-repeat: no-repeat;
  }
  .gm-select:hover { background-color: var(--gm-surface-hover); border-color: #b7ece7; }
  .gm-select:focus-visible { outline: 2px solid var(--gm-focus); outline-offset: 1px; }
  .gm-select option {
    color: #162033;
    background: #ffffff;
  }
  .gm-mini {
    all: unset; box-sizing: border-box; cursor: pointer; height: 34px; min-width: 48px;
    display: inline-flex; align-items: center; justify-content: center;
    background: var(--gm-primary); color: var(--gm-on-primary);
    font-size: 12px; font-weight: 700; padding: 0 13px; border-radius: 9px;
    box-shadow: 0 8px 18px -12px rgba(0, 184, 169, 0.78);
    transition: background 0.15s ease, transform 0.15s ease;
  }
  .gm-mini:hover { background: var(--gm-primary-hover); transform: translateY(-1px); }
  .gm-mini:focus-visible { outline: 2px solid var(--gm-focus); outline-offset: 1px; }
  .gm-check {
    display: flex; align-items: center; gap: 8px; font-size: 11.5px;
    color: var(--gm-muted); cursor: pointer; user-select: none;
  }
  .gm-check input {
    appearance: none; box-sizing: border-box; cursor: pointer; margin: 0;
    width: 13px; height: 13px; border: 1.5px solid #8fa2b1; border-radius: 3px;
    background: #fff; display: grid; place-content: center;
  }
  .gm-check input::before {
    content: ""; width: 7px; height: 7px; transform: scale(0); transition: transform 0.12s ease;
    clip-path: polygon(14% 44%, 0 60%, 38% 100%, 100% 18%, 84% 4%, 36% 70%);
    background: var(--gm-on-primary);
  }
  .gm-check input:checked { border-color: var(--gm-primary); background: var(--gm-primary); }
  .gm-check input:checked::before { transform: scale(1); }
  .gm-check input:focus-visible { outline: 2px solid var(--gm-focus); outline-offset: 2px; }
  .gm-drawer {
    position: fixed; top: 0; right: 0; bottom: 0; width: 360px; max-width: 92vw; z-index: 2147483647;
    background: var(--gm-bg); color: var(--gm-text); border-left: 1px solid var(--gm-border);
    box-shadow: var(--gm-shadow); transform: translateX(100%); transition: transform 0.22s ease;
    display: flex; flex-direction: column;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  }
  .gm-drawer.gm-open { transform: none; }
  .gm-drawer-head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 16px; background: var(--gm-head-bg); font-size: 14px; font-weight: 600;
  }
  .gm-drawer-close {
    all: unset; cursor: pointer; color: var(--gm-muted); font-size: 16px;
    padding: 2px 8px; border-radius: 6px;
  }
  .gm-drawer-close:hover { background: var(--gm-surface); color: var(--gm-text); }
  .gm-drawer-back {
    all: unset; cursor: pointer; color: var(--gm-muted); font-size: 16px;
    padding: 2px 8px; border-radius: 6px; flex: none;
  }
  .gm-drawer-back:hover { background: var(--gm-surface); color: var(--gm-text); }
  .gm-drawer-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .gm-conv {
    display: flex; align-items: center; gap: 8px; padding: 10px 11px;
    border: 1px solid var(--gm-border); border-radius: 10px; cursor: pointer;
  }
  .gm-conv:hover { background: var(--gm-head-bg); }
  .gm-conv-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
  .gm-conv-title-row { display: flex; align-items: baseline; gap: 8px; }
  .gm-conv-title { flex: 1; font-size: 12.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .gm-conv-time { flex: none; font-size: 10.5px; color: var(--gm-muted); }
  .gm-conv-preview {
    font-size: 11.5px; color: var(--gm-muted); overflow: hidden;
    text-overflow: ellipsis; white-space: nowrap;
  }
  .gm-conv-side { display: flex; align-items: center; gap: 4px; flex: none; }
  .gm-conv-count { font-size: 11px; color: var(--gm-muted); }
  .gm-conv-chevron { color: var(--gm-muted); font-size: 13px; }
  .gm-detail-meta { display: flex; align-items: center; gap: 10px; margin-bottom: 2px; }
  .gm-detail-link { font-size: 11px; color: var(--gm-primary); text-decoration: none; }
  .gm-detail-link:hover { text-decoration: underline; }
  .gm-detail-del {
    all: unset; cursor: pointer; font-size: 11px; color: var(--gm-muted);
    padding: 1px 6px; border-radius: 5px;
  }
  .gm-detail-del:hover { background: var(--gm-danger-bg); color: var(--gm-danger); }
  .gm-search { margin: 12px 16px 0; }
  .gm-search input {
    all: unset; box-sizing: border-box; width: 100%; background: var(--gm-surface);
    color: var(--gm-text); font-size: 13px; padding: 9px 11px; border-radius: 8px;
  }
  .gm-groups { flex: 1; overflow-y: auto; padding: 12px 16px 20px; display: flex; flex-direction: column; gap: 8px; }
  .gm-settings { display: none; flex-direction: column; gap: 9px; }
  .gm-settings.gm-open { display: flex; }
  .gm-settings-title { font-size: 10.5px; font-weight: 700; color: var(--gm-muted); letter-spacing: 0.03em; }
  .gm-toggle.gm-active { color: var(--gm-primary); background: var(--gm-surface); }
  /* One-time prompt shown right after an export; left accent marks it as a nudge, not a control. */
  .gm-suggest {
    background: var(--gm-surface); border-left: 2px solid var(--gm-primary);
    border-radius: 8px; padding: 9px 10px; display: flex; flex-direction: column; gap: 8px;
  }
  /* Private-memory confirmation is a gate, not a nudge — mark it distinctly. */
  .gm-suggest.gm-confirm { background: var(--gm-danger-bg); border-left-color: var(--gm-warn); }
  /* Local-only counters; the switch above them controls whether they are collected. */
  .gm-metrics { font-size: 10.5px; line-height: 1.5; color: var(--gm-muted); }
  .gm-metrics:empty { display: none; }
  .gm-suggest-text { font-size: 11.5px; line-height: 1.45; color: var(--gm-item-text); }
  .gm-suggest-actions { display: flex; align-items: center; justify-content: flex-end; gap: 6px; }
  .gm-undo {
    all: unset; box-sizing: border-box; cursor: pointer; text-align: center; font-size: 11.5px;
    color: var(--gm-primary); padding: 7px; border-radius: 7px; background: var(--gm-surface);
  }
  .gm-undo:hover { background: var(--gm-surface-hover); color: var(--gm-primary-hover); }
`;

const LOGO_DATA_URL =
  "data:image/png;base64,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";
const LOGO_SVG = `<img class="gm-logo" src="${LOGO_DATA_URL}" alt="" aria-hidden="true">`;

const SAVE_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 5h14v10H9l-4 4V5Z"/><path d="M9 9h6"/><path d="M9 12h4"/><path d="m14.8 15.2 1.4 1.4 3-3"/></svg>`;
const INJECT_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="5.5" cy="7" r="2"/><circle cx="5.5" cy="17" r="2"/><path d="M7.5 7h4.5c2.2 0 4 1.8 4 4v1"/><path d="M7.5 17h4.5c2.2 0 4-1.8 4-4v-1"/><path d="M13 12h6"/><path d="m16 9 3 3-3 3"/></svg>`;
export const COLLAPSE_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>`;
export const EXPAND_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m7 14 5-5 5 5"/></svg>`;
const SETTINGS_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;

export const PANEL_HTML = `
  <div class="gm-card" data-gotomemory-card>
    <div class="gm-head">
      <span class="gm-brand">${LOGO_SVG} GotoMemory</span>
      <div class="gm-head-actions">
        <button class="gm-iconbtn" data-gotomemory-quick="save-all" data-gm-t-title="panel.action.saveAll">${SAVE_ICON}</button>
        <button class="gm-iconbtn" data-gotomemory-quick="inject" data-gm-t-title="panel.action.inject">${INJECT_ICON}</button>
        <button class="gm-toggle" data-gotomemory-settings-toggle data-gm-t-title="panel.action.settings">${SETTINGS_ICON}</button>
        <button class="gm-toggle" data-gotomemory-toggle data-gm-t-title="panel.action.collapse">${COLLAPSE_ICON}</button>
      </div>
    </div>
    <div class="gm-body">
      <div class="gm-row">
        <select class="gm-select" data-gotomemory-format>
          <option value="markdown" data-gm-t="panel.format.markdown"></option>
          <option value="txt" data-gm-t="panel.format.txt"></option>
          <option value="obsidian" data-gm-t="panel.format.obsidian"></option>
          <option value="pdf-print" data-gm-t="panel.format.pdf"></option>
          <option value="html" data-gm-t="panel.format.html"></option>
          <option value="json" data-gm-t="panel.format.json"></option>
          <option value="docx" data-gm-t="panel.format.docx"></option>
          <option value="notion" data-gm-t="panel.format.notion"></option>
        </select>
        <button class="gm-mini" data-gotomemory-action="export" data-gm-t="panel.action.export"></button>
      </div>
      <button class="gm-btn" data-gotomemory-action="save-all" data-gm-t="panel.action.saveAll"></button>
      <button class="gm-btn gm-secondary" data-gotomemory-action="inject" data-gm-t="panel.action.inject"></button>
      <button class="gm-btn gm-secondary" data-gotomemory-action="list" data-gm-t="panel.action.list"></button>
      <div class="gm-settings" data-gotomemory-settings>
        <div class="gm-divider"></div>
        <div class="gm-settings-title" data-gm-t="panel.settings.firstRun"></div>
        <button class="gm-btn gm-secondary" data-gotomemory-action="templates" data-gm-t="panel.settings.templates"></button>
        <div class="gm-settings-title" data-gm-t="panel.settings.options"></div>
        <label class="gm-check">
          <input type="checkbox" data-gotomemory-auto> <span data-gm-t="panel.settings.autoCapture"></span>
        </label>
        <label class="gm-check">
          <input type="checkbox" data-gotomemory-trust> <span data-gm-t="panel.settings.trustMode"></span>
        </label>
        <label class="gm-check">
          <input type="checkbox" data-gotomemory-metrics> <span data-gm-t="panel.settings.metrics"></span>
        </label>
        <div class="gm-metrics" data-gotomemory-metrics-readout></div>
        <div class="gm-settings-title" data-gm-t="panel.settings.language"></div>
        <select class="gm-select" data-gotomemory-locale data-gm-t-title="panel.settings.language">
          <option value="auto" data-gm-t="panel.language.auto"></option>
          <option value="zh" data-gm-t="panel.language.zh"></option>
          <option value="en" data-gm-t="panel.language.en"></option>
        </select>
      </div>
      <div class="gm-suggest" data-gotomemory-suggest hidden>
        <div class="gm-suggest-text" data-gotomemory-suggest-text></div>
        <div class="gm-suggest-actions">
          <button class="gm-del" data-gotomemory-suggest-dismiss data-gm-t="panel.suggest.dismiss"></button>
          <button class="gm-mini" data-gotomemory-suggest-save data-gm-t="panel.suggest.save"></button>
        </div>
      </div>
      <div class="gm-suggest gm-confirm" data-gotomemory-confirm hidden>
        <div class="gm-suggest-text" data-gotomemory-confirm-text></div>
        <div class="gm-suggest-actions">
          <button class="gm-del" data-gotomemory-confirm-dismiss data-gm-t="panel.confirm.dismiss"></button>
          <button class="gm-mini" data-gotomemory-confirm-accept data-gm-t="panel.confirm.accept"></button>
        </div>
      </div>
      <button class="gm-undo" data-gotomemory-undo hidden data-gm-t="panel.undo"></button>
    </div>
    <div class="gm-status" data-gotomemory-status></div>
  </div>
  <aside class="gm-drawer" data-gotomemory-drawer>
    <div class="gm-drawer-head">
      <button class="gm-drawer-back" data-gotomemory-back data-gm-t-title="library.back" hidden>←</button>
      <span class="gm-drawer-title" data-gotomemory-drawer-title data-gm-t="library.title"></span>
      <button class="gm-drawer-close" data-gotomemory-drawer-close data-gm-t-title="library.close">✕</button>
    </div>
    <div class="gm-search" data-gotomemory-search-wrap>
      <input type="text" data-gm-t-placeholder="library.search" data-gotomemory-search>
    </div>
    <div class="gm-groups" data-gotomemory-groups></div>
  </aside>
`;

/**
 * Label every static node from the dictionary. Called once at mount and again
 * whenever the language changes — it only writes text/attributes, never markup,
 * so bound handlers and transient state (hidden boxes, collapsed card) survive.
 *
 * Icon buttons carry `data-gm-t-title` only: their content is an inline SVG,
 * so the label goes to `title`/`aria-label` instead of textContent.
 */
export function applyPanelText(root: ParentNode, t: Translator): void {
  root.querySelectorAll<HTMLElement>("[data-gm-t]").forEach((element) => {
    element.textContent = t(element.dataset.gmT as MessageKey);
  });
  root.querySelectorAll<HTMLElement>("[data-gm-t-title]").forEach((element) => {
    const label = t(element.dataset.gmTTitle as MessageKey);
    element.title = label;
    element.setAttribute("aria-label", label);
  });
  root.querySelectorAll<HTMLInputElement>("[data-gm-t-placeholder]").forEach((element) => {
    element.placeholder = t(element.dataset.gmTPlaceholder as MessageKey);
  });
}
