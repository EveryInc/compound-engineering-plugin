import { afterEach, describe, expect, test } from "bun:test"
import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  checkUpstreamParity,
  loadUpstreamBaseline,
} from "../integrations/orca/upstream-parity.mjs"

const REPO_ROOT = path.resolve(import.meta.dir, "..")
const tempRoots: string[] = []

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })))
})

async function makeUpstreamFixture(integrationRevision = 1) {
  const baseline = await loadUpstreamBaseline(REPO_ROOT)
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ce-orca-upstream-"))
  tempRoots.push(root)

  for (const skill of baseline.skillInventory) {
    await fs.mkdir(path.join(root, "skills", skill), { recursive: true })
  }

  const anchorsByFile = new Map<string, string[]>()
  for (const hook of baseline.hookAnchors) {
    const anchors = anchorsByFile.get(hook.file) ?? []
    anchors.push(hook.contains)
    anchorsByFile.set(hook.file, anchors)
  }
  for (const [file, anchors] of anchorsByFile) {
    const target = path.join(root, file)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, anchors.join("\n"))
  }

  for (const [workflow, source] of Object.entries(baseline.promptAssetSources)) {
    const target = path.join(root, source)
    await fs.mkdir(target, { recursive: true })
    for (const role of baseline.promptAssets[workflow] ?? []) {
      await fs.writeFile(path.join(target, role), `# ${role}\n`)
    }
  }

  await fs.mkdir(path.join(root, ".claude-plugin"), { recursive: true })
  await fs.mkdir(path.join(root, ".codex-plugin"), { recursive: true })
  await fs.mkdir(path.join(root, "integrations", "orca"), { recursive: true })
  await fs.writeFile(path.join(root, "package.json"), JSON.stringify({ version: baseline.version }))
  await fs.writeFile(
    path.join(root, ".claude-plugin", "plugin.json"),
    JSON.stringify({ version: baseline.version }),
  )
  await fs.writeFile(
    path.join(root, ".codex-plugin", "plugin.json"),
    JSON.stringify({ version: baseline.version }),
  )
  await fs.writeFile(
    path.join(root, "integrations", "orca", "protocol.json"),
    JSON.stringify({
      integration: {
        revision: integrationRevision,
        versionFormat: "{upstream.version}-orca.{integration.revision}",
      },
    }),
  )

  return { baseline, root }
}

