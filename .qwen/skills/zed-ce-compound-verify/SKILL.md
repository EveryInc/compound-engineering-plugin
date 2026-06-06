---
name: zed-ce-compound-verify
description: "验证 ce-compound skill 在 Zed 中的真实执行链路，按照日志优先原则判断是否真正被调用"
source: auto-skill
extracted_at: '2026-06-06T05:46:38.857Z'
---

# Zed CE-Compound Verify

验证 `ce-compound` 是否真的在 Zed 中被调用并执行，而不是仅凭产物存在推断。

## 前提

- `ce-compound` 的 Zed-native skill tree 已存在：`.agents/skills/ce-compound/`
- 有一个待分析的问题或修复背景，例如 git log 中最近的一次 fix
- 日志路径：`/Users/laobaibai/Documents/compound-engineering-plugin/log/ce-compound.log`

## 验证原则

- **产物 ≠ 执行**：文件已存在不足够，必须看到 `ce-compound` 的调用记录。
- **日志为准**：以 `ce-compound.log` 是否有对应执行段为最终判据。
- **区分入口**：`ce-plan.log` 只说明 plan 被调用过；`ce-compound.log` 才说明 compound 被调用过。

## 步骤

### Step 1：确认 Skill 已加载

在 Zed 中执行：

```text
/ce-compound
```

- 成功：Zed 显示 `ce-compound` skill 内容或帮助信息。
- 失败：如果报 `can't find Skill`，执行 `AI: Reload Skills` 或重启 Zed，再试一次。

### Step 2：执行最小化 Compound

在 Zed 新对话输入：

```text
/ce-compound "最近一次修复的分析，用于验证 skill 执行"
```

按回车后观察 Zed 执行窗口是否输出：
- Phase 0.5 Auto Memory Scan
- Phase 1 研究员并行调用
- Phase 2 分类和写入
- Phase 3 复查

### Step 3：立即检查日志

执行完成后，读取日志末尾：

```text
/Users/laobaibai/Documents/compound-engineering-plugin/log/ce-compound.log
```

排查要点：
- 日志尾部是否出现本次 `ce-compound` 的调用记录？
- 记录里是否包含 Phase 执行信息？
- 如果没有新记录，说明该次调用未走 `ce-compound` 执行链路。

### Step 4：核验产物

```bash
# 查看生成的 solution 文档
ls -la docs/solutions/*/
# 内容应该包含：
# - 问题描述
# - 解决方案  
# - 分类（problem_type, severity 等 frontmatter）
```

## 常见分歧

- **问题：文件已存在，但 log 里只有 ce-work 或 ce-plan 记录**
  - 原因：`ce-compound` 未被正确调用，或调用了但日志未落盘。
  - 处理：重做 Step 1 确认 skill 加载，再执行一次 Step 2。

- **问题：Zed 把描述直接当 prompt 处理**
  - 原因：`.agents/skills/ce-compound/SKILL.md` 的输入在 Zed 里被替换为纯文本，而不是结构化解析。
  - 处理：确保输入包含 mode:headless 或交互模式明确意图。

## 验证通过的标准

- `ce-compound.log` 出现与本次执行匹配的最新记录
- 执行记录了完整的 Phase 流程
- 生成的文档符合 `resolution-template.md` 的结构
- frontmatter 通过 `schema.yaml` 校验

## 相关 Skill

- `zed-first-install`：ce-compound 的 Zed-native 安装与适配
- `zed-ce-work-verify`：ce-work 执行链路的验证方法