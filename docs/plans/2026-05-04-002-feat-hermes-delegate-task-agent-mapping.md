---
title: "feat: Map CE agents to Hermes delegate_task instead of generated skills"
type: feat
status: draft
date: 2026-05-04
supersedes_partial: docs/plans/2026-05-01-001-feat-hermes-conversion-target-plan.md
---

# feat: Map CE agents to Hermes `delegate_task` instead of generated skills

## TL;DR

The Hermes target was added on `feat/hermes-conversion-target` (PR pending) using
the same playbook as Pi/Codex/Gemini: every CE agent emits as a generated skill
with prefix `agent-<name>`. That choice **silently strips the parallelism guarantee**
the Compound Engineering plugin was built around (`/ce-code-review` dispatching
8+ specialist reviewers concurrently in isolated contexts). On Hermes the agent
becomes inline prose loaded into the orchestrator's context — no isolation, no
parallel execution, no kind distinction beyond a name prefix.

This plan refits the Hermes target so CE agents map to **Hermes `delegate_task`**
calls instead of generated skills. The agent's body becomes the subagent prompt;
the agent's `tools:` list becomes the subagent's `toolsets`; orchestrator skills
that today call `Task ce-foo(args)` (Claude Code shape) get rewritten to a
`delegate_task` invocation pattern Hermes recognizes natively.

---

## 0. Pressure-test the user's premise

Before we plan implementation, audit the conversation that motivated this work.
The user explicitly asked us to verify the framing was correct. Three claims
were made; here is the verdict on each.

### Claim 1: "Agents in this plugin are 50+ specialist subagents that orchestrators spawn in parallel."

**Verified true.** `plugins/compound-engineering/agents/` contains 50+ files
matching `ce-*-reviewer.agent.md`, `ce-*-researcher.agent.md`,
`ce-*-analyst.agent.md`, `ce-*-resolver.agent.md`. The flagship orchestrators
(`/ce-code-review`, `/ce-plan`, `/ce-doc-review`, `/ce-resolve-pr-feedback`,
`/ce-compound`) all describe parallel dispatch:

- `ce-code-review/SKILL.md:430-454` — "spawning many agents in parallel",
  bounded parallel dispatch, queueing on harness limits, model override per dispatch.
- `ce-plan/SKILL.md:199-213, 269-271` — "Run these agents in parallel:" with
  literal `Task ce-repo-research-analyst(...)` / `Task ce-best-practices-researcher(...)`
  invocations.
- `ce-doc-review/SKILL.md:9` — "Dispatches specialized reviewer agents in parallel".
- `ce-resolve-pr-feedback/SKILL.md:191-193` — explicit batching rules
  ("If 1-4 dispatch units, dispatch all in parallel; for 5+, batch in groups of 4").

The agents are not decorative. Parallel dispatch with isolated contexts is load-bearing.

### Claim 2: "Hermes' closest equivalent for short-lived parallel agents is `delegate_task`."

**Verified true.** Per the system tool catalog and
`subagent-driven-development` skill: `delegate_task` accepts a `goal`,
`context`, `toolsets`, optional `role`, and either a single task or a `tasks[]`
array (parallel batch up to `delegation.max_concurrent_children`). Each child
runs in an isolated session with its own terminal and toolset; only the final
summary returns. This matches the contract Claude Code's `Agent` /
`Task(subagent_type=...)` provides. Profiles and Kanban workers are
*persistent* mechanisms — wrong granularity for ephemeral per-task
reviewers; correct dismissal in the original answer.

