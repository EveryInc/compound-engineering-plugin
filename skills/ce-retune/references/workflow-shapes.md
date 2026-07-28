# Workflow Shapes

Which orchestration shape fits each phase, and what breaks when you pick the wrong one.

Two primitives are assumed, both platform-neutral:

- **A dispatch primitive** that launches an independent agent with its own context window and returns a result to the orchestrator (in one host it is a subagent-spawning tool; in another a job runner). Only two properties matter: fresh context per agent, and a result the orchestrator can read.
- **A concurrency cap** the host enforces on how many agents run at once (often around 10). Dispatches above the cap queue rather than fail, so a 31-unit fan-out is three waves, not one. Plan the wave count; do not assume flat cost.

## The shapes

| Phase | Shape | Why | Failure when mismatched |
|---|---|---|---|
| Archive mining | Serial, local, zero model calls | Classification is a deterministic function of fields present in each log; you will re-run it as the taxonomy changes | Agent-per-log gives a different taxonomy each pass, so the exclusion set cannot be re-derived or audited |
| A/A and A/B runs | Serial within an arm, interleaved across arms, nothing else running | Contention is a confound; interleaving spreads service drift evenly across arms | Concurrent runs inflate duration and can manufacture a timeout that reads as a halt |
| Corpus audit | Fan out by unit, pipelined into per-unit adversarial defense | Units are independent and each needs a full directory read; defense for a unit needs only that unit's findings | A barrier between audit and defense costs the slowest unit and buys nothing |
| Cross-cutting rewrite | One agent authors the contract, then fan out application | The replacement text must be identical everywhere to stay greppable and revertable | No contract: N phrasings of one rewrite. No fan-out: context exhaustion, silent skips |
| Cut passes | Fan out by disjoint file ownership, single owner for shared byte-identical assets, barrier before verification | Concurrent edits to one file lose each other; verification must see one tree | Overlapping ownership produces a tree nobody wrote and nobody can bisect |
| Verification | Fan out by independent check, never by file | The checks need different tools and different judgment, and one must be a read no grep can do | Splitting by file runs the same suite N times and skips the coherence read entirely |
| Residual critic | One agent, last, scoped to what did not land | A fresh reader with no stake in the passes is the only one who will call a pass partial | A critic asked to verify the work reports green, which is worth nothing |

## Per phase

**Archive mining — serial and local.** The temptation is to dispatch one agent per log file because there are hundreds of them. Resist it: a script is faster, deterministic, and re-runnable, and re-runnability is the point. The correction that decides whether a baseline is usable at all — excluding empty transcripts and error exits — changes the taxonomy after you have already classified everything, so you will run the classifier more than once. A script re-runs for free and produces the same answer; an agent fleet re-costs the whole archive and produces a slightly different answer. See `references/baseline-mining.md` for the fields and the taxonomy.

**A/A and A/B runs — serial per arm, interleaved across arms.** Never run measurement concurrently with anything else you intend to measure. Metrics differ in how they survive contention, and the distinction decides whether a contended run is salvageable:

- **Robust to contention:** did it complete, did it follow the workflow, which phase it reached, token counts. A run either entered a phase or it did not, regardless of what else was executing.
- **Destroyed by contention:** wall-clock duration and everything derived from it, including anything gated by a timeout. A contended run that times out mid-phase is indistinguishable from a corpus-caused halt, which is the exact failure this skill is trying to attribute.

So a contended run can still support a completion or adherence claim. It cannot support a latency claim, and it cannot be counted as a halt. Protocol and sample-size math are in `references/noise-floor.md`.

**Corpus audit — fan out by unit, pipelined into defense.** One agent per skill directory, each reading that directory in full; that full read is what makes per-unit parallelism worth its cost, and it is why one agent cannot do all the units. Pipeline the adversarial defense stage per unit: a unit's defender needs that unit's findings plus the project's own documented learnings, tests, and history — never the global finding list — so a defense can start the moment its audit returns. A global barrier here only makes every defender wait on the slowest auditor.

Budget the defense stage as first-class work, not a review formality. It is the stage that removes cuts, and the removals are the phase's product as much as the proposals are. If you compress the phase for time, compress the number of units in flight, not the defense. Dispatch shape and finding schema live in `references/corpus-audit.md`.

**A cross-cutting rewrite — contract first, then fan out.** When one pattern must change in many units, have a single agent author the canonical contract: the exact text to remove, the exact text to replace it with, and the boundary cases where it does not apply. Then fan out application against that contract.

