# Evidence and Delegation

Read before grounding or delegation. The skill body owns interaction, completion, and scratch creation; this reference owns the evidence pass and capability fallbacks.

## Interaction method

The skill body's interaction rule decides whether a question is needed. When it is, use the host's question capability already in the current tool list; never call a user-facing question tool to discover whether it exists. If no such tool is available, ask in chat only when a person is participating. Otherwise return the missing information to the calling workflow.

## Model tiers

Dispatch is tiered by task shape, never hardcoded to a model name:

- **Extraction tier** — the work-recap scout and each behavior-trace scout: search-and-quote work. Use the platform's cheapest capable model when the harness exposes a known override; otherwise inherit.
- **Ceiling tier** — the explainer composition, including its `Check yourself` section. This runs in the main conversation on the orchestrator's model; nothing is dispatched for it.

**Degradation rule.** When the platform's subagent primitive cannot select per-agent models, dispatch scouts on the inherited model and keep their read budgets. When the platform has no subagent primitive at all, run the scout work inline with the same budgets. When a dispatch fails, treat a concurrency or active-agent-limit error as backpressure — retry after a slot frees; a launch that fails for a reason that survives correcting the invocation runs that scout's work inline with the same budgets, disclosed in one line.

## Run directory

The skill body carries the ownership-checked block that creates `$RUN_DIR`; run it from there so this file cannot drift from it.

## Grounding by input shape

**Repo-touching inputs** (a concept with footprint in this repo, a diff, a recap): use the project's active instructions already in context and go directly to the diff, call-sites, current source, or commits. Read `CONCEPTS.md` when canonical vocabulary matters. If the topic cannot be scoped from the input and existing context, allow one targeted root or workspace probe.

**Diff mode:** resolve the change (the `diff:` ref, or the most recent substantial change when the request points at one implicitly) and gather its evidence — the diff itself, the files it touches, any plan or solution doc that motivated it.

**Recap mode:** seed the scout with `references/agents/work-recap-scout.md` (extraction tier), passing the resolved window, the repo root, and `$RUN_DIR`. It returns an evidence summary with commit shas and `file:line` pointers, and writes `recap-evidence.md`. **Empty window** follows the skill body: report the absence of activity without an explainer artifact.

**External concepts** (no footprint in this repo): skip repo grounding entirely — do not force repo context into the output. Research with whatever web tools are reachable. When none are, you may explain from model knowledge, but label that content **Unverified — from model knowledge, not checked against current sources** in the response or artifact metadata.

**Idea mode:** the idea is a fixed given. Explain its implications, mechanics, and trade-offs for the user's understanding. Never scope it (`ce-brainstorm`'s job), never generate and rank alternatives (`ce-ideate`'s job).

## Behavior and rationale

For a how question, trace the relevant trigger through its state changes, ownership boundaries, and effect. Inspect actual source and relevant tests; a filename or conversation claim does not establish behavior. Preserve the conditions and failure paths that matter to the requested use.

One pass is enough when that trace can name those boundaries without hand-waving. When one pass cannot, split the question into one slice per ownership boundary the answer depends on and dispatch a behavior-trace scout for each slice. Read `references/agents/behavior-trace-scout.md` and seed a generic subagent at the extraction tier with the question, its slice, and a distinct dossier path under `$RUN_DIR`. Dispatch the slices together. Two slices is the smallest split. More than four means the question is still unscoped: narrow it and trace again rather than adding scouts. Read each dossier from its path, and reconcile overlap or contradiction by reading the source. A gist is not the trace.

For a why question, look for the decision record: motivating docs, comments, git history, PR discussions, or linked issues. Follow evidence to available sources when the local record cannot answer the question, within the request's source restrictions. Access to team chat is not permission to search it when the calling workflow makes that opt-in. Expand investigation to resolve material gaps, not to satisfy a source quota.

Code shows behavior, not necessarily intent. Cite documented reasons separately from supported inferences; report contradictions and unknowns. A missing search result does not prove there was no reason. Establish whether a historical constraint still applies before presenting it as a current requirement. When the explanation informs a change, make the relevant constraints and unresolved risks usable by that next step without selecting an approach for it.
