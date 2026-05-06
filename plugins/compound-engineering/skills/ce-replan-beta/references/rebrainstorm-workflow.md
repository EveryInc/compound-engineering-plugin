# Re-Brainstorm Workflow

Loaded by `ce-replan-beta`'s Phase 2a. Re-brainstorming is the load-bearing move that separates a replan from an in-place plan edit. The original brainstorm and PR are **evidence to interrogate**, not authoritative framing to inherit.

The output of this phase is a forked `*-requirements.md` doc, not a new plan. The plan is derived from the forked brainstorm in the next phase (Phase 2b).

## Four steps

### 1. Read artifacts in this order

Order matters. Read in the sequence below specifically — the goal is to absorb the user's discussion language before the original brainstorm's distillation of it.

1. **PR review threads, comments, and review submissions.** The user's actual back-and-forth is where the original requirements got tested. Pay attention to where reviewers pushed back, where the user changed their mind, and where confusion accumulated. Use `scripts/fetch-pr-context.sh`'s output (passed as a path, not inlined) when dispatching subagents.
2. **Recent docs in `docs/brainstorms/`.** Any brainstorm that postdates the original is a likely source of new framing. Scan for topic-related material.
3. **Prior conversation context.** Whatever the user said in the current session that prompted the replan.
4. **Original plan doc.** Read for what was decided, but treat the framing as a hypothesis under review.
5. **Original brainstorm.** Read **last**. The risk of reading it first is that its prose anchors the agent's re-derivation; reading it last means the new framing is shaped by the discussion before being cross-checked against the original.

### 2. Re-derive the problem frame from user discussion language

Compose a fresh problem-frame paragraph using the **user's words from the discussion**, not from the original brainstorm's polished prose. Specifically:

- Quote or close-paraphrase what the user said about the pain in PR threads or recent conversation.
- Identify the moment of pain: what triggered the replan? A specific reviewer comment, a code-reading discovery, a brainstorm doc, a "this could be much simpler" realization?
- State what the user thought before the new learnings, and what they think now. The **delta** is the reason the replan exists.

Where the new problem frame agrees with the original, that's fine — the original wasn't wrong, it was incomplete. The discipline is to derive independently first, then notice the agreements, rather than copying the original framing verbatim.

### 3. Walk every original requirement

For each requirement in the original brainstorm, assign one of three dispositions:

- **`[unchanged]`** — the requirement still holds as stated. Default for requirements where no learning contradicts them. No further reasoning needed; the requirement carries forward in the forked brainstorm under its original R-ID.
- **`[revised]`** — the requirement still has real intent behind it, but the learnings reshape what it should say. The R-ID carries forward; the wording is updated; the disposition marker becomes `[revised from rev N]` in the forked brainstorm. Capture both the original wording and the specific learning that drove the change so future readers see the lineage.
- **`[discarded]`** — the requirement was tied to an approach the replan abandons, and there is no underlying intent worth carrying forward. The R-ID is **not reused** for new content; it leaves a gap in the active list and moves to a `## Discarded Requirements` section in the forked brainstorm with the original wording and a one-line reason.

This step satisfies the no-silent-inheritance rule: every original requirement is touched explicitly, and the disposition is visible in the forked output. Default to `[unchanged]` is intentional — the agent does not invent reasons to revise. But never silently drop a requirement, even one the new approach makes obviously irrelevant: surface it as `[discarded]` with a one-line rationale.

After requirements, perform the same pass on:

- **Scope boundaries** — is anything previously excluded now in scope? Is anything previously in scope now out?
- **Key decisions** — which decisions still hold? Which need revisiting?
- **Outstanding questions** — which were resolved by the learnings? Which still apply? Are there new questions?

### 4. R-ID stability rule (load-bearing)

R-IDs are the anchor that makes the compounding loop work. The rules:

