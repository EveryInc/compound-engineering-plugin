# feat: Complete ce-work Zed Adaptation

**Status:** Completed
**Target repo:** compound-engineering-plugin (local checkout)
**Type:** Feat
**Sequences:** 001

## Problem Frame

.commit compound-engineering 插件的 ce-work 功能在 Zed 平台下只实现了约 55% 的内容（~211 行 vs ~382 行）。关键缺失包括：并行子代理分发策略、worktree 隔离技能引用、代码简化步骤、以及完整的质量检查流程。这导致 Zed 用户在执行复杂多任务工作时缺少平台原生的编排能力。

## Scope Boundaries

**In scope:**

- 补全 `.agents/skills/ce-work/SKILL.md` 缺失的核心执行逻辑
- 创建 Zed 适配版 `ce-worktree` 技能（当前完全缺失）
- 创建 Zed 适配版 `ce-simplify-code` 技能（当前完全缺失）
- 所有适配遵循 Zed 平台约束（`target: zed`、spawn_agent 原语、无跨目录引用）

**Out of scope:**

- HTML 计划格式支持（Zed 仅支持 markdown）
- `convert --to zed` 自动化（v1 范围外）
- 38 技能全覆盖
- Claude Code 平台特定工具（`Agent`、`Task`、`AskUserQuestion`）

## Decisions

| ID  | Decision                 | Rationale                                                                             |
| --- | ------------------------ | ------------------------------------------------------------------------------------- |
| D1  | 采用串行子代理策略       | Zed 的 `spawn_agent` 不支持 worktree 隔离；串行执行保持上下文一致性，避免共享目录竞态 |
| D2  | worktree 作为手动选项    | 通过引用 `ce-worktree` 技能让用户主动选择，而非自动化隐式创建                         |
| D3  | Simplify 步骤条件化      | 仅在 diff >=30 行且非机械性变更时触发；Zed 无内置 simplify 工具时需要明确触发时机     |
| D4  | 脚本路径使用项目相对路径 | `.agents/skills/ce-worktree/scripts/` 从项目根访问，避免依赖 `CLAUDE_SKILL_DIR`       |

## Implementation Units

### U1. 创建 ce-worktree Zed 技能

- **Goal:** 在 `.agents/skills/` 下创建独立的 worktree 管理技能，为 ce-work 提供可选的隔离工作环境
- **Requirements:** R1（Zed 技能自包含）、R2（脚本可执行）
- **Files:**
  - Create: `.agents/skills/ce-worktree/SKILL.md`
  - Create: `.agents/skills/ce-worktree/scripts/worktree-manager.sh`
- **Approach:** 从 plugin 版本移植核心功能，移除 `CLAUDE_SKILL_DIR` 依赖，改用项目相对路径。在 SKILL.md 中明确 Zed 执行规则和路径假设。
- **Patterns to follow:** `.agents/skills/ce-code-review/SKILL.md`（Zed execution rules 模式）
- **Test scenarios:**
  - **Happy path:** 用户执行 `bash .agents/skills/ce-worktree/scripts/worktree-manager.sh create feat/test` 成功创建 worktree
  - **Edge case:** 同名 worktree 已存在时返回明确错误
  - **Error/failure:** from-branch 不存在时回退到本地分支
  - **Integration:** worktree 创建后 `.env*` 文件正确复制、`.worktrees` 被 gitignore
- **Verification:** SKILL.md 包含 `target: zed` frontmatter；脚本可从项目根正确执行；无跨目录引用

### U2. 补全 ce-work Phase 1 执行策略

- **Goal:** 为 `.agents/skills/ce-work/SKILL.md` 补全 Phase 1 Step 2-4 的完整执行策略逻辑
- **Requirements:** R3（环境设置）、R4（任务列表创建）、R5（执行策略选择）
- **Files:**
  - Modify: `.agents/skills/ce-work/SKILL.md`
