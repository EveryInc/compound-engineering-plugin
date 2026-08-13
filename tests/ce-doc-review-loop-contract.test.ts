import { readFile } from "fs/promises"
import { chmodSync, existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "fs"
import { spawnSync } from "child_process"
import { tmpdir } from "os"
import path from "path"
import { describe, expect, test } from "bun:test"

const skillPath = path.join(process.cwd(), "skills/ce-doc-review-loop/SKILL.md")
const protocolPath = path.join(process.cwd(), "skills/ce-doc-review-loop/references/loop-protocol.md")
const helperPath = path.join(process.cwd(), "skills/ce-doc-review-loop/scripts/loop-state.mjs")

function runHelper(args: string[], env: Record<string, string> = {}) {
  return spawnSync("node", [helperPath, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...env },
  })
}

function helperResult(args: string[], env: Record<string, string> = {}) {
  const result = runHelper(args, env)
  expect(result.stderr).toBe("")
  expect(result.stdout.trim()).not.toBe("")
  return { process: result, body: JSON.parse(result.stdout) as Record<string, unknown> }
}

// Optional generated Chinese views. They restate normative content, so when they
// exist they must not drift from the source they were rendered from.
const zhSkillPath = path.join(process.cwd(), "docs/skills/ce-doc-review-loop-skill.zh-CN.html")
const zhProtocolPath = path.join(process.cwd(), "docs/skills/ce-doc-review-loop-protocol.zh-CN.html")

function capture(body: string, pattern: RegExp): string {
  const match = body.match(pattern)
  expect(match, `source no longer matches ${pattern}`).not.toBeNull()
  return match![1]
}

function section(body: string, start: string, end: string): string {
  const from = body.indexOf(start)
  const to = body.indexOf(end, from + start.length)
  expect(from).toBeGreaterThanOrEqual(0)
  expect(to).toBeGreaterThan(from)
  return body.slice(from, to)
}

