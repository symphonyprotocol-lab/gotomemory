# Monorepo 架构规格（工程框架）

> 本规格把两份产品规格（[memory-sharing-system.md](memory-sharing-system.md)、[share-pages-system.md](share-pages-system.md)）落成**可直接照着写代码的工程骨架**：目录怎么分、包之间谁能依赖谁、契约从哪来、本地优先怎么在代码里体现、构建/测试/发布怎么跑。
>
> 原则一句话：**浏览器扩展是产品本体且本地优先，所以核心逻辑必须是平台无关的纯 TS 库，扩展/网页/服务器只是它的三个外壳；服务器只承担"少数本质上要联网"的分享（与后续同步）。**

## 1. 设计原则

1. **本地优先即架构约束**：记忆、检索、导出的核心逻辑放在**平台无关的纯 TS 包**里（不碰 `chrome.*`、不碰 DOM、不发网络请求），这样同一份逻辑能在扩展 background、Node 测试、（未来）Web 里复用，也保证"离线、免登录、不上传"是默认而非努力。
2. **外壳薄、核心厚**：`apps/*` 是组合根（composition root），只负责把核心包接到具体宿主（扩展 / 网页 / 服务器）上；业务规则不写在 app 里。
3. **契约单一来源**：本地操作与云端（分享/同步）共用同一套类型，由 `packages/contracts` 从 OpenAPI + JSON Schema 生成（对应 memory 规格 §8「本地与云端说同一种话」）。
4. **依赖单向、可机器校验**：依赖方向由 `dependency-cruiser` 强制（`pnpm run boundaries`），违规即 CI 失败。
5. **安全能力沉淀为共享包**：sanitizer、prompt 包装、CSP 等安全要点做成被多处复用的单点，避免每个外壳各写一份、各漏一处。
6. **高级层只占位不展开**：MCP / CLI / Python SDK / 多租户等放在 `py/` 与文档高级层，骨架里留接口、不进 MVP 主线。

## 2. 技术选型（已在脚手架中固定）

| 维度 | 选型 | 来源 |
| --- | --- | --- |
| 包管理 / 工作区 | **pnpm 11.x** workspaces（`apps/*`、`packages/*`） | `pnpm-workspace.yaml`、`packageManager` |
| 任务编排 / 缓存 | **Turborepo 2.x** | `turbo.json` |
| 语言 / 运行时 | **TypeScript 5.6 + Node 22.x**（ESM、`module: ESNext`、`strict`） | `tsconfig.base.json`、`.nvmrc` |
| 浏览器扩展框架 | **WXT**（MV3，多浏览器） | `pnpm-workspace.yaml` 的 `spawn-sync` 注释 |
| Web 前端 | **Vite + React**（dev 端口 5173） | `.claude/launch.json` 的 `@gotomemory/console` |
| 共享配置 | `@gotomemory/config-ts`（tsconfig / eslint / prettier 预设） | `eslint.config.js`、root `prettier` 字段 |
| 边界校验 | **dependency-cruiser 16.x** | `package.json` `boundaries` 脚本 |
| 版本 / 发布 | **Changesets**（`baseBranch: main`，`access: public`） | `.changeset/config.json` |
| Python（高级层 SDK） | **uv**，源码在 `py/sdk/src` | root `py:*` 脚本 |

> 新增依赖须遵守 pnpm secure-by-default：带 install script 的包要进 `onlyBuiltDependencies` / `allowBuilds` 白名单（见 `pnpm-workspace.yaml`）。

## 3. 目录结构

