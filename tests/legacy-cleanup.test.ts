import { describe, expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"
import os from "os"
import { parseFrontmatter } from "../src/utils/frontmatter"
import { cleanupStaleSkillDirs, cleanupStaleAgents, cleanupStalePrompts } from "../src/utils/legacy-cleanup"

async function createDir(dir: string, content = "placeholder") {
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, "SKILL.md"), content)
}

async function createFile(filePath: string, content = "placeholder") {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content)
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.stat(p)
    return true
  } catch {
    return false
  }
}

async function pluginDescription(relativePath: string): Promise<string> {
  const raw = await fs.readFile(path.join(import.meta.dir, "..", relativePath), "utf8")
  const { data } = parseFrontmatter(raw, relativePath)
  if (typeof data.description !== "string") {
    throw new Error(`Missing description in ${relativePath}`)
  }
  return data.description
}

function skillContent(name: string, description: string): string {
  return `---\nname: ${name}\ndescription: ${JSON.stringify(description)}\n---\n\n# ${name}\n`
}

function agentContent(name: string, description: string): string {
  return `---\nname: ${name}\ndescription: ${JSON.stringify(description)}\n---\n\nBody\n`
}

function promptWrapperContent(skillName: string, description: string, body = "Body") {
  return `---\ndescription: ${JSON.stringify(description)}\n---\n\nUse the $${skillName} skill for this command and follow its instructions.\n\n${body}\n`
}

function legacyWorkflowPromptContent(skillName: string, description: string) {
  return `---\ndescription: ${JSON.stringify(description)}\n---\n\nUse the ${skillName} skill for this workflow and follow its instructions exactly.\n\nTreat any text after the prompt name as the workflow context to pass through.\n`
}

function kiroAgentConfigContent(name: string, description: string) {
  return JSON.stringify({
    name,
    description,
    prompt: `file://./prompts/${name}.md`,
    tools: ["*"],
    resources: [
      "file://.kiro/steering/**/*.md",
      "skill://.kiro/skills/**/SKILL.md",
    ],
    includeMcpJson: true,
    welcomeMessage: `Switching to the ${name} agent. ${description}`,
  })
}

