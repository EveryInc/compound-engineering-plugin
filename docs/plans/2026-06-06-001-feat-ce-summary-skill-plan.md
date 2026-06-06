---
title: "feat: Add ce-summary skill"
type: feat
status: active
date: 2026-06-06
---

# feat: Add ce-summary skill

## Summary

为 compound-engineering 插件新增 `ce-summary` skill，允许 agent 在任意会话中快速生成项目当前状态摘要（变更、待办、风险点、下一步建议）。摘要以 markdown 输出，包含决策级判断与下一步可执行建议，而非简单信息罗列。

## Problem Frame

现有工作流中，用户在长周期任务中缺乏标准化的"快照式回顾"入口。`ce-plan` 产生产物密集，`ce-review` 产出现状偏向评审证据，都缺乏面向"我现在在哪、接下来做什么"的轻量级状态摘要能力。这导致跨会话续做时，用户需要重新阅读大量上下文文件，容易出现决策断层。

## Requirements

- **R1. 摘要生成。** 给定 CWD 仓库（自动识别当前项目根），输出一份 markdown 状态摘要，覆盖最近变更、当前待办件、主要风险项、以及 1-3 条可执行下一步建议。
- **R2. 轻量级入口。** 技能通过 `/ce-summary` 直接调用，无需前置 `ce-plan` 或 `ce-brainstorm` 产物。
- **R3. 可解析输出。** 摘要包含 YAML frontmatter（生成时间、覆盖范围），便于下游工具（如后续的 `ce-work` 回读）消费。
- **R4. 零外部依赖。** 不引入新的 npm 包或系统工具依赖；复用现有的 shell/TypeScript 脚本能力。
- **R5. 回退兜底。** 若无法自动检测 CWD 项目根或标记文件缺失，降级输出英文结构摘要，不阻塞流程。
- **R6. 可重复运行。** 连续运行时输出稳定；不修改仓库状态，不产生文件或副作用。

## Key Technical Decisions

- **KTD1. 技能入口使用 prompt-driven 模式。** 不编译打包执行脚本，使用用户通过 SKILL.md 中嵌入的结构化 prompt 驱动 agent 推理生成摘要。理由：现有其他 skill（如 brainstorming、review）均走此路径，保持整体架构一致，测试复杂度最低。
- **KTD2. 项目根检测优先使用 git、其次 cwd 标记。** 用 `git rev-parse --show-toplevel` 确认项目根，失败则回退到当前工作目录。理由：与现有工具约定一致，避免替换为可能不一致的第三方检测逻辑。
- **KTD3. 信息来源靠 agent 主动读取，不使用预先索引。** 不构建文件索引或缓存层；agent 按策略引导读取关键文件（AGENTS.md、最近 CHANGELOG、CHANGELOG.md、docs/solutions/ 等）。理由：skill 的职责是定义读取策略而非实现读取能力，降低维护成本。
- **KTD4. 输出固定为 markdown，不另设 JSON 或 HTML 模式。** 当前 Zed 侧的交付约定是 markdown-only；如后续需要 JSON 寄生输出，由消费方解析 markdown frontmatter。
- **KTD5. 不自动写入仓库。** 摘要输出到对话，不创建文件。理由：用户主动发起摘要请求，且避免副作用污染状态。

## Implementation Units

- **U1. Skill 目录结构与 SKILL.md 骨架。**
  - 路径：`plugins/compound-engineering/skills/ce-summary/`
  - 新建目录；SKILL.md 导入 skill-creator 约定的 frontmatter，声明 agent prompt、输入约束、输出格式。
  - 测试：目录存在，frontmatter 合法，`/ce-summary` 可被发现。

- **U2. 吸收层：项目根与上下文文件识别。**
  - 在 SKILL.md 内以 agent 指令形式实现"如何识别项目根"和"按优先级读取以下文件"的策略说明：
    - `AGENTS.md`
    - `CHANGELOG.md`
    - `docs/solutions/` 最新条目
    - `docs/plans/` 最近 3 条状态标记为 `active` 的计划
    - 根目录下 `package.json`
  - 测试：在真实 repo 和 mock 文件结构中都能按序读取（通过搭载测试环境目标 agent 验证）。

