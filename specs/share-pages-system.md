# 对话分享系统规格设计（普通用户版）

> 本规格面向**普通用户**：把一段 AI 对话**一键变成只读分享链接**发给别人看。范围已**降级**——只做"分享对话"，不做任意文件交付物发布（那挪到文末第 11 节高级层）。
>
> 分享对象就是用户正在看的对话：可以分享**完整对话**，也可以在对话里**勾选**要分享的消息。生成的是一个**对话级**只读页面，可**公开**或用**密码保护**。

## 1. 背景

用户在 ChatGPT / Claude / Gemini 聊出了有用的东西，想发给同事或朋友看，但不想让对方能改、也不一定想公开。最自然的动作是：选中这段对话 → 生成一个只读链接 → 发出去。

这正好复用浏览器扩展已有的"读取当前对话 + 勾选消息"能力（见 memory-sharing-system.md §6.1、§6.2）。分享 = 把选中的对话内容发布成一个只读页面。

> 在 gotomemory 的**本地优先**架构里（见 memory-sharing-system.md §6.3），记忆和导出都在本机完成、免登录、不上传；**分享是少数本质上需要服务器 + 登录的功能**——因为公网只读链接要让别人打开，用户笔记本托管不了。所以分享会把用户**勾选的那部分**对话内容上传发布（明确的主动动作），并可用密码 + 有效期收紧。

## 2. 目标

- 在扩展里**一键分享当前对话**：完整对话，或勾选其中部分消息。
- 生成一个**对话级**只读页面，返回可复制的链接。
- 两种可见性：**公开**（有链接即可看）/ **密码保护**（要输密码才能看）。
- 可选有效期：到点链接失效。
- 只读：访问者只能看，不能编辑、不能改原对话。

## 3. 非目标

- 不做在线编辑、多人协同、评论。
- 不做任意文件交付物发布（HTML/PDF/Word/Excel/PPT 上传）——降级到第 11 节高级层。
- 不做对话档案馆/自动存档（见 memory-sharing-system.md §3）。分享是用户主动的一次性动作。
- 不默认让搜索引擎索引分享页。
- 不自动把分享内容存成记忆。

## 4. 核心概念

### 4.1 对话分享（Shared Conversation）

一次把对话发布成只读页面的记录。用户能感知的：

| 字段 | 含义 |
| --- | --- |
| `title` | 标题（默认取对话首条消息，可改） |
| `url` | 分享链接（含不可猜测的 `slug`） |
| `visibility` | `public`（有链接即可看）/ `password`（要密码） |
| `expires_at` | 到期时间，不设则永久 |

后台字段：`id`、`user_id`、`slug`、`source_platform`、`messages`（被分享的消息内容）、`password_hash`、`status`、`view_count`、`created_at`。

### 4.2 被分享的消息

分享的内容是一组消息，每条带 `role`（`user` / `assistant`）和 `content`（通常是 Markdown，含代码块/表格/公式）。来源可以是：

- **完整对话**：当前会话的全部消息。
- **勾选消息**：用户在对话里用复选框选的部分（和导出共用同一套选择 UX）。

### 4.3 只读展示

访问者打开链接，看到的是这段对话的**只读渲染**：按 user/assistant 气泡排版，代码/表格/公式尽量保真。不能编辑、不能回写原对话。

## 5. 使用体验

### 5.1 在扩展里分享

1. 在对话页点"分享"。
2. 选**完整对话**，或勾选要分享的消息。
3. 选可见性：**公开** 或 **设密码**；可选填有效期。
4. 拿到链接，复制发出去。

### 5.2 访问体验

- 公开页：打开链接直接看到只读对话。
- 密码页：先输密码，正确后看到对话。
- 页面底部有来源标识（如 `Shared with gotomemory`）和举报入口。
- 过期/删除：返回明确的失效说明，不给内容。

### 5.3 有效期

发布时可选有效期（几小时 / 几天 / 永久）。到期后链接返回"已过期"，内容清理。不设则永久，直到本人下线删除。

## 6. 隐私

分享天然要把选中的对话内容托管出去才能让别人访问，这与"记忆/导出默认不上传原文"不同——**但分享是用户明确发起的动作，且只上传用户勾选的那部分**：

- 只有用户点了"分享"、选定的消息才会上传并发布，原对话的其余部分不动。
- 公开页任何拿到链接的人都能看；要更私密就用**密码保护**，并可加**有效期**。
- 密码只存哈希（见 9.1），不存明文。
- 用户可随时下线/删除分享，链接立即失效。
- 默认不允许搜索引擎索引。

## 7. API 设计

统一前缀 `/v1`，登录后请求带用户 token。只有 5 个端点。

### 7.1 创建对话分享

`POST /v1/shares`

```json
{
  "title": "关于记忆系统的讨论",
  "source_platform": "claude",
  "messages": [
    { "role": "user", "content": "帮我设计一个跨助手记忆系统" },
    { "role": "assistant", "content": "可以这样..." }
  ],
  "visibility": "password",
  "password": "明文仅用于建链，服务端立即哈希后丢弃",
  "expires_in_hours": 48
}
```

- `visibility` 为 `public` 时不需要 `password`。
- `expires_in_hours` 不传 = 永久。
- `messages` 即用户选定的内容（完整对话或勾选子集）。

响应：

```json
{
  "id": "sc_abc123",
  "url": "https://gotomemory.dev/p/r7K2mQ",
  "visibility": "password",
  "status": "active",
  "expires_at": "2026-06-26T00:00:00Z"
}
```

