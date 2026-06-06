---
name: Zed AI 工作流增强
last_updated: 2026-06-07
---

# Zed AI 工作流增强 Strategy

## Target problem

在 Zed 编辑器中使用 AI agent 时，缺乏统一、可重复的工作流，导致对话逐渐漂移、改动失控，最终使得 agent 越改越不可用。

## Our approach

通过在 Zed 编辑器使用 skill 来制定并强制执行工作流程，让 agent 专注于当前开发任务，防止随对话演化而退化。

## Who it's for

**Primary:** 使用 Zed 进行 AI 辅助开发的中高级开发者（独立开发者或小型团队）——他们雇佣本项目来为 AI agent 套上可重复的工作流纪律，确保每次改动都收敛在目标范围内，而不是随着对话变长而漂移。

## Key metrics

- **Agent 任务收敛率** – 单次任务内产出与最初需求一致的比例（来源：Zed 会话日志 + 需求‑产出一致性标注）。  
- **Skill 采用深度** – 开发者实际启用 Zed skill 来约束 agent 对话的任务占比（来源：skill 触发日志）。  
- **上下文压缩后任务完成率** – 使用引用压缩后，agent 仍能正确继续任务的会话比例（来源：Zed 压缩日志 + 任务成功/失败标记）。  
- **单任务对话轮数（趋势）** – 完成一个目标任务的平均对话轮数（来源：Zed session 轮次统计）。  
- **Agent 自主完成率** – 不需要人工中途纠正就能完成任务的会话比例（来源：Zed 会话中人工介入提示的触发次数）。

## Tracks

### Core Constraint Mechanism

持续优化 Zed skill 的定义与执行逻辑，确保所有开发任务均在约束框架内进行。

_Why it serves the approach:_ 为 agent 建立明确的行为边界，防止对话漂移，实现“专注当下”的目标。

### Context Management Optimization

完善引用压缩、上下文精简与上下文状态同步，以降低长对话中的信息噪声。

_Why it serves the approach:_ 通过高效的上下文管理，让 agent 在资源受限的情况下仍能精准聚焦当前任务。

### Multi-platform Integration

在 Telegram、WeChat、Line、飞书等渠道实现工作流状态同步与提醒，扩大使用场景。

_Why it serves the approach:_ 让工作流不局限于单一编辑器，提升团队协作与即时反馈能力。