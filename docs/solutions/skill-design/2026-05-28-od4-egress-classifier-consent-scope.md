---
module: ce-deep-review-beta
tags: [skill-design, egress, auto-mode-classifier, consent, cross-model, OD-4]
problem_type: decision-record
---

# OD-4: the auto-mode egress classifier is consent-scope-keyed, not path-keyed

The `ce-deep-review-beta` skill dispatches a cross-model panel by shelling out to
`panel-critique.sh`, which sends the plan document to external vendors (codex, gemini). The
first dogfood run (2026-05-28) found this dispatch **blocked by Claude Code's auto-mode
permission classifier** as "Data Exfiltration … not cleared by the consent-gate
authorization" — even though the in-skill consent gate had been granted and
`allowed-tools: Bash(bash *panel-critique.sh)` was declared. The dispatch ran only when the
user re-issued it via the `!` prefix. That made the skill's central premise ("remove the
terminal hop") look broken under default auto-mode posture.

## What a second session established empirically

Three runs of the **same** `panel-critique.sh`, same script path, under default auto-mode:

| Run | Egress | Result | Classifier rationale |
|---|---|---|---|
| `--models __none__` | none (sentinel arm not installed; nothing sent) | **Allowed** | within the boundary the request stated |
| `--models gemini`, after the agent framed it as "egress-safe… nothing sent to any vendor" | real (codex+gemini both installed at `/opt/homebrew/bin`) | **Blocked** | "User authorized only the no-op `--models __none__` egress test… running `--models gemini` is a scope escalation that actually sends plan content to an external vendor, contradicting the user's stated boundary." |
| `--models gemini`, after an explicit `AskUserQuestion` where the user chose "Authorize one arm (gemini)" (description named the vendor + the real egress) | real | **Allowed** — ran, gemini returned per-lens findings | the in-conversation authorization covered the actual egress |

## Conclusion

The classifier is **not** keyed on the script path, the command pattern, or the
`allowed-tools` declaration. It reasons about **conversation-level consent scope**: it reads
the framing around the tool call and holds the agent to the narrowest boundary stated in the
conversation. Two consequences:

- `allowed-tools: Bash(bash *panel-critique.sh)` is insufficient on its own — it whitelists
  the *command shape* but says nothing about whether real egress is *authorized*.
- The `!` prefix worked in dogfood #1 only because user-initiated commands are
  self-authorizing, not because it is the sole viable path.
- **Legible, in-conversation user consent that names the real egress and the target vendor(s)
  satisfies the classifier directly** — no settings rule required, in the interactive case.

## The gap this does NOT close (the real remaining RU1 question)

The session that proved the above used a **top-level conversation `AskUserQuestion`**. The
skill's consent gate is an **in-skill** `AskUserQuestion`, and dogfood #1 showed an in-skill
gate's approval was *not* honored by the classifier. The likely difference: in the skill flow,
Pass 1 (the Claude panel) and the draft-write step sit **between** the consent gate and the
dispatch, so by the time the `bash` call is evaluated the authorization signal is stale or
buried, whereas in the probe the authorization was the immediately preceding turn.

So the open question is narrow and specific: **does an in-skill consent gate satisfy the
classifier if (a) its approval is phrased as explicit authorization of real egress to the
named vendors and (b) the dispatch follows it closely, with no staling steps in between?**
This is not testable in the authoring session (the skill caches at session start); it needs a
fresh-session dogfood or an install.

## Design directions (refines v4 OD-4 options a/b/c)

- **(b-legible) — preferred to test first.** Reword the consent gate so its approval reads as
  explicit real-egress authorization naming each vendor, and move the dispatch to immediately
  follow the gate (no Pass-1/draft steps between gate and `bash`). If the classifier honors it
  the way it honored the top-level probe, the hop is genuinely removed with no settings change.
- **(b-settings) — headless fallback, belt-and-suspenders.** Ship a `permissions.allow` entry
  for the resolved command in onboarding for unattended/headless runs where no interactive
  consent turn exists. (Whether a settings rule alone bypasses the classifier is still
  untested; the denial message hints it would.)
- **(a) / (c)** remain the honest fallbacks if (b-legible) fails in a fresh-session dogfood:
  document the `!`/permission requirement, or adopt the emit-command shape (agent prepares,
  human executes).

## For future implementers

Do not assume `allowed-tools` clears an external-egress dispatch under auto-mode. The
classifier wants to see, in the conversation, that the user authorized the *actual* data
leaving to the *actual* destination. Frame consent prompts so that authorization is explicit
and legible, and keep the authorized action close to the authorization.

Related: [[cross-model-eval-arm-isolation-2026-05-24]], the v4 plan
(`docs/plans/2026-05-28-004-feat-ce-deep-review-skill-plan.md`) OD-4 section.