One caveat the original answer glossed over: `delegate_task` runs
**synchronously inside the parent turn**. If the parent is interrupted, the
child is cancelled with `status='interrupted'`. For CE workflows this is fine
(reviewers are bounded, runtime ~1-3 minutes), but `/ce-work` -style long-running
loops that span multiple turns cannot use it. Those skills were already flagged
as degraded on Hermes in the existing spec (`docs/specs/hermes.md` "Known UX
degradations" section), so the gap is documented, just not as a `delegate_task`
limitation.

### Claim 3: "Skills pass through unchanged; only agents need real work."

**Mostly true, with one missed implication.** Skills do pass through with a
body rewrite. But the body rewrite (`transformContentForHermes`, current
implementation in `src/converters/claude-to-hermes.ts:199-290`) rewrites
`Task agent(args)` to `"Use the agent skill to: args"`. That string instructs
the host agent to **load the converted skill in its own context**, NOT to
spawn a subagent. So even though the SKILL.md *body* of `ce-plan` is preserved,
its dispatch semantics are silently changed: parallel-dispatched specialist
agents become sequentially-loaded skill prose in the same context window. This
is the bug we are fixing.

### Claim 4: "Convert to OpenClaw and run `hermes claw migrate` as a shortcut."

**Worth saying out loud, but not adopted.** OpenClaw migrate handles skills
and MCP, but per the original answer's own caveat it would also flatten agents
to skills — same problem, different format. The shortcut buys nothing for the
parallelism remap; it only saves us from writing the skills + MCP halves of
the converter, which we already wrote on `feat/hermes-conversion-target`.
Reject.

### What the original answer got wrong

The original answer recommended **converting agents to skills as the default,
with a note that `/ce-code-review`-style parallel orchestration "would need to
be redone manually".** That framing implies the converter ships agent-as-skill
and leaves orchestrator surgery to the user. That is not acceptable for a
target marketed as "install and use" — orchestrator skills *are* the user-facing
entry points (`/ce-code-review`, `/ce-plan`). Shipping them broken on Hermes
would render the most-used CE workflows worse than Claude Code, with no
warning beyond the spec doc's "Known UX degradations" line.

The correct framing — and what this plan executes — is:

- **Agents become `delegate_task` invocations**, not skills.
- **Orchestrator bodies are rewritten** so `Task ce-foo(args)` becomes a
  Hermes-native `delegate_task(goal=..., context=..., toolsets=...)`-shaped
  instruction. The rewrite is not perfect (LLM has to interpret prose), but
  the prose is *unambiguously aimed at delegate_task*, not at skill loading.
- **Agent prompts are persisted as a payload** the orchestrator can reference
  in its `delegate_task` `context` field. Two storage options are evaluated
  in `## Key Technical Decisions`; the plan picks one with rationale.

---

## 1. Summary

Replace the `agent → cmd-/agent- prefixed skill` mapping in
`src/converters/claude-to-hermes.ts` with an `agent → delegate_task payload`
mapping. Agents stop emitting as skills; their prompt bodies are written to
`~/.hermes/skills/compound-engineering/agents/<name>.md` (a payload directory,
not a skill directory — Hermes will not load it as a skill, the orchestrator
will read it via `read_file`).

Update `transformContentForHermes` so `Task ce-foo(args)` rewrites to a
Hermes-native delegation snippet that:

1. Names the agent (`ce-foo`).
2. Tells the host agent to use the `delegate_task` tool.
3. Points at the prompt payload location for the agent's body.
4. Threads `args` into the `goal`/`context` fields.
5. Preserves parallelism intent (mentions "in parallel" / "as a batch" when
   the surrounding prose already says so).

Commands continue emitting as generated skills (`cmd-<name>`) — that mapping
is correct because Claude Code commands ARE single-turn skill-like entry
points, not parallelizable workers. Only agents change.

---

## 2. Problem Frame

The Hermes target shipped on PR `feat/hermes-conversion-target` translates
agents using the same shape as Pi: each agent becomes a generated SKILL.md at
`~/.hermes/skills/agent-<name>/SKILL.md` with the agent body folded in.
Two consequences nobody explicitly weighed:

**A. Loss of context isolation.** When the orchestrator skill body says
`Task ce-security-reviewer(diff context)`, the post-rewrite output is
`Use the ce-security-reviewer skill to: diff context`. Hermes's host agent
loads that skill into its OWN context. The reviewer's 4KB system prompt now
shares the orchestrator's context window with 7 other reviewer prompts and
the diff. For a `/ce-code-review` invocation that dispatches 8 personas, the
orchestrator's context burns ~30-50KB on reviewer prompts alone before any
review work happens. Compound-engineering's whole architectural premise —
"give each persona a fresh context and a single job" — is silently violated.

**B. Loss of parallelism.** A skill loaded into context produces output
sequentially. Even if the host agent emits multiple "Use the X skill" lines
in one turn, the model produces them serially in a single token stream. The
8 personas don't run concurrently; they run as one giant context-bloated
solo monologue. `/ce-code-review` which takes ~90 seconds on Claude Code
(parallel) takes 10+ minutes on Hermes (serial, context-degraded).

**C. Type confusion in the skill index.** The plugin registers 50+ extra
"skills" under `~/.hermes/skills/agent-*` that are not user-callable in any
meaningful sense — they're internal subagent prompts. Hermes' skill
auto-discovery (description-based relevance ranking on user prompts) starts
suggesting `agent-ce-security-reviewer` as a skill candidate when a user
mentions security, even though that agent is meant to be invoked only by
the code-review orchestrator with a specific diff context. The user gets
weird suggestions and the relevance index is noisy.

The fix removes all three failure modes by routing agents through
`delegate_task` and storing their prompts in a non-skill location.

---

## 3. Requirements

- **R1.** Agents do NOT emit as `~/.hermes/skills/agent-<name>/SKILL.md`.
  Agents emit as `~/.hermes/<pluginName>/agents/<name>.md` — a *payload*
  file the orchestrator skill body will reference, NOT a skill Hermes
  auto-discovers.
- **R2.** `transformContentForHermes` rewrites `Task ce-foo(args)` to a
  Hermes-native delegation snippet that names the tool (`delegate_task`),
  points at the prompt payload (`~/.hermes/<pluginName>/agents/ce-foo.md`),
  threads `args` into `goal` / `context`, and preserves "in parallel" intent
  when the immediately surrounding prose (within 3 lines) declares it.
- **R3.** Commands continue emitting as `cmd-<name>` generated skills with
  the existing frontmatter. **No change to command handling.**
- **R4.** Passthrough skills (the user-callable ones — `ce-plan`,
  `ce-code-review`, `ce-doc-review`, etc.) still emit at
  `~/.hermes/skills/<name>/SKILL.md`. Their bodies pick up the new
  `Task → delegate_task` rewrite via `copySkillDir`'s body transform path.
- **R5.** The install manifest gains a new tracked group: `agent_payloads`,
  alongside the existing `skills` group. Reinstall removes orphan agent
  payloads same way it removes orphan skills.
- **R6.** Cleanup (`cleanup --target hermes`) removes both the `skills` and
  `agent_payloads` groups via the shared managed-artifacts helpers.
- **R7.** Agent `tools:` frontmatter is mapped to a Hermes `toolsets:`
  hint embedded in the payload's frontmatter. The orchestrator's
  `delegate_task` invocation is expected to read this hint and pass it as
  the `toolsets` argument. This is advisory — Hermes will degrade
  gracefully if the orchestrator ignores it.
- **R8.** `docs/specs/hermes.md` is updated to document the agent-as-payload
  mapping, the `delegate_task` rewrite, and the recovery path if Hermes
  ever ships a native `Agent`-style primitive (in which case payloads
  become a thin wrapper).
- **R9.** Existing converter tests and writer tests are updated, not
  deleted. The current tests assert the agent-as-skill shape; that shape
  is wrong, so the tests must change. **Do not preserve broken tests.**
- **R10.** A new test scenario verifies the `Task → delegate_task`
  rewrite correctness: same input that produces "Use the ... skill to:"
  today must produce a `delegate_task`-shaped instruction tomorrow,
  with a regression test for each of: bare `Task ce-foo()`,
  `Task ce-foo(args)`, list-prefixed `- Task ce-foo(args)`, and
  multi-line "Run these agents in parallel:\n- Task ce-foo(...)\n- Task ce-bar(...)".
- **R11.** README.md and `docs/specs/hermes.md` "Agents" section rewrite
  to reflect the new mapping.
- **R12.** `bun run release:validate` continues to pass (no marketplace
  manifest impact — Hermes is converter-output, not a registered plugin).

---

## 4. Scope Boundaries

- **No changes to other targets.** Pi/Codex/Gemini/Kiro continue emitting
  agents as skills (correct for those targets — Pi has no `delegate_task`
  primitive, Codex has `spawn_agent` but that mapping is already separate).
  This plan touches only `claude-to-hermes.ts`, `targets/hermes.ts`,
  `types/hermes.ts`, the Hermes-specific tests, and Hermes docs.
- **No changes to source agent files.** `plugins/compound-engineering/agents/`
  is read-only from this plan's perspective. The agent body becomes the
  payload content directly; we don't rewrite agents to be Hermes-native.
- **No changes to the plugin's orchestrator skills.** `ce-code-review`,
  `ce-plan`, etc. continue using `Task ce-foo(args)` (Claude Code shape)
  in the source. The rewrite is converter-side at install/convert time.
  This preserves single-source-of-truth for orchestrator behavior.
- **No new Hermes runtime primitive.** We don't propose Hermes add an
  `Agent`-tool equivalent or a "skill that wraps `delegate_task`" pattern.
  The rewrite produces prose that the host agent's existing model
  intelligence resolves to a `delegate_task` call. If that proves unreliable
  in practice, a follow-up plan can wrap it in a helper skill, but YAGNI
  for now.
- **No re-evaluation of the strategic-premise concerns** from
  `docs/plans/2026-05-01-001-...`. Demand signal, Hermes maturity, etc.
  are still open questions; this plan accepts them as the user did when
  green-lighting the original target work.
- **No bidirectional conversion.** Hermes → Claude Code remains out of scope.
- **No hand-bumped versions.** Release-please owns versioning.

---

## 5. Context & Research

### Code currently in scope

- `src/converters/claude-to-hermes.ts:112-145` — `convertAgent()` builds
  `agent-<name>` generated skill. **This is what we're replacing.**
- `src/converters/claude-to-hermes.ts:199-290` — `transformContentForHermes`,
  specifically the `taskPattern` regex at line 205-218. **This is what we're
  extending.**
- `src/types/hermes.ts` — `HermesGeneratedSkill` carries `kind: "agent" | "command"`.
  We need a new `HermesAgentPayload` type and the bundle needs a new field.
- `src/targets/hermes.ts` — writer; needs to materialize agent payloads to
  `<root>/.hermes/<pluginName>/agents/<name>.md` and track them in the manifest.
- `tests/hermes-converter.test.ts` — agent-as-skill tests need to flip.
- `tests/hermes-writer.test.ts` — agent-skill-write paths need to flip.

### Patterns to mirror

- `src/targets/managed-artifacts.ts` already supports multiple groups in the
  manifest (gemini uses `commands` + `agents`-but-as-files-elsewhere; pi uses
  `skills`). Adding `agent_payloads` is a one-line schema extension.
- `src/utils/files.ts` `copySkillDir` body-transform path is reused for
  passthrough skills; the agent payload write needs a simpler path
  (single file, no scripts/references subdirs) — implement inline rather
  than overload `copySkillDir`.
- `src/converters/claude-to-pi.ts:121-150` — Pi's task-rewrite pattern
  is the structural model for the regex; Hermes' replacement string is
  different but the matching is identical.

### Hermes runtime references

- `delegate_task` tool: accepts `goal: string`, `context: string`,
  `toolsets: string[]`, optional `role: 'leaf' | 'orchestrator'`, OR a
  `tasks: [{goal, context?, toolsets?, role?}, ...]` array for parallel
  batch (cap is `delegation.max_concurrent_children`, default 3, configurable).
- `subagent-driven-development` skill in the user's profile demonstrates the
  expected invocation shape (full prompt in `context`, not `goal`).
- `read_file` is available to subagents and can read the payload at
  `~/.hermes/<pluginName>/agents/<name>.md` if the orchestrator chooses
  to point the subagent at the payload rather than inline the body.

### Institutional learnings to honor

- `docs/solutions/codex-skill-prompt-entrypoints.md` — slash-command rewrites
  must NOT match arbitrary slash-shaped text; same pitfall applies to the
  new `Task → delegate_task` rewrite. Use bounded regex with explicit
  agent-name shape (`[a-z][a-z0-9-]*`).
- `docs/solutions/integrations/cross-platform-model-field-normalization-2026-03-29.md`
  — when a field can't translate, drop it. Claude `model: opus` on agents
  is dropped on Hermes (Hermes routes models via `config.yaml`); this remains
  true.
- `docs/solutions/skill-design/git-workflow-skills-need-explicit-state-machines-2026-03-27.md`
  — workflow skills designed as prose checklists are fragile under non-Claude
  execution. The rewrite produces prose; we mitigate by making the prose
  unambiguous about the tool name (`delegate_task`) and the payload location.
- `docs/solutions/integrations/colon-namespaced-names-break-windows-paths-2026-03-26.md`
  — every path component goes through `sanitizePathName()`. The new
  `agents/<name>.md` location is no exception.

---

## 6. Key Technical Decisions

### D1. Agent payload location

Two options:

| Option | Path | Pros | Cons |
|--------|------|------|------|
| **A. Co-located with skills** | `~/.hermes/skills/<pluginName>/agents/<name>.md` | One root for everything CE-owned | Hermes' skill discovery may try to crawl `agents/` looking for SKILL.md and warn; also conflates payloads with discoverable skills |
| **B. Outside `skills/`** | `~/.hermes/<pluginName>/agents/<name>.md` | Hermes never crawls this for skill discovery; clearer separation; mirrors the existing manifest-dir convention (`~/.hermes/<pluginName>/install-manifest.json`) | Two roots to clean up |

**Decision: Option B.** The whole point of this remap is "agents are not
skills." Putting them under `skills/` invites the same auto-discovery
relevance-ranking confusion we're trying to escape. The cleanup cost (one
extra directory in the manifest) is trivial.

