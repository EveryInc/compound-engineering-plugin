---
title: Named Worker Profiles for Generic Subagent Dispatch - Plan
type: feat
date: 2026-09-16
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Named Worker Profiles for Generic Subagent Dispatch - Plan

## Goal Capsule

- **Objective:** On hosts whose subagent primitive accepts a named worker profile (Devin CLI and Devin Desktop's Devin Local today), a user can configure a read-only profile and a write-capable profile and every generic CE dispatch honours it - while every host, including Devin with the keys unset, dispatches exactly as it does today.
- **Means:** Two ordinary config keys resolved through the existing `ce-config-layers` cascade, and one canonical delimited contract block distributed byte-identically to every generic dispatch surface, pinned by a new parity test (KTD1, KTD2).
- **Authority:** The user's direction in this session and the repository's skill-authoring standard (`AGENTS.md`, `docs/solutions/skill-design/portable-agent-skill-authoring.md`) govern. Where a unit's restatement and a test pin disagree, the pin is a decision to audit (keep, condition, or drop with its reason in the test), never a floor.
- **Stop conditions:** A generic dispatch surface that selects child authority cannot carry the block without contradicting an existing pinned contract. The Devin profile contract documented here fails verification against the installed CLI or its docs. A consumer file cannot hold the block under its size or style constraints.
- **Execution profile:** One PR on `feat/devin-subagent-profiles`. All changes gated by `bun run test`; release hygiene by `bun run release:validate` and `bun run plugin:validate`; Devin contract claims verified against the installed CLI's docs and `devin doctor`.
- **Finish and ship:** `ce-work` implements; `lfg` ships.

---

## Product Contract

### Summary

Add two optional config keys - `subagent_read_profile` and `subagent_write_profile` - that let a user name the worker profile a generic CE subagent dispatch should request, split by authority class. The rule lives once in a canonical fixture and is embedded byte-identically at every generic dispatch seam, enforced by a parity test. Devin documentation records the verified profile contract, with `swe-2-high` shown as an example pin only.

### Problem Frame

CE skills express model choice semantically - "mid-tier model", "session model", "capable generation model" - and each host's primitive translates that. Devin's `run_subagent` takes no model argument at all; it takes a required `profile` name. The built-ins split by tools, not just model: `subagent_explore` carries read-only codebase tools plus web search - the docs state it cannot edit files or fetch arbitrary URLs, and its documented toolset has no exec - and runs the organisation's default subagent model (SWE-1.6-class by default); `subagent_general` carries full tool access and always inherits the parent model. CE's generic dispatches need exec and scratch-artifact writes that `subagent_explore`'s toolset does not provide, so on Devin the only built-in that can serve them is `subagent_general`, which always inherits the parent model - a user running a strong or Fusion parent pays parent-rate for every CE child, read-only reviewers included. The org's "Default subagent model" setting governs `subagent_explore` and unpinned custom profiles but cannot touch `subagent_general`. Named custom profiles are the only per-class escape, and CE currently never names one. The reverse risk is just as real: a cheap profile must never be asked to write, so read and write dispatch classes need separate configuration, not one shared key.

### Key Decisions

- **Two authority-class profile keys, never one.** A cheaper-model profile must never widen a child's authority (session-settled: user-directed). Governs R1, R2, R6.
- **`swe-2-high` is documentation example only.** No shipped default pin; profile and model availability are per-account (session-settled: user-directed). Governs R8.
- **Coverage is the generic-dispatch class, not one skill.** One canonical contract block distributed to every active generic dispatch surface (session-settled: user-directed). Governs R5, R6.

### Requirements

**Configuration**

- R1. Two new optional ordinary scalar keys in `.compound-engineering/config.yaml` / `config.local.yaml`, resolved by the existing `ce-config-layers` rule: `subagent_read_profile` (read-only dispatches) and `subagent_write_profile` (write-capable dispatches). Profile names are opaque host-defined strings; CE never invents or validates them.
- R2. Unset or empty keys are a strict no-op: dispatch prose on every host is semantically (and where literal, byte-for-byte) unchanged. No placeholder, no invented default.

**Dispatch semantics**

- R3. Where the host's dispatch primitive accepts a named worker profile - a profile argument that scopes model and tool policy for an otherwise generic dispatch that still receives CE's full prompt payload - the orchestrator resolves the applicable key and passes the name as that selector, choosing the class per dispatch call by the authority that child needs. A typed/registered-agent selector such as Claude Code's `subagent_type` is not a worker-profile selector (CE's contract there is generic agents) and leaves the keys inert. Where the primitive already names a built-in profile on every call (Devin), a configured name substitutes for the built-in the orchestrator would otherwise select.
- R4. A resolved profile supersedes that surface's model selection for the dispatch's authority class - tier override and session-model inheritance pins alike - because the profile carries the user's chosen model and tool policy; never pass both a profile and a model selector. The docs must warn that this flattens per-persona model differentiation (the session-model pins on correctness, security, and adversarial reviewers and on the finish leaves exist for correctness): a user who wants differentiated reviewer models should leave the read key unset or pin the profile to a strong model. Per-persona model selectors such as #1301's are model names, not profiles, and do not apply on Devin.
- R5. Where the host exposes the available profile set, the orchestrator confirms the configured name resolves before dispatch. A rejected, unknown, or unresolvable name follows the surface's existing dispatch-failure rule (correct the argument once; otherwise degrade per that surface), names the requested profile in the coverage or degradation note, and is never reported as having run - nor is its model claimed - when it did not serve.
- R6. Profile selection applies only to the generic subagent primitive - never to cross-model peers, engine adapters, CLI dispatches, or the reasoning-elevation engine. The profile selector is derived only from the resolved config keys - never from dispatch content, PR text, reviewer output, or child requests (the `mode.apply_local` authority precedent in `finish-input.md`).

