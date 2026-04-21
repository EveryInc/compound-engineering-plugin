import { readFile } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"
import { parseFrontmatter } from "../src/utils/frontmatter"

async function readRepoFile(relativePath: string): Promise<string> {
  return readFile(path.join(process.cwd(), relativePath), "utf8")
}

describe("ce-code-review contract", () => {
  test("documents explicit modes and orchestration boundaries", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-code-review/SKILL.md")

    expect(content).toContain("## Mode Detection")
    expect(content).toContain("mode:autofix")
    expect(content).toContain("mode:report-only")
    expect(content).toContain("mode:headless")
    expect(content).toContain(".context/compound-engineering/ce-code-review/<run-id>/")
    expect(content).toContain("Do not create residual todos or `.context` artifacts.")
    expect(content).toContain(
      "Do not start a mutating review round concurrently with browser testing on the same checkout.",
    )
    expect(content).toContain("mode:report-only cannot switch the shared checkout to review a PR target")
    expect(content).toContain("mode:report-only cannot switch the shared checkout to review another branch")
    expect(content).toContain("Resolve the base ref from the PR's actual base repository, not by assuming `origin`")
    expect(content).not.toContain("Which severities should I fix?")
  })

  test("documents headless mode contract for programmatic callers", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-code-review/SKILL.md")

    // Headless mode has its own rules section
    expect(content).toContain("### Headless mode rules")

    // No interactive prompts (cross-platform)
    expect(content).toContain(
      "Never use the platform question tool",
    )

    // Structured output format
    expect(content).toContain("### Headless output format")
    expect(content).toContain("Code review complete (headless mode).")
    expect(content).toContain('"Review complete" as the terminal signal')

    // Applies safe_auto fixes but NOT safe for concurrent use
    expect(content).toContain(
      "Not safe for concurrent use on a shared checkout.",
    )

    // Writes artifacts but no todos, no commit/push/PR
    expect(content).toContain("Do not create todo files.")
    expect(content).toContain(
      "Never commit, push, or create a PR",
    )

    // Single-pass fixing, no bounded re-review rounds
    expect(content).toContain("No bounded re-review rounds")

    // Checkout guard — headless shares report-only's guard
    expect(content).toMatch(/mode:headless.*must run in an isolated checkout\/worktree or stop/)

    // Conflicting mode flags
    expect(content).toContain("**Conflicting mode flags:**")

    // Structured error for missing scope
    expect(content).toContain("Review failed (headless mode). Reason: no diff scope detected.")

    // Degraded signal when all reviewers fail
    expect(content).toContain("Code review degraded (headless mode).")
  })

  test("documents policy-driven routing and residual handoff", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-code-review/SKILL.md")

    // Routing taxonomy and fixer queue semantics
    expect(content).toContain("## Action Routing")
    expect(content).toContain("Only `safe_auto -> review-fixer` enters the in-skill fixer queue automatically.")

    // Interactive mode four-option routing structure: each distinguishing word must appear
    // as a routing-option label so truncation-safe menus stay intact.
    // Assert presence rather than exact copy — wording can be improved without breaking the test.
    expect(content).toMatch(/\(A\)\s*`Review each finding one by one/)
    expect(content).toMatch(/\(B\)\s*`LFG\./)
    expect(content).toMatch(/\(C\)\s*`File a \[TRACKER\] ticket/)
    expect(content).toMatch(/\(D\)\s*`Report only/)

    // The new routing question dispatches to focused reference files, not inline prose.
    expect(content).toContain("references/walkthrough.md")
    expect(content).toContain("references/bulk-preview.md")
    expect(content).toContain("references/tracker-defer.md")

    // Stem is third-person (AGENTS.md:127 — no first-person "I" / "me" in the new routing question).
    // The Interactive branch of After Review Step 2 must not reintroduce the removed bucket-policy wording.
    expect(content).not.toContain("What should I do with the remaining findings?")
    expect(content).not.toContain("What should I do?")

    // Zero-remaining case: routing question is skipped with a completion summary.
    expect(content).toMatch(/skip the routing question entirely/i)

    // Stage 5 tie-breaking rule — the walk-through's recommendation is deterministic.
    expect(content).toMatch(/Skip\s*>\s*Defer\s*>\s*Apply/)

    // Autofix-mode residual todo handoff is preserved (mode isolation).
    expect(content).toContain(
      "In autofix mode, create durable todo files only for unresolved actionable findings whose final owner is `downstream-resolver`.",
    )
    expect(content).toContain("If only advisory outputs remain, create no todos.")

    // Tracker fallback chain explicitly forbids extending the internal todos system.
    const trackerDefer = await readRepoFile(
      "plugins/compound-engineering/skills/ce-code-review/references/tracker-defer.md",
    )
    expect(trackerDefer).toContain(".context/compound-engineering/todos/")
    expect(trackerDefer).toMatch(/Never fall back to `\.context\/compound-engineering\/todos\//)

    // Subagent template carries the why_it_matters framing guidance that replaces the
    // rejected synthesis-time rewrite pass. Assert presence of the observable-behavior
    // rule and the required-field reminder without pinning exact prose.
    const subagentTemplate = await readRepoFile(
      "plugins/compound-engineering/skills/ce-code-review/references/subagent-template.md",
    )
    expect(subagentTemplate).toMatch(/observable behavior/i)
    expect(subagentTemplate).toMatch(/required/i)

    // walkthrough.md carries the four per-finding option labels (Apply / Defer / Skip /
    // LFG the rest). Assert presence of each distinguishing word so renaming an option
    // breaks the test. Exact label wording may be refined for clarity — these assertions
    // check the structural contract, not the prose.
    const walkthrough = await readRepoFile(
      "plugins/compound-engineering/skills/ce-code-review/references/walkthrough.md",
    )
    expect(walkthrough).toContain("Apply the proposed fix")
    expect(walkthrough).toContain("Defer — file a [TRACKER] ticket")
    expect(walkthrough).toContain("Skip — don't apply, don't track")
    expect(walkthrough).toMatch(/LFG the rest/)

    // bulk-preview.md contract: exactly Proceed / Cancel, no third option.
    const bulkPreview = await readRepoFile(
      "plugins/compound-engineering/skills/ce-code-review/references/bulk-preview.md",
    )
    expect(bulkPreview).toContain("Proceed")
    expect(bulkPreview).toContain("Cancel")

    // Step 5 final-next-steps flow is gated on fixes-applied count, not routing option.
    expect(content).toContain("fixes_applied_count")
    expect(content).toMatch(/Step 5 runs only when `fixes_applied_count > 0`/i)

    // Final-next-steps wording preserved.
    expect(content).toContain("**On the resolved review base/default branch:**")
    expect(content).toContain("git push --set-upstream origin HEAD")
    expect(content).not.toContain("**On main/master:**")
  })

  test("keeps findings schema and downstream docs aligned", async () => {
    const rawSchema = await readRepoFile(
      "plugins/compound-engineering/skills/ce-code-review/references/findings-schema.json",
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

    const fileTodos = await readRepoFile("plugins/compound-engineering/skills/ce-todo-create/SKILL.md")
    expect(fileTodos).toContain("/ce-code-review mode:autofix")
    expect(fileTodos).toContain("/ce-todo-resolve")

    const resolveTodos = await readRepoFile("plugins/compound-engineering/skills/ce-todo-resolve/SKILL.md")
    expect(resolveTodos).toContain("ce-code-review mode:autofix")
    expect(resolveTodos).toContain("safe_auto")
  })

  test("documents stack-specific conditional reviewers for the JSON pipeline", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-code-review/SKILL.md")
    const catalog = await readRepoFile(
      "plugins/compound-engineering/skills/ce-code-review/references/persona-catalog.md",
    )

    for (const agent of [
      "ce-dhh-rails-reviewer",
      "ce-kieran-rails-reviewer",
      "ce-kieran-python-reviewer",
      "ce-kieran-typescript-reviewer",
      "ce-julik-frontend-races-reviewer",
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
        path: "plugins/compound-engineering/agents/ce-dhh-rails-reviewer.agent.md",
        reviewer: "dhh-rails",
      },
      {
        path: "plugins/compound-engineering/agents/ce-kieran-rails-reviewer.agent.md",
        reviewer: "kieran-rails",
      },
      {
        path: "plugins/compound-engineering/agents/ce-kieran-python-reviewer.agent.md",
        reviewer: "kieran-python",
      },
      {
        path: "plugins/compound-engineering/agents/ce-kieran-typescript-reviewer.agent.md",
        reviewer: "kieran-typescript",
      },
      {
        path: "plugins/compound-engineering/agents/ce-julik-frontend-races-reviewer.agent.md",
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

  test("leaves data-migration-expert as the unstructured review format", async () => {
    const content = await readRepoFile(
      "plugins/compound-engineering/agents/ce-data-migration-expert.agent.md",
    )

    expect(content).toContain("## Reviewer Checklist")
    expect(content).toContain("Refuse approval until there is a written verification + rollback plan.")
    expect(content).not.toContain("Return your findings as JSON matching the findings schema.")
  })

  test("fails closed when merge-base is unresolved instead of falling back to git diff HEAD", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-code-review/SKILL.md")

    // No scope path should fall back to `git diff HEAD` or `git diff --cached` — those only
    // show uncommitted changes and silently produce empty diffs on clean feature branches.
    expect(content).not.toContain("git diff --name-only HEAD")
    expect(content).not.toContain("git diff -U10 HEAD")
    expect(content).not.toContain("git diff --cached")

    // PR mode still has an inline error for unresolved base
    expect(content).toContain('echo "ERROR: Unable to resolve PR base branch')

    // Branch and standalone modes delegate to resolve-base.sh and check its ERROR: output.
    // The script itself emits ERROR: when the base is unresolved.
    expect(content).toContain("references/resolve-base.sh")
    const resolveScript = await readRepoFile(
      "plugins/compound-engineering/skills/ce-code-review/references/resolve-base.sh",
    )
    expect(resolveScript).toContain("ERROR:")

    // Branch and standalone modes must stop on script error, not fall back
    expect(content).toContain(
      "If the script outputs an error, stop instead of falling back to `git diff HEAD`",
    )
  })

  test("orchestration callers pass explicit mode flags", async () => {
    const lfg = await readRepoFile("plugins/compound-engineering/skills/lfg/SKILL.md")
    expect(lfg).toContain("/ce-code-review mode:autofix")
  })
})

describe("testing-reviewer contract", () => {
  test("includes behavioral-changes-with-no-test-additions check", async () => {
    const content = await readRepoFile("plugins/compound-engineering/agents/ce-testing-reviewer.agent.md")

    // New check exists in "What you're hunting for" section
    expect(content).toContain("Behavioral changes with no test additions")

    // Check is distinct from untested branches check
    expect(content).toContain("distinct from untested branches")

    // Non-behavioral changes are excluded
    expect(content).toContain("Non-behavioral changes")
  })
})
