# 共享页面系统规格设计

## 1. 背景

Agent 在完成任务时，经常会生成可视化交付物，例如：

- 一个 HTML 单页展示。
- 一份 Markdown 报告。
- 一个 PDF 文档。
- Word / Excel / PowerPoint 文件。

这些交付物通常需要被用户快速分享给别人查看，但不一定需要进入长期知识库，也不应该默认变成可编辑协作文档。gotomemory 可以提供一套受控的 **Artifact Sharing** 能力，让 Agent 通过 Gateway / MCP 工具把生成的交付物发布成一个只读分享页面，获得一个可访问链接。

本规格定义 gotomemory 的共享页面能力，暂命名为 **gotomemory Pages**。

## 2. 目标

- 支持 Agent 发布只读分享页面。
- 支持以下输入格式：
  - HTML
  - Markdown
  - PDF
  - Word：`.docx`
  - Excel：`.xlsx`
  - PowerPoint：`.pptx`
- 将每个交付物转换或包装成一个单页面只读展示。
- 返回可分享 URL，便于用户复制、发送或嵌入到对话中。
- 通过 Gateway、SDK、CLI、MCP Server、Console 统一接入。
- 由 Web Console 统一提供 gotomemory 网站入口、记忆控制台、分享页管理和 `/p/{slug}` 只读展示。
- 所有发布、查看、下线操作具备认证、授权、审计和租户隔离。
- 默认安全：不允许页面被访问者编辑，不允许服务端执行用户上传代码，不允许绕过租户权限访问原始文件。

## 3. 非目标

- 不提供在线编辑、多人协同编辑或评论批注。
- 不提供类似 Google Docs / Notion 的富文本编辑器。
- 不提供任意后端代码、API、数据库或 serverless function 执行能力。
- 不承诺上传文件中的表格公式、宏、动画、脚本全部可执行。
- 不作为长期对象存储或网盘替代品。
- 不默认公开搜索引擎索引分享内容。
- 不把分享页面内容自动写入 Memory Item；需要记忆化时由用户或 Agent 单独调用记忆工具。

## 4. 核心概念

### 4.1 Shared Page

一次可分享交付物发布记录。

字段：

- `id`: 全局唯一 ID，例如 `pg_...`。
- `tenant_id`: 所属租户。
- `owner_id`: 发布者。
- `slug`: URL 中的不可猜测短标识。
- `title`: 页面标题。
- `description`: 可选说明。
- `kind`: 交付物类型，取值为 `html`、`markdown`、`pdf`、`docx`、`xlsx`、`pptx`。
- `visibility`: 可见性，取值为 `private`、`unlisted`、`public`。
- `status`: 状态，取值为 `active`、`unpublished`、`expired`、`deleted`、`quarantined`。
- `source`: 来源，取值为 `api`、`mcp`、`cli`、`console`、`agent`、`import`。
- `original_object_key`: 原始文件对象存储 key。HTML / Markdown 可为空或指向原始文本。
- `rendered_object_key`: 已废弃兼容字段；MVP 中不由 Gateway 生成展示 HTML，可指向原始 artifact。
- `asset_prefix`: 页面静态资源目录前缀。
- `content_sha256`: 原始内容哈希。
- `size_bytes`: 原始内容大小。
- `mime_type`: 原始输入 MIME。
- `created_at`
- `updated_at`
- `expires_at`
- `expires_in_value`: 可选，有效时间数值。
- `expires_in_unit`: 可选，有效时间单位，取值为 `hours` 或 `days`。
- `last_viewed_at`
- `view_count`
- `version`: 乐观锁版本。

### 4.2 Page Artifact

被发布的原始交付物。

Artifact 可以是：

- HTML 字符串。
- Markdown 字符串。
- Base64 编码文件。
- 已上传对象的引用。

Artifact 本身不等同于 Memory Item。它是一份可分享的只读交付物。

### 4.3 Read-only Presentation

系统对每种输入格式生成统一的只读展示：

