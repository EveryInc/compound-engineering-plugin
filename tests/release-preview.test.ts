import { mkdtemp, mkdir, writeFile } from "fs/promises"
import os from "os"
import path from "path"
import { describe, expect, test } from "bun:test"
import { buildReleasePreview, bumpVersion, loadCurrentVersions } from "../src/release/components"

describe("release preview", () => {
  test("uses changed files to determine affected components and next versions", async () => {
    const versions = await loadCurrentVersions()
    const preview = await buildReleasePreview({
      title: "fix: adjust ce-plan wording",
      files: ["skills/ce-plan/SKILL.md"],
    })

    expect(preview.components).toHaveLength(1)
    expect(preview.components[0].component).toBe("compound-engineering")
    expect(preview.components[0].inferredBump).toBe("patch")
    expect(preview.components[0].nextVersion).toBe(bumpVersion(versions["compound-engineering"], "patch"))
  })

  test("supports per-component overrides without affecting unrelated components", async () => {
    const versions = await loadCurrentVersions()
    const preview = await buildReleasePreview({
      title: "fix: refine compound-engineering prompts",
      files: ["README.md"],
      overrides: {
        "compound-engineering": "minor",
      },
    })

    expect(preview.components).toHaveLength(1)
    expect(preview.components[0].component).toBe("compound-engineering")
    expect(preview.components[0].inferredBump).toBe("patch")
    expect(preview.components[0].effectiveBump).toBe("minor")
    expect(preview.components[0].nextVersion).toBe(bumpVersion(versions["compound-engineering"], "minor"))
  })

  test("docs-only changes remain non-releasable by default", async () => {
    const preview = await buildReleasePreview({
      title: "docs: update release planning notes",
      files: ["docs/plans/2026-03-17-001-feat-release-automation-migration-beta-plan.md"],
    })

    expect(preview.components).toHaveLength(0)
  })

  test("rejects Antigravity plugin.json version drift from the root plugin version", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "release-preview-"))
    await mkdir(path.join(root, ".claude-plugin"), { recursive: true })
    await mkdir(path.join(root, ".cursor-plugin"), { recursive: true })

    await writeFile(path.join(root, "package.json"), JSON.stringify({ version: "3.13.1" }))
    await writeFile(path.join(root, ".claude-plugin", "plugin.json"), JSON.stringify({ version: "3.13.1" }))
    await mkdir(path.join(root, ".kimi-plugin"), { recursive: true })
    await writeFile(path.join(root, ".kimi-plugin", "plugin.json"), JSON.stringify({ version: "3.13.1" }))
    await mkdir(path.join(root, ".grok-plugin"), { recursive: true })
    await writeFile(path.join(root, ".grok-plugin", "plugin.json"), JSON.stringify({ version: "3.13.1" }))
    await mkdir(path.join(root, ".devin-plugin"), { recursive: true })
    await writeFile(path.join(root, ".devin-plugin", "plugin.json"), JSON.stringify({ version: "3.13.1" }))
    await writeFile(path.join(root, "plugin.json"), JSON.stringify({ version: "3.13.0" }))
    await writeFile(
      path.join(root, ".claude-plugin", "marketplace.json"),
      JSON.stringify({ metadata: { version: "3.13.1" } }),
    )
    await writeFile(
      path.join(root, ".cursor-plugin", "marketplace.json"),
      JSON.stringify({ metadata: { version: "3.13.1" } }),
    )

    await expect(loadCurrentVersions(root)).rejects.toThrow("plugin.json version 3.13.0")
    await Bun.$`rm -rf ${root}`.quiet()
  })

  test("rejects Kimi plugin version drift from the root plugin version", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "release-preview-"))
    await mkdir(path.join(root, ".claude-plugin"), { recursive: true })
    await mkdir(path.join(root, ".cursor-plugin"), { recursive: true })
    await mkdir(path.join(root, ".kimi-plugin"), { recursive: true })
    await mkdir(path.join(root, ".grok-plugin"), { recursive: true })

    await writeFile(path.join(root, "package.json"), JSON.stringify({ version: "3.13.1" }))
    await writeFile(path.join(root, ".claude-plugin", "plugin.json"), JSON.stringify({ version: "3.13.1" }))
    await writeFile(path.join(root, ".kimi-plugin", "plugin.json"), JSON.stringify({ version: "3.13.0" }))
    await writeFile(path.join(root, ".grok-plugin", "plugin.json"), JSON.stringify({ version: "3.13.1" }))
    await mkdir(path.join(root, ".devin-plugin"), { recursive: true })
    await writeFile(path.join(root, ".devin-plugin", "plugin.json"), JSON.stringify({ version: "3.13.1" }))
    await writeFile(path.join(root, "plugin.json"), JSON.stringify({ version: "3.13.1" }))
    await writeFile(
      path.join(root, ".claude-plugin", "marketplace.json"),
      JSON.stringify({ metadata: { version: "3.13.1" } }),
    )
    await writeFile(
      path.join(root, ".cursor-plugin", "marketplace.json"),
      JSON.stringify({ metadata: { version: "3.13.1" } }),
    )

    await expect(loadCurrentVersions(root)).rejects.toThrow(".kimi-plugin/plugin.json version 3.13.0")
    await Bun.$`rm -rf ${root}`.quiet()
  })

  test("rejects Devin plugin version drift from the root plugin version", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "release-preview-"))
    await mkdir(path.join(root, ".claude-plugin"), { recursive: true })
    await mkdir(path.join(root, ".cursor-plugin"), { recursive: true })
    await mkdir(path.join(root, ".kimi-plugin"), { recursive: true })
    await mkdir(path.join(root, ".grok-plugin"), { recursive: true })
    await mkdir(path.join(root, ".devin-plugin"), { recursive: true })

    await writeFile(path.join(root, "package.json"), JSON.stringify({ version: "3.13.1" }))
    await writeFile(path.join(root, ".claude-plugin", "plugin.json"), JSON.stringify({ version: "3.13.1" }))
    await writeFile(path.join(root, ".kimi-plugin", "plugin.json"), JSON.stringify({ version: "3.13.1" }))
    await writeFile(path.join(root, ".grok-plugin", "plugin.json"), JSON.stringify({ version: "3.13.1" }))
    await writeFile(path.join(root, ".devin-plugin", "plugin.json"), JSON.stringify({ version: "3.13.0" }))
    await writeFile(path.join(root, "plugin.json"), JSON.stringify({ version: "3.13.1" }))
    await writeFile(
      path.join(root, ".claude-plugin", "marketplace.json"),
      JSON.stringify({ metadata: { version: "3.13.1" } }),
    )
    await writeFile(
      path.join(root, ".cursor-plugin", "marketplace.json"),
      JSON.stringify({ metadata: { version: "3.13.1" } }),
    )

    await expect(loadCurrentVersions(root)).rejects.toThrow(".devin-plugin/plugin.json version 3.13.0")
    await Bun.$`rm -rf ${root}`.quiet()
  })
})