### D2. Payload file format

The agent body is markdown with YAML frontmatter today (Claude Code agent
shape). We can either:

| Option | Format | Decision |
|--------|--------|----------|
| **A. Pass through verbatim** | Original frontmatter + body | Simplest; orchestrator-side `delegate_task` reads frontmatter for `tools`/`description` if it cares |
| **B. Strip Claude-only fields** | Hermes-shape frontmatter (`name`, `description`, `tools` → `toolsets`, `model` dropped) + body | Cleaner; matches the rest of the converter's "drop Claude-isms" stance |

**Decision: Option B.** The payload is read by Hermes' host agent and
piped into `delegate_task` — Claude-shape frontmatter (`color: blue`, `model: inherit`)
is noise. The body content gets the same `transformContentForHermes`
rewrite as everything else (Task → delegate_task, paths, template vars).

### D3. `tools:` → `toolsets:` mapping

Claude Code agent `tools: [Read, Bash, Grep, Write]` doesn't map 1:1 to
Hermes toolsets. Reasonable mapping table (see `src/utils/detect-tools.ts`
for the existing tool detection registry; this is a NEW mapping, separate):

| Claude tool | Hermes toolset |
|-------------|----------------|
| `Read`, `Write`, `Edit`, `MultiEdit`, `Glob` | `file` |
| `Bash` | `terminal` |
| `Grep` | `file` (no separate Hermes toolset; `search_files` is in `file`) |
| `WebFetch`, `WebSearch` | `web` |
| `mcp__*` | (passed through as `mcp:<server>`; Hermes gates MCP servers via toolset names) |
| `Task` | `delegation` (a Hermes-recognized toolset that gates `delegate_task`) |

