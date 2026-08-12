# Faster Document Review Loop Protocol

This protocol turns repeated document review into bounded evidence waves. It uses `ce-doc-review` as the review engine; the loop owns preparation, remediation grouping, snapshot control, and convergence.

## Mechanics

These four primitives recur throughout the protocol. Use the bundled `scripts/loop-state.mjs` helper through stock Node; do not substitute shell pipelines or platform-specific utilities. Set `SKILL_DIR` to the absolute directory containing this skill, invoke exactly one helper command per operation, and interpret its single JSON result outside the executed command.

- **Fingerprint.** Execute `node "$SKILL_DIR/scripts/loop-state.mjs" fingerprint --path "<path>"`. The `sha256` field is the raw-byte SHA-256 as 64 lowercase hexadecimal characters. Never state a digest not read from this result; an asserted digest makes every equality gate below pass vacuously. `ce-doc-review` receipt digests carry a `sha256:` prefix; strip it outside the command before comparing. Two distinct empty values remain non-interchangeable: `unavailable` when a required helper invocation could not run, and `not_reached` when the run ended before fingerprinting.
- **Disposable snapshot and run state.** Execute `node "$SKILL_DIR/scripts/loop-state.mjs" init-run`. It securely creates a fresh private state root, per-run directory, `run-state.json`, and disposable snapshot directory, then emits `run_id`, `run_dir`, `state_path`, and `snapshot_dir`. The helper rejects symlinked or foreign-owned managed directories, repairs their modes to `0700`, creates state with mode `0600`, and will never adopt an existing run directory. When it cannot create or validate these paths, return `Non-converged`; never fall back to the product directory or review in place. Write disposable Markdown snapshots only under the returned `snapshot_dir`; the exclusive Commit temp below is the sole loop file created beside the product target.
- **Target resolution.** Before staging a change, execute `node "$SKILL_DIR/scripts/loop-state.mjs" resolve-target --product "<product>"`. It uses Node's portable `fs.realpathSync`, requires an existing regular target, and emits `realpath`, `dev`, `ino`, `mode`, and `sha256`. Store those fields with the frozen snapshot. A symlinked product is deliberately resolved through to its physical target; the symlink itself remains the product path.
- **Commit.** Execute one argv-only helper process: `node "$SKILL_DIR/scripts/loop-state.mjs" commit --product "<product>" --validated "<validated>" --expected-fingerprint "<sha256>" --expected-realpath "<realpath>" --expected-dev "<dev>" --expected-ino "<ino>"`. Inside that process, the helper re-resolves the product and compares its physical target identity and current raw-byte digest, prepares an exclusive same-directory temp, copies the validated bytes and original target mode, then re-resolves and repeats every identity and digest check immediately before atomic rename. If either check differs, it deletes the temp, leaves both product link and target bytes untouched, exits nonzero, and emits `status: concurrent_change`. Any other failure also removes the temp and must return `Non-converged` with the observed helper result. Never split target validation and replacement across processes or replace these checks with a caller assertion.

The commands above are literal argv invocations. Do not add pipelines, redirection, command substitution, fallback operators, or command chaining to their executable fences.
## Wave 0 — Prepare Coverage

Complete this before the first `ce-doc-review` invocation.