- HTML：经过安全处理后直接作为展示页或嵌入展示 shell。
- Markdown：渲染为 HTML，再进入展示 shell。
- PDF：以浏览器原生 PDF viewer 或安全 iframe/object 只读展示。
- Word：转换为 HTML 或 PDF 预览。
- Excel：转换为只读表格视图或 PDF/HTML 预览。
- PowerPoint：转换为只读幻灯片视图或 PDF/HTML 预览。

无论输入格式如何，访问者只能查看，不允许编辑、保存回源、追加内容或修改发布记录。

## 5. 产品形态

### 5.1 统一 Web 入口

gotomemory 需要提供一个面向用户和访问者的网站入口。MVP 使用同一个 Web Console 应用承载：

| 路由 | 职责 |
| --- | --- |
| `/` | 主站入口、产品说明、进入 Console / Pages 的入口 |
| `/console` | 记忆创建、搜索和上下文构建 |
| `/pages` | 用户自己的分享页发布与管理 |
| `/p/{slug}` | 只读分享页展示，由前端读取 Gateway JSON 数据后渲染 |

主站入口应提供：

- gotomemory 产品定位说明。
- `Open Console` 入口。
- `View shared page` 入口，允许粘贴分享 URL 或 slug。
- 面向 Agent / MCP 的说明入口，例如如何用 `share_generated_page` 发布页面。

登录后 Web Console 应能进入 `Shared Pages` 列表。未登录访问主站入口时，只展示产品入口和公开说明，不暴露任何租户数据。分享展示页不提供编辑入口；访问私有分享页时，由 Gateway 的公开数据 API 进行权限判断。

### 5.2 Agent 使用体验

用户：

```text
把这个 HTML 页面分享出去
```

Agent 调用：

```text
share_html_page
```

返回：

```json
{
  "page_id": "pg_abc123",
  "url": "https://gotomemory.dev/p/r7K2mQ",
  "visibility": "unlisted",
  "expires_at": null
}
```

用户：

```text
把这份会议纪要发成一个只读链接
```

Agent 根据内容类型调用：

```text
share_markdown_page
```

或：

```text
share_document_page
```

### 5.3 分享页访问体验

访问者打开链接后看到：

- 页面标题。
- 只读内容展示区。
- 发布来源标识，例如 `Published with gotomemory Pages`。
- 可选的过期时间提示。
- 可选的下载按钮，是否可下载由发布策略控制，默认关闭或仅 owner 可下载。

访问者不能编辑页面内容。

### 5.4 有效时间

创建分享页时可以传有效时间：

- 按小时：例如 2 小时。
- 按天：例如 1 天。

系统以创建时间为起点计算：

```text
expires_at = created_at + expires_in.value * expires_in.unit
```

到期后页面必须自动删除或进入不可访问状态。公开访问 URL 必须返回 `404` 或明确的过期/删除说明页。没有传有效时间时，页面为永久分享，`expires_at = null`，直到 owner 主动下线或删除。

## 6. 支持格式

| 格式 | 输入方式 | MVP 渲染方式 | 只读保证 |
| --- | --- | --- | --- |
| HTML | 字符串 / 文件 | sanitize 后生成静态 HTML | 禁止编辑 API；默认禁用脚本 |
| Markdown | 字符串 / 文件 | Markdown -> sanitized HTML | 渲染为静态 HTML |
| PDF | 文件 | 浏览器 PDF viewer / iframe / object | 原始 PDF 只读展示，不提供编辑 |
| DOCX | 文件 | DOCX -> HTML 或 PDF preview | 转换结果只读 |
| XLSX | 文件 | XLSX -> HTML table 或 PDF preview | 公式不执行写回；表格只读 |
| PPTX | 文件 | PPTX -> HTML slides 或 PDF preview | 幻灯片只读 |

### 6.1 HTML 处理要求

MVP 默认策略：

