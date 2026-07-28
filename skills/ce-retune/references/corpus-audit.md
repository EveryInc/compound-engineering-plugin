# Phase 3: Adversarial Corpus Audit

Produces one finding set per corpus unit, each finding carrying a defender ruling. That ruling set is the input to Phase 4's passes — nothing here edits a file.

The audit is not evidence. It ranks candidates; only the harness says whether a cut helped. Do not let a large finding count imply a large effect — a corpus's run-to-run spread on fixed inputs (`references/noise-floor.md`) is the same whether the audit found 6 findings or 600.

## Dispatch shape

Two waves, one agent per unit each way.

**Wave 1 — proposers.** One agent per corpus unit. Give it the unit's **full directory**, not just its entry file: conditionally-loaded reference files are usually the bulk of a unit and the entry file alone hides them. Instruct it to return the finding schema below and nothing else — no summary prose, no recommendations about other units.

**Wave 2 — defenders.** One agent per unit, given that unit's directory *and* its proposal set, with the opposite job: find a reason each targeted line exists. A defender must search three sources, and must say which it searched:

1. The project's own documented learnings and solution docs.
2. The test suite — grep a distinctive substring of the target text.
3. Version history — `git log -S '<substring>'` for the commit that introduced the line, then read that commit message and the PR it belongs to.

Source 3 is unavailable in a corpus checkout with no history, which is the normal shape of an installed or vendored copy. A defender working without history must say so in `sources_searched` and cannot return `cut` on the strength of the other two alone — that combination is "no provenance found in two of three sources", which is a verification task, not a cut. Point defenders at a checkout that has history, or record the whole audit's provenance basis as partial.

**Pipeline the waves.** Start a unit's defense as soon as its proposal set returns; do not wait for wave 1 to finish — the two waves share no state across units. It is 2N dispatches on N units, so plan the wave count against the host's concurrency cap (`references/workflow-shapes.md`).

Keep defenders on a capable model tier. A defender that cannot read a test suite and reconstruct intent from a commit message returns "no provenance found" for everything, which silently converts the audit into a demolition.

## Finding schema

Per finding:

| Field | Shape |
|---|---|
| `id` | stable, `<unit>-<nnn>`; defenses and later passes reference findings by id |
| `target` | `path/to/file.md:line` or a line range |
| `class` | exactly one value from the closed enum below |
| `size` | estimated words removed |
| `text` | the offending text verbatim, long enough to relocate after other edits land |
| `why_unneeded` | what a capable model does here without being told |
| `replacement` | the thinner line, or empty for pure deletion |
| `risk` | low / medium / high; high means it touches a contract, a guard, or a string a test may pin |

Per unit, in addition to the findings:

- `must_survive` — every line that must not be cut, each with its reason. See "Protocol regardless of model tier" below for what belongs here.
- `halt_sites` — every place where prose could make an orchestrating model end its turn while naming work it did not do. Quote each verbatim. This list is the highest-value output of the whole phase; a unit that reports zero halt sites has almost certainly not looked at its phase boundaries. `references/halt-taxonomy.md` carries the classes.

## Classes worth hunting

Ordered by expected behavior change per finding, not by word count. The last entry yields the most words and the least behavior.

| Class | Diagnostic question |
|---|---|
| `phantom-handoff` | Does the party this sentence hands off to — a reviewer, a caller, a next agent, a consumer of the artifact — exist in this run? |
| `step-machinery` | Would a different order, or skipping the ceremony, produce a different artifact? |
| `capability-restatement` | Would the model do this if the line were deleted? |
| `filler-rationale` | Does the rule survive intact if the sentence after it is removed? |
| `vestigial-mode` | Grep the corpus for a caller that sets this mode, flag, or branch. Is there one? |
| `mandatory-fanout` | Is this helper dispatch or self-verification pass conditional on anything, or does it fire every run regardless of need? |
| `cross-unit-duplication` | Is this block near-identical elsewhere, and is factoring it out actually permitted? |
| `oversized-reference` | Could this file's entire content be five lines? |

Two notes that change how the results read:

- **`phantom-handoff` is the class that causes halts.** Prose written as if a second party were waiting teaches the model to stop and wait. Hunt it at phase boundaries first.
- **Separate always-loaded prose from conditionally-loaded references when you tally `size`.** They cost differently: always-loaded prose is context cost on every run, a conditionally-loaded file is runtime cost only when loaded. A corpus can be mostly conditional, which makes raw word count overstate context cost and understate runtime cost. Report the split.

## Defender rulings

Exactly three, one per finding:

