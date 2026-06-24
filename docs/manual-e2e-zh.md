# gotomemory 手动 E2E 测试指南（中文）

本文面向**手工端到端测试**：从启动后台服务，到安装浏览器扩展、在 Claude Desktop
与 ChatGPT 桌面端接入并验证。命令均基于本仓库实测。

> 自动化/一键脚本测试见 [docs/TESTING.md](TESTING.md) 与 `scripts/e2e-demo.sh`。

---

## 0. 先读：当前实现现状（避免误测）

不同客户端的成熟度不同，测试前请对齐预期：

| 客户端          | 现状      | 可手工验证的行为                                             |
| --------------- | --------- | ------------------------------------------------------------ |
| Gateway API     | ✅ 已实现 | 全部 REST 接口、鉴权、校验、策略、加密、审计                 |
| CLI             | ✅ 已实现 | create / search / read / delete / context build / confirm    |
| Web 控制台      | ✅ 已实现 | 创建、搜索、构建上下文                                       |
| 主站入口        | ✅ 已实现 | gotomemory 入口、Pages 入口、Pages 使用文档                  |
| 分享页          | ✅ 已实现 | HTML / Markdown / PDF / Word / Excel / PowerPoint 只读分享   |
| MCP Server      | ✅ 已实现 | stdio 协议，支持记忆、上下文确认与分享页工具                 |
| 浏览器扩展      | ✅ 已实现 | 平台检测、搜索、构建并注入、保存选中文本、设置（可配置网关） |
| Claude Desktop  | ✅ 可接入 | 通过本地 stdio MCP 直连                                      |
| ChatGPT Desktop | ⚠️ 需桥接 | ChatGPT 不支持本地 stdio MCP，需远程桥接（见第 7 节）        |

> 说明：浏览器扩展把**网络**留在 popup、把**页面 DOM**留在内容脚本，两者通过消息通信。
> 注入使用 `execCommand('insertText')` / 原生 setter，兼容 ChatGPT/Claude/Gemini 的富文本输入框；
> 网页 UI 改版时可能需要更新 `apps/extension/src/platform.ts` 里的选择器。

---

## 1. 启动后台服务（Gateway）

### 1.1 前置

```bash
corepack enable          # 启用仓库钉死的 pnpm 11.x
node -v                  # 应为 v22.x
pnpm install
```

后台使用**内存后端**，无需数据库；网关一重启数据即清空。

### 1.2 启动网关

```bash
# 方式 A —— 免构建（开发最快）
PORT=8787 npx tsx apps/gateway/src/index.ts &

# 方式 B —— 构建后运行（贴近生产）
pnpm exec turbo run build
PORT=8787 node apps/gateway/dist/index.js &

curl -s localhost:8787/health        # => {"status":"ok"}
```

> 想让加密密钥跨重启稳定（否则每次启动随机生成）：启动前
> `export GOTOMEMORY_MASTER_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")`

### 1.3 Token 语义

dev 鉴权把 `Authorization: Bearer <租户>:<主体>` 解析为 tenant / subject。
本文统一用 `t1:u1`（租户 `t1`，用户 `u1`）。

---

## 2. 配置后台连接 + 灌入测试数据

三个客户端共用同一组连接参数：

| 参数     | 值                                                    |
| -------- | ----------------------------------------------------- |
| Base URL | `http://localhost:8787/v1`                            |
| Token    | `t1:u1`                                               |
| CORS     | 默认开启（`index.ts` `cors:true`），浏览器/扩展可直连 |

先用 CLI 灌入三条不同敏感度的记忆，供后续在各客户端验证：

```bash
export GOTOMEMORY_URL=http://localhost:8787/v1
export GOTOMEMORY_TOKEN=t1:u1
cli() { npx tsx apps/cli/src/bin.ts "$@"; }   # 或 node apps/cli/dist/bin.js

echo "用户希望代码示例优先使用 TypeScript" | cli memory create --type preference --tags coding,ts --json
echo "我负责公司内部支付系统"             | cli memory create --type fact --sensitivity private --json
echo "prod db 密码见 vault"               | cli memory create --type credential_hint --json   # 自动判定为 secret

cli memory search typescript --json      # 冒烟：应能搜到第一条，且不含 content
```

