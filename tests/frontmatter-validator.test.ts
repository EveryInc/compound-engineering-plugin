import { describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

const SKILL_DIRS = [
  path.join(
    __dirname,
    "../plugins/compound-engineering/skills/ce-compound",
  ),
  path.join(
    __dirname,
    "../plugins/compound-engineering/skills/ce-compound-refresh",
  ),
] as const

function scriptPath(skillDir: string): string {
  return path.join(skillDir, "scripts/validate-frontmatter.py")
}

function runValidator(
  skillDir: string,
  docPath: string,
): { code: number; stdout: string; stderr: string } {
  const result = spawnSync("python3", [scriptPath(skillDir), docPath], {
    encoding: "utf8",
  })
  return {
    code: result.status ?? -1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  }
}

function writeTempDoc(content: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), "fm-validator-"))
  const filePath = path.join(dir, "doc.md")
  writeFileSync(filePath, content, "utf8")
  return filePath
}

const VALID_DOC = `---
title: "Sample valid doc"
date: 2026-04-25
module: ce-compound
problem_type: best_practice
component: tooling
severity: low
related_pr: "PR #685 (with extra context after the hash)"
tags:
  - validation
  - frontmatter
---

Body.
`

describe("validate-frontmatter script", () => {
  // Run every test against both skill copies of the script — they must
  // behave identically since AGENTS.md requires duplication, not sharing.
  for (const skillDir of SKILL_DIRS) {
    const skillName = path.basename(skillDir)

    describe(`in ${skillName}`, () => {
      test("accepts a valid frontmatter doc", () => {
        const docPath = writeTempDoc(VALID_DOC)
        const result = runValidator(skillDir, docPath)
        expect(result.code).toBe(0)
        expect(result.stdout).toContain("OK:")
        expect(result.stderr).toBe("")
      })

      test("rejects unquoted ' #' (the Codex bug)", () => {
        const docPath = writeTempDoc(`---
title: "Sample"
date: 2026-04-25
module: ce-compound
problem_type: best_practice
component: tooling
severity: low
related_pr: PR #685 (silently truncated)
---

Body.
`)
        const result = runValidator(skillDir, docPath)
        expect(result.code).toBe(1)
        expect(result.stderr).toContain("FAIL:")
        expect(result.stderr).toContain("'related_pr' value contains ' #'")
        expect(result.stderr).toContain("quote it")
      })

      test("rejects unquoted ': ' (mapping confusion)", () => {
        const docPath = writeTempDoc(`---
title: fix: Close gaps from PR #568 feedback
date: 2026-04-25
module: ce-compound
problem_type: best_practice
component: tooling
severity: low
---

Body.
`)
        const result = runValidator(skillDir, docPath)
        expect(result.code).toBe(1)
        expect(result.stderr).toContain("FAIL:")
        expect(result.stderr).toMatch(/'title' value contains ': '/)
      })

      test("accepts unquoted scalar starting with '-' (valid plain scalar; '-' is a list marker only when followed by whitespace)", () => {
        // YAML 1.2: bare `-foo` is a valid plain scalar. Only `- foo` (with
        // whitespace after `-`) acts as a list-entry marker. The validator
        // should not flag `-foo`.
        const docPath = writeTempDoc(`---
title: -starts-with-dash
date: 2026-04-25
module: ce-compound
problem_type: best_practice
component: tooling
severity: low
---

Body.
`)
        const result = runValidator(skillDir, docPath)
        expect(result.code).toBe(0)
      })

      test("accepts unquoted scalar starting with '?' (valid plain scalar; '?' is a complex-key marker only when followed by whitespace)", () => {
        // YAML 1.2: bare `?foo` is a valid plain scalar. Only `? foo` (with
        // whitespace after `?`) acts as a complex-mapping-key marker.
        const docPath = writeTempDoc(`---
title: ?question-mark-prefix
date: 2026-04-25
module: ce-compound
problem_type: best_practice
component: tooling
severity: low
---

Body.
`)
        const result = runValidator(skillDir, docPath)
        expect(result.code).toBe(0)
      })

      test("rejects file without frontmatter delimiter", () => {
        const docPath = writeTempDoc("# Just a markdown doc\n\nNo frontmatter.\n")
        const result = runValidator(skillDir, docPath)
        expect(result.code).toBe(1)
        expect(result.stderr).toContain("does not start with '---'")
      })

      test("rejects unterminated frontmatter", () => {
        const docPath = writeTempDoc(`---
title: "Sample"
date: 2026-04-25

Body without closing delimiter.
`)
        const result = runValidator(skillDir, docPath)
        expect(result.code).toBe(1)
        expect(result.stderr).toContain("not closed")
      })

      test("rejects '----' as closing delimiter (must match line exactly, not substring)", () => {
        // text.find("\\n---", 4) would falsely accept '----'; line-anchored
        // matching rejects it. Strict frontmatter parsers downstream require
        // an exact '---' line, so this is a real bug to catch.
        const docPath = writeTempDoc(`---
title: "Sample"
date: 2026-04-25
module: ce-compound
problem_type: best_practice
component: tooling
severity: low
----

Body.
`)
        const result = runValidator(skillDir, docPath)
        expect(result.code).toBe(1)
        expect(result.stderr).toContain("not closed")
      })

      test("rejects '---extra' as closing delimiter", () => {
        const docPath = writeTempDoc(`---
title: "Sample"
date: 2026-04-25
module: ce-compound
problem_type: best_practice
component: tooling
severity: low
---extra

Body.
`)
        const result = runValidator(skillDir, docPath)
        expect(result.code).toBe(1)
        expect(result.stderr).toContain("not closed")
      })

      test("accepts '---' delimiter with trailing whitespace", () => {
        // Permissive on whitespace (rstrip the line) but strict on content.
        const docPath = writeTempDoc(
          "---   \n" +
            'title: "Sample"\n' +
            "date: 2026-04-25\n" +
            "module: ce-compound\n" +
            "problem_type: best_practice\n" +
            "component: tooling\n" +
            "severity: low\n" +
            "---  \n" +
            "\n" +
            "Body.\n",
        )
        const result = runValidator(skillDir, docPath)
        expect(result.code).toBe(0)
      })

      test("exits 2 (usage error) on missing file", () => {
        const result = runValidator(skillDir, "/tmp/this-file-does-not-exist-fm.md")
        expect(result.code).toBe(2)
        expect(result.stderr).toContain("file not found")
      })

      test("exits 2 (usage error) on missing argument", () => {
        const result = spawnSync("python3", [scriptPath(skillDir)], {
          encoding: "utf8",
        })
        expect(result.status).toBe(2)
        expect(result.stderr).toContain("usage")
      })

      test("ignores nested-mapping ': ' (only top-level scalars are checked)", () => {
        // `: ` inside an array item or quoted value is fine — only top-level
        // unquoted scalar values trigger the check.
        const docPath = writeTempDoc(`---
title: "Sample"
date: 2026-04-25
module: ce-compound
problem_type: best_practice
component: tooling
severity: low
tags:
  - "fine: with colon-space when quoted"
---

Body.
`)
        const result = runValidator(skillDir, docPath)
        expect(result.code).toBe(0)
      })

      test("permits valid frontmatter with all the historically-tricky punctuation, when quoted", () => {
        const docPath = writeTempDoc(`---
title: "fix: Close gaps from PR #568 feedback"
date: 2026-04-25
module: ce-compound
problem_type: best_practice
component: tooling
severity: low
related_pr: "PR #685 (with extra context)"
related_issue: "EveryInc/repo#42"
summary: "- a leading dash, : a colon-space, and # symbols all fine here"
---

Body.
`)
        const result = runValidator(skillDir, docPath)
        expect(result.code).toBe(0)
        expect(result.stderr).toBe("")
      })
    })
  }

  test("script content is identical across skill copies (per AGENTS.md duplication rule)", () => {
    const [a, b] = SKILL_DIRS
    const aContent = readFileSync(scriptPath(a), "utf8")
    const bContent = readFileSync(scriptPath(b), "utf8")
    expect(aContent).toBe(bContent)
  })
})
