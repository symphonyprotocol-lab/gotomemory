# Monorepo 指导规格

本规格定义 gotomemory 仓库的 monorepo 组织方式、工具链、目录结构、边界规则和发布流程。它是工程约定的单一真相源，与 [记忆共享系统规格](./memory-sharing-system.md)（下称「系统规格」）配套：系统规格定义「系统做什么」，本规格定义「代码怎么组织」。

## 1. 背景

gotomemory 是一个跨 AI 平台的 Memory Control Plane，交付物天然是多形态、跨语言的：

- 后端服务：Memory Gateway、Orchestrator、MCP Server（系统规格 §7、§16.1）。
- 前端：用户控制台、浏览器扩展（系统规格 §16.2、M4）。
- SDK：TypeScript 和 Python 两套对外发布的客户端（系统规格 §16.3）。
- 平台适配器：ChatGPT、Claude、Gemini（系统规格 §7.3）。
- 共享契约：API、数据模型、策略和适配器能力清单（系统规格 §8、§9、§7.3）。

这些产物共享同一套领域模型、契约和隐私语义。把它们放在一个仓库里，可以让契约变更、类型生成、策略语义和发布在一处原子地演进，避免「SDK 与服务端契约漂移」「适配器静默改变 payload 语义」这类系统规格明确要规避的问题。

## 2. 目标与非目标

### 2.1 目标

- 一个仓库容纳所有服务、前端、SDK 和共享库，契约改一处、消费方同步更新。
- 跨语言（TypeScript + Python）协作，但各自使用本语言的原生工具，不强行统一。
- 用代码边界固化系统规格的隐私与权限边界（如：适配器拿不到未脱敏正文）。
- 增量、可缓存的构建与测试，只跑受影响的包。
- SDK 可独立语义化发布，内部包随仓库一起演进。

### 2.2 非目标

- 不引入需要专职维护的重型构建系统（如 Bazel），除非规模确有需要。
- 不把 Python 包硬塞进 JS 包管理器；两套语言各用原生工作区。
- 不在本规格里规定业务逻辑实现细节，那属于系统规格和各包自身文档。
- 不追求一次到位，允许从 MVP 子集起步（见 §16）。

## 3. 工具链决策

> **已决议**（见 §17.1）：采用下面的组合作为默认工具链。工具链是本规格里唯一有迁移成本的决策；若团队已有强约定（如偏好 Nx 或 Bazel），在动手前替换 §3.1 即可，其余章节的边界与发布规则基本不变。

### 3.1 推荐组合

| 关注点 | 选型 | 理由 | 备选 |
| --- | --- | --- | --- |
| JS/TS 包管理 | pnpm workspaces | 严格的依赖隔离（symlink + 内容寻址），原生 workspace 协议 | npm/yarn workspaces |
| JS/TS 任务编排 | Turborepo | 受影响包构建 + 本地/远端缓存，配置轻 | Nx（更重、插件生态强）|
| TS 版本与发布 | Changesets | 多包语义化版本、自动 changelog，适合发布 SDK | semantic-release |
| Python 包/工作区 | uv | 极快，原生 workspace 与 lock，替代 pip/poetry | Poetry、Rye |
| Python 质量 | Ruff + pytest + mypy | 单一工具覆盖 lint/format，类型与测试标准化 | flake8 + black |
| TS 质量 | ESLint + Prettier + tsc | 行业标准，类型即文档 | Biome（更快，生态较新）|
| 契约与代码生成 | OpenAPI + JSON Schema → 多语言 codegen | 契约单一真相源，TS/Python 客户端生成而非手写 | tRPC（仅 TS，不满足 Python）|
| 容器与本地依赖 | Docker Compose | 一键拉起 Postgres+pgvector、对象存储 | Podman、Tilt |

### 3.2 运行时与版本基线

- Node.js：固定 LTS（建议 22.x），用 `.nvmrc` 与 `package.json` 的 `engines` 双重声明。
- pnpm：固定主版本，用 `packageManager` 字段锁定，CI 用 corepack 启用。
- TypeScript：5.x，全仓统一一个版本，由根 `devDependencies` 提供。
- Python：3.12+（与系统规格 §8 的实现基线一致），由 `.python-version` 固定。
- 模块系统：TS 包统一 ESM（`"type": "module"`）。

