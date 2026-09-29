# dsh-paper-gogo-plugin

[![dsh-plugin](https://img.shields.io/badge/topic-dsh--plugin-0969da)](https://github.com/topics/dsh-plugin)
[![deepseek-harness](https://img.shields.io/badge/DeepSeek%20Harness-plugin-0969da)](https://github.com/deepseek-ai/deepseek-harness)
[![license: MIT](https://img.shields.io/badge/license-MIT-green)](package.json)

把 [Paper-gogo](https://github.com/gqallen931/paper-gogo)（审稿人倒推、证据优先的学术论文工作流）开发为 **DeepSeek Harness 插件**：工作流的 18 个 Phase、7 道质量门禁、四态证据标签与命令系统，全部变成模型可直接调用的原生工具。

**插件是自包含的** —— 它自带完整的 Paper-gogo 工作流正文与 **57 个技能**，安装即可使用，**不需要另外安装 Paper-gogo 包**。

- 纯 ESM，**运行时零依赖**，无需构建步骤
- 针对本机安装的 DSH 版本校验通过（见 [兼容性](#8-兼容性)）
- 97 项自动检查全部通过：67 项单元/行为 + 19 项真实 `ToolRuntime` 端到端 + 11 项自包含

---

## 1. 它解决什么问题

Paper-gogo 原本是一份技能包（Markdown），要单独安装才能用，而且**门禁与证据状态只存在于自然语言里**——模型可以口头说"门禁通过了"，却没有任何东西能拦住它。

这个插件把它变成可执行的能力，并且把内容一起打包：

| 原来的问题 | 插件之后 |
|---|---|
| 还要单独装一份 Paper-gogo 包，版本容易错配 | 插件自带工作流与技能，`dsh plugin add` 一步到位 |
| 工作流是 45 KB 的文档，模型要么全读要么不读 | `paper_manifest` 按需返回结构化清单，单 Phase 细节一次到位 |
| 门禁 G0-G6 只是约定 | `paper_gate` 归一化门禁输入、拒绝在 FAIL 时推进 |
| 四态证据标签容易被忽略 | `paper_evidence` 统计、阻断 MISSING、把未标注项标为 `UNLABELED` 而不是默认通过 |
| 命令系统要人工对照 | `paper_route` 把中文/英文意图映射到命令，并给出该命令的精确执行要求 |
| "每 Phase 必须写工作记录"靠自觉 | `paper_phase_log` 强制写出 `Phase{N}_{name}.md` |

---

## 2. 自带内容

插件在 `workflow/` 目录内自带全部内容，共 **57 个技能**（完整清单见 [`workflow/SKILLS_INDEX.md`](workflow/SKILLS_INDEX.md)，由脚本生成，不会与实际内容脱节）：

| 位置 | 内容 | 技能数 |
|---|---|---|
| `workflow/` | `SKILL.md`、`paper-workflow-v6.md`（18 Phase 正文）、`paper-workflow-v5.md`、`references/`（命令系统、执行路由、审稿检查表） | — |
| `workflow/skills/nature-skills/` | 检索、阅读、写作、润色、引用、数据、图表、PPT、审稿回复 | 9 |
| `workflow/skills/code-understanding/` | 代码理解、差异分析、故障诊断 | 9 |
| `workflow/skills/architecture-engineering/` | 领域建模、模块设计、TDD | 8 |
| `workflow/skills/world-model-method/` | 复杂方案比较与审查 | 1 |
| `workflow/skills/paper-framework-figure-studio-pro/` | 严格逐回合 S0-S7 论文框架图 | 1 |
| `workflow/skills/karpathy-guidelines/` | 编码护栏 | 1 |
| `workflow/skills/python-expert/` | Python 实验实现 | 1 |
| `workflow/code_assets/` | 可复用实验与项目模板 | — |
| `workflow/extras/` | 附加第三方合集：`academic-research-skills`(4)、`claude-scholar`(19)、`paper-craft-skills`(3)、`scipilot-figure-skill`(1) | 27 |

> **许可证注意**：`workflow/extras/academic-research-skills/` 是 **CC BY-NC 4.0（禁止商业使用）**，与插件本身的 MIT 不同。详见 [`workflow/extras/THIRD_PARTY_NOTICES.extras.md`](workflow/extras/THIRD_PARTY_NOTICES.extras.md)。

**为控制体积剥离的内容**：所有内置副本中的图片/PDF 等媒体资产（原 37 MB）已移除；依赖内置图片的技能（如 `paper-comic`、`paper-deck`）保真度会下降，全部指令、参考与脚本均保留。

---

## 3. 提供的工具

| 工具 | 作用 |
|---|---|
| `paper_manifest` | 返回 4 个阶段、18 个 Phase、7 道门禁 G0-G6、四态证据词表、执行标记与指令优先级。传 `phase` 得单个 Phase 的完整定义（产出、门禁、回退、阶段记录路径、子阶段优先级表） |
| `paper_doc` | 读取自带文档（`SKILL.md`、工作流、命令系统、执行路由、检查表、`SKILLS_INDEX.md`、许可证等），支持 `outline` 先看标题、`section` 只取匹配章节 |
| `paper_gate` | 评估门禁并判定能否推进。接受宽松输入（布尔 / `"pass"` / `{result}` / 中文），未提供的门禁报告为 `NOT EVALUATED` 而非默认通过，任一 FAIL 即阻断 |
| `paper_evidence` | 审计主张的证据状态。接受 Markdown 表格或 `主张 :: 状态` 行，统计四态、阻断 MISSING、把无标注项标为 `UNLABELED` |
| `paper_route` | 把自由文本意图路由到正确的斜杠命令，返回该命令的精确执行要求、所属 Phase、主技能群与固定五段输出契约 |
| `paper_phase_log` | 写出强制的 Phase 工作记录到 `docs/项目工作阶段记录/Phase{N}_{name}.md`，拒绝写到工作流根之外 |
| `paper_doctor` | 诊断安装：解析到哪个工作流根、内容是否来自自带副本、文件是否齐全、以及修复方法 |

### 调用示例

```text
paper_manifest({ phase: 7 })
  → Phase 7 实验执行：9 个子阶段与 P0/P1 优先级、产出路径、
    真实性门禁（stub 必须标 NON_EVALUABLE）、回溯决策、G4 归属

paper_gate({ phase: 8, gates: { G4: "FAIL" }, next: true })
  → recommendation: BLOCKED
    "失败门禁必须给出修复路径，不能靠润色覆盖。"

paper_evidence({ claims: "| 主张 | 状态 |\n|---|---|\n| A | SUPPORTED |\n| B | MISSING |" })
  → verdict: BLOCKED，counts.MISSING = 1

paper_route({ intent: "帮我看看创新点够不够" })
  → /检查创新 · Phase 4 · world-model-method

paper_doc({ doc: "workflow", section: "全局规则" })
  → 只返回 7 条全局规则，而不是 45 KB 全文

paper_doctor({})
  → usable: true，内容来源：插件自带（无需外部 Paper-gogo 包）
```

---

## 4. 安装

### 方式 A：作为组合包安装进 profile（推荐）

本目录是一个合法的 DSH 组合包：`package.json` 声明了 `dsh.bundle`，`cordis.patch.yml` 是它贡献的配置层。

```powershell
dsh plugin --profile desktop add D:\Skills\paper-gogo-plugin
dsh --profile desktop --dump-config   # 应能看到 "# == dsh-paper-gogo-plugin" 层
```

也可以先打包再安装，避免任何构建授权：

```powershell
dsh plugin --profile desktop add .\dsh-paper-gogo-plugin-0.1.0.tgz
```

移除：

```powershell
dsh plugin --profile desktop remove dsh-paper-gogo-plugin
```

### 方式 B：用 `--patch` overlay 本地加载（改代码即生效）

```powershell
pnpm dsh web --patch D:\Skills\paper-gogo-plugin\examples\paper-gogo.patch.yml
```

overlay 只贡献配置，不改变 loader 解析模块路径时使用的 profile 目录，因此这种方式最适合开发调试。

### 安装后自检

在会话里让模型调用一次 `paper_doctor`。它应当报告 `usable: true`、`内容来源：插件自带`。若为 `false`，按它输出的修复方法处理。

### ⚠️ Windows 用户：先开长路径支持

从 GitHub 克隆本插件时，**默认的 Windows 路径长度限制（260 字符）会导致检出失败**。内置的框架图技能里有很长的文件名，例如：

```text
workflow/skills/paper-framework-figure-studio-pro/assets/vector-library/iclr_reference_library/paper_derived_icon_refinement/cut_svg/paper.derived.architecture.privacy.secure.aggregation.paper_derived_outline.v1.svg
```

该相对路径本身就有 215 字符，一旦克隆到稍深的目录就会超过上限。症状是仓库克隆成功但检出失败，报 `Filename too long`，并且插件目录里缺少文件。

三种解决办法，任选其一：

```powershell
# 1) 单次克隆时开启（最快）
git -c core.longpaths=true clone https://github.com/gqallen931/paper-gogo-plugin.git

# 2) 永久为本机 git 开启
git config --global core.longpaths true
```

```powershell
# 3) 系统级开启（需管理员 PowerShell，一次即可，随后所有程序都受益）
New-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem' `
  -Name LongPathsEnabled -Value 1 -PropertyType DWORD -Force
```

> 说明：`core.longpaths` 是本地配置，**在克隆过程中尚未生效**，因此 `git config --global core.longpaths true` 必须在克隆**之前**执行；否则请用第 1 种的一次性写法。安装本插件（`dsh plugin add`）走的是 pnpm 链接或本地目录，不经 `git clone`，不受此影响。

同样的限制也适用于 Paper-gogo 包中 `paper-framework-figure-studio-pro/assets/` 下的全部资源。

---

## 5. 配置

插件**开箱即用，无需任何配置**。以下项仅在需要覆盖默认行为时才设置，写在 profile 的 `cordis.patch.yml` 中：

```yaml
- id: paper-gogo
  name: dsh-paper-gogo-plugin
  config:
    preferBundled: true                  # 默认 true：使用插件自带的工作流副本
    root: null                           # 仅当 preferBundled 为 false 时使用
    searchRoots: []
    journalDir: docs/项目工作阶段记录     # 阶段记录目录
```

| 配置项 | 默认值 | 说明 |
|---|---|---|
| `preferBundled` | `true` | 使用插件自带的内容；设为 `false` 则优先使用外部 Paper-gogo 包 |
| `root` | `null` | 外部工作流包的绝对路径（仅 `preferBundled: false` 时生效） |
| `searchRoots` | `[]` | 外部包的兜底候选路径 |
| `journalDir` | `docs/项目工作阶段记录` | `paper_phase_log` 的写入目录 |

### 工作流根如何解析

`preferBundled` 为 `true`（默认）时，直接用插件自带的 `workflow/`。

设为 `false` 时按以下顺序：配置 `root` → 环境变量 `DSH_PAPER_GOGO_ROOT` → 从会话工作目录向上搜索 → `searchRoots`。

一个目录被认定为工作流根，必须同时存在 `SKILL.md`、`paper-workflow-v6.md` 与 `references/`。

---

## 6. 项目结构

```text
paper-gogo-plugin/
├── package.json                   # 组合包 manifest（dsh.bundle）+ devDependencies
├── cordis.patch.yml               # 安装为组合包时贡献的配置层
├── examples/
│   └── paper-gogo.patch.yml       # 本地 --patch overlay
├── src/
│   ├── plugin.js                  # 插件入口：apply() 注册 7 个工具
│   ├── data/
│   │   ├── phases.js              # 18 Phase / 4 阶段 / 7 门禁 / 证据词表 / 执行标记
│   │   └── commands.js            # 命令目录 + 意图关键词
│   └── lib/
│       ├── root.js                # 工作流根解析（自带优先）与巡检
│       ├── routing.js             # 意图 → 命令 → Phase → 技能 路由
│       ├── gates.js               # 门禁归一化/评估、证据审计、Phase 排序
│       └── render.js              # 规范值 → Markdown 渲染器
├── workflow/                      # 自带的工作流与技能（57 个技能）
│   ├── SKILL.md                   # 工作流入口
│   ├── paper-workflow-v6.md       # 18 Phase 正文
│   ├── references/                # 命令系统、执行路由、审稿检查表
│   ├── skills/                    # 7 个技能组
│   ├── extras/                    # 附加第三方合集（许可证不同）
│   └── SKILLS_INDEX.md            # 自动生成的技能清单
├── scripts/
│   └── build-skills-index.mjs     # 重新生成 SKILLS_INDEX.md
└── test/
    ├── run-tests.mjs              # 67 项单元与行为测试
    ├── verify-against-dsh-tools.mjs  # 19 项真实 ToolRuntime 端到端验证
    └── check-bundle.mjs           # 11 项自包含检查
```

### 模块契约

- **规范值（canonical value）** 是纯 JSON，传给 `output.schema` 校验；**渲染器（render）** 是纯函数，把规范值转成模型可见的 Markdown 文本块。两者分离，UI 卡片与程序化调用都能复用规范值。
- `src/lib/*` 除 `root.js` 的读取函数外全部是无副作用纯函数，因此可以直接单元测试。

---

## 7. 开发与测试

```powershell
cd D:\Skills\paper-gogo-plugin
pnpm install            # 只装 devDependencies（cordis + dsh-tools + yaml）
npm test                # 67 项单元与行为测试
npm run verify          # 19 项真实 ToolRuntime 端到端验证
npm run check:bundle    # 11 项自包含检查（模拟无外部包的机器）
npm run build:index     # 重新生成 workflow/SKILLS_INDEX.md
```

`verify` 会实例化真实的 Cordis `Context` 与真实的 `ToolRuntime`，把插件加载进去，然后**通过真实注册表流水线派发调用**，覆盖：参数校验 → `execute()` → 规范值校验 → `render()` → 内容块，以及 `UNKNOWN_TOOL`、参数类型错误、缺必填参数、枚举非法、业务校验失败等错误路径。

`check:bundle` 会把工作目录切到一个空临时目录、清空所有环境变量，验证插件仍然解析到自带内容并且每个工具都返回真实结果——这就是"无需外部 Paper-gogo 包"的证据。

### 已验证的 DSH 行为（写代码时的坑）

这几条是实测出来的，不是文档写的：

1. **schema 不支持数组形式的 `type`。** 写 `{ type: ['integer', 'null'] }` 会让注册表把该 schema 视为不支持，规范值被拒为 `"value" must be a lossless JSON value`。可空类型必须用 `oneOf: [spec, { type: 'null' }]`。
2. **显式对象节点必须声明 `additionalProperties`。** 省略会让意图变得含糊，DSH 要求显式 `true | false`。
3. **`SKILL.md` 的 `description` 常用 YAML 块标量（`>-`）。** 解析 frontmatter 时必须处理续行，否则会得到 `>-` 这样的字面值。

三条都已固化为测试，防止回归。

---

## 8. 兼容性

| 项 | 值 |
|---|---|
| 目标 DSH | desktop `0.1.7-rc.2`（本机 `D:\DeepSeek Harness`，`DSH_PROFILE=desktop`） |
| `@deepseek-ai/dsh-tools` | `0.1.7-alpha.2`（与宿主同一次构建：Node 24.21.0） |
| `@deepseek-ai/cordis` | `~4.0.4` |
| Node | ≥ 20（宿主内置 24.21.0） |
| 运行时依赖 | 无（自带内容 + 纯 ESM） |
| 插件体积 | 约 19.7 MB（含 57 个技能与工作流正文；已剥离 37 MB 媒体资产） |
| 插件形态 | 函数式 `apply(ctx, config)`，`inject = ['tools']` |

插件只使用 `ctx.tools.register(definition)` 一个 API，不导入任何 `@deepseek-ai/*` 包，因此宿主升级时通常无需改动。`devDependencies` 仅用于类型与测试校验。

---

## 9. 许可证

插件代码本身为 **MIT**。

自带内容沿用各自上游许可证：Paper-gogo 工作流与其 7 个技能组（其中 `world-model-method` 与 `karpathy-guidelines` 为 MIT，其余待核实，见 `workflow/THIRD_PARTY_NOTICES.md`）；`workflow/extras/` 下的 4 个附加合集许可证各不相同，**其中 `academic-research-skills` 为 CC BY-NC 4.0，禁止商业使用**，详见 `workflow/extras/THIRD_PARTY_NOTICES.extras.md`。