- 允许静态 HTML / CSS。
- 禁用 `<script>`。
- 移除事件属性，例如 `onclick`。
- 移除危险 URL scheme，例如 `javascript:`。
- 外链资源按策略限制，默认允许图片 `https:` 和 `data:`。
- 添加严格 CSP。

后续可增加 `trusted_interactive` 模式，但不属于 MVP。

### 6.2 Markdown 处理要求

- 使用 CommonMark 或 GitHub Flavored Markdown 子集。
- 渲染后必须经过 HTML sanitizer。
- 代码块只做展示，不执行。
- Mermaid、数学公式等增强渲染可作为后续能力，默认不执行任意脚本。

### 6.3 PDF 处理要求

- 原始 PDF 作为不可编辑文件展示。
- 禁止把 PDF 内嵌脚本作为可信代码执行。
- 可生成页面缩略图用于列表预览。
- 可配置是否允许下载原始 PDF。

### 6.4 Word / Excel / PowerPoint 处理要求

- 只接受 `.docx`、`.xlsx`、`.pptx`，不接受含宏格式作为 MVP：
  - 不接受 `.docm`
  - 不接受 `.xlsm`
  - 不接受 `.pptm`
- 转换过程必须在隔离环境中执行。
- 转换结果作为只读 HTML/PDF 展示。
- Excel 公式可以显示计算结果，但访问者不能编辑单元格，不能重新计算并保存。
- PowerPoint 动画可以降级为静态幻灯片。
- 若转换失败，页面进入 `quarantined` 或 `failed` 状态，不生成公开访问 URL。

## 7. API 设计

所有管理 API 走 Gateway，路径前缀为 `/v1`。

### 7.1 创建分享页

```http
POST /v1/pages
```

请求：

```json
{
  "title": "项目方案",
  "kind": "html",
  "content": "<!doctype html><html>...</html>",
  "visibility": "unlisted",
  "expires_in": { "value": 2, "unit": "hours" },
  "source": "mcp"
}
```

文件型请求可以使用 multipart：

```http
POST /v1/pages
Content-Type: multipart/form-data
```

字段：

- `title`
- `kind`
- `file`
- `visibility`
- `expires_in_value`
- `expires_in_unit`
- `source`

有效时间字段：

- `expires_in.value`: 正整数。
- `expires_in.unit`: `hours` 或 `days`。
- 不传 `expires_in` 表示永久分享，`expires_at = null`。
- 为兼容早期客户端，可以临时接受 `ttl_hours` 作为 `expires_in: { value: ttl_hours, unit: "hours" }` 的别名，但新客户端应使用 `expires_in`。

响应：

```json
{
  "id": "pg_abc123",
  "slug": "r7K2mQ",
  "title": "项目方案",
  "kind": "html",
  "url": "https://gotomemory.dev/p/r7K2mQ",
  "visibility": "unlisted",
  "status": "active",
  "expires_at": "2026-06-24T02:00:00.000Z",
  "created_at": "2026-06-24T00:00:00.000Z"
}
```

### 7.2 查询分享页元数据

```http
GET /v1/pages/{id}
```

返回页面元数据，不返回原始文件正文。

### 7.3 列出分享页

```http
GET /v1/pages?status=active&limit=20
```

仅返回当前用户有权管理的页面。

### 7.4 更新分享页元数据

```http
PATCH /v1/pages/{id}
```

允许更新：

- `title`
- `description`
- `visibility`
- `expires_at`
- `status`

不支持访问者编辑页面内容。owner 可以通过新版本发布接口替换内容。

### 7.5 发布新版本

```http
POST /v1/pages/{id}/versions
```

创建一个新的只读渲染版本，旧版本保留审计记录。分享 URL 默认指向最新 active 版本。

### 7.6 下线分享页

```http
DELETE /v1/pages/{id}
```

软删除或下线，公开 URL 访问后返回 `404` 或下线说明页。

### 7.7 公开访问页面数据

```http
GET /v1/pages/public/{slug}
```

