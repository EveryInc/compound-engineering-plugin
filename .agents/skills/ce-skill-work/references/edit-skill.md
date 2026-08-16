# Changing an existing skill

Skills predate the current standard and evolve toward it. The standard is the guide, not the text around your edit.

## Before editing

0. **State the runtime you are authoring from and what it may mask.** Run the guide's decentering step ("Your model is not a neutral author"): name the model tier and harness, then check each reaction against its bias — "this rule is redundant" (would a more literal model still hold the contract?), "this needs more steps" (protocol, or compensation for this runtime?), "it worked in my test" (which harness capability supplied that?), "this is missing X" (what observable failure does X address?). Do this before deciding anything is sediment.
1. **Read the block's goal, not just the lines you were pointed at.** What result does this block produce, for whom, and what is its done condition? If the block cannot answer that, the edit starts by restating the block; if it can, your change must keep that answer true.
2. **Search provenance for what you intend to remove or rewrite** — a test that asserts it (`rg` under `tests/`), a `docs/solutions/` learning that records it, a commit that added it to fix a named bug (`git log -S`). Then apply SKILL.md's sediment rule as written — this step does not restate it. A duplication mandate that is itself the recorded fix for a bug that regressed twice is a scar, not ceremony — keep it and cite the bug. Say which of your removals rest on absence of evidence.
3. **Audit the block with these questions** before deciding the smallest change. Ordered by expected behavior change per finding:

| Class | Diagnostic question |
|---|---|
| Protocol or judgment | If this instruction disappeared, could the workflow produce a wrong path, state, count, gate, field, boundary, coverage floor, or handoff? Yes → protocol, keep it explicit and falsifiable. No → judgment; try deleting it. A menu whose omitted item silently drops required coverage is protocol, not judgment. Decompose a mixed block before classifying it. |
| Phantom handoff | Does the party this sentence hands off to exist in this run? |
| Step machinery | Would a different order, or skipping the ceremony, produce a different artifact? |
| Capability restatement | Would the model do this if the line were deleted? |
| Filler rationale | Does the rule survive intact if the sentence after it is removed? |
| Enumerated cases | Is this list of cases a proxy for one condition it could state instead? |
| Lean-prompt regression | Does the block repeat an instruction, completion check, autonomy gate, or command skeleton that one earlier rule already decides? |
| Command freedom | Do two recipes share the same command skeleton? If yes, the command belongs once with parameters or deltas unless each full command protects a distinct fragile gate. Conversely, would a capable model with live `--help` still ship the wrong command? If yes, pin the known-good command once. |
| Per-step completion | Is a local done check protecting mutation, auth, scope expansion, irreversible external effects, a fragile transition, or a silent handoff failure? If not, the skill-level done bar decides. |
| Blanket brevity | Does a cross-model skill say "be concise", "keep it short", or paste a Fable brevity block instead of naming what the report must preserve? |
| Prescribed mechanism | Does this skill own the command/state it spells out, or does it delegate that work? |
| Vestigial mode | Is there a caller anywhere in the corpus that sets this mode, flag, or branch? |
| Cross-unit duplication | Is this near-identical elsewhere, and is factoring it out actually permitted (parity tests)? |
| Shouting | Is this ALWAYS / NEVER / MUST carrying a rule the surrounding condition does not already state? Capitals are a smell that the rule is not stated as a condition. |

## Making the change

- **Bring the touched block up to the standard as part of the change.** A block written as a procedure, a menu, or an enumeration is restated as its conditions while you are in it; matching the old shape because it is there is how procedures propagate.
- **Scope to your change plus what it makes wrong.** Reconcile blocks your change contradicts or duplicates. Leave untouched blocks alone even when short of the standard, and name them in the PR as follow-up. A repo-wide modernization is its own change, requested explicitly.
- **Repeated case-specific repair is the defect signal.** If this block has been patched before for "the case we just found" — in an earlier round of the same PR, or in git history — do not add another case. Delete the additions and restate the goal, then re-verify the restatement against every path the additions served; a restatement that no longer names a path is a new defect, not a simplification.
- **For every mandate you remove, name what now decides**, and check that decider may decide it. A required gate stays.
- **Prefer one governing sentence over behavior enumeration.** If one sentence decides the listed behaviors, keep the sentence and delete the list; if a listed item is a separate invariant, state that invariant locally.
- **Do not overcorrect away deterministic guidance.** Removing duplicate easy commands is right; stripping a known-good fragile command is a new defect. The deciding test is whether a capable model with live `--help` would still get the command wrong.
- **Control length by preserved content.** For portable skills, replace blanket brevity slogans with the fields the short output must retain and the details it may omit.
- **Keep scope beside the action it governs.** A quantifier, threshold, or exclusion ("for each candidate separately", "do not change files outside …") sits next to the step it bounds, not in a distant reminder — literal models lose the distant one.
- **Runtime placement:** an instruction that must fire at a point stays inline at that point; do not push it into a reference the agent may not load. Where the same rule must live in two always-loaded places, protect it with a parity test.
- **Scripted replacements** across many files: assert each anchor matches exactly once before writing anything, and fail closed per file.
- **Cross-file invariants:** when a skill's contract is consumed by another skill (an envelope field, a mode token, a status enum), change both ends in the same commit and check the contract test.

## Validate

Read `references/evaluate.md`. A behavior-bearing change gets a targeted eval on the paths the change touches, on Claude and Codex; a mechanical change gets `bun run test`. A change to always-loaded prose that only removes text still needs the eval when a removed line had provenance you overrode.

## Done when

The touched block states its conditions; every removal has a provenance result; nothing your change contradicts remains; validation ran or its skip is recorded; follow-ups are named.
