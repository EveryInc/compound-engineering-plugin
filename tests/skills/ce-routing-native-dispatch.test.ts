import { readFileSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"

const read = (relativePath: string): string =>
  readFileSync(path.join(process.cwd(), relativePath), "utf8")

type Catalog = {
  roles: Record<string, {
    class: string
    owner: string
    adapter_family: string
  }>
  sites: Record<string, SiteMetadata>
}

type SiteMetadata = {
  file: string
  source_marker?: string
  roles: string[]
  adapter_family: string | Record<string, string>
}

const catalog = JSON.parse(read("scripts/routing/dispatch-roles.json")) as Catalog

const SPECIALIZED_NATIVE_SITE_EXCLUSIONS: Record<string, {
  roleAdapterFamily?: string
  ownerAdapterFamily?: string
}> = {
  "ce-brainstorm.approach-native": { roleAdapterFamily: "read-only-elevation" },
  "ce-plan.plan-author-native": { roleAdapterFamily: "read-only-elevation" },
  "ce-optimize.learnings-research": { ownerAdapterFamily: "isolated-optimization-experiment" },
  "ce-optimize.repo-research": { ownerAdapterFamily: "isolated-optimization-experiment" },
}

const REVIEW_REGRESSION_SITES = [
  "ce-code-review.finding-validator",
  "ce-doc-review.repeat-local-reviewers",
  "ce-plan.deepening-research",
  "ce-plan.universal-plan-research",
  "ce-ideate.ideation-fleet",
  "ce-ideate.ideation-fleet-variants",
  "ce-ideate.ideation-axis-recovery",
  "ce-ideate.adversarial-filter",
  "ce-ideate.universal-ideation-fleet",
  "ce-ideate.universal-basis-verifier",
  "ce-riffrec-feedback-analysis.source-mapping",
] as const

const nativeSiteEntries = Object.entries(catalog.sites)
  .filter(([, metadata]) => metadata.adapter_family === "native-generic-subagent")
const routedNativeSiteEntries = nativeSiteEntries
  .filter(([site]) => !Object.hasOwn(SPECIALIZED_NATIVE_SITE_EXCLUSIONS, site))
const routedNativeSites = routedNativeSiteEntries.map(([site]) => site)
const contextSkills = [...new Set(routedNativeSiteEntries.flatMap(([, metadata]) =>
  metadata.roles.map((role) => `skills/${catalog.roles[role].owner}/SKILL.md`),
))].sort()

function localGateIndexes(lines: string[], label: string, markerIndex: number): number[] {
  const prefix = `**Routing batch: \`${label}\`.**`
  const lowerBound = Math.max(0, markerIndex - 12)
  return lines.flatMap((line, index) => {
    if (index < lowerBound || index >= markerIndex || !line.trimStart().startsWith(prefix)) return []
    const interveningMarker = lines.slice(index + 1, markerIndex)
      .some((candidate) => candidate.includes("ce-dispatch-site:"))
    return interveningMarker ? [] : [index]
  })
}

function routingGate(site: string): string {
  const siteMetadata = catalog.sites[site]
  expect(siteMetadata, `catalog site missing: ${site}`).toBeDefined()
  const lines = read(siteMetadata.file).split("\n")
  const label = siteMetadata.source_marker ?? site
  const marker = `ce-dispatch-site:${label}`
  const markerLine = siteMetadata.file.endsWith(".sh") ? `# ${marker}` : `<!-- ${marker} -->`
  const markerIndexes = lines.flatMap((line, index) => line.trim() === markerLine ? [index] : [])
  expect(markerIndexes, `${siteMetadata.file} must contain exactly one occurrence marker for ${site}`).toHaveLength(1)
  const gateIndexes = localGateIndexes(lines, label, markerIndexes[0])
  expect(
    gateIndexes,
    `${siteMetadata.file} must contain one occurrence-local routing gate within 12 lines before ${marker}`,
  ).toHaveLength(1)
  return lines[gateIndexes[0]]
}

function section(body: string, start: string, end: string): string {
  const startIndex = body.indexOf(start)
  expect(startIndex, `missing section start: ${start}`).toBeGreaterThanOrEqual(0)
  const endIndex = body.indexOf(end, startIndex + start.length)
  expect(endIndex, `missing section end: ${end}`).toBeGreaterThan(startIndex)
  return body.slice(startIndex, endIndex)
}

describe("native routing source contract", () => {
  test("specialized native branches stay narrowly excluded by role adapter family", () => {
    const excluded = nativeSiteEntries
      .filter(([site]) => Object.hasOwn(SPECIALIZED_NATIVE_SITE_EXCLUSIONS, site))
      .map(([site]) => site)
      .sort()
    expect(excluded).toEqual(Object.keys(SPECIALIZED_NATIVE_SITE_EXCLUSIONS).sort())

    for (const [site, exclusion] of Object.entries(SPECIALIZED_NATIVE_SITE_EXCLUSIONS)) {
      const metadata = catalog.sites[site]
      expect(metadata.adapter_family).toBe("native-generic-subagent")
      if (exclusion.roleAdapterFamily) {
        for (const role of metadata.roles) {
          expect(catalog.roles[role].adapter_family, `${site} must remain owned by its specialized adapter`).toBe(exclusion.roleAdapterFamily)
        }
      }
      if (exclusion.ownerAdapterFamily) {
        const owners = new Set(metadata.roles.map((role) => catalog.roles[role].owner))
        expect(owners.size, `${site} must have exactly one specialized owner`).toBe(1)
        const ownerFamilies = Object.values(catalog.roles)
          .filter((role) => role.owner === [...owners][0])
          .map((role) => role.adapter_family)
        expect(ownerFamilies, `${site} owner must retain its specialized adapter`).toContain(exclusion.ownerAdapterFamily)
      }
    }
  })

  test.each(contextSkills)("%s keeps routing private and selector-only", (relativePath) => {
    const body = read(relativePath)
    const contextLine = body.split("\n").find((line) => line.includes("**Native routing context.**")) ?? ""
    const invariantLine = body.split("\n").find((line) => line.includes("**Native routing invariants.**")) ?? ""

    expect(contextLine).toContain("ce-routing-context/v1")
    expect(contextLine).toContain("current-task")
    expect(contextLine).toContain("still-active session")
    expect(contextLine).toContain("provenance-bearing caller")
    expect(contextLine).toContain("project-instruction intent")
    expect(contextLine).toMatch(/conflicting equal-authority bindings.*before model invocation/i)
    expect(contextLine).toMatch(/incidental model or harness mentions are not intent/i)
    expect(contextLine).toMatch(/inherited frozen context/i)
    expect(contextLine).toMatch(/exact full self-validating.*`parent_snapshot` envelope/i)
    expect(contextLine).toMatch(/`parent_snapshot_id`.*match/i)
    expect(contextLine).toMatch(/never.*ID-only.*(?:live routing sources|live sources)/i)
    expect(contextLine).toMatch(/frozen (?:role\/instance )?bindings.*recovery/i)
    expect(contextLine).toMatch(/nested CE skills.*without adding it to their product arguments/i)

    expect(invariantLine).toContain("references/execution-routing.md")
    expect(invariantLine).toContain("ce-default")
    expect(invariantLine).toContain("exact built-in arguments")
    expect(invariantLine).toMatch(/unsupported configured selector.*unavailable.*policy/i)
    expect(invariantLine).toContain("never prompt rewriting or typed-agent substitution")
    expect(invariantLine).toMatch(/prompt (?:bytes|assets byte-stable)/i)
    expect(invariantLine).toContain("tools")
    expect(invariantLine).toContain("permission mode")
    expect(invariantLine).toMatch(/mutation|read-only posture|write posture|integration\/commit ownership/i)
    expect(invariantLine).toMatch(/roster|fix-list/i)
    expect(invariantLine).toMatch(/concurrency|sequential\/parallel scheduling/i)
    expect(invariantLine).toMatch(/failure semantics/i)
    expect(invariantLine).toContain("top-level orchestrator unchanged")
    expect(invariantLine).toMatch(/required-route failure prevents.*call/i)
    expect(invariantLine).toContain("Group redacted successes by profile, class, source, and outcome")
    expect(invariantLine).toContain("fallback, mismatch, or blocker separately")

    const owner = relativePath.split("/")[1]
    const routingReference = read(`skills/${owner}/references/execution-routing.md`)
    expect(routingReference).toContain(
      "python3 -I -S \"$SKILL_DIR/scripts/ce-routing.py\" --request-file <request-path>",
    )
    expect(routingReference).toMatch(/exact full parent snapshot envelope.*as `parent_snapshot`/i)
    expect(routingReference).toMatch(/ID-only parent request is rejected/i)
  })

  test("every cataloged native boundary resolves its catalog roles as one selected batch", () => {
    const routedClasses = new Set<string>()

    for (const [site, siteMetadata] of routedNativeSiteEntries) {
      expect(siteMetadata.adapter_family).toBe("native-generic-subagent")

      const gate = routingGate(site)
      expect(gate).toContain("references/execution-routing.md")
      expect(gate).toContain("ce-routing/v1")
      expect(gate).toContain("resolve_batch")
      expect(gate.match(/resolve_batch/g) ?? []).toHaveLength(1)
      expect(gate).toMatch(/before .*(?:prompt|persona|template|unit packet)/i)
      expect(gate).toMatch(/existing|already-selected|selected|selects|fixed|retained/i)

      const namedRoles = Object.keys(catalog.roles).filter((role) => gate.includes(`\`${role}\``))
      for (const role of siteMetadata.roles) {
        const localRole = role.slice(role.indexOf(".") + 1)
        if (!namedRoles.includes(role) && gate.includes(`\`${localRole}\``)) namedRoles.push(role)
      }
      expect(namedRoles.sort(), `${site} must name only its cataloged stable role IDs`).toEqual([...siteMetadata.roles].sort())
      for (const role of siteMetadata.roles) {
        const localRole = role.slice(role.indexOf(".") + 1)
        expect(
          gate.includes(`\`${role}\``) || gate.includes(`\`${localRole}\``),
          `${site} must resolve ${role}`,
        ).toBe(true)
        routedClasses.add(catalog.roles[role].class)
      }
    }

    expect([...routedClasses].sort()).toEqual([
      "implementation",
      "reasoning",
      "research",
      "review",
      "verification",
    ])
  })

  test("the review-reported native sites remain explicit regressions", () => {
    for (const site of REVIEW_REGRESSION_SITES) {
      expect(routedNativeSites).toContain(site)
      expect(routingGate(site)).toContain("resolve_batch")
    }
  })

  test("a routing gate elsewhere in one file cannot cover another occurrence", () => {
    const lines = [
      "**Routing batch: `ce-test.second`.** stale file-wide gate",
      "<!-- ce-dispatch-site:ce-test.first -->",
      "Dispatch the first subagent.",
      ...Array.from({ length: 12 }, () => "ordinary workflow prose"),
      "<!-- ce-dispatch-site:ce-test.second -->",
      "Dispatch the second subagent.",
    ]
    expect(localGateIndexes(lines, "ce-test.second", 15)).toEqual([])
  })

  test("dynamic fan-out uses one request entry per existing instance", () => {
    for (const site of [
      "ce-ideate.user-research-distillation",
      "ce-ideate.axis-evidence-scouts",
      "ce-debug.hypothesis-investigation",
      "ce-sweep.source-fetchers",
      "ce-sweep.media-analyzers",
      "ce-compound-refresh.investigator",
      "ce-resolve-pr-feedback.full-fixers",
      "ce-work.native-implementation",
      "ce-work.review-fix-batches",
      "ce-plan.deepening-research",
      "ce-plan.universal-plan-research",
      "ce-ideate.ideation-fleet",
      "ce-ideate.ideation-fleet-variants",
      "ce-ideate.ideation-axis-recovery",
      "ce-riffrec-feedback-analysis.source-mapping",
    ] as const) {
      expect(routingGate(site)).toMatch(/one request entry per/i)
    }
  })

  test("dependent waves carry the complete frozen parent snapshot envelope", () => {
    for (const site of [
      "ce-code-review.finding-validator",
      "ce-doc-review.repeat-local-reviewers",
      "ce-plan.external-research",
      "ce-plan.deepening-research",
      "ce-ideate.issue-cluster",
      "ce-ideate.ideation-fleet",
      "ce-ideate.ideation-fleet-variants",
      "ce-ideate.ideation-axis-recovery",
      "ce-ideate.adversarial-filter",
      "ce-ideate.universal-ideation-fleet",
      "ce-ideate.universal-basis-verifier",
      "ce-sweep.media-analyzers",
      "ce-compound.session-history",
      "ce-compound-refresh.replacement-writer",
      "ce-work.review-fix-batches",
      "ce-work.review-fix-single",
      "ce-work.figma-design-verification",
    ] as const) {
      const gate = routingGate(site)
      expect(gate).toMatch(/full.*`parent_snapshot` envelope/i)
      expect(gate).toMatch(/first.*snapshot/i)
      expect(gate).toMatch(/`parent_snapshot_id`.*(?:only|if).*match/i)
      expect(gate).toMatch(/never.*ID-only.*(?:live routing sources|live sources)/i)
      expect(gate).toMatch(/frozen binding.*recovery/i)
    }
    expect(routingGate("ce-plan.external-research")).toMatch(/Mixed.*web-researcher.*first batch/i)
    expect(routingGate("ce-plan.external-research")).toMatch(/second batch.*parent_snapshot/i)
    expect(routingGate("ce-compound-refresh.replacement-writer")).toMatch(/main thread.*first native batch/i)
  })

  test("routing cannot activate optional work or alter workflow scheduling", () => {
    const guards: Array<[string, RegExp]> = [
      ["ce-plan.agent-native-triage", /cannot cause the triage role to be selected/i],
      ["ce-brainstorm.slack-researcher", /never opts the user into Slack research/i],
      ["ce-ideate.issue-scan", /cannot activate issue intelligence/i],
      ["ce-ideate.axis-evidence-scouts", /cannot create axes/i],
      ["ce-pov.grounding-scouts", /Tier 1 keeps the precedent role absent/i],
      ["ce-sweep.source-fetchers", /cannot add a feedback source/i],
      ["ce-compound.specialist-reviewers", /cannot add a specialist/i],
      ["ce-compound-refresh.replacement-writer", /cannot make replacement writers concurrent/i],
      ["ce-resolve-pr-feedback.targeted-fixer", /cannot turn a reply, decline, or `needs-human` verdict into a fixer call/i],
      ["ce-work.native-implementation", /cannot .*create a unit.*make an unsafe wave parallel/i],
      ["ce-work.review-fix-batches", /cannot add a deferred finding, regroup files, or make coupled batches parallel/i],
      ["ce-work.figma-design-verification", /cannot add Figma verification/i],
    ]

    for (const [site, guard] of guards) expect(routingGate(site)).toMatch(guard)
  })
})

describe("nested routing context", () => {
  test("LFG sanitizes, forwards, and reuses the versioned private envelope", () => {
    const lfg = read("skills/lfg/SKILL.md")
    const privateContext = section(lfg, "## Private Routing Context", "## Per-stage routing carriers")

    for (const field of [
      "ce-routing-context/v1",
      "current-task intent",
      "still-active session intent",
      "provenance-bearing caller intent",
      "project-instruction intent",
      "snapshot ID",
      "source revisions",
      "parent snapshot ID",
      "resolved role/class bindings",
      "ordered candidates",
      "reset intent",
      "source authority",
    ]) {
      expect(privateContext).toContain(field)
    }

    expect(privateContext).toMatch(/conflicting equal-authority bindings.*before step 1/i)
    expect(privateContext).toMatch(/incidental model or harness names.*quoted text.*filenames/i)
    expect(privateContext).toMatch(/exact full self-validating.*snapshot object/i)
    expect(privateContext).toMatch(/full first-wave snapshot.*`parent_snapshot` envelope/i)
    expect(privateContext).toMatch(/`parent_snapshot_id`.*only when it matches/i)
    expect(privateContext).toMatch(/never use ID-only lineage.*live routing sources/i)
    expect(privateContext).toMatch(/frozen role\/instance bindings.*recovery/i)
    expect(privateContext).toMatch(/unknown context version, stale source revision, or parent mismatch.*blocker/i)
    expect(privateContext).toMatch(/private caller control state, never inside.*product argument/i)
    expect(privateContext).toMatch(/cannot preserve private caller state.*stop before the affected routed call/i)
    expect(privateContext).toMatch(/never changes LFG's active model, stage order, stage roster, mutation authority, or shipping ownership/i)
    expect(privateContext).toMatch(/group redacted successful native receipts.*profile, class, source, and outcome/i)

    expect(lfg).toMatch(/Strip any incoming routing-context carrier.*never expose its bytes downstream/i)
    expect(lfg).toMatch(/Never pass.*private routing context.*planning or review \*\*product\*\* input/i)
    expect(lfg).toMatch(/Invoke the `ce-plan` skill.*private caller state/i)
    expect(lfg).toMatch(/Invoke the `ce-work` skill.*private caller state, not in this string/i)
    expect(lfg).toMatch(/Invoke the `ce-simplify-code` skill.*private caller state/i)
    expect(lfg).toMatch(/Invoke the `ce-code-review` skill.*private caller state/i)
    expect(lfg).toMatch(/Reuse the exact same frozen `ce-routing-context\/v1`.*do not renormalize intent or reread live routing sources/i)
  })

  test("the restrictive feedback skill authorizes only the co-located resolver command", () => {
    const skill = read("skills/ce-resolve-pr-feedback/SKILL.md")
    const allowedTools = skill.split("\n").find((line) => line.startsWith("allowed-tools:"))
    const routingReference = read("skills/ce-resolve-pr-feedback/references/execution-routing.md")

    expect(allowedTools).toBe(
      "allowed-tools: Bash(gh *), Bash(git *), Bash(python3 -I -S */scripts/ce-routing.py --request-file *), Read",
    )
    expect(routingReference).toContain(
      "python3 -I -S \"$SKILL_DIR/scripts/ce-routing.py\" --request-file <request-path>",
    )
    expect(routingReference).toMatch(/local control-plane read.*does not grant the worker shell, file, network, or mutation capabilities/i)
  })
})
