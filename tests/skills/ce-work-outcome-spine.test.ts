import { readFile } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"

async function readRepoFile(relativePath: string): Promise<string> {
  return readFile(path.join(process.cwd(), relativePath), "utf8")
}

// Mechanism pins follow the phase owner that the kernel requires before action. The
// always-loaded body keeps ordering, unread stops, WIP/write gates, review completion,
// and tail ownership; the references keep the detailed protocols.
async function readStrategy(): Promise<string> {
  return readRepoFile("skills/ce-work/references/execution-strategy.md")
}

async function readTriage(): Promise<string> {
  return readRepoFile("skills/ce-work/references/input-triage.md")
}

async function readReturnContract(): Promise<string> {
  return readRepoFile("skills/ce-work/references/return-to-caller.md")
}

async function readImplementationContract(): Promise<string> {
  const skill = await readRepoFile("skills/ce-work/SKILL.md")
  const implementationLoop = await readRepoFile("skills/ce-work/references/implementation-loop.md").catch(() => "")
  return `${skill}\n${implementationLoop}`
}

function sliceSection(content: string, startAnchor: string, endAnchor: string): string {
  const start = content.indexOf(startAnchor)
  expect(start, `start anchor not found: ${startAnchor}`).toBeGreaterThanOrEqual(0)
  const end = content.indexOf(endAnchor, start + startAnchor.length)
  expect(end, `end anchor not found: ${endAnchor}`).toBeGreaterThan(start)
  return content.slice(start, end)
}