预期：normal 可搜到、private 可搜到（预览脱敏）、**secret 不出现在搜索结果**。

---

## 3. Web 控制台：启动与测试

Web 控制台是 Vite 应用，直接通过 TS SDK 调 Gateway。它默认使用：

| 参数     | 默认值                     |
| -------- | -------------------------- |
| Base URL | `http://localhost:8787/v1` |
| Token    | `t1:u1`                    |

### 3.1 启动控制台

确保第 1 节 Gateway 已在 `:8787` 运行；如果第 3 节的 Web 控制台已经在 `:5173` 运行，
这一节可以直接复用。否则另开一个终端：

```bash
pnpm --filter @gotomemory/console dev
```

Vite 会输出本地地址，通常是：

```text
http://localhost:5173
```

浏览器打开 `http://localhost:5173/console` 进入记忆控制台；`http://localhost:5173/` 是主站入口。

### 3.2 连接设置

1. 点右上角设置图标。
2. 确认 Gateway base URL 为 `http://localhost:8787/v1`。
3. 确认 Token 为 `t1:u1`。
4. 如你换了 Gateway 端口或 token，在这里同步修改。

设置保存在浏览器 `localStorage` 中。若测试异常，可清理站点数据后重试。

### 3.3 测试 ①：创建记忆

1. 在 `Create` 区域选择 `preference`。
2. 输入 `用户希望代码示例优先使用 TypeScript`。
3. 点 `Save`。
4. 预期：页面提示 `Saved <id> as normal`。

### 3.4 测试 ②：搜索记忆

1. 在 `Search` 区域输入 `typescript`。
2. 点 `Search`。
3. 预期：看到刚才创建或第 2 节 CLI 灌入的 TypeScript 记忆。
4. 预期：搜索结果只显示预览，不展示完整 `content`。

### 3.5 测试 ③：构建上下文

1. 在 `Build context` 区域输入 `写代码`。
2. 点 `Build`。
3. 普通记忆：预期直接显示可注入 context，`requires_confirmation=false`。
4. private 记忆：若任务命中私密记忆，预期出现待确认列表；勾选后点 `Confirm & inject`。
5. secret 记忆：预期只出现在 omitted 区域，不进入 context。

### 3.6 排错

| 现象                  | 处理                                                                |
| --------------------- | ------------------------------------------------------------------- |
| 页面报 `fetch failed` | Gateway 未启动、端口不对，先 `curl -s localhost:8787/health`        |
| 全部 401              | Token 不是 `租户:主体` 形式，确认设置里是 `t1:u1`                   |
| 数据和 CLI 不一致     | Gateway 重启导致内存数据清空，或 Console/CLI 使用了不同 token / URL |
| 看不到刚创建的数据    | 搜索词未命中摘要；尝试搜索更接近的词，或重新创建带明确关键词的记忆  |

---

## 4. 主站入口与分享页：统一 Web 启动与测试

主站入口、Web 控制台、分享页管理和 `/p/:slug` 只读展示都在同一个前端应用
`@gotomemory/console` 中。Gateway 只负责 `/v1/pages` 管理 API 和
`/v1/pages/public/:slug` JSON 数据 API，不再渲染分享页 HTML。

### 4.1 启动统一 Web 控制台

确保第 1 节 Gateway 已在 `:8787` 运行，然后另开一个终端：

```bash
pnpm --filter @gotomemory/console dev
```

浏览器打开：

| 页面         | 地址                             | 预期                                     |
| ------------ | -------------------------------- | ---------------------------------------- |
| 主站入口     | `http://localhost:5173/`         | 看到 Console、Pages、Share URLs 三个入口 |
| 记忆控制台   | `http://localhost:5173/console`  | 创建、搜索、构建上下文                   |
| 分享页管理   | `http://localhost:5173/pages`    | 发布分享页、查看列表、取消发布           |
| 分享页展示页 | `http://localhost:5173/p/<slug>` | 由前端读取 JSON 后只读渲染               |

### 4.2 发布 HTML / Markdown 分享页

确保 Gateway 和 Web 控制台都在运行，然后在终端设置 CLI：