1. **Freeze the input snapshot.** Record the product path, raw Markdown bytes, and fingerprint in run state. Before each canonical wave, materialize those bytes as a disposable snapshot. The product path must still match the frozen fingerprint when the wave completes. Receipt-accounted `ce-doc-review` fixes exist only in the disposable snapshot until validation succeeds.
2. **Inventory and classify contracts.** Enumerate every normative statement, explicit requirement, semantic contract, cross-reference, and named or mechanically implied proof obligation. Classify the document as single-contract only when all items share one authority, lifecycle, and proof boundary; otherwise classify it as multi-contract. Record the classification and evidence in run state.
3. **Build a Contract Matrix.** Map every inventory item to a cell and record unmapped items as blockers. Each cell records: stable ID, source text/section, authority, writers, readers/callers, representations, states/transitions, negative-space cases, runtime environments, evidence/proof IDs, status (`open`, `proved`, `accepted_residual`, or `blocked`), and accepted residual reference. These slots describe the system the document specifies, not repository files; the evidence for every one of them is document text. Write cells into the run-state file section by section as they are built, so a long document never requires holding the whole matrix in context before Pass 1 starts. A cell closes only as `proved` with final-fingerprint evidence or `accepted_residual` with a valid residual bound to that fingerprint.
4. **Reserve canonical reviewer coverage.** Record no roster in Wave 0 — the receipt does not exist yet. The first `ce-doc-review` caller receipt's selected in-process roster is the authoritative selection output, and Pass 1 writes it into run state. Do not copy or reimplement the canonical persona-selection rules. Require every selected in-process reviewer to complete; optional cross-model peers remain additive.
5. **Scale preparation to impact.** For a multi-contract document, build the Change-Impact Graph, stable vertical slices, and proof obligations before Pass 1. For a single-contract document, start with the Contract Matrix and add those structures when the inventory or findings expose cross-contract edges, adjacent state transitions, runtime proof needs, or remediation that can affect neighboring contracts.
6. **Define artifact closure.** A graph edge records source, target, edge kind, evidence, and status; a slice records authority-through-recovery scope, owned cells/edges, and status; a proof obligation records target cell/edge, method, expected evidence, result, fingerprint, and status. A Remediation Neighborhood is the changed cells plus graph-connected callers, consumers, reverse branches, adjacent transitions, sibling surfaces, fixtures/oracles, metadata/delivery gates, and intentionally unchanged neighbors; it records membership, before/after diff, focused checks, accepted residuals, fingerprint, and status. An artifact is closed only when every owned item is `proved` or covered by a valid accepted residual at the current fingerprint.
7. **Maintain durable run state.** Store the inventory, contract classification, Contract Matrix, graph edges, slices, neighborhoods, proof obligations, reviewer coverage, fingerprints, applied-fix mappings, accepted residuals, finding ledger, work-unit count, and statuses in the run-state file defined in Mechanics. The run state and the product document are two files and cannot be replaced in one atomic step, so fix the order: commit the product document first, then refresh the run state. A crash between the two leaves run state describing the previous fingerprint, which the next wave detects because it revalidates the product fingerprint before doing anything else — reconcile by re-reading the product document and refreshing the record, never by re-applying the committed fix. The final gate validates the record against the final fingerprint. Keep it outside the reviewed product document unless the user requests a durable product artifact.

The reviewed document remains the only product artifact by default.

## Pass 1 — Independent Review Wave
1. Recheck the product path's fingerprint against the frozen fingerprint, then create a disposable snapshot containing exactly those bytes.
2. Invoke `ce-doc-review mode:non-interactive <snapshot-path>` through the host's callable skill mechanism. Do not start this wave when the configured work-unit budget is exhausted. A generic task, agent, inline review, or reconstructed persona pass is not invocation of the canonical skill.
3. If the named skill is unavailable or fails before entry, return `Non-converged` with `ce-doc-review: skill_unreachable` and the observed reason. Do not imitate the review engine. Print the invocation the user can run directly as a copyable `/ce-doc-review mode:non-interactive <product-path>` block — use `$ce-doc-review …` only when the active harness is Codex — and set the envelope's `Next bounded wave` to that handoff instead of a slice. Do not merely tell the user to type an invocation.
4. Require the canonical caller receipt: `reviewed_fingerprint` is SHA-256 of the frozen bytes supplied to `ce-doc-review`; `result_fingerprint` is SHA-256 of the disposable snapshot after all sub-skill-applied fixes; selected reviewers; completed reviewers; failed, timed-out, or malformed reviewers; document-changing fix count; and terminal status. A roster entry is an optional cross-model peer only when it ends in `-codex`, `-claude`, `-grok`, `-cursor`, or `-composer`, or begins with `whole-doc-`; treat every other entry as a required in-process reviewer, including entries carrying a `-reviewer` suffix. Treat each caller-envelope `Applied N fixes` entry (`section`, change description, reviewer attribution) as a mandatory fix identity record. Route every defect through the two failure classes below. A response carrying no caller receipt at all — including the canonical skill's bare `Review failed:` input-gate line — is a pre-entry failure: return `Non-converged` with `ce-doc-review: skill_unreachable` and the observed output. Optional cross-model peers are additive and their failure is report-only unless the canonical skill marks them required.
5. Derive and validate before commit: the loop caller computes the exact frozen-to-result diff from the two snapshots, attributes every changed hunk to at least one applied-fix entry by section, and stores the mapping in run state; `ce-doc-review` need not emit byte diffs. Require reviewed fingerprint equals the frozen fingerprint, result fingerprint equals the disposable snapshot's current fingerprint, product path still equals the frozen fingerprint, document-changing fix count agrees with applied-fix entries, and no changed hunk is unattributed. On any mismatch, discard the disposable snapshot and wave findings without modifying the product path; the discarded wave still consumes one work unit, and a second consecutive mismatch returns `Non-converged` with the observed mismatch. On success, commit the product path and update run state, then delete the disposable snapshot.
6. Let `ce-doc-review` own document classification, persona selection, reviewer dispatch, synthesis, finding tiers, and `safe_auto` edits. Never reproduce those internals in this loop.
7. Reconcile returned findings with the Contract Matrix and any applicable Change-Impact Graph. Add uncovered inventory items, contract cells, dependency edges, proof obligations, and reviewer-coverage evidence to the run ledger. If validated result bytes differ from the frozen bytes, refresh or revalidate the inventory, Contract Matrix, applicable graph, slices, neighborhoods, proof obligations, and reviewer coverage against the new fingerprint. All findings, zero-finding claims, proof results, and accepted residuals from the pre-edit snapshot are stale until revalidated.

