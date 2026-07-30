/**
 * Chinese UI strings — the reference dictionary. Every other locale is typed
 * as `Record<keyof typeof zh, string>`, so adding a key here is a compile
 * error until every language has it.
 *
 * Keys are namespaced by surface: `web.*` is the marketing site, `panel.*` the
 * floating extension panel, `library.*` the memory drawer.
 *
 * `{name}` placeholders are filled by the translator.
 */
export const zh = {
  // ---------------------------------------------------------------- web: meta
  "web.meta.title": "GotoMemory — AI 对话导出与跨助手记忆",
  "web.lang.switch": "EN",
  "web.lang.switchLabel": "切换到英文",

  // ----------------------------------------------------------------- web: nav
  "web.nav.export": "导出",
  "web.nav.memory": "记忆",
  "web.nav.privacy": "隐私",
  "web.nav.install": "安装扩展",
  "web.nav.github": "GitHub 仓库",

  // ---------------------------------------------------------------- web: hero
  "web.hero.badge": "浏览器扩展 · 本地优先",
  "web.hero.titleLead": "最好用的 AI 对话",
  "web.hero.titleAccent": "导出",
  "web.hero.titleTail": "工具。",
  "web.hero.leadA":
    "在 ChatGPT、Claude、Gemini 里一键把对话导出成 Markdown、Obsidian、Notion、PDF。全程本机完成，",
  "web.hero.leadStrong": "不上传、免登录",
  "web.hero.leadB": "。",
  "web.hero.sub": "还内置跨助手记忆：告诉一个助手，所有助手都记得。",
  "web.hero.ctaExport": "看导出能力",
  "web.hero.ctaMemory": "看跨助手记忆",
  "web.hero.supports": "支持",
  "web.hero.mockChatTitle": "ChatGPT",
  "web.hero.mockChatBody": "一段值得留下的架构讨论。",
  "web.hero.mockAppBody": "一键导出 → Markdown · Obsidian · PDF，全程本机。",
  "web.hero.mockNotesTitle": "Obsidian",
  "web.hero.mockNotesBody": "已保存「架构讨论.md」，没有任何内容上传。",

  // --------------------------------------------------------------- web: stats
  "web.stats.clicks": "次点击，导出当前对话",
  "web.stats.uploads": "默认上传到服务器的字节",
  "web.stats.formats": "本机导出格式",

  // -------------------------------------------------------------- web: export
  "web.export.titleLead": "一键导出，",
  "web.export.titleTail": "全程本机完成",
  "web.export.description":
    "装完扩展一分钟内见效：在 ChatGPT、Claude、Gemini 的对话页点一次「导出」，把当前对话保存成 Markdown、Obsidian、Notion、PDF 等格式。内容不经过我们的服务器，也不生成公开链接。",
  "web.export.card1.title": "多格式",
  "web.export.card1.desc": "Markdown、TXT、Obsidian、PDF 开箱即用，Word、Notion、JSON 按需扩展。",
  "web.export.card2.title": "本机导出",
  "web.export.card2.desc": "导出只是把对话保存到本机或推进你自己的笔记库，不上传到 GotoMemory。",
  "web.export.card3.title": "勾选消息",
  "web.export.card3.desc": "默认导出整段对话，也可以只勾选需要的消息，代码块、表格、公式尽量保真。",
  "web.export.card4.title": "不发布",
  "web.export.card4.desc": "导出不会创建公开页面，也不会自动变成长期记忆，对话内容由你自己保管。",

  // -------------------------------------------------------------- web: memory
  "web.memory.title": "告诉一个助手，所有助手都记得",
  "web.memory.description":
    "导出之外，扩展还内置跨助手记忆：在一个助手里保存偏好或项目背景，换到另一个助手时一键带入。",
  "web.memory.card1.title": "一键保存、一键带入",
  "web.memory.card1.desc": "保存一条记忆和带入记忆都只要一次点击，记忆存在浏览器扩展本机存储里。",
  "web.memory.card2.title": "站点适配",
  "web.memory.card2.desc":
    "ChatGPT、Claude、Gemini 各自用轻量 content script 读取消息和写入输入框。",
  "web.memory.card3.title": "私密确认",
  "web.memory.card3.desc": "普通记忆可默认勾选，私密记忆必须由用户确认后才进入对话。",

  // ------------------------------------------------------------- web: privacy
  "web.privacy.title": "离线可用、免登录、默认不上传",
  "web.privacy.card1.title": "本机是数据源头",
  "web.privacy.card1.desc":
    "导出和记忆都在浏览器扩展本机完成，跨站点通过 background 消息通道共享。",
  "web.privacy.card2.title": "服务器只做必要的事",
  "web.privacy.card2.desc": "默认导出和记忆不需要服务器；只有后续显式开启的同步才需要登录和网络。",

  // ------------------------------------------------------------- web: install
  "web.install.title": "从应用商店一键安装",
  "web.install.description":
    "在应用商店点一下「添加至 Chrome」就装好了，不用注册、不用配置。装完打开 ChatGPT、Claude 或 Gemini 就能直接用。",
  "web.install.storeCta": "从 Chrome 应用商店安装",
  "web.install.browsers": "同一个扩展也适用于 Edge、Brave 等 Chromium 内核浏览器。",
  "web.install.step1.title": "在商店点「添加至 Chrome」",
  "web.install.step1.desc":
    "浏览器会提示扩展需要的权限：本机存储，以及读写 ChatGPT、Claude、Gemini 三个站点的页面。确认后即安装完成。",
  "web.install.step2.title": "打开一个 AI 对话页",
  "web.install.step2.desc":
    "访问 ChatGPT、Claude 或 Gemini 的对话页，右下角会出现 GotoMemory 浮层。刚装好时如果没看到，刷新一次页面即可。",
  "web.install.step3.title": "导出对话或保存记忆",
  "web.install.step3.desc":
    "点「导出」把当前对话保存成 Markdown、Obsidian、PDF 等格式；点保存则把偏好或项目背景存成记忆，换助手时一键带入。",
  "web.install.pendingTitle": "正在上架应用商店",
  "web.install.pendingNote":
    "扩展正在提交应用商店审核，上架后这里会出现一键安装按钮。想第一时间知道，可以在 GitHub 上 Watch 仓库。",
  "web.install.repo": "在 GitHub 上查看源码",
  "web.install.stepLabel": "第 {number} 步",

  // ----------------------------------------------------------------- web: cta
  "web.cta.title": "下一次对话，就能一键导出。",
  "web.cta.sub": "免费安装扩展，不登录、不上传。",
  "web.cta.button": "安装扩展",
  "web.footer.tagline": "面向 AI 助手的本地优先导出与记忆。",
  "web.footer.privacy": "隐私政策",

  // -------------------------------------------------------- web: privacy policy
  "web.policy.meta.title": "隐私政策 — GotoMemory",
  "web.policy.title": "隐私政策",
  "web.policy.updated": "最后更新：{date}",
  "web.policy.lede":
    "GotoMemory 是一个浏览器扩展：导出对话和跨助手记忆都在你自己的浏览器里完成。我们没有账号系统，也没有存放你对话内容的服务器。",
  "web.policy.collect.title": "我们收集的信息",
  "web.policy.collect.body":
    "没有。扩展不需要注册，不收集姓名、邮箱或手机号，也不会把对话内容、记忆内容或导出的文件发送给我们。",
  "web.policy.stored.title": "扩展在你本机存了什么",
  "web.policy.stored.body":
    "下列数据保存在浏览器分配给扩展的本机存储（chrome.storage.local）里，只有这台设备上的扩展能读取：",
  "web.policy.stored.item1": "你主动保存的记忆，包含你选中的对话文本、来源站点和保存时间。",
  "web.policy.stored.item2": "扩展设置：界面语言、自动捕获、信任模式等开关。",
  "web.policy.stored.item3":
    "本机使用计数（例如本周注入了几次），只用于面板上的统计显示，不会离开这台设备。",
  "web.policy.network.title": "扩展唯一的联网行为",
  "web.policy.network.body":
    "扩展会向 config.gotomemory.dev 请求一份带数字签名的「选择器配置」，用于在 ChatGPT、Claude、Gemini 改版后仍能正确识别页面元素。这是一个只读 GET 请求，最多每 6 小时一次，不携带任何对话内容、记忆或身份信息；请求失败或签名校验不通过时，扩展继续使用内置配置。",
  "web.policy.network.note":
    "和任何 HTTP 请求一样，该服务器在日志层面会看到你的 IP 地址和请求时间。除此之外扩展不向任何服务器发送数据，也不加载第三方脚本。",
  "web.policy.permissions.title": "为什么需要这些权限",
  "web.policy.permissions.storage":
    "存储（storage、unlimitedStorage）：在本机保存记忆和设置。整段对话很快会超过默认的约 10MB 配额，所以需要 unlimitedStorage。",
  "web.policy.permissions.hosts":
    "访问 chatgpt.com、claude.ai、gemini.google.com：在这三个站点读取对话内容、显示浮层、把记忆写入输入框。扩展不会在其他网站上运行。",
  "web.policy.export.title": "导出的文件",
  "web.policy.export.body":
    "导出在你的浏览器里生成文件，由浏览器保存到你选择的位置，或交给系统打印对话框生成 PDF。文件不经过我们，也不会生成任何公开链接。",
  "web.policy.thirdParty.title": "第三方与广告",
  "web.policy.thirdParty.body":
    "没有分析工具、没有广告、没有跨站跟踪。我们不出售、不出租、也不共享你的数据 —— 我们手上没有你的数据。",
  "web.policy.control.title": "删除你的数据",
  "web.policy.control.body":
    "在面板的「查看记忆」里可以逐条或按对话删除；卸载扩展时，浏览器会一并清除它的本机存储。已经导出的文件属于你自己的文件，需要你自行删除。",
  "web.policy.sync.title": "关于同步",
  "web.policy.sync.body":
    "当前版本不包含云同步，也没有登录入口。若将来提供同步，它必须由你显式开启、内容端到端加密，并且我们会先更新本政策。",
  "web.policy.changes.title": "政策变更",
  "web.policy.changes.body":
    "政策更新会同时修改页面顶部的日期。如果某个版本改变了数据处理方式，我们会在扩展更新中一并说明。",
  "web.policy.contact.title": "联系我们",
  "web.policy.contact.body": "对隐私有疑问可以发邮件到 {email}，也可以在 GitHub 仓库提 issue。",
  "web.policy.backHome": "返回首页",

  // -------------------------------------------------------- extension: manifest
  "extension.name": "GotoMemory",
  "extension.description": "在 AI 助手之间共享记忆，并把对话一键导出到本机。",

  // ------------------------------------------------------- extension: controls
  "panel.action.saveAll": "保存整段对话",
  "panel.action.inject": "注入相关记忆",
  "panel.action.list": "查看记忆",
  "panel.action.export": "导出",
  "panel.action.settings": "设置",
  "panel.action.collapse": "折叠",
  "panel.action.expand": "展开",
  "panel.format.markdown": "Markdown",
  "panel.format.txt": "纯文本 TXT",
  "panel.format.obsidian": "Obsidian",
  "panel.format.pdf": "PDF（打印保存）",
  "panel.format.html": "HTML",
  "panel.format.json": "JSON",
  "panel.format.docx": "Word DOCX",
  "panel.format.notion": "Notion Blocks",
  "panel.settings.firstRun": "首次使用",
  "panel.settings.templates": "添加常用记忆模板",
  "panel.settings.options": "选项",
  "panel.settings.autoCapture": "自动捕获（发送即保存）",
  "panel.settings.trustMode": "信任模式（自动带入普通记忆）",
  "panel.settings.metrics": "本地使用统计（仅本机聚合计数）",
  "panel.settings.language": "界面语言",
  "panel.language.auto": "跟随浏览器",
  "panel.language.zh": "中文",
  "panel.language.en": "English",
  "panel.suggest.dismiss": "忽略",
  "panel.suggest.save": "保存",
  "panel.confirm.dismiss": "不带入",
  "panel.confirm.accept": "确认带入",
  "panel.undo": "撤销本次带入",

  // -------------------------------------------------------- extension: prompts
  "panel.onboarding": "第一次使用？选个格式点「导出」，把这段对话带走试试",
  "panel.suggest.text": "这段对话里有 {count} 条像长期偏好的内容，保存到记忆库？",
  "panel.suggest.saveCount": "保存这 {count} 条",
  "panel.confirm.text": "另有 {count} 条私密记忆与当前话题相关，需要你确认后才会带入。",
  "panel.metrics.readout": "本周带入 {current} 次 · 周均 {average} 次",

  // ------------------------------------------------------- extension: statuses
  "panel.status.saving": "保存中…",
  "panel.status.savedAll": "✓ 已保存整段对话 {count} 条",
  "panel.status.nothingToSave": "未找到可保存的消息",
  "panel.status.searching": "查找相关记忆…",
  "panel.status.injected": "✓ 已注入 {count} 条相关记忆",
  "panel.status.noRelevant": "暂无相关记忆可注入",
  "panel.status.autoInjected": "已自动带入 {count} 条记忆（可撤销）",
  "panel.status.injectedPrivate": "✓ 已带入 {count} 条私密记忆",
  "panel.status.noComposer": "找不到输入框，无法带入",
  "panel.status.undone": "已撤销带入",
  "panel.status.exporting": "导出中…",
  "panel.status.nothingToExport": "当前没有可导出的对话",
  "panel.status.printOpened": "✓ 已打开打印视图，在打印对话框选「另存为 PDF」",
  "panel.status.printBlocked": "浏览器拦截了打印窗口，请允许弹出窗口后重试",
  "panel.status.exported": "✓ 已导出 {filename}",
  "panel.status.exportFailed": "导出失败，请重试",
  "panel.status.addingTemplates": "添加中…",
  "panel.status.templatesPresent": "常用记忆已全部在记忆库中",
  "panel.status.templatesAdded": "✓ 已添加 {count} 条常用记忆",
  "panel.status.savedMemories": "✓ 已保存 {count} 条记忆",
  "panel.status.autoCaptureOn": "已开启自动捕获",
  "panel.status.autoCaptureOff": "已关闭自动捕获",
  "panel.status.autoSaved": "✓ 自动保存了 {count} 条",
  "panel.status.autoSaveFailed": "自动保存失败",
  "panel.status.genericError": "出错了，请重试",
  "panel.status.quotaFull": "存储空间已满：请在「查看记忆」中删除一些旧会话后重试",

  // -------------------------------------------------------- extension: library
  "library.title": "记忆库",
  "library.back": "返回",
  "library.close": "关闭",
  "library.search": "搜索会话…",
  "library.empty": "还没有保存的记忆",
  "library.noMatches": "没有匹配的会话",
  "library.loadFailed": "读取失败，请重试",
  "library.count": "{count} 条",
  "library.deleteGroup": "删除整组",
  "library.deleteGroupConfirm": "删除「{title}」的 {count} 条记忆？此操作不可撤销。",
  "library.openOriginal": "打开原对话",
  "library.untitled": "未归类记忆",
  "library.conversation": "会话 {id}",
  "library.delete": "删除",
  "library.roleAi": "AI",
  "library.roleMe": "我",
  "library.previewAi": "AI：",
  "library.previewMe": "我：",
  "library.private": "私密",
  "library.privateOn": "取消私密（可自动带入）",
  "library.privateOff": "标为私密（带入前需确认）",
  "library.today": "今天 {time}"
} as const;

export type MessageKey = keyof typeof zh;

/** The shape every locale must fill. */
export type Messages = Record<MessageKey, string>;