**Contract distribution and tests**

- R7. The worker-profile rule exists exactly once as canonical text (`tests/fixtures/`), embedded under unique delimiters in every listed consumer, enforced by a new parity test asserting verbatim presence plus load-bearing clauses.
- R8. `skills/ce-setup/references/config-template.yaml` and `.compound-engineering/config.example.yaml` stay byte-identical with the new keys present and commented; every `# key:` is documented in `docs/guides/configuration.md`.

**Documentation**

- R9. Docs cover Devin CLI and Devin Desktop Devin Local: where profile files live, their frontmatter fields, `devin doctor` validation where the build provides it, the experimental status of custom profiles (format, behaviour, and configuration may change), the observability limit (the panel labels the profile but not the running model, so no machine-verifiable model attribution), and a worked configuration example using `swe-2-high` expressly marked as an example.
- R10. Existing pinned contract text survives: `tests/review-skill-contract.test.ts`, `tests/pipeline-review-contract.test.ts`, `tests/skills/ce-ideate-dispatch-contracts.test.ts`, and the whole-file `reasoning-elevation` parity all keep passing - embedding is additive.

### Success Criteria

- A Devin user following `docs/guides/configuration.md` end to end can create two profile files, set the two keys, and have every enumerated generic dispatch request the matching profile, with no CE-invented model claims.
- A reviewer can confirm unset-keys-are-no-op and per-class routing by reading one fixture plus one consumer, and confirm coverage completeness by reading the parity test's `CONSUMERS`/`EXCLUDED` maps plus its sweep guard - not by auditing forty files.

### Scope Boundaries

- **Outside this change:** plugin-contributed `agents/<name>/AGENT.md` profiles shipped by this plugin (surfaced as `compound-engineering:<name>`) - evaluated and deferred: a shipped profile cannot be opt-in without these same config keys (dispatch prose must still name it conditionally), pinning a `model:` would force one model policy on every Devin user, and an unpinned one only reaches the already-cheap default; shipping on an experimental upstream contract adds a second failure surface without a benefit the keys alone do not provide; validating profile names against the host; extending profile selection to the reasoning-elevation engine's native route; any change to `plan_model` / `brainstorm_model` / `work_engine_*` semantics.
- **Deferred to follow-up work:** coordination with open PR #1301 (`review_model` / `review_effort` pins for three `ce-code-review` reviewers - complementary, not overlapping: it selects model/effort for specific personas, this change selects host profiles by authority class); a `devin doctor`-backed health check for configured profile names if upstream wants validation beyond informational reporting.

---

## Planning Contract

### Key Technical Decisions