```
gotomemory/
├─ apps/
│  ├─ extension/         @gotomemory/extension     P0 产品本体（WXT/MV3）
│  ├─ console/           @gotomemory/console        Web：管理页 + 我的分享 + 只读分享页
│  └─ share-server/      @gotomemory/share-server   唯一服务端：分享 API（+ 后续同步镜像）
│
├─ packages/
│  ├─ config-ts/         @gotomemory/config-ts      tsconfig/eslint/prettier 预设（已存在引用）
│  ├─ contracts/         @gotomemory/contracts      OpenAPI + JSON Schema + 生成的类型/客户端（codegen 目标）
│  ├─ core/              @gotomemory/core           记忆领域逻辑（纯 TS：CRUD/暂停/刷新/带入选择/prompt 包装）
│  ├─ store/             @gotomemory/store          存储抽象 + 扩展上下文实现（chrome.storage/IndexedDB）
│  ├─ retrieval/         @gotomemory/retrieval      浏览器内 embedding + cosine + 关键词回退
│  ├─ export/            @gotomemory/export         对话 → MD/TXT/JSON/Obsidian/PDF/docx/Notion blocks
│  ├─ site-adapters/     @gotomemory/site-adapters  三家站点 DOM 适配器（读消息/写输入框/挂载点）
│  ├─ render/            @gotomemory/render         只读 Markdown 渲染 + sanitizer（分享页 & 导出预览共用）
│  └─ ui/                @gotomemory/ui             共享 UI 组件（带入面板/分享弹窗/记忆列表）
│
├─ py/
│  └─ sdk/               gotomemory（PyPI）          高级层：Python SDK（uv，MVP 不主推）
│
├─ tooling/
│  └─ dependency-cruiser.cjs                        依赖边界规则（被 `pnpm run boundaries` 使用）
│
├─ specs/                产品 + 架构规格
├─ pnpm-workspace.yaml · turbo.json · tsconfig.base.json · eslint.config.js · .changeset/
```

> 现状：`apps/`、`packages/`、`tooling/`、`py/` 目录尚未创建，但 root 配置已假定它们存在。按本规格逐个落地即可，无需改动 root 脚手架。

## 4. 包与应用清单

「层」决定它能依赖谁（见 §5）。

| 包 | 层 | 职责 | 运行环境 | 依赖（仅限） | 发布 |
| --- | --- | --- | --- | --- | --- |
| `config-ts` | 配置 | 共享 tsconfig/eslint/prettier 预设 | 构建期 | 无 | private |
| `contracts` | 契约（leaf） | API 形状的单一来源：OpenAPI、JSON Schema、生成的 TS 类型 + 轻客户端 | 同构 | 无（不依赖任何业务包） | **public** |
| `core` | 领域 | 记忆 5 操作、暂停、刷新规则、带入选择与排序、prompt 包装 | 同构（纯 TS） | `contracts` | private |
| `store` | 领域 | 存储接口 + 扩展上下文实现；本地 = source of truth | 浏览器扩展 / Node(测试用内存实现) | `contracts` | private |
| `retrieval` | 领域 | 相似度计算：可选浏览器内 embedding，缺失则关键词回退 | 浏览器 / Node | `contracts` | private |
| `export` | 领域 | 对话导出为各格式；本机完成 | 浏览器 / Node | `contracts`、`render`(渲染预览) | private |
| `render` | 领域 | 只读渲染 + sanitizer（安全单点，见 §10） | 同构 | 无 | private |
| `site-adapters` | 适配 | 三家站点的 DOM 读写与 UI 挂载点 | **仅浏览器/content script** | `contracts` | private |
| `ui` | 适配 | 跨外壳共享的 React 组件 | 浏览器 | `contracts`、`render` | private |
| `extension` | 应用 | 组合根：content script + background store + popup/options | 浏览器扩展(MV3) | 任意 `packages/*` | private |
| `console` | 应用 | Web：`/`、`/console`、`/shares`、`/p/{slug}` | 浏览器(Vite/React) | `contracts`、`ui`、`render`、`export` | private |
| `share-server` | 应用 | 分享 API（+ 后续同步镜像）；唯一服务端 | Node 22 | **仅 `contracts`** | private |
| `py/sdk` | 高级层 | Python SDK（开发者/Agent 接入） | Python(uv) | —（独立工具链） | PyPI(后续) |

关键约束：**`share-server` 只依赖 `contracts`**。`core/store/retrieval/export` 是客户端本地能力，服务端不碰它们——这从代码层面坐实"记忆/检索不在我们服务器上跑"。

## 5. 依赖边界规则（机器强制）

方向：`apps → packages`，`packages` 内部按层 `应用 ? 适配 ? 领域 ? 契约`，`contracts` 是叶子。

