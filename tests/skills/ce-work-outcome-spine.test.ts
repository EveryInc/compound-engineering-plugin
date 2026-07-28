import { readFile } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"

async function readRepoFile(relativePath: string): Promise<string> {
  return readFile(path.join(process.cwd(), relativePath), "utf8")
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
    const outcome = sliceSection(skill, "## Outcome", "## Input Document")

    expect(outcome).toContain("**Result:**")
    expect(outcome).toContain("**Next consumer:**")
    expect(outcome).toContain("**Done:**")
    expect(outcome).toContain("**Intent:**")
    expect(outcome).toContain("host orchestrator")
    expect(outcome).toContain("authoritative verification and canonical commits")
    expect(skill.indexOf("## Outcome")).toBeLessThan(skill.indexOf("## Execution Workflow"))
  })

  test("classifies caller mode, legacy aliases, bare prompts, and plans before execution", async () => {
    const skill = await readRepoFile("skills/ce-work/SKILL.md")
    const triage = sliceSection(skill, "### Phase 0: Input Triage", "### Phase 1: Quick Start")

    expect(triage).toContain("**Otherwise, parse a leading mode token.**")
    expect(triage).toContain("mode:return-to-caller")
    expect(triage).toContain("mode:caller-owned-tail")
    expect(triage).toContain("caller:lfg")
    expect(triage).toContain("**Plan document**")
    expect(triage).toContain("**Resolve a session-carried plan before blank or bare-prompt classification.**")
    expect(skill).toContain("Invocation origin is not observable or relevant")
    expect(triage).toContain("**Blank invocation latest-plan discovery:**")
    expect(triage).toContain("**Bare prompt**")
    expect(triage).toContain("skip only the task list")
    expect(triage).toContain("mandatory engine-resolution gate")
  })

  test("activates direct recovery before ordinary input classification", async () => {
    const skill = await readRepoFile("skills/ce-work/SKILL.md")
    const triage = sliceSection(skill, "### Phase 0: Input Triage", "### Phase 1: Quick Start")

    expect(triage).toContain("**Recovery activation comes first.**")
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
    const engineGate = sliceSection(skill, "4. **Choose Execution Engine, then Strategy**", "### Phase 2: Execute")

    expect(engineGate).toContain("inline/subagent")
    expect(engineGate).toContain("goal-mode")
    expect(engineGate).toContain("dynamic-workflow")
    expect(engineGate).toMatch(/\*\*Inline\*\* \| Trivial work/)
    expect(engineGate).toContain("ordinary native workers")
    expect(engineGate).toContain("never run `git worktree add` yourself")
    expect(engineGate).toContain("external cross-model controller")
  })

  test("bounds worker scope while leaving canonical verification and commits with the orchestrator", async () => {
    const skill = await readRepoFile("skills/ce-work/SKILL.md")
    const dispatch = sliceSection(skill, "**Native dispatch (inline/subagent engines only)**", "### Phase 2: Execute")

    expect(dispatch).toContain("**bounded unit packet**")
    expect(dispatch).toContain("A downstream worker may narrow that unit and authority, never broaden either")
    expect(dispatch).toContain("Do not send \"read the whole plan\"")
    expect(dispatch).toContain("**Do not commit.**")
    expect(dispatch).toContain("**orchestrator owns staging, committing, and the authoritative test runs**")
    expect(dispatch).toContain("Review, test, and commit each unit in dependency order — the orchestrator owns commits")
  })

  test("does not re-enter native dispatch after selecting cross-model execution", async () => {
    const skill = await readRepoFile("skills/ce-work/SKILL.md")
    const engineGate = sliceSection(skill, "4. **Choose Execution Engine, then Strategy**", "### Phase 2: Execute")

    expect(engineGate).toContain("**Native dispatch (inline/subagent engines only)**")
    expect(engineGate).toContain("must not re-enter this ordinary subagent dispatch")
    expect(engineGate).toContain("**A successful controller `init` locks that unit to the selected cross-model engine.**")
    expect(engineGate).toContain("Never reclassify it as trivial, abandon it for speed, or implement it natively")
    expect(engineGate).toContain("**After each serial inline/subagent unit:**")
    expect(engineGate).toContain("**After a parallel inline/subagent batch")
  })

  test("preserves standalone shipping and return-to-caller tail ownership", async () => {
    const skill = await readRepoFile("skills/ce-work/SKILL.md")
    const standalone = sliceSection(skill, "### Phase 3-4: Quality Check and Finishing Work", "## Return-to-Caller Mode")
    const caller = sliceSection(skill, "## Return-to-Caller Mode", "## Key Principles")

    expect(standalone).toContain("references/shipping-workflow.md")
    expect(caller).toContain("implementation and local verification only")
    expect(caller).toContain("structured summary instead of running the standalone shipping tail")
    expect(caller).toContain("standalone_shipping_skipped: true")
    expect(caller).toContain("must not open a PR")
  })
})

