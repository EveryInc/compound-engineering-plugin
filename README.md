# Compound Engineering for Zed

[![Build Status](https://github.com/EveryInc/compound-engineering-plugin/actions/workflows/ci.yml/badge.svg)](https://github.com/EveryInc/compound-engineering-plugin/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@every-env/compound-plugin)](https://www.npmjs.com/package/@every-env/compound-plugin)

> 专为 [Zed](https://zed.dev) 编辑器打造的复合工程技能体系。让每一次工程工作都比上一次更轻松。

---

## 🚀 快速开始

**三步即可在 Zed 中启用 Compound Engineering：**

```bash
# 1. 克隆技能树到本地 agents 目录
git clone <repo> ~/.agents/skills/compound-engineering

# 2. 在 Zed 中加载插件目录
zed --plugin-dir ~/.agents/skills/compound-engineering

# 3. 开始使用
/ce-brainstorm
```

### Zed 目录结构

```
~/.agents/skills/compound-engineering/
├── ce-brainstorm/
│   └── SKILL.md
├── ce-plan/
│   └── SKILL.md
├── ce-work/
│   └── SKILL.md
├── ce-compound/
│   ├── SKILL.md
│   ├── references/
│   └── scripts/
└── ... (37+ skills)
```

---

## 🧩 核心技能

| 技能 | 用途 |
|------|------|
| `/ce-strategy` | 创建或维护 `STRATEGY.md`——产品的目标问题、方法、关键指标 |
| `/ce-brainstorm` | 交互式 Q&A，在编码前想透功能或问题，产出规范文档 |
| `/ce-plan` | 将功能想法转化为详细的实施计划 |
| `/ce-work` | 通过 worktrees 和任务追踪执行计划 |
| `/ce-debug` | 系统性地复现失败、追溯根因并修复 |
| `/ce-code-review` | 多智能体代码评审，tiered confidence-gated 报告 |
| `/ce-compound` | 记录经验教训，让未来工作更轻松 |
| `/ce-product-pulse` | 生成时间窗口化脉冲报告，保存到 `docs/pulse-reports/` |

---

## 📅 开发路线图

### 当前状态：Zed 适配基础层完成 ✅

- **Zed 技能树就绪**：ce-compound 等核心技能已具备 `.agents/skills/` 下可直接加载的结构
- **验证基础设施完成**：4 个 Python 验证脚本已就位并被测试覆盖
- **双副本同步机制**：`.agents/`（Zed 原生）与 `plugins/compound-engineering/`（Claude Code 插件）双路径同步
- **文档对齐**：`SKILL.md` 已加入 Phase 2.3 Validation Gate 和 Phase 3.1 Duplicate Check 工作流

### 下一阶段：Zed 原生体验深化 🚧

- **Zed 目标转换器**：实现 `src/targets/zed.ts`，支持 `compound-plugin convert --to zed`
- **Agent 派遣适配**：将 `plugins/compound-engineering/agents/*.md` 抽象为平台无关的 prompt 模板，适配 Zed `spawn_agent` 原语
- **Zed 技能长度合规**：检测超长 `SKILL.md` 并在转换时自动委托给 `references/` 拆分
- **Zed 目录预算管理**：实现短描述变体机制，符合 Zed catalog 限制

### 未来方向：Universal Compound Platform 🔭

- **Zed 提升为首要一等公民**：在多平台支持基础上，Zed 成为优先优化平台
- **统一内容层**：技能作为主要产物，agents 作为可提取的 prompt 载荷，一次编写多平台运行
- **逆向贡献路径**：输出可直接被 Oh My OpenAgent 和 Oh My Pi 消费，无需二次创作
- **Pipeline 编排技能**：在 Zed 中优化 `ce-lfg` 风格的一体化流水线体验

---

## 🤝 贡献说明

*About Contributions:* 请不要误解我的意思，但我所有项目都不接受外部贡献。我只是没有足够的脑力去审查任何东西，这是我的名字在上面，我要为它引起的任何问题负责；因此，从我的角度来看，风险收益极度不对称。我还得担心其他"利益相关者"，这对我免费制作 Mostly 自用工具来说似乎不明智。欢迎提交问题，甚至 PR 如果你想说明一个建议的修复，但要知道我不会直接合并它们。相反，我会让 Claude 或 Codex 通过 `gh` 审查提交，并独立决定是否以及如何处理。特别欢迎 bug 报告。抱歉如果这冒犯了任何人，但我想避免浪费时间和感情。我知道这与寻求社区贡献的盛行开源精神不同步，但这是我能以这个速度前进并保持理智的唯一方式。

## 📄 许可证

[MIT](LICENSE)

---

<p align="center">
  <strong>专为 Zed 编辑器用户打造</strong> · 让每一次工程工作都比上一次更轻松
</p>
