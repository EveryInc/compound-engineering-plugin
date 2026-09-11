import { describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { scenarioById } from "./catalog"
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

  test.each([
    ["fresh-subagent", "ce-pov", "single-judgment", true],
    ["same-context", "ce-pov", "oracle-panel", false],
    ["same-context", "ce-pov", "single-judgment", false],
    ["fresh-subagent", "none", "single-judgment", false],
    ["fresh-subagent", "ce-pov", "oracle-panel", false],
  ])("default POV judge grades context=%s skill=%s assessment=%s", (context, skill, assessment, expected) => {
    const scenario = scenarioById("ce-bakeoff/default-pov-judge")!
    const dir = hostDir({
      "stdout.txt": `ROUTE: context=${context}; skill=${skill}; assessment=${assessment}\nFILES_READ: SKILL.md\nACTIONS: none\nDELEGATES_DISPATCHED: none\n`,
    })
    const g = gradeHost({ host: "claude", hostDir: dir, arm: "post", grade: scenario.grade })
    expect(g.ok).toBe(expected)
  })

  test.each([
    ["ce-bakeoff/timing-evidence", "TIMING: seconds=592; draft=unsupported", "TIMING: seconds=592; draft=supported"],
    ["ce-brainstorm/requested-bakeoff-confirmation", "HANDOFF: next=ce-bakeoff; presentation=options-first; confirmer=user", "HANDOFF: next=ce-bakeoff; presentation=options-first; confirmer=agent"],
    ["ce-bakeoff/settled-decision-restraint", "DECISION: settled-choice=preserve", "DECISION: settled-choice=reopen"],
    ["ce-bakeoff/shared-brief-preserves-unknowns", "STORAGE_STATUS: guarantees=unknown", "STORAGE_STATUS: guarantees=established; unrelated details remain unknown"],
    ["ce-plan/requested-bakeoff-boundary", "HANDOFF: next=ce-bakeoff; final-author=ce-plan", "HANDOFF: next=ce-bakeoff; final-author=ce-bakeoff"],
  ])("%s grades the decision rather than a mentioned topic", (id, accepted, rejected) => {
    const scenario = scenarioById(id)!
    const reads = [...scenario.grade.files_read_post ?? [], ...scenario.grade.workspace_read ?? []].join(", ")
    for (const answer of [accepted, rejected]) {
      const dir = hostDir({ "stdout.txt": `${answer}\nFILES_READ: ${reads}\nACTIONS: none\nDELEGATES_DISPATCHED: none\n` })
      const result = gradeHost({ host: "claude", hostDir: dir, arm: "post", grade: scenario.grade })
      expect(result.ok).toBe(answer === accepted)
    }
  })

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

  test("result_must_not_include fails when the result block echoes the fixture", () => {
    const dir = hostDir({
      "stdout.txt": [
        "RESULT-START",
        "It is important to note that the median lookup now takes 4 milliseconds.",
        "RESULT-END",
        "No change needed.",
        "FILES_READ: facts.md",
        "ACTIONS: none",
        "",
      ].join("\n"),
    })
    const g = gradeHost({
      host: "claude",
      hostDir: dir,
      arm: "post",
      grade: { must_include: ["4 milliseconds"], result_must_not_include: ["it is important to note"], actions: "none" },
    })
    expect(g.ok).toBe(false)
    expect(g.reasons).toEqual(["source phrase survived in RESULT block: it is important to note"])
  })

  test("result_must_not_include ignores a removed phrase quoted in the summary line", () => {
    const dir = hostDir({
      "stdout.txt": [
        "RESULT-START",
        "The median lookup now takes 4 milliseconds.",
        "RESULT-END",
        "Cut the \"it is important to note\" filler.",
        "FILES_READ: facts.md",
        "ACTIONS: none",
        "",
      ].join("\n"),
    })
    const g = gradeHost({
      host: "claude",
      hostDir: dir,
      arm: "post",
      grade: { must_include: ["4 milliseconds"], result_must_not_include: ["it is important to note"], actions: "none" },
    })
    expect(g.ok).toBe(true)
  })

  test("result_must_not_include reads the marker lines, not a later mention of the markers", () => {
    const dir = hostDir({
      "stdout.txt": [
        "RESULT-START",
        "It is important to note that the median lookup now takes 4 milliseconds.",
        "RESULT-END",
        "Returned it unchanged between RESULT-START and RESULT-END.",
        "FILES_READ: facts.md",
        "ACTIONS: none",
        "",
      ].join("\n"),
    })
    const g = gradeHost({
      host: "claude",
      hostDir: dir,
      arm: "post",
      grade: { must_include: ["4 milliseconds"], result_must_not_include: ["it is important to note"], actions: "none" },
    })
    expect(g.ok).toBe(false)
    expect(g.reasons).toEqual(["source phrase survived in RESULT block: it is important to note"])
  })

  test("result_must_not_include fails when the run emitted no result block", () => {
    const dir = hostDir({
      "stdout.txt": "The median lookup now takes 4 milliseconds.\nFILES_READ: facts.md\nACTIONS: none\n",
    })
    const g = gradeHost({
      host: "claude",
      hostDir: dir,
      arm: "post",
      grade: { must_include: ["4 milliseconds"], result_must_not_include: ["boasting"], actions: "none" },
    })
    expect(g.ok).toBe(false)
    expect(g.reasons).toEqual(["missing RESULT-START/RESULT-END block"])
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

describe("skill-eval-cell grade: phrasing-tolerant pins", () => {
  const base = { host: "claude", arm: "post" as const }
  function hostDir(stdout: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "grade-any-"))
    fs.mkdirSync(path.join(dir, "workspace"), { recursive: true })
    fs.writeFileSync(path.join(dir, "stdout.txt"), stdout)
    fs.writeFileSync(path.join(dir, "exit.json"), JSON.stringify({ exitCode: 0 }))
    return dir
  }

  test("must_include_any passes on any listed phrasing and fails when none appears", () => {
    const stdout = "There are no existing retries to reuse.\n\nFILES_READ: a\nACTIONS: none\nDELEGATES_DISPATCHED: none\n"
    const pass = gradeHost({ ...base, hostDir: hostDir(stdout), grade: { must_include_any: [["does not retry", "no existing retries"]] } })
    expect(pass.reasons).toEqual([])
    const fail = gradeHost({ ...base, hostDir: hostDir(stdout), grade: { must_include_any: [["does not retry", "never retries"]] } })
    expect(fail.reasons).toEqual(["missing required text (any of): does not retry | never retries"])
  })

  test("must_include_field accepts a heading-style label whose content is the following block", () => {
    const stdout = "Preamble mentioning discard.\n\nROUTING\n\n- Candidate A: discard.\n- Candidate B: actionable.\n\nFILES_READ: a\nACTIONS: none\nDELEGATES_DISPATCHED: none\n"
    const pass = gradeHost({ ...base, hostDir: hostDir(stdout), grade: { must_include_field: "ROUTING", must_include: ["discard", "actionable"] } })
    expect(pass.reasons).toEqual([])
    const missing = gradeHost({ ...base, hostDir: hostDir("Only discard and actionable in prose.\n\nFILES_READ: a\nACTIONS: none\n"), grade: { must_include_field: "ROUTING", must_include: ["discard"] } })
    expect(missing.reasons).toContain("missing ROUTING field")
  })

  test("a heading-style field ends at the next section, so a later section cannot satisfy it", () => {
    const stdout = "## OPENING\n\nAdds the stamp.\n\n## DETAILS\n\nRevocation checks compare against it.\n\nFILES_READ: a\nACTIONS: none\n"
    const fail = gradeHost({ ...base, hostDir: hostDir(stdout), grade: { must_include_field: "OPENING", must_include: ["stamp", "revo"] } })
    expect(fail.reasons).toEqual(["missing required text: revo"])
    const labeled = "OPENING\n\nAdds the stamp.\n\nNEXT: revocation follow-up\n\nFILES_READ: a\nACTIONS: none\n"
    const fail2 = gradeHost({ ...base, hostDir: hostDir(labeled), grade: { must_include_field: "OPENING", must_include: ["revo"] } })
    expect(fail2.reasons).toEqual(["missing required text: revo"])
    for (const lead of ["PR creation preserves the stamp and revocation epoch.", "API behavior: revocation compares the stamp.", "**Candidate A: discard.** It reopens the stamp and revocation choice.", "**PR creation** preserves the stamp and revocation epoch."]) {
      const prose = `## OPENING\n\n${lead}\n\nFILES_READ: a\nACTIONS: none\n`
      const ok = gradeHost({ ...base, hostDir: hostDir(prose), grade: { must_include_field: "OPENING", must_include: ["stamp", "revo"] } })
      expect(ok.reasons).toEqual([])
    }
    const oneWord = "## OUTCOME\n\nunresolved\n\nFILES_READ: a\nACTIONS: none\n"
    const value = gradeHost({ ...base, hostDir: hostDir(oneWord), grade: { must_include_field: "OUTCOME", must_include: ["unresolved"] } })
    expect(value.reasons).toEqual([])
    for (const terminator of ["**DETAILS**", "**Details**", "**Details and Rationale**", "Details:", "DETAILS:", "Details and Rationale:", "**DETAILS:** explanation follows", "**Next steps**", "Next steps:", "DETAILS: more below", "**Details**: explanation", "**Risks & Trade-offs**"]) {
      const bare = `OPENING\n\nAdds the stamp.\n\n${terminator}\n\nRevocation checks compare against it.\n\nFILES_READ: a\nACTIONS: none\n`
      const fail3 = gradeHost({ ...base, hostDir: hostDir(bare), grade: { must_include_field: "OPENING", must_include: ["revo"] } })
      expect(fail3.reasons).toEqual(["missing required text: revo"])
    }
  })

  test("must_include_field still reads a single-line LABEL: value", () => {
    const stdout = "Decided.\n\n**MODE:** continuous\n\nFILES_READ: a\nACTIONS: none\n"
    const pass = gradeHost({ ...base, hostDir: hostDir(stdout), grade: { must_include_field: "MODE", must_include: ["continuous"] } })
    expect(pass.reasons).toEqual([])
  })

  test("delegates_must_not_include forbids one delegate while allowing others", () => {
    const stdout = "done\n\nFILES_READ: a\nACTIONS: edited src/x.js\nDELEGATES_DISPATCHED: correctness-reviewer, testing-reviewer\n"
    const pass = gradeHost({ ...base, hostDir: hostDir(stdout), grade: { delegates_must_not_include: ["ce-plan"] } })
    expect(pass.reasons).toEqual([])
    const fail = gradeHost({ ...base, hostDir: hostDir(stdout.replace("testing-reviewer", "ce-plan")), grade: { delegates_must_not_include: ["ce-plan"] } })
    expect(fail.reasons).toEqual(["forbidden delegate in DELEGATES_DISPATCHED: ce-plan"])
  })
})
