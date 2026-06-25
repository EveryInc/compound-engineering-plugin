import { readFile } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"

async function readRepoFile(relativePath: string): Promise<string> {
  return readFile(path.join(process.cwd(), relativePath), "utf8")
}

describe("ce-work implementation-only mode", () => {
  test("documents pre-Phase-0 implementation mode parsing and bare prompt rejection", async () => {
    const content = await readRepoFile("skills/ce-work/SKILL.md")
    const mode = await readRepoFile("skills/ce-work/references/implementation-only-mode.md")

    expect(content).toContain("mode:implementation-only")
    expect(content).toContain("references/implementation-only-mode.md")
    expect(content).toContain("Capture raw `$ARGUMENTS` before Phase 0 triage")
    expect(content).toContain("Parse shell-like tokens while preserving quoted paths")
    expect(content).toContain("Require exactly one `mode:implementation-only` token")
    expect(content).toContain("Strip the mode token from the argument string")
    expect(content).toContain("Phase 0 must never classify `mode:implementation-only docs/plans/foo.md`")
    expect(content).toContain("Default behavior is unchanged when `mode:implementation-only` is absent")
    expect(mode).toContain("Required parsing order")
    expect(mode).toContain("Only then enter Phase 0 plan-file triage with the stripped path")
    expect(mode).toContain("Require exactly one readable plan-file path")
    expect(mode).toContain("Reject blank input, bare prompts, unreadable paths, directories, and knowledge-work plans")
  })

  test("defines deterministic parsing outcomes before input triage", async () => {
    const content = await readRepoFile("skills/ce-work/SKILL.md")
    const mode = await readRepoFile("skills/ce-work/references/implementation-only-mode.md")
    const docs = await readRepoFile("docs/skills/ce-work.md")

    const cases = [
      {
        raw: "mode:implementation-only docs/plans/foo.md",
        implementationOnly: true,
        strippedInput: "docs/plans/foo.md",
        phase0Route: "plan-file",
        status: "accepted",
      },
      {
        raw: "docs/plans/foo.md mode:implementation-only",
        implementationOnly: true,
        strippedInput: "docs/plans/foo.md",
        phase0Route: "plan-file",
        status: "accepted",
      },
      {
        raw: 'mode:implementation-only "docs/plans/fixture plan.md"',
        implementationOnly: true,
        strippedInput: "docs/plans/fixture plan.md",
        phase0Route: "plan-file",
        status: "accepted",
      },
      {
        raw: "mode:implementation-only mode:implementation-only docs/plans/foo.md",
        implementationOnly: false,
        strippedInput: null,
        phase0Route: "none",
        status: "failed_duplicate_mode",
      },
      {
        raw: "mode:implementation-only",
        implementationOnly: false,
        strippedInput: null,
        phase0Route: "none",
        status: "failed_blank_remainder",
      },
      {
        raw: "mode:implementation-only implement the thing",
        implementationOnly: false,
        strippedInput: null,
        phase0Route: "none",
        status: "failed_bare_prompt",
      },
      {
        raw: "mode:implementation-only docs/plans/knowledge.md",
        implementationOnly: false,
        strippedInput: "docs/plans/knowledge.md",
        phase0Route: "none",
        status: "failed_knowledge_work_plan",
      },
      {
        raw: "docs/plans/foo.md",
        implementationOnly: false,
        strippedInput: "docs/plans/foo.md",
        phase0Route: "default-plan-file",
        status: "default_unchanged",
      },
      {
        raw: "implement the thing",
        implementationOnly: false,
        strippedInput: "implement the thing",
        phase0Route: "default-bare-prompt",
        status: "default_unchanged",
      },
      {
        raw: "docs/plans/mode:implementation-only-plan.md",
        implementationOnly: false,
        strippedInput: "docs/plans/mode:implementation-only-plan.md",
        phase0Route: "default-plan-file",
        status: "token_substring_ignored",
      },
    ]

    expect(cases.filter((entry) => entry.implementationOnly).map((entry) => entry.strippedInput)).toEqual([
      "docs/plans/foo.md",
      "docs/plans/foo.md",
      "docs/plans/fixture plan.md",
    ])
    expect(cases.find((entry) => entry.status === "failed_duplicate_mode")?.phase0Route).toBe("none")
    expect(cases.find((entry) => entry.status === "failed_blank_remainder")?.phase0Route).toBe("none")
    expect(cases.find((entry) => entry.status === "failed_bare_prompt")?.phase0Route).toBe("none")
    expect(cases.find((entry) => entry.status === "failed_knowledge_work_plan")?.phase0Route).toBe("none")
    expect(cases.find((entry) => entry.raw === "implement the thing")?.phase0Route).toBe(
      "default-bare-prompt",
    )

    expect(mode).toContain("The mode token may appear before or after the plan path")
    expect(content).toContain("exactly one non-blank readable plan-file path")
    expect(content).toContain("token-like substrings inside filenames or prose")
    expect(mode).toContain("Preserve quoted paths containing spaces")
    expect(mode).toContain("Do not activate this mode for token-like substrings")
    expect(docs).toContain("parsed before normal Phase 0 input triage")
    expect(docs).toContain("Default plan and bare-prompt behavior is unchanged")
  })

  test("skips branch, commit, simplify, review, and shipping behavior only in the new mode", async () => {
    const content = await readRepoFile("skills/ce-work/SKILL.md")
    const mode = await readRepoFile("skills/ce-work/references/implementation-only-mode.md")

    expect(mode).toContain("Do not create or switch branches")
    expect(mode).toContain("Do not create commits")
    expect(mode).toContain("Do not invoke `ce-simplify-code`")
    expect(mode).toContain("Do not invoke `ce-code-review`")
    expect(mode).toContain("Do not load `references/shipping-workflow.md`")
    expect(mode).toContain("Do not push, create or edit a PR, watch CI, or run release automation")
    expect(mode).toContain("Return one JSON object")
    expect(content).toContain("Default behavior is unchanged")
  })

  test("defines structured result statuses and file lists", async () => {
    const mode = await readRepoFile("skills/ce-work/references/implementation-only-mode.md")

    for (const status of ["completed", "already_satisfied", "partial", "failed"]) {
      expect(mode).toContain(status)
    }
    for (const field of [
      "files",
      "created",
      "modified",
      "deleted",
      "verification",
      "issues",
      "already_satisfied_proof",
    ]) {
      expect(mode).toContain(field)
    }
    expect(mode).toContain("`already_satisfied` is valid only with proof")
    expect(mode).toContain("identified files")
  })
})
