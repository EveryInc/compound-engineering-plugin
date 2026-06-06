# Zed-First Skills 落地三阶段计划（最终版）

## 前置约束（已冻结）

- **约束一：** Zed 方案走 `spawn_agent` 内联 prompt，不走 Bun `convert --to` 路径。
- **约束二：** 最小可落地范围：v1 只做 **单技能**（`ce-code-review`）。
- **约束三：** 验证方式是"手动复制到 Zed + Zed 目录检查清单"，不做自动化 CI 验证。

---

## 一、决策点（已确定）

| 决策项 | 结论 | 理由 |
|---|---|---|
| Zed skills 安装根 | **`.agents/skills/`（项目本地）** | 项目本地安装能最大程度避免全局 Copilot 冲突；也符合你"先本地开发安装测试"的现实场景 |
| v1 单技能 | **`ce-code-review`** | 最能体现 Zed 的价值（`spawn_agent` 并行审查），也和现有 reviewer 模板直接对应，利于快速验证 |
| 描述预算 | **全部保留，超预算再处理** | v1 只做一个技能，直接保留原始描述最省成本；等批量迁移时再统一做预算计算工具 |
| Agent prompt 形式 | **直接内联 `SKILL.md`** | 符合"最小可交付"和"单文件自包含"原则；避免多文件并发编辑 |

---

## 二、阶段分解

### 阶段 1：Zed 目录规范与单技能 tree 生成

**目标：** 形成 Zed 可直接加载的 skill tree，做一次手动安装验证。

**动作：**

- 在 repo 中创建 `docs/specs/zed.md` 作为 Zed skill tree 命名规范和占位目录。
- 以 `ce-code-review` 为 MVP 目标，生成以下结构：

```text
.agents/skills/ce-code-review/
  SKILL.md              # skill 正文 + 内联 spawn_agent 调用模板
  references/
    reviewers.md        # 三个 reviewer agent 的 Zed prompt payload
    checklist.md        # 每项检查标准
    sections.md         # 报告分节规则
```

- 生成命令（手动或脚本）直接拷贝入 Zed 可读目录（`.agents/skills/`）。

**验收：**

- Zed 的 **AI > Skills** 列表里出现 `ce-code-review`。
- `SKILL.md` 可正常打开，`references/*.md` 正常解析。

---

### 阶段 2：Agent Prompt 抽取与 `spawn_agent` 适配

**目标：** Make `ce-code-review` in Zed 能调用三个 review persona。

**动作：**

- 从 `plugins/compound-engineering/agents/ce-*.md` 抽取 critic / security / performance reviewer 三个 prompt payload。
- 改写为 Zed 可用的内联 prompt 模板：接受用户 diff + `spawn_agent` 参数。
- 在 `SKILL.md` 内编写 `spawn_agent` 调用片段（label + message + session 策略说明）。

**验收：**

- Zed 内调用 `ce-code-review`，能生成明确的 reviewer 子任务。
- 子任务输出格式稳定、可被父 skill 读取并合并。

---

### 阶段 3：Zed 个人 `AGENTS.md` 模板 + 安装清单

**目标：** 行为一致化，降低后续多技能迁移成本。

**动作：**

- 创建 `docs/zed-personal-agents.md`：Zed 个人 `AGENTS.md` 推荐模板。
- 创建 `docs/zed-install-checklist.md`：手动安装与验证步骤清单。
- 定义 `docs/zed-skill-name-rules.md`：Zed 合法命名规则（小写、连字符、≤64 字符）。

**验收：**

- 用户按 checklist 可在 Zed 内复现安装流程。
- 所有文件名和 skill 名称通过命名规则校验。

---

## 三、不做事项（v1 范围外）

- 不做 Bun `convert --to zed` 子命令。
- 不修改 `src/targets/index.ts` 或现有 converter/writer。
- 不做 38 技能全覆盖，也不做 50KB 预算计算自动化。
- 不做 CI 集成，不做 Zed 扩展或 TUI 定制。

---

## 四、交付物清单

| 交付 | 说明 |
|---|---|
| `docs/specs/zed.md` | Zed skill tree 目录规范 |
| `.agents/skills/ce-code-review/SKILL.md` | Zed 可直接加载技能 |
| `.agents/skills/ce-code-review/references/reviewers.md` | 三个 reviewer prompt payload |
| `.agents/skills/ce-code-review/references/checklist.md` | 检查项 |
| `.agents/skills/ce-code-review/references/sections.md` | 报告分节规则 |
| `docs/zed-personal-agents.md` | Zed 个人 AGENTS.md 模板 |
| `docs/zed-install-checklist.md` | 安装与验证清单 |
| `docs/zed-skill-name-rules.md` | 命名规则（辅助后续批量迁移） |
| `.agents/skills/ce-code-review/SKILL.md` | Zed 可直接加载技能（v1 已验证） |
| `docs/ce-code-review-2026-06-06.md` | 实际 Zed 输出报告样例（验证通过） |
| `.agents/skills/ce-brainstorm/SKILL.md` | Zed 交互式头脑风暴 skill |
| `.agents/skills/ce-brainstorm/references/*.md` | 头脑风暴参考文档（已截断为 Zed 友好长度） |

---

## 五、手工验证步骤

1. 按 `docs/zed-install-checklist.md` 把 `.agents/skills/ce-code-review/` 复制到 Zed 可识别的项目目录。
2. 在 Zed 内打开 **AI > Skills**，确认 `ce-code-review` 出现。
3. 触发一次 `/ce-code-review`，确认 Zed 能加载 SKILL.md 正文。
4. 在 skill 执行过程中，确认 `spawn_agent` 调用片段可被 Zed 解析并生成子任务。
5. 检查 Zed 输出报告是否符合 `references/sections.md` 定义的分节结构。
