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
| MCP Server      | ✅ 已实现 | stdio 协议，4 个工具：search / read / save / build_context   |
| 浏览器扩展      | ✅ 已实现 | 平台检测、搜索、构建并注入、保存选中文本、设置（可配置网关） |
| Claude Desktop  | ✅ 可接入 | 通过本地 stdio MCP 直连                                      |
| ChatGPT Desktop | ⚠️ 需桥接 | ChatGPT 不支持本地 stdio MCP，需远程桥接（见第 5 节）        |

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

## 3. 浏览器扩展：安装与测试

> 适用 Chrome / Edge 等 Chromium 浏览器。

### 3.1 准备扩展产物

```bash
# 方式 A —— 开发模式（自动打开 Chrome 并加载扩展，改代码热重载）
pnpm --filter @gotomemory/extension dev

# 方式 B —— 构建出可加载的产物
pnpm --filter @gotomemory/extension build
# 产物目录：apps/extension/.output/chrome-mv3
```

`.output/` 已被 git 忽略，所以**新克隆的仓库必须先构建**（上面任一方式），不会自带产物。

### 3.2 加载到浏览器

1. 地址栏打开 `chrome://extensions`
2. 右上角打开「开发者模式 / Developer mode」
3. 点「加载已解压的扩展程序 / Load unpacked」
4. 选择目录 `apps/extension/.output/chrome-mv3`
5. 扩展栏出现 **gotomemory** 图标

### 3.3 配置网关（首次）

1. 点 **gotomemory** 图标打开 popup
2. 展开底部「设置（Gateway 连接）」
3. 填 Base URL `http://localhost:8787/v1`、Token `t1:u1` → 点「保存」（持久化在扩展存储）

> 连接参数不再硬编码，默认即 `localhost:8787` / `t1:u1`，可在此改成任意网关。

### 3.4 测试 ①：搜索记忆

1. 确保第 1、2 节的网关已在 `:8787` 运行且已灌数据
2. popup 输入 `typescript` → 点「搜索」
3. 预期：列出形如 `normal 用户希望代码示例优先使用 TypeScript`；**secret 不会出现**

### 3.5 测试 ②：构建并注入（核心闭环）

1. 在浏览器打开 `https://chatgpt.com` / `https://claude.ai` / `https://gemini.google.com`
   （popup 顶部状态条应显示「当前平台：xxx」）
2. popup 在「任务」框输入如 `写代码`，点「构建并注入」
3. 普通记忆 → 直接把上下文文本**写入该页面的聊天输入框**
4. private 记忆 → popup 列出待确认项（带勾选）→ 点「确认并注入」后再写入；secret 则被省略

> 注入到的是页面输入框（contenteditable / textarea），并不会自动发送，便于你检查后再回车。

### 3.6 测试 ③：保存选中文本为记忆

1. 在 AI 网页里用鼠标选中一段文字
2. popup 点「保存选中文本为记忆」→ 经网关 `memories.create` 写入（`type=note`）
3. 回到测试 ① 搜索应能看到它

### 3.7 测试 ④：内容脚本平台检测（可选）

打开受支持站点 → F12 → Console，应出现 `gotomemory: active on <platform>`。

### 3.8 扩展排错

| 现象                           | 处理                                                                                               |
| ------------------------------ | -------------------------------------------------------------------------------------------------- |
| popup 提示「页面无内容脚本」   | 当前标签页不是受支持 AI 站点；或刚加载扩展，刷新该页面再试                                         |
| 注入失败「editor-not-found」   | 平台改版了输入框结构；更新 `apps/extension/src/platform.ts` 的 `EDITOR_SELECTORS`                  |
| popup fetch 报错 / CORS        | 网关没起或端口不对；用 `index.ts` 启动（已开 CORS）；远程网关需在 manifest 加其 `host_permissions` |
| 状态条显示「不是受支持的平台」 | 仅注入不可用，搜索/保存仍可用                                                                      |

---

## 4. Claude Desktop 端测试（MCP，stdio 直连）

Claude Desktop 支持本地 stdio MCP，可直接指向 Node 进程。

### 4.1 构建 MCP Server

```bash
pnpm --filter @gotomemory/mcp-server build     # 产出 apps/mcp-server/dist/bin.js
```

### 4.2 配置 `claude_desktop_config.json`

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