Sort every receipt and validation defect into exactly one of these, because they commit differently. An optional cross-model peer failure is neither: it stays report-only unless the canonical skill marks that peer required.

- **Integrity failure** — any fingerprint mismatch, unattributed hunk, fix-count disagreement, missing receipt field, non-`complete` terminal status, or product path that moved. The bytes cannot be trusted: discard the disposable snapshot and the wave's findings, and never touch the product path.
- **Coverage gap** — any required in-process reviewer in `selected_reviewers` that is absent from `completed_reviewers`, whatever the reason and whether or not it appears in `failed_reviewers`, while every integrity requirement above still holds. The validated bytes may be committed, but the wave is not a clean wave: record the gap in run state, carry it into `Reviewer coverage gaps`, and never let it satisfy the final gate.

## Pass 2 — Remediate by Defect Family

Group findings by semantic defect family, not reviewer order or document position. Examples: authority ownership, identity equality, partial-failure lifecycle, caller wiring, and delivery-gate integrity.

For each family:

1. Revalidate each finding against the validated result snapshot before grouping it: its quoted evidence must still appear and its section/title identity must still match. A pre-fix finding that fails this check is stale and cannot drive remediation until a fresh canonical wave or focused evidence check re-establishes it.
2. For each defect family, verify the product path still matches the latest validated fingerprint, then stage loop-owned changes in a disposable snapshot. Apply only evidence-supported mechanical changes that preserve product behavior, scope, priority, and settled decisions. Record the complete before/after diff and account for every changed byte. Any diff that changes behavior, priority, product shape, scope, or a settled decision requires user resolution. On validation failure or concurrent product-path change, discard the staged snapshot without modifying the product path; the discarded cycle still consumes one work unit, and a second consecutive failure on the same family returns `Non-converged` with the observed reason. On success, commit the product path.
3. Build a **Remediation Neighborhood** from the changed Contract Matrix cells plus every graph-connected:
   - reverse branch;
   - caller and consumer;
   - adjacent state transition and commit/cancel boundary;
   - sibling product and operator surface;
   - fixture and test oracle;
   - metadata, documentation, and CI/delivery gate;
   - any assumption this document states about a prerequisite or consumer plan;
   - intentionally unchanged neighbor.
   Record its stable ID, complete membership, before/after diff, focused checks, accepted residuals, fingerprint, and status as a scratch packet in durable run state.
4. Review the neighborhood against the changed document with focused evidence checks. Mark it closed only when every member is proved or covered by a valid accepted residual at the current fingerprint.
5. Count this defect-family cycle as one work unit, then refresh the durable run state's inventory, matrix, graph, slices, neighborhoods, proof obligations, reviewer coverage, fingerprints, and finding ledger — after the product-document commit, per the ordering rule in Wave 0 step 7. Do not start it when the configured work-unit budget is exhausted.

Never repeat an unscoped whole-document review merely because the document changed. Finish the changed neighborhoods first.

## Subsequent Waves

