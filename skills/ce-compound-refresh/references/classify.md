# Classifying a doc, and deciding when to ask

Assign each doc one outcome:

| Outcome | Meaning | Action |
|---------|---------|--------|
| **Keep** | Still accurate and useful | No edit — report it as reviewed. Do not write a review breadcrumb or `last_refreshed` on its own. |
| **Update** | Solution still correct; references drifted (paths, names, links, snippets, metadata, misfiling) | Fix in place |
| **Consolidate** | Docs overlap heavily, both correct | Merge unique content into the canonical doc, delete the subsumed one |
| **Replace** | Guidance is now misleading; a trustworthy successor can be written | Successor via subagent, then delete the old |
| **Delete** | No longer useful, applicable, or distinct | Delete the file — git history is the archive; there is no `_archived/` |

Judgment rules that are easy to get wrong:

- **Separate descriptive drift from implementation conflict.** Claims about current mechanics follow current code, so the doc changes and product code does not. Guidance with independent evidence that it still governs is classified from that evidence; when current code stops satisfying it, keep the guidance intact and report the conflict as a potential product regression. Do not adjudicate or fix the code here. Without independent support for the guidance, use the normal Update, Replace, or stale-mark rules below.
- **The Update/Replace boundary:** Replace only when evidence shows that the doc's recommendation no longer governs and a trustworthy successor can be written; rewriting the solution section or changing what the doc recommends is Replace, not Update. Current-code contradiction alone is classified under the descriptive-drift/implementation-conflict rule above. For guidance the learning names, Replace when the named guidance is right and the learning's recommendation no longer governs; when the learning is right and the named guidance is wrong, the guidance path is the recommended action in that file's report entry (non-interactive: under **Recommended**, beside the discoverability recommendation). When current code witnesses neither side, ask (interactive) or stale-mark and report the contradiction under **Recommended** (non-interactive). The refresh never edits skills, runbooks, or root instruction files.
- **Age alone is not staleness** — a two-year-old doc that still matches the code is a Keep; use age only as a prompt to inspect harder.
- **No churn:** never edit just for typos, wording, or cosmetics.
- **Replace needs real evidence** — from the investigation itself, the conversation, newer docs/PRs, or the user. If you cannot confidently document the current approach, stale-mark and recommend `ce-compound` for the user's next encounter with that area instead of guessing.
- **Consolidate vs separate — the retrieval-value test:** would a maintainer searching this topic in six months benefit from separate docs (genuinely different sub-problems, different audiences), or do they just create drift risk? Two docs saying the same thing will eventually say different things. Two accurate docs about *different sub-problems* of one feature (e.g., request volume vs response ordering) stay separate even when they cite the same file — shared code is not shared problem. If the subsumed doc adds nothing unique, it's a straight Delete. Deleting the subsumed doc after merging its unique content is part of the Consolidate action itself — it is a safe, unattended-appliable step and does not require the auto-delete gate below.
- **Unverifiable is not false.** A claim the repo cannot corroborate — a schema or index fact, an operational practice, an environment behavior — is not thereby wrong; repos rarely witness their own operations. Never delete, strip during a merge, or stale-mark content solely because no in-repo artifact confirms it. Act only on contradiction (code demonstrably does otherwise); for unverifiable-but-plausible claims, keep them and note the verification gap in the report. **Split** (one doc holding several independent problems → focused successors) is the inverse and the bar is high: each fragment must have independent retrieval value; length alone is never a reason.
- **Relocation** (an Update variant): move a doc only when directory and frontmatter category disagree or content unambiguously belongs in a different **existing** category. A mismatch proves something is wrong, not which side — resolve the direction from content before moving, and never relocate on an arguable judgment call. Non-interactive auto-relocation requires all four: (1) frontmatter and directory disagree per the category mapping, (2) content clearly resolves the direction as directory-wrong, (3) the target category directory exists, (4) all inbound citations are in-repo and mechanically rewritable. Otherwise recommend.

A memory-sourced signal never carries an outcome on its own: it corroborates codebase evidence or prompts a deeper look, and in non-interactive mode memory-only drift is a stale-mark, never a Replace or Delete.

