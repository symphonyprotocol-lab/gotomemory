import type { Messages } from "./zh.js";

/** English UI strings. Keyed against `zh`, which is the reference dictionary. */
export const en: Messages = {
  // ---------------------------------------------------------------- web: meta
  "web.meta.title": "GotoMemory — Export AI chats, share memory across assistants",
  "web.lang.switch": "中文",
  "web.lang.switchLabel": "Switch to Chinese",

  // ----------------------------------------------------------------- web: nav
  "web.nav.export": "Export",
  "web.nav.memory": "Memory",
  "web.nav.privacy": "Privacy",
  "web.nav.install": "Install extension",
  "web.nav.github": "GitHub repository",

  // ---------------------------------------------------------------- web: hero
  "web.hero.badge": "Browser extension · Local-first",
  "web.hero.titleLead": "The best way to",
  "web.hero.titleAccent": "export",
  "web.hero.titleTail": " your AI chats.",
  "web.hero.leadA":
    "Save any ChatGPT, Claude, or Gemini conversation as Markdown, Obsidian, Notion, or PDF in one click. It all runs on your machine — ",
  "web.hero.leadStrong": "no uploads, no sign-in",
  "web.hero.leadB": ".",
  "web.hero.sub": "Cross-assistant memory is built in: tell one assistant, and they all remember.",
  "web.hero.ctaExport": "See what it exports",
  "web.hero.ctaMemory": "See cross-assistant memory",
  "web.hero.supports": "Works with",
  "web.hero.mockChatTitle": "ChatGPT",
  "web.hero.mockChatBody": "An architecture discussion worth keeping.",
  "web.hero.mockAppBody": "One click → Markdown · Obsidian · PDF, all on your machine.",
  "web.hero.mockNotesTitle": "Obsidian",
  "web.hero.mockNotesBody": "Saved “architecture-discussion.md”. Nothing was uploaded.",

  // --------------------------------------------------------------- web: stats
  "web.stats.clicks": "click to export the current chat",
  "web.stats.uploads": "bytes uploaded to a server by default",
  "web.stats.formats": "local export formats",

  // -------------------------------------------------------------- web: export
  "web.export.titleLead": "One click,",
  "web.export.titleTail": "entirely on your machine",
  "web.export.description":
    "Useful within a minute of installing: hit “Export” on any ChatGPT, Claude, or Gemini thread and save it as Markdown, Obsidian, Notion, PDF, and more. Nothing passes through our servers, and no public link is created.",
  "web.export.card1.title": "Many formats",
  "web.export.card1.desc":
    "Markdown, TXT, Obsidian, and PDF out of the box; Word, Notion, and JSON when you need them.",
  "web.export.card2.title": "Local export",
  "web.export.card2.desc":
    "Exporting saves the chat to your disk or your own notes vault — never to GotoMemory.",
  "web.export.card3.title": "Pick messages",
  "web.export.card3.desc":
    "The whole thread by default, or just the messages you select — code blocks, tables, and formulas kept faithful.",
  "web.export.card4.title": "Nothing published",
  "web.export.card4.desc":
    "An export creates no public page and no long-term memory. The conversation stays yours.",

  // -------------------------------------------------------------- web: memory
  "web.memory.title": "Tell one assistant, and they all remember",
  "web.memory.description":
    "Beyond export, the extension carries memory across assistants: save a preference or project background in one, and bring it into another with a single click.",
  "web.memory.card1.title": "One click to save, one to bring in",
  "web.memory.card1.desc":
    "Saving a memory and injecting it are each a single click, and memories live in the extension's local storage.",
  "web.memory.card2.title": "Per-site adapters",
  "web.memory.card2.desc":
    "ChatGPT, Claude, and Gemini each get a lightweight content script that reads messages and writes the composer.",
  "web.memory.card3.title": "Private-memory confirmation",
  "web.memory.card3.desc":
    "Ordinary memories can go in automatically; private ones enter a conversation only after you confirm.",

  // ------------------------------------------------------------- web: privacy
  "web.privacy.title": "Works offline, no account, no upload by default",
  "web.privacy.card1.title": "Your machine is the source of truth",
  "web.privacy.card1.desc":
    "Export and memory both happen inside the extension; sites share them through the background message channel.",
  "web.privacy.card2.title": "The server does only what it must",
  "web.privacy.card2.desc":
    "Export and memory need no server. Only sync — which you turn on explicitly, later — needs an account and the network.",

  // ------------------------------------------------------------- web: install
  "web.install.title": "One click from the store",
  "web.install.description":
    "Hit “Add to Chrome” in the store and you're done — no account, no configuration. Open ChatGPT, Claude, or Gemini afterwards and it is ready to use.",
  "web.install.storeCta": "Install from the Chrome Web Store",
  "web.install.browsers": "The same extension works on Edge, Brave, and other Chromium browsers.",
  "web.install.step1.title": "Click “Add to Chrome”",
  "web.install.step1.desc":
    "Your browser lists what the extension needs: local storage, and access to the ChatGPT, Claude, and Gemini pages. Accept and it is installed.",
  "web.install.step2.title": "Open an AI chat",
  "web.install.step2.desc":
    "Visit a ChatGPT, Claude, or Gemini conversation and the GotoMemory panel appears in the bottom-right corner. Reload the page once if a freshly installed extension hasn't attached yet.",
  "web.install.step3.title": "Export a chat or save a memory",
  "web.install.step3.desc":
    "“Export” saves the conversation as Markdown, Obsidian, PDF, and more. Saving instead keeps a preference or project background as a memory, ready to bring into another assistant.",
  "web.install.pendingTitle": "On its way to the store",
  "web.install.pendingNote":
    "The extension is going through store review; a one-click install button appears here once it is listed. Watch the repository on GitHub to hear about it first.",
  "web.install.repo": "Read the source on GitHub",
  "web.install.stepLabel": "Step {number}",

  // ----------------------------------------------------------------- web: cta
  "web.cta.title": "Your next conversation is one click from a file.",
  "web.cta.sub": "Install the extension for free. No sign-in, no upload.",
  "web.cta.button": "Install extension",
  "web.footer.tagline": "Local-first export and memory for AI assistants.",
  "web.footer.privacy": "Privacy policy",

  // -------------------------------------------------------- web: privacy policy
  "web.policy.meta.title": "Privacy policy — GotoMemory",
  "web.policy.title": "Privacy policy",
  "web.policy.updated": "Last updated: {date}",
  "web.policy.lede":
    "GotoMemory is a browser extension: exporting conversations and carrying memory between assistants both happen inside your own browser. There is no account system, and no server of ours holds your conversations.",
  "web.policy.collect.title": "What we collect",
  "web.policy.collect.body":
    "Nothing. The extension needs no sign-up, collects no name, email, or phone number, and sends us no conversation content, no memories, and no exported files.",
  "web.policy.stored.title": "What the extension stores on your machine",
  "web.policy.stored.body":
    "The following is kept in the local storage the browser gives the extension (chrome.storage.local), readable only by the extension on this device:",
  "web.policy.stored.item1":
    "The memories you chose to save, including the conversation text you selected, the site it came from, and when you saved it.",
  "web.policy.stored.item2":
    "Extension settings: interface language, auto-capture, trust mode, and similar switches.",
  "web.policy.stored.item3":
    "Local usage counts (such as how many injections you made this week), used only for the readout in the panel. They never leave this device.",
  "web.policy.network.title": "The extension's only network request",
  "web.policy.network.body":
    "The extension asks config.gotomemory.dev for a digitally signed “selector configuration”, which lets it keep finding the right page elements after ChatGPT, Claude, or Gemini redesign theirs. It is a read-only GET request, at most once every six hours, carrying no conversation content, no memories, and no identifiers. If the request fails or the signature does not verify, the extension keeps using its built-in configuration.",
  "web.policy.network.note":
    "As with any HTTP request, that server sees your IP address and the time of the request in its logs. Beyond this, the extension sends data to no server and loads no third-party scripts.",
  "web.policy.permissions.title": "Why the permissions are needed",
  "web.policy.permissions.storage":
    "Storage (storage, unlimitedStorage): to keep memories and settings on your machine. Whole conversations pass the default ~10MB quota quickly, which is why unlimitedStorage is requested.",
  "web.policy.permissions.hosts":
    "Access to chatgpt.com, claude.ai, gemini.google.com: to read conversation content on those three sites, show the panel, and write memories into the composer. The extension does not run on any other site.",
  "web.policy.export.title": "Exported files",
  "web.policy.export.body":
    "An export is built in your browser and saved by the browser wherever you choose, or handed to the system print dialog for PDF. Files never pass through us, and no public link is created.",
  "web.policy.thirdParty.title": "Third parties and advertising",
  "web.policy.thirdParty.body":
    "No analytics, no advertising, no cross-site tracking. We do not sell, rent, or share your data — we do not hold your data in the first place.",
  "web.policy.control.title": "Deleting your data",
  "web.policy.control.body":
    "“View memories” in the panel deletes individual memories or whole conversations, and uninstalling the extension makes the browser discard its local storage along with it. Files you already exported are your own files and are yours to delete.",
  "web.policy.sync.title": "About sync",
  "web.policy.sync.body":
    "This version ships no cloud sync and no way to sign in. Should sync arrive, it will be something you turn on explicitly, with end-to-end encrypted content, and this policy will be updated first.",
  "web.policy.changes.title": "Changes to this policy",
  "web.policy.changes.body":
    "Any update changes the date at the top of this page. If a version changes how data is handled, the extension update will say so too.",
  "web.policy.contact.title": "Contact",
  "web.policy.contact.body":
    "Privacy questions can go to {email}, or to an issue on the GitHub repository.",
  "web.policy.backHome": "Back to the homepage",

  // ------------------------------------------------------ extension: manifest
  "extension.name": "GotoMemory",
  "extension.description": "Share memory across AI assistants and export chats to your machine.",

  // ------------------------------------------------------- extension: controls
  "panel.action.saveAll": "Save whole conversation",
  "panel.action.inject": "Inject relevant memories",
  "panel.action.list": "View memories",
  "panel.action.export": "Export",
  "panel.action.settings": "Settings",
  "panel.action.collapse": "Collapse",
  "panel.action.expand": "Expand",
  "panel.format.markdown": "Markdown",
  "panel.format.txt": "Plain text TXT",
  "panel.format.obsidian": "Obsidian",
  "panel.format.pdf": "PDF (via print)",
  "panel.format.html": "HTML",
  "panel.format.json": "JSON",
  "panel.format.docx": "Word DOCX",
  "panel.format.notion": "Notion Blocks",
  "panel.settings.firstRun": "Getting started",
  "panel.settings.templates": "Add starter memories",
  "panel.settings.options": "Options",
  "panel.settings.autoCapture": "Auto-capture (save on send)",
  "panel.settings.trustMode": "Trust mode (auto-inject ordinary memories)",
  "panel.settings.metrics": "Local usage stats (counts stay on this machine)",
  "panel.settings.language": "Language",
  "panel.language.auto": "Follow browser",
  "panel.language.zh": "中文",
  "panel.language.en": "English",
  "panel.suggest.dismiss": "Dismiss",
  "panel.suggest.save": "Save",
  "panel.confirm.dismiss": "Don't inject",
  "panel.confirm.accept": "Confirm and inject",
  "panel.undo": "Undo this injection",

  // -------------------------------------------------------- extension: prompts
  "panel.onboarding":
    "First time? Pick a format, hit “Export”, and take this conversation with you",
  "panel.suggest.text":
    "{count} line here looks like a lasting preference. Save it to your memory library?|{count} lines here look like lasting preferences. Save them to your memory library?",
  "panel.suggest.saveCount": "Save the {count} line|Save the {count} lines",
  "panel.confirm.text":
    "{count} private memory also matches this topic; it goes in only after you confirm.|{count} private memories also match this topic; they go in only after you confirm.",
  "panel.metrics.readout": "{current} injections this week · {average}/week average",

  // ------------------------------------------------------- extension: statuses
  "panel.status.saving": "Saving…",
  "panel.status.savedAll":
    "✓ Saved {count} message from this conversation|✓ Saved {count} messages from this conversation",
  "panel.status.nothingToSave": "No messages found to save",
  "panel.status.searching": "Looking for relevant memories…",
  "panel.status.injected":
    "✓ Injected {count} relevant memory|✓ Injected {count} relevant memories",
  "panel.status.noRelevant": "No relevant memories to inject",
  "panel.status.autoInjected":
    "Auto-injected {count} memory (undoable)|Auto-injected {count} memories (undoable)",
  "panel.status.injectedPrivate":
    "✓ Injected {count} private memory|✓ Injected {count} private memories",
  "panel.status.noComposer": "Couldn't find the composer, nothing was injected",
  "panel.status.undone": "Injection undone",
  "panel.status.exporting": "Exporting…",
  "panel.status.nothingToExport": "Nothing here to export",
  "panel.status.printOpened": "✓ Print view opened — choose “Save as PDF” in the print dialog",
  "panel.status.printBlocked": "The browser blocked the print window; allow pop-ups and try again",
  "panel.status.exported": "✓ Exported {filename}",
  "panel.status.exportFailed": "Export failed, please try again",
  "panel.status.addingTemplates": "Adding…",
  "panel.status.templatesPresent": "All starter memories are already in your library",
  "panel.status.templatesAdded": "✓ Added {count} starter memory|✓ Added {count} starter memories",
  "panel.status.savedMemories": "✓ Saved {count} memory|✓ Saved {count} memories",
  "panel.status.autoCaptureOn": "Auto-capture on",
  "panel.status.autoCaptureOff": "Auto-capture off",
  "panel.status.autoSaved": "✓ Auto-saved {count} message|✓ Auto-saved {count} messages",
  "panel.status.autoSaveFailed": "Auto-save failed",
  "panel.status.genericError": "Something went wrong, please try again",
  "panel.status.quotaFull":
    "Storage is full: delete some old conversations under “View memories” and try again",

  // -------------------------------------------------------- extension: library
  "library.title": "Memory library",
  "library.back": "Back",
  "library.close": "Close",
  "library.search": "Search conversations…",
  "library.empty": "No memories saved yet",
  "library.noMatches": "No matching conversations",
  "library.loadFailed": "Couldn't load, please try again",
  "library.count": "{count} item|{count} items",
  "library.deleteGroup": "Delete group",
  "library.deleteGroupConfirm":
    "Delete the {count} memory in “{title}”? This cannot be undone.|Delete the {count} memories in “{title}”? This cannot be undone.",
  "library.openOriginal": "Open original chat",
  "library.untitled": "Unfiled memories",
  "library.conversation": "Conversation {id}",
  "library.delete": "Delete",
  "library.roleAi": "AI",
  "library.roleMe": "Me",
  "library.previewAi": "AI: ",
  "library.previewMe": "Me: ",
  "library.private": "Private",
  "library.privateOn": "Unmark private (can be auto-injected)",
  "library.privateOff": "Mark private (confirm before injecting)",
  "library.today": "Today {time}"
};