## 4. 目录结构

```text
gotomemory/
├── apps/                      # 可部署单元（有自己的生命周期与镜像）
│   ├── gateway/               # Memory Gateway API（系统规格 §7.1）
│   ├── mcp-server/            # MCP Server（系统规格 §16.1）
│   ├── cli/                   # gotomemory CLI，亦作 skill 底层（系统规格 §16.5）
│   ├── console/               # 统一 Web：主站入口、用户控制台、分享页管理与 /p/{slug} 展示
│   └── extension/             # 浏览器扩展（系统规格 §16.2）
├── packages/                  # 内部 TS 库（除 sdk-ts 外均不发布）
│   ├── contracts/             # OpenAPI + JSON Schema：API/数据/策略契约的单一真相源
│   ├── core/                  # 领域模型、Orchestrator、检索、压缩、冲突/刷新（§7.2/§14/§15）
│   ├── policy/                # Policy Engine：策略求值算法与决策契约（§8.3/§8.4）
│   ├── adapters/              # chatgpt/claude/gemini 适配器与能力清单（§7.3）
│   ├── db/                    # schema、迁移、仓储层（§8）
│   ├── crypto/                # envelope 加密、密钥管理、脱敏（§13.1/§13.3）
│   ├── audit/                 # 审计写入与哈希链（§7.6/§8.6）
│   ├── pages/                 # 共享页面领域逻辑：存储、元数据、权限、TTL（不做前端渲染）
│   ├── sdk-ts/                # TypeScript SDK（对外发布，§16.3）
│   ├── config-ts/            # 共享 tsconfig / eslint / prettier 预设
│   └── testing/               # 共享测试工具与 fixtures
├── py/                        # Python 工作区（uv workspace 根）
│   └── sdk/                   # Python SDK（对外发布，§16.3）
├── infra/                     # docker-compose、IaC、迁移运行器
├── specs/                     # 规格文档（本目录）
├── tooling/                   # 仓库级脚本、codegen、lint 配置
├── package.json               # 根：workspace、根脚本、devtool
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
└── .changeset/
```

分层语义：

- `apps/*` 是**可部署单元**，可以有 Dockerfile，依赖 `packages/*`，彼此之间**不互相依赖**。
- `packages/*` 是**库**，被 apps 或其他 packages 复用；除 `sdk-ts` 外都标记为私有不发布。
- `py/*` 是独立的 Python 工作区，只承载 Python 侧产物（当前是 SDK），通过生成的客户端消费同一份契约。
- 单一可部署进程可以聚合多个 package（如 gateway 进程内含 orchestrator/policy/core）；系统规格把 Gateway 与 Orchestrator 画成两层是**逻辑分层**，代码上先合后分，拆分时只需把 `core` 暴露为独立服务。

## 5. 包命名与依赖边界

### 5.1 命名

- npm 包统一 scope：`@gotomemory/<name>`（如 `@gotomemory/core`、`@gotomemory/sdk`）。
- PyPI 包：`gotomemory`（SDK），后续 Python 产物用 `gotomemory-<name>`。
- 目录名与包名后缀一致，避免「目录叫 sdk-ts、包叫别的」这种错位。

### 5.2 依赖方向（强约束）

依赖必须单向流动，越靠近存储/密钥的包越底层：

```text
apps/*  ──►  sdk-ts / core / adapters / ...   （apps 只依赖 packages，反向禁止）
core    ──►  contracts, db, crypto, audit, policy
adapters──►  contracts, core(只读 context 接口)        ──╳► db, crypto（禁止）
policy  ──►  contracts                                  ──╳► db（求值不直接读存储）
sdk-ts  ──►  contracts(仅生成类型)                       ──╳► core, db, crypto（禁止）
cli / console / extension ──► sdk-ts                    ──╳► core, db, crypto（禁止）
contracts ──► （不依赖任何内部包，是叶子真相源）
```