describe("CE-Orca upstream parity", () => {
  test("matches the recorded upstream skill, role, hook, and version baseline", async () => {
    const baseline = await loadUpstreamBaseline(REPO_ROOT)
    expect(await checkUpstreamParity(REPO_ROOT, baseline)).toEqual([])
  })

  test("rejects malformed, missing, and stale upstream provenance commits", async () => {
    const baseline = await loadUpstreamBaseline(REPO_ROOT)

    expect(await checkUpstreamParity(REPO_ROOT, { ...baseline, commit: "not-a-commit" })).toContainEqual({
      code: "upstream_commit_invalid",
      commit: "not-a-commit",
    })
    expect(await checkUpstreamParity(REPO_ROOT, { ...baseline, commit: "f".repeat(40) })).toContainEqual({
      code: "upstream_commit_missing",
      commit: "f".repeat(40),
    })
    const staleIssues = await checkUpstreamParity(REPO_ROOT, {
      ...baseline,
      commit: "cb892f50a6bdfc9befdd15394fe1e88b45aaf767",
    })
    const staleIssue = staleIssues.find((issue) => issue.code === "upstream_commit_not_current")
    expect(staleIssue).toMatchObject({
      code: "upstream_commit_not_current",
      commit: "cb892f50a6bdfc9befdd15394fe1e88b45aaf767",
      expected: baseline.commit,
    })
    expect(staleIssue?.ref).toMatch(/^refs\/remotes\/(?:upstream|origin)\/main$/)
  })

  test("ignores unrelated upstream additions when protected anchors are unchanged", async () => {
    const { baseline, root } = await makeUpstreamFixture()
    await fs.mkdir(path.join(root, "docs"), { recursive: true })
    await fs.writeFile(path.join(root, "docs", "upstream-note.md"), "unrelated upstream change\n")

    expect(await checkUpstreamParity(root, baseline)).toEqual([])
  })

  test("fails deterministically when an upstream role is added", async () => {
    const { baseline, root } = await makeUpstreamFixture()
    const source = baseline.promptAssetSources["ce-doc-review"]
    await fs.writeFile(path.join(root, source, "new-upstream-reviewer.md"), "# New reviewer\n")

    expect(await checkUpstreamParity(root, baseline)).toContainEqual({
      code: "role_inventory_drift",
      scope: "ce-doc-review",
      expected: baseline.promptAssets["ce-doc-review"],
      actual: [...baseline.promptAssets["ce-doc-review"], "new-upstream-reviewer.md"].sort(),
    })
  })

  test("detects the first role added to a workflow that currently has none", async () => {
    const { baseline, root } = await makeUpstreamFixture()
    const source = baseline.promptAssetSources.lfg
    await fs.mkdir(path.join(root, source), { recursive: true })
    await fs.writeFile(path.join(root, source, "new-lfg-reviewer.md"), "# New reviewer\n")

    expect(await checkUpstreamParity(root, baseline)).toContainEqual({
      code: "role_inventory_drift",
      scope: "lfg",
      expected: [],
      actual: ["new-lfg-reviewer.md"],
    })
  })

  test("fails deterministically when an upstream role is removed or renamed", async () => {
    const { baseline, root } = await makeUpstreamFixture()
    const source = baseline.promptAssetSources["ce-simplify-code"]
    const removed = baseline.promptAssets["ce-simplify-code"][0]
    await fs.rm(path.join(root, source, removed))

    const expectedActual = baseline.promptAssets["ce-simplify-code"].filter((role) => role !== removed)
    expect(await checkUpstreamParity(root, baseline)).toContainEqual({
      code: "role_inventory_drift",
      scope: "ce-simplify-code",
      expected: baseline.promptAssets["ce-simplify-code"],
      actual: expectedActual,
    })
  })

  test("fails deterministically when a dispatch hook anchor drifts", async () => {
    const { baseline, root } = await makeUpstreamFixture()
    const hook = baseline.hookAnchors.find((candidate) => candidate.id === "ce-doc-review.persona-dispatch")
    expect(hook).toBeDefined()
    await fs.writeFile(path.join(root, hook!.file), "upstream rewrote this dispatch seam\n")

    expect(await checkUpstreamParity(root, baseline)).toContainEqual({
      code: "hook_anchor_missing",
      id: hook!.id,
      file: hook!.file,
    })
  })

  test("protects the native organizational and specialized-review ownership seams", async () => {
    for (const id of ["ce-plan.organizational-research", "ce-compound.specialized-review"]) {
      const { baseline, root } = await makeUpstreamFixture()
      const hook = baseline.hookAnchors.find((candidate) => candidate.id === id)
      expect(hook, id).toBeDefined()
      const skill = await fs.readFile(path.join(root, hook!.file), "utf8")
      await fs.writeFile(path.join(root, hook!.file), skill.replace(hook!.contains, ""))

      expect(await checkUpstreamParity(root, baseline), id).toContainEqual({
        code: "hook_anchor_missing",
        id,
        file: hook!.file,
      })
    }
  })

  test("detects drift at the upstream ce-work execution-engine seam", async () => {
    const { baseline, root } = await makeUpstreamFixture()
    const hook = baseline.hookAnchors.find(
      (candidate) => candidate.id === "ce-work.execution-engine-selection",
    )
    expect(hook).toBeDefined()
    await fs.writeFile(path.join(root, hook!.file), "upstream rewrote engine selection\n")

    expect(await checkUpstreamParity(root, baseline)).toContainEqual({
      code: "hook_anchor_missing",
      id: hook!.id,
      file: hook!.file,
    })
  })

  test("fails when the native skill inventory changes without a baseline decision", async () => {
    const { baseline, root } = await makeUpstreamFixture()
    await fs.mkdir(path.join(root, "skills", "ce-new-upstream-skill"))

    expect(await checkUpstreamParity(root, baseline)).toContainEqual({
      code: "skill_inventory_drift",
      expected: baseline.skillInventory,
      actual: [...baseline.skillInventory, "ce-new-upstream-skill"].sort(),
    })
  })

  test("accepts a synchronized fork-release version while preserving the upstream base", async () => {
    const { baseline, root } = await makeUpstreamFixture(7)
    const releaseVersion = `${baseline.version}-orca.7`
    await fs.writeFile(path.join(root, "package.json"), JSON.stringify({ version: releaseVersion }))
    await fs.writeFile(path.join(root, ".claude-plugin", "plugin.json"), JSON.stringify({ version: releaseVersion }))
    await fs.writeFile(path.join(root, ".codex-plugin", "plugin.json"), JSON.stringify({ version: releaseVersion }))

    expect(await checkUpstreamParity(root, baseline)).toEqual([])
  })

  test("fails when native manifests disagree about the release identity", async () => {
    const { baseline, root } = await makeUpstreamFixture()
    await fs.writeFile(
      path.join(root, ".codex-plugin", "plugin.json"),
      JSON.stringify({ version: `${baseline.version}-orca.2` }),
    )

    expect(await checkUpstreamParity(root, baseline)).toContainEqual({
      code: "manifest_version_mismatch",
      manifests: [
        { file: "package.json", version: baseline.version },
        { file: ".claude-plugin/plugin.json", version: baseline.version },
        { file: ".codex-plugin/plugin.json", version: `${baseline.version}-orca.2` },
      ],
    })
  })
})
