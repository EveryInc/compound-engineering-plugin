import { readdir, readFile } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"

async function readRepoFile(relativePath: string): Promise<string> {
  return readFile(path.join(process.cwd(), relativePath), "utf8")
}

type FileSet = {
  created: string[]
  modified: string[]
  deleted: string[]
}

type Manifest = FileSet & {
  temporarily_indexed: string[]
}

type ManifestCheckpoint = {
  label: string
  manifest: Manifest
  validated: boolean
}

type PlannedScope = FileSet & {
  test_paths: string[]
}

type PlanPathNormalization = {
  accepted: Array<{ raw: string; canonical: string }>
  rejected: Array<{ raw: string; reason: string }>
}

type Fixture = {
  scenario: string
  raw_plan_argument?: string
  canonical_plan_path?: string
  plan_path_normalization?: PlanPathNormalization
  terminal_status: string
  stage_sequence: string[]
  review_attempt_count: number
  review_attempts: Array<{ attempt: number; status?: string; verdict?: string; eligible_actionable_findings?: string[] }>
  review_invocations?: Array<{
    attempt: number
    plan_path: string
    stable_base: string
    manifest_path: string
    run_id: string
    artifact_dir: string
    command: string
  }>
  review_outputs?: Array<{
    attempt: number
    plan_path: string
    plan_source: string
    manifest_path: string
    reviewed_manifest: Manifest
    review_json?: {
      manifest_path: string
      reviewed_manifest: Manifest
    }
    metadata_json?: {
      manifest_path: string
      reviewed_manifest: Manifest
    }
    requirements_completeness: Record<string, unknown> | null
  }>
  planned_scope: PlannedScope
  manifest_checkpoints?: ManifestCheckpoint[]
  current_manifest?: Manifest
  reviewed_manifest: Manifest | null
  compound_outputs: FileSet
  final_repository_delta: Manifest
  finding_decisions: Array<Record<string, unknown>>
  compound_invocation_count: number
  actions: {
    commit: boolean
    push: boolean
    pr: boolean
    ci_watch: boolean
    release: boolean
  }
  [key: string]: unknown
}

async function readFixture(name: string): Promise<Fixture> {
  return JSON.parse(await readRepoFile(`tests/fixtures/ce-codex-loop/${name}.json`)) as Fixture
}

function manifestPaths(manifest: Manifest): string[] {
  return [...manifest.created, ...manifest.modified, ...manifest.deleted, ...manifest.temporarily_indexed]
}

function fileSetPaths(fileSet: FileSet): string[] {
  return [...fileSet.created, ...fileSet.modified, ...fileSet.deleted]
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort()
}

function expectNoShippingActions(fixture: Fixture): void {
  expect(fixture.actions).toEqual({
    commit: false,
    push: false,
    pr: false,
    ci_watch: false,
    release: false,
  })
}

function checkpoint(fixture: Fixture, label: string): ManifestCheckpoint {
  const found = fixture.manifest_checkpoints?.find((entry) => entry.label === label)
  expect(found).toBeDefined()
  expect(found?.validated).toBe(true)
  return found as ManifestCheckpoint
}

function expectManifestEquals(actual: Manifest, expected: Manifest): void {
  expect(actual).toEqual(expected)
}