describe("ce-doc-review-loop contract", () => {
  test("delegates every review wave to canonical ce-doc-review", async () => {
    const skill = await readFile(skillPath, "utf8")
    const workflow = section(skill, "## Workflow", "## Interaction Rules")

    expect(skill).toContain("name: ce-doc-review-loop")
    expect(skill).toContain("REQUIRED SUB-SKILL")
    expect(workflow).toContain("callable skill mechanism")
    expect(workflow).toContain("not a substitute")
    expect(workflow).toContain("skill_unreachable")
  })

  test("separates callable sub-skill invocation from user-facing handoff syntax", async () => {
    const protocol = await readFile(protocolPath, "utf8")
    const pass1 = section(protocol, "## Pass 1", "## Pass 2")

    expect(pass1).toContain("internal invocation channel")
    expect(pass1).toContain("user-facing handoff text")
    expect(pass1).toMatch(/never execute `\/ce-doc-review`/i)
    expect(pass1).toContain("invocation_adapter_error")
    expect(pass1).toContain("is not evidence that the skill is unregistered")
  })

  test("prepares contract coverage before the first review wave", async () => {
    const protocol = await readFile(protocolPath, "utf8")
    const wave0 = section(protocol, "## Wave 0", "## Pass 1")
    const firstPass = section(protocol, "## Pass 1", "## Pass 2")

    expect(wave0).toContain("Contract Matrix")
    expect(wave0).toContain("Change-Impact Graph")
    expect(wave0).toContain("stable vertical slices")
    expect(wave0).toContain("proof obligations")
    expect(firstPass).toContain("Invoke `ce-doc-review mode:non-interactive")
    expect(protocol.indexOf("## Wave 0")).toBeLessThan(protocol.indexOf("## Pass 1"))
  })

  test("uses bounded remediation neighborhoods instead of blind global repetition", async () => {
    const protocol = await readFile(protocolPath, "utf8")
    const remediation = section(protocol, "## Pass 2", "## Subsequent Waves")

    expect(remediation).toContain("defect family")
    expect(remediation).toContain("Remediation Neighborhood")
    expect(remediation).toContain("scratch packet")
    expect(remediation).toContain("work unit")
  })

  test("does not duplicate review-engine edits and bounds every loop unit", async () => {
    const skill = await readFile(skillPath, "utf8")
    const protocol = await readFile(protocolPath, "utf8")

    expect(skill).toMatch(/Observe and record `safe_auto`[\s\S]*never apply them a second time/)
    expect(protocol).toMatch(/`safe_auto` edits[\s\S]*Never reproduce those internals/)
    expect(skill).toContain("One work unit is either one global `ce-doc-review` wave or one defect-family remediation cycle")
    expect(protocol).toMatch(/each global `ce-doc-review` wave[\s\S]*each defect-family remediation cycle consumes one unit/)
  })

  test("keeps unavailable proof and unaskable decisions non-converged", async () => {
    const skill = await readFile(skillPath, "utf8")
    const interaction = section(skill, "## Interaction Rules", "## Circuit Breaker")
    const finalGate = section(
      await readFile(protocolPath, "utf8"),
      "## Final Convergence Gate",
      "## Quick Reference",
    )

    expect(interaction).toContain("Non-interactive loop")
    expect(interaction).toContain("numbered choices")
    expect(interaction).toContain("cannot pause")
    expect(interaction).toContain("Non-converged")
    expect(finalGate).toContain("user-accepted `accepted_residual`")
    expect(finalGate).toContain("non-waivable")
  })

  test("requires one fail-closed receipt for the unchanged final snapshot", async () => {
    const skill = await readFile(skillPath, "utf8")
    const protocol = await readFile(protocolPath, "utf8")
    const finalGate = section(protocol, "## Final Convergence Gate", "## Quick Reference")

    expect(finalGate).toContain("final fingerprint")
    expect(finalGate).toContain("zero material findings")
    expect(finalGate).toContain("zero document-changing fixes")
    expect(finalGate).toContain("Every required in-process reviewer selected by the canonical receipt completed")
    expect(finalGate).toContain("failed, timed out, or returned malformed output")
    expect(finalGate).toContain("reviewed SHA-256 fingerprint and result fingerprint")
    expect(finalGate).toMatch(/Any edit invalidates[\s\S]*requires another fresh final gate/)
    expect(skill).toContain("Non-converged")

    // A zero-fix Pass 1 already reviewed the final bytes; forcing a second
    // identical wave costs a full persona dispatch and buys no evidence.
    expect(finalGate).toContain("may instead be the Pass 1 wave itself")
    expect(finalGate).toContain("only when Pass 1 applied no fixes")
    // ...but the carve-out must never soften the any-edit rule.
    expect(finalGate).toContain("can never be its own gate")
    expect(finalGate).toMatch(/Any edit invalidates[\s\S]*requires another fresh final gate/)
  })

  test("uses max-work-units only as a work-unit circuit breaker", async () => {
    const skill = await readFile(skillPath, "utf8")
    const protocol = await readFile(protocolPath, "utf8")
    const finalGate = section(protocol, "## Final Convergence Gate", "## Quick Reference")

    expect(skill).toContain("`max-work-units:N`")
    expect(skill).toContain("Default: `16`")
    expect(skill).toContain("integer of 2 or greater")
    expect(skill).toContain("no upper bound")
    expect(finalGate).toContain("`max-work-units` is the circuit breaker")
    expect(finalGate).toContain("global `ce-doc-review` wave")
    expect(finalGate).toContain("defect-family remediation cycle")
    expect(finalGate).toContain("Non-converged")
  })

  test("pins the machine-readable caller contract", async () => {
    const skill = await readFile(skillPath, "utf8")
    const input = section(skill, "## Input and Mode", "## Workflow")

    for (const code of ["missing_document_path", "invalid_max_work_units", "unsupported_document_format"]) {
      expect(input).toContain(`input: ${code}`)
    }

    // Always pass mode:non-interactive; only loop-owned flags are stripped.
    expect(input).toContain("always pass `mode:non-interactive`")

    const success = section(skill, "Review loop converged", "```")
    for (const field of [
      "Final snapshot: unchanged after review",
      "zero material findings, zero document-changing fixes",
      "Accepted residuals:",
    ]) {
      expect(success).toContain(field)
    }

    const nonConverged = section(skill, "Non-converged\nDocument:", "## Completion Output")
    for (const field of ["loop_protocol:", "ce-doc-review:", "Next bounded wave:"]) {
      expect(nonConverged).toContain(field)
    }
  })

  test("uses the bundled portable mechanics helper", async () => {
    const protocol = await readFile(protocolPath, "utf8")
    const mechanics = section(protocol, "## Mechanics", "## Wave 0")

    expect(mechanics).toContain('SKILL_DIR="<absolute path of the directory containing the SKILL.md you just read>";')
    expect(mechanics).toContain("for c in node nodejs")
    expect(mechanics).toContain('"$NODE" "$SKILL_DIR/scripts/loop-state.mjs" <operation and arguments>')
    for (const operation of [
      'fingerprint --path "<path>"',
      "init-run",
      'resolve-target --product "<product>"',
      'commit --product "<product>"',
    ]) expect(mechanics).toContain(operation)
    expect(mechanics).toContain("expected-realpath")
    expect(mechanics).toContain("expected-dev")
    expect(mechanics).toContain("expected-ino")
    expect(mechanics).toContain("concurrent_change")
    expect(mechanics).toContain("never adopt an existing run directory")
    expect(mechanics).not.toMatch(/shasum|sha256sum|readlink -f|mktemp|mv -f/)

    for (const fence of mechanics.matchAll(/```bash\n([\s\S]*?)```/g)) {
      expect(fence[1]).not.toMatch(/(?:^|\s)(?:cat|mv|shasum|sha256sum|mktemp)(?:\s|$)/)
    }
  })

  test("gives an unreachable sub-skill a user-runnable exit", async () => {
    const protocol = await readFile(protocolPath, "utf8")
    const skill = await readFile(skillPath, "utf8")
    const pass1 = section(protocol, "## Pass 1", "## Pass 2")

    // Fail-closed is right, but stopping dead with no handoff is not.
    expect(pass1).toContain("/ce-doc-review mode:non-interactive <product-path>")
    expect(pass1).toContain("only when the active harness is Codex")
    expect(pass1).toContain("do not execute it")
    expect(skill).toContain("copyable ce-doc-review handoff when the skill is unreachable or the invocation adapter fails")
    // Pre-Wave-0 exits have no slice and no unreachable skill; they need their own route.
    expect(skill).toContain("the corrected invocation when Input is not valid")
    expect(skill).toContain("ce-doc-review: <complete, integrity_failure, skill_unreachable, invocation_adapter_error, or not_run>")
  })

  test("separates integrity failures from coverage gaps", async () => {
    const protocol = await readFile(protocolPath, "utf8")
    const pass1 = section(protocol, "## Pass 1", "## Pass 2")

    expect(pass1).toContain("**Integrity failure**")
    expect(pass1).toContain("**Coverage gap**")
    // Untrusted bytes must never reach the product path.
    expect(pass1).toMatch(/Integrity failure[\s\S]{0,400}never touch the product path/)
    // The partition must not swallow optional peers, whose failure is report-only.
    expect(pass1).toContain("An optional cross-model peer failure is neither")
    // Enumerating failure modes missed "selected but never reported at all".
    expect(pass1).toContain("absent from `completed_reviewers`")
    // A committed wave can still be unclean.
    expect(pass1).toMatch(/Coverage gap[\s\S]{0,400}never let it satisfy the final gate/)
  })

  test("generated zh-CN views do not drift from the source", async () => {
    const [skill, protocol] = await Promise.all([
      readFile(skillPath, "utf8"),
      readFile(protocolPath, "utf8"),
    ])

    // Values are derived from the source, so changing the source fails this
    // test until the view is regenerated.
    const defaultUnits = capture(skill, /Optional `max-work-units:N` sets a circuit breaker\. Default: `(\d+)`/)
    const lowUnits = capture(skill, /integer of (\d+) or greater/)
    if (existsSync(zhSkillPath)) {
      const zhSkill = await readFile(zhSkillPath, "utf8")
      expect(zhSkill).toContain(`默认 ${defaultUnits}`)
      expect(zhSkill).toContain(`大于等于 ${lowUnits} 的整数，且不设上限`)
      for (const literal of [
        "Review loop converged",
        "Non-converged",
        "input: missing_document_path",
        "input: invalid_max_work_units",
        "input: unsupported_document_format",
        "ce-doc-review: skill_unreachable",
        "invocation_adapter_error",
      ]) {
        expect(zhSkill, `${literal} missing from the zh-CN skill view`).toContain(literal)
      }
    }

    if (existsSync(zhProtocolPath)) {
      const zhProtocol = await readFile(zhProtocolPath, "utf8")
      for (const literal of [
        "scripts/loop-state.mjs",
        "fingerprint --path",
        "init-run",
        "resolve-target --product",
        "expected-fingerprint",
        "expected-realpath",
        "expected-dev",
        "expected-ino",
        "concurrent_change",
      ]) {
        expect(zhProtocol, `${literal} missing from the zh-CN protocol view`).toContain(literal)
      }
    }
  })

  test("the helper fingerprints raw bytes and creates a private fresh run", () => {
    const work = mkdtempSync(path.join(tmpdir(), "loop-helper-"))
    try {
      const doc = path.join(work, "doc.md")
      const stateBase = path.join(work, "state")
      const snapshotBase = path.join(work, "snapshots")
      writeFileSync(doc, "hello\n")

      const fingerprint = helperResult(["fingerprint", "--path", doc])
      expect(fingerprint.process.status).toBe(0)
      expect(fingerprint.body.sha256).toMatch(/^[0-9a-f]{64}$/)

      const init = helperResult(["init-run"], {
        CE_DOC_REVIEW_LOOP_STATE_BASE: stateBase,
        CE_DOC_REVIEW_LOOP_SNAPSHOT_BASE: snapshotBase,
      })
      expect(init.process.status).toBe(0)
      expect(init.body.status).toBe("ok")
      const runDir = String(init.body.run_dir)
      const snapshotDir = String(init.body.snapshot_dir)
      expect(statSync(runDir).mode & 0o777).toBe(0o700)
      expect(statSync(snapshotDir).mode & 0o777).toBe(0o700)
      expect(path.dirname(String(init.body.state_path))).toBe(runDir)

      const second = helperResult(["init-run"], {
        CE_DOC_REVIEW_LOOP_STATE_BASE: stateBase,
        CE_DOC_REVIEW_LOOP_SNAPSHOT_BASE: snapshotBase,
      })
      expect(second.body.run_id).not.toBe(init.body.run_id)
      expect(second.body.run_dir).not.toBe(init.body.run_dir)
    } finally {
      rmSync(work, { recursive: true, force: true })
    }
  })

  test("the helper rejects a symlinked state root", () => {
    const work = mkdtempSync(path.join(tmpdir(), "loop-state-root-"))
    try {
      const realRoot = path.join(work, "real-root")
      const linkedRoot = path.join(work, "linked-root")
      const mkdir = spawnSync("node", ["-e", "require('fs').mkdirSync(process.argv[1])", realRoot], { encoding: "utf8" })
      expect(mkdir.status).toBe(0)
      symlinkSync("real-root", linkedRoot)

      const init = helperResult(["init-run"], {
        CE_DOC_REVIEW_LOOP_STATE_BASE: linkedRoot,
        CE_DOC_REVIEW_LOOP_SNAPSHOT_BASE: path.join(work, "snapshots"),
      })
      expect(init.process.status).toBe(1)
      expect(init.body.status).toBe("error")
      expect(String(init.body.message)).toContain("symlink")
      expect(readdirSync(realRoot)).toEqual([])
    } finally {
      rmSync(work, { recursive: true, force: true })
    }
  })

  test("the helper commits through a symlink and preserves target mode", () => {
    const work = mkdtempSync(path.join(tmpdir(), "loop-commit-"))
    try {
      const target = path.join(work, "AGENTS.md")
      const product = path.join(work, "CLAUDE.md")
      const validated = path.join(work, "validated.md")
      writeFileSync(target, "# Real\n\nbefore\n")
      chmodSync(target, 0o640)
      symlinkSync("AGENTS.md", product)
      writeFileSync(validated, "# Real\n\nafter\n")

      const resolved = helperResult(["resolve-target", "--product", product]).body
      const committed = helperResult([
        "commit",
        "--product", product,
        "--validated", validated,
        "--expected-fingerprint", String(resolved.sha256),
        "--expected-realpath", String(resolved.realpath),
        "--expected-dev", String(resolved.dev),
        "--expected-ino", String(resolved.ino),
      ])
      expect(committed.process.status).toBe(0)
      expect(committed.body.status).toBe("committed")
      expect(lstatSync(product).isSymbolicLink()).toBe(true)
      expect(readFileSync(target, "utf8")).toContain("after")
      expect(statSync(target).mode & 0o777).toBe(0o640)
      expect(readdirSync(work).filter((file) => file.startsWith(".ce-doc-review-loop-commit-"))).toEqual([])
    } finally {
      rmSync(work, { recursive: true, force: true })
    }
  })

  test("the helper rejects concurrent byte and target identity changes", () => {
    const work = mkdtempSync(path.join(tmpdir(), "loop-race-"))
    try {
      const targetA = path.join(work, "target-a.md")
      const targetB = path.join(work, "target-b.md")
      const product = path.join(work, "product.md")
      const validated = path.join(work, "validated.md")
      writeFileSync(targetA, "before-a\n")
      writeFileSync(targetB, "before-b\n")
      symlinkSync("target-a.md", product)
      writeFileSync(validated, "validated\n")

      const first = helperResult(["resolve-target", "--product", product]).body
      writeFileSync(targetA, "concurrent\n")
      const byteRace = helperResult([
        "commit", "--product", product, "--validated", validated,
        "--expected-fingerprint", String(first.sha256),
        "--expected-realpath", String(first.realpath),
        "--expected-dev", String(first.dev),
        "--expected-ino", String(first.ino),
      ])
      expect(byteRace.process.status).toBe(3)
      expect(byteRace.body.status).toBe("concurrent_change")
      expect(readFileSync(targetA, "utf8")).toBe("concurrent\n")

      const second = helperResult(["resolve-target", "--product", product]).body
      rmSync(product)
      symlinkSync("target-b.md", product)
      const identityRace = helperResult([
        "commit", "--product", product, "--validated", validated,
        "--expected-fingerprint", String(second.sha256),
        "--expected-realpath", String(second.realpath),
        "--expected-dev", String(second.dev),
        "--expected-ino", String(second.ino),
      ])
      expect(identityRace.process.status).toBe(3)
      expect(identityRace.body.status).toBe("concurrent_change")
      expect(readFileSync(targetB, "utf8")).toBe("before-b\n")
      expect(readdirSync(work).filter((file) => file.startsWith(".ce-doc-review-loop-commit-"))).toEqual([])
    } finally {
      rmSync(work, { recursive: true, force: true })
    }
  })
})