```bash
export GOTOMEMORY_URL=http://localhost:8787/v1
export GOTOMEMORY_TOKEN=t1:u1
cli() { npx tsx apps/cli/src/bin.ts "$@"; }
```

发布一个 2 小时后过期的 HTML 分享页：

```bash
PAGE_URL=$(
  printf '<h1 onclick="bad()">gotomemory 分享页</h1><script>alert(1)</script>' |
    cli pages publish --title "HTML 分享页冒烟" --kind html --expires 2h
)

echo "$PAGE_URL"                 # 形如 http://localhost:5173/p/<slug>
```

预期：浏览器打开 `PAGE_URL` 可看到标题；前端渲染时会清洗 `<script>`、`onclick` 等危险内容。
Gateway 的公开数据接口可用下面命令检查：

```bash
SLUG=${PAGE_URL##*/}
curl -s "http://localhost:8787/v1/pages/public/$SLUG" | rg '"kind":"html"'
```

发布一个永久 Markdown 分享页（不传 `--expires` 即永久）：

```bash
MD_URL=$(
  printf '# Markdown 分享页\n\n- 只读\n- 永久有效' |
    cli pages publish --title "Markdown 分享页冒烟" --kind markdown
)

echo "$MD_URL"
```

浏览器打开 `MD_URL`，预期 Markdown 被前端渲染为只读页面。

### 4.3 通过 Web 控制台发布分享页

1. 打开 `http://localhost:5173/pages`。
2. 输入标题，例如 `Console 分享页冒烟`。
3. 选择 `markdown` 或 `html`。
4. 选择 `unlisted` / `public` / `private`。
5. 可选填写过期时间，例如 `2h` 或 `1d`；留空表示永久分享。
6. 输入内容并点击 `Publish`。
7. 预期：页面返回 `/p/<slug>` 链接，点击后在同一个 Web 控制台前端展示只读页面。

### 4.4 发布文件类分享页

PDF / Word / Excel / PowerPoint 使用同一条命令，只是 `--kind` 和 `--file` 不同。页面只读，
不会提供在线编辑入口。文件类本地 MVP 先展示只读占位或浏览器 PDF 预览。

```bash
cli pages publish --title "PDF 报告" --kind pdf --file ./sample.pdf --expires 1d
cli pages publish --title "Word 文档" --kind docx --file ./sample.docx --expires 1d
cli pages publish --title "Excel 表格" --kind xlsx --file ./sample.xlsx --expires 1d
cli pages publish --title "PPT 演示" --kind pptx --file ./sample.pptx --expires 1d
```

预期：命令返回 `http://localhost:5173/p/<slug>` 分享地址；浏览器打开后看到只读预览或提示，
不出现编辑控件。

### 4.5 管理分享页

```bash
cli pages list
cli --json pages show <page_id>

# 用 show 返回的 version 更新标题或过期时间；--expires-at "" 表示清除过期时间，变为永久
cli pages update <page_id> --version <version> --title "新标题"
cli pages update <page_id> --version <version> --expires-at ""

# 新增内容版本
printf '<h1>新版内容</h1>' | cli pages version <page_id> --version <version>

# 取消发布
cli pages unpublish <page_id>
curl -i http://localhost:8787/v1/pages/public/<slug>       # 预期 404
```

### 4.6 私有分享页

```bash
PRIVATE_URL=$(
  printf '<h1>私有分享页</h1>' |
    cli pages publish --title "私有分享页冒烟" --kind html --visibility private
)

SLUG=${PRIVATE_URL##*/}
curl -i "http://localhost:8787/v1/pages/public/$SLUG"                              # 预期 403
curl -i -H "Authorization: Bearer t1:u1" "http://localhost:8787/v1/pages/public/$SLUG" # 预期 200
```

### 4.7 过期时间验证

`--expires` 支持小时和天，例如 `2h`、`1d`。返回的分享页元数据中会包含 `expires_at`；
到期后 Gateway 会拒绝 `/v1/pages/public/<slug>` 数据访问并返回 404，前端 `/p/<slug>` 会展示不可用状态。
未传 `--expires` 时 `expires_at=null`，表示永久分享。

