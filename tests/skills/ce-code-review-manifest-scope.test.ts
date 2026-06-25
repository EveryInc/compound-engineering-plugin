import { readFile } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"

async function readRepoFile(relativePath: string): Promise<string> {
  return readFile(path.join(process.cwd(), relativePath), "utf8")
}

type ReviewedManifest = {
  created: string[]
  modified: string[]
  deleted: string[]
  temporarily_indexed: string[]
}

type ArtifactRoutingFixture = {
  manifest_correlation: {
    with_manifest: {
      manifest_path: string
      reviewed_manifest: ReviewedManifest
      review_json: { manifest_path: string; reviewed_manifest: ReviewedManifest }
      metadata_json: { manifest_path: string; reviewed_manifest: ReviewedManifest }
    }
    no_manifest: { manifest_path: null; reviewed_manifest: null }
    invalid_manifests: Array<{
      case: string
      status: string
      reviewer_dispatch_count: number
      reason: string
    }>
  }
}

type StandardsContextFixture = {
  root_standards_context: {
    reviewed_manifest: ReviewedManifest
    standards_paths: string[]
    project_standards_allowed_reads: string[]
    finding: { file: string; line: number; evidence: string[] }
    reviewed_manifest_after_review: ReviewedManifest
  }
  directory_standards_context: {
    reviewed_manifest: ReviewedManifest
    standards_paths: string[]
    project_standards_allowed_reads: string[]
  }
  finding_target_restriction: {
    reviewed_manifest: ReviewedManifest
    standards_paths: string[]
    attempted_finding: { file: string; line: number }
    classification: string
    actionable: boolean
  }
  standards_file_changed_in_manifest: {
    reviewed_manifest: ReviewedManifest
    standards_paths: string[]
    attempted_finding: { file: string; line: number }
    classification: string
    actionable: boolean
  }
  arbitrary_out_of_manifest_read: {
    reviewed_manifest: ReviewedManifest
    standards_paths: string[]
    attempted_read: string
    allowed: boolean
  }
  reviewer_isolation: {
    reviewed_manifest: ReviewedManifest
    standards_paths: string[]
    allowed_reads_by_reviewer: Record<string, string[]>
  }
  no_standards_paths_manifest_mode: {
    reviewed_manifest: ReviewedManifest
    standards_paths: string[]
    unrestricted_discovery: boolean
    coverage: { standards_context: string }
  }
  manifest_integrity: {
    reviewed_manifest: ReviewedManifest
    standards_paths: string[]
    files: string[]
    actionable_finding_targets: string[]
    downstream_fix_batches: string[][]
  }
  remote_context: {
    scope_mode: string
    head_ref: string
    standards_paths: string[]
    local_workspace_standards_used: boolean
    read_strategy: string
    fallback_without_head_or_supplied_content: string
  }
}

async function readArtifactRoutingFixture(): Promise<ArtifactRoutingFixture> {
  return JSON.parse(
    await readRepoFile("tests/fixtures/ce-code-review/artifact-routing.json"),
  ) as ArtifactRoutingFixture
}

async function readStandardsContextFixture(): Promise<StandardsContextFixture> {
  return JSON.parse(
    await readRepoFile("tests/fixtures/ce-code-review/manifest-standards-context.json"),
  ) as StandardsContextFixture
}

function manifestTargetSet(manifest: ReviewedManifest): Set<string> {
  return new Set([
    ...manifest.created,
    ...manifest.modified,
    ...manifest.deleted,
    ...manifest.temporarily_indexed,
  ])
}