After all known material findings — canonical findings at confidence anchors `75` or `100` — and their neighborhoods are closed:

1. Freeze a new product-path snapshot and refresh or revalidate every coverage artifact.
2. Use focused evidence checks on affected slices and graph-connected neighbors; these checks are neighborhood evidence, not canonical review waves.
3. Invoke the canonical full-document `ce-doc-review mode:non-interactive <disposable-snapshot-path>` gate. Do not start this wave when the configured work-unit budget is exhausted. The canonical sub-skill has no slice-scoped invocation contract, so never represent a partial review as a canonical wave.
4. Classify each returned finding as a missed member of an existing defect family, a fix-induced neighborhood defect, a genuinely new defect class, or evidence already resolved by the loop ledger. The loop may suppress only a prior user decision whose normalized section/title fingerprint and evidence overlap match the current finding. Materially changed evidence is new. Reopen only the affected slice plus graph-connected neighbors, close that neighborhood, then rerun the full-document gate.

A required reviewer failure or timeout is a coverage gap, not a clean wave. Retry that wave when the failure is transient; otherwise report the missing lens and remain non-converged.

## Final Convergence Gate

Declare convergence only when one `ce-doc-review` run examines the final snapshot and all conditions below hold. Normally that is a fresh gate wave. It may instead be the Pass 1 wave itself, but only when Pass 1 applied no fixes — then its reviewed bytes already are the final bytes, and a second identical review of identical bytes buys no evidence at full reviewer cost. A wave that changed a single byte can never be its own gate.
- The normative inventory is complete and every item maps to a Contract Matrix cell at the final fingerprint.
- Contract Matrix has no unexplained applicable cell at the final fingerprint; every cell is `proved` or has a valid fingerprint-bound `accepted_residual` closure status.
- Every applicable Change-Impact Graph edge, vertical slice, and Remediation Neighborhood is `proved` or has a valid fingerprint-bound `accepted_residual` closure status.
- Applicable negative-space and runtime proof obligations are `proved` at the final fingerprint or have a valid explicitly user-accepted `accepted_residual` closure status. Each accepted residual names the affected contract or proof, impact boundary, owner, expiry or review trigger, fail-closed behavior, fingerprint, and the specific cell/edge/slice/neighborhood/obligation it satisfies; include it in the success envelope.
- The canonical caller envelope reports zero material findings. Material findings are canonical findings at confidence anchors `75` or `100`; an anchor `50` observation is material only when it exposes an open contract or proof obligation.
- The caller receipt reports zero document-changing fixes.
- Every required in-process reviewer selected by the canonical receipt completed; none failed, timed out, or returned malformed output. These reviewer and receipt coverage gaps are non-waivable. Optional cross-model peer failures remain report-only unless the canonical skill marks a peer required.
- The receipt's reviewed SHA-256 fingerprint and result fingerprint both match the expected final fingerprint and the disposable snapshot bytes; the product path remains byte-for-byte identical, and zero document-changing fixes means no commit is required.

Any edit invalidates the final-snapshot result and requires another fresh final gate. A zero-finding review of an earlier snapshot is not convergence.

Round count is diagnostic, never a stopping rule. `max-work-units` is the circuit breaker: each global `ce-doc-review` wave and each defect-family remediation cycle consumes one unit. It is not permission to declare success. Check the remaining budget before every unit. A final gate completed successfully as the last permitted unit may emit the success envelope; when the budget is exhausted before a successful final gate, return `Non-converged` with the open contracts, missing lenses, pending remediation neighborhoods, and exact next review wave.

## Quick Reference

| Signal | Action |
|---|---|
| First review of a multi-contract document | Prepare matrix, graph, slices, proofs, and frozen snapshot |
| First review of a single-contract document | Prepare matrix and frozen snapshot; expand coverage structures only when findings expose connected impact |
| Findings share one semantic cause | Remediate as one defect family |
| A fix adds authority, state, callback, lock, barrier, timeout, or recovery | Reopen its Remediation Neighborhood |
| `ce-doc-review` applies `safe_auto` edits | Prior zero-finding evidence is stale |
| Reviewer times out or fails | Record coverage gap; do not converge |
| Zero findings and no edits on final unchanged snapshot | Convergence may be declared if all evidence gates are closed |
| Work-unit limit reached with open contracts | Stop as `Non-converged`, never as complete |