```
应用层    extension / console / share-server
   │  （只能向下依赖 packages，app 之间互不依赖）
   ▼
适配层    site-adapters / ui            ← 触碰 DOM / React 的隔离带
   │
   ▼
领域层    core / store / retrieval / export / render   ← 纯逻辑，平台无关
   │
   ▼
契约层    contracts                     ← 叶子，谁都能依赖，它不依赖任何人
```

`tooling/dependency-cruiser.cjs` 落地的规则（要点）：

- **no-app-to-app**：`apps/*` 之间禁止相互 import。
- **domain-is-platform-agnostic**：`core`/`store`/`retrieval`/`export`/`render` 内**禁止** import `chrome`、`webextension-polyfill`、`react`、`node:*`（`store` 的扩展实现除外，见下）、以及任何 `apps/*`。它们必须能在 vitest(Node) 里裸跑。
- **dom-only-in-adapters**：直接操作站点 DOM 的代码只允许出现在 `site-adapters`。`core` 不得读写页面。
- **server-isolation**：`share-server` 只能依赖 `contracts`；import `core/store/retrieval/export` 即报错。
- **no-cycles**：禁止任何循环依赖。
- **contracts-is-leaf**：`contracts` 不得依赖任何 `@gotomemory/*`。

> `store` 比较特殊：接口（`MemoryStore`）是平台无关的领域代码，但**具体实现**（chrome.storage / IndexedDB）触碰平台 API。做法：接口与内存实现放 `store/src/`（纯 TS，供测试），扩展实现放 `store/src/extension/` 并在 dependency-cruiser 里单独允许其 import `webextension-polyfill`。app 通过依赖注入选实现，领域层只见接口。

## 6. 共享契约与代码生成

对应 `turbo.json` 已有的 `codegen` 任务（`inputs: openapi/** schemas/**` → `outputs: generated/**`）。这些目录归属 `packages/contracts`：

```
packages/contracts/
├─ openapi/            # 分享/同步 HTTP API 的 OpenAPI 3.1 定义
│   ├─ shares.yaml     # /v1/shares*（见 share 规格 §7）
│   └─ memory.yaml     # /v1/memories、/v1/context（同步启用后才有真实服务端）
├─ schemas/            # 领域对象 JSON Schema：Memory、MemoryPause、SharedConversation
├─ generated/          # 由 codegen 产出（git 不追踪或追踪均可，CI 必跑校验）
│   ├─ types.ts        # 所有请求/响应/实体的 TS 类型
│   └─ client.ts       # 轻量 fetch 客户端（仅 share-server / 同步用）
└─ src/index.ts        # 再导出 generated/* + 手写的枚举常量
```

落地要点：

- **`Memory`、`MemoryPause` 的类型来自 schema**，`core`/`store` 直接用，保证本地对象与"同步启用后的云端镜像"逐字段一致（memory 规格 §7）。
- 本地 5 操作（`save/search/context/update/pause`）在 MVP **不发 HTTP**，但其入参/出参类型就用 `contracts` 里 `/v1/...` 的 request/response 类型——把 HTTP endpoint 当作"内部函数签名的形状定义"。同步上线时，同一套类型直接套到真实网络客户端，零改动。
- `codegen` 用 `openapi-typescript` 之类工具；产物进 `generated/`，**禁止手改**。
- CI 在 `pnpm run check` 后加一步 `turbo run codegen` 并校验工作区无 diff，防止契约与生成物漂移。

## 7. 扩展应用架构（`apps/extension`，P0）

WXT 项目，三类入口：

```
apps/extension/
├─ wxt.config.ts        # MV3 manifest：精确 host 权限，仅注入三家站点
├─ entrypoints/
│  ├─ background.ts     # service worker：唯一持有记忆主存储（解决跨 origin 共享，见 memory 规格 §6.3）
│  ├─ chatgpt.content.ts / claude.content.ts / gemini.content.ts
│  │                    # 各自加载对应 site-adapter，挂"带入面板/保存气泡/导出/分享"入口
│  ├─ popup/            # 快捷面板
│  └─ options/          # 记忆管理页（列表/搜索/编辑/删除/隐私开关/暂停）
└─ src/messaging.ts     # content ? background 的类型化消息通道（基于 contracts 类型）
```

数据流（坐实"一个助手存、另一个助手带入"）：