function expectExplicitPlanReviewInvocations(fixture: Fixture, expectedAttempts: number[]): void {
  const expectedPlan = fixture.canonical_plan_path ?? "docs/plans/clamp-feature.md"

  expect(fixture.plan_path).toBe(expectedPlan)
  if (fixture.raw_plan_argument) {
    expect(fixture.raw_plan_argument).not.toBe(expectedPlan)
  }
  expect(fixture.review_invocations?.map((invocation) => invocation.attempt)).toEqual(expectedAttempts)
  expect(fixture.review_outputs?.map((output) => output.attempt)).toEqual(expectedAttempts)

  for (const invocation of fixture.review_invocations ?? []) {
    expect(invocation.plan_path).toBe(expectedPlan)
    expect(invocation.command).toContain("ce-code-review mode:agent")
    expect(invocation.command).toContain(`plan:${expectedPlan}`)
    expect(invocation.command).not.toContain(`plan:${fixture.raw_plan_argument}`)
    expect(invocation.command).toContain(`base:${invocation.stable_base}`)
    expect(invocation.command).toContain(`manifest:${invocation.manifest_path}`)
    expect(invocation.command).toContain(`run-id:${invocation.run_id}`)
    expect(invocation.command).toContain(`artifact-dir:${invocation.artifact_dir}`)
    expect(invocation.command).not.toMatch(/mode:agent base:/)
  }

  for (const output of fixture.review_outputs ?? []) {
    const invocation = fixture.review_invocations?.find((entry) => entry.attempt === output.attempt)
    expect(invocation).toBeDefined()
    expect(output.plan_path).toBe(expectedPlan)
    expect(output.plan_source).toBe("explicit")
    expect(output.manifest_path).toBe(invocation?.manifest_path)
    expect(output.reviewed_manifest).toEqual(output.review_json?.reviewed_manifest)
    expect(output.reviewed_manifest).toEqual(output.metadata_json?.reviewed_manifest)
    expect(output.review_json?.manifest_path).toBe(output.manifest_path)
    expect(output.metadata_json?.manifest_path).toBe(output.manifest_path)
    expect(output.requirements_completeness).not.toBeNull()
    expect(output.requirements_completeness?.plan_source).toBe("explicit")
  }
}

