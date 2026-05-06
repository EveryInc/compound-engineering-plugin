import { describe, expect, test } from "bun:test"
import path from "path"
import { loadClaudePlugin } from "../src/parsers/claude"
import { convertClaudeToCodex } from "../src/converters/claude-to-codex"
import { convertClaudeToPi } from "../src/converters/claude-to-pi"
import { convertClaudeToKiro } from "../src/converters/claude-to-kiro"
import { getLegacyCodexArtifacts, getLegacyKiroArtifacts, getLegacyPiArtifacts, getLegacyWindsurfArtifacts } from "../src/data/plugin-legacy-artifacts"

describe("plugin legacy artifacts", () => {
  test("Codex legacy detection is restricted to the explicit historical allow-list", async () => {
    const plugin = await loadClaudePlugin(path.join(import.meta.dir, "..", "plugins", "compound-engineering"))
    const bundle = convertClaudeToCodex(plugin, {
      agentMode: "subagent",
      inferTemperature: true,
      permissions: "none",
    })

    const artifacts = getLegacyCodexArtifacts(bundle)

    // Historical CE skills (renamed/removed since) are detected. These are
    // explicitly enumerated in EXTRA_LEGACY_ARTIFACTS_BY_PLUGIN.
    expect(artifacts.skills).toContain("ce-plan")
    expect(artifacts.skills).toContain("ce:plan")
    expect(artifacts.skills).toContain("ce:plan-beta")
    expect(artifacts.skills).toContain("ce-review")
    expect(artifacts.skills).toContain("ce:review-beta")
    expect(artifacts.skills).toContain("ce-document-review")
    expect(artifacts.skills).toContain("demo-reel")
    expect(artifacts.skills).toContain("ce:polish-beta")
    expect(artifacts.skills).toContain("ce:release-notes")
    expect(artifacts.skills).toContain("ce-update")
    expect(artifacts.skills).toContain("creating-agent-skills")
    expect(artifacts.skills).toContain("repo-research-analyst")
    expect(artifacts.skills).toContain("bug-reproduction-validator")
    expect(artifacts.skills).toContain("report-bug")
    expect(artifacts.skills).toContain("reproduce-bug")
    expect(artifacts.skills).toContain("resolve_pr_parallel")

    // Current CE skill names that were never on the historical allow-list MUST
    // NOT be flagged as legacy candidates. Otherwise a first install would
    // sweep an unrelated user skill at ~/.codex/skills/<name>/ into backup
    // simply because its name collides with a current CE skill.
    expect(artifacts.skills).not.toContain("ce-demo-reel")
    // Synthesized agent name variants (e.g. ce-<final-segment>) are not on
    // the historical allow-list either, so they should not be probed against
    // unrelated user skills at flat ~/.codex/skills/<name>/ paths.
    expect(artifacts.skills).not.toContain("ce-repo-research-analyst")
    expect(artifacts.skills).not.toContain("research-ce-repo-research-analyst")

    expect(artifacts.prompts).toContain("codify.md")
    expect(artifacts.prompts).toContain("compound-plan.md")
    expect(artifacts.prompts).toContain("plan.md")
    expect(artifacts.prompts).toContain("report-bug.md")
    expect(artifacts.prompts).toContain("workflows-review.md")
    expect(artifacts.prompts).toContain("technical_review.md")
  })

  test("Codex legacy detection ignores current bundle skills/agents not in the historical allow-list", () => {
    const artifacts = getLegacyCodexArtifacts({
      pluginName: "compound-engineering",
      prompts: [],
      skillDirs: [
        // A current skill name that was NEVER shipped historically. A user
        // could plausibly have an unrelated skill at ~/.codex/skills/my-novel-skill/
        // and a first install of CE must not touch it.
        { name: "my-novel-skill", sourceDir: "/tmp/unused" },
      ],
      generatedSkills: [
        { name: "another-novel-skill", content: "" },
      ],
      agents: [
        { name: "my-novel-agent", description: "x", instructions: "y" },
      ],
    })

    expect(artifacts.skills).not.toContain("my-novel-skill")
    expect(artifacts.skills).not.toContain("another-novel-skill")
    expect(artifacts.skills).not.toContain("my-novel-agent")
    expect(artifacts.skills).not.toContain("ce-my-novel-agent")
  })

  test("Codex legacy detection returns nothing for plugins without an allow-list", () => {
    const artifacts = getLegacyCodexArtifacts({
      pluginName: "some-third-party-plugin",
      prompts: [{ name: "anything", content: "" }],
      skillDirs: [{ name: "shared-name", sourceDir: "/tmp/x" }],
      generatedSkills: [],
      agents: [{ name: "shared-name", description: "x", instructions: "y" }],
    })

    expect(artifacts.skills).toEqual([])
    expect(artifacts.prompts).toEqual([])
  })

  test("includes current and historical CE artifacts for Pi cleanup", async () => {
    const plugin = await loadClaudePlugin(path.join(import.meta.dir, "..", "plugins", "compound-engineering"))
    const bundle = convertClaudeToPi(plugin, {
      agentMode: "subagent",
      inferTemperature: true,
      permissions: "none",
    })

    const artifacts = getLegacyPiArtifacts(bundle)

    expect(artifacts.skills).toContain("bug-reproduction-validator")
    expect(artifacts.skills).toContain("creating-agent-skills")
    expect(artifacts.skills).toContain("repo-research-analyst")
    expect(artifacts.skills).toContain("reproduce-bug")
    expect(artifacts.skills).toContain("resolve_pr_parallel")
    expect(artifacts.skills).not.toContain("ce:plan")
    expect(artifacts.skills).not.toContain("ce-plan")

    expect(artifacts.prompts).toContain("codify.md")
    expect(artifacts.prompts).toContain("compound-plan.md")
    expect(artifacts.prompts).toContain("plan.md")
    expect(artifacts.prompts).toContain("report-bug.md")
    expect(artifacts.prompts).toContain("workflows-review.md")
    expect(artifacts.prompts).toContain("technical_review.md")
  })

  test("includes historical CE artifacts for Kiro install cleanup", async () => {
    const plugin = await loadClaudePlugin(path.join(import.meta.dir, "..", "plugins", "compound-engineering"))
    const bundle = convertClaudeToKiro(plugin, {
      agentMode: "subagent",
      inferTemperature: true,
      permissions: "none",
    })

    const artifacts = getLegacyKiroArtifacts(bundle)

    expect(artifacts.skills).toContain("reproduce-bug")
    expect(artifacts.skills).toContain("repo-research-analyst")
    expect(artifacts.skills).toContain("creating-agent-skills")
    expect(artifacts.skills).toContain("compound-plan")
    expect(artifacts.skills).toContain("plan")
    expect(artifacts.skills).toContain("resolve_pr_parallel")
    expect(artifacts.skills).not.toContain("ce-plan")

    expect(artifacts.agents).toContain("repo-research-analyst")
    expect(artifacts.agents).not.toContain("ce-repo-research-analyst")
  })

  test("includes only historical CE artifacts for deprecated Windsurf cleanup", async () => {
    const plugin = await loadClaudePlugin(path.join(import.meta.dir, "..", "plugins", "compound-engineering"))

    const artifacts = getLegacyWindsurfArtifacts(plugin)

    expect(artifacts.skills).toContain("ce-review")
    expect(artifacts.skills).toContain("creating-agent-skills")
    expect(artifacts.skills).toContain("reproduce-bug")
    expect(artifacts.skills).toContain("resolve_pr_parallel")
    expect(artifacts.skills).toContain("repo-research-analyst")

    expect(artifacts.workflows).toContain("codify.md")
    expect(artifacts.workflows).toContain("compound-plan.md")
    expect(artifacts.workflows).toContain("plan.md")
    expect(artifacts.workflows).toContain("workflows-plan.md")
    expect(artifacts.workflows).toContain("ce-plan.md")
    expect(artifacts.workflows).toContain("technical_review.md")

    // Names present in the current CE bundle but NOT on the historical
    // allow-list must never be cleanup candidates, so user-authored files at
    // those paths survive `cleanup --target windsurf`.
    expect(artifacts.skills).not.toContain("ce-debug")
  })
})