describe("ce-work cross-model engine contract", () => {
  test("resolves live routing intent and ordered harness/model preferences", async () => {
    const skill = await readRepoFile("skills/ce-work/SKILL.md")
    const engines = await readRepoFile("skills/ce-work/references/execution-engines.md")
    const engineGate = sliceSection(skill, "4. **Choose Execution Engine, then Strategy**", "### Phase 2: Execute")

    expect(engineGate).toContain("cross-model execution")
    expect(engineGate).toContain("native execution remains the default")
    expect(engineGate).toContain("Route resolution is a mandatory pre-write gate")
    expect(engineGate).toContain(".compound-engineering/config.local.yaml")
    expect(engineGate).toContain("Do not infer native execution merely because no typed carrier was supplied")
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

    expect(skill).toContain("private **bounded implementation brief**")
    expect(skill).toContain("Do not send raw conversation history")
    expect(skill).toContain("clarify or route to `ce-plan` before any cross-model egress")
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
    const triage = sliceSection(skill, "### Phase 0: Input Triage", "### Phase 1: Quick Start")

    expect(triage).toContain("Every non-recovery code path must resolve its implementation engine before execution")
    expect(triage).toContain("carrierless Return-to-Caller Mode")
    expect(triage).toContain(".compound-engineering/config.local.yaml")
    expect(triage).toContain("pre-controller discovery is read-only")
    expect(triage).toContain("Do not run baseline, test, build, format, install, or generation commands")
    expect(triage).toContain("prove the canonical Git snapshot is byte-for-byte unchanged")
  })

  test("keeps the caller carrier implementation-only and exactly four fields", async () => {
    const engines = await readRepoFile("skills/ce-work/references/execution-engines.md")
    const carrier = sliceSection(engines, "### Typed caller binding", "### Target and identity vocabulary")

    expect(carrier).toContain("implementation_engine")
    for (const field of ["mode", "target", "model", "source"]) {
      expect(carrier).toContain(`\`${field}\``)
    }
    expect(carrier).toContain("exactly these four fields")
    expect(carrier).toContain("mode:return-to-caller implementation_engine:<compact-json> <plan-path>")
    expect(carrier).toContain('implementation_engine:{"mode":"prefer","target":"codex","model":null,"source":"lfg-current-turn"}')
    expect(carrier).toContain("only at the `ce-work` seam")
    expect(carrier).toContain("never enter planning or review input")
    expect(engines).not.toContain("work_delegate_")
  })

  test("preserves ordered LFG intent without truncating the scalar carrier", async () => {
    const lfg = await readRepoFile("skills/lfg/SKILL.md")

    expect(lfg).toContain("ordered fallback list")
    expect(lfg).toContain("do not truncate it to the scalar carrier")
    expect(lfg).toContain("retain the whole ordered assignment as current-task implementation intent")
    expect(lfg).toContain("pass no `implementation_engine:` object")
    expect(lfg).toContain("host cannot preserve that context")
    expect(lfg).toContain("routing-carrier blocker")
  })

  test("gives string-only callers an exact optional carrier grammar", async () => {
    const skill = await readRepoFile("skills/ce-work/SKILL.md")
    const phase0 = sliceSection(skill, "### Phase 0: Input Triage", "**Plan document**")

    expect(phase0).toContain("implementation_engine:")
    expect(phase0).toContain("one compact JSON object")
    expect(phase0).toContain("exactly `mode`, `target`, `model`, and `source`")
    expect(phase0).toContain("implementation_run:<safe-id>")
    expect(phase0).toContain("`^[A-Za-z0-9._-]{1,128}$`")
    expect(phase0).toContain("Reject malformed JSON, missing/extra fields, an unsafe run id, or a duplicate carrier")
    expect(phase0).toContain("entire remaining string is the plan path")
    expect(phase0).toContain("original `mode:return-to-caller <plan-path>` form is unchanged")
  })

  test("keeps external dispatch policy out of the implementation-worker persona", async () => {
    const worker = await readRepoFile("skills/ce-work/references/agents/implementation-worker.md")

    expect(worker).toContain("caller, unit packet, and controller own dispatch")
    expect(worker).toContain("Implement exactly the supplied implementation unit")
    expect(worker).toContain("Before returning `completed`")
    expect(worker).toContain("complete Git delta")
    expect(worker).toContain("disposable artifacts created by your own checks")
    expect(worker).toContain("every remaining changed path")
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
    expect(protocol).toContain("`codex`, `claude`, `grok-cli`, `cursor`, `composer`, or `grok-cursor`")
  })

  test("defines prefer, require, fixed-recipient sanction, and restriction failure", async () => {
    const protocol = await readRepoFile("skills/ce-work/references/cross-model-execution.md")

    expect(protocol).toContain("Preference-strength")
    expect(protocol).toContain("Requirement-strength")
    expect(protocol).toContain("automatic or headless")
    expect(protocol).toContain("must not prompt")
    expect(protocol).toContain("fixed recipient")
    expect(protocol).toContain("every intermediary")
    expect(protocol).toContain("material exposed")
    expect(protocol).toContain("caller restrictions")
    expect(protocol).toContain("required restriction")
    expect(protocol).toContain("route unavailable")
    expect(protocol).toContain("never switch recipients")
  })

  test("preserves host-only canonical authority and narrows the worktree exception", async () => {
    const skill = await readRepoFile("skills/ce-work/SKILL.md")
    const protocol = await readRepoFile("skills/ce-work/references/cross-model-execution.md")
    const engineGate = sliceSection(skill, "4. **Choose Execution Engine, then Strategy**", "### Phase 2: Execute")

    expect(engineGate).toContain("ordinary native workers")
    expect(engineGate).toContain("external cross-model controller")
    expect(protocol).toContain("isolated transport commit")
    expect(protocol).toContain("host-only canonical")
    for (const forbiddenAuthority of ["canonical commit", "push", "PR", "shipping", "recipient-switch"]) {
      expect(protocol).toContain(forbiddenAuthority)
    }
    expect(protocol).toContain("may narrow")
    expect(protocol).toContain("never broaden")
  })

  test("loads the cross-model protocol only for selected execution or recovery", async () => {
    const skill = await readRepoFile("skills/ce-work/SKILL.md")
    const engineGate = sliceSection(skill, "4. **Choose Execution Engine, then Strategy**", "### Phase 2: Execute")
    const triage = sliceSection(skill, "### Phase 0: Input Triage", "**Plan document**")

    expect(engineGate).toContain("If and only if cross-model execution is selected")
    expect(engineGate).toContain("read `references/cross-model-execution.md`")
    expect(triage.match(/references\/cross-model-execution\.md/g)?.length).toBe(2)
    expect(skill.match(/references\/cross-model-execution\.md/g)?.length).toBe(3)
  })

  test("returns requested and actual route, model, fallback, run, unit, blocker, and recovery receipts", async () => {
    const skill = await readRepoFile("skills/ce-work/SKILL.md")
    const caller = sliceSection(skill, "## Return-to-Caller Mode", "## Key Principles")

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
    expect(serial).toContain("new verification artifacts")
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
    expect(serial).toContain("restores verification-created canonical artifacts")
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
    expect(protocol).toContain("exactly one native fallback")
    expect(protocol).toContain("FALLBACK_ALREADY_AUTHORIZED")
    expect(protocol).toContain("FALLBACK_COMPLETED")
    expect(protocol).toContain("`RUN_VERIFIED`")
    expect(protocol).toContain("CHOICE_REQUIRED")
    expect(protocol).toContain("headless `require` remains blocked")
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
    const gate = sliceSection(skill, "**Parallel Safety Check**", "**Native dispatch (inline/subagent engines only)**")

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
    for (let fixture = 1; fixture <= 39; fixture += 1) {
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
      "strict alternate matrix",
      "post-init recipient lock",
      "sibling-clone recovery isolation",
      "plugin-bundled reference load",
      "incremental idle window",
    ]) {
      expect(evalPack).toContain(seam)
    }
    expect(evalPack).toContain("| E20 linked-checkout sibling | CE Work is itself running in an existing linked worktree and selects external implementation for one unit | Create a new detached **sibling** through the repository's shared Git common directory, place it under `/tmp/compound-engineering-<effective-uid>/ce-work/<run-id>/` rather than beneath the active checkout, base it at the recorded clean canonical SHA, and keep canonical fold-in host-owned. Do not reject the route merely because the active checkout is already a worktree, and do not create a nested worktree. |")
    expect(skill).toContain("from this skill's loaded `SKILL.md` directory")
    expect(skill).toContain("never glob the target repository")
    expect(skill).toContain("continuing natively")
  })
})

describe("ce-work implementation evidence characterization", () => {
  test("loads the extracted protocol only at the implementation gate", async () => {
    const skill = await readRepoFile("skills/ce-work/SKILL.md")
    const implementationLoop = await readRepoFile("skills/ce-work/references/implementation-loop.md")
    const phase2 = sliceSection(skill, "### Phase 2: Execute", "### Phase 3-4: Quality Check and Finishing Work")

    expect(phase2).toContain("you must read `references/implementation-loop.md`")
    expect(phase2.indexOf("references/implementation-loop.md")).toBeLessThan(phase2.indexOf("2. **Incremental Commits**"))
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