If the source agent's `tools:` is empty or absent, default to
`['file', 'terminal']` (matches the most common reviewer footprint).

If the source `tools` field is the literal string `inherit` (Claude
convention meaning "inherit parent tools"), drop the field — Hermes
inherits by default.

**Decision: Map per the table above.** Embed the resulting toolset list in
the payload frontmatter as a Hermes-shape `metadata.hermes.toolsets` hint.
The orchestrator-side rewrite includes the `toolsets` argument verbatim
in the prose so the host agent surfaces it on the `delegate_task` call.

### D4. Rewrite shape for `Task ce-foo(args)`

The current rewrite produces `Use the ce-foo skill to: args`.
The new rewrite needs to be unambiguous about: which tool to call
(`delegate_task`), where the prompt is (payload path), how to thread
args, and what toolsets to pass. Two shapes considered:

**Shape A — JSON literal (machine-readable):**

```
Delegate to ce-foo via delegate_task: {"goal": "args", "context_payload": "~/.hermes/compound-engineering/agents/ce-foo.md", "toolsets": ["file", "terminal"]}
```

**Shape B — natural-language imperative (model-friendly):**

```
Delegate to the `ce-foo` agent via the `delegate_task` tool. Read the agent's
prompt at `~/.hermes/compound-engineering/agents/ce-foo.md` and use it as the
`context` argument. Set `goal` to: args. Use toolsets: [file, terminal].
```

**Decision: Shape B.** Hermes' host agent is an LLM, not a JSON parser. Shape B
is what the model actually needs to construct the right tool call. Shape A
fights the model — it has to extract the JSON, decide what to do with it, then
construct a tool call from it; shape B is one step.

When the surrounding prose (3 lines before the match) contains "in parallel" or
"in a batch" or "concurrently", the rewrite uses the **batch form**:

```
- Delegate to the `ce-foo` agent (parallel) — see batch instructions below.
- Delegate to the `ce-bar` agent (parallel) — see batch instructions below.

(Use `delegate_task(tasks=[...])` with one task per agent above. For each agent,
read the prompt at `~/.hermes/compound-engineering/agents/<name>.md` as the
`context` argument; set `goal` to the agent-specific args; use the agent's
declared toolsets.)
```

The "see batch instructions below" pattern is added once per batch group, not
per agent. Detection: when 2+ consecutive `Task ce-foo(...)` lines (possibly
list-prefixed) appear within a "in parallel" or "in a batch" context, emit
the batch trailer once after the last consecutive `Task` line.

### D5. No backward-compat needed

The Hermes target (and its agent-as-skill emit) has never shipped to `main`;
it only exists on the `feat/hermes-conversion-target` branch. There are no
installed users with orphan `agent-*` skill directories to sweep. The
standard `cleanupRemovedManagedDirectories` helper still applies to the
`skills` group for command skills, but no special migration logic is
required for agents.

### D6. Don't gate on `delegation` toolset availability