- KTD1. **Two ordinary scalar keys, `subagent_read_profile` and `subagent_write_profile`.** They reuse the `ce-config-layers` cascade exactly like `plan_model` - `config.local.yaml` then `config.yaml`, first active value wins. (session-settled: user-directed - chosen over a single shared profile key: cheaper-model selection must never widen authority.) Alternative considered: a `subagent_profiles:` map `{read: …, write: …}` - rejected; a map replaces whole-key in the cascade and invites partial-merge confusion across the two files.
- KTD2. **Canonical block + parity test.** The rule is authored once in `tests/fixtures/ce-worker-profiles-rule.md` between `<!-- ce-worker-profiles:start -->` / `:end -->` and embedded verbatim in every consumer; a new `tests/worker-profile-rule-parity.test.ts` pins the consumer list and load-bearing clauses. (session-settled: user-directed - chosen over per-surface prose restatements or a referenced-but-not-loadable doc: the repo's established mechanism for a central contract across independently loaded skill files is byte-identical duplication under test, per `tests/config-layers-rule-parity.test.ts`.)
- KTD3. **Orchestrator resolves; child never reads config.** Profile names resolve in the orchestrator at dispatch time and become a dispatch-call argument - same precedent as `output-mode.md` ("pass the resolved path to any subagent, not the config").
- KTD4. **Profile replaces model tier for that dispatch.** Where a surface already says "override to mid-tier", a resolved profile is the override; the primitive's profile already carries model and tools, and passing both is ambiguous.
- KTD5. **Transparent fallback, no unverified claims.** A rejected, unknown, or unresolvable name follows each surface's existing dispatch-failure rule (correct the argument once, otherwise degrade per that surface); the requested name is reported; nothing asserts a profile or model ran that did not serve. The docs do not promise a host-side rejection mechanism - the installed Devin docs do not specify what `run_subagent` does with an absent name, so the rule is check-where-possible plus transparent degrade, not an asserted rejection path. (session-settled: user-directed - chosen over silent fallback to default dispatch: honesty requirement, per `docs/solutions/skill-design/requested-vs-verified-model-identity.md`.)
- KTD6. **Authority class is chosen per dispatch call, not per file, and is judged by project authority, not tool inventory.** Mixed surfaces (`ce-code-review` SKILL.md leaf sequence, `dispatch-reviewers.md` testing persona, `finish-input.md` apply-local report leaf, `ce-optimize` loop, `ce-babysit-pr` envelope fallback) resolve the class where they already resolve that child's authority. Children that write only per-run scratch artifacts under a run directory (dossiers, evidence files, reviewer JSON) stay read-class; children that mutate tracked project content are write-class.
- KTD7. **Capability-described, host-neutral wording.** The block states the condition ("the host's dispatch primitive accepts a named worker profile for an otherwise generic dispatch that still receives CE's prompt payload") and the rule; it never prescribes a flag name - so the same text holds on Devin (`run_subagent`'s `profile` argument) and stays inert on hosts without such a selector. A typed/registered-agent selector (`subagent_type` on Claude Code) is explicitly not a worker-profile selector: CE's contract on those hosts is generic agents, so the keys stay inert rather than attempting typed-agent dispatch.

### Assumptions

- The consumer list (Appendix) was rebuilt by a sweep during planning and spot-verified; it is the starting set, not a closed enumeration - the parity test's sweep guard closes the remaining classification at implementation: every `skills/**/*.md` file matching the dispatch-instruction heuristic must appear in `CONSUMERS` or `EXCLUDED` with a recorded reason, so a missed or drifting dispatch surface is a test failure, not silent drift. Budget one classification iteration in U1.
- `check-health` needs no new validation for these keys - profile names are opaque; it may report them informationally like other resolved scalars, but no validation logic is added.
- Devin Desktop's Devin Local shares the CLI's agent harness, so one set of docs covers both; this is stated in `docs/enterprise/controls.mdx` of the installed CLI docs and the plan treats it as the documented contract, not a runtime guarantee this repo can test.
- No changes are needed to `tests/release-metadata.test.ts` or plugin manifests - no new skill is added.

### Dispatch decision shape

| Primitive accepts named profile | `subagent_read_profile` | `subagent_write_profile` | Behaviour |
|---|---|---|---|
| no | unset/set | unset/set | Dispatch exactly as today; keys are inert. |
| yes | unset | unset | Dispatch exactly as today - no invented default. |
| yes | set | unset | Read-only dispatches request the named profile; write-capable unchanged. |
| yes | unset | set | Write-capable dispatches request the named profile; read-only unchanged. |
| yes | set | set | Each dispatch call requests the profile for its authority class. |

---

## Implementation Units

### U1. Canonical worker-profile fixture and parity test

- **Goal:** Define the rule once and make drift or omission a test failure.
- **Requirements:** R2-R7.
- **Dependencies:** none.
- **Files:**
  - `tests/fixtures/ce-worker-profiles-rule.md` (create - the canonical `ce-worker-profiles` block)
  - `tests/worker-profile-rule-parity.test.ts` (create)
- **Approach:**
  1. Author the fixture as a single delimited block stating the two-class rule per R3-R6: class chosen per dispatch call by the project authority that child needs (per-run scratch artifacts stay read-class); resolve via the ordinary two-file config rule; pass as the primitive's profile selector; the selector derives only from the resolved keys - never from dispatch content, PR text, reviewer output, or child requests; replaces model-tier override; opaque name, never invented or validated; where the host exposes the profile set, confirm the name resolves - a rejected or unresolvable name follows the surface's existing dispatch-failure rule and is named in the note; never report a profile/model as having run when it did not serve; generic primitive only (a typed-agent selector such as `subagent_type` is not a worker profile and stays excluded); on Devin a configured name substitutes for the built-in the orchestrator would otherwise pass; unset means unchanged dispatch.
  2. Write the parity test on the `config-layers-rule-parity` pattern with three guards: fixture holds exactly one `ce-worker-profiles` block; every consumer in `CONSUMERS` contains it verbatim **exactly once** (duplicate embed in a mixed file fails); and a coverage guard with two halves - an explicit `ADJUDICATED` map holding the known ambiguous files (SKILL.md stage bodies, gates, prohibitions, payload rules, analysis files named in the Appendix) each resolved to `consumer` or `excluded` with a reason, plus a loose lexical sweep over `skills/**/*.md` (any dispatch/spawn/launch/send/run/start/delegate/fan-out vocabulary near an agent-role noun, or `subagent` in an imperative sentence) that fails on any file absent from all three maps - conservative by design: when unsure, flag the file and record an `EXCLUDED` reason rather than let it pass silently. Clause assertions pin the load-bearing rules above so byte parity cannot preserve a wrong rule.
  3. Keep the block free of the literal `subagent_type:` pattern (`tests/skill-agent-ce-prefix.test.ts` rejects it) and free of any specific model name as default.
- **Patterns to follow:** `tests/config-layers-rule-parity.test.ts`, `tests/fixtures/ce-config-layers-rule.md`, `tests/docs-root-rule-parity.test.ts` (consumer-map variant for reference files).
- **Test scenarios:**
  - Parity test run before any consumer embeds the block fails listing missing consumers (proves the test bites).
  - A fixture with the block duplicated asserts exactly-one-block.
  - Clause assertions: a fixture variant missing the unset-no-op clause or the no-unverified-claim clause fails.
- **Verification:** `bun test tests/worker-profile-rule-parity.test.ts` red on missing consumers, then green after U3/U4 land.

### U2. Configuration keys in template, example, guide, and health report

- **Goal:** Users can discover and set the two keys through existing config surfaces.
- **Requirements:** R1, R2, R8.
- **Dependencies:** none (independent of U1).
- **Files:**
  - `skills/ce-setup/references/config-template.yaml` (modify - new commented section)
  - `.compound-engineering/config.example.yaml` (regenerate as byte-identical copy)
  - `docs/guides/configuration.md` (modify - Options table rows + semantics note + Devin worked example)
  - `skills/ce-setup/scripts/check-health` (modify - informational reporting of the two resolved scalars only if the existing status section already enumerates resolved keys; otherwise leave untouched)
  - `tests/skills/ce-setup-check-health.test.ts` (modify only if check-health changes)
- **Approach:**
  1. Add a commented "Subagent worker profiles" block to the template documenting both keys with an inline Devin example (`# subagent_read_profile: ce-reviewer`), noting the keys are personal/machine-local choices that belong in `config.local.yaml` by default, paired with profiles under `~/.config/devin/agents/`; `config.yaml` plus committed `.devin/agents/` profiles is shared team policy - a committed key changes every collaborator's and CI's dispatch, and a committed profile file registers ambiently in every collaborator's Devin session where it is selectable by description for any subagent dispatch, not only CE's, so treat it like other reviewed repo-shipped agent configuration; never name a profile after a built-in (the collision is skipped with only a warning, and the key then resolves to the built-in).
  2. Regenerate `.compound-engineering/config.example.yaml` from the template byte-for-byte.
  3. In `configuration.md`, add Options-table rows and a short subsection: what each key does; that names are host-defined; unset-is-unchanged; and a fenced example pair of profile files under `.devin/agents/` - the read profile needs the tools CE read-class dispatches actually use (exec for `git`/`gh` and per-run artifact writes, not a read-only toolset) and may omit `model:` to inherit the cheap default subagent model, with `model: swe-2-high` shown pinned and expressly labelled as an example; the write profile needs write tools and `max-nesting` where a write-class child itself dispatches (the real case is ce-babysit-pr's fallback worker, which loads a skill whose references dispatch their own children - those nested calls resolve the same keys via the embedded block); note background dispatches run only pre-approved tools regardless of profile, and that setting a read profile flattens per-persona model differentiation (the correctness/security/adversarial session-model pins exist for correctness); plus the `devin doctor` validation pointer where the build provides it.
  4. Keep `work_engine_*` distinct in prose: those pick an implementation engine/model identity, not a generic-dispatch worker profile.
- **Patterns to follow:** existing template sections and `configuration.md` "How keys resolve" prose.
- **Test scenarios:**
  - `ce-setup-check-health` template/example byte-sync test passes.
  - The "every `# key:` is documented" test passes with both new keys backticked in `configuration.md`.
  - Unset keys resolve to no value under both files; a local value overrides a repo value (ordinary cascade already tested - assert via the existing test shape if it parameterises keys).
- **Verification:** `bun test tests/skills/ce-setup-check-health.test.ts` green.

### U3. Embed the block in read-only dispatch surfaces

- **Goal:** Every read-only generic dispatch honours `subagent_read_profile`.
- **Requirements:** R3, R4, R5, R6, R7, R10.
- **Dependencies:** U1.
- **Files:** the read-only consumers in the Appendix (about 40 reference/SKILL files across ce-code-review, ce-doc-review, ce-plan, ce-brainstorm, ce-ideate, ce-pov, ce-explain, ce-compound, ce-debug, ce-compound-refresh, ce-simplify-code, ce-sweep, ce-retune, ce-bakeoff, ce-optimize, ce-prototype, ce-riffrec-feedback-analysis).
- **Approach:**
  1. In each file, embed the block once at the existing dispatch/model-tier seam - adjacent to where the surface already discusses subagent dispatch or model tier - never in a position that detaches it from the dispatch it governs, and never twice (files that also appear in U4 get a single embed; the exactly-once assertion pins this).
  2. Additive only: do not remove or reword pinned strings (`review-skill-contract`, `pipeline-review-contract`, `tests/skills/ce-ideate-dispatch-contracts.test.ts` pins).
  3. `reasoning-elevation.md` (both byte-parity copies) is NOT a consumer - the elevation engine has its own resolution; do not touch.
  4. For each file, confirm the dispatch it describes is the generic primitive; drop from `CONSUMERS` with a test-comment reason if a surface has drifted.
- **Patterns to follow:** how `ce-config-layers` blocks sit inside `execution-engines.md` and `cut-passes.md`.
- **Test scenarios:**
  - Parity test green for the read-only set.
  - `bun run test` keeps `review-skill-contract`, `pipeline-review-contract`, `ce-ideate-dispatch-contracts`, `skill-agent-ce-prefix` green.
- **Verification:** targeted `bun test` runs plus full `bun run test`.

### U4. Embed the block in write-capable and mixed dispatch surfaces

- **Goal:** Write-capable and conditional dispatches honour `subagent_write_profile` with the class chosen per call.
- **Requirements:** R3-R7, R10; KTD6.
- **Dependencies:** U1.
- **Files:** the write-capable and mixed consumers in the Appendix (`ce-work` execution-strategy + implementation-loop + review-findings-followup + execution-engines anchor, `ce-resolve-pr-feedback` targeted-mode + full-mode + SKILL.md, `ce-compound-refresh` per-action-flows + classify, `ce-retune` cut-passes, `ce-optimize` loop, `ce-babysit-pr` envelope, `ce-code-review` SKILL.md + dispatch-reviewers + finish-input, `ce-work` shipping-workflow).
- **Approach:**
  1. Same embed rule as U3, placed at the seam where each surface already resolves the child's write authority (worktree isolation for the testing persona, `mode.apply_local` for the report leaf, the envelope's fallback-worker condition).
  2. In `execution-engines.md`, the block sits beside the inline/subagent engine row - the file is the conceptual anchor for host capability.
- **Patterns to follow:** per-file authority-resolution seams named in the Appendix.
- **Test scenarios:**
  - Parity test fully green.
  - `review-skill-contract` pins (including `isolation: "worktree"` and testing-persona safeguards) still green - the block must not weaken the write-isolation wording.
- **Verification:** full `bun run test`.

### U5. Devin spec documentation

- **Goal:** `docs/specs/devin.md` records the verified profile contract so future hosts/skills work from evidence, not memory.
- **Requirements:** R9.
- **Dependencies:** none.
- **Files:** `docs/specs/devin.md` (modify).
- **Approach:**
  1. Add a "Subagent profiles" section: `run_subagent` requires a named `profile` and has no model argument; `subagent_explore` carries read-only codebase tools plus web search (no exec, no file writes) and runs the org's default subagent model; `subagent_general` carries full tools (foreground) or pre-approved tools (background) and always inherits the parent model; custom profiles live in `.devin/agents/`, `.agents/agents/`, `~/.config/devin/agents/` (`%APPDATA%\devin\agents\` on Windows) with `name`/`description`/`model`/`allowed-tools`-or-`tools`/`max-nesting` frontmatter; `allowed-tools` restricts the child's toolset; a profile with no `model:` runs the default subagent model; a name colliding with a built-in is skipped with a warning; the org "Default subagent model" setting governs `subagent_explore` and unpinned profiles but not `subagent_general`; plugin-contributed `agents/<name>/AGENT.md` surface as `<plugin>:<agent>`; `devin doctor` validates frontmatter where the build provides it; Devin Local shares the CLI harness; the subagent panel labels profile, title, status, elapsed time, and tool-call count but does not label which model a running subagent uses, so profile-model attribution is not machine-verifiable from the CLI; custom subagents are experimental and their format, behaviour, and configuration may change.
  2. Bump the spec's Last-verified date and source note (installed CLI `3000.10.27` docs).
- **Test scenarios:**
  - Doc claims match the installed CLI docs (re-verify against `~/.local/share/devin/cli/_versions/3000.10.27/share/devin/docs/subagents.mdx` during implementation).
- **Verification:** `bun run test` doc-claim validators and `release:validate` green.

---

## Verification Contract

| Check | Command | Proves |
|---|---|---|
| New parity test | `bun test tests/worker-profile-rule-parity.test.ts` | Canonical block present verbatim in every consumer; clause assertions hold |
| Config plumbing tests | `bun test tests/skills/ce-setup-check-health.test.ts` | Template/example byte-identical; every `# key:` documented |
| Existing contract pins | `bun test tests/review-skill-contract.test.ts tests/pipeline-review-contract.test.ts tests/skills/ce-ideate-dispatch-contracts.test.ts tests/reasoning-elevation-parity.test.ts tests/skill-agent-ce-prefix.test.ts` | Embedding was additive; no pinned text lost |
| Full suite | `bun run test` | No regressions |
| Release hygiene | `bun run release:validate` | Manifests and skill metadata consistent |
| Plugin validation | `bun run plugin:validate` | Claude plugin manifests valid |
| Devin contract | `devin doctor` against an example `.devin/agents/*.md` profile; re-check installed `subagents.mdx` | Example profiles validate; documented claims match the installed contract |

No live end-to-end Devin dispatch claim is made: runtime profile-model attribution is not exposed by the CLI, so verification is the mechanical contract plus `devin doctor` - the PR must say exactly that.

---

## Definition of Done

- The parity test exists, was observed failing against the pre-embed tree, and is green.
- Every Appendix consumer carries the block verbatim exactly once, or was removed from `CONSUMERS` with a test-comment reason; the sweep guard passes with every dispatch-instructing file listed in `CONSUMERS` or `EXCLUDED`.
- Template and example are byte-identical; `configuration.md` documents both keys; `docs/specs/devin.md` carries the verified profile contract.
- `bun run test`, `bun run release:validate`, `bun run plugin:validate` all green with real output.
- No new default model or profile is shipped; `swe-2-high` appears only as a labelled example.
- No dead-end text (abandoned block drafts, stray consumer edits) remains in the diff.

---

## Appendix

### Consumer list (parity-test `CONSUMERS`)

Inclusion rule: a file is a consumer when it itself instructs the orchestrator to dispatch a generic subagent - it owns the dispatch call, including any tier or authority semantics for that call. Excluded: child payload assets (`references/agents/*`, `references/personas/*`, `*-template.md`, `subagent-template.md`, `validator-batch-template.md`); files that only decide whether to dispatch while the dispatch instruction lives elsewhere; the reasoning-elevation engine (own resolution, whole-file parity); cross-model/CLI machinery; and files whose only subagent mentions analyse past runs. The sweep guard (U1) mechanically re-checks this classification.

**Read-only generic dispatch** (children may write per-run scratch artifacts; they do not mutate tracked project content):

- `skills/ce-code-review/SKILL.md` (mixed - listed in both classes; owns the reviewer-batch and leaf-sequence dispatch imperatives)
- `skills/ce-code-review/references/dispatch-reviewers.md` (mixed - also in the write list)
- `skills/ce-code-review/references/finish-input.md` (mixed - also in the write list)
- `skills/ce-code-review/references/scope.md` (trivial-PR judgment spawn)
- `skills/ce-code-review/references/select-and-route.md` (reviewer dispatch shaping)
- `skills/ce-code-review/references/depth-paths.md` (focused path instructs a concrete one-reviewer fallback dispatch)
- `skills/ce-doc-review/SKILL.md` (own dispatch instruction)
- `skills/ce-doc-review/references/dispatch.md`
- `skills/ce-doc-review/references/synthesis-and-presentation.md` (owns the multi-round persona re-dispatch - verify at implementation)
- `skills/ce-plan/references/research.md`
- `skills/ce-plan/references/deepening-workflow.md`
- `skills/ce-plan/references/universal-planning.md` (dispatches with a `model:` tier selector - the R4 replacement case)
- `skills/ce-brainstorm/references/dialogue.md`
- `skills/ce-brainstorm/references/model-tiers.md`
- `skills/ce-brainstorm/references/approaches.md` (verifier dispatch)
- `skills/ce-ideate/references/grounding.md`
- `skills/ce-ideate/references/decomposition.md`
- `skills/ce-ideate/references/divergent-ideation.md`
- `skills/ce-ideate/references/universal-ideation.md` (elsewhere-mode frames + basis verifier)
- `skills/ce-ideate/references/issue-intelligence.md`
- `skills/ce-ideate/references/user-research-artifacts.md`
- `skills/ce-ideate/references/post-ideation-workflow.md` (verifier and critic dispatches)
- `skills/ce-ideate/references/web-research-cache.md` (cache-miss dispatch instruction)
- `skills/ce-pov/SKILL.md` ("Send scouts directly" imperative - consistent with other SKILL.md consumers)
- `skills/ce-pov/references/grounding.md`
- `skills/ce-explain/SKILL.md` (recap-mode dispatch)
- `skills/ce-explain/references/orchestration.md`
- `skills/ce-compound/references/research.md`
- `skills/ce-compound/references/grounding-validation.md`
- `skills/ce-compound/references/enhancement.md`
- `skills/ce-compound/references/assembly.md` (grounding validator dispatch)
- `skills/ce-compound/references/session-history.md` (session-historian writes only `{run_dir}/` scratch - read-class per KTD6)
- `skills/ce-debug/references/investigate.md`
- `skills/ce-compound-refresh/SKILL.md` (dispatch guidance on every spawn)
- `skills/ce-compound-refresh/references/investigate.md`
- `skills/ce-simplify-code/SKILL.md`
- `skills/ce-sweep/references/model-tiers.md`
- `skills/ce-sweep/references/run.md`
- `skills/ce-retune/references/corpus-audit.md`
- `skills/ce-bakeoff/references/candidates.md`
- `skills/ce-bakeoff/references/judging.md`
- `skills/ce-optimize/references/measurement.md`
- `skills/ce-prototype/references/scoping.md`
- `skills/ce-riffrec-feedback-analysis/references/extensive-analysis.md`
- Additional `skills/*/SKILL.md` files whose bodies carry dispatch imperatives or stage-level dispatch language - `ce-plan`, `ce-retune`, `ce-work`, `ce-optimize`, `ce-ideate`, `ce-bakeoff`, `ce-babysit-pr` - are adjudicated by the sweep guard at implementation and added to `CONSUMERS` or `EXCLUDED` accordingly.

**Write-capable and mixed dispatch** (children mutate tracked project content):

- `skills/ce-work/references/execution-strategy.md`
- `skills/ce-work/references/implementation-loop.md`
- `skills/ce-work/references/execution-engines.md` (conceptual anchor)
- `skills/ce-work/references/review-findings-followup.md` (batched fix subagents write source files)
- `skills/ce-resolve-pr-feedback/SKILL.md` (fixer dispatch)
- `skills/ce-resolve-pr-feedback/references/targeted-mode.md`
- `skills/ce-resolve-pr-feedback/references/full-mode.md`
- `skills/ce-work/references/shipping-workflow.md` (batches and dispatches fix subagents)
- `skills/ce-compound-refresh/references/per-action-flows.md`
- `skills/ce-compound-refresh/references/classify.md` (successor-action subagent replaces and deletes tracked docs - verify at implementation)
- `skills/ce-retune/references/cut-passes.md`
- `skills/ce-optimize/references/loop.md` (mixed - single listing: experiment workers write, judges/researchers read)
- `skills/ce-babysit-pr/references/envelope.md` (conditional fallback worker)
- `skills/ce-code-review/SKILL.md` (mixed - listed in both classes; issues the leaf sequence whose report leaf is write-capable under `mode.apply_local`)
- `skills/ce-code-review/references/dispatch-reviewers.md` (mixed - listed in both classes; testing persona writes on an isolated copy)
- `skills/ce-code-review/references/finish-input.md` (mixed - listed in both classes; report leaf write-capable only under `mode.apply_local`)

**Explicitly not consumers** (`EXCLUDED`, each with a recorded reason; categories below cover the verified members, and the sweep guard adjudicates the tail):

- Own resolution / other machinery: both `reasoning-elevation.md` copies (whole-file parity); all `cross-model-*.md` and CLI-peer references; `lfg` (invokes skills, not generic subagents).
- Payload and prompt-shaping assets: `references/agents/*`, `references/personas/*`, `references/sources/*`, `*-template.md`; `ce-code-review/references/intent-and-plan.md` (payload content rule), `persona-catalog.md` (spawn-condition catalog consulted by select-and-route.md; owns no call); `ce-compound-refresh/references/worth-audit.md` (prompt-clause rule).
- Dispatch prohibitions, gates, and delegating pointers that own no call: `ce-ideate/references/scope-gates.md`; `ce-code-review/references/finish-review.md` (a leaf launches no subagents), `modes-and-output.md` (prohibitions only); `ce-resolve-pr-feedback/references/pipeline-mode.md`; `ce-compound/references/lightweight.md` (explicitly dispatches nothing); `ce-work/references/work-intake.md` (pointer to execution-strategy.md), `input-triage.md`, `non-code-execution.md`, `workspace-setup.md` (ordering note); `ce-plan/SKILL.md` and `references/plan-handoff.md`, `final-review.md`, `approach-altitude.md`, `synthesis-summary.md`, `intake.md` (prohibition, hand-off, or delegation wording); `ce-brainstorm/references/handoff.md` (skill-invocation and substitution prohibition); `ce-ideate/SKILL.md` and `ce-work/SKILL.md` (delegate dispatch detail to listed references); `ce-compound/SKILL.md` (stage prose; dispatches owned by listed references); `ce-setup/references/legacy-codex-tool-map.md` and `skills/ce-setup/scripts/check-health` (descriptive mentions - the latter is non-Markdown and out of sweep scope anyway).
- Analysis-only: `ce-retune` baseline-mining / halt-taxonomy (trace analysis); workflow-shapes.md (prescribes fan-out shapes and the shared dispatch-failure taxonomy the block references; the dispatch instructions live in corpus-audit.md and cut-passes.md).
- `ce-product-pulse/references/run.md` and `SKILL.md` (dispatches analytics queries, not subagents).

### Devin contract evidence (verified during planning)

- Installed CLI `3000.10.27`; docs at `subagents.mdx`, `models.mdx`, `reference/configuration/config-file.mdx`, `enterprise/controls.mdx`.
- `run_subagent` takes a required `profile` argument; built-ins are `subagent_explore` ("read-only codebase tools plus web search; cannot edit files or fetch arbitrary URLs" per `subagents.mdx` - no exec in its documented toolset, inference) and `subagent_general` (full tools foreground / pre-approved tools background, always the parent model). Custom profiles run the `model:` field when set, otherwise the default subagent model.
- Custom profiles: Markdown + YAML frontmatter in `.devin/agents/`, `.agents/agents/`, `~/.config/devin/agents/` (`%APPDATA%\devin\agents\` on Windows); fields `name`, `description`, `model`, `allowed-tools`/`tools`, `max-nesting`; a name colliding with a built-in is skipped with a warning; experimental feature, format/behaviour/configuration may change. `allowed-tools` in a profile is a hard tool restriction (unlike skill frontmatter, which is an auto-approval list); a profile's `description` is agent-visible selection input.
- `devin doctor` exists on this build and its `custom subagent profiles` check passed with none configured (ran during planning); frontmatter-validation depth is unprobed until implementation's example-profile run. `devin models list` shows `swe-2-high` as a current valid identifier on this account (its availability inside a profile `model:` field is inferred, not yet exercised).
- `controls.mdx` states Devin CLI shares the same agent harness as the Devin Local agent. Per the installed overview docs, plugin-contributed profiles load in local Devin agents (CLI and Desktop) only, not cloud sessions.
- The subagent panel labels profile, title, status, elapsed time, and tool-call count; `subagents.mdx` states the CLI does not currently label which model a running subagent is using - profile-model attribution is not machine-verifiable.
- The installed docs do not specify `run_subagent` behaviour for an absent/unknown profile name; R5 therefore requires confirm-where-possible plus transparent degrade rather than asserting a rejection mechanism.

### Deferred questions recorded for the PR

- What `run_subagent` does with an absent or unknown profile name (tool error, silent fallback, or reselection) - the docs are silent; R5 declines to assert a mechanism. Implementation should probe a deliberately wrong name where a check supports it.
- Whether `devin doctor`'s profile check validates frontmatter semantics or merely enumerates - resolvable during U2/U5 against the example files.
- Whether other hosts' named-agent selectors (Codex `spawn_agent` custom agents, Copilot `.github/agents/`, Kiro `.kiro/agents/`) satisfy R3's worker-profile definition - if so the keys activate there too; noted for maintainers, since the change is host-neutral by design.
- Whether a committed `.devin/agents/` profile has any project-trust gate or loads unconditionally for every opener - the docs describe no gate; U2's guidance treats committed profiles as reviewed shared configuration.
