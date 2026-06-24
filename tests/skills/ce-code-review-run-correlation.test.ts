import { readFile } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"

async function readRepoFile(relativePath: string): Promise<string> {
  return readFile(path.join(process.cwd(), relativePath), "utf8")
}

type ArtifactRoutingFixture = {
  default_routing: RoutingCase
  override_routing: RoutingCase & {
    default_run_dir: string
    forbidden_artifacts: string[]
  }
  both_tokens: {
    input: { mode: string; run_id: string; artifact_dir: string }
    run_id: string
    artifact_path: string
    resolved_artifact_dir: string
  }
  malformed_primary_fallback: {
    run_id: string
    artifact_path: string
    accepted_artifact: string
    rejected_artifacts: string[]
  }
  plan_correlation: {
    explicit_plan: PlanCorrelationCase
    inferred_plan: PlanCorrelationCase
    no_plan: PlanCorrelationCase
  }
  collision: {
    artifact_dir: string
    status: string
    reviewer_dispatch_count: number
    reason: string
  }
  unsafe_paths: Array<{ artifact_dir: string; reason: string }>
  ce_codex_loop_integration: {
    attempts: Array<{
      attempt: number
      run_id: string
      artifact_dir: string
      artifact_path: string
      fallback_artifact: string
    }>
  }
}

type RoutingCase = {
  input: { mode: string; run_id: string; artifact_dir: string | null }
  resolved_artifact_dir: string
  artifact_path: string
  run_id: string
  artifacts: string[]
}

type PlanCorrelationCase = {
  input: { mode: string; plan: string | null }
  plan_path: string | null
  plan_source: "explicit" | "inferred" | "none"
  requirements_completeness: Record<string, unknown> | null
}

async function readArtifactRoutingFixture(): Promise<ArtifactRoutingFixture> {
  const raw = await readRepoFile("tests/fixtures/ce-code-review/artifact-routing.json")
  return JSON.parse(raw) as ArtifactRoutingFixture
}

function expectEveryArtifactUnder(artifacts: string[], directory: string) {
  for (const artifact of artifacts) {
    expect(artifact).toStartWith(`${directory}/`)
  }
}

