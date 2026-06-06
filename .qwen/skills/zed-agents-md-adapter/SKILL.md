---
name: zed-agents-md-adapter
description: 将根目录 AGENTS.md 适配为 Zed-first 定位的内部贡献者规范文档。
source: auto-skill
extracted_at: '2026-06-07T00:00:00.000Z'
---

# Zed AGENTS.md Adapter

## 何时使用

- 用户要求"以 Zed-first 定位修改 AGENTS.md"
- 用户要求"将 AGENTS.md 中文化并适配 Zed"
- 用户要求"更新 AGENTS.md 使其与当前 Zed 平台方向一致"
- 任何需要对 AGENTS.md 做 Zed 平台导向改造的场合

## 目标

将 `AGENTS.md` 从纯通用仓库指令文件，调整为 **"Zed-first，兼保留多平台工程规范"** 的内部贡献者文档，而非面向最终用户的安装指南。

## 前置假设

- 项目当前定位：**Zed 编辑器是首要目标平台**
- Zed skill 安装根：`.agents/skills/`
- Zed 技能目录需自包含（references/ 与 SKILL.md 同目录）
- Zed skill 执行原语：`spawn_agent`
- 源内容仍维护在 `plugins/compound-engineering/`，Zed 版通过 manual-copy 同步
- 其他平台（OpenCode、Codex、Gemini CLI 等）转换能力保留，不再作为主要叙述对象

## 改造原则

1. **保留的通用工程规范（不动或只做措辞微调）**
   - 分支策略、合并策略、PR 流程
   - 测试规范、`release:validate` 使用时机
   - release-please 策略、linked-versions 含义
   - 提交约定（前缀、范围、BREAKING CHANGE）
   - 编码约定、固定装置/测试要求
   - .context/ 与 OS-temp 的层级规则
   - 字符编码规范
   - 文件引用隔离规则（跨平台均适用）
   - 平台中立变量/回退机制

2. **必须显式 Zed 化的内容**
   - **安装根**：`.agents/skills/` 优先于 `plugins/` 作为 Zed 安装位置
   - **执行原语**：`spawn_agent` 是 Zed 子代理调用方式
   - **前置元数据**：Zed SKILL.md 必须包含 `target: zed`
   - **自包含约束**：skill 目录内部完整，禁止跨目录引用
   - **目录预算**：单个 skill（含 references/）建议 <= 50KB
   - **路径规范**：`<root>/skills/<name>/`，`<root>` 为 `.agents` 或 Zed 用户配置目录
   - **验证方式**：Zed 以目录完整性校验 + Zed 内实际触发试跑为主

3. **需要降级或标注为"平台特定"的内容**
   - Claude Code 的会话缓存机制 → 降为"Claude Code 平台特性"小节
   - skill-creator 验证路径 → 降级为"其他平台（Claude Code）验证"
   - `.claude/plugins/cache/` → 直接注明是 Claude Code 用户机器状态
   - OpenCode 的 `.opencode/` 与 `~/.config/opencode/commands/` → 保留但降级到"其他平台"
   - `CLAUDE.md` 垫片说明 → 保留一句即可，不必扩展

## 操作步骤

### 1. 读取现有 AGENTS.md 全文

确认当前内容，识别以下部分：

- 哪些段落是纯平台无关工程规范
- 哪些段落绑定 Claude Code 生态（缓存、skill-creator、CLAUDE_* 变量、CLAUDE.md 等）
- 哪些段落可以 Zed 化而无需删减信息密度

### 2. 在开头插入 Zed 平台约束块（优先级最高）

在文件顶部、Quick Start 之前，插入：

```markdown
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
```

### 3. 将"输出路径"改为 Zed 优先

替换原有的 OpenCode 独占路径描述，改为：

```markdown
- **输出路径：**
  - **Zed（首要平台）**：技能树安装在 `<root>/skills/<name>/`，其中 `<root>` 为项目本地 `.agents` 或用户级 Zed 配置目录。SKILL.md 及 references/ 必须自包含在同一目录下，禁止跨目录引用。
  - **OpenCode（其他平台）**：输出保持在 `opencode.json` 和 `.opencode/{agents,skills,plugins}`。命令位于 `~/.config/opencode/commands/<name>.md`；`opencode.json` 是深度合并的（绝不整体覆盖）。
  - **通用规则**：转换器生产的平台输出必须严格匹配目标平台的目录布局和合并语义，不得混用平台路径约定。
```

