# Plan: `ce-code-review` reviewer consolidation + a repo-owned rules file

> Status: draft for review. Not a `ce-unified-plan` artifact (deliberately — `lfg` and `ce-work` must not try to execute this).
> Origin: `ce-code-review` reached ~7,392 lines and 16 reviewer personas. An audit found three review rules each written into three separate personas, a structural axis gated off for most diffs, and a "did we build what we said?" axis with no agent at all. Reviewed across three cross-model panel rounds plus maintainer direction; this is rev 4.

## 1. The defect

Three rules are each written into three separate personas in near-identical prose:

| Rule | Copies |
|---|---|
| Stand-in guard fidelity | `correctness:10`, `reliability:12`, `adversarial:64` |
| Sentinel reuse | `correctness:9`, `api-contract:11`, `testing:9` |
| React effect lifecycle | `correctness:13`, `frontend-races:8` (was `julik-frontend-races`), `testing:7` |

The corroborating tell: `adversarial-reviewer.md:80-91` is eight bullets naming other personas to disclaim territory, then defines its own scope as "the space between these reviewers."

Two structural gaps: `maintainability` holds 10 of Fowler's 12 smells but is gated off below ~200 executable changed lines, so most diffs get no structural review; and requirements completeness is an orchestrator checklist (`finish-review.md:123`) while `previous-comments` gets a full dispatch for a near-identical question.

`subagent-template.md:169` also gives *every* persona a trailing "compare the code changes against the stated intent" bullet, which competes with any dedicated spec axis.

**Scope note:** `findings-mechanics.py:67` fingerprints only `(file, line, title)` — the deterministic helper does exact dedup; semantic reconciliation is orchestrator judgment (`finish-review.md:19`). Overlap costs orchestrator attention, not helper complexity.

## 2. The discriminator (a routing prior, not a proof)

> A concern is a candidate for its own **dispatch** when answering it requires a different **reasoning mode**. It is a candidate for an **output obligation** when it is a different **question** in the same mode.

A required output field guarantees a question is *asked* — the field is absent if skipped, and that is detectable. Only a separate agent with its own context guarantees it is *worked*.

This is a prior. It mislabels at least one real case (the Rails dump-diff procedure is sustained evidence acquisition, not a lookup), so **ablation decides** (§7).

Two rules hold absolutely:

- **Content alone never earns a dispatch.** A rubric with no distinct mode is a rule pack, not a reviewer.
- **Only a looser bar needs isolation.** `security` runs deliberately low (P0 at anchor 50, `security-reviewer.md:15`) and would contaminate other lenses. `performance` runs deliberately high (`performance-reviewer.md:15`); suppression is local to a finding and travels inside a bigger rubric.

## 3. Six dispatches, five report axes

**An axis is a section of the report. A dispatch is a subagent. They are not the same thing.**

| Axis | Dispatch(es) | Mode that earns it |
|---|---|---|
| Correctness | `correctness` | trace execution, find the defect that is there; carries the §4 obligations |
| Standards | `standards-cited` + `standards-structural` | rule retrieval vs uncodified structural judgment — different modes |
| Spec | `spec` | compare an artifact to a document; find what is *absent* from the diff |
| Testing | `testing` | judge existing artifacts for false confidence — not defect-hunting |
| Security | `security` | adversarial attack construction, at a deliberately looser bar |

Plus **adversarial as a mechanism, not a persona** — the cross-model peer. Its value is model independence, not a distinct rubric; the in-process fallback is deleted.

Splitting standards into two dispatches under one report section preserves the distinct reasoning without meaningfully increasing synthesis complexity, and it is what un-gates structural review on small diffs.

### 3.1 Disposition of all 16

| Current | Disposition |
|---|---|
| correctness | keep; carries the §4 obligations |
| project-standards | becomes `standards-cited` |
| maintainability | becomes `standards-structural`; **un-gated**; add Feature Envy + Repeated Switches |
| testing | keep; add tautological-expected-value and interface-bypass rules |
| security | keep |
| performance | fold -> `correctness` |
| reliability | fold -> `correctness` (already near-duplicate) |
| api-contract | fold -> `correctness` as `contract_check` |
| data-migration | portable half -> `migration_check`; Rails procedure -> gated procedure / standards example |
| deployment-verification | Stage 6 checklist template, fired by `migration_check: applicable` |
| previous-comments | fold -> `spec`; thread fetch moves to §5 |
| adversarial | cross-model mechanism only; in-process persona deleted |
| julik-frontend-races | **kept**, renamed `frontend-races`, selected for async UI in any framework (see §3.2) |
| swift-ios | **deleted** (§3.3): `correctness` alone caught every planted Swift defect |
| agent-native | **kept**, selection narrowed to agent tool surfaces (§3.2); prompt restated as a goal on the structured findings contract (§3.3) |
| learnings-researcher | recategorize -> §5 evidence, not a findings producer |
| *(none today)* | **new: `spec`** |