- **Skip the contract** and N agents produce N phrasings of one rewrite. The change stops being greppable, so you cannot confirm coverage; it stops being revertable as a unit; and when the next measurement fails you cannot tell whether the cause is the change or one agent's variant of it.
- **Skip the fan-out** and one agent reads 30 directories until its usable context is gone. The failure is not an error — it is degradation: the late units get shallow work or get silently skipped, and the output looks complete.

**Cut passes — disjoint file ownership, one owner for shared assets, then a barrier.** One problem per pass, one agent per pass, and file sets that do not intersect. Byte-identical duplicated assets are the trap: if two passes each touch their own copy of the same file, you get divergence that a parity test catches at best and ships at worst. Assign every copy of a duplicated asset to exactly one owner, even when that owner's problem is not the one the copy most obviously belongs to. Close the fan-out with a barrier before verification: verification reads a tree, and a tree with a pass still landing in it is not the tree you will ship. Loop mechanics are in `references/cut-passes.md`.

**Verification — fan out by independent check.** The axes are different tools and different judgment, so they parallelize cleanly while splitting by file does not:

| Check | What it can see | What it cannot |
|---|---|---|
| Mechanical suite | Pinned strings, schemas, parity between duplicated assets | Whether the surviving prose still makes sense |
| Packaging and manifest gates | Install-time validity, catalog and inventory drift | Runtime behavior |
| Residual-pattern sweep | Remaining instances of the class you just removed, including in files no pass owned | Instances phrased differently from the pattern |
| Coherence read | Dangling cross-references, orphaned "as described above", a phase whose predecessor was deleted | Anything requiring the full suite |

Run the mechanical suite once, as one check, not once per agent. Keep the coherence read in the fan-out and give it a human-style instruction: read the changed files end to end and name anything that no longer follows. It is the only check that finds a reference left pointing at removed text, and no grep will do it.

**The residual critic — one agent, last.** Give it the pass list, the registered bar, and the measured results, and ask for one line per intended change: landed, partial, or not landed, plus what a next pass would have to do. Instruct it explicitly that declaring success is not its job and that returning an empty list requires naming what it checked to reach that conclusion. Without that framing it will summarize the work approvingly, which tells you nothing you did not already believe.

## Cross-cutting rules

**Fan out by disjoint file ownership, never by item.** One item routinely touches several files and one file routinely hosts several items, so an item-partitioned fan-out silently produces overlapping writers. Partition the file set first, then assign each item to the agent that owns its files; an item spanning two owners is either one agent's job with both files, or it is a contract-then-fan-out (above), not a split.

**A barrier is only justified when the next stage needs cross-item context.** Legitimate: deduplicating findings across all units, an early exit gated on a total count, a synthesis that compares items against each other. Not legitimate: "I want the list flattened before I continue." That is orchestrator convenience, and it costs you the slowest agent in every wave.

**Pass large context by path plus a short gist.** Give an agent the file paths it must read and two or three sentences of why, not the inlined contents. Inlining spends the orchestrator's context to fill an agent's, which is backwards — the fresh context window is the reason you dispatched.

**Every artifact of this method needs a path decided before the phase that writes it.** The registration and the scored run table (`references/noise-floor.md`), the phase-marker map and the extractor (`references/baseline-mining.md`), the ruled finding set (`references/corpus-audit.md`), the ownership manifest and the rewrite contract (`references/cut-passes.md`). Pick one directory for the whole engagement and keep them together: the registration must be re-readable by a skeptic after results exist, the extractor and map must be re-runnable when the taxonomy changes, and a contract or manifest passed only through a dispatch prompt cannot be checked afterward against what the agents actually did. Durable ones — registration, final scored table, write-up — belong in the repo's own docs location; per-run scratch does not.

**Give a schema to anything you will aggregate.** If the orchestrator will count, sort, dedup, or compare results, specify the fields and the enum values in the dispatch prompt. Parsing prose across dozens of returns is where item counts quietly stop matching.

**Budget the serial tail.** A one-agent contract phase blocks its entire fan-out, and a barrier before verification blocks on the slowest pass. When reporting elapsed time, name the serial segments separately instead of letting the total read as the shape's natural speed — otherwise the next person concludes the fan-out was slow and removes the contract.

**State what a fan-out did not cover.** Units that queued past the cap and never ran, units an agent skipped, files outside every owner's set: list them. Silent truncation is indistinguishable from full coverage in the result, and a coverage claim you did not verify is the same defect as a bar chosen after the fact.