### 7.2 列出 / 查看自己的分享

```
GET /v1/shares?status=active&limit=20
GET /v1/shares/{id}
```

只返回本人的分享，含元数据，不回密码哈希。

### 7.3 更新 / 下线

```
PATCH  /v1/shares/{id}     # 改 title / visibility / 改或清密码 / expires_at / 下线(status)
DELETE /v1/shares/{id}     # 链接立即失效
```

### 7.4 公开访问

`GET /v1/shares/public/{slug}`

- `public`：直接返回对话内容 + 元数据。
- `password`：只返回"需要密码"标记和标题，不返回内容。
- 过期/删除：返回明确状态。

### 7.5 密码解锁

`POST /v1/shares/public/{slug}/unlock`

```json
{ "password": "用户输入的密码" }
```

服务端比对哈希，通过则返回对话内容（或一个短期有效的查看令牌）。失败计入限流，防暴力破解。

## 8. 客户端形态

### 8.1 浏览器扩展（主入口）

分享按钮就在对话页，复用 6.1/6.2 的消息选择。这是普通用户的唯一分享入口。

### 8.2 Web 入口

| 路由 | 职责 |
| --- | --- |
| `/` | 产品入口 |
| `/console` | 记忆管理 |
| `/shares` | 我的分享：列表、复制链接、改可见性/密码/有效期、下线 |
| `/p/{slug}` | 只读对话展示（前端渲染 + sanitize；密码页在此输密码） |

`/p/{slug}` 不提供任何编辑/评论入口。

## 9. 安全要求

### 9.1 密码与访问

- 密码只存**哈希**（如 scrypt/bcrypt/argon2），绝不存明文、不进日志。
- 解锁接口**限流**，防暴力破解。
- `slug` 不可猜测，至少 128 bit 随机；即便公开页也靠不可枚举的 slug，不暴露顺序 ID。
- 私有（密码）页未解锁前，公开数据接口不返回任何消息内容。

### 9.2 只读渲染

- 对话内容（多为 Markdown）渲染前**必须经 sanitizer**：禁 `<script>`、去事件属性、去危险 URL。
- 严格 CSP（`script-src 'none'` 等，沿用下表）。
- 代码块只展示不执行。

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

### 9.3 边界

- Gateway 只返回 JSON，不拼接可执行 HTML；前端负责 sanitize 和渲染。
- 访问者操作不写回原对话。
- 默认不允许搜索引擎索引。

## 10. 数据模型

一张表。

```sql
CREATE TABLE shared_conversations (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  slug            TEXT NOT NULL UNIQUE,
  title           TEXT NOT NULL,
  source_platform TEXT,                         -- chatgpt | claude | gemini
  messages        TEXT NOT NULL,                -- JSON: [{role, content}]，或指向存储的 object_key
  visibility      TEXT NOT NULL DEFAULT 'public',-- public | password
  password_hash   TEXT,                         -- visibility=password 时非空
  status          TEXT NOT NULL DEFAULT 'active',-- active | expired | deleted
  expires_at      TIMESTAMP,                     -- NULL = 永久
  view_count      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMP NOT NULL DEFAULT now(),
  CHECK (visibility IN ('public','password')),
  CHECK (status IN ('active','expired','deleted')),
  CHECK (visibility = 'public' OR password_hash IS NOT NULL)
);
```

消息内容较大时可存对象存储（开发期本地文件系统，生产用 S3/R2/GCS），表里存 `object_key`。

## 11. 默认配置

- `visibility`: `public`（有链接即可看）
- `expires_in_hours`: 不传 = 永久
- `allow_public_indexing`: false
- `scripts`: disabled（渲染端禁脚本）
- `max_messages` / `max_size`: 设上限防滥用

## 12. 错误模型

沿用 Gateway 统一错误结构。建议错误码：

| HTTP | code | 场景 |
| --- | --- | --- |
| 401 | `password_required` | 密码页未解锁 |
| 403 | `invalid_password` | 密码错误（计入限流） |
| 404 | `share_not_found` | 不存在/已删除/已过期 |
| 429 | `rate_limited` | 解锁尝试过频 |

## 13. 与记忆/导出的关系

三件事别混淆（见 memory-sharing-system.md §6.2）：

- **记忆** = 从对话提炼几条，带去别的助手。
- **导出** = 把对话拿走，存成文件或进自己的 Notion/Obsidian。
- **分享** = 把对话发布成只读链接给别人看（本规格）。

分享不自动产生记忆，也不自动导出文件；它们是三个独立动作，但都复用扩展"读对话 + 勾选消息"的同一套交互。

## 14. 后续高级层（降级保留，不进 MVP）

旧版规格里"发布任意文件交付物"的能力有价值但不属于现在的消费主线，留到后续：

- **任意交付物发布**：HTML / Markdown / PDF / Word / Excel / PowerPoint 上传发布成只读页，Office 转换流水线、隔离沙箱、`quarantined` 安全扫描。
- **Agent / MCP / CLI 发布接口**：让 Agent 把生成的页面/文档一键发布（`share_page` 等工具）。属于开发者/高级能力，不进消费展示。
- **版本管理**：分享内容的多版本、指向最新版本。
- **更细可见性与协作**：登录可见的团队私有、按成员授权、访问审计与 `ip_hash` 聚合。
- **多租户**：`tenant_id` + 跨租户隔离。
- **生产化**：独立分享域名、CDN、防滥用、限流配额、更完整审计。

> 这些详细设计待进入高级层阶段时单独成文。本规格只对普通用户的"分享一段对话"负责。