```bash
cli --json pages publish --title "2 小时分享" --kind markdown --content "# 2h" --expires 2h
cli --json pages publish --title "1 天分享" --kind markdown --content "# 1d" --expires 1d
cli --json pages publish --title "永久分享" --kind markdown --content "# permanent"
```

### 4.8 分享页排错

| 现象               | 处理                                                            |
| ------------------ | --------------------------------------------------------------- |
| `/p/<slug>` 不可用 | 分享页已过期 / 已取消发布 / slug 写错；用 `cli pages show` 确认 |
| 私有分享页 403     | Web 设置里的 Token 不是 owner；确认设置为 `t1:u1`               |
| 返回 URL 端口不对  | 设置 `GOTOMEMORY_WEB_URL=http://localhost:5173` 后重启网关      |
| 文件预览不正常     | 确认 `--kind` 与文件类型一致；文件路径必须能被 CLI 读到         |

---

## 5. 浏览器扩展：安装与测试

> 适用 Chrome / Edge 等 Chromium 浏览器。

### 5.1 准备扩展产物

```bash
# 方式 A —— 开发模式（自动打开 Chrome 并加载扩展，改代码热重载）
pnpm --filter @gotomemory/extension dev

# 方式 B —— 构建出可加载的产物
pnpm --filter @gotomemory/extension build
# 产物目录：apps/extension/.output/chrome-mv3
```

`.output/` 已被 git 忽略，所以**新克隆的仓库必须先构建**（上面任一方式），不会自带产物。

### 5.2 加载到浏览器

1. 地址栏打开 `chrome://extensions`
2. 右上角打开「开发者模式 / Developer mode」
3. 点「加载已解压的扩展程序 / Load unpacked」
4. 选择目录 `apps/extension/.output/chrome-mv3`
5. 扩展栏出现 **gotomemory** 图标

### 5.3 配置网关（首次）

1. 点 **gotomemory** 图标打开 popup
2. 展开底部「设置（Gateway 连接）」
3. 填 Base URL `http://localhost:8787/v1`、Token `t1:u1` → 点「保存」（持久化在扩展存储）

> 连接参数不再硬编码，默认即 `localhost:8787` / `t1:u1`，可在此改成任意网关。

### 5.4 测试 ①：搜索记忆

1. 确保第 1、2 节的网关已在 `:8787` 运行且已灌数据
2. popup 输入 `typescript` → 点「搜索」
3. 预期：列出形如 `normal 用户希望代码示例优先使用 TypeScript`；**secret 不会出现**

### 5.5 测试 ②：构建并注入（核心闭环）

1. 在浏览器打开 `https://chatgpt.com` / `https://claude.ai` / `https://gemini.google.com`
   （popup 顶部状态条应显示「当前平台：xxx」）
2. popup 在「任务」框输入如 `写代码`，点「构建并注入」
3. 普通记忆 → 直接把上下文文本**写入该页面的聊天输入框**
4. private 记忆 → popup 列出待确认项（带勾选）→ 点「确认并注入」后再写入；secret 则被省略

> 注入到的是页面输入框（contenteditable / textarea），并不会自动发送，便于你检查后再回车。

### 5.6 测试 ③：保存选中文本为记忆

1. 在 AI 网页里用鼠标选中一段文字
2. popup 点「保存选中文本为记忆」→ 经网关 `memories.create` 写入（`type=note`）
3. 回到测试 ① 搜索应能看到它

### 5.7 测试 ④：内容脚本平台检测（可选）

打开受支持站点 → F12 → Console，应出现 `gotomemory: active on <platform>`。

### 5.8 扩展排错

| 现象                           | 处理                                                                                               |
| ------------------------------ | -------------------------------------------------------------------------------------------------- |
| popup 提示「页面无内容脚本」   | 当前标签页不是受支持 AI 站点；或刚加载扩展，刷新该页面再试                                         |
| 注入失败「editor-not-found」   | 平台改版了输入框结构；更新 `apps/extension/src/platform.ts` 的 `EDITOR_SELECTORS`                  |
| popup fetch 报错 / CORS        | 网关没起或端口不对；用 `index.ts` 启动（已开 CORS）；远程网关需在 manifest 加其 `host_permissions` |
| 状态条显示「不是受支持的平台」 | 仅注入不可用，搜索/保存仍可用                                                                      |