describe("cleanupStaleSkillDirs", () => {
  test("removes known stale skill directories", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "cleanup-skills-"))
    await createDir(
      path.join(root, "git-commit"),
      skillContent(
        "git-commit",
        await pluginDescription("plugins/compound-engineering/skills/ce-commit/SKILL.md"),
      ),
    )
    await createDir(
      path.join(root, "setup"),
      skillContent(
        "setup",
        await pluginDescription("plugins/compound-engineering/skills/ce-setup/SKILL.md"),
      ),
    )
    await createDir(
      path.join(root, "document-review"),
      skillContent(
        "document-review",
        await pluginDescription("plugins/compound-engineering/skills/ce-doc-review/SKILL.md"),
      ),
    )

    const removed = await cleanupStaleSkillDirs(root)

    expect(removed).toBe(3)
    expect(await exists(path.join(root, "git-commit"))).toBe(false)
    expect(await exists(path.join(root, "setup"))).toBe(false)
    expect(await exists(path.join(root, "document-review"))).toBe(false)
  })

  test("preserves non-stale directories", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "cleanup-preserve-"))
    await createDir(path.join(root, "ce-plan"))
    await createDir(path.join(root, "ce-commit"))
    await createDir(path.join(root, "custom-user-skill"))

    const removed = await cleanupStaleSkillDirs(root)

    expect(removed).toBe(0)
    expect(await exists(path.join(root, "ce-plan"))).toBe(true)
    expect(await exists(path.join(root, "ce-commit"))).toBe(true)
    expect(await exists(path.join(root, "custom-user-skill"))).toBe(true)
  })

  test("removes ce-review and ce-document-review (renamed skills)", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "cleanup-renamed-"))
    await createDir(
      path.join(root, "ce-review"),
      skillContent(
        "ce-review",
        await pluginDescription("plugins/compound-engineering/skills/ce-code-review/SKILL.md"),
      ),
    )
    await createDir(
      path.join(root, "ce-document-review"),
      skillContent(
        "ce-document-review",
        await pluginDescription("plugins/compound-engineering/skills/ce-doc-review/SKILL.md"),
      ),
    )

    const removed = await cleanupStaleSkillDirs(root)

    expect(removed).toBe(2)
    expect(await exists(path.join(root, "ce-review"))).toBe(false)
    expect(await exists(path.join(root, "ce-document-review"))).toBe(false)
  })

  test("removes raw colon workflow skill directories", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "cleanup-colon-workflows-"))
    await createDir(
      path.join(root, "ce:plan"),
      skillContent(
        "ce:plan",
        await pluginDescription("plugins/compound-engineering/skills/ce-plan/SKILL.md"),
      ),
    )
    await createDir(
      path.join(root, "workflows:review"),
      skillContent(
        "workflows:review",
        await pluginDescription("plugins/compound-engineering/skills/ce-code-review/SKILL.md"),
      ),
    )
    await createDir(
      path.join(root, "ce:plan-beta"),
      skillContent(
        "ce:plan-beta",
        "[BETA] Transform feature descriptions or requirements into structured implementation plans grounded in repo patterns and research. Use when the user says 'plan this', 'create a plan', 'write a tech plan', 'plan the implementation', 'how should we build', 'what's the approach for', 'break this down', or when a brainstorm/requirements document is ready for technical planning. Best when requirements are at least roughly defined; for exploratory or ambiguous requests, prefer ce:brainstorm first.",
      ),
    )

    const removed = await cleanupStaleSkillDirs(root)

    expect(removed).toBe(3)
    expect(await exists(path.join(root, "ce:plan"))).toBe(false)
    expect(await exists(path.join(root, "workflows:review"))).toBe(false)
    expect(await exists(path.join(root, "ce:plan-beta"))).toBe(false)
  })

  test("returns 0 when directory does not exist", async () => {
    const removed = await cleanupStaleSkillDirs("/tmp/nonexistent-cleanup-dir-12345")
    expect(removed).toBe(0)
  })

  test("preserves same-named user skill directories when content does not match plugin fingerprints", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "cleanup-user-skill-"))
    await createDir(
      path.join(root, "setup"),
      skillContent("setup", "User-owned setup skill unrelated to compound-engineering."),
    )

    const removed = await cleanupStaleSkillDirs(root)

    expect(removed).toBe(0)
    expect(await exists(path.join(root, "setup"))).toBe(true)
  })

  test("removes legacy setup skill even when current description has drifted", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "cleanup-setup-legacy-"))
    await createDir(
      path.join(root, "setup"),
      skillContent(
        "setup",
        "Configure project-level settings for compound-engineering workflows. Currently a placeholder — review agent selection is handled automatically by ce:review.",
      ),
    )

    const removed = await cleanupStaleSkillDirs(root)

    expect(removed).toBe(1)
    expect(await exists(path.join(root, "setup"))).toBe(false)
  })

  test("removes legacy-only skills that no longer ship a ce-* replacement", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "cleanup-legacy-only-skills-"))
    // `feature-video` and `reproduce-bug` were shipped by older plugin versions
    // but have no current ce-* counterpart. Their fingerprints come from the
    // LEGACY_ONLY_SKILL_DESCRIPTIONS map, not from a live plugin file.
    await createDir(
      path.join(root, "feature-video"),
      skillContent(
        "feature-video",
        "Record a video walkthrough of a feature and add it to the PR description. Use when a PR needs a visual demo for reviewers, when the user asks to demo a feature, create a PR video, record a walkthrough, show what changed visually, or add a video to a pull request.",
      ),
    )
    await createDir(
      path.join(root, "reproduce-bug"),
      skillContent(
        "reproduce-bug",
        "Systematically reproduce and investigate a bug from a GitHub issue. Use when the user provides a GitHub issue number or URL for a bug they want reproduced or investigated.",
      ),
    )
    await createDir(
      path.join(root, "claude-permissions-optimizer"),
      skillContent(
        "claude-permissions-optimizer",
        "Optimize Claude Code permissions by finding safe Bash commands from session history and auto-applying them to settings.json. Can run from any coding agent but targets Claude Code specifically. Use when experiencing permission fatigue, too many permission prompts, wanting to optimize permissions, or needing to set up allowlists. Triggers on \"optimize permissions\", \"reduce permission prompts\", \"allowlist commands\", \"too many permission prompts\", \"permission fatigue\", \"permission setup\", or complaints about clicking approve too often.",
      ),
    )
    await createDir(
      path.join(root, "ce-onboarding"),
      skillContent(
        "ce-onboarding",
        "Generate or regenerate ONBOARDING.md to help new contributors understand a codebase. Use when the user asks to 'create onboarding docs', 'generate ONBOARDING.md', 'document this project for new developers', 'write onboarding documentation', 'vonboard', 'vonboarding', 'prepare this repo for a new contributor', 'refresh the onboarding doc', or 'update ONBOARDING.md'. Also use when someone needs to onboard a new team member and wants a written artifact, or when a codebase lacks onboarding documentation and the user wants to generate one.",
      ),
    )
    await createDir(
      path.join(root, "ce-andrew-kane-gem-writer"),
      skillContent(
        "ce-andrew-kane-gem-writer",
        "This skill should be used when writing Ruby gems following Andrew Kane's proven patterns and philosophy. It applies when creating new Ruby gems, refactoring existing gems, designing gem APIs, or when clean, minimal, production-ready Ruby library code is needed. Triggers on requests like \"create a gem\", \"write a Ruby library\", \"design a gem API\", or mentions of Andrew Kane's style.",
      ),
    )
    await createDir(
      path.join(root, "ce-changelog"),
      skillContent("ce-changelog", "Create engaging changelogs for recent merges to main branch"),
    )
    await createDir(
      path.join(root, "ce-deploy-docs"),
      skillContent("ce-deploy-docs", "Validate and prepare documentation for GitHub Pages deployment"),
    )
    await createDir(
      path.join(root, "ce-dspy-ruby"),
      skillContent(
        "ce-dspy-ruby",
        "Build type-safe LLM applications with DSPy.rb — Ruby's programmatic prompt framework with signatures, modules, agents, and optimization. Use when implementing predictable AI features, creating LLM signatures and modules, configuring language model providers, building agent systems with tools, optimizing prompts, or testing LLM-powered functionality in Ruby applications.",
      ),
    )
    await createDir(
      path.join(root, "ce-every-style-editor"),
      skillContent(
        "ce-every-style-editor",
        "This skill should be used when reviewing or editing copy to ensure adherence to Every's style guide. It provides a systematic line-by-line review process for grammar, punctuation, mechanics, and style guide compliance.",
      ),
    )

    const removed = await cleanupStaleSkillDirs(root)

    expect(removed).toBe(9)
    expect(await exists(path.join(root, "feature-video"))).toBe(false)
    expect(await exists(path.join(root, "reproduce-bug"))).toBe(false)
    expect(await exists(path.join(root, "claude-permissions-optimizer"))).toBe(false)
    expect(await exists(path.join(root, "ce-onboarding"))).toBe(false)
    expect(await exists(path.join(root, "ce-andrew-kane-gem-writer"))).toBe(false)
    expect(await exists(path.join(root, "ce-changelog"))).toBe(false)
    expect(await exists(path.join(root, "ce-deploy-docs"))).toBe(false)
    expect(await exists(path.join(root, "ce-dspy-ruby"))).toBe(false)
    expect(await exists(path.join(root, "ce-every-style-editor"))).toBe(false)
  })

  test("preserves same-named user skills for legacy-only entries when content differs", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "cleanup-legacy-only-user-"))
    await createDir(
      path.join(root, "reproduce-bug"),
      skillContent("reproduce-bug", "A project-local reproduce-bug helper unrelated to compound-engineering."),
    )

    const removed = await cleanupStaleSkillDirs(root)

    expect(removed).toBe(0)
    expect(await exists(path.join(root, "reproduce-bug"))).toBe(true)
  })
})