- **U3. 摘要生成 prompt 与输出契约。**
  - SKILL.md 内定义四段式摘要结构：
    1. 当前状态（最近变更、活跃分支标签）
    2. 待办（active plans 中未完成的 units）
    3. 风险（solutions 中最近报错或迁移类条目）
    4. 建议（1–3 条下一步可执行动作）
  - 加上 YAML frontmatter：`generated_at`、`scope`。
  - 测试：在不同 CWD depth 下输出格式符合要求。

- **U4. 回退与错误态。**
  - 在 SKILL.md 中写入降级策略：
    - git 不可用时改 cwd 检测；
    - 关键文件不可读时输出 "limited context" 标记。
  - 测试：模拟 git 失败、关键文件缺失场景，输出降级摘要且不报错。

- **U5. 插件清单与 stubs 注册。**
  - 更新：
    - `plugins/compound-engineering/.claude-plugin/plugin.json` 中的 `skills` 数组：
      - 名称：`ce-summary`
      - path：`skills/ce-summary`
    - 运行 `bun run release:validate` 确认计数一致。
  - 测试：`release:validate` 通过，包含新 skill。

- **U6. 验证与测试脚本。**
  - 添加或更新技能契约测试：在 fixture 工作区检测 `/ce-summary` 的可用性。
  - 策略测试：覆盖 "正常"、"降级"、"空 CWD" 三条场景。
  - 测试：`bun test` 无回归。

## Scope Boundaries

- **包含：** skill 的定义、agent 读取策略、markdown 输出契约、插件注册。
- **不包含：** 将摘要持久化到仓库文件、生成 JSON/HTML 多模态输出、跨会话状态对比、对接 `ce-work` 直接消费。
- **非目标：** 不替代任何现有 skill (`ce-plan`, `ce-brainstorm`, `ce-review`)；不重建内容引擎（如 Git blame 或历史分析）。

## System-Wide Impact

新增 skill 独立入口，不影响现有 skill 或 CLI 流程。`ce-summary` 在用户主动调用时工作，不拦截任何既有命令或权限检查。对测试覆盖率计量无影响；`release:validate` 会增加一次 skill 注册校验。

## Risks & Dependencies

- **依赖 R1 实现的语言模型能力。** mcp 降级兜底；若模型推理质量不足，摘要可能扁平化。此风险可通过迭代 prompt 降低，不阻塞 V1。
- **依赖 `AGENTS.md` 内容质量。** 若项目根下 AGENTS.md 不足以覆盖项目特征，摘要准确度下降。但这是信息层风险，而非架构层问题。
- **注册副作用。** 每次新增 skill 都需要维护 plugin.json 计数；风险已通过 `release:validate` 管控。

## Open Questions

无。

## Acceptance Examples

- **AE1.** 在 `compound-engineering` 插件目录下运行 `/ce-summary`，输出包含 Generated timestamp、最近 3 条 active plan、至少 1 条可执行建议。
- **AE2.** 在 `tests/` 子目录中运行 `/ce-summary`，摘要仍能识别到项目根（`AGENTS.md` 所在），输出 scope 标记为 repo root。
- **AE3.** 将 `package.json` 和 `CHANGELOG.md` 临时移至其他路径后运行，输出降级为 "limited context" 摘要，未抛出未处理异常。
- **AE4.** 正常工作路径下执行 `bun run release:validate`，技能计数校验通过。

## Implementation Map

- 新增：`plugins/compound-engineering/skills/ce-summary/SKILL.md`
- 新增：`plugins/compound-engineering/skills/ce-summary/README.md`（skill 说明占位）
- 修改：`plugins/compound-engineering/.claude-plugin/plugin.json`（skill 注册、计数自增）
- 修改：`tests/ce-summary-skill-contract.test.ts`（新增契约测试）
- 脚本：`bun run release:validate`（验证器校验，无需代码变更）

## Test Plan

- 技能发现：样例工作区下 assert `/ce-summary` 可被发现并报出可用。
- 正常路径：填充 AGENTS.md、最近计划后，摘要输出含四段内容与 frontmatter。
- 降级路径：移除 git 或关键文件，降级摘要输出，无未处理异常。
- 回归：`bun test` 通过，`release:validate` 通过。
