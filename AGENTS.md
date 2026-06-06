# 智能体指令

本仓库主要存放 `compound-engineering` 编码智能体插件（**Zed 编辑器为首要目标平台**）以及用于分发的多平台市场/目录元数据。

此外还包含：
- 将插件转换为多种智能体平台格式的 Bun/TypeScript CLI
- `plugins/` 下的其他插件，例如 `coding-tutor`
- CLI、市场和插件的共享发布与元数据基础设施

`AGENTS.md` 是仓库的权威指令文件。根目录的 `CLAUDE.md` 仅作为兼容性垫片，供仍会查找它的工具和转换使用。

## Zed 平台约束（当前首要目标）

本仓库当前以 Zed 编辑器作为核心适配目标，以下约束优先级高于其他平台的通用规则：

- **安装根**：Zed 技能树安装在 `.agents/skills/`，不在 `plugins/` 下。
- **前置元数据**：Zed SKILL.md 必须包含 `target: zed` 前置字段。
- **Agent Prompt**：Zed 下 agent prompt 直接内联于 SKILL.md，不通过外部 prompt 文件分发。
- **执行原语**：Zed 使用 `spawn_agent` 执行子代理，技能编排应围绕此原语设计。
- **目录预算**：单个 Zed skill 目录（含 references/）建议控制在 50KB 以内，避免超出 Zed 加载预算。
- **验证方式**：Zed skill 以"手动复制到 `.agents/skills/` + Zed 目录完整性检查"为主要验收手段，不依赖 `release:validate` 作为最终验证。
- **v1 范围外**：当前阶段不新增 `convert --to zed`、不修改 `src/targets/index.ts` 或现有 converter/writer、不做 38 技能全覆盖和 CI 自动化。

> 详细 Zed 适配规范参见 `docs/specs/zed.md`。

## 快速开始

```bash
bun install
bun test                  # 完整测试套件
bun run release:validate  # 检查插件/市场一致性
```

## 工作约定

- **分支：** 任何非琐碎的更改都应创建功能分支。如果已经在该任务的正确分支上，请继续使用它；除非明确要求，否则不要创建额外的分支或 worktree。
- **合并策略：** 对 `main` 的所有更改都通过 PR 进行。不允许直接推送和直接合并；`main` 上的分支保护通过要求 `test` 状态检查通过来强制执行。直接路径会绕过 `release:validate`、测试套件和 PR 标题验证——过去的直接合并曾导致版本漂移，需要多 PR 恢复（参见 `docs/solutions/workflow/release-please-version-drift-recovery.md`）。
- **安全性：** 不要删除或覆盖用户数据。避免破坏性命令。
- **测试：** 在更改影响解析、转换或输出后运行 `bun test`。
- **版本管理：** 发布由发布自动化准备，而非正常的功能 PR。仓库现在有多个发布组件（`cli`、`compound-engineering`、`coding-tutor`、`marketplace`）。GitHub 发布 PR 和 GitHub Releases 是新版本发布说明的权威表面；根目录 `CHANGELOG.md` 只是指向该历史的指针。使用 `feat:` 和 `fix:` 等惯用标题，以便发布自动化能分类变更意图，但在日常 PR 中不要手动调整发布拥有的版本，也不要手动编写发布说明。
- **关联版本（cli + compound-engineering）：** `linked-versions` release-please 插件保持 `cli` 和 `compound-engineering` 版本一致。这是有意设计的——它简化了 CLI 及其 shipped 插件的版本跟踪。一个后果是：只有插件更改的发布仍然会提升 CLI 版本（反之亦然）。当强制同步提升时，`linked-versions` 会覆盖 `exclude-paths` 的正常排除逻辑，因此 CLI changelog 可能包含通常会被过滤的提交。这是已知的 upstream release-please 限制，不是配置错误。不要将关联版本提升标记为不必要。
- **输出路径：**
  - **Zed（首要平台）**：技能树安装在 `<root>/skills/<name>/`，其中 `<root>` 为项目本地 `.agents` 或用户级 Zed 配置目录。SKILL.md 及 references/ 必须自包含在同一目录下，禁止跨目录引用。
  - **OpenCode（其他平台）**：输出保持在 `opencode.json` 和 `.opencode/{agents,skills,plugins}`。命令位于 `~/.config/opencode/commands/<name>.md`；`opencode.json` 是深度合并的（绝不整体覆盖）。
  - **通用规则**：转换器生产的平台输出必须严格匹配目标平台的目录布局和合并语义，不得混用平台路径约定。