describe("cleanupStaleAgents", () => {
  test("removes flat .md agent files", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "cleanup-agents-md-"))
    await createFile(
      path.join(root, "adversarial-reviewer.md"),
      agentContent(
        "adversarial-reviewer",
        await pluginDescription("plugins/compound-engineering/agents/ce-adversarial-reviewer.agent.md"),
      ),
    )
    await createFile(
      path.join(root, "learnings-researcher.md"),
      agentContent(
        "learnings-researcher",
        await pluginDescription("plugins/compound-engineering/agents/ce-learnings-researcher.agent.md"),
      ),
    )

    const removed = await cleanupStaleAgents(root, ".md")

    expect(removed).toBe(2)
    expect(await exists(path.join(root, "adversarial-reviewer.md"))).toBe(false)
    expect(await exists(path.join(root, "learnings-researcher.md"))).toBe(false)
  })

  test("removes .agent.md files (Copilot format)", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "cleanup-agents-copilot-"))
    await createFile(
      path.join(root, "security-sentinel.agent.md"),
      agentContent(
        "security-sentinel",
        await pluginDescription("plugins/compound-engineering/agents/ce-security-sentinel.agent.md"),
      ),
    )
    await createFile(
      path.join(root, "performance-oracle.agent.md"),
      agentContent(
        "performance-oracle",
        await pluginDescription("plugins/compound-engineering/agents/ce-performance-oracle.agent.md"),
      ),
    )

    const removed = await cleanupStaleAgents(root, ".agent.md")

    expect(removed).toBe(2)
    expect(await exists(path.join(root, "security-sentinel.agent.md"))).toBe(false)
  })

  test("removes matching Kiro agent configs but preserves same-named user configs", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "cleanup-agents-kiro-"))
    await createFile(
      path.join(root, "slack-researcher.json"),
      kiroAgentConfigContent(
        "slack-researcher",
        await pluginDescription("plugins/compound-engineering/agents/ce-slack-researcher.agent.md"),
      ),
    )
    await createFile(
      path.join(root, "session-historian.json"),
      kiroAgentConfigContent(
        "session-historian",
        await pluginDescription("plugins/compound-engineering/agents/ce-session-historian.agent.md"),
      ),
    )
    await createFile(
      path.join(root, "lint.json"),
      kiroAgentConfigContent(
        "lint",
        "A project-local lint helper unrelated to compound-engineering.",
      ),
    )

    const removed = await cleanupStaleAgents(root, ".json")

    expect(removed).toBe(2)
    expect(await exists(path.join(root, "slack-researcher.json"))).toBe(false)
    expect(await exists(path.join(root, "session-historian.json"))).toBe(false)
    expect(await exists(path.join(root, "lint.json"))).toBe(true)
  })

  test("removes agent directories when extension is null", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "cleanup-agents-dir-"))
    await createDir(
      path.join(root, "code-simplicity-reviewer"),
      skillContent(
        "code-simplicity-reviewer",
        await pluginDescription("plugins/compound-engineering/agents/ce-code-simplicity-reviewer.agent.md"),
      ),
    )
    await createDir(
      path.join(root, "repo-research-analyst"),
      skillContent(
        "repo-research-analyst",
        await pluginDescription("plugins/compound-engineering/agents/ce-repo-research-analyst.agent.md"),
      ),
    )

    const removed = await cleanupStaleAgents(root, null)

    expect(removed).toBe(2)
    expect(await exists(path.join(root, "code-simplicity-reviewer"))).toBe(false)
    expect(await exists(path.join(root, "repo-research-analyst"))).toBe(false)
  })

  test("preserves ce-prefixed agent files", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "cleanup-agents-keep-"))
    await createFile(path.join(root, "ce-adversarial-reviewer.md"), agentContent("ce-adversarial-reviewer", "custom"))
    await createFile(path.join(root, "ce-learnings-researcher.md"), agentContent("ce-learnings-researcher", "custom"))

    const removed = await cleanupStaleAgents(root, ".md")

    expect(removed).toBe(0)
    expect(await exists(path.join(root, "ce-adversarial-reviewer.md"))).toBe(true)
  })

  test("preserves same-named user agent files when content does not match plugin fingerprints", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "cleanup-agents-user-"))
    await createFile(
      path.join(root, "lint.md"),
      agentContent("lint", "A project-local lint helper unrelated to compound-engineering."),
    )

    const removed = await cleanupStaleAgents(root, ".md")

    expect(removed).toBe(0)
    expect(await exists(path.join(root, "lint.md"))).toBe(true)
  })

  test("removes legacy-only agents that no longer ship a ce-* replacement", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "cleanup-agents-legacy-only-"))
    // `lint` and `bug-reproduction-validator` were removed in an older plugin
    // release with no ce-* successor. Their fingerprints live in
    // LEGACY_ONLY_AGENT_DESCRIPTIONS so upgrades from pre-removal installs
    // still clean them up.
    await createFile(
      path.join(root, "lint.md"),
      agentContent(
        "lint",
        "Use this agent when you need to run linting and code quality checks on Ruby and ERB files. Run before pushing to origin.",
      ),
    )
    await createFile(
      path.join(root, "bug-reproduction-validator.md"),
      agentContent(
        "bug-reproduction-validator",
        "Systematically reproduces and validates bug reports to confirm whether reported behavior is an actual bug. Use when you receive a bug report or issue that needs verification.",
      ),
    )

    const removed = await cleanupStaleAgents(root, ".md")

    expect(removed).toBe(2)
    expect(await exists(path.join(root, "lint.md"))).toBe(false)
    expect(await exists(path.join(root, "bug-reproduction-validator.md"))).toBe(false)
  })
})