describe("ce-codex-loop contract", () => {
  test("defines a self-contained public orchestrator skill", async () => {
    const content = await readRepoFile("skills/ce-codex-loop/SKILL.md")

    expect(content).toContain("name: ce-codex-loop")
    expect(content).toContain("argument-hint:")
    expect(content).toContain("## Argument Parsing")
    expect(content).toContain("required existing code-execution plan path")
    expect(content).toContain("Reject missing, unreadable, `execution: knowledge-work`, or unsafe-scope plans")
    expect(content).toContain("Preflight downstream contracts before mutation")

    expect(content).toContain("references/stage-result-schemas.md")
    expect(content).toContain("references/terminal-statuses.md")
    expect(content).toContain("references/working-tree-manifest.md")
    expect(content).toContain("references/review-followup-eligibility.md")

    expect(content).not.toContain("skills/ce-work/")
    expect(content).not.toContain("skills/lfg/")
    expect(content).not.toContain("../ce-work")
    expect(content).not.toContain("../lfg")
  })

  test("orchestrates composition modes and preserves runtime mutation boundary", async () => {
    const content = await readRepoFile("skills/ce-codex-loop/SKILL.md")

    expect(content).toContain("ce-work mode:implementation-only")
    expect(content).toContain("ce-simplify-code mode:structured manifest:<manifest-path>")
    expect(content).toContain(
      "ce-code-review mode:agent plan:<canonical-plan-path> base:<stable-base> manifest:<manifest-path> run-id:<run-id> artifact-dir:<artifact-dir>",
    )
    expect(content).not.toContain("ce-code-review mode:agent base:<stable-base> manifest:<manifest-path> run-id:<run-id>")
    expect(content).toContain("ce-compound mode:headless")
    expect(content).toContain("run exactly once")
    expect(content).toContain("only after clean review and green final verification")
    expect(content).toContain("reviewed_manifest")
    expect(content).toContain("compound_outputs")
    expect(content).toContain("final_repository_delta")
    expect(content).toContain("`compound_outputs` are reported separately")
    expect(content).toContain("## Manifest Checkpoints")
    expect(content).toContain("before_review_attempt:<n>")
    expect(content).toContain("before_final_verification")

    expect(content).toMatch(/must never commit/i)
    expect(content).toMatch(/must never push/i)
    expect(content).toMatch(/must never create or edit a PR/i)
    expect(content).toMatch(/must never watch CI/i)
    expect(content).toMatch(/must never run release automation/i)
  })

  test("documents review-loop gates, three-attempt cap, and terminal statuses", async () => {
    const content = await readRepoFile("skills/ce-codex-loop/SKILL.md")

    expect(content).toContain("Clean review requires all three predicates")
    expect(content).toContain("status == complete")
    expect(content).toContain("verdict == Ready to merge")
    expect(content).toContain("actionable_findings.length == 0")
    expect(content).toContain("At most three total review attempts")
    expect(content).toContain("one eligible fix wave")
    expect(content).toContain("one repair-or-revert pass")
    expect(content).toContain("Never review an unchanged tree")
    expect(content).toContain("Never review a known red tree")
    expect(content).toContain("Never review findings outside the current manifest")

    for (const status of [
      "success",
      "failed",
      "unverified",
      "already_satisfied",
      "quality_verified_but_compound_failed",
    ]) {
      expect(content).toContain(status)
    }
  })

  test("documents complete planned-scope extraction before the overlap gate", async () => {
    const content = await readRepoFile("skills/ce-codex-loop/SKILL.md")

    expect(content).toContain("## Planned Scope Extraction")
    expect(content).toContain('"created": []')
    expect(content).toContain('"modified": []')
    expect(content).toContain('"deleted": []')
    expect(content).toContain('"test_paths": []')
    expect(content).toContain("Create, Modify, Delete, Test")
    expect(content).toContain("inline test path phrases")
    expect(content).toContain("Do not guess paths from ambiguous prose")
    expect(content).toContain("Staged and unstaged changes both count")
    expect(content).toContain("untracked file at any planned Create, Modify, Delete, or Test path")
    expect(content).toContain("Unrelated untracked paths remain outside loop ownership")
    expect(content).toContain("tests/math.test.ts")
    expect(content).toContain("before `ce-work` runs")
  })

  test("normalizes raw plan arguments before mutation and review correlation", async () => {
    const content = await readRepoFile("skills/ce-codex-loop/SKILL.md")
    const docs = await readRepoFile("docs/skills/ce-codex-loop.md")
    const statuses = await readRepoFile("skills/ce-codex-loop/references/terminal-statuses.md")
    const fixture = await readFixture("success")

    expect(content).toContain("raw_plan_argument")
    expect(content).toContain("canonical_plan_path")
    expect(content).toContain("Do not compare review `plan_path` with `raw_plan_argument`")
    expect(docs).toContain("raw_plan_argument")
    expect(docs).toContain("canonical_plan_path")
    expect(statuses).toContain("`plan_path` is the terminal-report alias for `canonical_plan_path`")

    expect(fixture.raw_plan_argument).toBe("./docs/plans/../plans/clamp-feature.md")
    expect(fixture.canonical_plan_path).toBe("docs/plans/clamp-feature.md")
    expect(fixture.plan_path).toBe(fixture.canonical_plan_path)
    expect(fixture.plan_path_normalization).toBeDefined()
    for (const accepted of fixture.plan_path_normalization?.accepted ?? []) {
      expect(accepted.canonical).toBe(fixture.canonical_plan_path)
      expect(accepted.raw).not.toContain("<")
    }
    expect(fixture.plan_path_normalization?.rejected.map((entry) => entry.reason)).toEqual([
      "repo escape",
      "symlink target escapes repository",
      "directory",
      "unresolved placeholder",
      "missing file",
    ])
    expectExplicitPlanReviewInvocations(fixture, [1, 2])
  })

  test("review invocations always forward the supplied plan path explicitly", async () => {
    const fixture = await readFixture("success")

    expectExplicitPlanReviewInvocations(fixture, [1, 2])
  })

  test("subsequent review attempts retain the same explicit plan argument", async () => {
    const fixture = await readFixture("failed-review-exhausted")

    expectExplicitPlanReviewInvocations(fixture, [1, 2, 3])
  })

  test("missing or malformed review plan argument fails closed before inferred intent", async () => {
    const fixture = await readFixture("missing-review-plan-argument")

    expect(fixture.terminal_status).toBe("failed")
    expect(fixture.reason).toBe("missing_review_plan_argument")
    expect(fixture.review_attempt_count).toBe(0)
    expect(fixture.review_invocations).toEqual([])
    expect(fixture.review_outputs).toEqual([])
    expect(fixture.inferred_intent_fallback_used).toBe(false)
    expect(fixture.compound_invocation_count).toBe(0)
  })

  test("uses skill-local review followup policy only", async () => {
    const content = await readRepoFile("skills/ce-codex-loop/SKILL.md")
    const policy = await readRepoFile("skills/ce-codex-loop/references/review-followup-eligibility.md")

    expect(content).toContain("Load `references/review-followup-eligibility.md`")
    expect(policy).toContain("Filter only `actionable_findings`")
    expect(policy).toContain("Severity is priority only")
    expect(policy).toContain("`requires_verification` controls test scope only")
    expect(policy).toContain("outside the manifest")
    expect(policy).toContain("No eligible findings")
    expect(policy).toContain("terminal `failed`")
    expect(policy).not.toContain("skills/ce-work")
    expect(policy).not.toContain("skills/lfg")
  })

  test("fixtures cover every terminal path and common invariant", async () => {
    const fixtureDir = path.join(process.cwd(), "tests/fixtures/ce-codex-loop")
    const files = await readdir(fixtureDir)
    const statuses = new Set<string>()

    for (const file of files.filter((name) => name.endsWith(".json"))) {
      const fixture = JSON.parse(await readFile(path.join(fixtureDir, file), "utf8")) as Fixture
      if (fixture.terminal_status) statuses.add(fixture.terminal_status)
      expect(fixture.stage_sequence.length).toBeGreaterThan(0)
      expect(fixture.review_attempts).toHaveLength(fixture.review_attempt_count)
      expect(fixture).toHaveProperty("planned_scope")
      expect(fixture).toHaveProperty("current_manifest")
      expect(fixture).toHaveProperty("reviewed_manifest")
      if (fixture.review_attempt_count === 0) {
        expect(fixture.reviewed_manifest).toBeNull()
      }
      expect(fixture).toHaveProperty("compound_outputs")
      expect(fixture).toHaveProperty("final_repository_delta")
      for (const checkpoint of fixture.manifest_checkpoints ?? []) {
        expect(checkpoint.label.length).toBeGreaterThan(0)
        expect(checkpoint.validated).toBe(true)
        expect(checkpoint.manifest).toHaveProperty("temporarily_indexed")
      }
      expectNoShippingActions(fixture)
    }

    expect([...statuses].sort()).toEqual([
      "already_satisfied",
      "failed",
      "quality_verified_but_compound_failed",
      "success",
      "unverified",
    ])
  })

  test("success fixture proves one review fix cycle and post-review compound separation", async () => {
    const fixture = await readFixture("success")

    expect(fixture.terminal_status).toBe("success")
    expect(fixture.stage_sequence).toEqual([
      "preflight",
      "snapshot",
      "overlap_gate",
      "implementation",
      "manifest_refresh:implementation",
      "simplification",
      "verification:simplification",
      "review:attempt-1",
      "review_followup",
      "fix_wave:1",
      "verification:fix_wave",
      "manifest_refresh:fix_wave",
      "review:attempt-2",
      "final_verification",
      "compound",
      "report",
    ])
    expect(fixture.review_attempt_count).toBe(2)
    expect(fixture.review_attempts[0]?.eligible_actionable_findings).toEqual(["F-001"])
    expect(fixture.review_attempts[1]?.eligible_actionable_findings).toEqual([])
    expect(fixture.fix_waves).toEqual([{ wave: 1, finding_ids: ["F-001"], verification_status: "passed" }])
    expect(fixture.manifest_refreshes).toContain("after_fix_wave")
    expect(fixture.compound_invocation_count).toBe(1)

    const reviewed = manifestPaths(fixture.reviewed_manifest)
    expect(reviewed).toEqual(["src/math.ts", "tests/math.test.ts"])
    expect(fileSetPaths(fixture.compound_outputs)).toEqual(["docs/solutions/clamp-helper.md"])
    expect(reviewed).not.toContain("docs/solutions/clamp-helper.md")
    expect(uniqueSorted(manifestPaths(fixture.final_repository_delta))).toEqual(
      uniqueSorted([...reviewed, ...fileSetPaths(fixture.compound_outputs)]),
    )
    expect(fixture.finding_decisions).toEqual([{ id: "F-001", decision: "applied", fix_wave: 1 }])
  })

  test("simplification scope changes refresh the manifest before verification and review", async () => {
    const fixture = await readFixture("simplification-changes-scope")

    expect(fixture.terminal_status).toBe("success")
    expect(fixture.stage_sequence).toEqual([
      "preflight",
      "snapshot",
      "overlap_gate",
      "implementation",
      "manifest_checkpoint:after_implementation",
      "simplification",
      "manifest_checkpoint:after_simplification",
      "manifest_checkpoint:before_simplification_verification",
      "verification:simplification",
      "manifest_checkpoint:before_review_attempt-1",
      "review:attempt-1",
      "manifest_checkpoint:before_final_verification",
      "final_verification",
      "compound",
      "report",
    ])
    expect(fixture.review_attempt_count).toBe(1)
    expect(fixture.compound_invocation_count).toBe(1)

    const postSimplification = checkpoint(fixture, "after_simplification").manifest
    expect(postSimplification.created).toEqual(["src/clamp.ts"])
    expectManifestEquals(checkpoint(fixture, "before_simplification_verification").manifest, postSimplification)
    expectManifestEquals(checkpoint(fixture, "before_review_attempt:1").manifest, postSimplification)
    expectManifestEquals(fixture.reviewed_manifest, postSimplification)
    expect(fixture.simplification).toEqual({
      files: {
        created: ["src/clamp.ts"],
        modified: [],
        deleted: [],
      },
    })
    expect(fileSetPaths(fixture.compound_outputs)).toEqual(["docs/solutions/clamp-helper.md"])
    expect(manifestPaths(fixture.reviewed_manifest)).not.toContain("docs/solutions/clamp-helper.md")
  })

  test("no-op simplification still records a validated post-simplification checkpoint", async () => {
    const fixture = await readFixture("noop-simplification-checkpoint")

    expect(fixture.terminal_status).toBe("success")
    expect(fixture.stage_sequence).toEqual([
      "preflight",
      "snapshot",
      "overlap_gate",
      "implementation",
      "manifest_checkpoint:after_implementation",
      "simplification",
      "manifest_checkpoint:after_simplification",
      "manifest_checkpoint:before_simplification_verification",
      "verification:simplification",
      "manifest_checkpoint:before_review_attempt-1",
      "review:attempt-1",
      "manifest_checkpoint:before_final_verification",
      "final_verification",
      "compound",
      "report",
    ])
    expect(fixture.review_attempt_count).toBe(1)
    expect(fixture.compound_invocation_count).toBe(1)
    expect(fixture.simplification).toEqual({
      files: {
        created: [],
        modified: [],
        deleted: [],
      },
    })

    const afterImplementation = checkpoint(fixture, "after_implementation").manifest
    expectManifestEquals(checkpoint(fixture, "after_simplification").manifest, afterImplementation)
    expectManifestEquals(checkpoint(fixture, "before_simplification_verification").manifest, afterImplementation)
    expectManifestEquals(checkpoint(fixture, "before_review_attempt:1").manifest, afterImplementation)
    expectManifestEquals(fixture.reviewed_manifest, afterImplementation)
  })

  test("review fixes that change scope refresh before verification and re-review", async () => {
    const fixture = await readFixture("review-fix-changes-scope")

    expect(fixture.terminal_status).toBe("success")
    expect(fixture.stage_sequence).toEqual([
      "preflight",
      "snapshot",
      "overlap_gate",
      "implementation",
      "manifest_checkpoint:after_implementation",
      "simplification",
      "manifest_checkpoint:after_simplification",
      "manifest_checkpoint:before_simplification_verification",
      "verification:simplification",
      "manifest_checkpoint:before_review_attempt-1",
      "review:attempt-1",
      "review_followup",
      "fix_wave:1",
      "manifest_checkpoint:after_review_fix-1",
      "manifest_checkpoint:before_fix_verification-1",
      "verification:fix_wave-1",
      "manifest_checkpoint:before_review_attempt-2",
      "review:attempt-2",
      "manifest_checkpoint:before_final_verification",
      "final_verification",
      "compound",
      "report",
    ])
    expect(fixture.review_attempt_count).toBe(2)
    expect(fixture.compound_invocation_count).toBe(1)
    expect(fixture.finding_decisions).toEqual([{ id: "F-TEST-001", decision: "applied", fix_wave: 1 }])

    const afterFix = checkpoint(fixture, "after_review_fix:1").manifest
    expect(afterFix.created).toEqual(["tests/clamp-edge.test.ts"])
    expectManifestEquals(checkpoint(fixture, "before_fix_verification:1").manifest, afterFix)
    expectManifestEquals(checkpoint(fixture, "before_review_attempt:2").manifest, afterFix)
    expectManifestEquals(fixture.reviewed_manifest, afterFix)
    expect(fixture.review_outputs?.at(0)?.reviewed_manifest).toEqual(
      checkpoint(fixture, "before_review_attempt:1").manifest,
    )
    expect(fixture.review_outputs?.at(1)?.reviewed_manifest).toEqual(afterFix)
    expect(fixture.stale_manifest_guard).toEqual({
      mismatched_attempt: 2,
      expected_manifest: afterFix,
      returned_manifest: checkpoint(fixture, "before_review_attempt:1").manifest,
      terminal_status: "failed",
      stopped_before: ["review_followup", "fix_wave", "review:attempt-3", "compound"],
    })
  })

  test("repair or revert after red verification refreshes before repair verification and re-review", async () => {
    const fixture = await readFixture("repair-revert-refresh")

    expect(fixture.terminal_status).toBe("success")
    expect(fixture.stage_sequence).toEqual([
      "preflight",
      "snapshot",
      "overlap_gate",
      "implementation",
      "manifest_checkpoint:after_implementation",
      "simplification",
      "manifest_checkpoint:after_simplification",
      "manifest_checkpoint:before_simplification_verification",
      "verification:simplification",
      "manifest_checkpoint:before_review_attempt-1",
      "review:attempt-1",
      "review_followup",
      "fix_wave:1",
      "manifest_checkpoint:after_review_fix-1",
      "manifest_checkpoint:before_fix_verification-1",
      "verification:fix_wave-1:red",
      "repair_or_revert:1",
      "manifest_checkpoint:after_repair_or_revert-1",
      "manifest_checkpoint:before_repair_verification-1",
      "verification:repair-1",
      "manifest_checkpoint:before_review_attempt-2",
      "review:attempt-2",
      "manifest_checkpoint:before_final_verification",
      "final_verification",
      "compound",
      "report",
    ])
    expect(fixture.review_attempt_count).toBe(2)
    expect(fixture.compound_invocation_count).toBe(1)
    expect(fixture.verification_gates).toEqual({
      fix_wave_1: "failed",
      repair_1: "passed",
    })

    const repaired = checkpoint(fixture, "after_repair_or_revert:1").manifest
    expect(repaired.created).toEqual([])
    expect(repaired.modified).toEqual(["src/math.ts", "tests/math.test.ts"])
    expectManifestEquals(checkpoint(fixture, "before_repair_verification:1").manifest, repaired)
    expectManifestEquals(checkpoint(fixture, "before_review_attempt:2").manifest, repaired)
    expectManifestEquals(fixture.reviewed_manifest, repaired)
  })

  test("review exhaustion fixture proves exactly three attempts and no compound", async () => {
    const fixture = await readFixture("failed-review-exhausted")

    expect(fixture.terminal_status).toBe("failed")
    expect(fixture.reason).toBe("review_attempts_exhausted")
    expect(fixture.review_attempts.map((attempt) => attempt.attempt)).toEqual([1, 2, 3])
    expect(fixture.absent_attempts).toEqual([4])
    expect(fixture.stage_sequence).not.toContain("review:attempt-4")
    expect(fixture.compound_invocation_count).toBe(0)
    expect(fixture.reviewed_manifest).toBeNull()
    expect(fixture.current_manifest).toEqual({
      created: [],
      modified: ["src/math.ts", "tests/math.test.ts"],
      deleted: [],
      temporarily_indexed: [],
    })
    expect(fixture.finding_decisions.at(-1)).toEqual({
      id: "F-003",
      decision: "unresolved",
      attempt: 3,
    })
  })

  test("malformed primary JSON fallback accepts only the correlated artifact", async () => {
    const fixture = await readFixture("malformed-primary-json-fallback")

    expect(fixture.primary_response).toEqual({ malformed: true })
    expect(fixture.stage_sequence).toContain("review_artifact_fallback")
    expect(fixture.artifact_recovery).toEqual({
      supplied_run_id: "ce-loop-review-1",
      supplied_artifact_dir: "/tmp/ce-loop/review-1",
      accepted_artifact: "/tmp/ce-loop/review-1/review.json",
      rejected_artifacts: ["/tmp/ce-loop/review-newer-unrelated/review.json"],
    })
    expect(fixture.recovered_review_json).toEqual(fixture.recovered_metadata_json)
    expect(fixture.recovered_review_json).toMatchObject({
      manifest_path: "/tmp/ce-loop/manifest-attempt-1.json",
      reviewed_manifest: fixture.reviewed_manifest,
    })
    expect(fixture.review_attempt_count).toBe(1)
    expect(fixture.compound_invocation_count).toBe(1)
  })

  test("unverified fixture stops before review and compound when no command exists", async () => {
    const fixture = await readFixture("unverified")

    expect(fixture.terminal_status).toBe("unverified")
    expect(fixture.verification_resolution).toEqual({
      found: [],
      inferred: [],
      executed: [],
    })
    expect(fixture.review_attempt_count).toBe(0)
    expect(fixture.compound_invocation_count).toBe(0)
    expect(fixture.stage_sequence).not.toContain("review:attempt-1")
    expect(fixture.stage_sequence).not.toContain("compound")
    expect(fixture.reviewed_manifest).toBeNull()
    expect(fixture.current_manifest).toEqual({
      created: [],
      modified: ["src/math.ts"],
      deleted: [],
      temporarily_indexed: [],
    })
  })

  test("compound failure fixture proves one failed invocation without retry", async () => {
    const fixture = await readFixture("compound-failed")

    expect(fixture.terminal_status).toBe("quality_verified_but_compound_failed")
    expect(fixture.quality_gates).toEqual({
      simplification_verification: "passed",
      review: "clean",
      final_verification: "passed",
    })
    expect(fixture.compound_invocation_count).toBe(1)
    expect(fixture.compound).toEqual({ status: "failed", retry_count: 0 })
  })

  test("out-of-manifest finding fixture rejects the finding and preserves unrelated content", async () => {
    const fixture = await readFixture("out-of-manifest-finding")

    expect(fixture.terminal_status).toBe("failed")
    expect(fixture.finding_decisions).toEqual([
      {
        id: "F-OUT-001",
        file: "docs/solutions/unreviewed.md",
        decision: "rejected",
        reason: "out_of_scope",
        applied: false,
      },
    ])
    expect(fixture.reviewed_manifest).toBeNull()
    expect(manifestPaths(fixture.current_manifest!)).not.toContain("docs/solutions/unreviewed.md")
    expect(fixture.unrelated_file).toEqual({
      path: "docs/solutions/unreviewed.md",
      content_changed: false,
    })
    expect(fixture.compound_invocation_count).toBe(0)
  })

  test("pre-existing overlap fixture blocks before ce-work and preserves staged state", async () => {
    const fixture = await readFixture("pre-existing-overlap")

    expect(fixture.terminal_status).toBe("failed")
    expect(fixture.stage_sequence).toEqual(["preflight", "snapshot", "overlap_gate", "report"])
    expect(fixture.planned_scope).toEqual({
      created: ["src/clamp.ts"],
      modified: ["src/math.ts"],
      deleted: ["src/legacyClamp.ts"],
      test_paths: ["tests/math.test.ts"],
    })
    expect(fixture.overlap).toEqual({
      tracked: ["tests/math.test.ts"],
      untracked_planned_collisions: ["src/clamp.ts"],
      staged: ["tests/math.test.ts"],
      unstaged: ["src/math.ts"],
    })
    expect(fixture.ce_work_invocation_count).toBe(0)
    expect(fixture.original_bytes_preserved).toBe(true)
    expect(fixture.staged_state_preserved).toBe(true)
  })

  test("preflight invalid plan report keeps unavailable path and base fields null", async () => {
    const fixture = await readFixture("preflight-invalid-plan")

    expect(fixture.terminal_status).toBe("failed")
    expect(fixture.reason).toBe("unsafe_plan_path")
    expect(fixture.stage_sequence).toEqual(["preflight", "report"])
    expect(fixture.raw_plan_argument).toBe("../outside.md")
    expect(fixture.canonical_plan_path).toBeNull()
    expect(fixture.plan_path).toBeNull()
    expect(fixture.stable_review_base).toBeNull()
    expect(fixture.reviewed_manifest).toBeNull()
    expect(fixture.current_manifest).toEqual({
      created: [],
      modified: [],
      deleted: [],
      temporarily_indexed: [],
    })
    expect(fixture.review_attempt_count).toBe(0)
    expect(fixture.compound_invocation_count).toBe(0)
    expect(fixture.stage_results).toEqual([
      {
        stage: "preflight",
        status: "failed",
        issues: ["unsafe plan path escapes repository"],
      },
    ])
  })

  for (const [fixtureName, expectedPath] of [
    ["untracked-create-overlap", "src/clamp.ts"],
    ["untracked-modify-overlap", "src/math.ts"],
    ["untracked-delete-overlap", "src/legacyClamp.ts"],
    ["untracked-test-overlap", "tests/math.test.ts"],
  ] as const) {
    test(`${fixtureName} blocks before ce-work and preserves state`, async () => {
      const fixture = await readFixture(fixtureName)

      expect(fixture.terminal_status).toBe("failed")
      expect(fixture.reason).toBe("pre_existing_untracked_overlap")
      expect(fixture.stage_sequence).toEqual(["preflight", "snapshot", "overlap_gate", "report"])
      expect(fixture.overlap).toEqual({
        tracked: [],
        untracked_planned_collisions: [expectedPath],
        staged: [],
        unstaged: [],
      })
      expect(fixture.ce_work_invocation_count).toBe(0)
      expect(fixture.original_bytes_preserved).toBe(true)
      expect(fixture.staged_state_preserved).toBe(true)
      expect(fixture.head_preserved).toBe(true)
      expect(fixture.unrelated_work_preserved).toBe(true)
      expect(fixture.review_attempt_count).toBe(0)
      expect(fixture.compound_invocation_count).toBe(0)
    })
  }

  test("unrelated untracked file remains outside planned scope and reviewed manifest", async () => {
    const fixture = await readFixture("unrelated-untracked-allowed")

    expect(fixture.terminal_status).toBe("success")
    expect(fixture.ce_work_invocation_count).toBe(1)
    expect(fixture.unrelated_untracked).toEqual({
      path: "notes/local-scratch.md",
      byte_identical: true,
      staged: false,
      in_planned_scope: false,
      in_reviewed_manifest: false,
    })
    expect(manifestPaths(fixture.reviewed_manifest)).not.toContain("notes/local-scratch.md")
    expect(uniqueSorted([
      ...fixture.planned_scope.created,
      ...fixture.planned_scope.modified,
      ...fixture.planned_scope.deleted,
      ...fixture.planned_scope.test_paths,
    ])).not.toContain("notes/local-scratch.md")
  })
})
