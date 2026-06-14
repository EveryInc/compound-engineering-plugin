---
title: "feat: 完善 Zed 版 ce-brainstorm reference 文件"
type: feat
status: completed
date: 2026-06-14
---

## Summary

将 `.agents/skills/ce-brainstorm/references/` 下的参考文件从约 1.4 KB 扩充到约 20 KB，在 50 KB 总预算内提供更完整的流程指导，同时删除 Zed 不需要的 HTML 渲染文件。

## Problem Frame

当前 Zed 版 `ce-brainstorm` 的 reference 文件过于简化，只保留了标题和要点清单（例如 `brainstorm-sections.md` 仅 21 行，`handoff.md` 仅 10 行）。这导致 Zed 平台上的 agent 在执行头脑风暴时缺乏详细的流程指导和最佳实践。

`plugins/` 下有完整的参考内容（约 94 KB），但这些内容未经 Zed 适配就直接使用会超出 50 KB 目录预算。需要在保留核心流程指导的前提下，精简以适应 Zed 的预算限制。

## Requirements

- **R1.** Zed 版 reference 文件提供足够详细的流程指导，使 agent 能在不查看 plugins 源码的情况下完成头脑风暴流程。
- **R2.** 总目录大小控制在 50 KB 以内（SKILL.md ~28 KB + references ~20 KB + 缓冲 ~2 KB）。
- **R3.** 保留 Zed 平台特有的适配说明（`target: zed`、Markdown 输出、Zed 阻塞问题工具）。
- **R4.** 删除或移除 Zed 不需要的内容（HTML 渲染全量指导、Claude Code/Codex/Gemini 特定的平台指令）。
- **R5.** 各 reference 文件的职责边界清晰，不重叠。

## Scope Boundaries

- **In scope:** 扩充 `.agents/skills/ce-brainstorm/references/` 下的 6 个文件（删除 html-rendering.md 后可保留 5 个）。
- **Out of scope:** 修改 `plugins/compound-engineering/skills/ce-brainstorm/` 的内容；修改 `SKILL.md`；新增 reference 文件。

## Key Technical Decisions

- **KTD1: 删除 `html-rendering.md`** — 节省 ~190 B（实际上是删除整个文件）。Zed 明确不支持 HTML 输出（`SKILL.md` 第 21 行声明），无需保留 HTML 渲染指导。
- **KTD2: 保留 `markdown-rendering.md`** — 扩充到 ~5-6 KB。Markdown 是 Zed 的唯一输出格式，agent 需要知道如何正确格式化文档。
- **KTD3: 从 plugins 版本"迁移"而非"复制"** — 只提取对 Zed 平台有用的内容，去除平台特定指令（`AskUserQuestion`、`request_user_input` 等）。
- **KTD4: 预算分配** — 总预算 22 KB 分配给 references：
  - `brainstorm-sections.md`: ~8 KB（核心内容契约）
  - `synthesis-summary.md`: ~6 KB（范围合成流程）
  - `handoff.md`: ~4 KB（收尾逻辑）
  - `markdown-rendering.md`: ~3 KB（Markdown 格式化）
  - `universal-brainstorming.md`: ~2 KB（通用头脑风暴）

## Implementation Units

### U1. 删除 html-rendering.md

**Goal:** 移除 Zed 不需要的 HTML 渲染指导文件。

**Requirements:** R2 (预算控制), R4 (移除不需要内容)

**Files:**

- 删除：`.agents/skills/ce-brainstorm/references/html-rendering.md`

**Approach:** 直接删除文件。Zed 不支持 HTML 输出，该文件对 Zed agent 无指导价值。

**Test scenarios:**

- 验证文件已删除。
- 验证 `.agents/skills/ce-brainstorm/` 目录大小减少约 190 B。

---

### U2. 扩充 brainstorm-sections.md

**Goal:** 从 1.1 KB 扩充到约 8 KB，提供完整的内容契约指导。

**Requirements:** R1, R3

**Files:**

- 修改：`.agents/skills/ce-brainstorm/references/brainstorm-sections.md`

**Approach:** 从 plugins 版本的 14.9 KB 文件中提取对 Zed 有用的核心内容，去除平台特定指令。保留：

- 文档判断标准（何时需要 doc）
- 深度匹配
- 简洁写作原则
- 硬性底线（Summary、Requirements）
- 可选章节列表（Problem Frame、Key Decisions、Actors 等）
- 代理自主权
- 元数据字段（date、topic）
- ID 和内容规则
- Summary vs Problem Frame 区别
- 包含/不包含的决策逻辑

**删除 Zed 不需要的部分：**

- HTML 渲染关联内容（已移至独立文件，Zed 不支持）
- Claude Code 特定的输出格式细节

**Test scenarios:**

- 验证文件包含所有核心章节。
- 验证文件大小约 8 KB。
- 验证不包含 `AskUserQuestion`、`request_user_input` 等平台特定工具引用。

---

### U3. 扩充 synthesis-summary.md