describe("cleanupStalePrompts", () => {
  test("removes old workflow prompt wrappers", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "cleanup-prompts-"))
    await createFile(
      path.join(root, "ce-plan.md"),
      promptWrapperContent(
        "ce-plan",
        await pluginDescription("plugins/compound-engineering/skills/ce-plan/SKILL.md"),
      ),
    )
    await createFile(
      path.join(root, "ce-review.md"),
      promptWrapperContent(
        "ce-review",
        await pluginDescription("plugins/compound-engineering/skills/ce-code-review/SKILL.md"),
      ),
    )
    await createFile(
      path.join(root, "ce-brainstorm.md"),
      promptWrapperContent(
        "ce-brainstorm",
        await pluginDescription("plugins/compound-engineering/skills/ce-brainstorm/SKILL.md"),
      ),
    )

    const removed = await cleanupStalePrompts(root)

    expect(removed).toBe(3)
    expect(await exists(path.join(root, "ce-plan.md"))).toBe(false)
    expect(await exists(path.join(root, "ce-review.md"))).toBe(false)
  })

  test("preserves non-stale prompt files", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "cleanup-prompts-keep-"))
    await createFile(path.join(root, "my-custom-prompt.md"))
    await createFile(path.join(root, "review-command.md"))

    const removed = await cleanupStalePrompts(root)

    expect(removed).toBe(0)
    expect(await exists(path.join(root, "my-custom-prompt.md"))).toBe(true)
  })

  test("preserves same-named user prompt files when content does not match plugin fingerprints", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "cleanup-prompts-user-"))
    await createFile(
      path.join(root, "ce-plan.md"),
      "---\ndescription: \"A project-local ce-plan helper\"\n---\n\nCustom prompt body\n",
    )

    const removed = await cleanupStalePrompts(root)

    expect(removed).toBe(0)
    expect(await exists(path.join(root, "ce-plan.md"))).toBe(true)
  })

  test("removes pre-rename workflow prompt wrappers with ce:* references", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "cleanup-prompts-legacy-workflow-"))
    await createFile(
      path.join(root, "ce-plan.md"),
      legacyWorkflowPromptContent(
        "ce:plan",
        (await pluginDescription("plugins/compound-engineering/skills/ce-plan/SKILL.md"))
          .replaceAll("ce-", "ce:"),
      ),
    )
    await createFile(
      path.join(root, "ce-work-beta.md"),
      legacyWorkflowPromptContent(
        "ce:work-beta",
        (await pluginDescription("plugins/compound-engineering/skills/ce-work-beta/SKILL.md"))
          .replaceAll("ce-", "ce:"),
      ),
    )

    const removed = await cleanupStalePrompts(root)

    expect(removed).toBe(2)
    expect(await exists(path.join(root, "ce-plan.md"))).toBe(false)
    expect(await exists(path.join(root, "ce-work-beta.md"))).toBe(false)
  })

  test("removes wrappers whose description has drifted (matches a known historical alias)", async () => {
    // Regression: across shipped plugin versions the ce-plan / ce-work /
    // ce-work-beta descriptions have been reworded multiple times. Requiring
    // an exact match against the live skill description left pre-upgrade
    // wrappers in place, so users kept a prompt entrypoint that still
    // targeted the pre-rename skill.
    //
    // Cleanup now accepts any description that appears in the plugin's
    // `LEGACY_PROMPT_DESCRIPTION_ALIASES` list for that file (in addition to
    // the current shipped description). The strings below are real
    // descriptions compound-engineering has shipped in prior releases, so
    // they must be recognized as owned.
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "cleanup-prompts-drifted-desc-"))

    // v2.66.1-style ce-plan description (no trailing ce-brainstorm guidance).
    await createFile(
      path.join(root, "ce-plan.md"),
      promptWrapperContent(
        "ce-plan",
        "Create structured plans for any multi-step task -- software features, research workflows, events, study plans, or any goal that benefits from structured breakdown. Also deepen existing plans with interactive review of sub-agent findings.",
      ),
    )
    // v2.55-era ce-work description with a completely different opening.
    await createFile(
      path.join(root, "ce-work.md"),
      promptWrapperContent(
        "ce-work",
        "Transform feature descriptions or requirements into implementation plans grounded in repo patterns and research.",
      ),
    )
    // Pre-rename ce-work-beta description still referencing the ce:work
    // skill name. Normalization must still accept it.
    await createFile(
      path.join(root, "ce-work-beta.md"),
      promptWrapperContent(
        "ce-work-beta",
        "[BETA] Execute work with external delegate support. Same as ce:work but includes experimental Codex delegation mode for token-conserving code implementation.",
      ),
    )

    const removed = await cleanupStalePrompts(root)

    expect(removed).toBe(3)
    expect(await exists(path.join(root, "ce-plan.md"))).toBe(false)
    expect(await exists(path.join(root, "ce-work.md"))).toBe(false)
    expect(await exists(path.join(root, "ce-work-beta.md"))).toBe(false)
  })

  test("preserves wrappers whose description was never shipped by compound-engineering", async () => {
    // Defense-in-depth against a sibling plugin installed into the same
    // `~/.codex/prompts/` directory. `renderPrompt` in
    // `src/converters/claude-to-codex.ts` emits the instruction sentence for
    // every plugin that ships invocable commands, so body alone is not proof
    // of ownership — a third-party plugin whose skill happens to be named
    // `ce-plan` / `ce-work` (for example a compound-engineering fork keeping
    // the `ce-*` namespace) would produce a wrapper whose body matches ours
    // verbatim.
    //
    // Cleanup must leave those wrappers alone. The additional ownership
    // signal is the frontmatter description: if it is not one
    // compound-engineering has ever shipped, the file belongs to somebody
    // else and we refuse to delete it.
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "cleanup-prompts-foreign-desc-"))
    await createFile(
      path.join(root, "ce-plan.md"),
      promptWrapperContent(
        "ce-plan",
        "A sibling plugin's ce-plan wrapper. This description has never been shipped by compound-engineering, so cleanup must preserve the file.",
      ),
    )
    await createFile(
      path.join(root, "ce-brainstorm.md"),
      promptWrapperContent(
        "ce-brainstorm",
        "Fork-specific brainstorm wrapper with a description compound-engineering has never shipped.",
      ),
    )
    await createFile(
      path.join(root, "ce-work.md"),
      promptWrapperContent(
        "ce-work",
        "Another plugin's ce-work prompt wrapper; keeps the ce-* namespace but has its own wording.",
      ),
    )

    const removed = await cleanupStalePrompts(root)

    expect(removed).toBe(0)
    expect(await exists(path.join(root, "ce-plan.md"))).toBe(true)
    expect(await exists(path.join(root, "ce-brainstorm.md"))).toBe(true)
    expect(await exists(path.join(root, "ce-work.md"))).toBe(true)
  })

  test("preserves user files whose body is not the plugin-generated boilerplate", async () => {
    // Independent of the description check, cleanup must refuse to delete
    // user-authored prompts that happen to share a stale file name but do
    // not carry the plugin-generated instruction sentence in their body.
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "cleanup-prompts-user-body-"))
    await createFile(
      path.join(root, "ce-plan.md"),
      `---\ndescription: "User-authored ce-plan helper"\n---\n\nThis prompt does not invoke the ce-plan skill — it is a private workflow.\n`,
    )
    await createFile(
      path.join(root, "ce-work.md"),
      `---\ndescription: "Execute work efficiently while maintaining quality and finishing features"\n---\n\nCustom body that mentions the ce-work skill but not via the plugin's instruction boilerplate.\n`,
    )

    const removed = await cleanupStalePrompts(root)

    expect(removed).toBe(0)
    expect(await exists(path.join(root, "ce-plan.md"))).toBe(true)
    expect(await exists(path.join(root, "ce-work.md"))).toBe(true)
  })
})

describe("idempotency", () => {
  test("running cleanup twice returns 0 on second run", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "cleanup-idempotent-"))
    await createDir(
      path.join(root, "git-commit"),
      skillContent(
        "git-commit",
        await pluginDescription("plugins/compound-engineering/skills/ce-commit/SKILL.md"),
      ),
    )
    await createFile(
      path.join(root, "adversarial-reviewer.md"),
      agentContent(
        "adversarial-reviewer",
        await pluginDescription("plugins/compound-engineering/agents/ce-adversarial-reviewer.agent.md"),
      ),
    )

    const first = await cleanupStaleSkillDirs(root) + await cleanupStaleAgents(root, ".md")
    expect(first).toBe(2)

    const second = await cleanupStaleSkillDirs(root) + await cleanupStaleAgents(root, ".md")
    expect(second).toBe(0)
  })
})
