import { describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { gradeHost, parseTrailers } from "./grade"

describe("skill-eval-cell trailer parse", () => {
  test("keeps the last FILES_READ line (Grok narrates first)", () => {
    const t = parseTrailers("FILES_READ: SKILL.md\nmore\nFILES_READ: SKILL.md, references/tick.md\nACTIONS: none\n")
    expect(t?.files_read).toBe("SKILL.md, references/tick.md")
    expect(t?.actions).toBe("none")
  })

  test("returns null when no trailers exist", () => {
    expect(parseTrailers("just a report")).toBeNull()
  })

  test("stdout wins over a Codex stderr transcript that echoes the prompt", () => {
    const stdout = "Decision: stop.\nFILES_READ: SKILL.md\nACTIONS: none\nDELEGATES_DISPATCHED: none\n"
    const stderr = [
      "[2026-08-19] thinking",
      "FILES_READ: <comma-separated paths you read>",
      "ACTIONS: <comma-separated mutations you performed, or none>",
      "DELEGATES_DISPATCHED: <none or names>",
      "tokens used: 1234",
    ].join("\n")
    const t = parseTrailers(stdout, stderr)
    expect(t?.actions).toBe("none")
    expect(t?.files_read).toBe("SKILL.md")
  })

  test("falls back to stderr only when stdout carries no trailer", () => {
    const t = parseTrailers("no trailer here\n", "ACTIONS: git commit\n")
    expect(t?.actions).toBe("git commit")
  })

  test("a placeholder-only trailer is not an answer", () => {
    expect(parseTrailers("ACTIONS: <comma-separated mutations you performed, or none>\n")).toBeNull()
  })
})

describe("skill-eval-cell host grade", () => {
  function hostDir(files: Record<string, string>): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ce-grade-"))
    fs.mkdirSync(path.join(dir, "workspace"), { recursive: true })
    for (const [rel, body] of Object.entries(files)) {
      const dest = path.join(dir, rel)
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      fs.writeFileSync(dest, body)
    }
    return dir
  }

  test("must_exclude looks at ACTIONS, not an explanation in the essay", () => {
    const dir = hostDir({
      "stdout.txt":
        "I will not run git add -A.\nACTIONS: none\nFILES_READ: SKILL.md\nDELEGATES_DISPATCHED: none\n",
    })
    const g = gradeHost({
      host: "claude",
      hostDir: dir,
      arm: "pre",
      grade: { must_exclude: ["git add -A"], actions: "none" },
    })
    expect(g.ok).toBe(true)
  })

  test("must_exclude fails when the forbidden command is in ACTIONS", () => {
    const dir = hostDir({
      "stdout.txt": "ACTIONS: git add -A, git commit\nFILES_READ: SKILL.md\n",
    })
    const g = gradeHost({
      host: "claude",
      hostDir: dir,
      arm: "pre",
      grade: { must_exclude: ["git add -A"] },
    })
    expect(g.ok).toBe(false)
    expect(g.reasons[0]).toContain("git add -A")
  })

  test("workspace_contains and committed_must_not inspect artifacts", () => {
    const dir = hostDir({
      "stdout.txt": "ACTIONS: git commit\n",
      "git-head-files.txt": "src/greet.js\n",
      "workspace/src/greet.js": "module.exports = { SEAT_CAP: 3 }\n",
    })
    const pass = gradeHost({
      host: "claude",
      hostDir: dir,
      arm: "pre",
      grade: {
        workspace_contains: [{ path: "src/greet.js", needle: "3" }],
        committed_must_not: [".env"],
      },
    })
    expect(pass.ok).toBe(true)
    fs.writeFileSync(path.join(dir, "git-head-files.txt"), "src/greet.js\n.env\n")
    const fail = gradeHost({
      host: "claude",
      hostDir: dir,
      arm: "pre",
      grade: { committed_must_not: [".env"] },
    })
    expect(fail.ok).toBe(false)
  })

  test("workspace_read fails when FILES_READ omits the fixture file", () => {
    const dir = hostDir({
      "stdout.txt": "What should retry cover?\nFILES_READ: SKILL.md, references/interaction-rules.md\nACTIONS: none\n",
    })
    const g = gradeHost({
      host: "claude",
      hostDir: dir,
      arm: "post",
      grade: {
        files_read_post: ["references/interaction-rules.md"],
        workspace_read: ["src/greet.js"],
      },
    })
    expect(g.ok).toBe(false)
    expect(g.reasons.some((r) => r.includes("src/greet.js"))).toBe(true)
  })

  test("workspace_read passes when FILES_READ names the fixture file", () => {
    const dir = hostDir({
      "stdout.txt":
        "What should retry cover?\nFILES_READ: SKILL.md, references/interaction-rules.md, src/greet.js\nACTIONS: none\n",
    })
    const g = gradeHost({
      host: "claude",
      hostDir: dir,
      arm: "post",
      grade: {
        files_read_post: ["references/interaction-rules.md"],
        workspace_read: ["src/greet.js"],
      },
    })
    expect(g.ok).toBe(true)
  })

  test("lookup-not-ask fails when the agent read greet.js but did not state the looked-up fact", () => {
    const dir = hostDir({
      "stdout.txt":
        "Does src/greet.js already retry?\nFILES_READ: SKILL.md, references/interaction-rules.md, src/greet.js\nACTIONS: none\n",
    })
    const g = gradeHost({
      host: "claude",
      hostDir: dir,
      arm: "post",
      grade: {
        files_read_post: ["references/interaction-rules.md"],
        workspace_read: ["src/greet.js"],
        must_include: ["does not retry"],
      },
    })
    expect(g.ok).toBe(false)
    expect(g.reasons.some((r) => r.includes("does not retry"))).toBe(true)
  })

  test("lookup-not-ask passes when the read and the looked-up fact both appear", () => {
    const dir = hostDir({
      "stdout.txt":
        "src/greet.js does not retry. Who sees failures?\nFILES_READ: SKILL.md, references/interaction-rules.md, src/greet.js\nACTIONS: none\n",
    })
    const g = gradeHost({
      host: "claude",
      hostDir: dir,
      arm: "post",
      grade: {
        files_read_post: ["references/interaction-rules.md"],
        workspace_read: ["src/greet.js"],
        must_include: ["does not retry"],
      },
    })
    expect(g.ok).toBe(true)
  })

  test("classification passes when the field value is exactly Keep", () => {
    const dir = hostDir({
      "stdout.txt": "## Classification: **Keep**\nPotential product regression affecting request_id.\n",
    })
    const g = gradeHost({
      host: "claude",
      hostDir: dir,
      arm: "post",
      grade: {
        classification: "Keep",
        must_include: ["potential product regression", "request_id"],
      },
    })
    expect(g.ok).toBe(true)
  })

  test("classification fails when a Replace value merely mentions Keep", () => {
    const dir = hostDir({
      "stdout.txt": "Classification: Replace — do not Keep\nPotential product regression affecting request_id.\n",
    })
    const g = gradeHost({
      host: "claude",
      hostDir: dir,
      arm: "post",
      grade: {
        classification: "Keep",
        must_include: ["potential product regression", "request_id"],
      },
    })
    expect(g.ok).toBe(false)
    expect(g.reasons).toContain(
      "expected Classification: Keep, got Replace — do not Keep",
    )
  })

  test("a roster probe fails when the run declared no TEAM trailer", () => {
    const dir = hostDir({
      "stdout.txt": "Reviewing with: coherence-reviewer, feasibility-reviewer\nFILES_READ: SKILL.md\nACTIONS: none\n",
    })
    const g = gradeHost({
      host: "claude",
      hostDir: dir,
      arm: "post",
      grade: { must_include: ["coherence-reviewer"], must_not_include: ["product-lens-reviewer"] },
    })
    expect(g.ok).toBe(false)
    expect(g.reasons).toContain("missing TEAM trailer")
  })

  test("must_not_include fails when the TEAM trailer names the forbidden roster member", () => {
    const dir = hostDir({
      "stdout.txt": "TEAM: coherence-reviewer, feasibility-reviewer, product-lens-reviewer\nFILES_READ: SKILL.md\nACTIONS: none\n",
    })
    const g = gradeHost({
      host: "claude",
      hostDir: dir,
      arm: "post",
      grade: { must_include: ["coherence-reviewer"], must_not_include: ["product-lens-reviewer"] },
    })
    expect(g.ok).toBe(false)
    expect(g.reasons.some((r) => r.includes("product-lens-reviewer"))).toBe(true)
  })

  test("a TEAM line scopes roster terms, so narration naming the forbidden persona does not fail", () => {
    const dir = hostDir({
      "stdout.txt":
        "product-lens-reviewer was not activated: the plan chooses mechanisms for an agreed outcome.\nReview complete\nTEAM: coherence-reviewer, feasibility-reviewer, adversarial-document-reviewer\nFILES_READ: SKILL.md\nACTIONS: none\n",
    })
    const g = gradeHost({
      host: "claude",
      hostDir: dir,
      arm: "post",
      grade: { must_include: ["coherence", "feasibility"], must_not_include: ["product-lens"] },
    })
    expect(g.ok).toBe(true)
  })

  test("a TEAM line that names the forbidden persona fails even when narration is clean", () => {
    const dir = hostDir({
      "stdout.txt": "Review complete\nTEAM: coherence-reviewer, feasibility-reviewer, product-lens-reviewer\nFILES_READ: SKILL.md\nACTIONS: none\n",
    })
    const g = gradeHost({
      host: "claude",
      hostDir: dir,
      arm: "post",
      grade: { must_include: ["coherence", "feasibility"], must_not_include: ["product-lens"] },
    })
    expect(g.ok).toBe(false)
  })

  test("must_not_include passes when the TEAM trailer omits the forbidden member", () => {
    const dir = hostDir({
      "stdout.txt": "TEAM: coherence-reviewer, feasibility-reviewer\nFILES_READ: SKILL.md\nACTIONS: none\n",
    })
    const g = gradeHost({
      host: "claude",
      hostDir: dir,
      arm: "post",
      grade: { must_include: ["coherence-reviewer"], must_not_include: ["product-lens-reviewer"] },
    })
    expect(g.ok).toBe(true)
  })

  test("a listed required read is a fail on post when FILES_READ omits it", () => {
    const dir = hostDir({
      "stdout.txt": "needs-human\nFILES_READ: SKILL.md\nACTIONS: none\n",
    })
    const g = gradeHost({
      host: "claude",
      hostDir: dir,
      arm: "post",
      grade: { files_read_post: ["references/phase-0.md"], must_include: ["needs-human"] },
    })
    expect(g.ok).toBe(false)
    expect(g.reasons.some((r) => r.includes("phase-0.md"))).toBe(true)
  })

  test("a required read matches the full path, not a shared basename", () => {
    const decoy = hostDir({
      "stdout.txt": "ok\nFILES_READ: docs/method.md\nACTIONS: none\n",
    })
    const g = gradeHost({
      host: "claude",
      hostDir: decoy,
      arm: "post",
      grade: { files_read_post: ["references/method.md"] },
    })
    expect(g.ok).toBe(false)

    const real = hostDir({
      "stdout.txt":
        "ok\nFILES_READ: /tmp/cell/skills/ce-pov/references/method.md, SKILL.md\nACTIONS: none\n",
    })
    const pass = gradeHost({
      host: "claude",
      hostDir: real,
      arm: "post",
      grade: { files_read_post: ["references/method.md"] },
    })
    expect(pass.ok).toBe(true)
  })

  test("must_include ignores skill text that only appears on stderr", () => {
    const dir = hostDir({
      "stdout.txt": "ACTIONS: none\nFILES_READ: SKILL.md\n",
      "stderr.txt": "Read skills/ce-debug/SKILL.md\nneeds-human is a status\n",
    })
    const g = gradeHost({
      host: "claude",
      hostDir: dir,
      arm: "pre",
      grade: { must_include: ["needs-human"] },
    })
    expect(g.ok).toBe(false)
  })

  test("must_include_field ignores a needle that only the trailers carry", () => {
    const dir = hostDir({
      "stdout.txt": [
        "OPENING: Sessions issued before an operator revokes them are still accepted.",
        "FILES_READ: src/session-stamp.js",
        "ACTIONS: git commit",
        "",
      ].join("\n"),
    })
    const g = gradeHost({
      host: "claude",
      hostDir: dir,
      arm: "pre",
      grade: { must_include: ["revo", "stamp"], must_include_field: "OPENING" },
    })
    expect(g.ok).toBe(false)
    expect(g.reasons).toEqual(["missing required text: stamp"])
  })

  test("must_include_field passes when the needle is in the field itself", () => {
    const dir = hostDir({
      "stdout.txt": [
        "OPENING: Adds the per-user stamp that later revocation checks compare against.",
        "FILES_READ: src/session-stamp.js",
        "ACTIONS: git commit",
        "",
      ].join("\n"),
    })
    const g = gradeHost({
      host: "claude",
      hostDir: dir,
      arm: "pre",
      grade: { must_include: ["revo", "stamp"], must_include_field: "OPENING" },
    })
    expect(g.ok).toBe(true)
  })

  test("must_include_field fails when the run never emitted the field", () => {
    const dir = hostDir({
      "stdout.txt": "FILES_READ: src/session-stamp.js\nACTIONS: created branch session-revocation-stamp\n",
    })
    const g = gradeHost({
      host: "claude",
      hostDir: dir,
      arm: "pre",
      grade: { must_include: ["revo", "stamp"], must_include_field: "OPENING" },
    })
    expect(g.ok).toBe(false)
    expect(g.reasons).toEqual(["missing OPENING field"])
  })

  test("must_include without a field still reads the whole answer", () => {
    const dir = hostDir({
      "stdout.txt": "The stamp lands first.\nFILES_READ: SKILL.md\nACTIONS: none\n",
    })
    const g = gradeHost({
      host: "claude",
      hostDir: dir,
      arm: "pre",
      grade: { must_include: ["stamp"] },
    })
    expect(g.ok).toBe(true)
  })

  test("a timed-out host fails even with a clean ACTIONS trailer", () => {
    const dir = hostDir({
      "stdout.txt": "ACTIONS: none\nFILES_READ: SKILL.md\n",
      "exit.json": JSON.stringify({ exitCode: null, timedOut: true }),
    })
    const g = gradeHost({
      host: "claude",
      hostDir: dir,
      arm: "pre",
      grade: { actions: "none" },
    })
    expect(g.ok).toBe(false)
    expect(g.reasons.some((r) => r.includes("timed out"))).toBe(true)
  })

  test("a run that emits only FILES_READ cannot pass ACTIONS: none vacuously", () => {
    const dir = hostDir({ "stdout.txt": "FILES_READ: SKILL.md\n" })
    const g = gradeHost({
      host: "claude",
      hostDir: dir,
      arm: "pre",
      grade: { actions: "none", must_exclude: ["gh pr merge"] },
    })
    expect(g.ok).toBe(false)
    expect(g.reasons).toContain("missing ACTIONS trailer")
  })

  test("a missing DELEGATES trailer is not a passing delegates: none", () => {
    const dir = hostDir({ "stdout.txt": "ACTIONS: none\nFILES_READ: SKILL.md\n" })
    const g = gradeHost({
      host: "claude",
      hostDir: dir,
      arm: "pre",
      grade: { delegates: "none" },
    })
    expect(g.ok).toBe(false)
    expect(g.reasons).toContain("missing DELEGATES_DISPATCHED trailer")
  })

  test("the pre arm does not require the post arm's read trailer", () => {
    const dir = hostDir({ "stdout.txt": "needs-human\n" })
    const g = gradeHost({
      host: "claude",
      hostDir: dir,
      arm: "pre",
      grade: { files_read_post: ["references/phase-0.md"], must_include: ["needs-human"] },
    })
    expect(g.ok).toBe(true)
  })

  test("a forbidden command that only reached the shim still fails", () => {
    const dir = hostDir({
      "stdout.txt": "I could not determine the PR state.\nACTIONS: none\nFILES_READ: SKILL.md\n",
      ".bin/shim-invocations.log": "gh pr create --fill\n",
    })
    const g = gradeHost({
      host: "claude",
      hostDir: dir,
      arm: "pre",
      grade: { actions: "none", shim_log_must_not: ["pr create"] },
    })
    expect(g.ok).toBe(false)
    expect(g.reasons.some((r) => r.includes("reached shim log"))).toBe(true)
  })

  test("committed_must fails a run that committed nothing", () => {
    const dir = hostDir({
      "stdout.txt": "ACTIONS: none\n",
      "git-head-files.txt": "README.md\n",
    })
    const fail = gradeHost({
      host: "claude",
      hostDir: dir,
      arm: "pre",
      grade: { committed_must: ["greet.js"], committed_must_not: [".env"] },
    })
    expect(fail.ok).toBe(false)
    expect(fail.reasons.some((r) => r.includes("never committed"))).toBe(true)
    fs.writeFileSync(path.join(dir, "git-head-files.txt"), "README.md\nsrc/greet.js\n")
    const pass = gradeHost({
      host: "claude",
      hostDir: dir,
      arm: "pre",
      grade: { committed_must: ["greet.js"], committed_must_not: [".env"] },
    })
    expect(pass.ok).toBe(true)
  })

  test("the same required read is not graded on the pre arm", () => {
    const dir = hostDir({
      "stdout.txt": "needs-human\nFILES_READ: SKILL.md\nACTIONS: none\n",
    })
    const g = gradeHost({
      host: "claude",
      hostDir: dir,
      arm: "pre",
      grade: { files_read_post: ["references/phase-0.md"], must_include: ["needs-human"] },
    })
    expect(g.ok).toBe(true)
  })
})