返回分享页元数据和 artifact 内容。Gateway 不渲染 HTML；Web Console 的 `/p/{slug}` 前端路由负责只读展示、HTML sanitizer、Markdown 渲染和文件预览。

访问规则：

- `private`: 需要鉴权。
- `unlisted`: 拥有不可猜测 URL 即可访问。
- `public`: 可公开访问，可选择允许索引。

### 7.8 Web Console 路由

Web Console 建议路由：

| Route | 说明 |
| --- | --- |
| `/` | 产品入口，说明 gotomemory Memory + Pages 能力 |
| `/console` | 记忆控制台 |
| `/pages` | Shared Pages 发布、列表、下线和复制链接 |
| `/p/{slug}` | 只读分享页展示 |

分享展示页不得提供编辑、评论、协作等功能。管理动作必须回到 Console 的 `/pages` 或 Gateway 管理 API。

### 7.9 过期清理

系统必须有后台清理任务处理到期页面：

- 当 `expires_at <= now()` 时，页面进入 `expired` 或 `deleted` 状态。
- 到期页面的公开 URL 必须不可访问。
- 到期页面的原始文件、渲染文件和静态资源应从 PageStorage 删除，或进入短暂回收窗口后删除。
- 没有传有效时间的永久分享页 `expires_at = null`，清理任务不得因默认 TTL 删除它。

## 8. MCP 工具设计

### 8.1 主工具

```text
share_generated_page
```

用于 Agent 分享刚生成的页面或文档。它应根据输入格式选择处理路径。

输入：

```json
{
  "title": "Agent 生成的页面",
  "kind": "html",
  "content": "<!doctype html>...",
  "visibility": "unlisted",
  "expires_in": { "value": 1, "unit": "days" }
}
```

### 8.2 格式专用工具

```text
share_html_page
share_markdown_page
share_pdf_page
share_word_document
share_excel_workbook
share_powerpoint_deck
```

这些工具是语义化别名，便于 ChatGPT / Claude / 其他 MCP 客户端根据自然语言命中正确操作。

### 8.3 管理工具

```text
list_shared_pages
get_shared_page
unpublish_shared_page
update_shared_page_metadata
```

### 8.4 MCP Prompt

可选提供：

```text
/gotomemory-share-page
/gotomemory-share-document
/gotomemory-list-pages
```

Claude Desktop 等支持 MCP Prompt 的客户端可通过 slash prompt 使用。ChatGPT 连接器主要依赖工具名和描述进行自然语言路由。

## 9. CLI 设计

```bash
gotomemory pages publish --title "方案" --kind html --file index.html --visibility unlisted
gotomemory pages publish --title "会议纪要" --kind markdown --file notes.md
gotomemory pages publish --title "报价表" --kind xlsx --file quote.xlsx
gotomemory pages list
gotomemory pages show pg_abc123
gotomemory pages unpublish pg_abc123
```

输出 JSON：

```bash
gotomemory pages publish --file report.pdf --json
```

```json
{
  "id": "pg_abc123",
  "url": "https://gotomemory.dev/p/r7K2mQ",
  "status": "active"
}
```

## 10. 存储与渲染架构

```text
MCP / CLI / Console / SDK
        |
        v
Memory Gateway API
        |
        v
PageService
  |        |          |
  |        |          +--> AuditSink
  |        +------------> PageRepository metadata
  +---------------------> PageStorage original artifacts/assets

Web Console
  |
  +--> /           (product entry)
  +--> /console    (memory console)
  +--> /pages      (shared page management)
  +--> /p/{slug}   (frontend read-only rendering)
```

### 10.1 PageService

职责：

- 校验权限。
- 校验格式、大小、MIME。
- 写入原始 artifact。
- 写入对象存储。
- 写入元数据。
- 生成分享 URL。
- 写审计日志。

### 10.2 PageRepository

存储页面元数据。MVP 可使用内存实现，生产使用 SQL。

### 10.3 PageStorage

