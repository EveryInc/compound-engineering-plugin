# Grounding check steps

Required owner for the `ce-plan-grounding-check` workflow. Read completely before extracting claims.

## 1. Build the claim ledger

Extract every concrete claim from the plan and its scenario matrix into a table `claim | where stated | kind | verified? | evidence`. Kinds:

- **path** — every file or directory named ("Files to touch", "Technical context", "Patterns to follow").
- **symbol** — every function, hook, component, type, enum value, storage key, or route id cited.
- **behaviour** — every "X currently does Y" sentence.
- **fixture** — every fixture ID and its stated minimum contents.
- **pipeline** — every arrow in an "A -> B -> C" chain (CLI to CLI, script to file, file to screen).
- **test** — every existing test the plan says must stay green, and every new test path it names.
- **rule** — every constraint inherited from a fit note, contract, or house-rule file.

Quote claims; do not paraphrase. A claim that cannot be made concrete is itself a finding.

## 2. Verify paths and symbols against disk

For each path: exists / does not exist / exists at a different path. For each symbol: search the definition, then the call sites. Record symbols that are exported but never called — a plan that says "use existing `helperX`" when nothing calls `helperX` is citing dead code. Record the file a behaviour actually lives in.

## 3. Verify data reality

Run `scripts/pack_reality.py` against every fixture or pack the product loads (invocation is in the kernel). Then, for every field the plan relies on, confirm it is present with the values the plan assumes. Check every identity hash one file records for another file against the actual file. Map every fixture ID in the scenario matrix to a real file: satisfied as-is / satisfied after a named change / does not exist and must be built. A fixture definition no real file satisfies is a blocking finding.

## 4. Verify pipeline reality

For every arrow in a chain, name the code that performs it (script, function, argument). If no code performs an arrow — two lanes that emit different record shapes, a CLI with no argument for the input the plan assumes, an adapter that ignores a file — the chain is not real and the plan must add glue or drop the claim. "Docs-only" is never an acceptable disposition for an arrow no code performs.

## 5. Check semantics parity

Wherever the plan maps new vocabulary onto existing enums or bands (display aliases, verdict labels, states), read the existing definition, its on-screen copy, and the contract that defines it. Confirm the new word means the same thing. Search the contracts for an existing concept with the new word's meaning before inventing a mapping. A relabel that changes what a band means is a display-vocabulary change and needs a decision-log entry and the release-versioning consequence the repo defines.

## 6. Check house rules and breakage

Read every house-rule file a coding agent will obey, the contracts, any capture/contract/screen-earning process the product enforces, and the acceptance-test gate. List:

- rules the plan contradicts (amend the rule file in the same change set, or drop the item);
- existing test asserts the plan will break (the plan must say the assert changes, not "stays green");
- repository-level gates the plan's verification contract omits;
- new persistent fields or screens with no contract home yet, and the exact document rows to add.

## 7. Traceability and orphans

Build one table: source persona step -> gap -> user story -> requirement -> unit -> scenario IDs. Mark orphans in both directions: requirements or PRD components with no unit or scenario; origin steps the gap note never dispositioned; success metrics the plan's own risk table says it cannot meet. Count scenario IDs and compare with the matrix's stated count. If the plan has no origin matrix, record that and skip the count comparison.

## 8. Write the review and set the verdict

Write `<root>/plans/<date>-<nnn>-<feature>-plan-readiness-review.md` with sections: verdict; misreadings of code and models (each with file and line); missing gates; per-unit instruction corrections; traceability table with orphans; what checked out; amendment order. Verdict is one of:

- **implementation-ready** — no red ledger rows, no unsatisfiable fixtures, every pipeline arrow has code, no unamended rule contradictions.
- **amend then re-check** — list the amendments; the caller withholds or resets `artifact_readiness` until the re-check passes.

Never soften a red row into a note. If a finding cannot be verified from disk, mark it unverified rather than asserting it.

`artifact_readiness: implementation-ready may only be set by a passing plan-grounding-check review`. This skill never writes that flag.
