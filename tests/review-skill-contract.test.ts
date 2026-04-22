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
    expect(content).toContain("Do not write `.context` artifacts.")
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

    // Writes artifacts but no externalized work, no commit/push/PR
    expect(content).toContain("Do not file tickets or externalize work.")
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

    // Autofix-mode residual handoff is the run artifact (file-based todo system removed).
    expect(content).toContain(
      "In autofix mode, the run artifact is the handoff.",
    )
    expect(content).not.toContain("ce-todo-create")
    expect(content).not.toContain("create durable todo files")

    // Tracker fallback chain still exists for defer actions.
    const trackerDefer = await readRepoFile(
      "plugins/compound-engineering/skills/ce-code-review/references/tracker-defer.md",
    )
    expect(trackerDefer).toContain("Named tracker")
    expect(trackerDefer).toContain("GitHub Issues via `gh`")
    expect(trackerDefer).not.toContain(".context/compound-engineering/todos/")
    expect(content).not.toMatch(/harness task primitive|task-tracking primitive/)

    // Harness task-tracking primitive is no longer a fallback tier — it was removed
    // because in-session tasks do not meet the durable-filing intent of a Defer action.
    expect(trackerDefer).not.toMatch(/Harness task primitive \(last resort\)/)
    expect(trackerDefer).not.toMatch(/Once-per-session harness-fallback confirmation/)
    expect(trackerDefer).not.toMatch(/no-sink/)

    // Non-interactive execution mode exists for autonomous callers (e.g., lfg).
    expect(trackerDefer).toContain("## Execution Modes")
    expect(trackerDefer).toContain("Non-interactive mode")
    expect(trackerDefer).toMatch(/no_sink/)

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

  test("ce-work shipping-workflow enforces a residual-work gate after Tier 2 review", async () => {
    for (const path of [
      "plugins/compound-engineering/skills/ce-work/references/shipping-workflow.md",
      "plugins/compound-engineering/skills/ce-work-beta/references/shipping-workflow.md",
    ]) {
      const workflow = await readRepoFile(path)
      await expect(readRepoFile(path.replace("shipping-workflow.md", "tracker-defer.md"))).resolves.toContain(
        "Non-interactive mode",
      )
      await expect(readRepoFile(path.replace("shipping-workflow.md", "tracker-defer.md"))).resolves.not.toMatch(
        /no-sink/,
      )

      // Gate step is explicitly labeled and required after Tier 2.
      expect(workflow).toContain("**Residual Work Gate**")
      expect(workflow).toMatch(/do not proceed to Final Validation/i)

      // Three forward options + one abort; labels are self-contained.
      expect(workflow).toContain("Apply/fix now")
      expect(workflow).toContain("File tickets via project tracker")
      expect(workflow).toContain("Accept and proceed")
      expect(workflow).toContain("Stop — do not ship")

      // Accept-and-proceed path threads findings into the PR description.
      expect(workflow).toContain("Known Residuals")
      expect(workflow).toContain("docs/residual-review-findings/<branch-or-head-sha>.md")
      expect(workflow).toContain("If the user later chooses the no-PR `ce-commit` path")
      expect(workflow).toContain("must not live only in the transient session")
    }
  })

  test("lfg autonomously handles residuals via non-interactive tracker-defer and PR description", async () => {
    const lfg = await readRepoFile("plugins/compound-engineering/skills/lfg/SKILL.md")
    await expect(readRepoFile("plugins/compound-engineering/skills/lfg/references/tracker-defer.md")).resolves.toContain(
      "Non-interactive mode",
    )
    await expect(readRepoFile("plugins/compound-engineering/skills/lfg/references/tracker-defer.md")).resolves.not.toMatch(
      /no-sink/,
    )

    // Autonomous residual handoff step exists between code review and test-browser.
    expect(lfg).toContain("Persist review autofixes")
    expect(lfg).toContain("fix(review): apply autofix feedback")
    expect(lfg).toContain("Do not proceed to step 6, run browser tests, or output DONE while review autofix edits remain only in the working tree.")
    expect(lfg).toContain("there were no review autofixes to persist")
    expect(lfg).toContain("Autonomous residual handoff")
    expect(lfg).toMatch(/Do not prompt the user/)

    // tracker-defer is invoked in non-interactive mode.
    expect(lfg).toContain("references/tracker-defer.md")
    expect(lfg).not.toContain("plugins/compound-engineering/skills/ce-code-review/references/tracker-defer.md")
    expect(lfg).toMatch(/non-interactive mode/)

    // Structured return buckets drive PR description content.
    expect(lfg).toMatch(/filed/)
    expect(lfg).toMatch(/failed/)
    expect(lfg).toMatch(/no_sink/)

    // PR description update path is non-interactive and does not route through
    // confirmation-driven PR update skills.
    expect(lfg).not.toContain("ce-commit-push-pr")
    expect(lfg).toContain("gh pr edit PR_NUMBER --body-file BODY_FILE")
    expect(lfg).toContain("## Residual Review Findings")
    expect(lfg).toContain("docs/residual-review-findings/<branch-or-head-sha>.md")
    expect(lfg).toContain("prefer `origin` when present")
    expect(lfg).toContain("choose the first configured remote")
    expect(lfg).toContain("git push --set-upstream <remote> HEAD")
    expect(lfg).not.toContain("git push --set-upstream origin HEAD")
    expect(lfg).toContain("Do not output DONE until either the existing PR body has been updated or this fallback file commit has been pushed.")

    // Autopilot contract: never prompt, but require a durable sink before DONE.
    expect(lfg).toContain("Do not prompt the user")
    expect(lfg).toMatch(/Never block DONE on tracker filing failures/i)
  })

  test("ce-code-review autofix emits a residual-work summary in-chat, not only in the artifact", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-code-review/SKILL.md")
    expect(content).toMatch(/Emit a compact Residual Actionable Work summary/)
    expect(content).toContain("Residual actionable work: none.")
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