存储原始文件和后续转换所需资源。MVP 不由 Gateway 生成展示 HTML。

实现：

- 本地开发：文件系统，例如 `.gotomemory-pages/`。
- 生产：S3 / R2 / GCS 等对象存储。

### 10.4 Frontend Renderer / Converter

MVP 的 HTML sanitizer、Markdown 渲染和只读展示 shell 在 Web Console 前端实现。后续文件转换器如需服务端执行，必须隔离运行。

可选实现：

- Markdown -> HTML：Web Console renderer + sanitizer。
- HTML -> HTML：Web Console sanitizer + shell。
- DOCX/PPTX/XLSX -> PDF/HTML：LibreOffice headless 或专用转换服务。
- PDF -> thumbnails：Poppler 或等价工具。

MVP 可以先实现 HTML / Markdown / PDF，Office 文件保留接口与只读占位，随后补转换器。

### 10.5 Console Web App

`apps/console` 是 gotomemory 的统一 Web 入口。

职责：

- 展示 gotomemory 产品能力。
- 解释 Pages 的分享能力和格式支持。
- 提供记忆 Console。
- 提供分享页发布、列表、下线和复制链接。
- 提供 Agent / MCP 发布分享页的文档入口。
- 提供 `/p/{slug}` 只读分享页展示。

`apps/console` 不直接读取 PageStorage，不直接访问数据库。它通过 SDK 调用 Gateway；
分享页展示通过 `/v1/pages/public/{slug}` 获取 JSON 数据后在前端渲染。

## 11. 安全要求

### 11.1 Web / API 边界

MVP 中分享页展示与主站、Console 由同一个 Web Console 应用承载，但 Gateway API 仍是独立服务边界：

- Gateway 不拼接或返回可执行展示 HTML，只返回 JSON 数据。
- Web Console 负责 sanitizer、Markdown 渲染和只读展示。
- 分享页展示不提供编辑入口，不把访问者操作写回原始 artifact。
- 私有分享页访问由 Gateway 按 token 做租户和 owner 校验。

生产环境如需要更强隔离，可把 `/p/{slug}` 路由部署到独立 origin，但这属于部署形态优化，不改变 API 边界。

### 11.2 内容安全策略

MVP 默认 CSP：

```http
Content-Security-Policy:
  default-src 'none';
  img-src 'self' data: https:;
  style-src 'self' 'unsafe-inline';
  font-src 'self' data:;
  frame-ancestors 'none';
  base-uri 'none';
  form-action 'none';
  script-src 'none';
```

若未来支持交互式 HTML，必须作为显式 `trusted_interactive` 模式，并使用更强隔离。

### 11.3 上传限制

- 限制文件大小。
- 限制文件类型。
- 校验 MIME 与扩展名一致性。
- 对压缩包和 Office 文件防 zip bomb。
- 对 Office 文件禁用宏格式。
- 对转换器设置 CPU、内存、时间限制。

### 11.4 访问控制

- 管理 API 必须鉴权。
- `private` 页面访问必须鉴权并校验租户/owner/授权。
- `unlisted` slug 必须不可猜测，至少 128 bit 随机强度。
- owner 可以随时下线页面。
- 过期页面自动不可访问。

### 11.5 审计

必须审计：

- `page.create`
- `page.render`
- `page.view`，可采样或聚合。
- `page.update`
- `page.version.create`
- `page.unpublish`
- `page.delete`
- `page.quarantine`

审计记录至少包含：

- `tenant_id`
- `owner_id`
- `page_id`
- `actor_client_id`
- `action`
- `timestamp`
- `source`
- `ip_hash`，适用于公开访问聚合审计。

## 12. 数据模型

### 12.1 shared_pages