- **主存储只存在于 background**（`@gotomemory/store` 扩展实现）。content script **不**直接写所在页面 origin 的 IndexedDB——那会被 origin 隔离。
- content script 通过 `chrome.runtime` 消息调用 background；background 用 `@gotomemory/core` 执行逻辑、用 `@gotomemory/store` 落盘、用 `@gotomemory/retrieval` 做带入匹配。
- 捕获默认「建议保存」：site-adapter 用 **DOM content script 读渲染内容**，绝不 override `fetch`/`XHR`（memory 规格 §6.1 隐私纪律）。
- host 权限精确到 `chatgpt.com` / `claude.ai` / `gemini.google.com`，写进商店说明。

## 8. Web 与服务端

### 8.1 `apps/console`（Vite/React，端口 5173）

按 share 规格 §8.2 的路由：

| 路由 | 职责 | 数据来源 |
| --- | --- | --- |
| `/` | 产品入口 | 静态 |
| `/console` | 记忆管理 | 本地（与扩展共享同一份本地数据的视图；纯本地用户在此读写） |
| `/shares` | 我的分享：列表/改可见性/密码/有效期/下线 | `share-server` `/v1/shares*`（需登录） |
| `/p/{slug}` | **只读分享页**：前端 sanitize 渲染；密码页在此输密码 | `share-server` `/v1/shares/public/{slug}` |

`/p/{slug}` 用 `@gotomemory/render` 渲染，套 share 规格 §9.2 的严格 CSP（`script-src 'none'`、`img-src 'self' data:` 等），不提供任何编辑/评论入口。

### 8.2 `apps/share-server`（Node 22，唯一服务端）

- 框架建议 **Hono / Fastify**（轻、好测、ESM 原生）。
- 实现 share 规格 §7 的 5 个端点 + §12 错误模型；用 `@gotomemory/contracts` 的类型与 schema 校验出入参。
- 存储：起步 Postgres（`shared_conversations` 表，share 规格 §10）；大消息体落对象存储（开发期本地 FS，生产 S3/R2/GCS），表里存 `messages_object_key`。
- 安全：密码 argon2/scrypt 哈希；解锁限流；slug ≥128bit；返回短期查看令牌（share 规格 §9、§7.5）。
- **后续同步**复用本服务：加 `/v1/memories` 镜像端点 + 端到端加密（高级层），与分享同一套登录/令牌。

## 9. 本地优先执行模型（代码层面）

memory 规格 §8 的"默认在扩展内对本机存储执行、不发网络请求"在代码里这样体现：

```ts
// packages/core —— 平台无关，入参/出参用 contracts 类型
export function makeMemoryService(deps: {
  store: MemoryStore;          // @gotomemory/store 接口
  retrieval: RetrievalEngine;  // @gotomemory/retrieval 接口
}) {
  return {
    save(input: SaveMemoryRequest): Promise<Memory> { /* 本地写 store */ },
    search(q: SearchQuery): Promise<Memory[]> { /* 本地 retrieval */ },
    context(req: ContextRequest): Promise<ContextResponse> {
      // 在本机算相似度，分流 ready / needs_confirm；对话内容不出本机
    },
    update / remove / pause / resume,
  };
}
```

- **扩展 background** 注入 `store=扩展实现`、`retrieval=浏览器内实现` → 纯本地、离线、免登录。
- **vitest** 注入 `store=内存实现`、`retrieval=关键词实现` → 领域逻辑可在 Node 裸测，无需浏览器。
- **同步上线后**：不改 `core`，只在 background 增加一个把本地变更推到 `share-server` 的同步器（消费 `contracts` 客户端），`rev`/`deleted_at` 字段已为此预留（memory 规格 §7）。

带入的 prompt 包装（memory 规格 §9 防注入）实现在 `core`，不在各 app 重写。

## 10. 安全边界落位

把两份规格的安全要点钉到具体包，避免散落：