- **临时空间：** 默认使用操作系统临时目录。仅在明确符合以下规则时使用 `.context/`。
  - **默认：操作系统临时目录**——涵盖大多数临时文件，包括每次运行丢弃型和跨调用可复用型，无论是否存在仓库，也无论其他技能是否会读取这些文件。稳定的 OS-temp 前缀能同等支持跨技能和跨调用协调；与仓库相邻通常不是相关属性。
    - **每次运行丢弃型**：`mktemp -d -t <prefix>-XXXXXX`（操作系统处理清理）。用于消费一次即丢弃的文件——捕获的屏幕截图、拼接的 GIF、中间构建产物、录制、委派提示词/结果、单运行检查点。生成的路径是不透明的（在 macOS 上解析为 `$TMPDIR`/`/var/folders/...`）——这对于用户不打算访问的丢弃文件是合适的。
    - **跨调用可复用型**：稳定路径 `/tmp/compound-engineering/<skill-name>/<run-id>/`——**不是** `mktemp -d`——以便同一技能的后续调用可以发现同级的 run-id。直接使用 `/tmp` 而非 `$TMPDIR`，这样路径保持可访问：macOS 上的 `$TMPDIR` 解析为 `/var/folders/64/.../T/`，对想要检查检查点、grep 或复制出来的用户不友好。`$TMPDIR` 提供的每用户隔离对于跨调用可复用的临时空间（用户是目标受众）没有价值。用于按会话命名的缓存、在松散会话中上下文压缩期间保留的检查点，或同一技能后续运行需要定位先前产出的任何状态。**跨平台说明：** `/tmp` 在 macOS（符号链接到 `/private/tmp`）、Linux 和 WSL 上可写。`mktemp -d -t <prefix>-XXXXXX` 在三种系统上都有效。此处编写的技能假定类 Unix shell；原生 Windows 不是当前目标。
  - **例外：`.context/`** — 仅在产物真正绑定到当前工作目录仓库且至少满足以下条件之一时使用：
    - (a) **用户策划**：用户预期在技能之外检查、操作或手动策展该产物（例如，每个仓库的 TODO 数据库、跨会话保留的每个规格优化日志）。
    - (b) **仓库+分支不可分离**：产物的含义无法脱离此特定仓库或分支（例如，用户期望在同一 checkout 中恢复的特定分支恢复状态）。
    - (c) **路径是核心 UX**：向用户返回产物路径是技能输出的核心部分，且该路径作为仓库相对位置比 OS-temp 路径更容易传达。
    在 `.context/compound-engineering/<workflow-or-skill-name>/` 下命名空间，当并发运行合理时添加每个运行的子目录，并根据产物的生命周期决定清理行为（每次运行临时空间在成功时清除；用户策划状态持久保留）。"技能之间共享"本身不足以成为理由——OS temp 能同样好地处理。
  - **持久输出**（计划、规格、学习成果、文档、最终交付物）属于 `docs/` 或其他仓库跟踪位置，不属于上述任一临时层级。
- **字符编码：**
  - **标识符**（文件名、智能体名称、命令名称）：仅 ASCII——转换器和正则模式依赖它。
  - **Markdown 表格：** 使用管道分隔（`| col | col |`），切勿使用框线字符。
  - **散文和技能内容：** Unicode 可以（emoji、标点等）。在代码块和终端示例中优先使用 ASCII 箭头（`->`、`<-`）而非 Unicode 箭头。

## 目录布局