**Goal:** 从 0.4 KB 扩充到约 6 KB，提供范围合成流程的完整指导。

**Requirements:** R1, R3

**Files:**

- 修改：`.agents/skills/ce-brainstorm/references/synthesis-summary.md`

**Approach:** 从 plugins 版本的 25 KB 文件中提取核心流程，精简到约 6 KB。保留：

- 三桶分类（Stated / Inferred / Out of scope）
- Solo 型和 Brainstorm-sourced 型两种流程
- 保持测试
- 调用点门槛
- 模板和工作示例
- 自引用规则

**删除 Zed 不需要的部分：**

- 不需要 Proof / Proof-skill 相关的引用（Zed 没有这个工具）
- 不需要跨平台调用细节

**Test scenarios:**

- 验证文件包含三桶流程和两种类型。
- 验证文件大小约 6 KB。
- 验证不包含 Proof 平台引用。

---

### U4. 扩充 handoff.md

**Goal:** 从 0.4 KB 扩充到约 4 KB，提供 Phase 4 收尾的完整逻辑。

**Requirements:** R1, R3

**Files:**

- 修改：`.agents/skills/ce-brainstorm/references/handoff.md`

**Approach:** 从 plugins 版本的 11.4 KB 文件中提取核心逻辑，精简到约 4 KB。保留：

- 选项渲染逻辑（4 个及以下用工具，5 个以上用列表）
- 阻塞问题处理流程
- 选项处理逻辑（Plan implementation、Agent review、Build it now、Open in Proof/Browser、More questions、Done）
- 收尾摘要模板

**删除 Zed 不需要的部分：**

- `AskUserQuestion` / `request_user_input` / `ask_user` 的工具调用细节（Zed 使用自己的阻塞问题工具）
- Proof 集成逻辑（Zed 不支持）
- HTML 模式相关逻辑（Zed 不支持 HTML）

**Test scenarios:**

- 验证文件包含所有 Phase 4 选项及处理逻辑。
- 验证文件大小约 4 KB。
- 验证使用通用的"blocking question tool"描述而非平台具体工具名。

---

### U5. 扩充 markdown-rendering.md

**Goal:** 从 0.4 KB 扩充到约 3 KB，提供 Markdown 格式化的核心指导。

**Requirements:** R1, R3

**Files:**

- 修改：`.agents/skills/ce-brainstorm/references/markdown-rendering.md`

**Approach:** 从 plugins 版本的 8.2 KB 文件中提取核心内容，精简到约 3 KB。保留：

- 硬性约束（frontmatter、ASCII 标识符、repo-relative 路径、无 HTML）
- ID 前缀格式
- 内容形状选择（散文/列表/表格）
- 粗体引导标签
- 章节分隔符
- 图表渲染（mermaid）
- 前写审查清单

**删除 Zed 不需要的部分：**

- 文件保持所有现有内容。+2.6 KB 增量在当前版本基础上增加。
- 现有版本约 0.4 KB，目标 3 KB。

**Test scenarios:**

- 验证文件包含 frontmatter 格式、ID 格式、内容形状、图表渲染。
- 验证文件大小约 3 KB。

---

### U6. 扩充 universal-brainstorming.md

**Goal:** 从 0.4 KB 扩充到约 2 KB，提供通用（非软件）头脑风暴的流程指导。

**Requirements:** R1, R3

**Files:**

- 修改：`.agents/skills/ce-brainstorm/references/universal-brainstorming.md`

**Approach:** 从 plugins 版本的 6.4 KB 文件中提取核心内容，精简到约 2 KB。保留：

- 角色定义（thinking partner，非 answer machine）
- 问题询问原则（一个一个问题）
- 范围评估（Quick / Standard / Full）
- 探索和生成策略
- 收敛原则
- 收尾逻辑

**删除 Zed 不需要的部分：**

- 不需要包含具体的平台工具名称。

**Test scenarios:**

- 验证文件包含角色、范围评估、探索策略、收尾四个部分。
- 验证文件大小约 2 KB。

---

### U7. 验证目录总大小

**Goal:** 确保 `.agents/skills/ce-brainstorm/` 总大小不超过 50 KB。

**Requirements:** R2

**Files:**

- 无文件修改（验证步骤）

**Approach:** 在各单元完成后，检查目录总大小。

**Test scenarios:**

- 验证总大小 ≤ 50 KB。

## Open Questions

无。所有必要信息已从文件和预算约束中推导。

## Risks & Dependencies

- **风险 1:** 精简过程中可能遗漏部分重要指导。缓解：每个单元保留核心流程和原则，细节可通过阅读 SKILL.md 补充。
- **风险 2:** 预算分配可能需要根据实际内容调整。缓解：U7 验证步骤会在完成后检查，如有超支可回退次要文件。
- **依赖:** 无外部依赖。

## Execution Notes

- 本计划按顺序执行每个 Implementation Unit，因为每个单元的输入是前一个单元的输出（预算跟踪）。
- 不需要 TDD 或测试优先，因为这是文档/参考文件的修改。