- **Original IDs preserved.** R1 in the original stays R1 in the forked brainstorm, regardless of whether it was `[unchanged]`, `[revised]`, or `[discarded]`.
- **Revisions keep their ID** with new wording. The marker `[revised from rev N]` (where N is the original brainstorm's revision number, defaulting to `1`) makes the change visible inline.
- **Discards leave gaps.** R5 absent from the active list is fine — gaps are how the loop stays auditable. R5 appears in `## Discarded Requirements` with the original wording, one-line reason, and `[discarded from rev N]` marker.
- **New requirements get the next-unused R-ID.** Never reuse a discarded ID for new content. If the original had R1–R6 and R5 is discarded, new requirements continue from R7.
- **No renumbering, ever.** Reordering, splitting, and discarding all preserve R-IDs in place. The forked brainstorm's active list may have gaps; that is correct.

The discipline echoes how `ce-plan`'s U-IDs survive plan edits.

### 5. Compose a three-bucket synthesis at the requirements scope

Mirror the synthesis pattern used by `ce-plan` and `ce-brainstorm`. Format:

```
Based on the PR, original requirements, and new learnings, here's the scope I'm proposing for the forked brainstorm:

[1-3 line prose summary — what's changing in the requirements layer, in plain language. Forward-looking.]

**Stated** (carried forward from the PR, original brainstorm, and learnings):
- [item]

**Inferred** (gaps I filled with assumptions — flag anything I got wrong):
- [item]

**Out of scope** (deliberately excluded — including things the original had that the replan drops):
- [item]
```

Use prose for the user response (no `AskUserQuestion` menu) — option sets bias the answer. The user confirms, revises, or redirects. **In pipeline mode**, skip the prompt and route Inferred bets to a `## Assumptions` section in the forked brainstorm.

## Anti-patterns

- **Diff-against-the-original-brainstorm thinking.** Do not treat re-brainstorming as "what changed in the requirements." Re-derive the user story first, then let requirement changes fall out. A diff mentality preserves the original framing's blind spots.
- **Preserving the original brainstorm's framing language.** If the new problem-frame paragraph reads like a paraphrase of the original, the inheritance has already happened. Use the user's discussion language instead.
- **Critique-mode.** This is not a review of the original brainstorm's quality. It is a re-derivation in light of new information. The original was correct given what was known then; the replan exists because the world changed.
- **Skipping requirements.** "All the original requirements obviously still hold" is a tell that step 3 was not actually performed. Each requirement gets an explicit `[unchanged]` / `[revised]` / `[discarded]` disposition, not a blanket assumption.
- **Brainstorm-from-zero.** The opposite failure: ignoring the original artifacts entirely and re-deriving from scratch. The original PR's working code, designs, and IDs are real evidence of what the user wanted; re-brainstorming refines that, doesn't throw it away.
- **Renumbering R-IDs.** Even when discards leave large gaps, do not renumber. The gaps are how the loop's history stays auditable.

## Legacy fallback — original brainstorm has no R-IDs

Older brainstorms (or brainstorms produced by hand) may not have explicit R-IDs in their Requirements section. When the original lacks R-IDs:

1. Derive implicit R-IDs first by numbering the original's Requirements bullets in order (top to bottom, left to right). R1 = first bullet, R2 = second, etc. Group headers don't take an ID; only the bullets within do.
2. Surface the derived R-IDs explicitly in the synthesis ("the original had no R-IDs; I've assigned them as: R1 = [first bullet], R2 = [second bullet], ...") so the user can correct any misreading before the fork is written.
3. Once confirmed, carry the derived IDs forward as if they had been there all along.

The forked brainstorm's `revision: 2` frontmatter still applies; the original is treated as `revision: 1` even though the file itself didn't claim that.

## Worked example: the brief-view scenario

A long-running PR (`origin/brief-view`) introduced a new sidecar table for tracking briefed-state transitions. The original brainstorm had R1–R6 covering the sidecar approach. After several rounds of review, the user discovered that an existing saved-view system (`action == brief AND has INBOX`) could provide the same tracking without any new tables.

A naive replan would say: "drop the sidecar requirements, add a saved-view requirement, keep the rest." That misses the point — it's an in-place edit of the requirements list, not a re-derivation.

A re-brainstorming pass instead asks:

1. **Artifacts read** — PR threads (where reviewers questioned the sidecar's necessity), the new brainstorm noting the saved-view alternative, prior conversation, original plan, original brainstorm.
2. **Re-derived problem frame** — the user wanted to track when emails became "briefed" so list counts and chips updated correctly. They thought a sidecar table was needed because they didn't yet know the saved-view system existed. The new framing is "track briefed transitions"; the storage choice (sidecar vs saved-view) is downstream.
3. **Requirement walk:**
   - R1 (track briefed transitions) → `[unchanged]`. Still required.
   - R2 (update list counts on briefing) → `[unchanged]`. Still required.
   - R3 (sidecar table for transitions) → `[discarded]`. The underlying intent (R1) is preserved separately; the table itself is gone. Reason: saved-view repurposing eliminates the need.
   - R4 (mailer hook on briefing) → `[revised]`. Still required, but now hooks into saved-view machinery instead of sidecar. New wording captures the saved-view dependency.
   - R5 (ERD entry for sidecar) → `[discarded]`. Tied to R3; same reason.
   - R6 (migration for sidecar) → `[discarded]`. Tied to R3; same reason.
   - **New R7** (saved-view dependency must remain stable across schema migrations) → next-unused ID.
4. **Three-bucket synthesis at the requirements scope**:
   - **Stated**: track briefed transitions (R1), list count updates (R2), mailer behavior (R4 revised), saved-view stability dependency (R7 new).
   - **Inferred**: saved-view repurposing is the right approach for v1 (the user said "I think this works" but did not test it under load).
   - **Out**: sidecar table, ERD entry, migration. The *approach* is gone; the *intent* (R1, R2) carries forward via a different mechanism.

The forked brainstorm has R1, R2, R4, R7 in its active list, with R3, R5, R6 in `## Discarded Requirements`. Frontmatter has `supersedes: docs/brainstorms/<original>.md` and `revision: 2`.

The new plan (Phase 2b's job, not this phase's) then derives from the forked brainstorm's active R-IDs and produces from-`main` units that may cherry-pick designs, IDs, or UI components from the original PR.

The level of detail in this example is illustrative — actual replans will have shorter and longer cases.
