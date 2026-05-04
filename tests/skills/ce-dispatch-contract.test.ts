import { readFileSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"
import { load as parseYaml } from "js-yaml"

const SKILL_PATH = path.join(
  process.cwd(),
  "plugins/compound-engineering/skills/ce-dispatch-beta/SKILL.md",
)
const TEMPLATE_PATH = path.join(
  process.cwd(),
  "plugins/compound-engineering/skills/ce-dispatch-beta/references/dispatch-prompt-template.md",
)
const CONDUCTOR_NOTES_PATH = path.join(
  process.cwd(),
  "plugins/compound-engineering/skills/ce-dispatch-beta/references/conductor-notes.md",
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

describe("ce-dispatch-beta SKILL.md frontmatter", () => {
  const fm = parseFrontmatter(SKILL_BODY)

  test("name is ce-dispatch-beta (follows beta-skills framework triplet)", () => {
    // Beta skills in this plugin follow a triplet: `-beta` directory/name
    // suffix + `[BETA]` description prefix + `disable-model-invocation: true`
    // (per docs/solutions/skill-design/beta-skills-framework.md). Promotion
    // to stable strips all three together. The triplet must be applied
    // consistently — partial application (e.g., suffix without the flag, or
    // flag without the suffix) drifts from the convention and breaks both
    // promotion and the bot's pattern-matching review.
    expect(fm.name).toBe("ce-dispatch-beta")
  })

  test("description carries [BETA] prefix per the beta-skills framework triplet", () => {
    const description = fm.description
    expect(typeof description).toBe("string")
    const desc = description as string
    expect(desc.length).toBeGreaterThan(40)
    expect(desc.length).toBeLessThanOrEqual(1024)
    expect(desc.startsWith("[BETA]")).toBe(true)
    expect(desc.toLowerCase()).toContain("dispatch")
    expect(desc.toLowerCase()).toContain("implementation unit")
  })

  test("sets disable-model-invocation: true per the beta-skills framework triplet", () => {
    // Beta skills in this plugin (ce-work-beta, ce-polish-beta, ce-dispatch-beta)
    // all carry `disable-model-invocation: true`. The flag blocks every
    // model-initiated invocation via the Skill primitive — only a user
    // typing the slash command directly fires the skill. This is
    // intentional: it forces beta skills to be opt-in and prevents the
    // model from auto-routing to an unstable skill.
    //
    // The corollary, asserted in the ce-plan tests below, is that ce-plan's
    // option-4 routing must NOT use the skill-invocation primitive — it
    // must instruct the user to type `/ce-dispatch-beta` instead, since
    // the primitive call would be silently dropped by the model layer.
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
    // The marker uses the beta name (`ce-dispatch-beta-metadata`) per the
    // beta-skills framework's "internal references" rule: beta skills
    // reference themselves by their beta names. On promotion to stable,
    // the framework's checklist re-renames this marker alongside the skill
    // directory.
    expect(TEMPLATE_BODY).toContain("ce-dispatch-beta-metadata")
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

  test("plan-handoff.md routes the dispatch option to a user-typed /ce-dispatch-beta", () => {
    // ce-dispatch-beta carries `disable-model-invocation: true` per the
    // beta-skills framework triplet, which blocks the platform's
    // skill-invocation primitive. The routing must therefore tell the user
    // to type the slash command directly — firing the primitive in this
    // case would be silently dropped by the model layer (the bug Codex
    // Comment 12 / P1 flagged).
    expect(PLAN_HANDOFF_BODY).toContain(
      "- **Dispatch to external agents** ->",
    )
    // Routing must reference the beta slash command, not the bare skill name.
    expect(PLAN_HANDOFF_BODY).toContain("/ce-dispatch-beta")
    // Routing must name the disable-model-invocation flag so future
    // editors understand WHY the routing isn't a Skill primitive call.
    expect(PLAN_HANDOFF_BODY).toContain("disable-model-invocation")
    // Routing must NOT instruct the model to fire the primitive — that
    // path is blocked. The phrase "Skill ce-dispatch-beta" is acceptable
    // only when explicitly negated ("do NOT attempt Skill ce-dispatch-beta").
    const dispatchBullet = PLAN_HANDOFF_BODY.match(
      /-\s+\*\*Dispatch to external agents\*\*[^\n]+/,
    )!
    expect(dispatchBullet[0]).toMatch(
      /(?:do not|don't|do \*\*not\*\*|do[^a-z]*\*\*not\*\*).{0,40}Skill ce-dispatch/i,
    )
  })

  test("ce-plan SKILL.md inline routing tells the user to type /ce-dispatch-beta", () => {
    // The inline routing in SKILL.md must mirror the plan-handoff.md
    // routing so an agent that hasn't loaded the reference still routes
    // correctly. With disable-model-invocation: true on ce-dispatch-beta,
    // the inline routing must NOT call the skill-invocation primitive —
    // it must end the turn with a one-line user-typed slash instruction.
    const phaseStart = PLAN_SKILL_BODY.indexOf("##### 5.3.8")
    expect(phaseStart).toBeGreaterThan(-1)
    const phaseRegion = PLAN_SKILL_BODY.slice(phaseStart)
    expect(phaseRegion).toMatch(
      /-\s+\*\*Dispatch to external agents\*\*\s*[—\-]+>?\s*[^\n]+/,
    )
    const dispatchBullet = phaseRegion.match(
      /-\s+\*\*Dispatch to external agents\*\*[^\n]+/,
    )
    expect(dispatchBullet).not.toBeNull()
    const bulletText = dispatchBullet![0]
    // Inline routing must reference the slash command and the flag.
    expect(bulletText).toContain("/ce-dispatch-beta")
    expect(bulletText).toContain("disable-model-invocation")
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

  test("Phase 4 status check applies an exact-match filter on headRefName", () => {
    // `gh pr list --search "head:..."` is substring-matched, not exact, so a
    // sibling branch like `dispatch/U3-add-rate-limiter-v2` will collide with
    // a search for `dispatch/U3-add-rate-limiter`. The status check must
    // post-filter the candidate rows so only those whose headRefName equals
    // the expected_branch survive, and must fall back to a body-content
    // search keyed on the U-ID when no candidate survives (e.g., the
    // workspace renamed the branch).
    const phase4Start = SKILL_BODY.indexOf("### Phase 4:")
    const phase4Region = SKILL_BODY.slice(phase4Start)
    const statusBlockMatch = phase4Region.match(
      /\*\*Check PR status \(1\)\*\*[\s\S]*?(?=\n- \*\*[A-Z])/,
    )
    expect(statusBlockMatch).not.toBeNull()
    const statusBlock = statusBlockMatch![0]
    // Must call out substring-matching as a known caveat.
    expect(statusBlock).toMatch(/substring-?match/i)
    // Must require headRefName is part of the --json projection so the post-
    // filter is possible.
    expect(statusBlock).toMatch(/headRefName/)
    // Must describe an exact-match filter.
    expect(statusBlock).toMatch(/exact[-\s]?match/i)
    // Must fall back to a body-content search keyed on the U-ID. The
    // `Unit ID:` line in the PR body (per the dispatch prompt template's
    // output contract) is the durable correlation key when branch-rename
    // breaks the head-search path.
    expect(statusBlock).toMatch(/in:body/)
    expect(statusBlock).toMatch(/Unit ID/)
  })

  test("Phase 4 status check does NOT use the invalid linked-issue: qualifier", () => {
    // Codex Comment 15 / P1: GitHub's documented PR-search qualifier is
    // `linked:issue` (a flag returning all PRs linked to any issue), NOT
    // `linked-issue:<n>` (no per-issue lookup syntax exists). An earlier
    // draft used `--search "linked-issue:<issue_number>"` as a fallback,
    // which would silently match nothing and leave units stuck. The
    // skill must use a documented GitHub-search qualifier (e.g., the
    // `in:body` content-search keyed on the U-ID line).
    //
    // The skill may *describe* the bad qualifier in negative prose
    // (e.g., "Do not use --search \"linked-issue:<n>\"") for context, but
    // must not pass it to gh as an actual code-block invocation. The
    // regex matches only when `gh pr list` and `linked-issue:` co-occur
    // inside a single inline-code span (no backtick boundary between
    // them) — that's the shape of an actual invocation. Negative-prose
    // mentions, where `linked-issue:` lives in its own inline-code span
    // separate from any `gh pr list`, don't trigger.
    const phase4Start = SKILL_BODY.indexOf("### Phase 4:")
    const phase4Region = SKILL_BODY.slice(phase4Start)
    const ghInvocations =
      phase4Region.match(/gh pr list[^`\n]*--search[^`\n]*linked-issue:/g) ?? []
    expect(ghInvocations.length).toBe(0)
  })

  test("Phase 4 status check retries on transient mergeable: UNKNOWN", () => {
    // GitHub computes mergeability asynchronously, so newly-opened PRs report
    // `mergeable: UNKNOWN` for several seconds after creation. Treating that
    // value as if it were CONFLICTING or MERGEABLE silently mis-routes the
    // merge gate. The status check must explicitly retry the mergeable poll
    // a small number of times before storing UNKNOWN as a final state, and
    // must surface the unknown state to the user when retries exhaust rather
    // than coercing it to a known value.
    const phase4Start = SKILL_BODY.indexOf("### Phase 4:")
    const phase4Region = SKILL_BODY.slice(phase4Start)
    const statusBlockMatch = phase4Region.match(
      /\*\*Check PR status \(1\)\*\*[\s\S]*?(?=\n- \*\*[A-Z])/,
    )
    const statusBlock = statusBlockMatch![0]
    expect(statusBlock).toMatch(/mergeable[`'"]?:?\s*`?UNKNOWN/i)
    // Some retry / re-poll language must be present.
    expect(statusBlock).toMatch(/re-?poll|retry|retries/i)
    // The skill must explicitly forbid coercing UNKNOWN to a known state.
    expect(statusBlock).toMatch(/(?:not|never|rather than).{0,40}MERGEABLE/i)
  })

  test("dispatched_units status uses one canonical lowercase enum across reads and writes", () => {
    // gh's PR-state JSON returns uppercase enums (`OPEN`, `MERGED`, `CLOSED`),
    // while the merge-routing block writes the merged status as lowercase
    // `merged` and the unblock-dispatch / loop-completion routings also key off
    // the lowercase form. If any read or write uses the uppercase form, a unit
    // merged via one path is treated as unmerged by the other, causing false
    // merge blocks or missed unblocking. The skill must declare a single
    // canonical lowercase taxonomy and explicitly map the uppercase gh enum to
    // it on ingest, never compare against the uppercase form directly.
    const phase3Start = SKILL_BODY.indexOf("### Phase 3:")
    const phase3End = SKILL_BODY.indexOf("### Phase 4:")
    const phase3Region = SKILL_BODY.slice(phase3Start, phase3End)
    // Phase 3 must declare the canonical taxonomy.
    expect(phase3Region).toMatch(/canonical/i)
    expect(phase3Region).toMatch(/lowercase/i)
    // Each canonical value should be enumerated as a lowercase backticked token.
    for (const value of [
      "pending",
      "issue_created",
      "pr_open",
      "merged",
      "closed",
      "failed",
    ]) {
      expect(phase3Region).toContain("`" + value + "`")
    }
    // The taxonomy must include the explicit gh-state -> lowercase mapping.
    expect(phase3Region).toMatch(/OPEN[^\n]*pr_open/)
    expect(phase3Region).toMatch(/MERGED[^\n]*\bmerged\b/)
    expect(phase3Region).toMatch(/CLOSED[^\n]*\bclosed\b/)

    // Phase 4 must not require an uppercase MERGED for the merge-gate
    // dependency check. The `MERGED` token may still appear inside the
    // documented `OPEN -> pr_open` / `MERGED -> merged` / `CLOSED -> closed`
    // mapping prose (for the gh-side enum), but a literal "in state `MERGED`"
    // dependency check would re-introduce the bug.
    const phase4Start = SKILL_BODY.indexOf("### Phase 4:")
    const phase4Region = SKILL_BODY.slice(phase4Start)
    expect(phase4Region).not.toMatch(/state\s+`MERGED`/)
    // The merge gate must reference the canonical lowercase status field.
    const mergeBlockMatch = phase4Region.match(
      /\*\*Merge a PR \(3\)\*\*[\s\S]*?(?=\n- \*\*[A-Z])/,
    )
    const mergeBlock = mergeBlockMatch![0]
    expect(mergeBlock).toMatch(/status:\s*merged/)
  })

  test("Phase 4 merge sync uses git fetch --prune to clear stale refs", () => {
    // `gh pr merge --delete-branch` removes the head ref on the remote, but
    // `git fetch origin` without `--prune` retains the stale local
    // `origin/<expected_branch>` ref. Subsequent `gh pr list --search
    // "head:..."` queries can match the stale ref and confuse the orchestrator
    // about whether a follow-up PR exists. The Phase 4 sync step must use
    // `git fetch --prune` so deleted branches are swept on the next sync.
    const phase4Start = SKILL_BODY.indexOf("### Phase 4:")
    const phase4Region = SKILL_BODY.slice(phase4Start)
    const mergeBlockMatch = phase4Region.match(
      /\*\*Merge a PR \(3\)\*\*[\s\S]*?(?=\n- \*\*[A-Z])/,
    )
    const mergeBlock = mergeBlockMatch![0]
    // The post-merge sync's git fetch must carry --prune.
    expect(mergeBlock).toMatch(/git fetch origin --prune/)
  })

  test("SKILL.md does not reference files outside its own directory tree", () => {
    // Codex Comment 17 / P1: AGENTS.md "File References in Skills" rule —
    // each skill directory is self-contained. SKILL.md must only reference
    // files under its own directory tree (`references/`, `assets/`,
    // `scripts/`). External references (sibling skills, plugin AGENTS.md,
    // absolute paths, parent-traversal `../`) break runtime resolution
    // and converter portability. The earlier draft pointed at
    // `plugins/compound-engineering/AGENTS.md` for the option-overflow
    // exception — that rule must be inlined here instead.
    //
    // Allowed prose mentions: docs/solutions/* (informational, not
    // load-bearing), agent names like ce-code-review (not file paths),
    // and references/* (under our own directory tree).
    //
    // Disallowed: plugins/.../AGENTS.md, plugins/.../skills/<other>/...,
    // ../<other-skill>/, /home/.../skills/, ~/.claude/...
    const externalPlugin = SKILL_BODY.match(
      /plugins\/[^\/\s`'"]+\/(?:AGENTS\.md|CLAUDE\.md|skills\/[^\/\s`'"]+\/)/g,
    ) ?? []
    // Filter out our own skill's path (which is fine to mention).
    const offendingPlugin = externalPlugin.filter(
      (m) => !m.includes("ce-dispatch-beta"),
    )
    expect(offendingPlugin).toEqual([])
    // No parent-traversal into a sibling skill.
    expect(SKILL_BODY).not.toMatch(/\.\.\/(?:[^\/\s`'"]+\/)+SKILL\.md/)
    // No absolute paths into the user's filesystem or plugin cache.
    expect(SKILL_BODY).not.toMatch(/\/home\/[^\/\s`'"]+\/[^\s`'"]*skills/)
    expect(SKILL_BODY).not.toMatch(/~\/\.claude\/plugins/)
  })

  test("dispatched_units exposes pr as a sub-object with consistent shape", () => {
    // The unit's PR slot must be a single sub-object whose shape is
    // declared once and read consistently everywhere. Phase 3 init must
    // declare `pr: null` (or equivalent), Phase 4 status check must
    // populate `pr` as a sub-object (not flat siblings like `pr_number`,
    // `pr_state`, etc.), and the dependency-graph render must read
    // `pr.number` (not a flat `pr_number`). Splitting state across two
    // namespaces re-introduces the same casing-class bug as the lifecycle
    // enum, where merge-routing writes one shape and graph-render reads
    // the other.
    const phase3Start = SKILL_BODY.indexOf("### Phase 3:")
    const phase4Start = SKILL_BODY.indexOf("### Phase 4:")
    const phase3Region = SKILL_BODY.slice(phase3Start, phase4Start)
    const phase4Region = SKILL_BODY.slice(phase4Start)
    // Phase 3 must declare `pr: null` as the initial slot.
    expect(phase3Region).toMatch(/pr:\s*null/)
    // Phase 4 status check must populate `pr` as a sub-object whose
    // documented keys include number/state/mergeable/ci_rollup.
    const statusBlockMatch = phase4Region.match(
      /\*\*Check PR status \(1\)\*\*[\s\S]*?(?=\n- \*\*[A-Z])/,
    )!
    const statusBlock = statusBlockMatch[0]
    expect(statusBlock).toMatch(/\.pr\b|`pr`\s*(?:as|sub-?object)/i)
    expect(statusBlock).toMatch(/\bnumber\b/)
    expect(statusBlock).toMatch(/\bmergeable\b/)
    // Graph render must read pr.number (not flat pr_number).
    const graphBlockMatch = phase4Region.match(
      /\*\*Show dependency graph \(5\)\*\*[\s\S]*?(?=\n- \*\*[A-Z]|\n\nIf the user)/,
    )!
    const graphBlock = graphBlockMatch[0]
    expect(graphBlock).toMatch(/pr\.number/)
    // Flat `pr_number` (a top-level scalar field) must not appear as the
    // canonical placeholder in the graph render — that was the drift the
    // P20 audit caught.
    expect(graphBlock).not.toMatch(/<pr_number>/)
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
