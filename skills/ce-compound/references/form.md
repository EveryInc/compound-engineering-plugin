# Choosing the form

The counterfactual has passed. Choose the cheapest form that would stop the repeat. Try the forms in this order and take the first that holds. Write it unless the form below says to report it. Do not ask first: every mode behaves the same way here, because the commit or pull request that carries the write is its review.

In a Full run, read `pack_overlap` in `related.json` before writing anything. When a pack rule already covers the lesson, write no check or standard here: assembly's Pack-covered row decides what happens.

Weigh any prevention idea already in the session, under any label, including a debug summary's Prevention line or a `prevention_signal` field. Read the repo's lint, type, and CI configuration, and the `CODING_STANDARDS.md` files that govern the affected code.

1. **One owner and one way.** This holds when the mistake was possible because two ways to do the same thing exist. Consolidating them changes product code, so this skill never does it. Report it as work for whoever owns that code.
2. **A check.** This holds when a type, lint rule, or test can detect the defect, it runs where the repo already runs its checks, and its failure tells the reader what to fix. Write only an added test, or a lint rule added or tightened through lint tooling the repo already runs. Tightening means enabling a rule, widening its scope, or raising its severity. A new custom rule counts when the repo already has a setup for writing them. Report the check instead of writing it when it needs product code changed, including most type changes and any log field or metric; when it needs a new tool, plugin, dependency, or rule-writing setup; or when the only way to pass on the current tree is a new baseline or suppression entry. Keep a check only after you have seen it pass on the current tree, run the way the repo runs it, and fail on the defect's shape in a throwaway copy of the tree. The working tree never holds the defect, not even briefly. If you cannot show both results, undo the check, report it as the recommended form, and try the next form.
3. **A standard.** This holds when the defect is one an author must avoid while writing and a reviewer can see in a diff, it meets the bar below, and no check can hold it. Add one condition to the `CODING_STANDARDS.md` nearest the affected code, in that file's style, and link the learning if this run also writes one. The problem this run solved counts as the bar's evidence even before its fix is committed. If this form holds but no such file exists, do not create one: a repo without coding standards has made a valid choice, and a usable file also needs its review doc and pointer lines. The learning holds the whole lesson and states the rule as guidance. Nothing is lost, because `ce-setup` drafts rules from solution records whenever someone runs it. The only trace of this case is the attended report's line that `references/report.md` defines.

   <!-- ce-standards-bar:start -->
   A defect class enters `CODING_STANDARDS.md` only when it appeared in a review finding the author fixed, a fix commit, a cleanup that removed it across the codebase, or a solution record, and no check covers it. State the class as a condition in a few sentences that stay true without naming volatile numbers or symbols, and group rules by area.
   <!-- ce-standards-bar:end -->

4. **A learning.** This holds for reasoning that code, tests, types, and the standards file cannot carry. Correcting an existing learning that became wrong stays in this form.

If a check or standard already states the lesson, do not restate it: the counterfactual has failed after all, so write nothing and report which file holds it.

After writing a check or a standard, apply the counterfactual again to the updated tree. Write a learning only for what would still be lost, such as measured facts or rejected alternatives, and have it cite the check or standard. When a check or owner consolidation was reported rather than written, the learning holds the whole lesson and names that form under Prevention or Guidance, so the lesson survives if the report is lost. A learning never mentions `ce-setup` or a missing standards file, because it outlives the run and would keep asking.

A run handles one lesson, and it may produce one stronger form plus at most one learning. Do not commit: the caller or the user commits a check or standard the same way it commits a learning.

When no learning remains to write, skip every later step that works on a written doc: assembly's write and validation steps, grounding validation, and enhancement. Vocabulary capture, the refresh and discoverability step, and the report still run.

A log field, metric, or assertion in product code stays a proposal in the report. An assertion that fits in a test is a check.
