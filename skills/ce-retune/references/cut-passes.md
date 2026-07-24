# Cut Passes (Phase 4)

A pass applies **one problem class** across the corpus and stops. The work fails in two places: agents overwriting each other, and edits left half-applied. Both are prevented by protocol, not care.

`references/workflow-shapes.md` carries the cross-phase orchestration catalog. This file is the Phase 4 procedure only.

## The pass loop

1. Pick one class from the Phase 3 findings (`references/corpus-audit.md`), or one regression class from `references/halt-taxonomy.md`. One class per pass, no bundling.
2. Write the **ownership manifest**: unit -> owning agent -> exact paths. Shared assets get a single named owner (below).
3. If the rewrite has cross-referencing strings, author the **contract file** first, serially (below).
4. Dispatch one agent per unit through whatever sub-agent primitive the platform provides, each prompt carrying: the class, the contract path if any, its own paths, and the forbidden paths.
5. **Reconcile** every block touched (below). This is the step that gets skipped.
6. Run the project's own test suite. A pinned string that disappeared is a finding to report with its test path, never a test to edit.
7. Collect each agent's applied/skipped report. Then measure (Phase 5) and commit the pass alone.

Eight passes landed in the engagement that produced this skill. Every one reduced to the same class. Resist widening a pass to "also fix the obvious thing" — a pass that changed two classes cannot be attributed by the next measurement.

## Ownership: one problem per agent, disjoint files

Fanning out by **problem** looks natural and collides immediately: a single class — say, a phrasing that implies an absent reader — appears in twenty files, and the next class appears in eleven of the same twenty. Two agents open one file, both write, the second write wins, and the loss is silent because each agent's own diff looks correct.

Fan out by **unit** instead: one agent owns one skill directory and applies the class everywhere inside it. Ownership is then a partition of the filesystem, and the invariant is checkable before dispatch: every path appears in exactly one manifest row.

| Manifest column | Content |
|---|---|
| unit | the directory the agent owns, e.g. `skills/<name>/` |
| paths | explicit glob or file list inside it |
| forbidden | shared assets and anything outside `unit`, listed by path |
| class | the one problem being applied |
| contract | path to the canonical mapping, or `none` |

State the forbidden set in the prompt as paths, not as a rule to infer. An agent told "do not touch shared files" will decide for itself what is shared.

## Isolation: separate worktrees or disjoint paths in one tree

Disjoint paths in one tree are enough when nothing an agent runs mutates state outside its own paths. That covers most cut passes: edits are text, the manifest is a partition, and a single tree keeps the diff readable and the commit trivial.

Pay for a worktree (or equivalent per-agent checkout) when any of these is true:

- Agents run builds, formatters, generators, or anything that writes outside its unit — lockfiles, caches, generated output, a repo-root config.
- An agent needs to run the suite or the harness to check its own edit; concurrent runs in one tree race on scratch and on git index state.
- Agents commit, stage, or use branch operations; one git index shared by parallel agents corrupts staging.
- A pass may need to be abandoned wholesale, and a clean discard is worth more than a shared diff.

Otherwise the isolation cost is real: N checkouts to create, N results to merge, and merge conflicts reintroduced on exactly the files the manifest was designed to keep apart.

## The shared-asset trap

Some corpora hold byte-identical copies of a file inside several units, deliberately, with a parity test asserting the copies match. A per-unit agent editing "its" copy breaks parity, and the breakage surfaces as a test failure in a *different* pass, attributed to the wrong change.

Discover them before dispatch. Shape (POSIX shell; hash every candidate file, key by basename, report pairs appearing in more than one path):

```
find . -type f \( -name '*.md' -o -name '*.py' -o -name '*.sh' \) -exec shasum {} + \
  | awk '{ n = $2; sub(/.*\//, "", n); print $1, n }' \
  | sort | uniq -c | awk '$1 > 1'
```

Read the output two ways. A basename with **one** hash across many paths is a maintained shared asset: assign it exactly one owner, list it as forbidden for everyone else, and have that owner propagate the edit to all copies in the same pass. A basename with **several** hashes across paths is drift that already happened — a finding, not necessarily yours to fix in this pass.

Whether a duplication should exist at all is a proposal-time question, gated in `references/corpus-audit.md`. A pass never settles it by factoring out: assign an owner, propagate to every copy, leave the mandate alone.

## Author the contract before a parallel rewrite

When one class spans many files and the strings **cross-reference each other** — a phrase in one unit that another unit quotes, a marker other prose routes to, a shared field name — the rewrite cannot be decided in parallel. `references/workflow-shapes.md` carries what breaks if you skip either the contract or the fan-out.

Serialize the decision. One high-effort agent (or you) writes the canonical mapping to a file first:

```
old string (exact)  ->  new string (exact)  |  rationale  |  units affected
```

Per-unit agents then apply it **verbatim** and report any occurrence the contract does not cover rather than improvising a variant. An uncovered occurrence is a contract gap to resolve serially, not an invitation to extend the contract locally.

Corollary: **gathering the inventory is parallelizable; deciding the canonical rewrite is not.** Fan out to find every occurrence, then collapse to one author to decide the mapping, then fan out to apply it.

## Reconcile

After editing, re-read every block touched and fix what the edit itself broke. A half-applied cut is worse than no cut: it leaves prose that is internally inconsistent, which is a defect the corpus did not have before.

Check each of these on every touched file:

- A reference — path, section name, phase number — pointing at something the pass removed.
- A numbered or ordered sequence with a hole, or with a step whose ordinal no longer matches what it depends on.
- An instruction whose precondition was deleted, so it now fires unconditionally or never.
- A reference file nothing routes to any more. Either restore the route or remove the file; an orphan reference is loaded by nobody and rots.
- Two surviving sentences that now contradict each other. Pick one and delete the other; do not leave both and let the model choose.
- Frontmatter, description, or activation text that no longer matches what the unit does after the cut.
- A cut that landed in a duplicated shared asset without the sibling copies following.

## Assertions on mechanical edits

When a pass applies many exact replacements, do it under assertions rather than by hand: for each target, assert the string matches **exactly once** in its file, and abort before writing anything if any target matches zero times or more than once.

Exactly-once is the load-bearing part. Zero matches means an earlier pass already rewrote the anchor; more than one means the anchor is ambiguous and the edit would land in the wrong place. In the engagement this caught an anchor a previous pass had already changed, and because the check ran before any write, nothing was partially applied — the pass was re-derived against current content instead of repaired afterward.

Fail closed, all-or-nothing per file at minimum. A script that writes files 1 through 7 and dies on 8 leaves a state no one can review.

## Report the skips

**Report what you deliberately did not cut, and why.** An agent that applied 100% of its proposals has almost certainly over-cut. A meaningful skip rate is the expected outcome, not underperformance: in the engagement's audit, 81 of 616 proposed cuts were defended and kept.

## The over-cut failure mode

Removing a "you must" does not remove the decision. It hands the decision to the model. `references/halt-taxonomy.md` class 10 carries the mechanism and the observed failure; the line that resolved it without restoring the old prose was **a unit decides its own internal delegation; whether a step runs at all is not its call.**

The pass-loop rule: for every mandate you remove, name what now decides, and check that the new decider is allowed to decide it. If the answer is "the model, at its discretion, whether a required step happens" — that is a required gate, and it stays. This class is also invisible to a probe that never enters the skipped phase, which is why Phase 5 audits the phases the instrument cannot reach and why one clean run proves nothing (`references/noise-floor.md`).