### 3.2 Usage review of julik-frontend-races and agent-native (2026-11-08)

Real review runs replaced the deletions above for these two. Claude transcripts covered 2026-10-05 to 2026-11-07 (56 full review rounds); Codex covered June to November.

- **julik-frontend-races** ran in 6 of 56 rounds, never on Stimulus/Turbo code: every run was React, Next.js, or a plain DOM script. In 3 of the 6 it found a real UI race that no other reviewer raised (a bypassed confirmation, a select that snapped back, out-of-order poll responses), and each was fixed. `correctness` carried the same `useEffect` checklist in those runs and missed all three. The persona was never a Rails procedure; its defect was the name and a Stimulus-first trigger. Ablation 2 still decides any fold into `correctness`.
- **agent-native** ran 25 times. 12 returns were empty or observations only, one item became a ranked finding (shared with `api-contract`), and every Codex run in the window returned PASS. Its gaps paid off where the product has an MCP/API parity program (last30days PR #462 added agent-facing fields from them). On skill-prose diffs in this repo, where the path signal selected it, it had nothing to map.

### 3.3 Fold ablation (2026-11-08)

Each case ran three arms on Claude and Codex, two trials each, graded blind by a separate model: `correctness` alone, the specialist alone, and `correctness` with the specialist's hunting list appended. On Claude, `correctness` ran on the session model and specialists on the mid-tier model, as in real dispatch; on Codex every arm ran the same model.

- **frontend-races stays a separate dispatch.** Three real races from the §3.2 runs, rebuilt from the diffs the original reviewers saw (the fixtures stay local because their source repos are private), plus a clean control. Detection: `correctness` 8/12, specialist 11/12, fold 7/12; control false positives 0 / 0 / 1. Appending the checklist to `correctness` added nothing; the gain comes from a reviewer dedicated to the lens. The gap was on Claude, where `correctness` twice saw a race but filed it as a residual risk. Ablation 2 is answered for frontend races: no fold.
- **swift-ios is deleted.** No real iOS review exists on this machine, so six synthetic cases were used: two textbook bugs, three iOS-specific ones (a non-optional Core Data attribute with no migration, a Release-only `.pbxproj` switch that disables strict concurrency, actor reentrancy), and a clean control. Every arm caught every planted defect (4/4 each); `correctness` named the build-setting change itself 3/4 times, the specialist 2/4. The cases fit in one file, which is this result's main limit.
- **agent-native's prompt over-specified.** It scripted a six-step audit, a capability-map table, and a PASS/NEEDS WORK score, and returned prose outside the findings schema, so its gaps skipped validation and only 1 of 25 dispatches produced a ranked finding. It now states the goal and returns the standard findings JSON.
- **agent-native stays a separate dispatch.** Synthetic MCP-product cases, same three arms. With the parity goal stated in the README (a UI action with no tool, a new field the prompt never mentions), all arms caught both gaps 4/4, so those cases could not discriminate. With no stated parity goal (a delete that became recoverable while the tool still says "permanent", a tool that reports success on a refused rename, workspace scoping applied to the UI but not to the tools or prompt) plus a clean control: detection `correctness` 9/12, specialist 12/12, fold 12/12; false positives 8 / 0 / 9. Appending the checklist recovers detection but keeps `correctness`'s noise; the dedicated reviewer was the only arm that was both complete and quiet, and the only one that named both halves of the trash gap every time.

## 4. Output obligations

`correctness` returns required fields alongside its findings, each `applicable | not_applicable` **with a justification either way**:

```
migration_check  -> deploy-window compatibility, backfill for new NOT NULL, rollback path,
                    dual-write, orphaned references, silent data loss
contract_check   -> breaking shape change, versioning/deprecation path, sentinel overload,
                    evidenced consumer impact
```

**Why the migration persona goes.** `data-migration-reviewer.md` contains **zero** references to any non-Rails migration tool: Step 0 diffs `db/schema.rb` / `db/structure.sql`, and both `suggested_fix` blocks emit `bin/rails db:migrate` (`:13-44`). Alembic/Flyway/Liquibase appear only in the spawn gate (`select-and-route.md:61`), never in the persona. The gate admits a Django, Prisma, or Ecto repo and hands it a reviewer whose procedure does not apply — the same defect as `julik-frontend-races` and `swift-ios` under a more general-sounding name.

The split is by portability: portable deploy-window principles become the obligation, checked on **every** review rather than only when a Rails-shaped gate opens (strictly more coverage than today); the Rails dump-diff procedure becomes a gated procedure with an honest name.

Obligations prove a question was asked, not that it was worked — see §7 ablation 1, which measures that directly.

## 5. Orchestrator-owned evidence acquisition

Today each persona gathers its own evidence, so gathering is duplicated and folding a persona silently drops its gathering step. Separate **acquisition** from **reasoning**:

The orchestrator acquires and labels, once: plan/requirements, prior review threads, designated criteria files, migration/schema artifacts, and changed public-contract surfaces. Each axis receives labelled evidence and returns an evidence-linked disposition; missing or unsupported dispositions are validated centrally.

**The manifest carries source pointers, never conclusions.** A label like "public-contract" or "migration impact" names *where to look*, not *what was found*. Encoding conclusions in the manifest turns this stage into a god object and moves judgment out of the reviewers. Reviewers keep semantic interpretation and targeted follow-up reads (`intent-and-plan.md:75-79`).

This is what makes the folds safe: `previous-comments` folds into `spec` because the thread fetch moves here, so the fold is no longer a source mismatch.

## 6. The rules file

### 6.1 Discovery and precedence

Stage 3b globs only `**/CLAUDE.md` and `**/AGENTS.md` today (`select-and-route.md:67-70`). Change the **designation**, not just the glob:

1. `**/CODING_STANDARDS.md` under the existing ancestor rule — the designated criteria source.
2. Instruction files are a **fallback**, read only where no standards file governs.

**Exactly one effective criteria source per changed file**, resolved by precedence — not both consulted together.

Rationale: an instruction file is *steering*, charged to every agent's context every turn, so it is under permanent pressure to stay small. That is why the current `project-standards` hunting list is all plugin-specific trivia. Criteria want a file with no context tax and room to grow. The fallback stays because every existing user's rules live in their instruction file today; removing the read outright would take their standards review to zero findings.

This narrows the exception recorded at `AGENTS.md:158`, which changes in the same PR.

**Reviewer personas are dispatched as fresh generic subagents** (`dispatch-reviewers.md`) and do not inherit the orchestrator's auto-loaded instruction files, so naming files on this path remains correct — the reviewer audits them, it does not re-read them for context.

### 6.2 Format agnosticism

**The file may be authored by a human or another tool. The content is the contract; the format is not.**

- **Reading:** extract rules from whatever shape the file is in — prose, bullets, tables, nested headings, with or without frontmatter. Impose no schema, require no IDs, require no frontmatter. Citation already works on free text (`project-standards-reviewer.md` requires "the exact quote or section reference"), and that generalizes.
- **Writing and grooming:** detect the file's existing conventions — heading style, grouping, whether rules carry rationale — and match them. **Never reformat, normalize, or migrate the file to a CE shape.**
- **Creating one that does not exist:** use a minimal conventional structure a human would plausibly have written. No CE branding, no machine-readable envelope.

A consequence for §6.3: criteria-change disclosure reports changed rules as **quoted hunks**, not as rule IDs, because there are no IDs to report.

### 6.3 Criteria are read from head, and changes are disclosed

Criteria resolve from the **reviewed head**, not from the merge-base. A rules file is deliberate, human-authored policy: reviewing against the old rule would override the team's stated intent and file findings they have explicitly decided not to care about. It would also mean a PR that adds a rule never gets checked against it — backwards for the loop this design exists to build, where the natural flow is *notice -> write the rule -> fix the thing*, often in one PR.

The real risk is not which version governs; it is that suppression is **invisible**. So:

**When the reviewed diff modifies a criteria file, the report says so** — naming the rules added, changed, or removed as quoted hunks. **For rules loosened or removed in the diff, report what that suppressed:** "2 structural findings suppressed by a rule added in this PR (`CODING_STANDARDS.md`, quoted)." Not a violation — visibility.

That covers both the adversarial case and the honest mistake with one Coverage line, and keeps the reviewer out of the business of adjudicating policy.

**The governance control lives at rule adoption, not rule reading** (§6.4). Base-reading would only delay a self-suppressing rule by one PR; a human-gated adoption stops it.

### 6.4 Who reads, writes, and grooms

| Skill | Role |
|---|---|
| `ce-code-review` | **reads and enforces**; emits *candidate rules* — a finding not anchored in any cited rule — and hands off. It never writes the file (`SKILL.md`: "Report-only by default… Never push, open PRs, or file tickets in any mode"). |
| `ce-compound` | **adopts** a rule, in an explicitly invoked mode, only when asked. A candidate stays a candidate until deliberately adopted. |
| `ce-compound-refresh` | **grooms** the file, under the condition in §6.5 |

### 6.5 The `ce-compound-refresh` exception, stated as a condition

`ce-compound-refresh:46,54` currently forbids editing "a skill, runbook, or instruction file." That rule's real subject is **authorship**: those are files refresh did not author and whose review path it is not part of.

A CE-owned enforceable-rules artifact is in the same authorship domain as `<root>/solutions/`, so the prohibition should not reach it. But editing it changes review behavior deterministically, so the exception is bounded by **semantic effect**, not by filename:

> Refresh may perform non-semantic maintenance and reporting on a CE-owned enforceable-rules artifact — consolidating duplicate rules, flagging a rule contradicted by current code, stale-marking and handing off. It may not **adopt** a new rule or **retire or weaken** an existing one; those are policy acts and belong to an explicitly invoked adoption.

Stated this way it generalizes to any future CE-owned enforceable artifact without anyone editing the rule again. It also matches refresh's existing posture: "Replace only on real evidence; without it, stale-mark the doc and point the user at `ce-compound`."

Grooming is mandatory, not optional. A file read on every review that only ever grows dilutes reviewer attention and consumes context budget — the same failure the ~200-line `maintainability` gate was papering over.

**Open:** candidate rules accumulate across many reviews, so adoption may be a batch moment ("go through my candidate rules") rather than `ce-compound`'s "I just solved a problem" trigger. Different trigger is one of the repo's split criteria (`portable-agent-skill-authoring.md:150`). Start it as a mode; split only if the batch flow proves to be its own workflow.

### 6.6 The shared template must change

`subagent-template.md:136` tells every persona to suppress "General code-quality concerns not codified in CLAUDE.md / AGENTS.md." An always-on Fowler floor is definitionally that, so the floor is currently illegal in our own template. Scope that suppression to reviewers carrying a citation contract. Remove the trailing intent bullet at `:169`, which competes with `spec` and the §4 obligations.

## 7. Validation

Mechanical contracts via `bun run test`. Behavior via `bun run test:skill-eval-pack -- --skill ce-code-review --arm ab` on Claude and Codex, **with real dispatch** — this skill's key behavior is delegation, so a no-dispatch probe cannot validate it.

**Ablation is the proof standard.** Reversed real defects plus clean controls, measuring marginal detection, false-positive noise, latency, and cost — never whether 6 dispatches reproduce 16 personas' raw finding count.

1. **Obligation vs persona.** Reversed migration and contract defects, obligations vs today's gated personas. On diffs where the concern *is* applicable, measure the `not_applicable` rate, **applicable-with-empty-findings**, and **justification accuracy**, rejecting tautological justifications mechanically. Field presence proves a schema was satisfied, not that work happened — this is the plan's single biggest risk.
2. **Correctness absorption.** Reversed reliability, performance, and frontend-race defects, merged vs separate. Frontend races answered in §3.3 (keep separate); reliability and performance still open.
3. **Standards split.** Two dispatches vs one, on a diff carrying both a rule violation and an uncodified structural regression — the starvation case.
4. **Format agnosticism.** Three differently-shaped `CODING_STANDARDS.md` files (prose, bullets, table) carrying the same rules; citation quality must not vary by shape.

A fold that misses a decision-relevant defect the 16-persona roster caught is falsified and reverts on its own.

## 8. Sequencing

1. `CODING_STANDARDS.md` discovery + precedence + format-agnostic reading (§6.1, §6.2); update `AGENTS.md:158`.
2. Amend `subagent-template.md:136`; remove `:169` (§6.6).
3. `standards-cited` + `standards-structural`; un-gate the floor; add the 2 missing smells and the 2 testing rules. Behind ablation 3.
4. ~~Delete swift~~ done (§3.3). julik and agent-native were re-scoped instead (§3.2, §3.3).
5. Criteria-change disclosure (§6.3).
6. `spec` axis; §5 evidence layer; fold `previous-comments`.
7. `correctness` absorption and the §4 obligations **last**, behind ablations 1 and 2 — the only step that can lose a finding.
8. Separate PRs: `ce-compound` adoption mode; `ce-compound-refresh` grooming exception (§6.5), routed through `ce-skill-work`.

## 9. Provenance

Three cross-model panel rounds via `ce-pov`. Peers: codex (`gpt-5.6-sol`) and grok (`grok-4.6`), both attestably different serving families from the host; served model IDs unverified. Both returned `revise-first` on rev 1 and rev 2 and **moved** to agreeing the shipped `data-migration` persona should not ship as a generalist. Codex `held` on rev 3 and contributed §5's manifest boundary and the §6.4 authority split. Grok was dropped in round 3 (non-final artifact twice on the same route) and its round-2 position is not carried as a round-3 voice.

Maintainer decisions folded in: cut `data-migration` as a persona; demote instruction files; head-reading over merge-base; adoption as an invoked mode; format agnosticism; grooming stays with `ce-compound-refresh` rather than a new skill.