```sql
CREATE TABLE shared_pages (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  kind TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'unlisted',
  status TEXT NOT NULL DEFAULT 'active',
  source TEXT NOT NULL DEFAULT 'api',
  original_object_key TEXT,
  rendered_object_key TEXT NOT NULL,
  asset_prefix TEXT,
  content_sha256 TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT,
  expires_in_value INTEGER,
  expires_in_unit TEXT,
  last_viewed_at TEXT,
  view_count INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  CHECK (kind IN ('html', 'markdown', 'pdf', 'docx', 'xlsx', 'pptx')),
  CHECK (visibility IN ('private', 'unlisted', 'public')),
  CHECK (status IN ('active', 'unpublished', 'expired', 'deleted', 'quarantined')),
  CHECK (expires_in_unit IS NULL OR expires_in_unit IN ('hours', 'days')),
  CHECK (expires_in_value IS NULL OR expires_in_value > 0)
);
```

### 12.2 shared_page_versions

```sql
CREATE TABLE shared_page_versions (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL REFERENCES shared_pages(id),
  version INTEGER NOT NULL,
  original_object_key TEXT,
  rendered_object_key TEXT NOT NULL,
  asset_prefix TEXT,
  content_sha256 TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  render_status TEXT NOT NULL,
  render_error TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (page_id, version),
  CHECK (render_status IN ('pending', 'active', 'failed', 'quarantined'))
);
```

## 13. 错误模型

沿用 Gateway 统一错误结构。

新增错误码建议：

| HTTP | code | 场景 |
| --- | --- | --- |
| 400 | `unsupported_artifact_type` | 不支持的格式 |
| 400 | `artifact_too_large` | 文件超过大小限制 |
| 400 | `invalid_artifact` | 文件损坏、MIME 不匹配 |
| 403 | `share_policy_denied` | 当前客户端无发布权限 |
| 404 | `page_not_found` | 页面不存在或不可访问 |
| 409 | `page_version_conflict` | 乐观锁冲突 |
| 422 | `render_failed` | 转换失败 |
| 423 | `page_quarantined` | 安全扫描隔离 |

## 14. 权限策略

Page 不是 Memory，但仍走统一控制面。

建议新增 action：

- `page:create`
- `page:read_metadata`
- `page:view`
- `page:update`
- `page:publish_version`
- `page:unpublish`
- `page:delete`
- `page:list`

MCP / Agent token 默认可：

- 创建 `unlisted` 页面。
- 列出自己创建的页面。
- 下线自己创建的页面。

默认不可：

- 创建 `public` 页面，除非策略允许。
- 发布超过大小限制的文件。
- 发布含宏 Office 文件。
- 访问其他 tenant 页面元数据。

## 15. Console 设计

Console 新增 `Shared Pages` 页面：

- 列表：标题、格式、状态、可见性、创建时间、过期时间、访问次数。
- 操作：复制链接、预览、下线、删除、修改标题/可见性/过期时间。
- 详情：版本列表、审计摘要、原始文件下载开关。

不提供内容编辑器。若用户需要修改内容，需要重新发布新版本。

## 16. Web Console 设计

### 16.1 主站入口

主站入口由 `apps/console` 的 `/` 路由承载，用于展示 gotomemory 的入口和能力。

页面：

- 首页：Memory Control Plane + Pages 的产品说明。
- Console 入口：进入 `/console`。
- Pages 入口：进入 `/pages`，查看或发布分享页。
- 分享 URL 入口：打开 `/p/{slug}`。

主站入口不直接渲染用户上传 HTML；只有 `/p/{slug}` 路由在读取 Gateway JSON 后进行 sanitizer 和只读渲染。

### 16.2 分享展示页

`/p/{slug}` 是所有分享内容的展示入口。

要求：

- 使用只读展示 shell。
- 每次访问通过 Gateway `/v1/pages/public/{slug}` 检查 `status`、`visibility`、`expires_at`。
- 页面过期、删除、隔离、不可访问时展示明确状态。
- 默认不允许搜索引擎索引 `unlisted` 页面。
- 页面底部展示来源标识和举报入口。

分享展示页不得暴露编辑入口，不得把访问者操作写回原始文件。

