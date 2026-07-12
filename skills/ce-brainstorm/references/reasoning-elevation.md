# Fable Elevation (Claude Code only)

This reference is loaded ONLY after a positive Claude Code host check (the gate below). It carries the entire elevation engine; the calling `SKILL.md` holds only a model-name-free pointer. Never inline any part of this file into an always-loaded `SKILL.md` — the silent no-op on other harnesses depends on this text never shipping in a non-Claude context.

Elevation dispatches the reasoning-heavy authoring/interpretation step to a higher-reasoning model (in Claude Code, **Fable**) via a subagent, so a user on a cheaper session model still gets a high-reasoning result without switching their whole session.

## Mechanical host gate — the first ordered step

Before reading any Fable config key, parsing Fable intent, or emitting any Fable string, self-identify the host with the same env-var union `ce-code-review` uses:

```bash
if [ -n "${CURSOR_AGENT:-}${CURSOR_CONVERSATION_ID:-}" ]; then HOST=cursor;
elif [ "${CLAUDECODE:-}" = "1" ]; then HOST=claude;
elif [ -n "${CODEX_SANDBOX:-}${CODEX_SESSION_ID:-}${CODEX_THREAD_ID:-}${CODEX_CI:-}" ]; then HOST=codex;
else HOST=unknown; fi;
echo "HOST: $HOST"
```

These are **host-provided environment variables** — the Claude Code runtime sets `CLAUDECODE=1`, Cursor sets `CURSOR_AGENT` / `CURSOR_CONVERSATION_ID`, Codex sets the `CODEX_*` markers. This skill only reads them; it never sets them. You must actually **run this check with the shell tool** and **branch on the emitted `HOST:` line** — the `echo` is load-bearing: the variable is set inside the shell process and is gone once the command exits, so without reading the printed value you have no observable host to gate on. The value is not knowable from context.

Proceed with elevation ONLY when `HOST=claude`. On `cursor`, `codex`, or `unknown`: elevation is off and inert — do not read Fable config, do not parse intent, do not dispatch, do not mention Fable. (A stray "use fable" prompt on those hosts is handled by the SKILL.md pointer without naming a model.)

## Activation resolution (only after `HOST=claude`)

Resolve a per-skill boolean by precedence:

1. **In-prompt intent** — reason over THIS run's prompt. Affirmative intent ("use fable", "get fable help", "have fable plan this") → elevate. Negative intent ("don't use fable", "no fable") → do not elevate. Intent is *reasoned, not keyword-matched*: a passing mention of "fable" as subject matter (e.g. "design a fable-generator feature") is NOT activation.
2. **Config** — otherwise the per-skill key: `plan_use_fable` for ce-plan, `brainstorm_use_fable` for ce-brainstorm. Read it from the config file the **same way this skill's Phase 0.0 already resolves `plan_output` / `brainstorm_output`**: use the pre-resolved repo root if the skill has it, else run `git rev-parse --show-toplevel`, then read `<repo-root>/.compound-engineering/config.local.yaml` with the native file-read tool. This skill already read that file once at Phase 0.0 — reuse that result if you still have it rather than re-reading. Ignore commented (`#`-prefixed) lines. `true` → elevate; missing / commented / invalid / `false` / no file → off.
3. **Pipeline runs** — in pipeline / `disable-model-invocation` runs there is no prompt, so resolution is config-only; if the key is on, elevate. Still subordinate to the host gate — a config copied to a non-Claude harness never fires it.

If the session model is already Fable, elevation is moot: skip dispatch and the nudge.

## Elevated dispatch

When elevation is active, dispatch the reasoning-heavy step to a Fable subagent:

- Use the platform subagent primitive with a per-agent model override of **fable** (`model: "fable"` on the Claude Code `Agent`/`Task` tool).
- Pass the main agent's full working context as **file paths the subagent reads itself**, never a re-narrated prose brief. If a needed piece lives only in context, **write it to a fresh scratch file you create** (e.g. `mktemp` under the OS temp dir) rather than skipping it or summarizing it:
  - **Research / grounding evidence.** ce-brainstorm already wrote a Phase 1.1 grounding dossier to a scratch path — pass it. ce-plan consolidates its Phase 1 research findings *in context only* (Phase 1.4 summarizes; it does not write a file), so **serialize those consolidated findings to a scratch file now and pass it** — the elevated author must interpret the same research evidence the inline path had, not just the resulting decisions.
  - **Dialogue / decisions.** Write the accumulated dialogue/decisions this skill holds in context to a fresh scratch file and pass that path too.

  Re-narration is forbidden: the main model's default tendency is to compress, and a lossy summary is the failure the quality bet cannot absorb — so hand over files, not a summary.
- Tell the subagent that, for this run, elevation **supersedes this skill's default ceiling-tier convention** — that the reasoning-heavy step runs inline in the main conversation with nothing dispatched — for this step only.
- Relay the Fable output through the main agent, which stays the orchestrator.

The elevated steps: **ce-plan** — interpret research findings and author the plan, folded into one interpret-then-author call. **ce-brainstorm** — generate approaches. The ce-brainstorm integration-check consult is deferred and is NOT wired in this version.

## Transparency

- `HOST=claude`, elevation fired → surface a brief confirmation that Fable is handling the step.
- `HOST=claude`, Fable requested but unavailable (no Fable access / failed dispatch) → run the step inline on the main model and surface a brief fallback notice. Elevation is never a correctness dependency and never blocks the workflow.
- `HOST≠claude` → silent (the gate already stopped before this file loaded).

## Discoverability nudge

When ALL hold — `HOST=claude`, the run completed with elevation NOT active (no intent, config off), the session is not already on Fable, `fable_nudge` is not `false` in config, this is not a pipeline run, and the tip has not already been shown once — surface the one-line tip, then record that it was shown.

"Shown once" is enforced by a **per-user marker file at a stable path outside the repo** (per-user, not per-checkout — e.g. `~/.config/compound-engineering/fable-nudge-seen`). Before showing: if the marker exists, skip the nudge. After showing: create the marker (with its parent dir). A missing marker means "not yet shown."

- **ce-plan:** `💡 Tip: add "use fable" to your prompt and Fable will author your plan with deeper reasoning — your session model stays as-is. Set plan_use_fable: true to make it the default.`
- **ce-brainstorm:** `💡 Tip: say "use fable" and Fable will generate sharper approaches — no session switch needed. Set brainstorm_use_fable: true to default it on.`

Never show the nudge when elevation was active (redundant), in pipeline runs (no reader), or off-Claude (the gate stopped earlier).