| 安全要点 | 落在哪 | 规格出处 |
| --- | --- | --- |
| 只读渲染前 sanitize（禁 `<script>`/事件属性/危险 URL） | `packages/render`（扩展导出预览 + `/p/{slug}` 共用同一 sanitizer） | share §9.2 |
| 严格 CSP（`script-src 'none'`、`img-src 'self' data:`） | `apps/console` 的 `/p/{slug}` 响应头 + `apps/share-server` 静态托管头 | share §9.2、§6 |
| prompt 注入包装（记忆为"授权背景"非系统指令） | `packages/core` 带入组装 | memory §9、§10 |
| 仅 DOM 读取、不 override 网络 API | `packages/site-adapters`（边界规则禁止其它包碰 DOM） | memory §6.1 |
| 精确 host 权限、不静默扩权 | `apps/extension/wxt.config.ts` manifest | memory §6.1 |
| 密码哈希 / 解锁限流 / slug 熵 / 短期令牌 | `apps/share-server` | share §9 |
| 私密记忆本地威胁模型（口令派生密钥，可选） | `packages/store`（加密层） | memory §10 |
| 服务端不记录私密正文/对话日志 | `apps/share-server` 日志中间件 | memory §10 |

## 11. 构建 / 测试 / 发布流水线

复用 `turbo.json` 既有任务，约定每个包都实现 `build / lint / typecheck / test`（dev/codegen 按需）：

- **本地校验**：`pnpm run check`（= format:check + lint + typecheck + boundaries）。
- **codegen 关口**：CI 跑 `turbo run codegen` 后校验无 diff（§6）。
- **测试分层**：
  - 领域包（`core/store/retrieval/export/render`）→ vitest 单测，Node 环境、无浏览器依赖（边界规则保证可行）。
  - `site-adapters` → 对三家站点保存的 DOM fixture 做快照测试；平台改版只需更新该包 fixture。
  - `share-server` → API 集成测试（含密码/限流/过期/sanitize 注入用例）。
  - `apps/extension` → WXT 构建产物冒烟 + 关键流程 e2e（带入/保存/导出）。
- **发布（Changesets）**：`access: public` 但仅对**确实要发布的包**生效——MVP 阶段只有 `@gotomemory/contracts`（供外部/SDK 对齐）与 `py/sdk` 可能发布；`apps/*` 与内部 `packages/*` 标 `"private": true`，changeset 自动跳过。Release 走 `pnpm run release`（`turbo run build && changeset publish`）。
- **CI 顺序建议**：install → `check` → `codegen`(diff 校验) → `test` → `build`。

## 12. 与 MVP 范围的映射

memory 规格 §12.1 / share 规格 §2 的必做项，对应到包：

| MVP 能力 | 主要落点 |
| --- | --- |
| 三站点捕获 + 带入 + 暂停 | `extension` + `site-adapters` + `core` + `store` |
| 本地存储 + 本机检索（离线/免登录/不上传） | `store`(扩展实现) + `retrieval`(关键词起步) |
| 记忆 5 操作 + 隐私开关 + 私密确认 | `core` + `store` |
| 记忆管理页 | `extension/options` 或 `console`(`/console`) + `ui` |
| 对话导出 MD/TXT/Obsidian/PDF | `export` + `render` |
| 对话一键分享（唯一需服务器+登录） | `extension`(触发) + `console`(`/shares`、`/p/{slug}`) + `share-server` + `contracts` |

> 跨设备同步**不在 MVP**：`share-server` 预留端点、`store` 预留 `rev/deleted_at`，但同步器与端到端加密留到分享之后。

## 13. 高级层占位（不进 MVP 主线）

与两份规格的"后续高级层"一致，骨架里只留落点、不展开：

- **`py/sdk` + MCP/CLI**：开发者/Agent 接入（`search_memory`/`save_memory`/`build_context`/`share_page` 工具）。可加 `apps/mcp-server`（streamable-http + OAuth）复用 `contracts`，作为高级补充，不替代扩展主入口。
- **多租户/策略引擎/审计**：在 `contracts` 与 `share-server` 上做向上兼容扩展（`tenant_id`、policy、审计哈希链），不污染消费主线。
- **任意交付物发布**：share 规格 §14 的 Office 转换流水线、隔离沙箱，作为 `share-server` 的可选模块。

> 本规格只定义**工程骨架与边界**；各包内部的详细设计随实现推进在对应 `packages/*/README.md` 补充，不在此展开。