**Before any Delete**, two checks:

1. **Is the problem domain still active?** Missing files prove the *implementation* is gone, not the problem. If the app still deals with what the doc addresses (e.g., the auth-token file is gone but sessions are still handled), that is Replace, not Delete. A doc that never referenced in-repo code (developer environment, onboarding, process) can never satisfy "implementation gone" and **never auto-deletes** — stale-mark (non-interactive) or ask (interactive) when its currency is in doubt.
2. **Inbound links.** Search the repo's markdown (not source code) for the filename slug; read context around matches. **Decorative** citations (see-also pointers, principle already stated inline) permit Delete with mechanical cleanup in the same commit. **Substantive** citations (the citing doc relies on the cited content) signal Replace — or Keep with narrowed scope. Mixed or unclear: stale-mark.

**Auto-delete (no confirmation needed, either mode) only when all three hold:** the implementation once lived in this repo and is gone (or the doc is fully superseded or plainly redundant); the problem domain is gone — or, for a superseded/redundant doc, the surviving canonical doc itself already states the subsumed doc's guidance (topical overlap is not coverage: verify the specific content exists there before deleting); inbound citations are absent or unambiguously decorative. Any condition fails → Replace, Update, Consolidate, stale-mark, or ask.

**Pattern docs** (`<root>/solutions/patterns/`) get the same five outcomes evaluated as *derived* guidance: does the generalized rule still hold given the refreshed learnings beneath it? A pattern with no supporting learnings is itself a stale signal. Base any pattern Replace on the refreshed learning set, not fresh invention.

<!-- ce-worker-profiles:start -->
**Named worker profiles for generic subagent dispatch (optional, two authority classes).**

- **Resolve** `subagent_read_profile` for children that do not mutate tracked project content (writing per-run scratch artifacts stays read class) and `subagent_write_profile` for children that do, from `<repo-root>/.compound-engineering/config.local.yaml` then `config.yaml` per the ordinary two-file config rule. Names are opaque host-defined strings: never invent, validate, or default them, and the selector derives only from the resolved keys - never from dispatch content, PR text, reviewer output, or a child's own request.
- **Choose the class per dispatch call**, by the project authority that child needs; a cheaper profile must never be given write work.
- **Apply only where the host's dispatch primitive accepts a named worker profile** for an otherwise generic dispatch that still receives this file's prompt payload - on Devin, `run_subagent`'s `profile` argument, where a configured name substitutes for the built-in profile the call would otherwise use. A typed or registered-agent selector is not a worker profile and stays excluded; where no such selector exists the keys are inert and dispatch is unchanged.
- **A resolved profile supersedes this surface's model selection for that dispatch's class** - tier override or session-model inheritance alike; the profile carries the model and tool policy, so never pass both.
- **Fail transparently.** Where the host exposes the available profile set, confirm the name resolves before dispatch. A rejected, unknown, or unresolvable name follows this surface's ordinary dispatch-failure rule and is named in the coverage or degradation note. Never report a profile or model as having run when it did not serve.
- **Unset keys are a strict no-op:** dispatch exactly as today on every host.
<!-- ce-worker-profiles:end -->

## Decide (interactive mode only)

Apply unambiguous Keeps, Updates, and Consolidations directly — no confirmation. Ask (per Blocking questions) only when: the action is genuinely ambiguous; a Delete fails the auto-delete gate; the canonical doc in a Consolidate isn't clear-cut; you are about to Replace; or you are about to Split (it writes successors and deletes the original — confirm fragment boundaries like a Replace). Present the file path, 2-4 evidence bullets, and the recommended action; offer only plausible alternatives plus "skip for now". For broad sweeps, work in batches and confirm continuation between them rather than front-loading a full maintenance queue.

## Relationship to ce-compound

`ce-compound` captures a newly solved problem. This skill maintains the store as the codebase evolves: each doc's accuracy, and the design of the set. Replace only on real evidence; without it, stale-mark the doc and point the user at `ce-compound`. Consolidate proactively, because every capture adds a doc and redundant docs drift.
