# Worth audit

This adds one test to classification, plus changes to `CODING_STANDARDS.md`. The five outcomes and the investigation roles are unchanged. This audit adds no confirmation in either mode, because each change carries its evidence and version control can restore it.

## The bar

<!-- ce-durable-bar:start -->
A learning earns its place only when it holds durable project reasoning that is not readily recoverable from the final code, tests, types, comments, or existing documentation, and losing it would plausibly cause recurrence, material risk, or substantial rediscovery. Apply this counterfactual: if the learning document disappeared, would a future engineer reading the final implementation still be likely to repeat the mistake or redo substantial investigation? Completion, effort, and diff size do not establish eligibility.
<!-- ce-durable-bar:end -->

This is the bar `ce-compound` applies before writing a learning. This audit applies it to learnings that were written before the bar existed, or that accreted past it.

## Recoverability needs positive evidence

A doc's reasoning is recoverable only when a named in-repo artifact states it in its own text: a test or lint rule whose assertion, comment, or failure message carries the rule, a condition in `CODING_STANDARDS.md`, a code comment beside the mechanism, the project's always-loaded instructions, a skill reference, or another surviving learning. Topical overlap is not coverage; verify the specific reasoning is present and quote it. The unverifiable-is-not-false rule in `references/classify.md` still holds: a claim no artifact corroborates is kept, never treated as recoverable. A doc describing a mechanism that no longer exists is judged by the ordinary Delete gate, not by this audit.

Add this clause to every investigation subagent prompt, verbatim:

> For each claim the learning makes that a reader would need in order to avoid repeating a mistake or redoing an investigation, search the repository for an in-repo artifact whose own text states that reasoning (a test or lint rule, a `CODING_STANDARDS.md` condition, a code comment, the root agent-instructions file, a skill reference, another learning). Return, per claim: recoverable with the artifact path and the quoted sentence, or not recoverable. Do not infer coverage from a related file name or topic.

## Routing

Apply the accuracy classification first, then the worth test to docs that survived it:

- **Every claim recoverable, citations absent or decorative:** Delete, with the citation cleanup the Delete flow already owns. The quoted artifacts are the doc's evidence bullets.
- **Some claims recoverable:** Update. Cut the recoverable content and keep the measured facts, cross-file invariants, and rejected alternatives nothing else records. Point at the artifact in one line where a reader would otherwise look for the cut material. Narrow the frontmatter to match.
- **Nothing recoverable:** Keep.

A doc whose only remaining content is a session narrative, a list of what was changed, or a restatement of a contract another file owns has no non-recoverable claim and routes to Delete.

Apply these in both modes. Batch broad interactive sweeps as `references/classify.md` already directs. Inbound links still gate a Delete: when another doc substantively cites this one, keep it and report that.

## Standards

Read the `CODING_STANDARDS.md` files that govern the scope. A rule is not a doc, so it gets no Keep or Update outcome; it appears in the report with its evidence.

- **A check now covers the rule's whole class:** remove the rule. Quote the rule and the check.
- **A check covers part of the class:** narrow the rule to what remains, and quote both.
- **A doc is really an unenforced rule:** it is a standing always-or-never about a defect a reviewer can see in a diff, it carries no reasoning beyond the rule, and no check covers it. When a check could hold it, leave the doc and record the check under **Recommended**, because this skill writes no checks. When no check could hold it and the bar below is met, add one condition to the `CODING_STANDARDS.md` nearest the code, in that file's style, then route the doc as recoverable. When the repo has no standards file, leave the doc as it is and record no finding: a repo without coding standards has made a valid choice, and `ce-setup` drafts rules from these docs whenever someone runs it. Nothing this skill writes names `ce-setup` or a missing standards file. Only an attended report carries the one line `references/report.md` defines.

<!-- ce-standards-bar:start -->
A defect class enters `CODING_STANDARDS.md` only when it appeared in a review finding the author fixed, a fix commit, a cleanup that removed it across the codebase, or a solution record, and no check covers it. State the class as a condition in a few sentences that stay true without naming volatile numbers or symbols, and group rules by area.
<!-- ce-standards-bar:end -->

## Report

The summary block carries one line, `Worth: N shortened, N deleted; standards: N removed, N narrowed, N added`, or `Worth: off (drift fixes only)`, and each verdict lists the artifacts it rests on.
