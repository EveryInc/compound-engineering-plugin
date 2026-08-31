# Execution Strategy and Native Dispatch

Read this after the engine is resolved and before dispatching any worker or scheduling a parallel wave. The kernel owns the route-resolution and WIP/write gates; the selected engine owner carries any engine-specific lock. This file owns how native work is scheduled, packaged, dispatched, and integrated.

For the inline/subagent engine, **prefer subagents for any structured multi-unit plan** — each worker gets a fresh context window for one unit. **Parallel dispatch of each independent dependency layer is the default, not an optimization to opt into**: serialize writes only where the dependency graph actually demands it, and only for the specific units that demand it. Let the plan's `Dependencies` and `Files` drive batching: run an independent dependency layer together, then the next. Serializing a whole plan is justified only by a genuinely linear dependency chain, or by units that can neither meet the shared-workspace wave contract below nor obtain an isolated workspace — never by blanket caution.

| Strategy | When to use |
|----------|-------------|
| **Inline** | Trivial work (1-2 files, no real decomposition), work needing user interaction mid-flight, or bare prompts that lack structured units |
| **Parallel subagents** | The default for structured multi-unit plans: dispatch each dependency layer's independent units (per the Parallel Safety Check) together, then the next layer — in harness-isolated workspaces, or in the shared workspace under the wave contract below |
| **Serial subagents** | Units the dependency graph genuinely chains, or units that fail the Parallel Safety Check — including the shared-workspace wave contract, where that is the workspace — after inspection. Fresh context per unit, executed in dependency order |

**Parallel Safety Check** — scheduling is separate from engine and workspace selection. Apply this gate to native and cross-model candidates before dispatching a wave:

1. Start only with units whose dependencies are already committed and whose peers in the same readiness layer do not depend on one another.
2. Map declared files to units from each candidate's `Files:` section, then reason beyond those declarations. File overlap is necessary but not sufficient: shared types/APIs/interfaces, migrations, lockfiles, generated artifacts/clients, registry or config/schema surfaces, and an environment singleton (one dev server/port, shared database, browser session, package install, or rate limit) all create contention.
3. Estimate expected merge and verification cost. Even isolated workers serialize when they share a contract or when reconciling their likely outputs is not obviously smaller and safer than serial authoring.
4. Dispatch together only when dependencies, declared files, semantic surfaces, runtime resources, and expected merge cost all support independence. Resolve uncertainty by inspection, not by default: read the actual files and contracts in question — minutes of reading is cheaper than hours of serial waiting. When contention survives inspection, **decline parallelism** for exactly the contending units and dispatch the rest of the layer in parallel; uncertainty about one unit never serializes its whole layer, and safety still beats speed for the units that genuinely contend.
5. Give every concurrent worker either an isolated workspace or membership in a shared-workspace wave that meets the wave contract below. A synchronous native unit stays in the active checkout.
6. Cap concurrency at a bounded batch (~3-5 workers), even when more units appear independent.
7. Price the cold-start tax before decomposing: every dispatched worker pays a context ramp-up before its first write. A unit too small to outweigh its own ramp-up belongs batched with related small units into one worker's packet — or done inline — rather than dispatched alone.
8. Abort criteria: broad unplanned edits, semantic overlap, out-of-scope failures, or repeated collision disables further waves; preserve or finish affected work serially.

Isolation for native workers is the harness's job, under the body's boundary. Probe what your native subagent mechanism provides and pick the parallel path:
- **Harness-native isolated workers** — each worker edits an isolated workspace the harness manages: for example, Claude Code `Agent` with worktree isolation or a harness worker capability whose receipt confirms an isolated workspace. This works even when you are already inside a worktree because the harness-managed worktrees are peers, not nested. Parallelize only units that pass the Safety Check; isolation makes recovery possible, not overlap safe.
- **Shared workspace only** — subagents edit your working directory. Dispatch a parallel wave only when it meets the shared-workspace wave contract below; units that cannot meet it run serially. Do not infer isolation from the presence of a subagent API; use only a capability the active harness actually exposes.
- **No subagent mechanism:** run inline.

