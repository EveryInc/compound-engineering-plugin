---
name: zed-ce-work-design
description: "探索项目对 ce-work 的实现现状，并在询问设计确认问题前先呈现证据"
source: auto-skill
extracted_at: '2026-06-05T23:14:52.028Z'
---

# ZED CE-WORK 现状探索

在询问用户关于 `ce-work` 的设计确认问题之前，先通过只读方式探索项目中的实现现状。

## 前题

- 保持 `PLAN` 模式约束：只读探索，不修改文件。
- 目标：确认 `ce-work` 是已实现、仅文档存在、还是未实现。

## 探索清单

1. **列出 Zed-native skill tree**
   - 查看 `.agents/skills/` 或 `.qwen/skills/` 下是否存在 `ce-work` 目录。
   - 如果不存在 `ce-work`，记录缺失。

2. **检查文档证据**
   - 读取 `docs/skills/ce-work.md` 和 `docs/skills/ce-work-beta.md`，确认它们是说明文档还是可直接加载的 `SKILL.md`。
   - 查看 `docs/plans/` 下是否有与 `ce-work` 相关的实现计划。

3. **检查变更历史**
   - 从 `CHANGELOG.md` 中检索 `ce-work` 和 `ce-work-beta` 的条目，确认是否曾有正式实现。
   - 如有，提取关键 PR 编号和变更主题。

4. **检查最终输出**
   - 查看 `docs/zed-install-checklist.md` 或类似文件，确认当前 Zed 安装流程中是否包含 `ce-work`。

## 证据归纳

在呈现给用户时，结构化表述如下：

1. **Zed-native 实现状态**：存在 / 缺失 / 部分存在
2. **文档存在性**：说明文档存在，但不是可执行 skill
3. **历史实现证据**：Claude Code/Codex 路径是否有实现，以及该实现是否已迁移或废弃
4. **用户断言对齐**：如用户提到错误信息（如 "can't find Skill"），比对证据是否自洽

## 设计确认问题（模板）

向用户提出 3-5 个聚焦问题前，确保：

- 问题与技术证据直接相关
- 问题覆盖：入口形态、执行边界、代理策略、codex delegation 保留、与现有流程咬合
- 避免超出当前 repo 状态的问题

## 实施后状态

- 2026-06-06 已完成 Zed-native `ce-work` skill tree 创建在 `.agents/skills/ce-work/`。
- 包含 `SKILL.md`（Zed 适配版）和 4 个 reference 文件。
- Codex delegation 未包含（符合 Zed 首版决策）。
- 已验证文件结构和可读性；Zed 运行时验证待用户触发。

## 产出格式

最终向用户提供：

1. 3-5 行的事实摘要（每条带证据引用）
2. 5 个设计确认问题（可选项）
3. 如用户已明确下一步，提供 2-3 条建议作为增量提示

## 约束

- 不创建、修改或删除任何仓库文件
- 不执行 shell 命令
- 不超出 `PLAN` 模式的权限范围