```
src/              CLI 入口点、解析器、转换器、目标写入器
plugins/          插件工作区（compound-engineering、coding-tutor）
.claude-plugin/   Claude 市场目录元数据
tests/            转换器、写入器和 CLI 测试 + 固定装置
docs/             需求、计划、解决方案和目标规格
CONCEPTS.md       共享领域词汇（项目特定术语的词汇表）
```

## 仓库表面

本仓库的更改可能影响以下一个或多个表面：

- `plugins/compound-engineering/` 下的 `compound-engineering`
- `.claude-plugin/` 下的 Claude 市场目录
- `src/` 和 `package.json` 中的转换器/安装 CLI
- 其他插件，如 `plugins/coding-tutor/`

不要假设仓库更改"只是 CLI"或"只是插件"，而不检查哪些表面拥有受影响的文件。

## 插件维护

在更改 `plugins/compound-engineering/` 内容时：

- 当插件行为、清单或用法发生实质性变化时，更新 `plugins/compound-engineering/README.md` 等文档。
- 不要手动提升插件或市场清单中的发布拥有版本。
- 不要手动向 `CHANGELOG.md` 添加发布条目，也不将其视为新版本发布的权威来源。
- 如果智能体、命令、技能、MCP 服务器或发布拥有的描述/计数可能发生变化，请运行 `bun run release:validate`。
- 在移除技能、智能体或命令时，将其名称添加到两个清理注册表中，以便在升级时清理陈旧的扁平安装产物：
  - `src/utils/legacy-cleanup.ts` 中的 `STALE_SKILL_DIRS` / `STALE_AGENT_NAMES` / `STALE_PROMPT_FILES`
  - `src/data/plugin-legacy-artifacts.ts` 中的 `EXTRA_LEGACY_ARTIFACTS_BY_PLUGIN["compound-engineering"]`

有用的验证命令：

```bash
bun run release:validate
cat .claude-plugin/marketplace.json | jq .
cat plugins/compound-engineering/.claude-plugin/plugin.json | jq .
```

## 验证智能体和技能更改

行为更改需要与机械代码更改不同的验证路径，因为不同平台的插件加载机制存在差异。

### Zed 平台验证

- **Zed skill 启用平台中立路径前，先完成 Zed 目录完整性校验**：检查 frontmatter `target: zed`、references 目录完整性、无旧平台路径残留。
- **Zed 下通过 `spawn_agent` 实际触发试跑**：在 Zed 内手动加载 skill 并执行，确认子代理被正确触发、输出按预期落盘。
- **不依赖平台的会话缓存机制**：Zed 的 skill 加载在每次触发时读取当前源，无会话级缓存问题。

### 其他平台（Claude Code 等）验证

- **Claude Code 平台特性**：Claude Code 对插件智能体和技能定义存在会话启动缓存，编辑后需重启会话才能生效。不要编辑 `~/.claude/plugins/cache/` 或 `~/.claude/plugins/marketplaces/` 来尝试强制重新加载——这些路径是用户机器状态，存在被插件更新覆盖的风险。
- **技能脚本和 CLI 机械更改**：`bun test` 覆盖的技能脚本、解析器逻辑、转换代码始终运行当前源，不受平台缓存影响。

## 编码约定

- 在平台之间转换时，优先显式映射而非隐式魔法。
- 将目标特定的行为保留在专用的转换器/写入器中，而不是将条件分散在无关文件中。
- 保留已安装目标的稳定输出路径和合并语义；不要随意更改生成的文件位置。
- 在添加或更改目标时，与实现一起更新固定装置/测试，而不是将文档或示例视为足够的证明。

## 提交约定