## 17. 实施里程碑

### P0: 规格与契约

- 定义 OpenAPI schema。
- 定义 PageService / Repository / Storage 接口。
- 定义 MCP 工具名与参数。
- 定义 `apps/console` 的主站、控制台、分享管理和 `/p/{slug}` 路由边界。

### P1: 静态文本 MVP

- 支持 HTML。
- 支持 Markdown。
- 本地文件系统存储。
- Gateway 创建、公开 JSON 数据、下线 API。
- `apps/console` 支持首页、记忆控制台、Pages 管理和 `/p/{slug}` 只读展示。
- MCP 工具：
  - `share_generated_page`
  - `share_html_page`
  - `share_markdown_page`
  - `unpublish_shared_page`

### P2: 文件型只读预览

- 支持 PDF。
- 支持 `.docx`、`.xlsx`、`.pptx` 上传。
- 转换器隔离运行。
- 转换失败状态与错误展示。

### P3: 管理体验

- Console `Shared Pages` 列表。
- 复制链接。
- 访问统计。
- 过期和下线。
- 主站文档和入口完善。
- `/p/{slug}` 支持过期、下线、私有不可访问等状态页。

### P4: 生产化

- 对象存储。
- 独立 pages 域名。
- 防滥用与扫描。
- 限流与配额。
- 更完整的审计与报表。

## 18. 测试要求

### 18.1 单元测试

- HTML sanitizer 移除 script 和事件属性。
- Markdown 渲染后仍经过 sanitizer。
- slug 不可猜测且唯一。
- `expires_in: { value: 2, unit: "hours" }` 正确计算 `expires_at`。
- `expires_in: { value: 1, unit: "days" }` 正确计算 `expires_at`。
- 不传 `expires_in` 时 `expires_at = null`，页面永久分享。
- 有效时间到期后页面被删除或不可访问。
- 权限策略正确拒绝跨租户访问。

### 18.2 集成测试

- `POST /v1/pages` 发布 HTML。
- `GET /v1/pages/public/{slug}` 返回分享页 JSON 数据。
- `apps/console` 首页、记忆控制台、Pages 管理页和 `/p/{slug}` 可访问。
- 创建时传 2 小时有效期，到期后分享 URL 不可访问。
- 创建时不传有效期，`expires_at` 为空且不会被过期任务删除。
- `DELETE /v1/pages/{id}` 后分享 URL 不可访问。
- `private` 页面未鉴权不可访问。
- Office 宏格式被拒绝。
- 转换失败进入失败或隔离状态。

### 18.3 MCP E2E

- Agent 调用 `share_html_page` 返回 URL。
- Agent 调用 `share_markdown_page` 返回 URL。
- Agent 调用 `share_pdf_page` 返回 URL。
- Agent 创建 1 天有效分享页时返回正确的 `expires_at`。
- Agent 不传有效时间时创建永久分享页。
- Agent 对 unsupported format 收到明确错误。
- Agent 下线页面后 URL 不再可访问。

## 19. 与 Memory 系统的关系

共享页面与 Memory Item 是平行能力：

- Memory Item 用于长期上下文、检索、注入和治理。
- Shared Page 用于交付物发布、展示和分享。

二者可以互相引用：

- Memory Item 可以记录“某次方案页面的 URL”。
- Shared Page 可以在 metadata 中记录由哪个 memory/context decision 生成。

但系统不得自动把分享页面正文写入记忆，除非用户或 Agent 明确调用记忆保存工具。

## 20. 默认配置建议

MVP 默认：

- `visibility`: `unlisted`
- `expires_in`: 不传，表示永久分享
- `max_html_size`: 1 MB
- `max_markdown_size`: 1 MB
- `max_file_size`: 25 MB
- `allow_download`: false
- `allow_public_indexing`: false
- `scripts`: disabled
- `office_macros`: rejected

这些默认值可以按租户策略调整，但安全默认值不能放宽为公共可编辑。
