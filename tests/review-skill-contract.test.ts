import { readFile } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"
import { parseFrontmatter } from "../src/utils/frontmatter"

async function readRepoFile(relativePath: string): Promise<string> {
  return readFile(path.join(process.cwd(), relativePath), "utf8")
}

describe("ce-review contract", () => {
  test("documents explicit modes and orchestration boundaries", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-review/SKILL.md")

    expect(content).toContain("## Mode Detection")
    expect(content).toContain("mode:autofix")
    expect(content).toContain("mode:report-only")
    expect(content).toContain(".context/compound-engineering/ce-review/<run-id>/")
    expect(content).toContain("Do not create residual todos or `.context` artifacts.")
    expect(content).toContain(
      "Do not start a mutating review round concurrently with browser testing on the same checkout.",
    )
    expect(content).toContain("mode:report-only cannot switch the shared checkout to review a PR target")
    expect(content).toContain("mode:report-only cannot switch the shared checkout to review another branch")
    expect(content).toContain("Resolve the base ref from the PR's actual base repository, not by assuming `origin`")
    expect(content).not.toContain("Which severities should I fix?")
  })

  test("documents policy-driven routing and residual handoff", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-review/SKILL.md")

    expect(content).toContain("## Action Routing")
    expect(content).toContain("Only `safe_auto -> review-fixer` enters the in-skill fixer queue automatically.")
    expect(content).toContain(
      "Only include `gated_auto` findings in the fixer queue after the user explicitly approves the specific items.",
    )
    expect(content).toContain(
      'If the fixer queue is empty, do not offer "Apply safe_auto fixes" options.',
    )
    expect(content).toContain(
      "In autofix mode, create durable todo files only for unresolved actionable findings whose final owner is `downstream-resolver`.",
    )
    expect(content).toContain("If only advisory outputs remain, create no todos.")
    expect(content).toContain("**On the resolved review base/default branch:**")
    expect(content).toContain("git push --set-upstream origin HEAD")
    expect(content).not.toContain("**On main/master:**")
  })

  test("keeps findings schema and downstream docs aligned", async () => {
    const rawSchema = await readRepoFile(
      "plugins/compound-engineering/skills/ce-review/references/findings-schema.json",
    )
    const schema = JSON.parse(rawSchema) as {
      _meta: { confidence_thresholds: { suppress: string } }
      properties: {
        findings: {
          items: {
            properties: {
              autofix_class: { enum: string[] }
              owner: { enum: string[] }
              requires_verification: { type: string }
            }
            required: string[]
          }
        }
      }
    }

    expect(schema.properties.findings.items.required).toEqual(
      expect.arrayContaining(["autofix_class", "owner", "requires_verification"]),
    )
    expect(schema.properties.findings.items.properties.autofix_class.enum).toEqual([
      "safe_auto",
      "gated_auto",
      "manual",
      "advisory",
    ])
    expect(schema.properties.findings.items.properties.owner.enum).toEqual([
      "review-fixer",
      "downstream-resolver",
      "human",
      "release",
    ])
    expect(schema.properties.findings.items.properties.requires_verification.type).toBe("boolean")
    expect(schema._meta.confidence_thresholds.suppress).toContain("0.60")

    const fileTodos = await readRepoFile("plugins/compound-engineering/skills/todo-create/SKILL.md")
    expect(fileTodos).toContain("/ce:review mode:autofix")
    expect(fileTodos).toContain("/todo-resolve")

    const resolveTodos = await readRepoFile("plugins/compound-engineering/skills/todo-resolve/SKILL.md")
    expect(resolveTodos).toContain("ce:review mode:autofix")
    expect(resolveTodos).toContain("safe_auto")
  })

  test("documents stack-specific conditional reviewers for the JSON pipeline", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-review/SKILL.md")
    const catalog = await readRepoFile(
      "plugins/compound-engineering/skills/ce-review/references/persona-catalog.md",
    )

    for (const agent of [
      "compound-engineering:review:dhh-rails-reviewer",
      "compound-engineering:review:kieran-rails-reviewer",
      "compound-engineering:review:kieran-python-reviewer",
      "compound-engineering:review:kieran-typescript-reviewer",
      "compound-engineering:review:julik-frontend-races-reviewer",
    ]) {
      expect(content).toContain(agent)
      expect(catalog).toContain(agent)
    }

    expect(content).toContain("## Language-Aware Conditionals")
    expect(content).not.toContain("## Language-Agnostic")
  })

  test("stack-specific reviewer agents follow the structured findings contract", async () => {
    const reviewers = [
      {
        path: "plugins/compound-engineering/agents/review/dhh-rails-reviewer.md",
        reviewer: "dhh-rails",
      },
      {
        path: "plugins/compound-engineering/agents/review/kieran-rails-reviewer.md",
        reviewer: "kieran-rails",
      },
      {
        path: "plugins/compound-engineering/agents/review/kieran-python-reviewer.md",
        reviewer: "kieran-python",
      },
      {
        path: "plugins/compound-engineering/agents/review/kieran-typescript-reviewer.md",
        reviewer: "kieran-typescript",
      },
      {
        path: "plugins/compound-engineering/agents/review/julik-frontend-races-reviewer.md",
        reviewer: "julik-frontend-races",
      },
    ]

    for (const reviewer of reviewers) {
      const content = await readRepoFile(reviewer.path)
      const parsed = parseFrontmatter(content)
      const tools = String(parsed.data.tools ?? "")

      expect(String(parsed.data.description)).toContain("Conditional code-review persona")
      expect(tools).toContain("Read")
      expect(tools).toContain("Grep")
      expect(tools).toContain("Glob")
      expect(tools).toContain("Bash")
      expect(content).toContain("## Confidence calibration")
      expect(content).toContain("## What you don't flag")
      expect(content).toContain("Return your findings as JSON matching the findings schema. No prose outside the JSON.")
      expect(content).toContain(`"reviewer": "${reviewer.reviewer}"`)
    }
  })

  test("leaves data-migration-expert as the unstructured deepen-plan reviewer", async () => {
    const content = await readRepoFile(
      "plugins/compound-engineering/agents/review/data-migration-expert.md",
    )

    expect(content).toContain("## Reviewer Checklist")
    expect(content).toContain("Refuse approval until there is a written verification + rollback plan.")
    expect(content).not.toContain("Return your findings as JSON matching the findings schema.")
  })

  test("fails closed when merge-base is unresolved instead of falling back to git diff HEAD", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-review/SKILL.md")

    // No scope path should fall back to `git diff HEAD` or `git diff --cached` — those only
    // show uncommitted changes and silently produce empty diffs on clean feature branches.
    expect(content).not.toContain("git diff --name-only HEAD")
    expect(content).not.toContain("git diff -U10 HEAD")
    expect(content).not.toContain("git diff --cached")

    // All three scope paths must emit ERROR when BASE is unresolved
    const errorMatches = content.match(/echo "ERROR: Unable to resolve/g)
    expect(errorMatches?.length).toBe(3) // PR mode, branch mode, standalone mode
  })

  test("orchestration callers pass explicit mode flags", async () => {
    const lfg = await readRepoFile("plugins/compound-engineering/skills/lfg/SKILL.md")
    expect(lfg).toContain("/ce:review mode:autofix")

    const slfg = await readRepoFile("plugins/compound-engineering/skills/slfg/SKILL.md")
    // slfg uses report-only for the parallel phase (safe with browser testing)
    // then autofix sequentially after to emit fixes and todos
    expect(slfg).toContain("/ce:review mode:report-only")
    expect(slfg).toContain("/ce:review mode:autofix")
  })
})