- **前缀基于意图，而非文件类型。** 使用惯用前缀（`feat:`、`fix:`、`docs:`、`refactor:` 等），但按更改所做的内容分类，而非文件扩展名。`plugins/*/skills/`、`plugins/*/agents/` 和 `.claude-plugin/` 下的文件即使它们是 Markdown 或 JSON，也是产品代码。将 `docs:` 保留给唯一目的是文档的文件（`README.md`、`docs/`、`CHANGELOG.md`）。
- **类型选择——按意图分类，而非差异形状。** 在 `fix:` 和 `feat:` 都可能适用的情况下，默认使用 `fix:`：修复破坏或缺失行为的更改是 `fix:`，即使通过添加代码实现，且净增加不会将修复转变为 `feat:`。当其他惯用类型（`chore:`、`refactor:`、`docs:`、`perf:`、`test:`、`ci:`、`build:`、`style:`）更精确地描述更改时，保留它们作为主要类型。启发式方法：如果您今天可以编写的回归测试在更改之前会失败，那就是 `fix:`。用户可以针对特定更改覆盖此默认值。
- **包含组件范围。** 范围在 changelog 中逐字出现。选择最窄的有用标签：技能/智能体名称（`document-review`、`learnings-researcher`）、插件或 CLI 区域（`coding-tutor`、`cli`），或跨领域时使用共享区域（`review`、`research`、`converters`）。永远不要使用 `compound-engineering`——它是整个插件，对读者没有任何信息。仅在没有单个标签增加清晰度时才省略范围。
- **未经明确用户确认，不要使用 `!` 或 `BREAKING CHANGE:` 页脚。** 这些标记会触发 release-please 的自动主版本提升——即使用户可能不想要，即使更改在技术上是破坏性的。如果更改看起来是破坏性的，向用户说明，让他们决定是否应用该标记。

## 添加新的目标提供商

仅在目标格式稳定、有文档记录，并且有明确的工具/权限/钩子映射时才添加提供商。**Zed 编辑器是当前首要目标平台，具有最高优先级。**

> Zed 适配采取"源在 `plugins/`，`manual copy` 到 `.agents/skills/`"的 dual-tree 策略，不通过 `convert --to zed` 实现。详见 Zed 平台约束。

### 其他平台（Codex、Gemini CLI、OpenCode 等）

1. **定义目标条目**
   - 在 `src/targets/index.ts` 中添加新处理程序，在完成前设置 `implemented: false`。
   - 使用专用的写入器模块（例如 `src/targets/codex.ts`）。

2. **定义类型和映射**
   - 在 `src/types/` 下添加提供商特定类型。
   - 在 `src/converters/` 中实现转换逻辑（从 Claude → 提供商）。
   - 保持映射显式：工具、权限、钩子/事件、模型命名。

3. **连接 CLI**
   - 确保 `convert` 和 `install` 支持 `--to <provider>` 和 `--also`。
   - 写入干净的提供商根目录。

4. **测试（必需）**
   - 扩展 `tests/fixtures/sample-plugin` 中的固定装置。
   - 为 `tests/converter.test.ts` 中的映射添加规范覆盖。
   - 为新提供商输出树添加写入器测试。
   - 添加新提供商的 CLI 测试（类似于 `tests/cli.test.ts`）。

5. **文档**
   - 使用新的 `--to` 选项和输出位置更新 README。

## 技能中的智能体引用

在技能 SKILL.md 文件中引用智能体时（例如通过 `Agent` 或 `Task` 工具），使用裸 `ce-<agent-name>` 形式。`ce-` 前缀将智能体标识为 compound-engineering 组件，足以在其他插件中保持唯一性。

示例：
- `ce-learnings-researcher`（正确）
- `learnings-researcher`（错误——`ce-` 前缀是必需的；它能防止与其他插件中共享短名称的智能体冲突）

## 技能中的文件引用

每个技能目录都是一个独立的单元。SKILL.md 文件必须仅引用其自身目录树内的文件（例如 `references/`、`assets/`、`scripts/`），使用从技能根目录开始的相对路径。永远不要引用技能目录之外的文件——无论是通过相对遍历还是绝对路径。

破坏性模式：

- `../other-skill/references/schema.yaml` — 遍历到同级技能
- `/home/user/plugins/compound-engineering/skills/other-skill/file.md` — 指向其他技能的绝对路径
- `~/.claude/plugins/cache/marketplace/compound-engineering/1.0.0/skills/other-skill/file.md` — 指向已安装插件位置的绝对路径（Claude Code 平台特有）

为什么这很重要：