---

## 6. Claude Desktop 端测试（MCP，stdio 直连）

Claude Desktop 支持本地 stdio MCP，可直接指向 Node 进程。

### 6.1 构建 MCP Server

```bash
pnpm --filter @gotomemory/mcp-server build     # 产出 apps/mcp-server/dist/bin.js
```

### 6.2 配置 `claude_desktop_config.json`

配置文件路径：

- macOS：`~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows：`%APPDATA%\Claude\claude_desktop_config.json`

写入（注意用**绝对路径**，并按需替换仓库路径）：

```json
{
  "mcpServers": {
    "gotomemory": {
      "command": "node",
      "args": ["/Users/yuzhao/git/SymphonyProtocolLab/gotomemory/apps/mcp-server/dist/bin.js"],
      "env": {
        "GOTOMEMORY_URL": "http://localhost:8787/v1",
        "GOTOMEMORY_TOKEN": "t1:u1"
      }
    }
  }
}
```

保存后**完全退出并重启** Claude Desktop。

### 6.3 验证

1. 确保网关仍在 `:8787` 运行
2. 新建对话，点输入框旁的工具/连接器图标，应能看到 gotomemory 提供的工具：
   `search_memory`、`read_memory`、`save_memory`、`build_context`、`confirm_context`，以及面向
   ChatGPT / 自然语言路由的语义化别名：
   `search_user_memory`、`read_user_memory`、`save_user_memory`、`save_conversation_summary`、
   `build_memory_context`、`confirm_memory_context`
3. 在输入框输入 `/gotomemory`，应能看到 gotomemory 提供的 MCP Prompt；也可以使用更明确的
   prompt：
   - `/gotomemory-summary`：总结当前可见对话并调用 `save_memory` 保存
   - `/gotomemory-build-context`：调用 `build_context`，必要时再用 `confirm_context` 完成确认
   - `/gotomemory-save`：保存一条 fact / preference / note / instruction
   - `/gotomemory-search`：调用 `search_memory`
   - `/gotomemory-read`：调用 `read_memory`
   - `/gotomemory-confirm`：手工传入 `decision_id` / `confirmation_token` / ids 调用 `confirm_context`
     例如 `/gotomemory-summary` 填「总结这个对话并保存」，Claude 会总结当前可见对话并调用
     `save_memory` 保存；如果摘要包含私密/敏感内容，应先向你确认。
4. 也可以用自然语言引导其调用，例如：
   - 「用 search_memory 搜索 `typescript`」→ 返回预览列表
   - 「用 build_context 为任务『写代码』构建上下文」→ 返回可注入上下文与 `decision_id`
   - 「如果 build_context 返回 requires_confirmation=true，用 confirm_context 确认 preview 里的记忆」→ 返回最终可注入上下文
   - 「把『我喜欢中文文档』用 save_memory 存为 preference」→ 写入成功
   - 「总结这个对话并保存到 gotomemory」→ 调用 `save_conversation_summary`
5. 治理验证：让它对任务『db』构建上下文，secret 记忆应被 `omitted`（不会自动注入）

### 6.4 排错

| 现象             | 处理                                                                                   |
| ---------------- | -------------------------------------------------------------------------------------- |
| 看不到工具       | 路径非绝对 / 拼写错误 / 未重启 Claude Desktop                                          |
| 工具调用全部失败 | 网关没起；`env` 里 URL/Token 没配                                                      |
| 想免构建调试     | 把 `command` 改为 `npx`，`args` 改为 `["tsx","<绝对路径>/apps/mcp-server/src/bin.ts"]` |
| 查看日志         | macOS：`~/Library/Logs/Claude/` 下的 MCP 日志                                          |

---

## 7. ChatGPT 桌面端测试（MCP，需远程桥接）

> ⚠️ **关键限制**：ChatGPT（含桌面端）**不支持本地 stdio MCP**，只支持
> **远程 MCP（SSE / Streamable HTTP）**。因此不能像 Claude Desktop 那样直接指向 `node`。
> 需要把 gotomemory 的 stdio server 桥接成一个 HTTP/SSE 端点，并通过 ChatGPT 的
> **Developer mode（beta）** 添加为连接器。

### 7.1 把 stdio MCP 桥接为 HTTP/SSE

用 [`supergateway`](https://github.com/supercorp-ai/supergateway) 暴露为 SSE：

```bash
export GOTOMEMORY_URL=http://localhost:8787/v1
export GOTOMEMORY_TOKEN=t1:u1        # supergateway 继承当前 shell 的环境变量

