# Orchestration: asking, dispatching, scratch, and menu shape

Required read before the first blocking question, the first subagent dispatch, or the run-directory creation in Phase 2 — whichever comes first. The skill body carries the phase order and the ordering rules; `references/destinations.md` carries Phase 6's menu and per-option routing.

## Interaction method

When you must ask the user a question, use the platform's blocking question tool: `AskUserQuestion` in Claude Code (call `ToolSearch` with `select:AskUserQuestion` first if its schema isn't loaded), `request_user_input` in Codex, `ask_question` in Antigravity CLI (`agy`), `ask_user` in Pi (requires the `pi-ask-user` extension). Fall back to numbered options on the host's user-visible chat surface only when no blocking tool exists in the harness or the call errors (e.g., Codex edit modes) — not because a schema load is required. In the fallback, stop and wait for the user's reply. Never silently skip the question. Ask one question at a time.

## Model tiers

Dispatch is tiered by task shape, never hardcoded to a model name:

- **Extraction tier** — the work-recap scout: search-and-quote work. Use the platform's cheapest capable model when the harness exposes a known override; otherwise inherit.
- **Ceiling tier** — the explainer composition, the check-in reasoning, and the corrections. These run in the main conversation on the orchestrator's model; nothing is dispatched for them.

**Degradation rule.** When the platform's subagent primitive cannot select per-agent models, dispatch scouts on the inherited model and keep their read budgets. When the platform has no subagent primitive at all, run the scout work inline with the same budgets. When a dispatch fails, treat a concurrency or active-agent-limit error as backpressure — retry after a slot frees; a launch that fails for a reason that survives correcting the invocation runs that scout's work inline with the same budgets, disclosed in one line.

## Run directory

Every run gets a run directory, created in Phase 2 before any artifact exists. Run this block as written rather than improvising a `mkdir`: the checks it makes refuse a scratch root you do not own or one reached through a symlink.

```bash
SCRATCH_ROOT="/tmp/compound-engineering-$(id -u)";
[ ! -L "$SCRATCH_ROOT" ] && (umask 077; mkdir -p "$SCRATCH_ROOT") 2>/dev/null && [ ! -L "$SCRATCH_ROOT" ] && [ -O "$SCRATCH_ROOT" ] && [ -w "$SCRATCH_ROOT" ] || SCRATCH_ROOT="${TMPDIR:-/tmp}/compound-engineering-$(id -u)";
if [ -L "$SCRATCH_ROOT" ]; then echo "unsafe scratch root symlink: $SCRATCH_ROOT" >&2; exit 1; fi;
(umask 077; mkdir -p "$SCRATCH_ROOT") || exit 1;
if [ -L "$SCRATCH_ROOT" ] || [ ! -O "$SCRATCH_ROOT" ]; then echo "scratch root is not owned by the current user: $SCRATCH_ROOT" >&2; exit 1; fi;
chmod 700 "$SCRATCH_ROOT" || exit 1;
RUN_DIR="$SCRATCH_ROOT/ce-explain/$(date +%Y%m%d)-$(openssl rand -hex 3)";
(umask 077; mkdir -p "$RUN_DIR") || exit 1; chmod 700 "$RUN_DIR" || exit 1;
echo "$RUN_DIR";
```

## Grounding by input shape

**Repo-touching inputs** (a concept with footprint in this repo, a diff, a recap): use the project's active instructions already in context and go directly to the diff, call-sites, current source, or commits. Read `CONCEPTS.md` when canonical vocabulary matters. If the topic cannot be scoped from the input and existing context, allow one targeted root or workspace probe.

**Diff mode:** resolve the change (the `diff:` ref, or the most recent substantial change when the request points at one implicitly) and gather its evidence — the diff itself, the files it touches, any plan or solution doc that motivated it. Gather silently: nothing learned here is narrated to the user until the Phase 3 ordering rule is satisfied.

**Recap mode:** seed the scout with `references/agents/work-recap-scout.md` (extraction tier), passing the resolved window, the repo root, and `$RUN_DIR`. It returns an evidence summary with commit shas and `file:line` pointers, and writes `recap-evidence.md`. **Empty window** (no git activity, no doc changes): say so, offer to widen the window, write no artifact, and end the run after the user responds.

**External concepts** (no footprint in this repo): skip repo grounding entirely — do not force repo context into the output. Research with whatever web tools are reachable. When none are, you may explain from model knowledge, but the artifact must label that content **Unverified — from model knowledge, not checked against current sources** in its metadata header.

**Idea mode:** the idea is a fixed given. Explain its implications, mechanics, and trade-offs for the user's understanding. Never scope it (`ce-brainstorm`'s job), never generate and rank alternatives (`ce-ideate`'s job).

## Destination menu shape

Detect destinations by capability — probe the agent's own toolset and session context, never a closed list, and never treat a missing binary, env var, or unloaded MCP tool as proof a destination is unavailable when a connector could supply it. Local file and Leave it are ungated and always offered. For default HTML runs, offer one preferred publisher: Claude Artifact when running in Claude Code with its Artifact tool present; otherwise ht-ml.app. Do not show both by default, but honor an explicit user request for either. Offer only what is detected; absence hides an option silently.

Count visible options against the platform's cap first (Claude Code's `AskUserQuestion` allows up to 4 explicit options; Codex's `request_user_input` only 2-3): when the visible set exceeds the cap, render a numbered list in chat with "Pick a number or describe what you want." and wait instead.
