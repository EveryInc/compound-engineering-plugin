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

async function readArtifactRoutingFixture(): Promise<ArtifactRoutingFixture> {
  return JSON.parse(
    await readRepoFile("tests/fixtures/ce-code-review/artifact-routing.json"),
  ) as ArtifactRoutingFixture
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
})
