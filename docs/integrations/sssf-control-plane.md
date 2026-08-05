# Running SSSF as the Control Plane with CE Judgment Content

How to run the Super Simple Software Factory (SSSF) as a deterministic control plane while slotting Compound Engineering (CE) judgment content — planning standards, review rubrics, task shaping — into SSSF's stamped prompt files.

All file paths below are relative to a repo where SSSF has been stamped, except paths under `.claude/skills/sssf/`, which live in the SSSF skill source. Every mechanical claim was verified against the SSSF revision pinned in the footer.

## 1. When to choose this setup

SSSF and the CE plugin sit at different layers:

| | CE plugin | SSSF |
|---|---|---|
| Control flow | Agent judgment inside prose skills; the model decides sequencing within a skill's protocol | Deterministic Python ADW scripts (`adws/adw_*.py`); agents run only inside bounded phases the script opens |
| Output contract | Structured envelopes at a few pipeline seams | Every agent call parses against a concrete Pydantic type; malformed JSON is re-prompted in the same session, bounded |
| Verification | Gate scripts plus skill prose | Code-enforced gates, per-agent `writes:` permission enforcement with rollback, deterministic quality commands |
| Observability | Per-run JSONL journal (best-effort) | SQLite trace (`adws/adw_data/sssf.db`) with a Bun/Vue visualizer |
| Coding agent | Whatever harness the skill runs in | Pi only in v1 (`claude_code` is schema-valid but stubbed; `agents.validate()` rejects it) |

Choose SSSF-plus-CE-content when a workflow is repeatable enough to run tens or hundreds of times unattended and the cost of an agent re-deciding sequencing each run outweighs the setup cost of a stamped factory: the same plan-build-review chain against a queue of small specs, batch documentation runs, nightly fix loops. Stay plugin-only when work is exploratory, one-off, or needs mid-run human judgment — SSSF's phases are fixed by the ADW script you launch, and "then do X" prose in a prompt does not change the chain.

The two install side by side without conflict: SSSF stamps into `adws/` and a `justfile`; the CE plugin installs skills into the harness. SSSF is MIT-licensed and its stamped prompts are explicitly user-owned, designed to be replaced — which is exactly what this recipe does.

## 2. Install checklist

Condensed from SSSF's `cookbooks/install.md` and `README.md`.