- **`cut`** — a real search over all three sources found no provenance. The proposal stands.
- **`reduce`** — the constraint is real and the prose states it at several times the length needed. The defender returns the minimal form that preserves the constraint.
- **`keep`** — concrete citable provenance a capable model could not infer: a test asserting it, a documented learning, or a commit that added it to fix a named bug. The ruling must carry the citation — path, test name, or sha.

A defender returns one row per finding, in these fields, and nothing else:

| Field | Shape |
|---|---|
| `id` | the proposer's finding id, unchanged; a ruling that cannot be joined back is discarded |
| `ruling` | `cut` / `reduce` / `keep` |
| `sources_searched` | which of the three, named; plus the query used, so an empty search is visible |
| `citation` | required on `keep`: path, test name, or sha. Empty is not a `keep` |
| `minimal_form` | required on `reduce`: the shortest text preserving the constraint |
| `pinning_test` | test path and assertion if a grep of the target text hits the suite, else empty |

**"A weaker model might need it" is not grounds for `keep`. Only citable provenance is.** Without that rule every line survives, because a defender asked to defend can always imagine a reader who needed the line. Where the unmeasured weaker tier is a genuine concern, the ruling is still `cut` or `reduce`, and the tier becomes a logged verification task in the Phase 5 limits report — not a keep.

Symmetrically: a defender who returns `cut` without naming which sources it searched has not searched. Send it back once; treat a second empty search as an unaudited unit and say so.

## Protocol regardless of model tier

For three categories the default inverts: **absence of provenance is not grounds to cut.** A capable model cannot re-derive them, so keep them even when no citation turns up. This is the one unrecoverable mistake in the phase — everything else a later pass can put back after a failed run, and these fail silently.

1. **Machine-readable strings other units parse** — field names, enum values, output paths, greppable markers, sentinel lines. These are arbitrary shared conventions; nothing makes them true except agreement, so no amount of model capability recovers a changed one.
2. **Security guards.**
3. **Platform gotchas where the wrong behavior looks like success.** Their unifying property: *the model cannot discover them by trying*, because trying returns something that looks fine. A flag that returns empty instead of erroring, so a run reports zero findings and calls itself clean. A config key whose commented-out example matched a naive substring check and silently forced every user into the wrong mode.

What *is* cuttable around all three is the justification clause — the sentence explaining that a separate consumer is waiting on the string. Keep the data, cut the story about who wants it. That is usually a `reduce`, and it is frequently also a `phantom-handoff`.

`cross-unit-duplication` collides with this category more than any other class. Before proposing a factor-out, check whether the duplication is mandated: a documented decision, or a test that forbids sharing the block. The most-duplicated block in a corpus is often the one thing that must stay duplicated — in the engagement it was a security guard whose duplication a test explicitly required, and the largest duplication mandate was itself the documented fix for a bug that had regressed twice.

## Synthesis: rank contradiction above confirmation

The synthesis leads with what contradicts the premise the audit started from, before any cut list. Answer three questions explicitly:

- **Which proposals did defenders save, with citations?** Report the count and the strongest saves. A defense rate near zero means the defenders did not search, not that the corpus is pure junk.
- **Which unit was leaner than its word count implied?** Use the always-loaded / conditionally-loaded split. The largest unit by words is often not the largest by context cost.
- **Where does the corpus already contain a documented argument against its own ceremony that nobody had grepped for?** Corpora that document their own decisions accumulate these. A duplication mandate that is itself the recorded fix for a bug that regressed twice is the shape to look for — the ceremony you were about to cut may be a scar.

A synthesis that only confirms the premise is a finding about the audit, not about the corpus. Say so rather than shipping it.

**The per-unit partition does not carry forward.** Findings arrive grouped by unit because that is how they were gathered; Phase 4 groups them by problem, and one problem's findings cross many units (`references/cut-passes.md`). Emit the ruled findings as a flat, id-addressable set with `class` and `target` intact so a pass can select across units. Handing Phase 4 a per-unit bundle produces one agent per unit editing one problem each — the collision shape Phase 4 exists to avoid.

## Test pinning is the rate limiter

Expect roughly half of `reduce` items to be pinned by a test asserting exact strings. That, not authoring effort, sets how many items a pass can carry.

- Grep each `reduce` target's distinctive substring against the test suite **during the audit** and record the pinning test in the finding. Discovering the pin during Phase 4 costs a whole pass.
- Budget the assertion retarget as part of the item, not as follow-up. Moving an assertion from a wording to the invariant it was protecting is often larger than the prose edit.
- **A half-applied structural fix is worse than either endpoint.** If a pass cannot land both the prose change and the retarget, leave the item unstarted. A corpus half-migrated between two shapes has the ceremony of both and the guarantees of neither, and the harness cannot attribute a resulting failure to either shape.
- If the invariant a pinned string was protecting cannot be named, that is a finding to report, not a license to loosen the assertion.
