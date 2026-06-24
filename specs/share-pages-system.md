# 共享页面系统规格设计（普通用户版）

> 本规格面向**普通用户**：AI 助手生成了一个页面 / 报告 / 文档，用户想**一键拿到一个只读链接**发给别人看。设计目标是**粘贴或上传 → 拿链接**，没有更多步骤。
>
> 版本管理、内容隔离扫描、对象存储治理、细粒度发布策略等能力收进文末第 12 节「后续高级层」，不进 MVP。

## 1. 背景

AI 助手经常生成可视化交付物：一个 HTML 页面、一份 Markdown 报告、一个 PDF、Word/Excel/PPT 文件。用户想快速把它分享给别人看，但**不需要**把它变成长期知识库条目，也**不需要**多人协同编辑。

gotomemory Pages 做一件事：**把生成的交付物变成一个只读分享链接。** 用户复制链接发出去，对方打开就能看，不能改。

## 2. 目标

- 把一份交付物发布成**只读**页面，返回一个可分享 URL。
- MVP 支持：**HTML、Markdown、PDF**。Office 文件（docx/xlsx/pptx）先占位，随后补。
- 入口对普通用户来说就两个：助手里说"分享出去"（Agent 调工具），或在管理页上传。
- 默认安全：访问者只能看，不能编辑；不执行用户上传的脚本；私有页面别人打不开。
- 可选有效期：到点自动失效。

## 3. 非目标

- 不做在线编辑、多人协同、评论批注。
- 不做富文本编辑器（不是 Google Docs / Notion）。
- 不执行任意后端代码 / serverless。
- 不承诺 Office 文件的公式、宏、动画全部还原。
- 不当长期网盘用。
- 不默认让搜索引擎索引分享内容。
- 不自动把分享内容写成记忆（需要时由用户/Agent 单独保存）。

## 4. 核心概念

### 4.1 分享页（Shared Page）

一次发布记录。用户能感知的字段：

| 字段 | 含义 |
| --- | --- |
| `title` | 标题 |
| `kind` | 类型：`html` / `markdown` / `pdf` / `docx` / `xlsx` / `pptx` |
| `url` | 分享链接（含不可猜测的 `slug`） |
| `visibility` | `unlisted`（默认，有链接即可看）/ `private`（要登录且是本人）/ `public`（公开） |
| `expires_at` | 到期时间，不设则永久 |

后台字段：`id`、`user_id`、`slug`、`status`、`object_key`（原始内容存储位置）、`created_at`、`view_count`。

> 相比旧版，砍掉了 `rendered_object_key`、`asset_prefix`、`content_sha256`、`mime_type`、`expires_in_value/unit`、`version`、`quarantined` 状态等一堆字段。

### 4.2 只读展示（Read-only Presentation）

不管输入是什么，访问者打开链接只能**看**：

- HTML：sanitize（禁脚本、去事件属性、去危险 URL）后静态展示。
- Markdown：渲染成 HTML，再 sanitize 后展示。
- PDF：浏览器原生 PDF 预览。
- Office（后续）：转成 HTML/PDF 只读预览。

## 5. 使用体验

### 5.1 在助手里分享（Agent）

用户："把这个页面分享出去。"
Agent 调用 `share_page`，返回：

```json
{ "url": "https://gotomemory.dev/p/r7K2mQ", "expires_at": null }
```

用户把 URL 发出去即可。

### 5.2 访问体验

访问者打开链接看到：标题、只读内容、底部"Published with gotomemory"标识，可选的过期提示。不能编辑。是否提供下载按钮由发布者决定，默认关闭。

### 5.3 有效期

发布时可选有效期（几小时 / 几天 / 永久）。到期后链接返回明确的"已过期"页面，原始内容清理掉。不设有效期就是永久，直到本人下线或删除。

## 6. 支持格式

