# 复合工程：Every 如何用 Agent 编程

> 原文：[Compound Engineering: How Every Codes With Agents](https://every.to/chain-of-thought/compound-engineering-how-every-codes-with-agents)
>
> 作者：Dan Shipper & Kieran Klaassen
>
> 发布时间：2024年12月
>
> 翻译说明：本文为中文意译版本，基于原文核心概念整理

---

## 引言：当 100% 的代码都由 Agent 编写时会发生什么？

在 Every，我们不得不直面这个问题：AI 编程已经变得如此强大，团队中没有人再手动编写代码了。

这促使我们创造了一种全新的工程风格——**复合工程（Compound Engineering）**。

---

## 什么是复合工程？

### 传统工程的困境

在传统软件工程中，你预期**每一个新功能都会让下一个功能更难构建**：
- 更多代码意味着更多边界情况
- 更多相互依赖
- 更多难以预料的问题

代码库的复杂度持续增长，维护负担越来越重。

### 复合工程的理念

> **"每一单元的工程工作，都应该让后续的工作变得更容易——而不是更难。"**

复合工程反转了这个规律。每一个你构建的功能都会：
- 为下一个功能记录模式（patterns）
- 创建可复用的组件以加速未来工作
- 建立规范以减少决策疲劳
- 将知识沉淀下来，在团队中产生复利效应

代码库的复杂度仍然会增长，但 AI 对它的知识也在同步增长——这让未来的开发工作更快。

---

## 四步循环：Plan → Delegate → Assess → Codify

复合工程遵循一个持续循环的工作流：

```
    ┌──────────────────────────────────────────────┐
    │                                              │
    ▼                                              │
┌────────┐    ┌────────┐    ┌────────┐    ┌────────┐
│  Plan  │ →  │Delegate│ →  │ Assess │ →  │ Codify │
│  规划  │    │  执行  │    │  评估  │    │  沉淀  │
└────────┘    └────────┘    └────────┘    └────────┘
    │                                              │
    └──────────────────────────────────────────────┘
```

### 1. Plan（规划）- 占 40%

Agent 阅读 issues，研究方法，并将信息综合成详细的实施计划。

**这一步做什么：**
- 研究代码库，找到类似的模式和约定
- 分析框架文档和最佳实践
- 创建详细的验收标准和实施计划
- 生成遵循现有模式的代码示例

### 2. Delegate/Work（执行）- 占 10%

Agent 根据计划编写代码和测试。

**这一步做什么：**
- 创建隔离的 git worktrees 进行干净开发
- 将计划分解为可追踪的 todos
- 系统性地执行任务，持续验证
- 每次更改后运行测试和质量检查

### 3. Assess/Review（评估）- 占 40%

工程师审查输出和学到的经验。

**这一步做什么：**
- 在隔离的 worktree 中检出 PR 进行深度分析
- 并行运行 12+ 个专业审查 Agent
- 识别安全问题、性能问题和架构问题
- 为每个发现创建可追踪的 todos

### 4. Codify/Compound（沉淀）- 占 10%

工程师将结果反馈到系统中，帮助它从成功和失败中学习。

**这一步做什么：**
- 记录解决的问题和模式
- 更新 CLAUDE.md 和团队文档
- 将学到的经验沉淀为可复用的知识

---

## 时间分配

> **80% 的复合工程在「规划」和「评估」阶段，只有 20% 在「执行」和「沉淀」阶段。**

这颠覆了传统认知：大部分时间不是在写代码，而是在**思考该写什么代码**和**确保代码质量**。

---

## 实践中的哲学

### 1. 偏好重复而非复杂性

> "我宁愿有四个简单操作的控制器，也不要三个都很自定义、非常复杂的控制器。"

简单、重复的代码比复杂的 DRY 抽象更好理解。

### 2. 边做边记录

每个命令都会生成文档——issues、todos、审查发现——让未来的工作更容易。

### 3. 质量产生复利

高质量的代码更容易修改。多 Agent 审查系统确保每次更改都达到你的质量标准。

### 4. 系统化胜过英雄主义

一致的流程胜过个人英雄主义。`/workflows:work` 命令系统性地执行计划，持续验证。

### 5. 知识应该被沉淀

学到的经验应该被捕获和复用。研究型 Agent 分析你的代码库，将你自己的模式应用回给你。

---

## 工具与实现

### 技术栈

Every 主要使用 **Anthropic 的 Claude Code** 进行复合工程，但这种方法是工具无关的：
- 一些团队成员也使用 Factory 的 Droid
- 一些使用 OpenAI 的 Codex CLI

### 复合工程插件

我们构建了一个 Claude Code 插件，让其他人可以运行我们内部使用的完全相同的工作流：

```bash
# 安装插件
/plugin marketplace add https://github.com/EveryInc/every-marketplace
/plugin install compound-engineering

# 核心命令
/workflows:plan "功能描述"    # 规划
/workflows:work plan.md       # 执行
/workflows:review 123         # 审查
```

---

## 成果

Every 内部运营着五个软件产品，每个产品主要由一个人构建和运营。这些产品每天被数千人用于重要工作。

根据我们的经验：

> **如果正确使用 AI，一个开发者可以完成几年前五个开发者的工作。**

---

## 为什么这能让开发产生复利

传统开发工具帮助你**工作更快**。复合工程工具让**未来的工作更容易**。

**每一个 `/workflows:plan` 你创建的：**
- 记录模式，指导下一个计划
- 建立约定，减少规划时间
- 积累机构知识

**每一个 `/workflows:work` 你执行的：**
- 创建可复用的组件
- 完善你的测试方法
- 改进你的开发流程

**每一个 `/workflows:review` 你运行的：**
- 更早发现问题
- 为团队记录学习
- 系统性地提高质量标准

随着时间推移，你不只是在构建功能——你在构建一个**随着每次使用而变得更好的开发系统**。

---

## 开始使用

1. 安装插件
2. 在你的下一个功能想法上运行 `/workflows:plan`
3. 使用 `/workflows:work` 执行计划
4. 合并前运行 `/workflows:review`
5. 重复，观察你的开发流程产生复利

**每个循环都让下一个循环更容易。这就是复合工程。**

---

## 相关资源

- [原文链接](https://every.to/chain-of-thought/compound-engineering-how-every-codes-with-agents)
- [Every 工程师的 AI 工作流](https://every.to/source-code/inside-the-ai-workflows-of-every-s-six-engineers)
- [GitHub 仓库](https://github.com/EveryInc/compound-engineering-plugin)
- [Agentic Patterns - Compounding Engineering Pattern](https://agentic-patterns.com/patterns/compounding-engineering-pattern/)
