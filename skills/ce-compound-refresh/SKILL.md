---
name: ce-compound-refresh
description: Refresh the repo's captured learnings against the current codebase. Use when auditing stale, overlapping, superseded, or drifted learnings; avoid general refactor, debugging, or code review unless the learnings store is explicit.
argument-hint: "[optional: scope hint — directory, filename, module, or keyword] [mode:non-interactive] "
---

# Compound Refresh

Audit the learnings under `<root>/solutions/` against the current codebase, apply the maintenance actions the evidence supports, and deliver a complete per-doc report plus committed changes. The report and the corrected document set are the deliverables; the store only compounds value if every doc in it can be trusted.

## Setup

Run this once before any subagent dispatch and follow the directives it prints, except where one conflicts with this skill's own rules on asking the user questions — those win in every mode, and no blocking question is asked. Run the fence exactly as written, as its own command: no piping, filtering, truncating, or batching. Its output opens with a `=== skill context` header and ends with `CE_CONTEXT_END`; one without the other means truncation, so rerun the fence verbatim once and never otherwise.

```bash
SKILL_DIR="<absolute path of the directory containing the SKILL.md you just read>";
NODE="$(for c in node nodejs; do command -v "$c" >/dev/null 2>&1 && "$c" -e '' >/dev/null 2>&1 && { echo "$c"; break; }; done)";
if [ -n "$NODE" ]; then
"$NODE" "$SKILL_DIR/scripts/context.mjs" || echo "context script failed; continue with the skill's normal behavior";
else
echo "no Node runtime; continue with the skill's normal behavior";
fi
```

## Mode

**Read `references/modes.md` now** — it decides interactive vs non-interactive from the arguments, and owns what each mode may apply unattended, the stale-marking fallback, the per-harness blocking-question tools, and the `CONCEPTS.md` bootstrap branch. Two rules hold in both modes throughout: a failed write is recorded as **recommended** and the run continues, and a question is asked through the host's blocking tool or not asked at all — never silently skipped.

## Artifact Root

Resolve `<root>` when you first compose a `<root>/solutions/` path, and pass that resolved path to any subagent, not the config.

<!-- ce-docs-root:start -->
**Resolve the CE artifact root `<root>` before composing any artifact path.**

- **Read** `docs_root` from `<repo-root>/.compound-engineering/config.yaml` only (`<repo-root>` = `git rev-parse --show-toplevel`). Do not read it from `config.local.yaml`. Unset -> `<root>` is `docs`, exactly as before.
- **Validate** a set value: a repo-relative directory whose real, symlink-resolved path stays inside the repo and is neither the repo root nor under `.git/`. Otherwise stop with an error naming `docs_root` and the value -- never fall back to `docs`.
- **Use** `<root>` as the sole artifact location: create it if absent, compose each path as `<root>/<subdir>` with this skill's own subdirectory, and never also read `docs`.
<!-- ce-docs-root:end -->

## Scope

Candidates are the `.md` files under `<root>/solutions/`, excluding `README.md` and anything under `_archived/`; a scope hint that matches nothing is reported as a miss, never widened. **Read `references/scope.md`** for the narrowing strategy, the empty-store message, broad-sweep triage order, and the README-row cleanup that rides along with any action.

## Investigate

**Read `references/investigate.md`** — staleness dimensions, auto-memory rules, subagent roles, report-only category-shape observations. Check each learning against the current codebase, then the set for overlap, supersession, and contradiction; a contradiction actively misleads and outranks individual staleness. For a knowledge-track learning that includes a guidance file the learning names or links (a skill's `SKILL.md`, a runbook, a root instruction file): compare only guidance the learning names, never search the guidance layer for one.

Every investigation subagent's prompt carries that reference's three **Subagent prompt** clauses verbatim — search tools, auto-memory scan, and this one:

> If the learning is knowledge-track and names or links a guidance file (a skill's `SKILL.md`, a runbook, a root instruction file), read that file and, when it states a different order or a contradictory rule for the same procedure, return both conflicting quotes plus which side current code follows — or that code witnesses neither. Read only guidance the learning names; do not search for one, and do not edit it.

## Classify

Every doc gets exactly one outcome — **Keep** (no edit, no breadcrumb), **Update** (solution right, references drifted), **Consolidate** (merge into the canonical doc, delete the subsumed one), **Replace** (guidance now misleading; subagent writes the successor, old deleted), or **Delete** (git history is the archive; there is no `_archived/`). **Read `references/classify.md` before assigning any of them**: Update/Replace boundary, auto-delete gate and its two pre-checks, relocation and split rules, the retrieval-value test, unverifiable-is-not-false, pattern docs, and what interactive mode must ask about.

Two boundaries hold whatever the evidence says: when code and doc disagree the doc is what changes — never review the code — and the refresh reports, but must never edit, a skill, runbook, or instruction file that a learning contradicts.

## Execute

Read `references/per-action-flows.md` and follow the section matching each doc's classification — one flow per doc. It owns the step-by-step criteria, relocation and split procedures, the replacement subagent contract (pass `references/schema.yaml`, `references/yaml-schema.md`, `assets/resolution-template.md`; validate with the bundled frontmatter and doc-claims scripts), and citation cleanup.

## Vocabulary Capture

After the per-doc actions execute, reconcile the domain terms flagged during investigation with `CONCEPTS.md`. **Read `references/concepts-vocabulary.md` — unconditionally**; its qualifying criteria are non-obvious, so a "nothing qualifies" judgment without reading it is a shortcut, not a result. It owns the seed goal, aggregation, scrub, bootstrap preamble, and the bound to the area in scope. Edits apply silently in every mode, and the report's `CONCEPTS.md` line always records what the scan found — including "scanned, no qualifying terms".

## Report

**Print the full report as markdown — it is the deliverable, not an internal summary**, and in non-interactive mode it is the sole deliverable: self-contained, never abbreviated, split into **Applied** and **Recommended**. **Read `references/report.md`** for the summary block, the per-file detail every processed doc gets, and what belongs under Recommended.

## Commit

Skip if no files changed; otherwise stage **only** the files this refresh modified and commit in the repo's convention. **Read `references/commit.md`** for the branch decision in each mode and the git-failure fallback.

## Discoverability Check

After the report, check that the project's instruction files would lead an agent to discover `<root>/solutions/` before working in a documented area — every time, since the store only compounds value when agents can find it. **Read `references/discoverability.md`**: what the reader must learn, the smallest-addition rule and its tone, the `CONCEPTS.md` variant, consent in interactive mode versus a report line in non-interactive mode, and folding a late edit into the commit.

## Relationship to ce-compound

`ce-compound` captures a newly solved problem; this skill maintains the store as the codebase evolves. Replace only with real evidence — otherwise stale-mark and point the user at `ce-compound` — and consolidate proactively, since every capture adds a doc and redundant docs drift silently.