- **Approach:** 移植 plugin 版本 Phase 1 的核心逻辑，但做以下适配：
  1. Step 2（Setup Environment）保留分支检测逻辑，worktree 选项改为"引用 ce-worktree 技能"而非自动化
  2. Step 3（Create Task List）移除平台特定任务工具引用，描述为"内部任务追踪"
  3. Step 4（Choose Execution Strategy）仅保留 Inline 和 Serial 两种模式，移除 Parallel 和相关安全检查
  4. 所有子代理调度统一使用 `spawn_agent`
- **Patterns to follow:** `plugins/compound-engineering/skills/ce-work/SKILL.md` L63-192 逻辑；`.agents/skills/ce-code-review/SKILL.md` spawn_agent 模式
- **Test scenarios:**
  - **Happy path:** 用户提供 plan 路径，ce-work 正确读取并创建任务列表
  - **Edge case:** 用户已在 feature branch 且分支名有意义时跳过重命名提示
  - **Edge case:** Trivial 变更（1-2 文件、无行为变化）跳过任务列表直接执行
  - **Error/failure:** 计划文件不存在时给出明确错误
- **Verification:** 补全内容覆盖原缺失 Sections；Zed execution rules 已添加；无 Claude Code 特定引用

### U3. 补全 ce-work Phase 2 执行步骤

- **Goal:** 为 `.agents/skills/ce-work/SKILL.md` 补全 Phase 2 缺失的执行步骤和质量保障逻辑
- **Requirements:** R6（测试驱动执行）、R7（增量提交）、R8（代码简化）
- **Files:**
  - Modify: `.agents/skills/ce-work/SKILL.md`
- **Approach:** 移植 plugin 版本 Phase 2 的核心逻辑：
  1. Task Execution Loop — 保留完整性检查、Test Discovery、System-Wide Test Check
  2. Incremental Commits — 保留提交启发式规则
  3. Simplify as You Go — 新增步骤，在每 2-3 个单元后触发 `ce-simplify-code`（Zed 版）
  4. Track Progress — 保留 U-ID 引用和阻塞记录
  5. 移除 Claude Code 特定引用（`ToolSearch`、`AskUserQuestion` 等）
- **Patterns to follow:** `plugins/compound-engineering/skills/ce-work/SKILL.md` L192-323
- **Test scenarios:**
  - **Happy path:** 主 Zad 使用 Test Discovery 找到对应测试文件并更新
  - **Edge case:** 单元工作已存在于当前分支时跳过重新实现
  - **Integration:** System-Wide Test Check 触发回调/中间件追踪
- **Verification:** Phase 2 覆盖原有缺失内容；Zed 平台工具引用正确

### U4. 补全 ce-work Phase 3-4 质量检查与收尾

- **Goal:** 为 `.agents/skills/ce-work/SKILL.md` 补全 Phase 3-4 的完整收尾流程
- **Requirements:** R9（质量检查）、R10（代码审查）、R11（发布验证）
- **Files:**
  - Modify: `.agents/skills/ce-work/SKILL.md`
- **Approach:** 移植 plugin 版本 Phase 3-4 逻辑：
  1. Quality Check — 核心检查、Simplify 触发、Tier 1/2 代码审查
  2. Residual Work Gate — 使用 Zed blocking question tool
  3. Final Validation — 验证清单
  4. Ship It — 证据准备、状态更新、PR 创建
  5. Common Pitfalls — 补充缺失项
  6. 将 `references/shipping-workflow.md` 中的 Tier 2 流程内联到主 SKILL.md（Zed 无外部 review 工具链）
- **Patterns to follow:** `plugins/compound-engineering/skills/ce-work/SKILL.md` L323-382；`.agents/skills/ce-commit-push-pr/SKILL.md`（Zed blocking question 模式）
- **Test scenarios:**
  - **Happy path:** Tier 2 审查触发后正确执行 review → apply → Residual Work Gate 流程
  - **Edge case:** 仅 Tier 1 可用时正确跳过 Residual Work Gate
  - **Error/failure:** 审查留有未解决 actionable findings 时阻塞并询问用户