**Dispatch a wave in one response.** When a dependency layer clears the Safety Check, first privately list every dispatch-ready unit; then issue every worker dispatch that doesn't depend on another's result in that one response — multiple dispatch tool calls in a single message (e.g. Claude Code `Agent` calls), never one per turn.

**Native dispatch (inline/subagent engines only)** uses your harness's subagent/worker mechanism. Once a unit is selected for cross-model execution, use the loaded controller protocol for that unit; it must not re-enter this ordinary subagent dispatch.

Classify a rejected native dispatch by whether a worker launched: correct a pre-launch argument rejection once, leave capacity-limited work queued, and if another launch failure survives correction, execute that unit inline under the same unit packet and verification contract.

**Fresh worker invariant (native subagent dispatch only):** When dispatching an implementation unit to a native subagent worker, create a new worker context with no prior implementation-unit transcript. Bind the worker handle to exactly that unit: it may continue or recover the same unit, but never receive a different unit. Retire each handle after its unit is integrated; never retask it or retain idle implementation workers for reuse. Invoke an explicit close/release operation only when the active harness exposes one and assigns that lifecycle action to the caller; otherwise completion is the worker's release boundary. Inline execution creates no worker context or handle, so it has nothing to retire.

Give each native worker:
- The plan path plus a **bounded unit packet** and inherited authority — Goal Capsule, Definition of Done, the unit's section, the Verification Contract entries relevant to it, any referenced R/F/AE/KTD excerpts, **plus any Product Contract Key Decision whose `Governs R…` links name the unit's cited R-IDs** (its `session-settled:` annotation reaches the worker only through this reverse link — cited KTDs alone carry only planning-decision labels). A downstream worker may narrow that unit and authority, never broaden either. Do not send "read the whole plan" as the worker prompt. (For a legacy non-unified plan, the plan path for reference is acceptable.)
- The unit's Goal, Files, Approach, Execution note, Patterns, Test scenarios, Verification, and any resolved deferred questions for it.
- Instruction to check whether the unit's test scenarios cover all applicable categories (happy paths, edge cases, error paths, integration) and supplement gaps before writing tests.
- **Instruction to choose the unit's evidence strategy and gather the evidence** (see Evidence Strategy in Phase 2) — for behavior-bearing changes, honor the Execution note and default to proof-first or characterization-first: create/update/strengthen the test and observe the red failure or characterization baseline **before** changing production code. The worker is the only party that witnesses this, so it must capture it as it goes.
- **Instruction to report, in its final message, both (a) the file paths it changed and (b) the unit's verification evidence** — `behavior_changed`, existing tests inspected, tests added/changed or used unchanged, the red failure or characterization observed (when applicable), the verification run and result, and any deliberate no-test exception with its reason. The handoff is a text summary on most harnesses with no guaranteed diff, so reported paths are the orchestrator's starting hint (it still verifies the actual tree); the evidence fields are **not** reconstructable from the tree afterward, so a worker that omits them forces the orchestrator to re-derive or leave `verification_evidence` incomplete.
- **Do not commit.** Ordinary native workers implement and may run their *own unit's* focused tests in isolation as a self-check, but the **orchestrator owns staging, committing, and the authoritative test runs**. An external cross-model worker leaves its tree uncommitted under the body's boundary; the host's transport snapshots are change transport, never canonical commits.

**Parallel subagent mode:** Commit ownership is split by isolation mode (see Phase 1 Step 4):
- **Worktree-isolated:** subagents may stage and commit inside their own worktree branch; the orchestrator merges those branches in dependency order after the batch.
- **Shared-directory fallback:** subagents do not commit; the orchestrator stages and commits each unit after the entire parallel batch completes.

**Shared-workspace wave contract** — a parallel wave in a shared working directory is permitted only while all of these hold; a unit that cannot meet one serializes or gets isolation:

- **Clean committed baseline.** Dispatch the wave from a committed tree, so each worker's output is attributable and revertible by its file set and an aborted wave restores to the baseline.
- **Exclusive ownership, including hidden write surfaces.** Beyond the disjoint declared files the Safety Check already verified, every hidden write surface — lockfiles, generated artifacts, snapshots, formatter sweeps, package manifests — is either excluded from all workers or assigned to exactly one.
- **No worker Git operations.** Workers must not `git add`, commit, or otherwise write the index — concurrent index writes corrupt the shared index. The orchestrator stages and commits after the batch.
- **Orchestrator-owned verification.** Workers run no mutating verification (full suites, installs, builds that write shared state); a worker may run a single focused unit test only if it touches no shared state. The authoritative run happens after the wave on the integrated tree.
- **Abort on unowned writes.** A write outside every worker's exclusive set aborts the wave and disables further shared-workspace waves for the run. Restore to the baseline only changes attributable to a worker; a change no worker accounts for may be the user's — preserve it and stop for reconciliation rather than discarding it.

**Permission mode:** Omit the `mode` parameter when dispatching subagents so the user's configured permission settings apply. Do not pass `mode: "auto"` — it overrides user-level settings like `bypassPermissions`.

**After each serial inline/subagent unit:** review the diff against the unit's scope and `Files:`, run the relevant tests, fix before starting the next (never on a broken tree), record the unit's verification evidence (from the worker's return when a worker ran), update the task list, and commit. If the unit used a native subagent worker, retire its handle per the fresh worker invariant, then dispatch the next subagent unit in a new worker context. An inline unit has no worker handle to retire; start the next unit directly.

**After a parallel inline/subagent batch — the orchestrator integrates; never trust the handoff summary alone:**
1. Wait for every worker in the batch to finish.
2. **Inspect the actual tree, not reported paths.** Determine what each worker really changed (`git status`/diff in its workspace or the shared dir). Reported paths are a hint; declared `Files:` are often incomplete — workers create/modify files the plan didn't anticipate.
3. **Detect real collisions and semantic contention** — compare actual paths plus shared contracts, generated/config surfaces, and verification effects. A clean merge is not proof of compatibility. Preserve or re-run colliding units on the advancing canonical base; never blind-merge them.
4. **Review, test, commit, and retire each unit in dependency order — the orchestrator owns commits.** Integrate one result, inspect actual scope, run authoritative verification, create its canonical commit, then immediately retire that unit's worker per the fresh worker invariant before considering the next. Never send the retired handle another implementation unit or keep it in an orchestrator-managed idle pool. Clean up an isolated workspace only when the harness assigns that cleanup to the caller and only after proving the unit's work was integrated — never infer manual cleanup commands from the provider name. Revalidate every remaining result against the advancing canonical tree. Capture each worker's returned verification evidence into the run's `verification_evidence` roll-up — if a worker omitted it, re-derive what the tree allows and mark the rest as unverified rather than fabricating a red-before-implementation observation the worker never reported.
5. Update the task list (progress lives in the commits).
6. Dispatch the next dependency layer only after every unit in the batch has been integrated and its worker retired. Any remaining isolated-workspace cleanup follows the active harness's ownership and lifecycle contract.

**Per-harness integration (examples — the universal flow above is the contract):**
- **Harness-owned worktree/branch:** integrate one branch in dependency order, verify, and commit before the next; on conflict abort and re-run or explicitly resolve that unit against the advanced tree.
- **Harness-owned uploaded change set:** accept one isolated result, inspect and verify it, commit it canonically, then release the worker before the next result.
- **Shared workspace:** worker outputs sit uncommitted in the one working directory; attribute each unit by its exclusive file set from the wave contract, then verify and commit in dependency order.
- **External cross-model workspace:** follow the conditionally loaded cross-model parallel-wave protocol and controller receipts; ordinary branch-merge shortcuts do not apply.