npx -y supergateway \
  --stdio "node /Users/yuzhao/git/SymphonyProtocolLab/gotomemory/apps/mcp-server/dist/bin.js" \
  --port 8788
# 暴露 SSE 端点，形如 http://localhost:8788/sse
```

### 7.2 暴露为公网 HTTPS（ChatGPT 连接器通常要求公网可达）

```bash
npx -y cloudflared tunnel --url http://localhost:8788   # 或 ngrok http 8788
# 得到一个 https://<随机>.trycloudflare.com 地址
```

### 7.3 在 ChatGPT 桌面端添加连接器

1. ChatGPT 桌面端 → **Settings → Connectors**（或 **Advanced → Developer mode**，beta）
2. 启用 Developer mode → **Add / Create connector（MCP）**
3. 连接器 URL 填上一步隧道地址加 SSE 路径，例如 `https://<隧道域名>/sse`
4. 保存并授权

> 该功能为 **beta**，菜单与字段随 ChatGPT 版本变化，以官方文档为准（见文末参考链接）。

### 7.4 验证

在对话中触发工具（如「搜索我的 typescript 偏好」「为任务 X 构建上下文」），
确认请求最终打到本地网关（看网关/桥接进程日志）。

### 7.5 不想桥接？用浏览器扩展

如果只是想在 ChatGPT 上看到效果，可直接在 **Chrome 打开 `chatgpt.com`**，
用第 5 节的浏览器扩展 popup 搜索记忆（注意：桌面 App 不是浏览器，装不了扩展）。

---

## 8. 推荐联调顺序（Checklist）

1. [ ] 启动网关 `:8787`，`curl /health` 返回 ok
2. [ ] CLI 灌入 normal / private / secret 三条数据并搜索冒烟
3. [ ] Web 控制台：启动 → 创建 / 搜索 / Build context / Confirm
4. [ ] 主站入口：启动 → 打开首页 / Pages 入口 / Pages 文档
5. [ ] 分享页：发布 HTML / Markdown → 打开 `/p/<slug>` → 验证只读、清洗、过期、取消发布
6. [ ] 浏览器扩展：加载 → popup 搜索 → 站点 Console 检测日志
7. [ ] Claude Desktop：配置 MCP → 重启 → 调用记忆/上下文/分享页工具 → 验证 secret 被 omitted
8. [ ] （可选）ChatGPT 桌面端：supergateway 桥接 + 隧道 + Developer mode 连接器

---

## 9. 全局排错速查

| 现象              | 排查                                                          |
| ----------------- | ------------------------------------------------------------- |
| 任何客户端连不上  | 网关没起 / 端口不对：先 `curl localhost:8787/health`          |
| 全部 401          | Token 未设或非 `租户:主体` 形式                               |
| 刚建的记忆消失    | 网关重启过（内存后端清空），或换了租户/Token                  |
| secret 居然被注入 | 不应发生；检查是否误改了默认策略（默认 secret = manual_only） |
| 端口被占用        | 换 `PORT=8788` 并同步改各处 URL                               |

---

## 参考链接

- ChatGPT Developer mode / MCP 连接器（OpenAI 帮助中心）：
  https://help.openai.com/en/articles/12584461-developer-mode-apps-and-full-mcp-connectors-in-chatgpt-beta
- Apps SDK · Connect from ChatGPT：https://developers.openai.com/apps-sdk/deploy/connect-chatgpt
- supergateway（stdio ↔ SSE/HTTP 桥）：https://github.com/supercorp-ai/supergateway
- MCP 协议规范：https://modelcontextprotocol.io
