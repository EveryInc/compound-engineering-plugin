---
name: zed-ce-work-verify
description: "按日志优先原则验证 ce-work skill 在 Zed 中的真实执行链路"
source: auto-skill
extracted_at: '2026-06-06T00:00:00.000Z'
learned_from: >
  2026-06-06 补 ce-work Zed-native port 后的验证经验。
  关键结论：产物存在不等于 skill 执行过；必须以 log 为准；
  Zed 里 @ce-work 命中的执行证据在 ce-work.log，不是 ce-plan.log；
  计划文件 metadata 影响 Phase 0 triage，但 Zed 中把文件内容直接当 input 时更可能走 bare-prompt/trivial 分支。
---

# Zed CE-WORK Verify

验证 `ce-work` 是否真的在 Zed 中被调用并执行，而不是仅凭产物存在推断。

## 前提

- `ce-work` 的 Zed-native skill tree 已存在：`.agents/skills/ce-work/`
- 有一个待执行的计划文件，例如 `docs/plans/2026-06-06-001-verify-ce-work-plan.md`
- 日志路径：`/Users/laobaibai/Documents/compound-engineering-plugin/log/ce-work.log`

## 验证原则

- **产物 ≠ 执行**：文件已存在不足够，必须看到 `ce-work` 的调用记录。
- **日志为准**：以 `ce-work.log` 是否有对应执行段为最终判据。
- **区分入口**：`ce-plan.log` 只说明 plan 被调用过；`ce-work.log` 才说明 work 被调用过。

## 步骤

### Step 1：确认 Skill 已加载

在 Zed 中执行：

```text
/ce-work
```

- 成功：Zed 显示 `ce-work` skill 内容或帮助信息。
- 失败：如果报 `can't find Skill`，执行 `AI: Reload Skills` 或重启 Zed，再试一次。

### Step 2：执行最小计划

在 Zed 新对话输入：

```text
/ce-work docs/plans/2026-06-06-001-verify-ce-work-plan.md
```

按回车后观察 Zed 执行窗口是否输出：
- Phase 0 识别
- Phase 1 环境检查
- Phase 2 任务执行
- Phase 3-4 质量检查（如有）

### Step 3：立即检查日志

执行完成后，读取日志末尾：

```text
/Users/laobaibai/Documents/compound-engineering-plugin/log/ce-work.log
```

排查要点：
- 日志尾部是否出现本次 `ce-work` 的调用记录？
- 记录里是否包含 Phase 执行信息？
- 如果没有新记录，说明该次调用未走 `ce-work` 执行链路。

### Step 4：核验产物

```text
cat .tmp/hello.md
```

- 内容正确：`Hello from ce-work verification.`
- 这步是辅助确认，不能替代 Step 3 的日志证据。

## 常见分歧

- **问题：文件已存在，但 log 里只有 ce-plan 记录**
  - 原因：`ce-work` 未被 Zed 正确调用，或调用了但日志未落盘。
  - 处理：重做 Step 1 确认 skill 加载，再执行一次 Step 2。

- **问题：Zed 把计划内容直接当 bare prompt 处理**
  - 原因：`.agents/skills/ce-work/SKILL.md` 的 `<input_document>` 在 Zed 里被替换为文件内容，而不是文件路径。
  - 处理：先修复入口形态，再验证；不要把 prompt 当 plan-document 的 triage 结果。

## 验证通过的标准

- `ce-work.log` 出现与本次执行匹配的最新记录
- 执行记录了完整的 Phase 流程
- 产物与计划要求一致

## 相关 Skill

- `zed-first-install`：ce-work 的 Zed-native 安装与适配
- `zed-ce-work-design`：ce-work 在 Zed 中的设计现状
