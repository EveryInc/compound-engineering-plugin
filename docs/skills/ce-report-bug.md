# `ce-report-bug`

> Report a bug in the compound-engineering plugin — gathers structured information and creates a GitHub issue at `EveryInc/compound-engineering-plugin`.

`ce-report-bug` is the **bug-filing** skill. It walks the user through six structured questions (category, component, what happened, expected behavior, repro steps, error messages), automatically gathers environment information (OS, plugin version, agent CLI version), formats a complete bug report, and creates a GitHub issue via `gh`. The skill makes filing a useful bug report fast — the alternative is opening GitHub, finding the right repo, remembering what to include, and typing it from scratch.

Beta-style explicit-invocation only (`disable-model-invocation: true`).

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Gathers structured bug info via 6 questions, collects environment data automatically, files a GitHub issue at `EveryInc/compound-engineering-plugin` |
| When to use it | When something in the compound-engineering plugin doesn't work and you want to report it |
| What it produces | A GitHub issue URL (or a formatted bug report you can file manually if `gh` isn't available) |
| Privacy | Doesn't collect personal info, API keys, credentials, or private code |

---

## The Problem

Filing a useful bug report has high friction:

- **Finding the right repo** — which org, which repo, which label?
- **Remembering what to include** — environment info, repro steps, error messages, expected vs actual behavior — easy to miss something the maintainer needs
- **Manual environment gathering** — running `uname`, finding plugin version, checking CLI version, formatting it all
- **No template** — every bug report starts from scratch; some are great, some are "it's broken"
- **Filing without `gh`** — without the CLI, the user has to copy-paste through the GitHub UI manually
- **Privacy concerns** — naïve env gathering risks including API keys or paths that reveal too much

## The Solution

`ce-report-bug` runs reporting as a structured intake → format → file flow:

- **6 questions** in a structured order — category, component, actual, expected, repro steps, error messages
- **Automatic env gathering** — OS via `uname -a`, plugin version via manifest reading, agent CLI version via `--version`
- **Template-based formatting** — every report has the same shape, so maintainers can scan quickly
- **`gh issue create`** with the right repo, title prefix, and labels (or fallback without labels)
- **Manual-fallback** when `gh` is unavailable — formatted report displayed for the user to file by hand
- **Privacy by design** — only technical info; never personal info, credentials, or code

---

## What Makes It Novel

### 1. Six structured questions in a deliberate order

The skill asks:

1. **Bug category** (multiple choice) — Agent / Command / Skill / MCP server / Installation / Other
2. **Specific component** (free text) — name of the agent, command, skill, or MCP server
3. **What happened (actual behavior)** — clear description of what the user observed
4. **What should have happened (expected behavior)** — clear description of expected behavior
5. **Steps to reproduce** — what the user did before the bug occurred
6. **Error messages** — any error output

The order matters: category and component first scope the bug; actual vs expected establishes the disconnect; repro steps + errors give the maintainer the diagnostic foothold.

### 2. Automatic environment gathering

The skill runs:

- `uname -a` for OS info
- Reads plugin manifest from platform-specific location (Claude Code: `~/.claude/plugins/installed_plugins.json`; Codex: `.codex/plugins/`; etc.)
- Runs the platform's CLI version command (`claude --version`, `codex --version`, etc.)

If any of these fail, the skill notes "unknown" and continues — don't block reporting on environment-collection issues.

### 3. Single template, consistent shape

Every report uses the same template:

```markdown
## Bug Description
**Component:** [Type] - [Name]
**Summary:** [Brief]

## Environment
- **Plugin Version:** ...
- **Agent Platform:** ...
- **Agent Version:** ...
- **OS:** ...

## What Happened
...

## Expected Behavior
...

## Steps to Reproduce
1. ...

## Error Messages
...

## Additional Context
...

---
*Reported via `/ce-report-bug` skill*
```

The footer marks the report as skill-generated so the maintainer knows it followed the canonical template.

### 4. `gh issue create` with the right scope

The skill files via:

```bash
gh issue create \
  --repo EveryInc/compound-engineering-plugin \
  --title "[compound-engineering] Bug: [description]" \
  --body "[formatted report]" \
  --label "bug,compound-engineering"
```

Right repo, right title prefix, right labels. If labels don't exist (some forks/clones may lack them), the skill retries without `--label` rather than failing.

### 5. Manual fallback when `gh` is unavailable

If `gh` isn't installed or authenticated, the skill displays the fully-formatted report to the user so they can paste it into the GitHub web UI manually. No friction lost — the reporting work is already done.

### 6. Privacy by design

The skill explicitly does **not** collect:

- Personal information
- API keys or credentials
- Private code from projects
- File paths beyond basic OS info from `uname`

Only technical information about the bug is included. This is documented in the skill so users know what's being shared.

### 7. Explicit-invocation only

`disable-model-invocation: true` prevents the skill from auto-firing on prose mentions of bugs. Bug reporting is a deliberate user choice — invoke `/ce-report-bug` directly.

---

## Quick Example

You hit a bug where `/ce-plan` produces a plan with U-IDs that aren't sequential. You invoke `/ce-report-bug`.

The skill walks through 6 questions:

1. **Category**: Skill not working
2. **Component**: ce-plan
3. **What happened**: "Plan was generated with U-IDs U1, U2, U4 — U3 was skipped without explanation."
4. **Expected**: "U-IDs should be sequential without gaps in initial generation."
5. **Repro**: "Run `/ce-plan` from a brainstorm doc with 4 implementation units. The third unit gets numbered U4 instead of U3."
6. **Error messages**: "None visible; just the wrong numbering."

Environment gathering runs in the background:
- `uname -a`: macOS arm64
- Plugin version: 3.4.1
- Agent platform: Claude Code
- Agent version: claude-code 1.2.3

Formatted report goes to `gh issue create --repo EveryInc/compound-engineering-plugin --title "[compound-engineering] Bug: U-ID numbering skips U3 in initial plan generation" --body "..." --label "bug,compound-engineering"`.

Returns:

```text
Bug report submitted successfully!

Issue: https://github.com/EveryInc/compound-engineering-plugin/issues/812
Title: [compound-engineering] Bug: U-ID numbering skips U3 in initial plan generation

Thank you for helping improve the compound-engineering plugin!
The maintainer will review your report and respond as soon as possible.
```

---

## When to Reach For It

Reach for `ce-report-bug` when:

- A skill, command, agent, or MCP integration in compound-engineering doesn't work as expected
- You want to report something the maintainer can action without follow-up questions
- You're not sure what details to include — the structured questions catch what's needed

Skip `ce-report-bug` when:

- The bug is in a different plugin or tool (this filing target is hardcoded to compound-engineering)
- It's a feature request, not a bug → file a discussion or feature-request issue manually
- You're not sure if it's a bug or expected — check `/ce-release-notes` first to see if behavior changed in a recent release

---

## Use as Part of the Workflow

`ce-report-bug` is a standalone utility — doesn't sit inside the chain. It's invoked when something goes wrong and the user wants the maintainer to know.

Common companion skills:

- **`/ce-update`** — check version first; you might be reporting a bug that's already fixed in a newer version
- **`/ce-release-notes`** — check whether the behavior changed recently; might be intended

---

## Use Standalone

Direct invocation:

- `/ce-report-bug` — walks through the 6 questions
- `/ce-report-bug "brief description"` — uses the description as initial context; still walks through the structured questions for completeness

The skill drives the intake. There's no skip-questions option — the structured intake is the value; if it's overkill for a one-line report, file via the GitHub UI directly.

---

## Reference

| Step | Action |
|------|--------|
| 1 | Gather bug info (6 structured questions) |
| 2 | Collect environment info (OS, plugin version, agent CLI version) |
| 3 | Format the bug report (consistent template) |
| 4 | Create GitHub issue via `gh` (with labels; fallback without) |
| 5 | Confirm submission and display issue URL |

Repo target: `EveryInc/compound-engineering-plugin`. Title prefix: `[compound-engineering]`. Labels: `bug,compound-engineering` (with fallback to no labels if missing).

---

## FAQ

**What does the skill collect about my environment?**
Only technical info: OS string from `uname -a`, plugin version from the manifest, agent platform name, agent CLI version. No personal info, no API keys, no credentials, no private code. The report's `Environment` section shows exactly what's included.

**What if `gh` isn't installed?**
The skill displays the fully-formatted bug report and asks you to file it manually via the GitHub web UI. No information is lost — the structured intake and formatting still happened.

**Can I report a non-compound-engineering bug?**
This skill specifically files at `EveryInc/compound-engineering-plugin`. For other plugins or tools, file directly in their respective repos. The structure of this skill is generalizable, but the repo target is hardcoded.

**What if labels don't exist on the repo?**
The skill retries without `--label`. Some forks or clones may not have the `bug` label set up; the report still files successfully without it.

**Can I edit the report before it gets filed?**
The skill walks through the questions interactively, so you can refine each answer before moving on. Once the report is formatted, the skill files via `gh` directly. If you want manual review, decline `gh` and file via the web UI yourself with the formatted text.

**Is it OK if I file the same bug twice?**
The skill doesn't deduplicate — it files what you ask. If you're worried about duplicates, search the issue tracker first. The maintainer can close duplicates as needed.

---

## See Also

- [`/ce-update`](./ce-update.md) — check plugin version; older versions may have fixed bugs
- [`/ce-release-notes`](./ce-release-notes.md) — check whether the behavior changed in a recent release; might not be a bug