把这些规则映射回系统规格的安全边界，正是本规格的核心价值：

- **适配器拿不到未脱敏正文**：`adapters` 不得依赖 `db`/`crypto`，只能消费 `core` 返回的、已经过策略过滤与脱敏的 Memory Context（对应系统规格 §7.3、§11「解密前策略过滤」）。
- **SDK 不含服务端逻辑与密钥**：`sdk-ts`/Python SDK 只依赖生成的契约类型，绝不打包 `core`/`crypto`，杜绝把加密密钥或策略绕过逻辑泄进客户端。
- **前端与 CLI 零特权**：`console`/`extension`/`cli` 只经 SDK 走 Gateway，不能直连存储，呼应系统规格「适配器必须通过 Gateway 进入系统」。CLI 作为 skill 底层时同样如此——skill 经 CLI 访问记忆，策略、审计与脱敏一个都不少（系统规格 §16.5）。
- **契约是叶子**：`contracts` 不依赖任何内部包，所有人依赖它，保证改契约时编译期就能暴露所有受影响消费方。

### 5.3 边界的机器校验

口头约定会腐烂，必须用工具拦住：

- 用 `dependency-cruiser`（或 `eslint-plugin-boundaries`）声明上述规则，违反即 CI 失败。
- 生成的类型目录（见 §6）标记为只读，提交即拒。
- 规则文件放在 `tooling/`，作为 §5.2 的可执行版本。

## 6. 契约优先与代码生成

`packages/contracts` 是 API（系统规格 §9）、数据模型（§8）、策略决策契约（§8.4）和适配器能力清单（§7.3）的**单一真相源**，以 OpenAPI 3.1 + JSON Schema 表达。

流程：

1. 在 `contracts` 手写/维护 OpenAPI 与 JSON Schema。
2. codegen 生成：
   - TS 类型与客户端 → `packages/sdk-ts`（如用 `openapi-typescript` + 轻量 fetch 客户端）。
   - Python 客户端 → `py/sdk`（如 `openapi-python-client` 或 `datamodel-code-generator`）。
   - 服务端请求/响应类型 → `core`/`gateway` 复用同一份类型，避免手抄。
3. 生成产物提交进仓库但**禁止手改**（CI 校验「生成是否最新」：重新生成后 `git diff` 必须为空）。

收益：契约一改，TS 和 Python 两侧客户端、服务端类型同时更新；系统规格里强调的「适配器语义稳定」「搜索不返回 content」等约束可在 schema 层就钉死（如响应 schema 不含 `content` 字段）。

## 7. TypeScript 工程规范

- 根 `tsconfig.base.json` 提供 `strict: true`、`moduleResolution: "bundler"`/`"nodenext"`、统一 target；各包 `extends` 它。
- 使用 **TypeScript project references**，让 `tsc -b` 增量编译并强制包间依赖与 §5.2 一致。
- 每个包 `package.json` 用 `exports` 字段声明入口，内部互相引用走 `workspace:*` 协议。
- 统一 ESM；产物用 `tsc` 或 `tsup` 打包，库包导出 `.d.ts`。
- ESLint（typescript-eslint）+ Prettier，配置从 `@gotomemory/config-ts` 继承，单一来源。
- 测试用 Vitest，统一在 `test` 脚本下。

## 8. Python 工程规范

`py/` 是一个 uv workspace。根 `py/pyproject.toml`：

```toml
[tool.uv.workspace]
members = ["sdk"]

[tool.uv.sources]
# 工作区内部互引用示例（当前只有 sdk，后续扩展时按需添加）
# gotomemory-core = { workspace = true }
```

成员包（如 `py/sdk/pyproject.toml`）规范：

- 构建后端用 `uv_build`（`requires = ["uv_build>=0.11,<0.12"]`）。
- `requires-python = ">=3.12"`，与系统规格实现基线一致。
- 质量工具：Ruff（lint + format）、mypy（类型）、pytest（测试），配置集中在根 `pyproject.toml` 的 `[tool.*]`。
- 依赖锁定用 `uv.lock`（提交进仓库）。
- Python SDK 的可执行接口与 TS SDK 对齐（系统规格 §16.3 的 `create/search/read/context.build/policies.update`），由共享契约保证语义一致。

