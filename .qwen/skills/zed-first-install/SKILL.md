---
name: zed-first-install
description: 将 compound-engineering 单技能适配为 Zed 可加载 skill tree，使用 spawn_agent 内联 prompt 和项目本地 .agents/skills/ 路径
source: auto-skill
extracted_at: '2026-06-06T00:00:00.000Z'
learned_from: >
  2026-06-05 到 2026-06-06 实际落地 ce-code-review、ce-brainstorm 和 ce-work Zed 适配。
  关键结论：安装根选项目本地 .agents/skills/ 而非 ~/.agents/skills/ 以避免 Copilot shadowing；
  Zed 前端上下文预算有限，大 reference 文件不要原样复制，先做 truncated 摘要版本放 references/；
  SKILL.md 内含强制输出契约（MUST follow）才能让 Zed 子代理按 sections.md 收束输出；
  可直接在 `.agents/skills/<name>/` 下开发，不用经 bun convert；验证以手动复制到 Zed + Zed 目录检查清单为准。
  2026-06-06 ce-work 落地后二次验证：shipping-workflow.md 完整复制（165 行）后 Zed 可正常使用，没有之前担心的上下文负担问题；
  因此 References 处理策略从"优先 truncate"调整为"先完整复制、必要时再精简"。
  2026-06-06 路线图阶段：Zed-first 交付物统一落在 .agents/skills/ce-*，不走 bun convert --to zed；
  项目定位从"多平台转换器"改为"Zed-first universal agent content platform"；
  README 需要同步改写叙事顺序，但保留 OpenCode/Codex/Pi/Gemini 等兼容安装说明。
---

# Zed-First Install

把一个 CE 技能适配为 Zed 原生 skill tree，不走 Bun convert 路径。

## 安装根选择

- **固定用项目本地** `.agents/skills/<name>/`
- 不用 `~/.agents/skills/`，避免 Copilot 全局优先级的 shadowing 风险
- Zed 在项目根打开时就能发现 `.agents/skills/`

## Layout

```
.agents/skills/<skill-name>/
  SKILL.md
  references/
    *.md
```

## Naming rules

- 小写 ASCII + 连字符
- CE 技能加 `ce-` 前缀
- ≤64 字符

## Prompt 策略

- Zed 用 `spawn_agent(label, message, session_id?)`
- prompt 必须自包含：role、约束、输出 schema、合并规则
- 直接内联到 SKILL.md，不用外部 prompt 文件
- **强制输出契约**：SKILL.md 里用 "MUST follow" 明确要求按 `references/sections.md` 的表格/分节收束，否则 Zed 子代理会输出自由散文

## References 处理

- 小 skill（如 ce-code-review）直接新建 `.md`
- 大 reference（如 ce-brainstorm 的渲染规则、synthesis、handoff）用 **symlink** 指向源插件目录，避免复制膨胀且行为一致：
  ```
  .agents/skills/<name>/references -> ../../../../plugins/compound-engineering/skills/<name>/references
  ```
- 只有需要 Zed 定制化时才新建覆盖版；否则复用源引用

## 输出契约模板（sections.md 必备字段）

```
## Coverage
<base ref / files changed / exclusions>

## Findings
| ID | Severity | Confidence | File | Description |

## Actionable Findings
## Testing Gaps
## Residual Risks
## Verdict
```

## 从源 skill 到 Zed SKILL.md 的常见改动

1. 加 `target: zed` 到 frontmatter
2. 把 `use Bash tool` → `use Zed's bash/terminal tools`
3. 把 `Use the Write tool` → `confirm with user before writing files`
4. 保留所有交互规则（one question per turn, blocking question tool）
5. 保留 Phase 0 output-format 解析逻辑（md vs html）

## References 处理（补充）

- 默认新建 Zed 友好的精简 `.md`，不优先用 symlink 指回超长源文件。
- 只有当源文件确实短、且 Zed 直接读取不会造成上下文负担时，才保留为 `references/` 下的完整副本或同内容小文件。

## 验证

1. 复制/建立 skill tree 到 `.agents/skills/<name>/`
2. Zed 打开 AI > Skills，确认出现
3. 触发 skill，确认 SKILL.md 正文加载
4. 确认 spawn_agent 调用片段可被解析
5. 确认子代理输出按 sections.md 格式收束（非自由散文）
