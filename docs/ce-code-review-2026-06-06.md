# Code Review — 2026-06-06

## Coverage

- **base ref:** `main`（当前 checkout）
- **files changed (tracked):** `.compound-engineering/config.local.example.yaml` (+17 行)
- **untracked files excluded:** `.agents/skills/`、`.qwen/`、`docs/brainstorms/*`、`docs/plans/*`、`docs/specs/*`、`docs/zed-*.md` 均为本地环境/设计文档，与本次 diff 无代码变更关联，本次审查仅覆盖实际 diff 文件。

---

## Findings

| ID  | Severity | Confidence | File                                                                                                                                           | Description                                                                                                                                                 |
| --- | -------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | P2       | 75         | `.compound-engineering/config.local.example.yaml` hunk @@ +48                                                                                  | `ce_promote_spiral_optout` 注释示例隐藏了实现层面的“字面量 `true` 存在性检查”语义；用户在示例中看到 `false` / `null` / 空值均被隐去，容易产生状态预期偏差   |
| F2  | P2       | 80         | `.compound-engineering/config.local.example.yaml` hunk @@ +33-42                                                                               | 注释写 “The two are mutually exclusive” 可能被误读为 `plan_output` 与 `brainstorm_output` 两配置互斥；实际实现允许同时设定双 `html`，措辞存在歧义           |
| F3  | P1       | 60         | `.compound-engineering/config.local.example.yaml` hunk @@ +44-48                                                                               | `ce_promote_spiral_optout` 的 “active-key” 原则（忽略注释行）在 ce-promote 路径缺少与 ce-plan / ce-brainstorm 同等级回归测试；当前该规则仅靠 prose 说明守护 |
| F4  | P3       | 90         | `.compound-engineering/config.local.example.yaml` hunk @@ +48 + `plugins/compound-engineering/skills/ce-setup/references/config-template.yaml` | 本次新增段落在 `config.local.example.yaml` 与 `config-template.yaml` 中以相同文本出现，但两文件无同步校验机制，后续单点修改会引发文档漂移                   |

---

## Actionable Findings

| ID     | Action Required                                                                                                                   |
| ------ | --------------------------------------------------------------------------------------------------------------------------------- |
| **F1** | 将示例注释修正为显式说明“必须写成未注释的 `ce_promote_spiral_optout: true` 才生效”，避免用户误写成 `false` 后仍自认已 opt-out     |
| **F2** | 修改 “mutually exclusive” 限定语，明确“输出格式互斥（同一 key 的 `md` 与 `html`），两配置 key 可独立启用 `html`”，消除歧义        |
| **F3** | 为 `ce-promote` 增加 active-key 规则的专项测试（类同 `tests/skills/ce-plan-output-mode.test.ts`），覆盖注释行过滤与字面量匹配场景 |
| **F4** | 在 `release:validate` 或 CI 中增加 `config.local.example.yaml` ↔ `config-template.yaml` 文本一致性校验                            |

---

## Testing Gaps

1. **`ce-promote` active-key 规则无测试门禁。** ce-plan / ce-brainstorm 已有对应测试，ce-promote 侧缺失；存在实现退化成裸字符串匹配时用户被静默触发 nudge 的风险。
2. **布尔语义边界未覆盖。** `ce_promote_spiral_optout: false | null | :` 在解析后的值应与 `absent` 行为一致还是不同，目前无断言守护。
3. **Output-format 组合无端到端断言。** 当前测试仅验证 `SKILL.md` 内联描述，不验证真实解析结果（例如双 `html` 是否真正允许）。
4. **双模板同步无自动化校验。** `bun run release:validate` 当前没有可见的双模板一致性规则。

---

## Residual Risks

- **F1 字面量匹配实现差异：** 若 YAML 解析器按布尔 truthiness 而非字面量匹配（`if parsed.ce_promote_spiral_optout`），`false` 会被误判为已 opt-out；两套实现均可行，但用户可观测语义不同。
- **F2 措辞歧义：** 不会造成当前运行时 bug，但会持续产生支持噪声（用户误以为不能双开 `html`）。
- **F3 测试缺口：** 只要 `ce_promote_spiral_optout` 的读取仍是 agent 文本内联执行（未固化到 TS 单测），回归风险就始终存在。
- **F4 文档漂移：** 单文件修改时另一份模板不会自动同步，下一次 ce-setup / output-format 迭代时维护成本会上升。

---

## Verdict

> **Needs work**
> 存在两条 P2 与一条 P1 的 actionable finding，建议在当前 PR 中修正文案与测试缺口后再合并。