describe("ce-code-review run correlation", () => {
  test("documents caller-provided run id and artifact dir tokens", async () => {
    const content = await readRepoFile("skills/ce-code-review/SKILL.md")
    const docs = await readRepoFile("docs/skills/ce-code-review.md")

    expect(content).toContain("run-id:<id>")
    expect(content).toContain("artifact-dir:<path>")
    expect(content).toContain("Validate `run-id:` for path safety")
    expect(content).toContain("fail closed on collisions")
    expect(content).toContain("Do not recover by newest modification time")

    expect(docs).toContain("run-id:<id>")
    expect(docs).toContain("artifact-dir:<path>")
  })

  test("JSON output and metadata carry matching correlation fields", async () => {
    const content = await readRepoFile("skills/ce-code-review/SKILL.md")

    expect(content).toContain('"run_id": "<run-id>"')
    expect(content).toContain('"artifact_path": "<resolved_artifact_dir>/"')
    expect(content).toContain('"plan_path": "docs/plans/example.md | null"')
    expect(content).toContain('"plan_source": "explicit | inferred | none"')
    expect(content).toContain("top-level `plan_path` and `plan_source`")
    expect(content).toContain("primary JSON, `review.json`, and `metadata.json`")
    expect(content).toMatch(/metadata\.json[\s\S]*"plan_path": "docs\/plans\/example\.md \| null"/)
    expect(content).toMatch(/metadata\.json[\s\S]*"plan_source": "explicit \| inferred \| none"/)
    expect(content).toContain("review.json")
    expect(content).toContain("metadata.json")
    expect(content).toContain("wrong-run artifact is ignored")
  })

  test("mode:agent JSON carries top-level plan correlation separately from requirements detail", async () => {
    const content = await readRepoFile("skills/ce-code-review/SKILL.md")
    const docs = await readRepoFile("docs/skills/ce-code-review.md")
    const fixture = await readArtifactRoutingFixture()

    expect(content).toContain("the primary JSON must always include top-level plan correlation fields")
    expect(content).toContain("requirements_completeness` carries the detailed requirement/unit assessment")
    expect(docs).toContain("top-level `plan_path` and `plan_source`")

    expect(fixture.plan_correlation.explicit_plan).toMatchObject({
      plan_path: "docs/plans/clamp-feature.md",
      plan_source: "explicit",
    })
    expect(fixture.plan_correlation.explicit_plan.requirements_completeness).toMatchObject({
      plan: "docs/plans/clamp-feature.md",
      plan_source: "explicit",
    })

    expect(fixture.plan_correlation.inferred_plan.plan_path).toBe("docs/plans/inferred-feature.md")
    expect(fixture.plan_correlation.inferred_plan.plan_source).toBe("inferred")
    expect(fixture.plan_correlation.inferred_plan.requirements_completeness).not.toBeNull()

    expect(fixture.plan_correlation.no_plan.plan_path).toBeNull()
    expect(fixture.plan_correlation.no_plan.plan_source).toBe("none")
    expect(fixture.plan_correlation.no_plan.requirements_completeness).toBeNull()
  })

  test("default routing uses the run-id directory and reports it as artifact_path", async () => {
    const fixture = await readArtifactRoutingFixture()
    const routing = fixture.default_routing

    expect(routing.input.artifact_dir).toBeNull()
    expect(routing.resolved_artifact_dir).toBe(
      `/tmp/compound-engineering/ce-code-review/${routing.run_id}`,
    )
    expect(routing.artifact_path).toBe(`${routing.resolved_artifact_dir}/`)
    expect(routing.artifacts).toContain(`${routing.resolved_artifact_dir}/review.json`)
    expect(routing.artifacts).toContain(`${routing.resolved_artifact_dir}/metadata.json`)
    expect(routing.artifacts).toContain(`${routing.resolved_artifact_dir}/files.txt`)
    expect(routing.artifacts).toContain(`${routing.resolved_artifact_dir}/full.diff`)
    expect(routing.artifacts).toContain(
      `${routing.resolved_artifact_dir}/correctness-reviewer.json`,
    )
    expectEveryArtifactUnder(routing.artifacts, routing.resolved_artifact_dir)
  })

  test("artifact-dir override routes every artifact to the supplied directory", async () => {
    const fixture = await readArtifactRoutingFixture()
    const routing = fixture.override_routing

    expect(routing.input.artifact_dir).toBe(routing.resolved_artifact_dir)
    expect(routing.artifact_path).toBe(`${routing.resolved_artifact_dir}/`)
    expect(routing.run_id).toBe("artifact-override-smoke")

    for (const expected of [
      "review.json",
      "metadata.json",
      "files.txt",
      "full.diff",
      "correctness-reviewer.json",
      "testing-reviewer.json",
      "validator.json",
      "agent-native-reviewer.md",
      "learnings-researcher.md",
    ]) {
      expect(routing.artifacts).toContain(`${routing.resolved_artifact_dir}/${expected}`)
    }

    expectEveryArtifactUnder(routing.artifacts, routing.resolved_artifact_dir)
    for (const forbidden of routing.forbidden_artifacts) {
      expect(forbidden).toStartWith(`${routing.default_run_dir}/`)
      expect(routing.artifacts).not.toContain(forbidden)
    }
  })

  test("run-id remains logical when artifact-dir overrides storage", async () => {
    const fixture = await readArtifactRoutingFixture()
    const routing = fixture.both_tokens

    expect(routing.run_id).toBe("logical-review-id")
    expect(routing.resolved_artifact_dir).toBe(routing.input.artifact_dir)
    expect(routing.artifact_path).toBe(`${routing.input.artifact_dir}/`)
    expect(routing.artifact_path).not.toContain(routing.run_id)
  })

  test("malformed primary fallback reads only the resolved artifact directory", async () => {
    const fixture = await readArtifactRoutingFixture()
    const fallback = fixture.malformed_primary_fallback

    expect(fallback.accepted_artifact).toBe(`${fallback.artifact_path}review.json`)
    expect(fallback.accepted_artifact).not.toStartWith(
      "/tmp/compound-engineering/ce-code-review/",
    )
    for (const rejected of fallback.rejected_artifacts) {
      expect(rejected).not.toBe(fallback.accepted_artifact)
    }
  })

  test("colliding artifact-dir fails before reviewer dispatch", async () => {
    const fixture = await readArtifactRoutingFixture()
    const collision = fixture.collision

    expect(collision.status).toBe("failed")
    expect(collision.reviewer_dispatch_count).toBe(0)
    expect(collision.reason).toContain("non-empty")
  })

  test("unsafe artifact-dir paths fail closed", async () => {
    const fixture = await readArtifactRoutingFixture()

    expect(fixture.unsafe_paths.map((pathCase) => pathCase.reason)).toEqual([
      "relative path",
      "parent traversal",
      "root path",
      "unresolved placeholder",
      "symlink target",
    ])
  })

  test("ce-codex-loop records and parses the exact artifact directory used", async () => {
    const fixture = await readArtifactRoutingFixture()

    for (const attempt of fixture.ce_codex_loop_integration.attempts) {
      expect(attempt.artifact_path).toBe(`${attempt.artifact_dir}/`)
      expect(attempt.fallback_artifact).toBe(`${attempt.artifact_dir}/review.json`)
      expect(attempt.artifact_path).not.toBe(
        `/tmp/compound-engineering/ce-code-review/${attempt.run_id}/`,
      )
    }
  })
})