describe("ce-code-review manifest scope", () => {
  test("documents manifest argument parsing for mode:agent", async () => {
    const content = await readRepoFile("skills/ce-code-review/SKILL.md")

    expect(content).toContain("manifest:<path>")
    expect(content).toContain("Recognized only in `mode:agent`")
    expect(content).toContain("manifest-scoped review")
    expect(content).toContain("agent JSON echoes null manifest fields")
    expect(content).toContain("Default review behavior without manifest remains unchanged")
    expect(content).toContain("reviewed_manifest")
    expect(content).toContain("manifest_path")
  })

  test("manifest scope restricts files, findings, and untracked coverage", async () => {
    const content = await readRepoFile("skills/ce-code-review/SKILL.md")
    const diffScope = await readRepoFile("skills/ce-code-review/references/diff-scope.md")

    expect(content).toContain("Build `FILES:` and `DIFF:` by intersecting")
    expect(content).toContain("stable `base:<ref>` diff with manifest entries")
    expect(content).toContain("generated create-file diff snippets")
    expect(content).toContain("full file content")
    expect(content).toContain("without changing the git index")
    expect(content).toContain("Deleted manifest paths are represented with delete snippets")
    expect(content).toContain("Out-of-manifest findings are never added to `actionable_findings`")
    expect(content).toContain("reported in `coverage.out_of_scope_findings`")

    expect(diffScope).toContain("Manifest-scoped review")
    expect(diffScope).toContain("Inspect only manifest paths")
    expect(diffScope).toContain("Do not Read/Grep out-of-manifest paths")
    expect(diffScope).toContain("context-only paths")
    expect(diffScope).toContain("the only such allowlist is `<standards-paths>`")
    expect(diffScope).toContain("finding's `file` and `line` point to the violating manifest path")
  })

  test("manifest correlation preserves modified, created-untracked, and deleted paths", async () => {
    const fixture = await readArtifactRoutingFixture()
    const withManifest = fixture.manifest_correlation.with_manifest

    expect(withManifest.reviewed_manifest).toEqual({
      created: ["src/new-helper.ts"],
      modified: ["src/math.ts", "tests/math.test.ts"],
      deleted: ["src/old-helper.ts"],
      temporarily_indexed: [],
    })
    expect(withManifest.review_json.reviewed_manifest).toEqual(withManifest.reviewed_manifest)
    expect(withManifest.metadata_json.reviewed_manifest).toEqual(withManifest.reviewed_manifest)
    expect(withManifest.review_json.manifest_path).toBe(withManifest.manifest_path)
    expect(withManifest.metadata_json.manifest_path).toBe(withManifest.manifest_path)
  })

  test("no-manifest mode remains compatible with standalone review", async () => {
    const fixture = await readArtifactRoutingFixture()
    const content = await readRepoFile("skills/ce-code-review/SKILL.md")
    const noManifest = fixture.manifest_correlation.no_manifest

    expect(content).toContain("standalone review behavior remains unchanged")
    expect(content).not.toContain("Missing manifest fails in `mode:agent`")
    expect(noManifest.manifest_path).toBeNull()
    expect(noManifest.reviewed_manifest).toBeNull()
  })

  test("malformed or unsafe manifests fail before reviewer dispatch", async () => {
    const content = await readRepoFile("skills/ce-code-review/SKILL.md")
    const fixture = await readArtifactRoutingFixture()

    expect(content).toContain("Invalid or unsafe manifests fail before reviewer dispatch")
    expect(fixture.manifest_correlation.invalid_manifests.map((entry) => entry.case)).toEqual([
      "malformed-json",
      "missing-arrays",
      "absolute-path",
      "parent-traversal",
    ])
    for (const invalid of fixture.manifest_correlation.invalid_manifests) {
      expect(invalid.status).toBe("failed")
      expect(invalid.reviewer_dispatch_count).toBe(0)
    }
  })

  test("standards context is readable without entering reviewed manifest", async () => {
    const fixture = await readStandardsContextFixture()
    const root = fixture.root_standards_context
    const targets = manifestTargetSet(root.reviewed_manifest)

    expect(root.project_standards_allowed_reads).toEqual(["AGENTS.md"])
    expect(targets.has(root.finding.file)).toBe(true)
    expect(root.finding.evidence[0]).toContain("AGENTS.md")
    expect(root.reviewed_manifest_after_review).toEqual(root.reviewed_manifest)
    expect(root.reviewed_manifest_after_review.modified).not.toContain("AGENTS.md")
  })

  test("directory-scoped standards context includes only governing ancestors", async () => {
    const fixture = await readStandardsContextFixture()
    const directory = fixture.directory_standards_context

    expect(directory.reviewed_manifest.modified).toEqual(["skills/foo/SKILL.md"])
    expect(directory.project_standards_allowed_reads).toEqual([
      "AGENTS.md",
      "skills/AGENTS.md",
    ])
    expect(directory.standards_paths.every((entry) => entry.endsWith("AGENTS.md"))).toBe(true)
  })

  test("standards findings stay target-scoped unless the standards file is in the manifest", async () => {
    const fixture = await readStandardsContextFixture()
    const rejected = fixture.finding_target_restriction
    const accepted = fixture.standards_file_changed_in_manifest

    expect(manifestTargetSet(rejected.reviewed_manifest).has(rejected.attempted_finding.file)).toBe(false)
    expect(rejected.classification).toBe("out_of_scope")
    expect(rejected.actionable).toBe(false)

    expect(manifestTargetSet(accepted.reviewed_manifest).has(accepted.attempted_finding.file)).toBe(true)
    expect(accepted.classification).toBe("in_scope")
    expect(accepted.actionable).toBe(true)
  })

  test("standards context does not permit arbitrary reads or reviewer-wide exemptions", async () => {
    const fixture = await readStandardsContextFixture()
    const arbitrary = fixture.arbitrary_out_of_manifest_read
    const isolation = fixture.reviewer_isolation.allowed_reads_by_reviewer

    expect(arbitrary.standards_paths).toEqual(["AGENTS.md"])
    expect(manifestTargetSet(arbitrary.reviewed_manifest).has(arbitrary.attempted_read)).toBe(false)
    expect(arbitrary.standards_paths).not.toContain(arbitrary.attempted_read)
    expect(arbitrary.allowed).toBe(false)

    expect(isolation["project-standards"]).toEqual(["src/example.ts", "AGENTS.md"])
    for (const reviewer of ["correctness", "testing", "maintainability"]) {
      expect(isolation[reviewer]).toEqual(["src/example.ts"])
      expect(isolation[reviewer]).not.toContain("AGENTS.md")
    }
  })

  test("missing standards paths in manifest mode records coverage instead of unrestricted discovery", async () => {
    const fixture = await readStandardsContextFixture()
    const noStandards = fixture.no_standards_paths_manifest_mode

    expect(noStandards.standards_paths).toEqual([])
    expect(noStandards.unrestricted_discovery).toBe(false)
    expect(noStandards.coverage.standards_context).toBe("unavailable")
  })

  test("standards context never pollutes FILES, reviewed_manifest, actionable targets, or fix batches", async () => {
    const fixture = await readStandardsContextFixture()
    const integrity = fixture.manifest_integrity

    expect(integrity.files).toEqual(["src/example.ts"])
    expect(integrity.files).not.toContain("AGENTS.md")
    expect(integrity.reviewed_manifest.modified).toEqual(["src/example.ts"])
    expect(integrity.actionable_finding_targets).toEqual(["src/example.ts"])
    expect(integrity.downstream_fix_batches).toEqual([["src/example.ts"]])
    expect(integrity.downstream_fix_batches.flat()).not.toContain("AGENTS.md")
  })

  test("remote manifest review does not use local standards for a different head", async () => {
    const fixture = await readStandardsContextFixture()
    const remote = fixture.remote_context

    expect(remote.scope_mode).toBe("pr-remote")
    expect(remote.local_workspace_standards_used).toBe(false)
    expect(remote.read_strategy).toBe("git show refs/review/pr-994-head:AGENTS.md")
    expect(remote.fallback_without_head_or_supplied_content).toBe("degraded_coverage")
  })
})