| 格式 | MVP 渲染 | 只读保证 |
| --- | --- | --- |
| HTML | sanitize 后静态展示 | 禁脚本、禁编辑 |
| Markdown | 渲染为 HTML 再 sanitize | 静态 |
| PDF | 浏览器 PDF 预览 | 原文只读 |
| DOCX / XLSX / PPTX | **占位**，随后补转换 | 转换结果只读 |

### 6.1 HTML 安全处理（保留，安全要点）

- 允许静态 HTML / CSS。
- 禁用 `<script>`，移除 `onclick` 等事件属性，移除 `javascript:` 等危险 URL。
- 图片默认允许 `https:` 和 `data:`。
- 加严格 CSP（见 9.2）。

### 6.2 Markdown 安全处理

- CommonMark / GFM 子集，渲染后**必须**过 sanitizer。
- 代码块只展示不执行。

### 6.3 Office（后续）

- 只接受 `.docx/.xlsx/.pptx`，拒绝含宏的 `.docm/.xlsm/.pptm`。
- 转换在隔离环境执行，结果只读。转换失败就返回明确错误，不出链接。

## 7. API 设计

统一前缀 `/v1`，登录后请求带用户 token。只有 4 个端点。

### 7.1 创建分享页

`POST /v1/pages`

文本类（HTML/Markdown）直接传 `content`：

```json
{
  "title": "项目方案",
  "kind": "html",
  "content": "<!doctype html>...",
  "visibility": "unlisted",
  "expires_in_hours": 48
}
```

文件类（PDF/Office）用 multipart 上传 `file`。`expires_in_hours` 不传 = 永久。

响应：

```json
{
  "id": "pg_abc123",
  "url": "https://gotomemory.dev/p/r7K2mQ",
  "visibility": "unlisted",
  "status": "active",
  "expires_at": "2026-06-26T00:00:00Z"
}
```

> 有效期用一个 `expires_in_hours` 数字就够，不需要 `{value, unit}` 结构 + `ttl_hours` 别名兼容。

### 7.2 列出 / 查看自己的分享页

```
GET /v1/pages?status=active&limit=20
GET /v1/pages/{id}
```

只返回本人的页面，含元数据，不返回原始正文。

### 7.3 更新元数据

`PATCH /v1/pages/{id}` —— 可改 `title` / `visibility` / `expires_at` / 下线（`status`）。

不支持改内容；要改内容就重新发一个（不做版本表）。

### 7.4 下线 / 删除

`DELETE /v1/pages/{id}` —— 链接立即失效，公开访问返回 404 或下线说明页。

### 7.5 公开访问页面数据

`GET /v1/pages/public/{slug}`

返回页面元数据 + 内容，供前端 `/p/{slug}` 渲染。Gateway 只返回 JSON，**不拼接可执行 HTML**；sanitize 和渲染都在前端做。

访问规则：

- `unlisted`：有这个不可猜测的 slug 就能看。
- `private`：要登录且是本人。
- `public`：公开可看。
- 过期 / 已删除：返回明确状态，不给内容。

## 8. 客户端形态

### 8.1 Agent 工具（MCP / 函数调用）

主工具一个，按内容自动判断类型：

```text
share_page(title, kind, content_or_file, visibility?, expires_in_hours?)
```

可选语义别名方便自然语言命中：`share_html_page`、`share_markdown_page`、`share_pdf_page`、`share_document`。管理用：`list_shared_pages`、`unpublish_page`。

> 砍掉旧版那一长串 `share_word_document / share_excel_workbook / share_powerpoint_deck / update_shared_page_metadata` 等——一个主工具 + 少量别名足够路由。

### 8.2 Web 入口

同一个 Web 应用承载：

| 路由 | 职责 |
| --- | --- |
| `/` | 产品介绍 + 入口 |
| `/console` | 记忆管理（见记忆规格） |
| `/pages` | 我的分享页：发布、列表、复制链接、下线 |
| `/p/{slug}` | 只读分享展示（前端 sanitize + 渲染） |