- **Verification:** Phase 3-4 逻辑完整；Zed blocking question tool 使用正确；无外部 CLI 依赖错误

### U5. 创建 ce-simplify-code Zed 技能

- **Goal:** 在 `.agents/skills/` 下创建 Zed 适配版代码简化技能，为 ce-work 的 Simplify 步骤提供能力
- **Requirements:** R12（代码简化能力）
- **Files:**
  - Create: `.agents/skills/ce-simplify-code/SKILL.md`
- **Approach:** 从 plugin 版本移植核心逻辑，将 Claude Code `Agent`/`Task` 替换为 `spawn_agent`，保持 3 个 reviewer 的并行审查模式。添加 Zed execution rules section。
- **Patterns to follow:** `plugins/compound-engineering/skills/ce-simplify-code/SKILL.md`；`.agents/skills/ce-code-review/SKILL.md`（spawn_agent 模式）
- **Test scenarios:**
  - **Happy path:** diff >=30 行时触发 3 个 reviewer 并行审查
  - **Edge case:** 纯机械性变更（格式化、依赖升级）跳过简化
  - **Integration:** 简化后运行类型检查和测试验证行为保留
- **Verification:** SKILL.md 包含 `target: zed` frontmatter；spawn_agent 调用模式正确；无 Claude Code 特定引用

### U6. 验证 Zed 适配完整性

- **Goal:** 验证所有修改后的技能符合 Zed 平台约束
- **Requirements:** R13（Zed 目录完整性）
- **Files:**
  - Verify: `.agents/skills/ce-work/SKILL.md`
  - Verify: `.agents/skills/ce-worktree/SKILL.md`
  - Verify: `.agents/skills/ce-simplify-code/SKILL.md`
- **Approach:**
  1. 检查所有 SKILL.md 包含 `target: zed` frontmatter
  2. 检查 references/ 引用均为相对路径且自包含
  3. 检查单个 skill 目录大小 <50KB
  4. 确认无跨目录引用（`../other-skill/` 或绝对路径）
  5. 确认无 `CLAUDE_SKILL_DIR` 等平台变量残留
- **Patterns to follow:** AGENTS.md Zed 平台约束；`.agents/skills/` 现有技能结构
- **Test expectation:** none -- 验证流程，无运行时行为
- **Verification:** 所有检查项通过；技能可在 Zed 中正常加载

## Dependencies

```text
U1 (ce-worktree) ──────┐
                       ├──→ U2 (ce-work Phase 1) ──→ U3 (ce-work Phase 2) ──→ U4 (ce-work Phase 3-4)
U5 (ce-simplify-code) ──┘                                    │
                                                             └──→ U6 (Validation)
```

实际执行中 U1 和 U5 可并行；U2-U4 必须顺序构建（每步依赖前一步的输出上下文）。

## Risks

| Risk                                       | Likelihood | Impact | Mitigation                                       |
| ------------------------------------------ | ---------- | ------ | ------------------------------------------------ |
| Zed spawn_agent 参数限制无法传递复杂上下文 | Medium     | High   | 在 prompt 中内联所有必要上下文；避免依赖参数传递 |
| 脚本路径在不同安装布局下失效               | Medium     | Medium | 文档明确路径假设；提供 fallback 说明             |
| skill 目录超 50KB 预算                     | Low        | Medium | 监控文件大小，必要时精简示例文本                 |
| 简化步骤触发时机不当                       | Medium     | Low    | 明确阈值（>=30 行）和跳过条件（纯机械性变更）    |

## Deferred to Follow-Up Work

- ce-work 的并行执行支持（待 Zed spawn_agent 支持更复杂的隔离机制后）
- HTML 计划格式支持（Zed 平台不需要）
- 其他 37 个技能的 Zed 适配（超出当前范围）
