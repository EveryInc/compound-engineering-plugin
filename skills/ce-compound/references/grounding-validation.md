# Grounding Validation (Phase 2.45)

Read this when Phase 2.45 runs. The doc just written becomes permanent, trusted knowledge — future agents will act on its claims without re-verifying them. This phase checks the claims against reality before they compound: a deterministic mechanical pass (bundled script) plus a semantic pass you run yourself. Neither pass is a hard gate — every flag is adjudicated, because solution docs legitimately cite deleted paths and pre-fix states.

## Which tree is the ground truth

Two claim categories verify against different trees:

- **Code-behavior claims** (enum values, status semantics, limits, defaults) verify against the **local working tree** — they describe what this session's work produced and verified here.
- **Merge-state claims** ("fixed in #1608", "landed", "shipped") verify against **remote truth** — the checkout may predate a merge, so `gh pr view` (or the tracker equivalent) is primary and local git reachability is only the fallback. The script's `INFO: worktree is N commits behind …` line tells you how much to distrust the local tree for this category.

Before running the script, optionally run `git fetch --quiet` (best-effort — skip silently on failure or offline; the network is never a correctness dependency). When remote state cannot be checked at all, keep the claim, add an as-of qualifier ("as of this writing"), and record degraded verification in the run report.

## Step 1: Adjudicate the mechanical flags

The script reports flags; you decide each one. Three resolutions — **fix**, **annotate**, or **confirm intentional** — never an automatic rewrite and never an automatic pass:

| Flag | Likely meaning | Resolution |
|------|----------------|------------|
| path not found anywhere | Typo, or drafted from memory | Fix the citation or remove the claim |
| path missing here, exists at upstream | Stale checkout | Verify the claim against upstream; annotate if the doc implies the file is present locally |
| path deliberately gone (doc says removed/renamed) | Historical citation | Confirm the surrounding prose marks it as historical ("removed by this fix", "pre-fix state"); add that marker if absent |
| SHA does not resolve | Fabricated or from another repo | Replace with the PR number, or drop |
| SHA reachable from HEAD only | Local-only commit; SHA will change on rebase/squash merge | Replace with the PR number |
| SHA reachable from upstream only | Checkout predates the merge | Keep, with a temporal qualifier; verify the landed claim via `gh` |
| SHA exists but unreachable | Rebased-away commit | Replace with the PR number |
| scaffold ("Learning 3", `{{…}}`) | Drafting-context leak | Always fix — rewrite as a real path or link |
| relative link unresolved | Wrong target | Fix the path |

If the script cannot be resolved on this platform, apply its checks manually at the same scope — scan the body for cited paths that don't exist, hex SHAs, `Learning(s) N` / `{{…}}` scaffold, and broken relative links — and note in the run output that the check was manual. Do not silently skip.

After any body edit from this step or Step 2, re-run the script until it reports clean or every remaining flag is confirmed intentional.

## Step 2: Semantic claim check (Full and headless; skipped in lightweight)

Run this in your own loop — do not delegate it to a subagent. Cover the written solution doc plus any `CONCEPTS.md` entries added or edited this run (Phase 2.4's entries are claims too — a glossary entry written from a session-level summary is exactly how wrong semantics enter the vocabulary). Ignore session narrative ("we first tried X"): that describes the conversation, not the tree.

| Claim category | Check | If it does not hold |
|----------------|-------|---------------------|
| **Code behavior** — enum values, status semantics, limits, defaults, ordering, state transitions | Locate the defining source in the current tree and quote the defining line with `file:line` | Contradicted → fix the doc from the quote (the quote, not the conversation, is authoritative). Defining source not found → soften or attribute ("per this session's conclusion…"), or drop |
| **Merge state** — "fixed in", "merged", "shipped in", "resolved by #N" | `gh pr view <n> --json state,mergedAt,baseRefName` (remote truth); git reachability from the upstream default branch as fallback | Contradicted (e.g. PR open) → restate as pending. Unverifiable offline → keep with an as-of qualifier and record degraded verification in the report; never guess |
| **Internal completeness** — countable assertions ("six PRs", "three root causes", "all N consumers") | Count the substantiating items in the doc itself | Short → complete the enumeration or restate the count to match what the doc substantiates |

## Reporting

Summarize the phase in one line of the run output (headless report's `Grounding:` line; interactive success output): flags adjudicated (fixed / annotated / confirmed), claims checked, claims softened or corrected, and `degraded — merge-state claims unverified offline` when applicable.