1. **Prereqs:** [`uv`](https://docs.astral.sh/uv/), [`pi`](https://github.com/mariozechner/pi-coding-agent), and `sqlite3` on PATH. `bun` is needed only for the trace visualizer.
2. **Get the skill:** copy the `sssf` skill directory into the target repo (`.claude/skills/sssf/`) or user scope (`~/.claude/skills/sssf/`).
3. **Stamp:** from the target repo root (the cwd is where everything lands):

   ```bash
   uv run .claude/skills/sssf/scripts/install.py
   ```

   This copies the ADW scripts, `adw_modules/`, the agent roster (`adws/adw_sssf_config/sssf.config.yaml`), the user-owned `adws/adw_data/prompt_engineering/{planner,builder,scout,reviewer,documenter}/` prompt files, `adws/adw_data/harness_engineering/`, a `justfile`, and `.env.sample`. Re-running is safe: it skips every existing file.
4. **Env keys:** `cp .env.sample .env`, then set one API key per provider your roster names. Every `model:` in `sssf.config.yaml` is written `provider/model-id`, and the provider half decides which key must be set (which env var pi reads for a provider comes from `~/.pi/agent/models.json`). The starter roster names three providers -> `OPENROUTER_API_KEY`, `FIREWORKS_API_KEY`, `OPENAI_API_KEY`; point every agent at one provider and you only need that provider's key.
5. **Pi resolves:** `pi --version` works (else set `PI_PATH` in `.env`), and the config's models are registered ids in `~/.pi/agent/models.json` (`pi --list-models`).
6. **Git repo:** ADWs that end in a commit phase call `git_helper.commit_all`, which raises if the cwd is not a git repository — `git init` and a first commit before `adw_plan_build.py`, `adw_plan_build_test.py`, or `adw_simple_sdlc.py`. `adw_document.py` also needs one: it measures the change with `git diff` against a base ref (`main` by default, `--base` to override).
7. **Smoke test:**

   ```bash
   just demo
   sqlite3 adws/adw_data/sssf.db "select adw_id, status from sessions order by started_at desc limit 1;"
   ```

   Green means config validated, session minted, Pi ran, envelope parsed, and events landed in the trace db. Fix a failing smoke test before composing chains.

## 3. The prompt-swap map

CE judgment content goes into the stamped prompt files under `adws/adw_data/prompt_engineering/<agent>/`. These are user-owned the moment they are stamped — edit them there, never back inside the skill — and a plain re-run of `install.py` never overwrites them.

| File | Section | What goes there | CE content examples |
|---|---|---|---|
| `<agent>/system.md` | `## Instructions` | The agent's static identity and standards — how it judges, what quality means | CE's plan-quality bar (concrete files-to-touch, verification steps, no restated requirements) into `planner/system.md`; CE's review severity rubric and evidence rules into `reviewer/system.md` |
| `<agent>/user.md` | `## Task` | The per-run task steps between the `## Variables` block and the `## Report` block | Task shaping: what to read first, what a finished artifact contains, ordering of steps |

Everything outside those two sections is contract, not judgment — see the next section. Both files pass through the same `{{placeholder}}` substitution (see item 2 below), so CE content pasted into `system.md` must not contain literal `{{prompt}}`, `{{previous_envelope}}`, or `{{context_handoff_dir}}` strings unless you intend them to be substituted.

## 4. The do-not-touch list

Each item names the SSSF source that enforces it (paths under `templates/` in the skill become the stamped paths without the `templates/` prefix).

1. **The synced output triad.** The Pydantic type in `adws/adw_modules/data_types.py`, the `## Report` JSON example in the agent's `user.md`, and `output_type=` at every ADW call site (e.g. `adw_plan_build.py`) are one contract — change any one, change all three in the same edit. Drift between them makes the agent produce what the prompt asked for while the parser rejects what the type expects, taxing every call with bounded correction retries before landing. Source: `SKILL.md` ("The output contract is a synced triad"), `cookbooks/update_modules.md`, `adw_modules/agents.py` (`_parse_with_retries`).

2. **The three template placeholders.** `{{prompt}}`, `{{previous_envelope}}`, and `{{context_handoff_dir}}` are substituted by literal string replacement (`text.replace("{{" + key + "}}", value)` in `adw_modules/prompts.py`) — there is no parser and no error for an unmatched placeholder, so a typo like `{{previous_envelop}}` ships the raw placeholder text to the model silently. Substitution runs on **both** `system.md` and `user.md` (`adw_modules/agents.py`, `execute()` renders both), so keep the placeholders byte-exact and don't introduce accidental `{{...}}` sequences in swapped-in CE prose.

3. **The reviewer's `status`-vs-`approved` split.** In `ReviewOutput`, `status` means "did the review itself run to completion"; the verdict is `approved` plus `blocking` (`reviewer/user.md`: "`status` is `success` when the review itself completed — it is not the verdict"). Any envelope with `status != "success"` raises and **fails the phase** (`adw_modules/agents.py`, end of `execute()`). CE review content that trains the model to express rejection as `status: "fail"` therefore kills the phase instead of producing a rejected review — express the verdict only through `approved: false` and `blocking`.

4. **Moving an agent's output location is a multi-place edit.** The write instruction in that agent's `user.md`, every downstream prompt that reads the old path (e.g. `reviewer/system.md` reads `<context_handoff_dir>/plan.md`), and — when the path is in the repo rather than under `context_handoff/` — the agent's `writes:` list in `sssf.config.yaml` (the starter planner is limited to `writes: [specs/]`). `adw_modules/permissions.py` enforces `writes:` after every agent call: unauthorized repo changes are rolled back and the phase dies with `PermissionBreach`. The session runtime under `data_dir` (including `context_handoff/`) is always writable, so moves within it skip the `writes:` edit but still need the downstream-prompt edit.

5. **No commit/branch/push instructions in prompt content.** Committing is a code phase: the ADW script calls `git_helper.commit_all` with the agent's `commit_message` envelope field (`cookbooks/create_adw.md`). "Then commit" in a prompt is a chain choice that belongs to which ADW you launch, not prose the agents read (`cookbooks/how_to_prompt_for_the_eng.md`: "Do not address the harness in the prompt"). Read-only git is fine and present in stock prompts — the reviewer is told to use `git diff`.

6. **Wiring real quality commands is mandatory, not optional.** Every block in `adws/adw_modules/quality.py` ships as an `echo` placeholder that **exits 0 and announces it is fake** — an unedited stamp gives green-but-fake quality phases. Replace each `_placeholder(...)` with the real command as an **argv list** (never a shell string) using **bare binary names** (`["bun", "test"]`, `["uv", "run", "pytest", "-q"]` — never an absolute path, the blocks inherit the operator's environment). Delete unused blocks and drop them from `run_quality()`'s list.

7. **`--force` reinstall clobbers user-owned files.** `install.py --force` overwrites ALL existing stamped files, including `sssf.config.yaml` and the `prompt_engineering/` prompts holding your CE content (`cookbooks/install.md`). Commit or back up before refreshing stamped code with `--force`.

8. **Session resume is invalidated by model changes, not thinking changes.** `agent_map.json` records the model each coding-agent session was created with; a joined run (`--adw-id`) whose config now names a different model starts that agent fresh instead of resuming its context window (`adw_modules/agents.py`, `_agent_session_id`; `cookbooks/update_config.md`). Retuning `thinking:` keeps the session.

9. **Extension-registered tools must be named in `tools:`.** Once an agent has a `tools` list (its own or inherited from `defaults`), a tool registered by one of its `harness_engineering` extensions is filtered out unless named in that list — the extension loads, the run passes, and the tool is silently never offered (`cookbooks/update_config.md`; `references/config.md`). Agents with `tools` unset (`None`) get all tools and are unaffected.

## 5. Worked example: CE planning standards into the planner

Before — the stamped `adws/adw_data/prompt_engineering/planner/system.md` `## Instructions` (abridged):

```markdown
## Instructions

- Read only what you need to understand the request.
- Write the full plan to `<context_handoff_dir>/plan.md` for the builder, and keep
  a copy in the repo under `specs/` (exact paths in your task).
- Keep the plan concrete: files to touch, changes to make, how to verify.
- Do not implement anything.
```

After — the same section carrying a CE-style plan-quality bar. Output paths and the substitution-safe wording stay; only the judgment content changes:

```markdown
## Instructions

- Read only what you need to understand the request.
- Write the full plan to `<context_handoff_dir>/plan.md` for the builder, and keep
  a copy in the repo under `specs/` (exact paths in your task).
- Every unit of the plan names the files to touch, the observable behavior change,
  and the command that verifies it. A unit without a verification command is not done.
- State what is explicitly out of scope. A plan that only lists inclusions invites
  scope drift during the build.
- Prefer the smallest design that satisfies the request; flag any speculative
  generality as a decision for the requester, not a default.
- Do not restate the request as plan steps. If a step's success cannot be judged
  false, rewrite it until it can.
- Do not implement anything.
```

What is deliberately untouched: `planner/user.md` — its `## Variables` block (the three `{{placeholders}}`), its `## Task` output paths, and its `## Report` block showing the exact `PlanOutput` JSON stay byte-identical, because they are the triad's prompt leg and the harness's substitution surface, not judgment content. (Note the `## Report` block lives in `user.md`; `system.md` has no report section.)

## 6. Pinned revision

| Field | Value |
|---|---|
| SSSF repository revision | `de31374882e7a4e3e5b7bb9bd09e69dc2f779356` |
| Branch | `main` |
| Verification date | 2026-08-05 |

Every mechanical claim above was re-verified against the SSSF source files at this revision. SSSF is an external moving target: before relying on a specific claim against a newer SSSF revision, re-check the cited file.