describe("ce-work native characterization", () => {
  test("opens with result, next consumer, done condition, and host-owned canonical integration", async () => {
    const skill = await readRepoFile("skills/ce-work/SKILL.md")
    const outcome = sliceSection(skill, "## Outcome", "## Execution Workflow")

    expect(outcome).toContain("**Result:**")
    expect(outcome).toContain("**Next consumer:**")
    expect(outcome).toContain("**Done:**")
    expect(outcome).toContain("**Intent:**")
    expect(outcome).toContain("host orchestrator")
    expect(outcome).toContain("authoritative verification and canonical commits")
    // 2026-08-21 PR #1508 review: a host that reads every owner at skill load never re-reads at the acting step,
    // so the late missing-reference stops were unreachable; the kernel must say an early read does not count.
    expect(skill).toContain("a read made before that phase does not satisfy it")
    expect(skill).toContain("read again at its step even when already in context")
    expect(skill.indexOf("## Outcome")).toBeLessThan(skill.indexOf("## Execution Workflow"))
  })

  test("classifies caller mode, legacy aliases, bare prompts, and plans before execution", async () => {
    const skill = await readRepoFile("skills/ce-work/SKILL.md")
    const triage = await readTriage()

    expect(triage).toContain("**Otherwise, parse a leading mode token.**")
    expect(triage).toContain("mode:return-to-caller")
    expect(triage).toContain("mode:caller-owned-tail")
    expect(triage).toContain("caller:lfg")
    expect(triage).toContain("**Plan document**")
    expect(triage).toContain("**Resolve a session-carried plan before blank or bare-prompt classification.**")
    expect(triage).toContain("Invocation origin is not observable or relevant")
    expect(triage).toContain("**Blank invocation latest-plan discovery:**")
    expect(triage).toContain("**Bare prompt**")
    expect(triage).toContain("skip only the task list")
    expect(triage).toContain("mandatory engine-before-write gate")
  })

  test("activates direct recovery before ordinary input classification", async () => {
    const skill = await readRepoFile("skills/ce-work/SKILL.md")
    const bodyTriage = sliceSection(skill, "### Phase 0: Input Triage", "### Phase 1: Quick Start")
    const triage = await readTriage()

    expect(bodyTriage).toContain("**Recovery activation comes first.**")
    expect(bodyTriage).toContain("Recovery never dispatches a new worker")
    expect(bodyTriage.indexOf("**Recovery activation comes first.**")).toBeLessThan(bodyTriage.indexOf("references/input-triage.md"))
    expect(triage).toContain("resume, inspect status, reap, or clean up")
    expect(triage).toContain("implementation_run:<safe-id>")
    expect(triage).toContain("read `references/cross-model-execution.md`")
    expect(triage).toContain("must not dispatch a new worker")
    expect(triage).toContain("completed recovery is read-only reconciliation")
    expect(triage).toContain("Do not rerun test, build, format, install, generation, or `verify-run`")
    expect(triage).toContain("report the stored unit and plan-wide verification receipts")
    expect(triage.indexOf("**Recovery activation comes first.**")).toBeLessThan(triage.indexOf("**Otherwise, parse a leading mode token.**"))
  })

  test("keeps the existing native engines and synchronous inline path", async () => {
    const skill = await readRepoFile("skills/ce-work/SKILL.md")
    const engineGate = sliceSection(skill, "2. **Resolve the engine, then strategy.**", "### Phase 2: Execute")
    const engines = await readRepoFile("skills/ce-work/references/execution-engines.md")
    const strategy = await readStrategy()

    expect(engineGate).toContain("references/execution-engines.md")
    expect(engines).toContain("inline/subagent")
    expect(engines).toContain("goal-mode")
    expect(engines).toContain("dynamic-workflow")
    expect(engines).toContain("inline/subagent flow in `references/execution-strategy.md`")
    expect(engines).not.toContain("inline/subagent flow in `SKILL.md`")
    expect(strategy).toMatch(/\*\*Inline\*\* \| Trivial work/)
    expect(strategy).toContain("native workers")
    expect(engineGate).toContain("cross-model execution")
  })

  test("derives bounded plan tasks before resolving the engine, then gates every execution action", async () => {
    const skill = await readRepoFile("skills/ce-work/SKILL.md")
    const workspace = await readRepoFile("skills/ce-work/references/workspace-setup.md")
    const engineGate = sliceSection(skill, "2. **Resolve the engine, then strategy.**", "### Phase 2: Execute")

    expect(workspace).toContain("**Read Plan and Clarify**")
    expect(workspace).toContain("**Create Task List**")
    expect(engineGate).toContain("After bounded plan intake and task derivation")
    expect(engineGate).toContain("before selecting a unit for execution, writing, dispatching, or committing")
  })

  test("workspace setup pins fresh-base and current-branch observations", async () => {
    const workspace = await readRepoFile("skills/ce-work/references/workspace-setup.md")

    expect(workspace).toContain("`gh repo view --json defaultBranchRef`")
    expect(workspace).toContain("`git fetch origin <default>`")
    expect(workspace.match(/`git branch --show-current`/g)).toHaveLength(2)
    expect(workspace.indexOf("`git fetch origin <default>`")).toBeLessThan(
      workspace.indexOf("Base the new branch on the fetched `origin/<default>`"),
    )
  })

  test("new phase owners resolve sibling references from the skill root", async () => {
    const owners = await Promise.all([
      readTriage(),
      readRepoFile("skills/ce-work/references/workspace-setup.md"),
      readReturnContract(),
    ])

    for (const owner of owners) {
      expect(owner).not.toMatch(/(?<!references\/)`(?:cross-model-execution|work-intake|non-code-execution|execution-engines|shipping-workflow)\.md`/)
    }
  })

  test("bounds worker scope while leaving canonical verification and commits with the orchestrator", async () => {
    const strategy = await readStrategy()
    const dispatch = strategy.slice(strategy.indexOf("**Native dispatch (inline/subagent engines only)**"))

    expect(dispatch).toContain("**bounded unit packet**")
    expect(dispatch).toContain("A downstream worker may narrow that unit and authority, never broaden either")
    expect(dispatch).toContain("Do not send \"read the whole plan\"")
    expect(dispatch).toContain("**Do not commit.**")
    expect(dispatch).toContain("**orchestrator owns staging, committing, and the authoritative test runs**")
    expect(dispatch).toContain("Review, test, commit, and retire each unit in dependency order — the orchestrator owns commits")
  })

  test("uses a fresh single-use context for each dispatched native worker while preserving inline execution", async () => {
    const strategy = await readStrategy()
    const dispatch = strategy.slice(strategy.indexOf("**Native dispatch (inline/subagent engines only)**"))

    expect(dispatch).toContain("**Fresh worker invariant (native subagent dispatch only):**")
    expect(dispatch).toContain("When dispatching an implementation unit to a native subagent worker, create a new worker context")
    expect(dispatch).toContain("never receive a different unit")
    expect(dispatch).toContain("never retask it or retain idle implementation workers for reuse")
    expect(dispatch).toContain("Inline execution creates no worker context or handle, so it has nothing to retire")
    expect(dispatch).toMatch(/After each serial inline\/subagent unit:.*If the unit used a native subagent worker, retire its handle.*dispatch the next subagent unit in a new worker context/s)
    expect(dispatch).toMatch(/After each serial inline\/subagent unit:.*closing\/releasing it only when the harness exposes that operation and assigns that lifecycle action to the caller/s)
    expect(dispatch).toContain("An inline unit has no worker handle to retire; start the next unit directly")
    expect(dispatch).toMatch(/After a parallel inline\/subagent batch.*create its canonical commit, then immediately retire that unit's worker before considering the next/s)
    expect(dispatch).toMatch(/After a parallel inline\/subagent batch.*Invoke an explicit close\/release operation only when the harness exposes it and assigns that lifecycle action to the caller/s)
    expect(dispatch).toContain("never infer manual cleanup commands from the provider name")
  })

  test("does not re-enter native dispatch after selecting cross-model execution", async () => {
    const skill = await readRepoFile("skills/ce-work/SKILL.md")
    const engineGate = sliceSection(skill, "2. **Resolve the engine, then strategy.**", "### Phase 2: Execute")
    const protocol = await readRepoFile("skills/ce-work/references/cross-model-execution.md")
    const strategy = await readStrategy()

    expect(engineGate).toContain("post-init engine lock")
    expect(protocol).toContain("**A successful controller `init` locks that unit to the selected cross-model engine.**")
    expect(protocol).toContain("Never reclassify it as trivial, abandon it for speed, or implement it natively")
    expect(strategy).toContain("**Native dispatch (inline/subagent engines only)**")
    expect(strategy).toContain("must not re-enter this ordinary subagent dispatch")
    expect(strategy).toContain("**After each serial inline/subagent unit:**")
    expect(strategy).toContain("**After a parallel inline/subagent batch")
  })

  test("preserves standalone shipping and return-to-caller tail ownership", async () => {
    const skill = await readRepoFile("skills/ce-work/SKILL.md")
    const standalone = sliceSection(skill, "### Phase 3-4: Quality Check and Finishing Work", "## Return-to-Caller Mode")
    const caller = skill.slice(skill.indexOf("## Return-to-Caller Mode"))
    const returnContract = await readReturnContract()

    expect(standalone).toContain("references/shipping-workflow.md")
    expect(caller).toContain("implementation and local verification only")
    expect(caller).toContain("standalone_shipping_skipped: true")
    expect(caller).toContain("must not enter Phase 3-4")
    expect(caller.match(/references\/return-to-caller\.md/g)?.length).toBe(1)
    expect(returnContract).toContain("structured summary instead of running the standalone shipping tail")
    expect(returnContract).toContain("must not open a PR")
  })
})

describe("ce-work cross-model engine contract", () => {
  test("resolves live routing intent and ordered harness/model preferences", async () => {
    const skill = await readRepoFile("skills/ce-work/SKILL.md")
    const engines = await readRepoFile("skills/ce-work/references/execution-engines.md")
    const engineGate = sliceSection(skill, "2. **Resolve the engine, then strategy.**", "### Phase 2: Execute")

    expect(engineGate).toContain("cross-model execution")
    expect(engineGate).toContain("After bounded plan intake and task derivation")
    expect(engineGate).toContain("with or without a typed binding")
    expect(engineGate).toContain("native execution is eligible only")
    expect(engines).toContain("still-active session")
    expect(engines).toContain("active instructions and conventions already in context")
    expect(engines).toContain("recorded provenance")
    expect(engines).toMatch(/incidental mentions/i)
    expect(engines).toContain("work_engine_mode")
    expect(engines).toContain("`off | prefer | require`")
    expect(engines).toContain("work_engine_preferences")
    expect(engines).toContain("`harness`")
    expect(engines).toContain("optional `model`")
    expect(engines).toContain("configured default")
    expect(engines).toContain("ordered candidate")
    expect(engines).toContain("continue to the next candidate")
    expect(engines).toContain("equivalent to the current host")
    expect(engines).toContain("`off` disables only the standing preference")
    expect(engines).toContain("strict Composer")
    expect(engines).toContain("caller Codex")
    expect(engines).toContain("config Cursor")
  })

  test("turns clear planless work into a private bounded source without exporting the session", async () => {
    const skill = await readRepoFile("skills/ce-work/SKILL.md")
    const engines = await readRepoFile("skills/ce-work/references/execution-engines.md")
    const external = await readRepoFile("skills/ce-work/references/cross-model-execution.md")

    expect(skill).toContain("bounded egress")
    expect(engines).toContain("Invocation origin supplies no routing authority")
    expect(engines).toContain("concrete goal, bounded scope, and authoritative verification")
    expect(external).toContain("## Build a source for bare-prompt work")
    for (const heading of ["Request", "Goal", "Scope", "Acceptance and verification", "Constraints and exclusions", "Units"]) {
      expect(external).toContain(`\`${heading}\``)
    }
    expect(external).toContain("one conservative `P1` unit by default")
    expect(external).toContain("--prompt-brief <temp-path> --prompt-digest <sha256>")
    expect(external).toContain("Prompt-backed runs require their disclosed run id")
  })

  test("uses agent judgment above fixed safety boundaries when local harness CLIs drift", async () => {
    const engines = await readRepoFile("skills/ce-work/references/execution-engines.md")
    const protocol = await readRepoFile("skills/ce-work/references/cross-model-execution.md")

    expect(engines).toContain("attempt the documented adapter recipe first")
    expect(engines).toContain("local CLI help or version")
    expect(engines).toContain("same sanctioned harness/model family")
    expect(protocol).toContain("first qualified candidate")
    expect(protocol).toContain("Before egress")
    expect(protocol).toContain("After dispatch starts")
    expect(protocol).toContain("never switch recipients")
  })

  test("keeps explicit cross-model activation read-only until the controller owns the workspace", async () => {
    const skill = await readRepoFile("skills/ce-work/SKILL.md")
    const bodyTriage = sliceSection(skill, "### Phase 0: Input Triage", "### Phase 1: Quick Start")
    const triage = await readTriage()
    const engines = await readRepoFile("skills/ce-work/references/execution-engines.md")

    expect(bodyTriage).toContain("read-only discovery")
    expect(skill).toContain("before selecting a unit for execution, writing, dispatching, or committing")
    expect(triage).toContain("Without either optional carrier")
    expect(triage).toContain("standing configuration remains eligible")
    expect(engines).toContain(".compound-engineering/config.local.yaml")
    expect(engines).toContain("then `config.yaml`")
    expect(triage).toContain("pre-controller discovery is read-only")
    expect(triage).toContain("Do not run baseline, test, build, format, install, or generation commands")
    expect(triage).toContain("prove the canonical Git snapshot is byte-for-byte unchanged")
  })

  test("keeps the caller carrier implementation-only and exactly four fields", async () => {
    const triage = await readTriage()
    const engines = await readRepoFile("skills/ce-work/references/execution-engines.md")
    const carrier = sliceSection(engines, "### Typed caller binding", "### Target and identity vocabulary")

    expect(triage).toContain("exactly four fields")
    for (const field of ["mode", "target", "model", "source"]) {
      expect(triage).toContain(`\`${field}\``)
    }
    expect(triage).toContain("`mode` is `prefer` or `require`")
    expect(triage).toContain("`model` is a string pin or `null`")
    expect(triage).toContain("`source` is a non-empty caller-visible provenance string")
    expect(triage).toContain("Fully validate and normalize both before any workspace action")
    expect(carrier).toContain("fully validated and normalized typed caller binding")
    expect(carrier).toContain("never send its fields into planning or review input")
    expect(engines).not.toContain("work_delegate_")
  })

  test("preserves ordered LFG intent without truncating the scalar carrier", async () => {
    // The ordered-fallback rule lives in the reference lfg names as a required read
    // before step 1 whenever a routing directive exists.
    const lfg = await readRepoFile("skills/lfg/references/stage-routing.md")

    expect(lfg).toContain("ordered fallback list")
    expect(lfg).toContain("do not truncate it to the scalar carrier")
    expect(lfg).toContain("retain the whole ordered assignment as current-task implementation intent")
    expect(lfg).toContain("pass no `implementation_engine:` object")
    expect(lfg).toContain("host cannot preserve that context")
    expect(lfg).toContain("routing-carrier blocker")
  })

  test("gives string-only callers an exact optional carrier grammar", async () => {
    const phase0 = await readTriage()
    const returnOwner = await readReturnContract()

    expect(phase0).toContain("implementation_engine:")
    expect(phase0).toContain("one compact JSON object")
    expect(phase0).toContain("exactly four fields")
    expect(phase0).toContain("implementation_run:<safe-id>")
    expect(phase0).toContain("`^[A-Za-z0-9._-]{1,128}$`")
    expect(phase0).toContain("Reject malformed JSON, missing/extra fields, invalid field types or values")
    expect(phase0).toContain("entire remaining string is the plan path")
    expect(phase0).toContain("original `mode:return-to-caller <plan-path>` form is unchanged")
    expect(returnOwner).toContain("Input triage owns and validates the invocation grammar")
    expect(returnOwner).not.toContain("[implementation_engine:<compact-json>]")
  })

  test("keeps relocated engine pointers rooted at their acting owners", async () => {
    const engines = await readRepoFile("skills/ce-work/references/execution-engines.md")

    expect(engines).toContain("`references/execution-strategy.md`")
    expect(engines).toContain("`references/cross-model-execution.md`")
    expect(engines).toContain("`references/return-to-caller.md`")
    expect(engines).not.toContain("`SKILL.md` Phase 1 Step 4")
    expect(engines).not.toContain("structured summary in `SKILL.md`")
  })

  test("keeps external dispatch policy out of the implementation-worker persona", async () => {
    const worker = await readRepoFile("skills/ce-work/references/agents/implementation-worker.md")

    expect(worker).toContain("caller, unit packet, and controller own dispatch")
    expect(worker).toContain("Implement exactly the supplied implementation unit")
    expect(worker).toContain("Before returning `completed`")
    expect(worker).toContain("complete Git delta")
    expect(worker).toContain("disposable artifacts created by your own checks")
    expect(worker).toContain("every remaining changed path")
    expect(worker).not.toContain("make intermediate commits")
    expect(worker).toContain("`git add`")
    expect(worker).toContain("`git commit`")
    expect(worker).toContain("Leave the completed working tree uncommitted")
    expect(worker).toContain("host snapshots the tree")
    for (const dispatchPolicy of ["recipient", "model", "harness", "intermediary", "retry", "route", "additional workers"]) {
      expect(worker.toLowerCase()).not.toContain(dispatchPolicy)
    }
  })

  test("distinguishes Cursor from Composer and collapses same-host default execution", async () => {
    const protocol = await readRepoFile("skills/ce-work/references/cross-model-execution.md")

    expect(protocol).toContain("`cursor` means the Cursor harness with its configured default model")
    expect(protocol).toContain("`composer` means a Composer-family model through Cursor")
    expect(protocol).toContain("same-host default")
    expect(protocol).toContain("collapse to native execution")
    expect(protocol).toContain("codex")
    expect(protocol).toContain("claude")
    expect(protocol).toContain("grok")
    expect(protocol).toContain("Fixed controller route tokens")
    expect(protocol).toContain("`codex`, `claude`, `grok-cli`, `cursor`, `composer`, `grok-cursor`, or `opencode`")
  })

  test("defines prefer, require, fixed-recipient sanction, and restriction failure", async () => {
    const protocol = await readRepoFile("skills/ce-work/references/cross-model-execution.md")

    expect(protocol).toContain("Preference-strength")
    expect(protocol).toContain("Requirement-strength")
    expect(protocol).toContain("Cross-model implementation routes are write- and shell-capable")
    expect(protocol).toContain("Never request broader host permissions")
    expect(protocol).toContain("current harness and session model without prompting")
    expect(protocol).toContain("never turns an unavailable route into an error or user-choice gate")
    expect(protocol).toContain("fixed recipient")
    expect(protocol).toContain("every intermediary")
    expect(protocol).toContain("material exposed")
    expect(protocol).toContain("caller restrictions")
    expect(protocol).toContain("required restriction")
    expect(protocol).toContain("route unavailable")
    expect(protocol).toContain("never switch recipients")
  })

  test("preserves host-only canonical authority and narrows the worktree exception", async () => {
    const protocol = await readRepoFile("skills/ce-work/references/cross-model-execution.md")
    const strategy = await readStrategy()

    expect(strategy).toContain("Native dispatch (inline/subagent engines only)")
    expect(protocol).toContain("controller-owned detached worktree")
    expect(protocol).toContain("isolated transport commit")
    expect(protocol).toContain("host-only canonical")
    expect(protocol).not.toContain("An external worker may edit and commit only")
    expect(protocol).not.toContain("unless that adapter's sandbox can write")
    expect(protocol).toContain("`git add`")
    expect(protocol).toContain("`git commit`")
    expect(protocol).toContain("Git admin dir")
    expect(protocol).toContain("workspace-write")
    expect(protocol).toContain("--sandbox enabled")
    expect(protocol).toContain("never required")
    expect(protocol).toContain("Leave the completed working tree uncommitted")
    expect(protocol).toContain("Do not instruct it to run `git add`")
    expect(protocol).toContain("Leave the completed working tree uncommitted")
    for (const forbiddenAuthority of ["canonical commit", "push", "PR", "shipping", "recipient-switch"]) {
      expect(protocol).toContain(forbiddenAuthority)
    }
    expect(protocol).toContain("may narrow")
    expect(protocol).toContain("never broaden")
  })

  test("loads the cross-model protocol only for selected execution or recovery", async () => {
    const skill = await readRepoFile("skills/ce-work/SKILL.md")
    const engineGate = sliceSection(skill, "2. **Resolve the engine, then strategy.**", "### Phase 2: Execute")
    const triage = await readTriage()

    expect(engineGate).toContain("If cross-model execution is selected")
    expect(engineGate).toContain("read `references/cross-model-execution.md`")
    expect(triage.match(/cross-model-execution\.md/g)?.length).toBe(2)
    expect(skill.match(/references\/cross-model-execution\.md/g)?.length).toBe(1)
  })

  test("returns requested and actual route, model, fallback, run, unit, blocker, and recovery receipts", async () => {
    const caller = await readReturnContract()

    for (const receipt of [
      "implementation_engine_binding",
      "requested_route",
      "actual_route",
      "requested_model",
      "actual_model",
      "fallback_reason",
      "run_id",
      "source_kind",
      "source_digest",
      "unit_receipts",
      "blockers",
      "recovery_path",
      "plan_checkpoint",
    ]) {
      expect(caller).toContain(receipt)
    }
    expect(caller).toContain("standalone_shipping_skipped: true")
  })

  test("defines an executable serial external-unit transaction before any parallel protocol", async () => {
    const protocol = await readRepoFile("skills/ce-work/references/cross-model-execution.md")
    const runner = await readRepoFile("skills/ce-work/scripts/peer-job-runner.py")
    const serial = sliceSection(protocol, "## Serial external-unit protocol", "## Preserve tail ownership")

    for (const command of [
      "unit-workspace.py` `init",
      "unit-workspace.py` `checkpoint-plan",
      "unit-workspace.py` `prepare",
      "unit-workspace.py` `authorize-dispatch",
      "peer-job-runner.py` `start --no-sweep --input-digest <controller-packet-digest>",
      "cross-model-work.sh",
      "unit-workspace.py` `record-job",
      "unit-workspace.py` `terminalize",
      "unit-workspace.py integrate",
      "unit-workspace.py verify-run",
      "unit-workspace.py` `integration-acquire",
      "unit-workspace.py` `preflight",
      "git cherry-pick --no-commit",
      "unit-workspace.py` `mark-applied",
      "unit-workspace.py` `mark-verified",
      "unit-workspace.py` `mark-committed",
      "unit-workspace.py` `cleanup",
      "unit-workspace.py` `integration-release",
    ]) {
      expect(serial).toContain(command)
    }
    expect(serial).toContain("cross-model-work.sh <authorization_path> <workspace> <unit-packet> <expected-packet-sha256> <result-dir>")
    expect(serial).toContain("controller-returned `authorization_path`")
    expect(serial).toContain("controller-returned `attempt_id`")
    expect(serial).toContain("invoke the returned adapter path directly")
    expect(serial).toContain("without a `bash`, `sh`, or `env` prefix")
    expect(serial).toContain("runner label must equal the unit id exactly")
    expect(serial).toContain("<controller-result-dir>/implementation-result.json")
    expect(serial).toContain("Do not pre-create the run directory")
    expect(serial).toContain("`git -C <canonical-checkout>`")
    expect(serial).toContain("Any change to tracked state")
    expect(serial).toContain("`ignored_state`")
    expect(serial).toContain("never copies, restores, or deletes ignored files")
    expect(serial).not.toContain("exact-snapshot")
    expect(serial).toContain("authoritative command's exit status")
    expect(serial).toContain("never infer a pass from stdout")
    expect(serial).toContain("`run_id`, `unit_id`, and `attempt_id`")
    expect(serial).toContain("`CE_PEER_HARD_SECS=7200`")
    expect(serial).toContain("`CE_PEER_IDLE_SECS=600` for route-qualified `incremental` activity")
    expect(serial).toContain("`CE_PEER_IDLE_SECS=0` for `hard-only` or otherwise untrustworthy activity")
    expect(serial).toContain("resets on progress and detects a stall; it is not a wall-clock maximum")
    expect(serial).toContain(
      "parent CE Work directory containing all `<run-id>/` directories, not an individual run directory",
    )
    expect(runner).toContain("CE_WORK_RUNS_ROOT         parent CE Work dir containing all <run-id>/ dirs")
    expect(serial).toContain("Both `--input-digest` and the adapter's expected-packet argument")
    expect(serial).toContain("controller `authorize-dispatch` success")
    expect(serial).toContain("runner-exported job id")
    expect(serial).toContain("atomically binds that job id to the exact attempt before egress")
    expect(serial).toContain("A second job for the attempt is refused")
    expect(serial).toContain("actual runner metadata and exact worker argv")
    expect(serial).toContain("authorization digest, workspace, packet path and digest, and result directory")
    expect(serial).toContain("hand-authored or cross-attempt authorization")
    expect(serial).toContain("exact route, model, and intermediary contract")
    expect(serial).toMatch(/before prompt construction or external CLI start/i)
    expect(serial).toContain("`--emit-adapter` mode remains introspection only")
    expect(serial).not.toContain("CE_WORK_MODEL_OVERRIDE")
    expect(serial).not.toContain("CE_WORK_MODEL_OVERRIDE_TARGET")
    expect(serial).toContain("one bounded unit packet")
    expect(serial).toContain("exact plural keys `route`, `intermediaries`, and `restrictions`")
    expect(serial).toContain("direct `codex`, `claude`, `grok-cli`, and `cursor` routes use `intermediaries: []`")
    expect(serial).toContain("Write the packet source directly to OS temp outside the canonical checkout")
    expect(serial).toContain("never draft it inside the repository and move or copy it later")
    expect(serial).toContain("quoting `$(...)` as a direct argument does not expand it")
    expect(serial).toContain("-- bash -o pipefail -c")
    expect(serial).toContain("separate host tool calls")
    expect(serial).toContain("Never generate or run a shell script")
    expect(serial).toContain("`start` must return")
    expect(serial).toContain("one state-changing controller transition")
    expect(serial).toContain("single fail-stop `integrate` transaction")
    expect(serial).toContain("Do not manually chain")
    expect(serial).toContain("60 seconds")
    expect(serial).toContain("A nonzero controller, runner, verification, or Git exit ends that host tool call")
    expect(serial).toContain("every bare-job-id runner `status`, `wait`, `result`, or `reap` call must carry `--skill ce-work`")
    expect(serial).toContain("inspect the actual transport diff")
    expect(serial).toContain("generated byproduct")
    expect(serial).toContain("before `mark-verified`")
    expect(serial).toContain("authoritative canonical verification")
    expect(serial).toContain("restore")
    expect(serial).toContain("before fallback, retry, or another unit")
    expect(serial).toContain("plan-wide Verification Contract gates")
    expect(serial).toContain("restores tracked state to the exact starting snapshot")
    expect(serial.indexOf("integration-acquire")).toBeLessThan(serial.indexOf("git cherry-pick --no-commit"))
    expect(serial.indexOf("mark-verified")).toBeLessThan(serial.indexOf("mark-committed"))
  })

  test("defines exactly-once resume, recovery discovery, and post-start fallback gates", async () => {
    const protocol = await readRepoFile("skills/ce-work/references/cross-model-execution.md")

    expect(protocol).toContain("unit-workspace.py` `resume --run-id")
    expect(protocol).toContain("list the matching run ids")
    expect(protocol).toContain("completed run is observation-only")
    expect(protocol).toContain("must not rerun a Verification Contract gate")
    expect(protocol).toContain("must not redispatch, reapply, recommit, or run either owning tail")
    expect(protocol).toContain("unit-workspace.py` `claim-fallback")
    expect(protocol).toContain("unit-workspace.py` `complete-fallback")
    expect(protocol).toContain("FALLBACK_ALREADY_AUTHORIZED")
    expect(protocol).toContain("FALLBACK_COMPLETED")
    expect(protocol).toContain("`RUN_VERIFIED`")
    expect(protocol).toContain("The first `prefer` or `require` claim authorizes exactly one fallback")
    expect(protocol).toContain("never turns an unavailable route into an error or user-choice gate")
    expect(protocol).toContain("exact restoration")
    expect(protocol).toContain("expected post-apply tree and changed-path set")
    expect(protocol).toContain("unknown dirt blocks without destructive restoration")
    expect(protocol).toContain("status`, `reap`, and `cleanup")
    expect(protocol).toContain("same scalar `run_id`")
    expect(protocol).toContain("a fresh `attempt_id`")
    expect(protocol).toContain("block selection")
    expect(protocol).toContain("Do not dispatch a new third run")
  })

  test("separates scheduling from engine/workspace selection and declines unsafe waves", async () => {
    const skill = await readRepoFile("skills/ce-work/SKILL.md")
    const loop = await readRepoFile("skills/ce-work/references/implementation-loop.md")
    const gate = sliceSection(await readStrategy(), "**Parallel Safety Check**", "**Native dispatch (inline/subagent engines only)**")

    expect(gate).toContain("separate from engine and workspace selection")
    expect(gate).toContain("decline parallelism")
    expect(gate).toContain("dependencies")
    expect(gate).toContain("declared files")
    expect(gate).toContain("shared types/APIs/interfaces")
    expect(gate).toContain("migrations")
    expect(gate).toContain("lockfiles")
    expect(gate).toContain("generated")
    expect(gate).toContain("registry")
    expect(gate).toContain("config")
    expect(gate).toContain("environment singleton")
    expect(gate).toContain("expected merge")
    expect(gate).toContain("3-5")
    expect(gate).toContain("every concurrent worker")
    expect(gate).toContain("isolated workspace")
    expect(gate).toContain("synchronous native")
    expect(gate).toContain("active checkout")
    expect(loop).toContain("Repeated collision")
    expect(loop).toContain("disable further parallel waves")
  })

  test("makes linked-checkout siblings and silent-route supervision explicit", async () => {
    const protocol = await readRepoFile("skills/ce-work/references/cross-model-execution.md")

    expect(protocol).toContain("already a linked worktree does not disable this route")
    expect(protocol).toContain("detached **sibling**")
    expect(protocol).toContain("/tmp/compound-engineering-<effective-uid>/ce-work/<run-id>/")
    expect(protocol).toContain("never a nested worktree")
    expect(protocol).toContain("plan-only state is checkpointable, not a route blocker")
    expect(protocol).toContain("`hard-only` is the normal posture")
    expect(protocol).toContain("disable idle timeout")
    expect(protocol).toContain("never infer failure or fallback merely from absent incremental activity")
  })

  test("defines same-base parallel authoring with serial semantic fold-in", async () => {
    const protocol = await readRepoFile("skills/ce-work/references/cross-model-execution.md")
    const wave = sliceSection(protocol, "## Parallel external-wave protocol", "## Resume and fallback exactly once")

    expect(wave).toContain("one recorded wave base")
    expect(wave).toContain("terminalize every worker")
    expect(wave).toContain("before the first fold-in")
    expect(wave).toContain("sequentially")
    expect(wave).toContain("wave-advance")
    expect(wave).toContain("exact earlier host-owned canonical commits")
    expect(wave).toContain("semantic")
    expect(wave).toContain("clean textual apply")
    expect(wave).toContain("restoration")
    expect(wave).toContain("dependents remain queued")
    expect(wave).toContain("unaffected siblings")
    expect(wave).toContain("re-dispatch")
    expect(wave).toContain("serial fallback")
    expect(wave).toContain("never blind-merge")
  })

  test("ships an evaluator-owned fresh-context fixture pack for the weakest seams", async () => {
    const skill = await readRepoFile("skills/ce-work/SKILL.md")
    const evalPack = await readRepoFile("skills/ce-work/references/cross-model-work-eval.md")

    expect(evalPack).toMatch(/must not be injected into\s+the agent under test/)
    expect(evalPack).toContain("weakest practical installed model tier")
    expect(evalPack).toContain("strong installed model tier")
    expect(evalPack).toContain("Change")
    expect(evalPack).toContain("Verify")
    expect(evalPack).toContain("Consider")
    for (let fixture = 1; fixture <= 40; fixture += 1) {
      expect(evalPack).toContain(`E${fixture} `)
    }
    for (const seam of [
      "native restraint",
      "LFG carrier",
      "selected-plan dirt",
      "lost contact",
      "ambiguous recovery",
      "authority narrowing",
      "hidden interface collision",
      "silent route",
      "unsupported restriction",
      "transactional failure",
      "return boundary",
      "linked-checkout sibling",
      "direct recovery",
      "LFG recovery carrier",
      "session preference",
      "same-harness explicit model",
      "ordered fallback",
      "LFG ordered live assignment",
      "trivial configured engine",
      "exact dispatch digest",
      "clean packet and shell argv",
      "exact egress object",
      "session-carried plan",
      "bounded bare-prompt delegation",
      "unclear bare-prompt restraint",
      "host-native matrix",
      "required alternate matrix",
      "post-init recipient lock",
      "sibling-clone recovery isolation",
      "plugin-bundled reference load",
      "incremental idle window",
      "sandboxed worker no-commit",
    ]) {
      expect(evalPack).toContain(seam)
    }
    expect(evalPack).toContain("| E20 linked-checkout sibling | CE Work is itself running in an existing linked worktree and selects external implementation for one unit | Create a new detached **sibling** through the repository's shared Git common directory, place it under `/tmp/compound-engineering-<effective-uid>/ce-work/<run-id>/` rather than beneath the active checkout, base it at the recorded clean canonical SHA, and keep canonical fold-in host-owned. Do not reject the route merely because the active checkout is already a worktree, and do not create a nested worktree. |")
    expect(skill).toContain("from this skill's loaded `SKILL.md` directory")
    expect(skill).toContain("never glob the target repository")
    expect(skill).toContain("continuing natively")
    expect(evalPack).toContain("If that path is unavailable, block before any implementation write")
    expect(evalPack).not.toContain("If that path is unavailable, disclose the unavailable route")
  })
})

describe("ce-work implementation evidence characterization", () => {
  test("loads the extracted protocol only at the implementation gate", async () => {
    const skill = await readRepoFile("skills/ce-work/SKILL.md")
    const implementationLoop = await readRepoFile("skills/ce-work/references/implementation-loop.md")
    const phase2 = sliceSection(skill, "### Phase 2: Execute", "### Phase 3-4: Quality Check and Finishing Work")

    expect(phase2).toContain("read `references/implementation-loop.md`")
    // Incremental commits moved into the loop reference the body mandates at this gate.
    expect(implementationLoop).toContain("2. **Incremental Commits**")
    expect(phase2).not.toContain("2. **Incremental Commits**")
    expect(skill).not.toContain("1. **Task Execution Loop**")
    expect(skill).not.toContain("**Evidence Strategy** — Test discovery decides where proof belongs")
    expect(implementationLoop).toContain("1. **Task Execution Loop**")
    expect(implementationLoop).toContain("**Evidence Strategy** — Test discovery decides where proof belongs")
  })

  test("retains every task evidence and verification stop across relocation", async () => {
    const contract = await readImplementationContract()
    const orderedStops = [
      "Mark task as in-progress",
      "Choose the evidence strategy for this task before changing behavior",
      "verify the expected failure or baseline capture before changing production code",
      "Implement following existing conventions",
      "Run System-Wide Test Check",
      "Run tests after changes",
      "Assess testing coverage",
      "Record verification evidence for the task",
      "Mark task as completed",
      "Evaluate for incremental commit",
    ]

    let previous = -1
    for (const stop of orderedStops) {
      const current = contract.indexOf(stop)
      expect(current, `missing implementation stop: ${stop}`).toBeGreaterThan(previous)
      previous = current
    }

    expect(contract).toContain("Guardrails for execution evidence:")
    expect(contract).toContain("**Test Discovery**")
    expect(contract).toContain("**Evidence Strategy**")
    expect(contract).toContain("**Test Scenario Completeness**")
    expect(contract).toContain("**System-Wide Test Check**")
  })
})

// 2026-08-22: small work sized by ce-plan in the same session is executed, not
// re-planned, and a mechanical diff ships without a post-PR watch.
describe("ce-work right-sized routes", () => {
  test("kernel decides the Trivial/mechanical route before the first reference read", async () => {
    const skill = await readRepoFile("skills/ce-work/SKILL.md")
    expect(skill).toMatch(/A bare prompt that is Trivial[^.]*skips the task list/)
    expect(skill).toMatch(/purely mechanical diff also ships without a post-PR watch/)
    expect(skill).toMatch(/never as a route back to `ce-plan` or `ce-brainstorm`/)
  })

  test("a mechanical diff passes babysit:off to the shipping skill, and the docs say the same", async () => {
    const shipping = await readRepoFile("skills/ce-work/references/shipping-workflow.md")
    expect(shipping).toMatch(/Code review: skipped \(mechanical diff\)`, also pass `babysit:off`/)
    const docs = await readRepoFile("docs/guides/ce-work.md")
    expect(docs).toMatch(/purely mechanical diff[^.]*ships without a post-PR watch/)
    expect(docs).not.toMatch(/Trivial route skips the task list and the post-PR watch/)
  })

  test("session-carried resolution accepts an in-conversation brief and intake does not re-route sized prompts", async () => {
    const triage = await readTriage()
    expect(triage).toMatch(/an in-conversation brief from `ce-plan`/)
    const intake = await readRepoFile("skills/ce-work/references/work-intake.md")
    expect(intake).toMatch(/Unless `ce-plan` already sized this prompt in this session/)
  })
})