Python 与 JS 工作区**物理隔离、逻辑对齐**：不共享包管理器，但共享 `contracts` 的生成产物与同一套 API 语义。

## 9. 任务编排（Turborepo）

根 `turbo.json` 使用 Turborepo 2.x 的 `tasks` 键（注意：旧版叫 `pipeline`，已弃用）：

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "inputs": ["src/**", "package.json", "tsconfig.json"],
      "outputs": ["dist/**"]
    },
    "lint": {},
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    },
    "codegen": {
      "inputs": ["openapi/**", "schemas/**"],
      "outputs": ["generated/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

约定：

- `^build` 表示先构建上游依赖；`dependsOn` 用于让 typecheck/test 等待依赖产物。
- 每个任务显式声明 `outputs`，否则不缓存（Turborepo v1.7+ 起不再隐式缓存 dist）。
- `dev` 标记 `persistent: true` 且不缓存，避免长驻进程被当作可依赖任务造成死锁。
- Python 任务由 uv/Ruff/pytest 自行执行；可在根 `package.json` 暴露 `py:lint`、`py:test` 脚本，由 turbo `exec` 或 Makefile 统一入口，但缓存键由 uv 负责。

## 10. 版本与发布

| 产物 | 是否发布 | 版本策略 |
| --- | --- | --- |
| `@gotomemory/sdk`（TS） | 是（npm） | Changesets，语义化版本，自动 changelog |
| `gotomemory`（Python SDK） | 是（PyPI） | 语义化版本，与 TS SDK 主版本对齐 |
| `@gotomemory/cli` | 是（npm，全局安装提供 `gotomemory` 命令） | Changesets，语义化版本；CLI 的 `--json`/退出码契约视为对外接口，破坏性变更需主版本 |
| `apps/*`（cli 之外） | 否（部署，不发包） | 跟随 git tag / 镜像 tag |
| 其他 `packages/*` | 否（`"private": true`） | 随仓库演进，无独立版本 |

规则：

- 改动会影响公开 SDK 行为的 PR，必须附带 changeset（CI 校验存在性）。
- 适配器能力清单（系统规格 §7.3 的 `api_family`/`payload_strategy`/`memory_authority` 等）变更视为**契约级变更**：平台 API 变化时新增 adapter 版本，不静默改既有版本，并在 changeset 中记录。这把系统规格 §7.3 的「新增 adapter 版本而非静默改语义」固化为发布纪律。
- 两个 SDK 的对外语义必须同步发布，避免一语言领先另一语言导致契约漂移。

## 11. 本地开发环境

`infra/docker-compose.yml` 提供系统规格 §7.4 的存储依赖：

- PostgreSQL + pgvector：主数据、权限、审计、向量索引。
- S3 兼容对象存储（如 MinIO）：加密内容与导入归档。

约定：

- 一条命令拉起依赖（如 `pnpm dev:infra`），再 `pnpm dev` 启动应用。
- 迁移由 `packages/db` 管理，提供 `db:migrate`/`db:reset` 脚本。
- 配置走环境变量 + `.env.example`（提交模板，不提交真实密钥）；密钥相关变量遵守系统规格 §13 的最小暴露原则。
- 本地优先模式（系统规格 §16.4）作为同一套 `core` 的可替换存储后端（SQLite + 本地向量库），不另起仓库。

## 12. CI/CD

- 用 `turbo run build lint typecheck test --filter=...[origin/main]` 只跑受 PR 影响的 TS 包。
- Python 侧在独立 job 跑 `uv sync` + `ruff check` + `mypy` + `pytest`。
- 必过门禁：lint、typecheck、test、契约「生成最新」校验、依赖边界校验（§5.3）、changeset 校验（§10）。
- 发布流水线：合并到主分支后，Changesets 汇总版本并发布 TS SDK；Python SDK 走对应发布步骤。
- 远端缓存（Turborepo Remote Cache）可选接入，加速 CI 与本地。

## 13. 代码质量与协作约定

- 提交信息用 Conventional Commits，便于 changelog 与自动化。
- Git hooks（如 lefthook/husky）在 pre-commit 跑受影响文件的 lint/format，pre-push 跑 typecheck。
- 所有包必须有 README，说明职责、对外接口、依赖边界（与 §5.2 对齐）。
- PR 模板要求：关联系统规格章节、是否含 changeset、是否改动契约。

## 14. 安全与边界落地（与系统规格对齐）

monorepo 的包边界是系统规格安全模型的第一道执行层：

- **隐私分级**：`crypto` 集中 envelope 加密与脱敏；`content`/完整 `summary` 永不离开 `core`/`crypto` 的处理边界进入 `adapters` 或 SDK。
- **权限分离**：`policy` 独立成包，`read`/`inject`/`export` 的求值集中一处，杜绝某个 app 私自放宽（系统规格 §8.3）。
- **审计不可绕过**：`audit` 是 append-only 写入的唯一入口，apps 不直接写审计表。
- **日志边界**：共享 logger 预设默认脱敏，禁止打印正文、完整摘要、embedding 原文与 `conversation_excerpt`（系统规格 §18）。
- **生成产物即契约**：搜索响应等 schema 在 `contracts` 层就不含 `content` 字段，使「搜索不泄漏正文」成为类型级保证而非运行时约定。

## 15. 测试策略

- 单元测试：随包就近（Vitest / pytest）。
- 契约测试：针对 `contracts`，校验示例请求/响应符合 schema，且生成的客户端能往返。
- 集成测试：`gateway` + `db` + `policy` 跑真实 Postgres（docker-compose 起的实例），覆盖策略求值、刷新、删除两阶段等系统规格关键不变量（§8.3/§14/§9.5）。
- 跨语言一致性测试：同一组用例分别用 TS SDK 与 Python SDK 调 Gateway，断言行为一致。
- 共享 fixtures 放 `packages/testing`，避免各包重复造数据。

## 16. 落地步骤（MVP 子集）

不必一次铺满，按系统规格 §19 的 MVP 优先级，scaffolding 顺序建议：

1. 仓库骨架：pnpm workspace、turbo、tsconfig.base、config-ts、changeset、依赖边界校验。
2. `contracts`：先定 §9 的核心端点与 §8 的数据模型 schema，打通 codegen。
3. `db` + `crypto` + `core` + `policy`：跑通写入/检索/策略决策的最小闭环。
4. `gateway` + `sdk-ts`：暴露 `create`/`search`/`read`/`context.build`，配 docker-compose。
5. `cli`：基于 sdk-ts 的薄客户端，落实 `--json`/退出码/`--no-input` 契约，立刻可作 skill 底层（系统规格 §16.5）。
6. `adapters`：ChatGPT/Claude/Gemini 的 payload 策略与能力清单。
7. `mcp-server`：以受控工具暴露记忆访问（系统规格 §19.1）。
8. `py/sdk`：从同一契约生成，补齐跨语言一致性测试。
9. `console`、`extension`：放到 SDK 稳定之后（系统规格暂不在 MVP）。

## 17. 设计决策（决议记录）

以下决议确定本规格的默认实现路线。每条给出**决策 + 理由 + 触发条件/边界**；标注「可重新评估」的项指明了将来推翻该决策的具体信号，避免决议变成无法回头的教条。

### 17.1 工具链：采用 pnpm + Turborepo + Changesets + uv

**决策**：采用 §3.1 的推荐组合，不引入 Nx 或 Bazel。

**理由**：仓库全新、无历史包袱；当前规模是 2 种语言、约十余个包，Turborepo 的受影响构建 + 缓存已足够，Nx 的插件/代码生成器生态在此规模收益不明显，Bazel 的密封构建带来的复杂度远超当前收益。

**可重新评估**：当出现 ≥3 种语言或大量需要脚手架的同构包时，重估 Nx；当合规要求 bit-for-bit 可复现/密封构建，或构建图大到本地缓存失效频繁时，重估 Bazel。替换只动 §3.1，§5（边界）与 §10（发布）规则不变。

### 17.2 Gateway 与 Orchestrator：MVP 单进程，按触发条件再拆

**决策**：MVP 中 `gateway` 进程内聚合 `core`/`policy`/`orchestrator`，作为单一可部署单元；但通过包边界（`core` 已可独立）和内部接口隔离，使「拆分」是一次部署变更而非重写。

**理由**：过早拆成多服务会带来网络跳数、分布式事务和运维成本，而 MVP 的瓶颈尚未出现。包边界已经预留了拆分缝。

**拆分触发条件**（满足任一即拆 `core` 为独立服务）：

- 检索/embedding 的 CPU 密集负载需要与 Gateway 的 API I/O **独立扩缩容**。
- 需要把解密与 `secret` 处理从公网边缘隔离成**更强信任边界**（对应系统规格 §13）。
- Orchestrator 的延迟或 CPU 占用开始**拖累 Gateway** 的请求处理。
- 多区域/多边缘 Gateway 需要**共享同一个 Orchestrator**。

### 17.3 Python 产物范围：暂时只做 SDK

**决策**：Python 侧当前只承载 SDK；服务端（`core`/`gateway` 等）全部用 TypeScript。

**理由**：保持请求热路径单语言，降低运维与一致性成本。embedding/向量化优先调用托管 API（系统规格 §7.4 允许声明外部向量/embedding 供应商），无需为此起 Python 服务。

**边界**：仅当某模型必须用 Python-only 库在进程内运行时，才在 `py/` 下新增 uv workspace 成员服务（自带 Dockerfile、消费同一份 `contracts`）。除非有充分理由，这类服务不进入同步请求热路径，以异步任务或旁路服务形式存在。

### 17.4 远端缓存：起步本地，按需自托管

**决策**：起步只用 Turborepo 本地缓存；当 CI 构建时长或 CI/开发者间的重复构建成为痛点时，再接入远端缓存。

**理由**：当前规模本地缓存收益已足，远端缓存引入额外基础设施与数据边界考量。

**托管选择**：接入时优先**自托管**开源 remote-cache（部署在团队自有基础设施/对象存储），而非第三方托管服务，使构建产物留在团队信任与数据边界内（呼应系统规格的数据驻留立场）。缓存键必须排除含密钥的环境变量，缓存内容仅限构建产物。

### 17.5 契约代码生成：openapi-typescript + openapi-python-client

**决策**：

- **TS**：用 `openapi-typescript` 生成类型，配 `openapi-fetch` 作为 `sdk-ts` 的类型化运行时客户端（零运行时开销，类型直接来自契约）。
- **Python**：用 `openapi-python-client` 生成基于 httpx 的类型化客户端（dataclass + 类型注解），与 TS SDK 的调用体验对齐。
- **备选**：若将来需要更重的客户端能力（内置校验器、多目标 SDK），评估 `hey-api/openapi-ts`（TS）。

**自定义模板/后处理**：仅作兜底，用于在类型层强制系统规格约束——例如保证搜索响应类型**永不包含** `content`、决策对象不含正文与 embedding 原文。首选把 `contracts` 的 schema 写正确让约束自然成立；生成产物提交进仓库，并由 §6 的「重新生成后 `git diff` 为空」CI 校验守住。

### 17.6 浏览器扩展构建：WXT（基于 Vite）

**决策**：`apps/extension` 用 WXT 构建。

**理由**：WXT 原生处理 MV3 manifest、文件式 entrypoints、HMR，并跨浏览器（Chrome/Firefox/Edge/Safari），覆盖系统规格 §16.2 的 ChatGPT/Claude/Gemini Web 场景，省去自己拼装打包链。

**与 turbo 协同**：WXT 的 `build`/`dev` 就是 `apps/extension` 的 `build`/`dev` 任务；把 WXT 输出目录（`.output/**`）声明为 turbo `outputs` 以启用缓存，`dev` 标记 `persistent: true` 且不缓存。扩展仅依赖 `sdk-ts`，遵守 §5.2 的零特权前端边界。