### 4. 重构"验证智能体和技能更改"章节

将原有以 Claude Code 缓存为中心的段落，拆分为两个平台小节：

```markdown
### Zed 平台验证

- **Zed skill 启用平台中立路径前，先完成 Zed 目录完整性校验**：检查 frontmatter `target: zed`、references 目录完整性、无旧平台路径残留。
- **Zed 下通过 `spawn_agent` 实际触发试跑**：在 Zed 内手动加载 skill 并执行，确认子代理被正确触发、输出按预期落盘。
- **不依赖平台的会话缓存机制**：Zed 的 skill 加载在每次触发时读取当前源，无会话级缓存问题。

### 其他平台（Claude Code 等）验证

- **Claude Code 平台特性**：Claude Code 对插件智能体和技能定义存在会话启动缓存，编辑后需重启会话才能生效。不要编辑 `~/.claude/plugins/cache/` 或 `~/.claude/plugins/marketplaces/` 来尝试强制重新加载——这些路径是用户机器状态，存在被插件更新覆盖的风险。
- **技能脚本和 CLI 机械更改**：`bun test` 覆盖的技能脚本、解析器逻辑、转换代码始终运行当前源，不受平台缓存影响。
```

### 5. 在"添加新的目标提供商"前插入 Zed 优先级说明

在"仅在目标格式稳定..."那段之前，插入：

```markdown
**Zed 编辑器是当前首要目标平台，具有最高优先级。**

> Zed 适配采取"源在 `plugins/`，`manual copy` 到 `.agents/skills/`"的 dual-tree 策略，不通过 `convert --to zed` 实现。详见 Zed 平台约束。
```

并将原有清单调整为"其他平台"专有，或保留但注明 Zed 不适用。

### 6. 加固"技能中的文件引用"约束

在原有破坏性模式之后，补充：

```markdown
- **Zed 路径限制：** Zed 的技能目录结构扁平化，禁止跨技能遍历引用。
```

将底部"注意（2026 年 3 月）"改为平台中立：

```markdown
> **注意（2026 年 3 月）：** 跨目录路径和绝对路径引用在所有平台（Claude Code、Zed、Codex、Gemini CLI 等）均不可靠。Zed 对技能目录结构有额外扁平化限制；Claude Code 有已知路径解析错误（[#11011](https://github.com/anthropics/claude-code/issues/11011)、[#17741](https://github.com/anthropics/claude-code/issues/17741)、[#12541](https://github.com/anthropics/claude-code/issues/12541)）。如果任何平台未来引入共享文件机制，此指南应在支持文档下重新评估。
```

### 7. 保留 Claude Code 市场/元数据相关说明

`.claude-plugin/` 目录、marketplace.json、plugin.json、Claude Code 市场分发等细节仍属于当前工程现实，应保留，但不再作为"首要"叙述。必要时加上"Claude Code 平台"限定。

### 8. 直接写回 `/Users/laobaibai/Documents/compound-engineering-plugin/AGENTS.md`

步骤：
- 先读取现有文件全文
- 按上述 2-6 步逐段 edit
- 最后完整读取一遍，做一致性检查：
  - 是否每处提到 skill 安装位置都指向 `.agents/skills/` 或 Zed 目录？
  - 是否每处提到 skill 验证都以 Zed 目录完整性/试跑为首？
  - 是否保留了所有通用工程规范（分支、测试、版本、提交约定）？
  - 是否有遗漏的 Claude Code 遗留内容未标注或未降级？

## 输出规则

- 直接 `edit` `/Users/laobaibai/Documents/compound-engineering-plugin/AGENTS.md`
- 不新建文件；该文件是仓库权威指令，只能修改原文件
- 不做多平台安装说明的大段扩展，避免稀释 Zed-first 定位

## 验收标准

- Zed 平台约束在文件中明显可见（优先级最高）
- 信息密度不低于原文：只是平台导向变化，不是内容删减
- 技术细节（release-please、linked-versions、.context/、预解析回退、固定装置要求）全部保留
- 最终文件无"每处都像写给 Claude Code 用户"的语气残留
- 中文表达准确，保持代码/路径/命令原样
