---
date: 2026-06-06
topic: update-readme-with-roadmap
---

# 更新 README.md 开发路线图计划

## 背景

项目当前处于 zed-editor 分支，已完成 Zed 适配的初期交付与验证：
- 双份 SKILL.md（`.agents/skills/ce-compound/` 和 `plugins/compound-engineering/skills/ce-compound/`）已同步
- 4 个 Python 验证脚本已就位并被测试覆盖
- schema.yaml 与 references 支持文件已集成
- 003 号计划（Zed Install + Validation）已完成脚本层验证

## 目标

在 README.md 中加入中文开发路线图，反映当前 Zed-first 转型状态、已完成的交付、下一阶段以及未来方向。

## 实施步骤

1. 在 README.md 末尾的 "About Contributions" 章节前插入新的 "开发路线图" 主章节
2. 路线图分为三级：当前状态（已完成）、下一阶段（进行中/规划中）、未来方向（长期）
3. 内容需对齐 `docs/brainstorms/2026-06-05-zed-first-universal-platform.md` 的核心方向
4. 保持 README 原有结构完整，不修改现有章节标题和顺序

## 内容大纲

### 开发路线图

#### 当前状态：Zed 适配基础层完成

- **Zed 技能树就绪**：ce-compound 等核心技能已具备 `.agents/skills/` 下可直接加载的 SKILL.md + references/ + scripts/ 结构
- **验证基础设施完成**：Schema 校验、概念一致性、重复检测、前置校验脚本全部上线并通过测试
- **双副本同步机制**：`.agents/`（Zed 原生）与 `plugins/compound-engineering/`（Claude Code 插件）双路径保持同步
- **文档对齐**：SKILL.md 已加入 Phase 2.3 Validation Gate 和 Phase 3.1 Duplicate Check 工作流

#### 下一阶段：Zed 原生体验深化

- **Zed 目标转换器**：实现 `src/targets/zed.ts` 与 `src/converters/` 中的 Zed 格式输出，支持 `compound-plugin convert --to zed`
- **Agent 派遣适配**：将 `plugins/compound-engineering/agents/*.md` 抽象为平台无关的 prompt 模板，适配 Zed `spawn_agent` 原语
- **Zed 技能长度合规**：检测超长 SKILL.md 并在转换时自动委托给 references/ 拆分
- **Zed 目录预算管理**：实现短描述变体机制，确保符合 Zed 50KB 名+描述目录限制

#### 未来方向：Universal Compound Platform

- **多平台原生覆盖**：在 OpenCode、Codex、Pi、Gemini、Kiro 基础上，将 Zed 提升为首要一等公民
- **统一内容层**：技能作为主要产物，agents 作为可提取的 prompt 载荷，实现一次编写多平台运行
- **逆向贡献路径**：输出可直接被 Oh My OpenAgent 和 Oh My Pi 消费，无需二次创作
- **pipeline 编排技能**：在 Zed 中优化 `ce-lfg` 风格的一体化流水线体验

## 约束

- 只修改 README.md，不触碰 plugins/ 或 src/ 代码
- 保持中文章节，技术命令和路径保持英文原名
- 路线图内容为阶段性快照，不代表详细任务清单
