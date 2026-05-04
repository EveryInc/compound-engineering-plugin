import { readFileSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"
import { load as parseYaml } from "js-yaml"

const SKILL_PATH = path.join(
  process.cwd(),
  "plugins/compound-engineering/skills/ce-dispatch/SKILL.md",
)
const TEMPLATE_PATH = path.join(
  process.cwd(),
  "plugins/compound-engineering/skills/ce-dispatch/references/dispatch-prompt-template.md",
)
const CONDUCTOR_NOTES_PATH = path.join(
  process.cwd(),
  "plugins/compound-engineering/skills/ce-dispatch/references/conductor-notes.md",
)
const SETUP_CONFIG_PATH = path.join(
  process.cwd(),
  "plugins/compound-engineering/skills/ce-setup/references/config-template.yaml",
)
const ROOT_CONFIG_PATH = path.join(
  process.cwd(),
  ".compound-engineering/config.local.example.yaml",
)
const PLAN_HANDOFF_PATH = path.join(
  process.cwd(),
  "plugins/compound-engineering/skills/ce-plan/references/plan-handoff.md",
)
const PLAN_SKILL_PATH = path.join(
  process.cwd(),
  "plugins/compound-engineering/skills/ce-plan/SKILL.md",
)

const SKILL_BODY = readFileSync(SKILL_PATH, "utf8")
const TEMPLATE_BODY = readFileSync(TEMPLATE_PATH, "utf8")
const CONDUCTOR_NOTES_BODY = readFileSync(CONDUCTOR_NOTES_PATH, "utf8")
const SETUP_CONFIG_BODY = readFileSync(SETUP_CONFIG_PATH, "utf8")
const ROOT_CONFIG_BODY = readFileSync(ROOT_CONFIG_PATH, "utf8")
const PLAN_HANDOFF_BODY = readFileSync(PLAN_HANDOFF_PATH, "utf8")
const PLAN_SKILL_BODY = readFileSync(PLAN_SKILL_PATH, "utf8")

function parseFrontmatter(md: string): Record<string, unknown> {
  const match = md.match(/^---\n([\s\S]*?)\n---\n/)
  if (!match) {
    throw new Error("No frontmatter block found")
  }
  return parseYaml(match[1]) as Record<string, unknown>
}

describe("ce-dispatch SKILL.md frontmatter", () => {
  const fm = parseFrontmatter(SKILL_BODY)

  test("name is ce-dispatch", () => {
    expect(fm.name).toBe("ce-dispatch")
  })

  test("description is present and mentions dispatch + plan implementation units", () => {
    const description = fm.description
    expect(typeof description).toBe("string")
    const desc = description as string
    expect(desc.length).toBeGreaterThan(40)
    expect(desc.length).toBeLessThanOrEqual(1024)
    expect(desc.toLowerCase()).toContain("dispatch")
    expect(desc.toLowerCase()).toContain("implementation unit")
  })

  test("disable-model-invocation is true (beta skill)", () => {
    expect(fm["disable-model-invocation"]).toBe(true)
  })

  test("argument-hint references plan path with auto-detect fallback", () => {
    const hint = fm["argument-hint"]
    expect(typeof hint).toBe("string")
    expect((hint as string).toLowerCase()).toContain("plan")
  })
})

describe("ce-dispatch SKILL.md phases", () => {
  // Anchor on the `### Phase N:` heading marker so a stray prose mention of
  // "Phase 1" earlier in the file doesn't shift the region boundaries.
  function phaseHeadingIndex(n: number): number {
    return SKILL_BODY.indexOf(`### Phase ${n}:`)
  }

  test("contains all required phase headings (0-4)", () => {
    for (const n of [0, 1, 2, 3, 4]) {
      expect(phaseHeadingIndex(n)).toBeGreaterThan(-1)
    }
  })

  test("Phase 0 covers input + config resolution", () => {
    const phase0Start = phaseHeadingIndex(0)
    const phase1Start = phaseHeadingIndex(1)
    expect(phase0Start).toBeGreaterThan(-1)
    expect(phase1Start).toBeGreaterThan(phase0Start)
    const phase0Region = SKILL_BODY.slice(phase0Start, phase1Start)
    // Mentions reading dispatch_* config from .compound-engineering/config.local.yaml
    expect(phase0Region).toContain("dispatch_")
    expect(phase0Region).toContain("config.local.yaml")
    // Auto-detects latest plan when input is blank
    expect(phase0Region.toLowerCase()).toContain("latest")
    expect(phase0Region).toContain("docs/plans")
  })

  test("Phase 1 includes Parallel Safety Check (file-to-unit mapping, overlap detection)", () => {
    const phase1Start = phaseHeadingIndex(1)
    const phase2Start = phaseHeadingIndex(2)
    expect(phase2Start).toBeGreaterThan(phase1Start)
    const phase1Region = SKILL_BODY.slice(phase1Start, phase2Start)
    expect(phase1Region).toContain("Parallel Safety Check")
    expect(phase1Region).toContain("file-to-unit")
    expect(phase1Region.toLowerCase()).toContain("overlap")
    // Dependency graph + cycle detection
    expect(phase1Region.toLowerCase()).toContain("dependency")
    expect(phase1Region.toLowerCase()).toContain("cycle")
  })

  test("Phase 2 generates dispatch prompts using the template", () => {
    const phase2Start = phaseHeadingIndex(2)
    const phase3Start = phaseHeadingIndex(3)
    const phase2Region = SKILL_BODY.slice(phase2Start, phase3Start)
    expect(phase2Region).toContain("references/dispatch-prompt-template.md")
  })

  test("Phase 3 creates issues via gh and only dispatches root-or-unblocked units", () => {
    const phase3Start = phaseHeadingIndex(3)
    const phase4Start = phaseHeadingIndex(4)
    const phase3Region = SKILL_BODY.slice(phase3Start, phase4Start)
    expect(phase3Region).toContain("gh issue create")
    expect(phase3Region).toContain("[CE-Dispatch]")
    expect(phase3Region.toLowerCase()).toContain("label")
    // Only dispatches units whose dependencies are merged or have none
    expect(phase3Region.toLowerCase()).toMatch(/dependenc(y|ies)/)
  })

  test("Phase 4 monitor loop has six options, including dependency-aware merge", () => {
    const phase4Start = phaseHeadingIndex(4)
    const phase4Region = SKILL_BODY.slice(phase4Start)
    // The six menu options
    expect(phase4Region).toContain("Check PR status")
    expect(phase4Region).toContain("Review a PR")
    expect(phase4Region).toContain("Merge a PR")
    expect(phase4Region).toContain("Dispatch newly unblocked units")
    expect(phase4Region).toContain("Show dependency graph")
    expect(phase4Region).toContain("Done for now")
    // Six options exceed 4-option cap -> numbered list in chat
    expect(phase4Region.toLowerCase()).toContain("numbered list")
    // Dependency-ordered merge gating
    expect(phase4Region.toLowerCase()).toContain("dependency")
    expect(phase4Region.toLowerCase()).toContain("merge")
    // Conflict guidance
    expect(phase4Region.toLowerCase()).toContain("rebase")
  })
})

describe("dispatch-prompt-template required XML sections", () => {
  const requiredSections = [
    "<context>",
    "<task>",
    "<files>",
    "<patterns>",
    "<approach>",
    "<constraints>",
    "<testing>",
    "<verify>",
    "<ce-plugin>",
    "<output-contract>",
  ]

  for (const section of requiredSections) {
    test(`template contains ${section} section`, () => {
      expect(TEMPLATE_BODY).toContain(section)
    })
  }

  test("template metadata footer is an HTML comment with required keys", () => {
    expect(TEMPLATE_BODY).toContain("ce-dispatch-metadata")
    expect(TEMPLATE_BODY).toContain("plan:")
    expect(TEMPLATE_BODY).toContain("unit_ids:")
    expect(TEMPLATE_BODY).toContain("dependencies:")
    expect(TEMPLATE_BODY).toContain("expected_branch:")
    expect(TEMPLATE_BODY).toContain("base_branch:")
  })
})

describe("dispatch-prompt-template constraints (PR-based, not no-git)", () => {
  function extractSection(body: string, tag: string): string {
    const open = `<${tag}>`
    const close = `</${tag}>`
    const start = body.indexOf(open)
    const end = body.indexOf(close, start)
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    return body.slice(start + open.length, end)
  }

  test("constraints does NOT forbid git commit/push/PR creation (the Codex constraint set)", () => {
    const constraints = extractSection(TEMPLATE_BODY, "constraints")
    // The Codex template said "Do NOT run git commit, git push, or create PRs"
    // ce-dispatch flips that — dispatched agents own the full git lifecycle.
    expect(constraints).not.toMatch(/Do NOT run git commit/i)
    expect(constraints).not.toMatch(/Do NOT run git push/i)
    expect(constraints).not.toMatch(/Do not run git commit/i)
  })

  test("constraints DOES instruct the agent to commit, push, and open a PR", () => {
    const constraints = extractSection(TEMPLATE_BODY, "constraints")
    expect(constraints.toLowerCase()).toContain("commit")
    expect(constraints.toLowerCase()).toContain("push")
    // Must explicitly say "Open a PR" / "open a pull request"
    expect(constraints).toMatch(/[Oo]pen a (?:PR|pull request)/)
    // Conventional commit messages
    expect(constraints.toLowerCase()).toContain("conventional commit")
  })
})

describe("dispatch-prompt-template output contract (PR description, not JSON file)", () => {
  function extractSection(body: string, tag: string): string {
    const open = `<${tag}>`
    const close = `</${tag}>`
    const start = body.indexOf(open)
    const end = body.indexOf(close, start)
    return body.slice(start + open.length, end)
  }

  test("output-contract does NOT reference --output-schema (Codex-specific JSON contract)", () => {
    const contract = extractSection(TEMPLATE_BODY, "output-contract")
    expect(contract).not.toContain("--output-schema")
    expect(contract).not.toContain("output-schema")
    expect(contract).not.toContain("result-schema.json")
  })

  test("output-contract reports via PR description under '## Dispatch Result'", () => {
    const contract = extractSection(TEMPLATE_BODY, "output-contract")
    expect(contract.toLowerCase()).toContain("pr description")
    expect(contract).toContain("## Dispatch Result")
  })

  test("output-contract requires the documented fields", () => {
    const contract = extractSection(TEMPLATE_BODY, "output-contract")
    // Required fields per the SKILL.md / template spec
    expect(contract.toLowerCase()).toContain("status")
    expect(contract.toLowerCase()).toContain("files modified")
    expect(contract.toLowerCase()).toContain("issues")
    expect(contract.toLowerCase()).toContain("summary")
    expect(contract.toLowerCase()).toContain("verification")
    expect(contract).toContain("Unit ID")
    expect(contract.toLowerCase()).toContain("plan path")
  })
})

describe("config templates carry dispatch_* keys", () => {
  const dispatchKeys = [
    "dispatch_mode",
    "dispatch_branch_prefix",
    "dispatch_base_branch",
    "dispatch_labels",
    "dispatch_auto_review",
  ]

  for (const key of dispatchKeys) {
    test(`ce-setup config-template.yaml documents ${key}`, () => {
      expect(SETUP_CONFIG_BODY).toContain(key)
    })

    test(`root config.local.example.yaml documents ${key}`, () => {
      expect(ROOT_CONFIG_BODY).toContain(key)
    })
  }
})

describe("ce-plan post-generation menu surfaces dispatch as a fifth option", () => {
  test("plan-handoff.md lists 'Dispatch to external agents' as option 4 in the menu", () => {
    // The numbered menu now has 5 options; "Dispatch" sits at position 4
    // (between Proof and Done for now). The exact position is asserted to
    // catch accidental reordering that would break user expectations.
    expect(PLAN_HANDOFF_BODY).toMatch(
      /4\.\s+\*\*Dispatch to external agents\*\*/,
    )
    expect(PLAN_HANDOFF_BODY).toMatch(/5\.\s+\*\*Done for now\*\*/)
  })

  test("plan-handoff.md routes the dispatch option to the ce-dispatch skill", () => {
    // Routing bullet (not the menu list) names ce-dispatch and the plan path
    expect(PLAN_HANDOFF_BODY).toContain(
      "- **Dispatch to external agents** ->",
    )
    expect(PLAN_HANDOFF_BODY.toLowerCase()).toContain("ce-dispatch")
    // Inline routing must name the platform's skill-invocation primitive
    // (per docs/solutions/skill-design/post-menu-routing-belongs-inline-2026-04-28.md)
    expect(PLAN_HANDOFF_BODY).toContain("skill-invocation primitive")
  })

  test("ce-plan SKILL.md inline routing fires ce-dispatch (not just text)", () => {
    // The inline routing in SKILL.md must also name the skill-invocation
    // primitive so an agent that hasn't loaded plan-handoff.md still routes
    // correctly. Mirrors the regression guard from
    // tests/skills/ce-plan-handoff-routing.test.ts.
    const phaseStart = PLAN_SKILL_BODY.indexOf("##### 5.3.8")
    expect(phaseStart).toBeGreaterThan(-1)
    const phaseRegion = PLAN_SKILL_BODY.slice(phaseStart)
    expect(phaseRegion).toMatch(
      /-\s+\*\*Dispatch to external agents\*\*\s*[—\-]+>?\s*[^\n]+/,
    )
    // Names the primitive and references the plan path
    const dispatchBullet = phaseRegion.match(
      /-\s+\*\*Dispatch to external agents\*\*[^\n]+/,
    )
    expect(dispatchBullet).not.toBeNull()
    const bulletText = dispatchBullet![0]
    expect(bulletText.toLowerCase()).toContain("skill-invocation primitive")
    expect(bulletText.toLowerCase()).toContain("plan path")
  })
})

describe("ce-dispatch SKILL.md regression guards (Codex-flagged bugs)", () => {
  // Both guards target real bugs flagged by the upstream's chatgpt-codex-connector
  // bot on EveryInc#762. Without these, the original `gh pr list` and
  // `git symbolic-ref` invocations silently return the wrong data.

  test("Phase 4 status refresh queries merged PRs, not just open ones", () => {
    // `gh pr list` defaults to open PRs only (CLI manual: "only lists open PRs"
    // by default). Dispatched PRs merged outside this orchestrator (GitHub UI,
    // Conductor, another shell) must still be discovered, otherwise the
    // dependency graph never advances and `Dispatch newly unblocked units`
    // can stay stuck even after prerequisites are merged. Required: --state all
    // (or --state merged on a separate pass).
    const phase4Start = SKILL_BODY.indexOf("### Phase 4:")
    expect(phase4Start).toBeGreaterThan(-1)
    const phase4Region = SKILL_BODY.slice(phase4Start)
    // Match `gh pr list` invocations (those that include flags/arguments,
    // identified by the `--search` flag we always pass) and require a state
    // flag on each. A bare prose mention of `gh pr list` without arguments
    // is not an invocation and is exempt. Allow `--state all` or
    // `--state merged`.
    const ghPrListInvocations =
      phase4Region.match(/gh pr list[^\n`]*--search[^\n`]*/g) ?? []
    expect(ghPrListInvocations.length).toBeGreaterThan(0)
    for (const inv of ghPrListInvocations) {
      expect(inv).toMatch(/--state (all|merged)/)
    }
  })

  test("dispatch_base_branch default uses --short to return a bare branch name", () => {
    // `git symbolic-ref refs/remotes/origin/HEAD` without --short returns the
    // full ref path (refs/remotes/origin/main) rather than the bare branch
    // name (main). That value gets propagated into dispatch metadata / agent
    // prompt instructions where a plain branch name is expected, breaking
    // PR-target instructions in dispatched workspaces.
    const phase0Start = SKILL_BODY.indexOf("### Phase 0:")
    const phase1Start = SKILL_BODY.indexOf("### Phase 1:")
    expect(phase0Start).toBeGreaterThan(-1)
    expect(phase1Start).toBeGreaterThan(phase0Start)
    const phase0Region = SKILL_BODY.slice(phase0Start, phase1Start)
    // Every `git symbolic-ref ... refs/remotes/origin/HEAD` invocation in
    // Phase 0 must include the --short flag.
    const symbolicRefMatches =
      phase0Region.match(/git symbolic-ref[^`\n]*refs\/remotes\/origin\/HEAD/g) ??
      []
    expect(symbolicRefMatches.length).toBeGreaterThan(0)
    for (const inv of symbolicRefMatches) {
      expect(inv).toContain("--short")
    }
  })

  test("Phase 1 dependency parser keys to the canonical ce-plan field", () => {
    // ce-plan emits the bolded `**Dependencies:**` field (see ce-plan/SKILL.md
    // Implementation Units template). An earlier draft of ce-dispatch keyed
    // the parser to `Depends on:` instead, which would silently fall back to
    // `none` for every unit produced by ce-plan, making dependent units look
    // like roots and dispatching them out of order. The Phase 1 parse rule
    // must explicitly reference the `Dependencies:` label as the primary key.
    const phase1Start = SKILL_BODY.indexOf("### Phase 1:")
    const phase2Start = SKILL_BODY.indexOf("### Phase 2:")
    expect(phase1Start).toBeGreaterThan(-1)
    expect(phase2Start).toBeGreaterThan(phase1Start)
    const phase1Region = SKILL_BODY.slice(phase1Start, phase2Start)
    // Field-extraction bullet for Dependencies must name the canonical label.
    const dependenciesBullet = phase1Region.match(
      /-\s+\*\*Dependencies\*\*[^\n]+/,
    )
    expect(dependenciesBullet).not.toBeNull()
    const bulletText = dependenciesBullet![0]
    // Primary label is `Dependencies:` (bolded `**Dependencies:**` accepted).
    expect(bulletText).toMatch(/`(?:\*\*)?Dependencies:(?:\*\*)?`/)
  })

  test("Phase 4 merge step syncs local checkout before running tests", () => {
    // `gh pr merge` lands the merge on GitHub but does not update the local
    // checkout. Running the project test suite immediately after `gh pr merge`
    // therefore tests pre-merge code, which can falsely report success while
    // the merged commit is broken. The merge bullet must include an explicit
    // local sync (fetch + checkout base + pull) between `gh pr merge` and
    // running the test suite.
    const phase4Start = SKILL_BODY.indexOf("### Phase 4:")
    expect(phase4Start).toBeGreaterThan(-1)
    const phase4Region = SKILL_BODY.slice(phase4Start)
    // Find the "Merge a PR" routing block — from its label to the next bullet.
    const mergeBlockMatch = phase4Region.match(
      /\*\*Merge a PR \(3\)\*\*[\s\S]*?(?=\n- \*\*[A-Z])/,
    )
    expect(mergeBlockMatch).not.toBeNull()
    const mergeBlock = mergeBlockMatch![0]
    // Must mention `gh pr merge`, then `git fetch`/`git pull` (local sync),
    // then the test suite — in that order.
    const ghMergeIdx = mergeBlock.indexOf("gh pr merge")
    const fetchIdx = mergeBlock.search(/git fetch/)
    const pullIdx = mergeBlock.search(/git pull/)
    const testSuiteIdx = mergeBlock.toLowerCase().indexOf("test suite")
    expect(ghMergeIdx).toBeGreaterThan(-1)
    expect(fetchIdx).toBeGreaterThan(ghMergeIdx)
    expect(pullIdx).toBeGreaterThan(ghMergeIdx)
    expect(testSuiteIdx).toBeGreaterThan(Math.max(fetchIdx, pullIdx))
  })

  test("Phase 4 merge sync guards dirty working tree and restores branch", () => {
    // The post-merge sync (`git fetch` + `git checkout <base>` + `git pull`)
    // can fail or silently overwrite user work if the dispatching session's
    // working tree is dirty. It can also leave the user displaced from a
    // feature branch they were on. The merge block must (a) check
    // `git status --porcelain` before running checkout, and (b) restore the
    // pre-sync branch (or surface that the working tree was cycled) afterward.
    const phase4Start = SKILL_BODY.indexOf("### Phase 4:")
    const phase4Region = SKILL_BODY.slice(phase4Start)
    const mergeBlockMatch = phase4Region.match(
      /\*\*Merge a PR \(3\)\*\*[\s\S]*?(?=\n- \*\*[A-Z])/,
    )
    expect(mergeBlockMatch).not.toBeNull()
    const mergeBlock = mergeBlockMatch![0]
    // Precondition guard: dirty-tree check before checkout.
    expect(mergeBlock).toMatch(/git status --porcelain/)
    const dirtyCheckIdx = mergeBlock.search(/git status --porcelain/)
    const checkoutIdx = mergeBlock.search(/git checkout <base_branch>/)
    expect(dirtyCheckIdx).toBeGreaterThan(-1)
    expect(checkoutIdx).toBeGreaterThan(dirtyCheckIdx)
    // Branch capture before sync; restore after tests.
    expect(mergeBlock).toMatch(/git symbolic-ref --short HEAD/)
    expect(mergeBlock).toMatch(/restore|displaced|cycled/i)
  })

  test("Phase 0 base-branch default documents an origin/HEAD fallback", () => {
    // `git symbolic-ref --short refs/remotes/origin/HEAD` exits non-zero on
    // clones where origin/HEAD was never set (bare clones, fresh
    // `git clone --no-checkout`, some CI checkouts). The default-resolution
    // table assumed it always succeeds. Must document a fallback (parsing
    // `git remote show origin`, defaulting to `main`, or both).
    const phase0Start = SKILL_BODY.indexOf("### Phase 0:")
    const phase1Start = SKILL_BODY.indexOf("### Phase 1:")
    const phase0Region = SKILL_BODY.slice(phase0Start, phase1Start)
    const baseBranchRow = phase0Region.match(
      /\| `dispatch_base_branch` \|[^\n]+/,
    )
    expect(baseBranchRow).not.toBeNull()
    // Either a parse of `git remote show origin` or a default-to-main, with a
    // user-facing warning, must be documented in the default cell.
    expect(baseBranchRow![0]).toMatch(
      /git remote show origin|default(?:s)? to `?main`?/,
    )
  })

  test("Phase 1 Files field captures Test paths (not just Read)", () => {
    // ce-plan emits Files as `Create:` / `Modify:` / `Test:` (per its unit
    // template), but the original parse rule listed them as `Create, Modify,
    // Read`. Test files therefore got dropped from the parallel-safety
    // file-to-unit map (Phase 1.3) and from the dispatch prompt's `<files>`
    // section, masking real test-file overlap between dispatched units.
    const phase1Start = SKILL_BODY.indexOf("### Phase 1:")
    const phase2Start = SKILL_BODY.indexOf("### Phase 2:")
    const phase1Region = SKILL_BODY.slice(phase1Start, phase2Start)
    const filesBullet = phase1Region.match(/-\s+\*\*Files\*\*[^\n]+/)
    expect(filesBullet).not.toBeNull()
    // Must explicitly name `Test:` as a captured sub-bullet.
    expect(filesBullet![0]).toMatch(/`Test:`/)
    // Phase 1.3 already says "Test paths" — keep that consistent.
    expect(phase1Region).toMatch(/Create, Modify, and Test paths/)
  })

  test("Phase 1 captures Test scenarios separately from Verification", () => {
    // Phase 2 substitutes `<testing>` with the unit's test scenarios and
    // `<verify>` with the project's test/lint commands — different prompt
    // sections, different sources. The Phase 1 parse list must capture both
    // the `**Test scenarios:**` and `**Verification:**` fields as separate
    // entries; collapsing them into one field leaks each into the wrong
    // template section.
    const phase1Start = SKILL_BODY.indexOf("### Phase 1:")
    const phase2Start = SKILL_BODY.indexOf("### Phase 2:")
    const phase1Region = SKILL_BODY.slice(phase1Start, phase2Start)
    expect(phase1Region).toMatch(/-\s+\*\*Test scenarios\*\*[^\n]+/)
    expect(phase1Region).toMatch(/-\s+\*\*Verification\*\*[^\n]+/)
    // Verification bullet must NOT also claim to capture Test scenarios in
    // the same field — that's the bug we're guarding against.
    const verificationBullet = phase1Region.match(
      /-\s+\*\*Verification\*\*[^\n]+/,
    )!
    expect(verificationBullet[0]).not.toMatch(/Test scenarios/)
  })

  test("Phase 3 documents gh issue create label-missing as an error", () => {
    // `gh issue create` with `--label <missing>` exits non-zero and refuses
    // to create the issue (cli/cli#715 — intentional, prevents accidental
    // label creation). Calling it a "warning" understates the recovery the
    // user needs to perform; the skill must describe it as an error and
    // outline the create-label-then-retry path.
    const phase3Start = SKILL_BODY.indexOf("### Phase 3:")
    const phase4Start = SKILL_BODY.indexOf("### Phase 4:")
    const phase3Region = SKILL_BODY.slice(phase3Start, phase4Start)
    // Find the bullet that talks about labels.
    const labelBullet = phase3Region.match(/- The label list comes from[^\n]+/)
    expect(labelBullet).not.toBeNull()
    // Must NOT call the missing-label outcome a "warning" only.
    expect(labelBullet![0]).not.toMatch(/`gh` prints a warning/)
    // Must describe an error/refusal and a retry path.
    expect(labelBullet![0]).toMatch(/non-zero|refuses|error|not found/i)
    expect(labelBullet![0]).toMatch(/gh label create/)
    expect(labelBullet![0]).toMatch(/retry/i)
  })
})

describe("conductor-notes.md documents key Conductor behavior", () => {
  const requiredHeadings = [
    "Issue-to-workspace lifecycle",
    "Startup scripts",
    "Worktree and branch management",
    "Agent configuration",
    "PR lifecycle",
    "API and CLI",
  ]

  for (const heading of requiredHeadings) {
    test(`conductor-notes.md covers '${heading}'`, () => {
      expect(CONDUCTOR_NOTES_BODY).toContain(heading)
    })
  }
})