### 4.3 验证

1. 确保网关仍在 `:8787` 运行
2. 新建对话，点输入框旁的工具/连接器图标，应能看到 gotomemory 提供的工具：
   `search_memory`、`read_memory`、`save_memory`、`build_context`
3. 用自然语言引导其调用，例如：
   - 「用 search_memory 搜索 `typescript`」→ 返回预览列表
   - 「用 build_context 为任务『写代码』构建上下文」→ 返回可注入上下文与 `decision_id`
   - 「把『我喜欢中文文档』用 save_memory 存为 preference」→ 写入成功
4. 治理验证：让它对任务『db』构建上下文，secret 记忆应被 `omitted`（不会自动注入）

### 4.4 排错

| 现象             | 处理                                                                                   |
| ---------------- | -------------------------------------------------------------------------------------- |
| 看不到工具       | 路径非绝对 / 拼写错误 / 未重启 Claude Desktop                                          |
| 工具调用全部失败 | 网关没起；`env` 里 URL/Token 没配                                                      |
| 想免构建调试     | 把 `command` 改为 `npx`，`args` 改为 `["tsx","<绝对路径>/apps/mcp-server/src/bin.ts"]` |
| 查看日志         | macOS：`~/Library/Logs/Claude/` 下的 MCP 日志                                          |

---

## 5. ChatGPT 桌面端测试（MCP，需远程桥接）

> ⚠️ **关键限制**：ChatGPT（含桌面端）**不支持本地 stdio MCP**，只支持
> **远程 MCP（SSE / Streamable HTTP）**。因此不能像 Claude Desktop 那样直接指向 `node`。
> 需要把 gotomemory 的 stdio server 桥接成一个 HTTP/SSE 端点，并通过 ChatGPT 的
> **Developer mode（beta）** 添加为连接器。

### 5.1 把 stdio MCP 桥接为 HTTP/SSE

用 [`supergateway`](https://github.com/supercorp-ai/supergateway) 暴露为 SSE：

```bash
export GOTOMEMORY_URL=http://localhost:8787/v1
export GOTOMEMORY_TOKEN=t1:u1        # supergateway 继承当前 shell 的环境变量

npx -y supergateway \
  --stdio "node /Users/yuzhao/git/SymphonyProtocolLab/gotomemory/apps/mcp-server/dist/bin.js" \
  --port 8788
# 暴露 SSE 端点，形如 http://localhost:8788/sse
```

### 5.2 暴露为公网 HTTPS（ChatGPT 连接器通常要求公网可达）

```bash
npx -y cloudflared tunnel --url http://localhost:8788   # 或 ngrok http 8788
# 得到一个 https://<随机>.trycloudflare.com 地址
```

### 5.3 在 ChatGPT 桌面端添加连接器

1. ChatGPT 桌面端 → **Settings → Connectors**（或 **Advanced → Developer mode**，beta）
2. 启用 Developer mode → **Add / Create connector（MCP）**
3. 连接器 URL 填上一步隧道地址加 SSE 路径，例如 `https://<隧道域名>/sse`
4. 保存并授权

> 该功能为 **beta**，菜单与字段随 ChatGPT 版本变化，以官方文档为准（见文末参考链接）。

### 5.4 验证

在对话中触发工具（如「搜索我的 typescript 偏好」「为任务 X 构建上下文」），
确认请求最终打到本地网关（看网关/桥接进程日志）。

### 5.5 不想桥接？用浏览器扩展

如果只是想在 ChatGPT 上看到效果，可直接在 **Chrome 打开 `chatgpt.com`**，
用第 3 节的浏览器扩展 popup 搜索记忆（注意：桌面 App 不是浏览器，装不了扩展）。

---

## 6. 推荐联调顺序（Checklist）

1. [ ] 启动网关 `:8787`，`curl /health` 返回 ok
2. [ ] CLI 灌入 normal / private / secret 三条数据并搜索冒烟
3. [ ] 浏览器扩展：加载 → popup 搜索 → 站点 Console 检测日志
4. [ ] Claude Desktop：配置 MCP → 重启 → 调用 4 个工具 → 验证 secret 被 omitted
5. [ ] （可选）ChatGPT 桌面端：supergateway 桥接 + 隧道 + Developer mode 连接器

---

## 7. 全局排错速查

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