A Hermes profile with `delegate_task` disabled (no `delegation` toolset) will
see the rewritten prose, fail to call `delegate_task`, and degrade. We do not
attempt to detect this at install time. The spec doc warns the user; if a
user installs CE on a profile that has `delegate_task` disabled, the
orchestrators will produce friendly-but-broken prose ("I'd delegate to
ce-foo here but `delegate_task` isn't available — falling back to inline
loading…"). This is the same degradation mode as `/ce-work` on Hermes
(documented in spec); not a converter-side concern.

---

## 7. Output Structure

```
src/
├── types/
│   └── hermes.ts                              [modified — add HermesAgentPayload, bundle field]
├── converters/
│   └── claude-to-hermes.ts                    [modified — drop convertAgent skill emit, add convertAgentPayload, extend Task regex]
├── targets/
│   └── hermes.ts                              [modified — write agent payloads, manifest agent_payloads group]
├── data/
│   └── plugin-legacy-artifacts.ts             [unchanged — empty arrays still correct]

tests/
├── hermes-converter.test.ts                   [modified — flip agent-as-skill assertions, add Task→delegate_task tests]
├── hermes-writer.test.ts                      [modified — flip agent-skill-write assertions, add agent payload write tests]
└── cli.test.ts                                [modified — extend cleanup test to verify agent_payloads sweep]

docs/
└── specs/
    └── hermes.md                              [modified — rewrite Agents section, update mapping table, add delegate_task notes]

README.md                                       [modified — Hermes section: agents-as-delegate-task one-liner]
```

---

## 8. Implementation Units

### U1. Type definitions

**Goal:** Extend `HermesBundle` with `agentPayloads` and define `HermesAgentPayload`.

**Requirements:** R1, R7.

**Dependencies:** none.

**Files:**
- Modify: `src/types/hermes.ts`

**Approach:**
- Add type:
  ```ts
  export interface HermesAgentPayload {
    name: string;             // sanitized, e.g., "ce-security-reviewer"
    content: string;          // full file content (frontmatter + body), pre-built
    toolsets: string[];       // computed from Claude `tools:`; embedded in content frontmatter; also surfaced for the writer manifest
  }
  ```
- Add `agentPayloads: HermesAgentPayload[]` to `HermesBundle`.
- Remove `kind: "agent"` from `HermesGeneratedSkill` — only `"command"` remains.
  Update the union accordingly. (TypeScript will compile-check that no
  consumer still constructs the `"agent"` variant.)

**Test scenarios:** none (type-only, exercised through U2/U3).

**Verification:** `bun tsc --noEmit` succeeds; `bun test` reveals stale
test assertions in U4/U5 (expected — flip them as part of those units).

---

### U2. Converter: agent → payload, Task regex extension

**Goal:** Replace `convertAgent` with `convertAgentPayload`. Extend
`transformContentForHermes` `Task` rewrite for the `delegate_task` shape
and parallel-batch detection.

**Requirements:** R1, R2, R7, R10.

**Dependencies:** U1.

**Files:**
- Modify: `src/converters/claude-to-hermes.ts`
- Modify: `tests/hermes-converter.test.ts`

**Approach:**

1. **Remove the agent → generated skill path:**
   - Delete the `for (const agent of plugin.agents)` block at L63-65 that
     pushes into `generatedSkills`.
   - Delete `convertAgent` (L112-145).
   - Add a new loop that builds `HermesAgentPayload[]`.

2. **Add `convertAgentPayload(agent, plugin, usedNames)`:**
   - Sanitize name: `sanitizeHermesName(agent.name)`. Dedup against
     a Set of already-used payload names (separate Set from the skill
     name set — payloads live in a different directory, no on-disk
     collision risk).
   - Map `agent.tools` → `toolsets[]` via the table in D3. If
     `agent.tools` is `"inherit"` or empty, default to `['file', 'terminal']`.
   - Build payload frontmatter:
     ```yaml
     ---
     name: <sanitized name>
     description: <agent.description, sanitized>
     version: <plugin.manifest.version>
     metadata:
       compound-engineering:
         kind: "agent"
         toolsets: [file, terminal]   # computed
     ---
     ```
   - Body: fold `agent.capabilities` into a `## Capabilities` block as
     today (preserve existing behavior); apply `transformContentForHermes`.
   - Concatenate `frontmatter + "\n\n" + body`. Return `HermesAgentPayload`.

3. **Extend `transformContentForHermes`:**
   - The current `taskPattern` regex `/^(\s*-?\s*)Task\s+([a-z][a-z0-9:-]*)\(([^)]*)\)/gm`
     stays — same matcher.
   - Replace the **replacement function** body. New behavior:
     - Compute `agentName = normalizeName(finalSegment)` (unchanged).
     - Compute `payloadPath = "~/.hermes/<pluginName>/agents/<agentName>.md"`.
       The `<pluginName>` is captured as a closure variable on the
       `transformContentForHermes` invocation. **This requires
       `transformContentForHermes` to accept a `pluginName` argument.**
       Threading: the converter calls
       `transformContentForHermes(body, plugin.manifest.name)`; the writer
       calls it via `copySkillDir` which currently doesn't pass plugin
       context. **Fix:** change `copySkillDir`'s transform-callback signature
       to accept the pre-bound transform (caller curries `pluginName` in).
       Alternatively, hoist `pluginName` to module-level closure via a
       factory function `makeHermesContentTransformer(pluginName)`. Pick
       the factory approach — less invasive.
     - Build the per-agent line:
       ```
       Delegate to the `<agentName>` agent via the `delegate_task` tool.
       Read the agent's prompt at `<payloadPath>` and use it as the
       `context` argument. Set `goal` to: <args>. Use the toolsets declared
       in the payload's frontmatter.
       ```
       (Replace the `args` substitution; if args empty, drop the `goal`
       sentence and say `Set 'goal' to a one-line summary of the
       requested work.`)
     - **Parallel-batch detection:** After producing per-line replacements,
       run a post-pass over the result that identifies runs of 2+
       consecutive replaced lines preceded (within 3 prose lines) by an
       "in parallel" / "concurrently" / "in a batch" trigger. For each
       run, emit a batch trailer ONCE after the last line of the run:
       ```
       (Use `delegate_task(tasks=[...])` to dispatch the agents above
       concurrently. For each agent, follow the per-agent instructions —
       read the payload, build `goal` from the agent-specific args, and
       use the agent's declared toolsets.)
       ```
     - Run the batch detection in a SECOND pass (after the per-line
       substitution) so we can detect "consecutive lines" reliably from
       the rewritten content. Keep a regex-based detector for
       `(?:^|\n)(?:Delegate to the `[^`]+` agent[^\n]*\n){2,}` and
       look back up to 3 lines for the trigger keywords.

4. **`transformContentForHermes` signature change:**
   - Old: `transformContentForHermes(body: string): string`.
   - New: `transformContentForHermes(body: string, pluginName: string): string`.
   - All call sites: `convertCommand`, `convertAgentPayload`,
     `copySkillDir`'s transform argument (curried via factory).
   - Export a `makeHermesContentTransformer(pluginName)` helper for the
     writer's `copySkillDir` invocation.
   - Existing tests that call `transformContentForHermes(body)` with one
     arg: update to pass `"compound-engineering"` (or whatever the test
     fixture's plugin name is).

**Test scenarios** (additions to `tests/hermes-converter.test.ts`):
- Agent body with `Task ce-foo(args)` → output contains literal
  "Delegate to the `ce-foo` agent via the `delegate_task` tool".
- Agent body with `Task ce-foo()` (empty args) → output uses the
  one-line-summary fallback for `goal`.
- Agent body with multi-line:
  ```
  Run these agents in parallel:
  - Task ce-a(x)
  - Task ce-b(y)
  ```
  → output contains both per-agent Delegate lines AND a single batch
  trailer line referencing `delegate_task(tasks=[...])`.
- Agent body without parallel trigger:
  ```
  - Task ce-a(x)
  - Task ce-b(y)
  ```
  → no batch trailer (each agent stands alone, no `tasks=[...]` mention).
- Agent body with 1 isolated `Task ce-x(...)` → no batch trailer
  (single match, batch threshold is 2+).
- Agent → payload conversion: bundle `agentPayloads` array length matches
  source agent count; payload `name` is sanitized; payload `toolsets` is
  mapped per the D3 table.
- Agent with `tools: [Read, Bash, mcp__github__create_issue]` →
  payload `toolsets: ['file', 'terminal', 'mcp:github']`.
- Agent with no `tools` field → payload `toolsets: ['file', 'terminal']`.
- Agent with `tools: 'inherit'` → payload `toolsets: ['file', 'terminal']`
  (default; `inherit` is dropped).
- Agent payload content includes the existing `## Capabilities` fold.
- Agent payload content has the new frontmatter shape (`metadata.compound-engineering.kind: "agent"`).
- **Crucial regression:** generate the bundle for the sample-plugin fixture
  and assert `bundle.generatedSkills` has NO entries with `kind: "agent"`
  — the agent path is fully gone from generated skills.
- **`pluginName` threading:** rewrite `Task ce-foo(args)` for plugin
  named `my-plugin` → output payload path is
  `~/.hermes/my-plugin/agents/ce-foo.md`.
- Path-rewrite still works: `~/.claude/agents/foo.md` → `~/.hermes/agents/foo.md`
  (separate path-rewrite pass, unchanged).
- Slash-command rewrite still works (existing tests pass unchanged).

**Tests to remove/flip:**
- Any existing test asserting `bundle.generatedSkills` contains an entry
  with `name: "agent-ce-foo"` → flip to assert it appears in
  `bundle.agentPayloads` with `name: "ce-foo"`.
- Any test asserting `Task ce-foo(args)` → `Use the ce-foo skill to: args`
  → flip to the new delegate_task shape.

**Verification:** `bun test tests/hermes-converter.test.ts` passes. The
sample-plugin fixture conversion produces a bundle with empty
`generatedSkills.filter(s => s.kind === "agent")` and a populated
`agentPayloads` array.

---

### U3. Writer: materialize agent payloads, manifest agent_payloads group

**Goal:** Write `bundle.agentPayloads` to disk under
`<root>/.hermes/<pluginName>/agents/<name>.md` and track in the manifest.

**Requirements:** R1, R5, R6.

**Dependencies:** U1, U2.

**Files:**
- Modify: `src/targets/hermes.ts`
- Modify: `tests/hermes-writer.test.ts`

**Approach:**

1. **Resolve agent payloads dir:** in `resolveHermesPaths`, add
   `agentsDir = path.join(managedDir, 'agents')` (i.e.,
   `<root>/.hermes/<pluginName>/agents/`). Note: the existing managed dir
   already lives at `<root>/.hermes/<pluginName>/` and currently only
   houses `install-manifest.json`. Adding an `agents/` subdir alongside is
   the natural extension.

2. **Write agent payloads in `writeHermesBundle`:**
   - After the skills-write loop, before manifest write:
     ```ts
     const currentAgentPayloads = bundle.agentPayloads.map(p => p.name);
     // Manifest-diff cleanup: remove orphan payload files
     await cleanupRemovedManagedFiles(agentsDir, manifest, "agent_payloads", currentAgentPayloads, ".md");
     await fs.mkdir(agentsDir, { recursive: true });
     for (const payload of bundle.agentPayloads) {
       const target = path.join(agentsDir, `${payload.name}.md`);
       if (!isSafeManagedPath(agentsDir, target)) continue;
       await fs.writeFile(target, payload.content, { mode: 0o644 });
     }
     ```
   - **Note:** `cleanupRemovedManagedFiles` may not exist with this exact
     signature in `managed-artifacts.ts`. Check first; if only
     `cleanupRemovedManagedDirectories` exists, either (a) extend it with a
     "files mode" flag, or (b) inline the file-diff cleanup. **Prefer (a)** —
     the helper file already targets per-file vs. per-dir distinctions
     (Gemini uses per-file for commands), so a `kind: "files" | "dirs"`
     extension is small.

3. **Extend manifest schema:**
   - `groups: { skills: string[], agent_payloads: string[] }`.
   - Existing manifests without `agent_payloads` are tolerated (`?? []`
     during read).

4. **`cleanupHermes` (cleanup command path):**
   - Sweep skills group as today.
   - Sweep `agent_payloads` group: for each name in the group, remove
     `<agentsDir>/<name>.md` if `isSafeManagedPath` allows.
   - Remove `<agentsDir>` if empty after sweep.
   - Remove `<managedDir>` if empty after both sweeps.

**Test scenarios** (additions/changes to `tests/hermes-writer.test.ts`):
- Happy path: bundle with 3 agentPayloads → 3 files written under
  `<root>/.hermes/<pluginName>/agents/<name>.md`; manifest's
  `agent_payloads` group lists all 3.
- Reinstall idempotency: second install with the same bundle → no churn,
  manifest unchanged, files unchanged.
- Manifest-diff cleanup: install with payloads `[a, b, c]`, then reinstall
  with `[a, c]` → `b.md` removed; manifest reflects `[a, c]`.
- Cleanup: `cleanup --target hermes` removes both skills and agent
  payloads; `<root>/.hermes/<pluginName>/agents/` directory removed if empty.
- Path safety: payload name with `..` somehow surviving sanitization →
  `isSafeManagedPath` rejects; no write.
- Dedup: two agents whose names sanitize to the same value → second one
  gets `-2` suffix in `bundle.agentPayloads` (via U2's dedup Set);
  writer writes both files distinctly.
- Existing skills-write tests pass unchanged (skills path is untouched).
- MCP merge tests pass unchanged.

**Verification:** `bun test tests/hermes-writer.test.ts` passes. Inspect
output for the sample-plugin fixture: `<root>/.hermes/skills/` has user
skills + `cmd-*` only (no `agent-*`); `<root>/.hermes/compound-engineering/agents/`
has all 50+ agent payload files.

---

### U4. CLI / cleanup integration

**Goal:** Wire the new `agent_payloads` group through cleanup and detection.

**Requirements:** R6.

**Dependencies:** U2, U3.

**Files:**
- Modify: `src/commands/cleanup.ts` (only the Hermes-target case if
  group iteration is hardcoded; otherwise no changes needed if cleanup
  iterates groups generically).

**Approach:**
- Audit `cleanupHermes` (or whatever the current cleanup function is named).
  If it hardcodes `groups.skills` only, extend to iterate both groups.
  If it iterates `Object.keys(manifest.groups)`, no changes needed.
- Verify `--to all` detection still picks up Hermes via the existing
  `~/.hermes/config.yaml` probe (no change needed).

**Test scenarios** (extension to `tests/cli.test.ts`):
- `cleanup --target hermes` after install removes both skills and agent
  payloads; the managed dir is empty (or removed) after cleanup.
- `cleanup --target hermes` with only agent payloads (no skills group)
  still works (resilience to partial manifests).

**Verification:** `bun test tests/cli.test.ts` passes including new cases.

---

### U5. Spec doc + README updates

**Goal:** Document the new mapping. Read users will see this BEFORE running
into runtime surprises.

**Requirements:** R8, R11.

**Dependencies:** U1-U4.

**Files:**
- Modify: `docs/specs/hermes.md`
- Modify: `README.md`

**Approach:**

1. **`docs/specs/hermes.md`:**
   - Section "Skills (Agent Skills)" → "Passthrough vs. generated skills"
     table: drop the agent row. Now only passthrough skills + commands.
   - New section "Agent payloads" between Skills and MCP:
     - Path: `~/.hermes/<pluginName>/agents/<name>.md`.
     - Frontmatter shape: `name`, `description`, `version`,
       `metadata.compound-engineering.{kind, toolsets}`.
     - Body: original Claude agent body with `transformContentForHermes`
       applied (Task→delegate_task, paths, etc.).
     - Why payloads, not skills: parallelism + isolation rationale; the
       full reasoning from §2 of this plan condensed to 4-5 sentences.
     - How orchestrators use them: `Task ce-foo(args)` in the source
       becomes a `delegate_task` invocation hint pointing at the payload.
   - Section "Body content rewrites" table: replace the `Task <agent>(args)`
     row with the new `Delegate to the agent ... delegate_task ...` shape;
     add the parallel-batch trailer note.
   - Section "Frontmatter mapping for generated skills": drop the `Agent`
     row entirely; the table only covers `Command` now.
   - Section "Install manifest": JSON example updated with both `skills`
     and `agent_payloads` groups.
   - Section "Operational notes": add a bullet that profiles without the
     `delegation` toolset enabled cannot run CE orchestrators that depend
     on agents — `/ce-code-review`, `/ce-plan`, `/ce-doc-review`,
     `/ce-resolve-pr-feedback`, `/ce-compound`. Recommend enabling
     `delegation` (default-on for most profiles) before installing CE.

2. **`README.md`:**
   - Hermes section / install snippet: one-line callout that "agents are
     mapped to Hermes `delegate_task` (parallel sub-agents are preserved);
     commands map to skills".

**Test scenarios:** none (pure docs).

**Verification:** Read the updated spec for internal consistency.
`bun run release:validate` passes.

---

## 9. System-Wide Impact

- **Other targets:** zero impact. Pi/Codex/Gemini/Kiro all use distinct
  converter+writer modules; agent handling diverges per target.
- **Existing CE-on-Hermes installs (if any):** the first install with the
  new converter sweeps the orphan `agent-*` skill dirs via the standard
  manifest-diff cleanup. No special migration command needed.
- **MCP behavior:** unchanged.
- **Passthrough skills behavior:** unchanged structurally — they still
  emit at `~/.hermes/skills/<name>/`. Their bodies pick up the new
  Task→delegate_task rewrite via the `copySkillDir` transform.
- **Release surface:** new source files belong to the existing `cli`
  release component (linked-versions with `compound-engineering`). No
  marketplace metadata changes.

---

## 10. Risks & Open Questions

| Risk | Mitigation |
|------|------------|
| Hermes' host agent doesn't reliably translate the rewritten "Delegate to ... via delegate_task" prose into an actual `delegate_task` call. | The prose names the tool literally and provides the payload path. If the host agent ignores it, the orchestrator falls through to the prose itself in the output (visible failure, not silent corruption). Add a real-runtime smoke test as a U6 sign-off prerequisite once an internal Hermes install is available. |
| Parallel-batch detection has false positives (rewrites a non-parallel run as a batch) or false negatives (misses a true batch because the trigger keyword is on line 4 instead of line 3). | Conservative detection: require explicit "in parallel" / "concurrently" / "in a batch" within 3 lines AND 2+ consecutive `Task` lines. False negatives are tolerable (degrades to per-agent calls — slower but correct); false positives would be wrong. Lean toward false-negative bias. Adversarial tests in U2 cover both directions. |
| Agent `tools: Read, Bash` mapping table omits a tool that's actually load-bearing for some agent. | Audit `plugins/compound-engineering/agents/*.agent.md` for the full set of `tools:` values during U2; ensure the D3 table covers all of them. Default fallback is `['file', 'terminal']` (broad enough that a dropped tool just means the subagent has slightly more access than needed, not less). |
| `transformContentForHermes` signature change (add `pluginName` arg) breaks the `copySkillDir` transform interface. | Use the `makeHermesContentTransformer(pluginName)` factory — preserves `(body) => string` callback shape that `copySkillDir` expects. No `copySkillDir` change. |
| Backward-compat sweep of `agent-*` skill dirs deletes user-edited content if a user manually customized one of those skill dirs. | Manifest-diff cleanup only removes dirs that are still IN the manifest. If the user manually deleted a dir from the manifest (or it was never in the manifest), the sweep doesn't touch it. Document the sweep in U5 release notes. |
| The new `delegation` toolset gate (or its absence) is not surfaced at install time — user finds out only when they run `/ce-code-review`. | Spec doc "Operational notes" warns. A future enhancement could probe `~/.hermes/config.yaml` for an explicit `disabled_toolsets: [delegation]` and warn at install time, but that's YAGNI for v1. |
| `delegate_task` is synchronous within the parent turn; `/ce-resolve-pr-feedback` -style flows that span multiple user turns can't use it for the user-spanning portions. | Document explicitly in spec. CE workflows already accept this constraint (the `ce-work` degradation note covers this class). Within a single turn, `delegate_task` plus its internal `tasks: [...]` batch covers the full scope of CE agent dispatching. |
| Two consecutive installs of unrelated plugins both calling their bundle "compound-engineering" would conflict on the agent payloads dir. | Same isolation as the existing skills layout — each plugin owns `<root>/.hermes/<pluginName>/`; cross-plugin collision is on `pluginName`, not on agent name. The existing manifest-isolation invariant carries forward. |

---

## 11. Open Questions

- **Should the payload `frontmatter.metadata.hermes.toolsets` use the
  exact key Hermes recognizes, or a CE-namespaced key?** Lean
  CE-namespaced (`metadata.compound-engineering.toolsets`) because the
  payload is NOT a Hermes skill — Hermes never reads it as a skill.
  The orchestrator (a CE skill) reads the payload and threads
  `toolsets` to `delegate_task`. CE-namespaced avoids any future Hermes
  schema surprise. **Default in plan: CE-namespaced.**
- **Should we also ship a small helper skill `ce-delegate-agent` that
  encapsulates the "read payload, call delegate_task with right args"
  pattern?** It would reduce reliance on the host LLM correctly
  parsing the rewritten prose. **Default: no — YAGNI.** Revisit if the
  real-runtime smoke test in U2 sign-off shows unreliable resolution.
- **Should `tools: 'inherit'` map to a Hermes equivalent that captures
  parent toolsets, instead of defaulting to `['file', 'terminal']`?**
  Hermes `delegate_task` doesn't expose parent toolset enumeration to the
  child by default. Defaulting to a conservative set is safer than
  passing nothing. **Default: keep the `['file', 'terminal']` fallback.**
- **Should the existing 5-2026-01 plan be marked as superseded-in-part?**
  The bulk of that plan (skills, MCP, manifest, CLI wiring, detection,
  cleanup) remains correct. Only the agent-handling section is wrong.
  This plan supersedes the agent half; the rest stands. Frontmatter on
  this file uses `supersedes_partial:` to signal the partial relationship.

---

## 12. Verification Checklist

Before declaring this plan executed:

- [ ] `bun test` passes end-to-end.
- [ ] `bun run release:validate` passes.
- [ ] Sample-plugin fixture conversion produces 0 generated skills with
      `kind: "agent"` and exactly N agent payloads where N is the source
      plugin's agent count.
- [ ] First install on a system that previously installed CE-on-Hermes
      (with old `agent-*` skills) produces zero `agent-*` skill dirs
      after install.
- [ ] `cleanup --target hermes` removes both skill dirs and agent
      payloads on a system with both groups installed.
- [ ] `docs/specs/hermes.md` "Agents" section reflects the new mapping
      and is internally consistent.
- [ ] README Hermes section is one paragraph clearer about
      agents-as-delegate-task.
- [ ] At least one real-runtime smoke (manual, on a laptop with Hermes
      installed) confirms `/ce-code-review` triggers `delegate_task`
      calls (not "Use the X skill" prose). Capture the session log;
      attach to the PR.