- **运行时解析：** 技能从用户的工作目录执行，而非技能目录。跨目录路径和绝对路径不会按预期解析。
- **不可预测的安装路径：** 从市场安装的插件缓存在版本化路径中。在源仓库中有效的绝对路径不会匹配已安装布局，且版本段在每个版本上都会更改。
- **转换器可移植性：** CLI 在转换为其他智能体平台时将每个技能目录作为独立单元复制。跨目录引用会断裂，因为同级目录未被包含在副本中。
- **Zed 路径限制：** Zed 的技能目录结构扁平化，禁止跨技能遍历引用。

如果两个技能需要相同的支持文件，请将其复制到每个技能的目录中。优先使用小而独立的引用文件，而非共享依赖。

> **注意（2026 年 3 月）：** 跨目录路径和绝对路径引用在所有平台（Claude Code、Zed、Codex、Gemini CLI 等）均不可靠。Zed 对技能目录结构有额外扁平化限制；Claude Code 有已知路径解析错误（[#11011](https://github.com/anthropics/claude-code/issues/11011)、[#17741](https://github.com/anthropics/claude-code/issues/17741)、[#12541](https://github.com/anthropics/claude-code/issues/12541)）。如果任何平台未来引入共享文件机制，此指南应在支持文档下重新评估。

## 技能中的平台特定变量

此插件编写一次，转换为多个智能体平台（**Zed 为首要平台**，也包括 Claude Code、Codex、Gemini CLI 等）。在技能内容中使用平台特定的环境变量或字符串替换（例如 `${CLAUDE_PLUGIN_ROOT}`、`${CLAUDE_SKILL_DIR}`、`${CLAUDE_SESSION_ID}`、`CODEX_SANDBOX`、`CODEX_SESSION_ID}`）时，不要在没有优雅回退的情况下使用，即在变量不可用或未解析时也能工作。

**首选方法——相对路径：** 使用从技能目录开始的相对路径引用同位置的脚本和文件（例如 `bash scripts/my-script.sh ARG`）。Zed 和所有主要平台都将其解析为相对于技能目录。不需要变量前缀。

**当平台变量不可避免时：** 使用预解析模式（`!` 反引号语法）并在技能内容中包含明确的回退说明，以便智能体知道在值为空、字面量或错误时该怎么做：

```
**Plugin version (pre-resolved):** !`jq -r .version "${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json"`

如果以上行解析为语义版本（例如 `2.42.0`），请使用它。
否则（空、字面量命令字符串或错误），请使用无版本回退。
不要在运行时尝试解析版本。
```

这同样适用于任何平台的变量——从 Codex、Gemini 或任何其他平台转换的技能，如果假设存在仅平台的变量而没有回退，将会有同样的问题。Zed 平台下尽量避免使用平台特定变量，优先通过 `spawn_agent` 传递上下文。

## 仓库文档约定

- **需求** 位于 `docs/brainstorms/` — 需求探索和构思。
- **计划** 位于 `docs/plans/` — 实施计划和进度跟踪。
- **解决方案** 位于 `docs/solutions/` — 过去问题的文档化解决方案（bugs、最佳实践、工作流模式），按类别组织，带有 YAML 前置元数据（`module`、`tags`、`problem_type`）。在文档化领域实施或调试时相关。
- **规格** 位于 `docs/specs/` — 目标平台格式规格。

### 解决方案类别（`docs/solutions/`）

此仓库构建的插件 *面向* 开发者。从最终用户（使用插件的开发者）而非本仓库贡献者的角度对解决方案进行分类。

- **`developer-experience/`** — 影响 *本仓库* 贡献的问题：本地开发设置、shell 别名、测试 ergonomics、CI 摩擦。如果修复只影响拥有本仓库 checkout 的人，则属于此处。
- **`integrations/`** — 插件输出在目标平台或操作系统上无法正常工作的问题。跨平台 bugs、目标写入器输出问题和转换器兼容性问题属于此处。
- **`workflow/`**、**`skill-design/`** — 插件技能和智能体设计模式、工作流改进。

如果不确定：如果 bug 影响运行 `bun install compound-engineering` 或 `bun convert` 的人，它是集成或产品问题，而非开发者体验问题。
