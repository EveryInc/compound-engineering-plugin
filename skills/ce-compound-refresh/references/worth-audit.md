# Worth audit

Read this only after the user confirmed the worth lens (SKILL.md, Worth lens). It adds one test to classification; the five outcomes, the investigation roles, and the per-action flows are unchanged.

## The bar

<!-- ce-durable-bar:start -->
A learning earns its place only when it holds durable project reasoning that is not readily recoverable from the final code, tests, types, comments, or existing documentation, and losing it would plausibly cause recurrence, material risk, or substantial rediscovery. Apply this counterfactual: if the learning document disappeared, would a future engineer reading the final implementation still be likely to repeat the mistake or redo substantial investigation? Completion, effort, and diff size do not establish eligibility.
<!-- ce-durable-bar:end -->

This is the bar `ce-compound` applies before writing a learning. The worth lens applies it to learnings that were written before the bar existed, or that accreted past it.

## Recoverability needs positive evidence

A doc's reasoning is recoverable only when a named in-repo artifact states it in its own text: a test whose assertion or comment carries the rule, a code comment beside the mechanism, the project's always-loaded instructions, a skill reference, or another surviving learning. Topical overlap is not coverage; verify the specific reasoning is present and quote it. The unverifiable-is-not-false rule in `references/classify.md` still holds: a claim no artifact corroborates is kept, never treated as recoverable. A doc describing a mechanism that no longer exists is judged by the ordinary Delete gate, not by this lens.

Add this clause to every investigation subagent prompt on this path, verbatim:

> For each claim the learning makes that a reader would need in order to avoid repeating a mistake or redoing an investigation, search the repository for an in-repo artifact whose own text states that reasoning (a test, a code comment, the root agent-instructions file, a skill reference, another learning). Return, per claim: recoverable with the artifact path and the quoted sentence, or not recoverable. Do not infer coverage from a related file name or topic.

## Routing

Apply the accuracy classification first, then the worth test to docs that survived it:

- **Every claim recoverable, citations absent or decorative:** Delete, with the citation cleanup the Delete flow already owns. The quoted artifacts are the doc's evidence bullets.
- **Some claims recoverable:** Update. Cut the recoverable content and keep the measured facts, cross-file invariants, and rejected alternatives nothing else records. Point at the artifact in one line where a reader would otherwise look for the cut material. Narrow the frontmatter to match.
- **Nothing recoverable:** Keep.

A doc whose only remaining content is a session narrative, a list of what was changed, or a restatement of a contract another file owns has no non-recoverable claim and routes to Delete.

**Interactive:** the run-start confirmation authorized the lens. Batch broad sweeps and confirm continuation between batches as `references/classify.md` already directs; present each worth-based Delete or Update with its quoted artifacts as the evidence bullets. **Non-interactive:** worth-based Delete and Update verdicts are never applied; record each under **Recommended** with the quoted artifacts so a human can apply the batch. Accuracy-based actions apply as usual.

## Report

The summary block carries one line, `Worth lens: confirmed | recommended-only (non-interactive) | off`, and each worth-based verdict lists the recovering artifacts it rests on.