分享展示页不提供任何编辑/评论/协作入口。

### 8.3 CLI（开发者可选，非普通用户主线）

```bash
gotomemory pages publish --title "方案" --kind html --file index.html
gotomemory pages list
gotomemory pages unpublish pg_abc123
```

## 9. 安全要求

### 9.1 边界

- Gateway 只返回 JSON，不返回可执行展示 HTML。
- 前端负责 sanitizer、Markdown 渲染、只读展示。
- 私有页面访问由后端按 token 校验是否本人。
- 访问者操作不写回原始内容。

### 9.2 默认 CSP

```http
Content-Security-Policy:
  default-src 'none';
  img-src 'self' data: https:;
  style-src 'self' 'unsafe-inline';
  font-src 'self' data:;
  script-src 'none';
  frame-ancestors 'none';
  base-uri 'none';
  form-action 'none';
```

### 9.3 上传限制

- 限制文件大小和类型，校验 MIME 与扩展名一致。
- 拒绝含宏的 Office 格式；对压缩/Office 文件防 zip bomb。
- `unlisted` slug 不可猜测，至少 128 bit 随机。

## 10. 数据模型

一张表。没有版本表、没有 quarantine 状态、没有 `content_sha256/asset_prefix/rendered_object_key`。

```sql
CREATE TABLE shared_pages (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  title       TEXT NOT NULL,
  kind        TEXT NOT NULL,                    -- html | markdown | pdf | docx | xlsx | pptx
  visibility  TEXT NOT NULL DEFAULT 'unlisted', -- unlisted | private | public
  status      TEXT NOT NULL DEFAULT 'active',   -- active | expired | deleted
  object_key  TEXT,                             -- 原始内容存储位置（HTML/MD 也可直接存正文）
  expires_at  TIMESTAMP,                        -- NULL = 永久
  view_count  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMP NOT NULL DEFAULT now(),
  CHECK (kind IN ('html','markdown','pdf','docx','xlsx','pptx')),
  CHECK (visibility IN ('private','unlisted','public')),
  CHECK (status IN ('active','expired','deleted'))
);
```

存储：开发期用本地文件系统（如 `.gotomemory-pages/`），生产用 S3 / R2 / GCS。

## 11. 默认配置

- `visibility`: `unlisted`
- `expires_in_hours`: 不传 = 永久
- `allow_download`: false
- `allow_public_indexing`: false
- `scripts`: disabled
- `office_macros`: rejected
- `max_html_size` / `max_markdown_size`: 1 MB
- `max_file_size`: 25 MB

## 12. 后续高级层（降级保留，不进 MVP）

旧版规格里的这些能力有价值但不面向普通用户，留到团队/企业/规模化阶段再启用，与上面的简单模型向上兼容：

- **版本管理**：`POST /pages/{id}/versions`、版本表、分享 URL 指向最新 active 版本。
- **内容安全扫描与隔离**：`quarantined` 状态、转换沙箱资源限额、举报处理。
- **细粒度发布策略与权限**：`page:create/view/update/unpublish/...` 动作、按 client 限制能否发 public、配额。
- **审计**：`page.create/view/update/unpublish/...` 事件、`ip_hash` 聚合、append-only。
- **对象存储治理与生产化**：独立 pages 域名、CDN、防滥用、限流、保留/删除 SLA。
- **多租户**：`tenant_id` + 跨租户隔离。
- **Office 转换流水线**：LibreOffice headless / 专用转换服务、缩略图、降级渲染。

> 这些详细设计待进入高级层阶段时单独成文。本规格只对普通用户的"一键分享只读链接"负责。

## 13. 与记忆系统的关系

分享页和记忆是两个平行能力：记忆用于跨助手的长期上下文，分享页用于交付物的一次性只读分享。系统**不**自动把分享内容写成记忆——需要时由用户/Agent 单独调记忆保存。
