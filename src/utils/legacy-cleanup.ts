/**
 * One-time cleanup of stale compound-engineering files from previous installs.
 *
 * The v3 rename changed all skill and agent names (e.g., git-commit -> ce-commit,
 * adversarial-reviewer -> ce-adversarial-reviewer). Target writers create new
 * files at the new paths but don't remove the old ones, leaving orphans that
 * confuse the agent runtime.
 *
 * This module lists the known old names and removes them from the target's
 * output directories. It's safe to run multiple times (idempotent) and safe
 * to remove entirely once the v2 -> v3 transition window has passed.
 *
 * TODO(cleanup): Remove this file after the v3 transition (circa Q3 2026).
 */

import fs from "fs/promises"
import path from "path"
import { fileURLToPath } from "url"
import { parseFrontmatter } from "./frontmatter"

/** Old skill directory names that no longer exist after the v3 rename. */
export const STALE_SKILL_DIRS = [
  // ce: -> ce-. Some targets sanitized these to ce-*; others left raw colon
  // directories on filesystems that permit them.
  "ce:brainstorm",
  "ce:compound",
  "ce:compound-refresh",
  "ce:ideate",
  "ce:plan",
  "ce:plan-beta",
  "ce:review",
  "ce:review-beta",
  "ce:work",
  "ce:work-beta",

  // workflows:* -> ce-*.
  "workflows:brainstorm",
  "workflows:compound",
  "workflows:plan",
  "workflows:review",
  "workflows:work",
  "workflows-brainstorm",
  "workflows-compound",
  "workflows-plan",
  "workflows-review",
  "workflows-work",

  // git-* -> ce-*
  "git-commit",
  "git-commit-push-pr",
  "git-worktree",
  "git-clean-gone-branches",

  // report-bug-ce -> ce-report-bug
  "report-bug-ce",

  // unprefixed -> ce-*
  "agent-native-architecture",
  "agent-native-audit",
  "andrew-kane-gem-writer",
  "changelog",
  "claude-permissions-optimizer",
  "deploy-docs",
  "dhh-rails-style",
  "document-review",
  "dspy-ruby",
  "every-style-editor",
  "feature-video",
  "frontend-design",
  "gemini-imagegen",
  "onboarding",
  "orchestrating-swarms",
  "proof",
  "reproduce-bug",
  "resolve-pr-feedback",
  "setup",
  "test-browser",
  "test-xcode",
  "todo-create",
  "todo-resolve",
  "todo-triage",

  // ce-review -> ce-code-review, ce-document-review -> ce-doc-review
  "ce-review",
  "ce-document-review",
  "ce-plan-beta",
  "ce-review-beta",

  // Removed skills (no replacement)
  "ce-andrew-kane-gem-writer",
  "ce-changelog",
  "ce-deploy-docs",
  "ce-dspy-ruby",
  "ce-every-style-editor",
  "ce-onboarding",
  "ce-pr-description",
]

/** Old agent names (used as generated skill dirs or flat .md files). */
const STALE_AGENT_NAMES = [
  // Legacy agent names that were renamed from <name> to ce-<name>
  "adversarial-document-reviewer",
  "adversarial-reviewer",
  "agent-native-reviewer",
  "ankane-readme-writer",
  "api-contract-reviewer",
  "architecture-strategist",
  "best-practices-researcher",
  "bug-reproduction-validator",
  "ce-cli-agent-readiness-reviewer",
  "ce-cli-readiness-reviewer",
  "cli-agent-readiness-reviewer",
  "cli-readiness-reviewer",
  "code-simplicity-reviewer",
  "coherence-reviewer",
  "correctness-reviewer",
  "data-integrity-guardian",
  "data-migration-expert",
  "data-migrations-reviewer",
  "deployment-verification-agent",
  "design-implementation-reviewer",
  "design-iterator",
  "design-lens-reviewer",
  "dhh-rails-reviewer",
  "feasibility-reviewer",
  "figma-design-sync",
  "framework-docs-researcher",
  "git-history-analyzer",
  "issue-intelligence-analyst",
  "julik-frontend-races-reviewer",
  "kieran-python-reviewer",
  "kieran-rails-reviewer",
  "kieran-typescript-reviewer",
  "learnings-researcher",
  "lint",
  "maintainability-reviewer",
  "pattern-recognition-specialist",
  "performance-oracle",
  "performance-reviewer",
  "previous-comments-reviewer",
  "pr-comment-resolver",
  "product-lens-reviewer",
  "project-standards-reviewer",
  "reliability-reviewer",
  "repo-research-analyst",
  "schema-drift-detector",
  "session-historian",
  "slack-researcher",
  "scope-guardian-reviewer",
  "security-lens-reviewer",
  "security-reviewer",
  "security-sentinel",
  "spec-flow-analyzer",
  "testing-reviewer",
  "web-researcher",
]

/** Old prompt wrapper names (we no longer generate workflow prompts). */
const STALE_PROMPT_FILES = [
  "ce-brainstorm.md",
  "ce-compound.md",
  "ce-compound-refresh.md",
  "ce-ideate.md",
  "ce-plan.md",
  "ce-review.md",
  "ce-work.md",
  "ce-work-beta.md",
]

const LEGACY_SKILL_DESCRIPTION_ALIASES: Record<string, string[]> = {
  setup: [
    "Configure project-level settings for compound-engineering workflows. Currently a placeholder — review agent selection is handled automatically by ce:review.",
  ],
}

/**
 * Known historical `description:` frontmatter values we have shipped for each
 * Codex prompt wrapper, keyed by stale file name. Pairs with the body
 * fingerprint in `isLegacyPromptWrapper` to form a two-signal ownership check:
 * the instruction boilerplate alone is emitted by `renderPrompt` for every
 * plugin, so matching it in isolation would let this cleanup delete another
 * plugin's same-named wrapper from a shared `~/.codex/prompts/` directory.
 *
 * Each entry is the exact frontmatter description string from a shipped
 * compound-engineering release (all skill rewords across versions, including
 * the ce:/ce- prefix transition). The current shipped description for the
 * renamed skill is also accepted automatically via `loadLegacyFingerprints`,
 * so only historical values need to live here.
 *
 * Adding a new release that reworks one of these descriptions means adding
 * the previous description here so upgrades from that version still clean up
 * cleanly. Missing an entry only leaves one orphaned wrapper on upgrade (a
 * mild regression); matching too broadly would delete another plugin's file
 * (a destructive bug). Err on the side of omission.
 */
const LEGACY_PROMPT_DESCRIPTION_ALIASES: Record<string, string[]> = {
  "ce-plan.md": [
    "Create structured plans for any multi-step task -- software features, research workflows, events, study plans, or any goal that benefits from structured breakdown. Also deepen existing plans with interactive review of sub-agent findings. Use for plan creation when the user says 'plan this', 'create a plan', 'write a tech plan', 'plan the implementation', 'how should we build', 'what's the approach for', 'break this down', 'plan a trip', 'create a study plan', or when a brainstorm/requirements document is ready for planning. Use for plan deepening when the user says 'deepen the plan', 'deepen my plan', 'deepening pass', or uses 'deepen' in reference to a plan.",
    "Create structured plans for any multi-step task -- software features, research workflows, events, study plans, or any goal that benefits from structured breakdown. Also deepen existing plans with interactive review of sub-agent findings.",
    "Transform feature descriptions or requirements into implementation plans grounded in repo patterns and research.",
  ],
  "ce-work.md": [
    "Execute work efficiently while maintaining quality and finishing features",
    "Transform feature descriptions or requirements into implementation plans grounded in repo patterns and research.",
  ],
  "ce-work-beta.md": [
    "[BETA] Execute work with external delegate support. Same as ce-work but includes experimental Codex delegation mode for token-conserving code implementation.",
    "[BETA] Execute work with external delegate support. Same as ce:work but includes experimental Codex delegation mode for token-conserving code implementation.",
  ],
  "ce-brainstorm.md": [
    "Explore requirements and approaches through collaborative dialogue before writing a right-sized requirements document and planning implementation. Use for feature ideas, problem framing, when the user says 'let's brainstorm', or when they want to think through options before deciding what to build. Also use when a user describes a vague or ambitious feature request, asks 'what should we build', 'help me think through X', presents a problem with multiple valid solutions, or seems unsure about scope or direction — even if they don't explicitly ask to brainstorm.",
  ],
  "ce-ideate.md": [
    "Generate and critically evaluate grounded ideas about a topic. Use when asking what to improve, requesting idea generation, exploring surprising directions, or wanting the AI to proactively suggest strong options before brainstorming one in depth. Triggers on phrases like 'what should I improve', 'give me ideas', 'ideate on X', 'surprise me', 'what would you change', or any request for AI-generated suggestions rather than refining the user's own idea.",
  ],
  "ce-compound.md": [
    "Document a recently solved problem to compound your team's knowledge",
  ],
  "ce-compound-refresh.md": [
    "Refresh stale or drifting learnings and pattern docs in docs/solutions/ by reviewing, updating, consolidating, replacing, or deleting them against the current codebase. Use after refactors, migrations, dependency upgrades, or when a retrieved learning feels outdated or wrong. Also use when reviewing docs/solutions/ for accuracy, when a recently solved problem contradicts an existing learning, when pattern docs no longer reflect current code, or when multiple docs seem to cover the same topic and might benefit from consolidation.",
  ],
  "ce-review.md": [
    "Structured code review using tiered persona agents, confidence-gated findings, and a merge/dedup pipeline. Use when reviewing code changes before creating a PR.",
  ],
}

/** The compound-engineering skill whose current description should also be
 * accepted as an ownership signal for a given stale prompt file. Provides the
 * "current shipped description" leg of the two-signal check so that the alias
 * map above does not need to be touched on every routine description edit. */
const LEGACY_PROMPT_CURRENT_SKILL_FOR_FILE: Record<string, string> = {
  "ce-brainstorm.md": "ce-brainstorm",
  "ce-compound.md": "ce-compound",
  "ce-compound-refresh.md": "ce-compound-refresh",
  "ce-ideate.md": "ce-ideate",
  "ce-plan.md": "ce-plan",
  "ce-review.md": "ce-code-review",
  "ce-work.md": "ce-work",
  "ce-work-beta.md": "ce-work-beta",
}

/**
 * Historical frontmatter descriptions for stale skill dirs that no longer have
 * a current ce-* replacement shipped in the plugin. Because
 * `loadLegacyFingerprints` normally derives the ownership fingerprint by reading
 * the description of the current (renamed) skill, entries listed here would
 * otherwise be skipped and never cleaned up on upgrade.
 *
 * Each value is the full `description:` frontmatter string from the last
 * plugin version that shipped the legacy skill. Keep in sync with git history
 * — the exact string is the ownership proof.
 */
const LEGACY_ONLY_SKILL_DESCRIPTIONS: Record<string, string> = {
  "claude-permissions-optimizer":
    "Optimize Claude Code permissions by finding safe Bash commands from session history and auto-applying them to settings.json. Can run from any coding agent but targets Claude Code specifically. Use when experiencing permission fatigue, too many permission prompts, wanting to optimize permissions, or needing to set up allowlists. Triggers on \"optimize permissions\", \"reduce permission prompts\", \"allowlist commands\", \"too many permission prompts\", \"permission fatigue\", \"permission setup\", or complaints about clicking approve too often.",
  "feature-video":
    "Record a video walkthrough of a feature and add it to the PR description. Use when a PR needs a visual demo for reviewers, when the user asks to demo a feature, create a PR video, record a walkthrough, show what changed visually, or add a video to a pull request.",
  "orchestrating-swarms":
    "This skill should be used when orchestrating multi-agent swarms using Claude Code's TeammateTool and Task system. It applies when coordinating multiple agents, running parallel code reviews, creating pipeline workflows with dependencies, building self-organizing task queues, or any task benefiting from divide-and-conquer patterns.",
  "reproduce-bug":
    "Systematically reproduce and investigate a bug from a GitHub issue. Use when the user provides a GitHub issue number or URL for a bug they want reproduced or investigated.",
  "ce:plan-beta":
    "[BETA] Transform feature descriptions or requirements into structured implementation plans grounded in repo patterns and research. Use when the user says 'plan this', 'create a plan', 'write a tech plan', 'plan the implementation', 'how should we build', 'what's the approach for', 'break this down', or when a brainstorm/requirements document is ready for technical planning. Best when requirements are at least roughly defined; for exploratory or ambiguous requests, prefer ce:brainstorm first.",
  "ce-plan-beta":
    "[BETA] Transform feature descriptions or requirements into structured implementation plans grounded in repo patterns and research. Use when the user says 'plan this', 'create a plan', 'write a tech plan', 'plan the implementation', 'how should we build', 'what's the approach for', 'break this down', or when a brainstorm/requirements document is ready for technical planning. Best when requirements are at least roughly defined; for exploratory or ambiguous requests, prefer ce:brainstorm first.",
  "ce:review-beta":
    "[BETA] Structured code review using tiered persona agents, confidence-gated findings, and a merge/dedup pipeline. Use when reviewing code changes before creating a PR.",
  "ce-review-beta":
    "[BETA] Structured code review using tiered persona agents, confidence-gated findings, and a merge/dedup pipeline. Use when reviewing code changes before creating a PR.",
  "ce-onboarding":
    "Generate or regenerate ONBOARDING.md to help new contributors understand a codebase. Use when the user asks to 'create onboarding docs', 'generate ONBOARDING.md', 'document this project for new developers', 'write onboarding documentation', 'vonboard', 'vonboarding', 'prepare this repo for a new contributor', 'refresh the onboarding doc', or 'update ONBOARDING.md'. Also use when someone needs to onboard a new team member and wants a written artifact, or when a codebase lacks onboarding documentation and the user wants to generate one.",
  "ce-andrew-kane-gem-writer":
    "This skill should be used when writing Ruby gems following Andrew Kane's proven patterns and philosophy. It applies when creating new Ruby gems, refactoring existing gems, designing gem APIs, or when clean, minimal, production-ready Ruby library code is needed. Triggers on requests like \"create a gem\", \"write a Ruby library\", \"design a gem API\", or mentions of Andrew Kane's style.",
  "ce-changelog":
    "Create engaging changelogs for recent merges to main branch",
  "ce-deploy-docs":
    "Validate and prepare documentation for GitHub Pages deployment",
  "ce-dspy-ruby":
    "Build type-safe LLM applications with DSPy.rb — Ruby's programmatic prompt framework with signatures, modules, agents, and optimization. Use when implementing predictable AI features, creating LLM signatures and modules, configuring language model providers, building agent systems with tools, optimizing prompts, or testing LLM-powered functionality in Ruby applications.",
  "ce-every-style-editor":
    "This skill should be used when reviewing or editing copy to ensure adherence to Every's style guide. It provides a systematic line-by-line review process for grammar, punctuation, mechanics, and style guide compliance.",
  "ce-pr-description":
    "Write or regenerate a value-first pull-request description (title + body) for the current branch's commits or for a specified PR. Use when the user says 'write a PR description', 'refresh the PR description', 'regenerate the PR body', 'rewrite this PR', 'freshen the PR', 'update the PR description', 'draft a PR body for this diff', 'describe this PR properly', 'generate the PR title', or pastes a GitHub PR URL / #NN / number. Also used internally by ce-commit-push-pr (single-PR flow) and ce-pr-stack (per-layer stack descriptions) so all callers share one writing voice. Input is a natural-language prompt. A PR reference (a full GitHub PR URL, `pr:561`, `#561`, or a bare number alone) picks a specific PR; anything else is treated as optional steering for the default 'describe my current branch' mode. Returns structured {title, body_file} (body written to an OS temp file) for the caller to apply via gh pr edit or gh pr create — this skill never edits the PR itself and never prompts for confirmation.",
}

/**
 * Historical frontmatter descriptions for stale agent names that no longer
 * have a current ce-* replacement shipped in the plugin. Same purpose and
 * contract as `LEGACY_ONLY_SKILL_DESCRIPTIONS`.
 */
const LEGACY_ONLY_AGENT_DESCRIPTIONS: Record<string, string> = {
  "bug-reproduction-validator":
    "Systematically reproduces and validates bug reports to confirm whether reported behavior is an actual bug. Use when you receive a bug report or issue that needs verification.",
  "lint":
    "Use this agent when you need to run linting and code quality checks on Ruby and ERB files. Run before pushing to origin.",
  "cli-agent-readiness-reviewer":
    "Reviews CLI source code, plans, or specs for AI agent readiness using a severity-based rubric focused on whether a CLI is merely usable by agents or genuinely optimized for them.",
  "ce-cli-agent-readiness-reviewer":
    "Reviews CLI source code, plans, or specs for AI agent readiness using a severity-based rubric focused on whether a CLI is merely usable by agents or genuinely optimized for them.",
  "cli-readiness-reviewer":
    "Conditional code-review persona, selected when the diff touches CLI command definitions, argument parsing, or command handler implementations. Reviews CLI code for agent readiness -- how well the CLI serves autonomous agents, not just human users.",
  "ce-cli-readiness-reviewer":
    "Conditional code-review persona, selected when the diff touches CLI command definitions, argument parsing, or command handler implementations. Reviews CLI code for agent readiness -- how well the CLI serves autonomous agents, not just human users.",
}

type LegacyFingerprints = {
  skills: Map<string, string>
  agents: Map<string, string>
  prompts: Map<string, string>
}

let legacyFingerprintsPromise: Promise<LegacyFingerprints> | null = null

function currentSkillNameForLegacy(legacyName: string): string {
  if (legacyName === "ce:review" || legacyName === "workflows:review" || legacyName === "workflows-review") {
    return "ce-code-review"
  }
  if (legacyName.startsWith("ce:")) {
    return legacyName.replace(/^ce:/, "ce-")
  }
  if (legacyName.startsWith("workflows:")) {
    return `ce-${legacyName.slice("workflows:".length)}`
  }
  if (legacyName.startsWith("workflows-")) {
    return `ce-${legacyName.slice("workflows-".length)}`
  }

  switch (legacyName) {
    case "git-commit":
      return "ce-commit"
    case "git-commit-push-pr":
      return "ce-commit-push-pr"
    case "git-worktree":
      return "ce-worktree"
    case "git-clean-gone-branches":
      return "ce-clean-gone-branches"
    case "report-bug-ce":
      return "ce-report-bug"
    case "document-review":
    case "ce-document-review":
      return "ce-doc-review"
    case "ce-review":
      return "ce-code-review"
    default:
      return legacyName.startsWith("ce-") ? legacyName : `ce-${legacyName}`
  }
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath)
    return true
  } catch {
    return false
  }
}

async function findRepoRoot(startDir: string): Promise<string | null> {
  let current = startDir
  while (true) {
    const pluginRoot = path.join(current, "plugins", "compound-engineering")
    if (await pathExists(pluginRoot)) return current
    const parent = path.dirname(current)
    if (parent === current) return null
    current = parent
  }
}

async function buildSkillIndex(skillsRoot: string): Promise<Map<string, string>> {
  const entries = await fs.readdir(skillsRoot, { withFileTypes: true })
  const index = new Map<string, string>()
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const skillPath = path.join(skillsRoot, entry.name, "SKILL.md")
    if (await pathExists(skillPath)) {
      index.set(entry.name, skillPath)
    }
  }
  return index
}

async function buildAgentIndex(dir: string): Promise<Map<string, string>> {
  const index = new Map<string, string>()
  const stack = [dir]

  while (stack.length > 0) {
    const current = stack.pop()
    if (!current) continue
    const entries = await fs.readdir(current, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(fullPath)
        continue
      }
      if (entry.isFile() && entry.name.endsWith(".md")) {
        index.set(path.basename(entry.name, ".md").replace(/\.agent$/, ""), fullPath)
      }
    }
  }

  return index
}

async function readDescription(filePath: string): Promise<string | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8")
    const { data } = parseFrontmatter(raw, filePath)
    return typeof data.description === "string" ? data.description : null
  } catch {
    return null
  }
}

function normalizeLegacyWorkflowReferences(value: string): string {
  return value.replace(/\bce:([a-z0-9-]+)\b/g, "ce-$1")
}

function descriptionsMatch(
  actualDescription: string | null | undefined,
  expectedDescription: string | undefined,
  aliases: string[] = [],
): boolean {
  if (!actualDescription || !expectedDescription) return false
  const normalizedActual = normalizeLegacyWorkflowReferences(actualDescription)
  const candidates = [expectedDescription, ...aliases].map(normalizeLegacyWorkflowReferences)
  return candidates.includes(normalizedActual)
}

async function loadLegacyFingerprints(): Promise<LegacyFingerprints> {
  if (!legacyFingerprintsPromise) {
    legacyFingerprintsPromise = (async () => {
      const repoRoot = await findRepoRoot(path.dirname(fileURLToPath(import.meta.url)))
      if (!repoRoot) {
        return { skills: new Map(), agents: new Map(), prompts: new Map() }
      }

      const pluginRoot = path.join(repoRoot, "plugins", "compound-engineering")
      const [skillIndex, agentIndex] = await Promise.all([
        buildSkillIndex(path.join(pluginRoot, "skills")),
        buildAgentIndex(path.join(pluginRoot, "agents")),
      ])

      const skills = new Map<string, string>()
      const agents = new Map<string, string>()
      const prompts = new Map<string, string>()

      for (const legacyName of STALE_SKILL_DIRS) {
        const currentPath = skillIndex.get(currentSkillNameForLegacy(legacyName))
        if (currentPath) {
          const description = await readDescription(currentPath)
          if (description) skills.set(legacyName, description)
          continue
        }
        // No current ce-* replacement shipped. Fall back to the hardcoded
        // historical description so cleanup can still fingerprint the
        // legacy-only artifact on upgrade.
        const legacyOnly = LEGACY_ONLY_SKILL_DESCRIPTIONS[legacyName]
        if (legacyOnly) skills.set(legacyName, legacyOnly)
      }

      for (const legacyName of STALE_AGENT_NAMES) {
        const currentPath = agentIndex.get(`ce-${legacyName}`)
        if (currentPath) {
          const description = await readDescription(currentPath)
          if (description) agents.set(legacyName, description)
          continue
        }
        const legacyOnly = LEGACY_ONLY_AGENT_DESCRIPTIONS[legacyName]
        if (legacyOnly) agents.set(legacyName, legacyOnly)
      }

      for (const [fileName, skillName] of Object.entries(LEGACY_PROMPT_CURRENT_SKILL_FOR_FILE)) {
        const currentPath = skillIndex.get(skillName)
        if (!currentPath) continue
        const description = await readDescription(currentPath)
        if (description) prompts.set(fileName, description)
      }

      return { skills, agents, prompts }
    })()
  }

  return legacyFingerprintsPromise
}

function promptSkillNamesForLegacy(fileName: string): string[] {
  switch (fileName) {
    case "ce-review.md":
      return ["ce-review", "ce-code-review", "ce:review"]
    default: {
      const skillName = path.basename(fileName, ".md")
      const legacyWorkflowName = skillName.startsWith("ce-")
        ? skillName.replace(/^ce-/, "ce:")
        : skillName
      return legacyWorkflowName === skillName
        ? [skillName]
        : [skillName, legacyWorkflowName]
    }
  }
}

async function isLegacyPluginOwned(
  targetPath: string,
  expectedDescription: string | undefined,
  extension: string | null,
): Promise<boolean> {
  if (extension === ".json") {
    return isLegacyKiroAgentConfig(targetPath, expectedDescription)
  }

  if (extension === ".md" && path.basename(path.dirname(targetPath)) === "prompts") {
    return isLegacyKiroPrompt(targetPath, expectedDescription)
  }

  if (!expectedDescription) return false
  const filePath = extension === null ? path.join(targetPath, "SKILL.md") : targetPath
  const actualDescription = await readDescription(filePath)
  const aliases = extension === null
    ? LEGACY_SKILL_DESCRIPTION_ALIASES[path.basename(targetPath)] ?? []
    : []
  if (descriptionsMatch(actualDescription, expectedDescription, aliases)) return true

  return false
}

/**
 * Detect a stale Codex prompt wrapper using a two-signal ownership check.
 *
 * **Signal 1 — body instruction fingerprint.** The Codex converter writes
 * the following boilerplate deterministically when emitting a prompt wrapper
 * for an invocable command. These strings have remained stable across every
 * Codex-producing version of the plugin:
 *
 *   - `Use the $ce-plan skill for this command and follow its instructions.`
 *     (v2.39+ command-form wrapper)
 *   - `Use the ce:plan skill for this workflow and follow its instructions exactly.`
 *     (v2.55+ workflow-form wrapper, pre-rename)
 *   - `Use the ce-plan skill for this workflow and follow its instructions exactly.`
 *     (post-rename workflow-form wrapper)
 *
 * The "command" form is NOT exclusive to compound-engineering. `renderPrompt`
 * in `src/converters/claude-to-codex.ts` emits the same sentence (with a
 * different skill name) for every plugin that ships invocable commands. A
 * third-party plugin that happens to ship a same-named prompt wrapper (for
 * example, a fork that keeps the `ce-*` namespace) would produce a wrapper
 * whose body passes this signal alone.
 *
 * **Signal 2 — description ownership.** To avoid deleting another plugin's
 * wrapper out of a shared `~/.codex/prompts/` directory, we additionally
 * require the frontmatter `description:` to match either (a) the current
 * shipped description of the corresponding compound-engineering skill, or
 * (b) one of the historical descriptions we have shipped in a prior release
 * (`LEGACY_PROMPT_DESCRIPTION_ALIASES`). A wrapper with our body fingerprint
 * but a description that has never appeared in any compound-engineering
 * release is treated as NOT ours.
 *
 * Trade-off: adding a new release that reworks a prompt-related skill's
 * description means backfilling the previous description into the alias map
 * so upgrades from that version still clean up cleanly. Missing that backfill
 * only strands one orphan wrapper on upgrade (mild); matching too broadly
 * would delete a sibling plugin's file (destructive). Err on the side of
 * omission.
 */
async function isLegacyPromptWrapper(
  targetPath: string,
  currentPromptDescription: string | undefined,
): Promise<boolean> {
  try {
    const raw = await fs.readFile(targetPath, "utf8")
    const { data, body } = parseFrontmatter(raw, targetPath)
    const fileName = path.basename(targetPath)

    const bodyMatches = promptSkillNamesForLegacy(fileName).some((skillName) =>
      body.includes(`Use the $${skillName} skill for this command and follow its instructions.`)
      || body.includes(`Use the ${skillName} skill for this workflow and follow its instructions exactly.`)
    )
    if (!bodyMatches) return false

    const actualDescription = typeof data.description === "string" ? data.description : null
    const historicalAliases = LEGACY_PROMPT_DESCRIPTION_ALIASES[fileName] ?? []
    return descriptionsMatch(actualDescription, currentPromptDescription, historicalAliases)
  } catch {
    return false
  }
}

async function isLegacyKiroAgentConfig(
  targetPath: string,
  expectedDescription: string | undefined,
): Promise<boolean> {
  if (!expectedDescription) return false

  try {
    const raw = await fs.readFile(targetPath, "utf8")
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const fileName = path.basename(targetPath, ".json")
    const resources = Array.isArray(parsed.resources) ? parsed.resources : []
    const tools = Array.isArray(parsed.tools) ? parsed.tools : []
    const description = typeof parsed.description === "string" ? parsed.description : null
    const welcomeMessage = typeof parsed.welcomeMessage === "string" ? parsed.welcomeMessage : null

    return parsed.name === fileName
      && descriptionsMatch(description, expectedDescription)
      && descriptionsMatch(
        welcomeMessage,
        `Switching to the ${fileName} agent. ${expectedDescription}`,
      )
      && parsed.prompt === `file://./prompts/${fileName}.md`
      && parsed.includeMcpJson === true
      && tools.length === 1
      && tools[0] === "*"
      && resources.includes("file://.kiro/steering/**/*.md")
      && resources.includes("skill://.kiro/skills/**/SKILL.md")
  } catch {
    return false
  }
}

async function isLegacyKiroPrompt(
  targetPath: string,
  expectedDescription: string | undefined,
): Promise<boolean> {
  const agentName = path.basename(targetPath, ".md")
  const siblingConfigPath = path.join(path.dirname(path.dirname(targetPath)), `${agentName}.json`)
  return isLegacyKiroAgentConfig(siblingConfigPath, expectedDescription)
}

async function removeIfExists(targetPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(targetPath)
    if (stat.isDirectory()) {
      await fs.rm(targetPath, { recursive: true })
    } else {
      await fs.unlink(targetPath)
    }
    return true
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return false
    throw err
  }
}

/**
 * Remove stale skill directories from a target's skills root.
 * Call before writing new skills.
 */
export async function cleanupStaleSkillDirs(skillsRoot: string): Promise<number> {
  const { skills } = await loadLegacyFingerprints()
  let removed = 0
  for (const name of STALE_SKILL_DIRS) {
    const targetPath = path.join(skillsRoot, name)
    if (!(await isLegacyPluginOwned(targetPath, skills.get(name), null))) continue
    if (await removeIfExists(targetPath)) removed++
  }
  return removed
}

/**
 * Remove stale agent entries from a target's output directory.
 * Pass the file extension used by the target (e.g., ".md", ".agent.md", ".yaml").
 * For targets that write agents as skill dirs, pass null for extension.
 */
export async function cleanupStaleAgents(
  dir: string,
  extension: string | null,
  namePrefix = "",
): Promise<number> {
  const { agents } = await loadLegacyFingerprints()
  let removed = 0
  for (const name of STALE_AGENT_NAMES) {
    const target = extension
      ? path.join(dir, `${namePrefix}${name}${extension}`)
      : path.join(dir, `${namePrefix}${name}`)
    if (!(await isLegacyPluginOwned(target, agents.get(name), extension))) continue
    if (await removeIfExists(target)) removed++
  }
  return removed
}

/**
 * Remove stale prompt wrapper files.
 * Only applies to targets that used to generate workflow prompt wrappers (Codex).
 *
 * Ownership uses the two-signal check documented on `isLegacyPromptWrapper`:
 * the body must contain one of the compound-engineering-specific instruction
 * sentences AND the frontmatter description must match either the current
 * shipped description of the corresponding ce-* skill or a known historical
 * alias. This prevents deleting a sibling plugin's same-named wrapper from a
 * shared `~/.codex/prompts/` directory when both plugins happen to use the
 * `ce-*` namespace.
 */
export async function cleanupStalePrompts(promptsDir: string): Promise<number> {
  const { prompts } = await loadLegacyFingerprints()
  let removed = 0
  for (const file of STALE_PROMPT_FILES) {
    const targetPath = path.join(promptsDir, file)
    if (!(await isLegacyPromptWrapper(targetPath, prompts.get(file)))) continue
    if (await removeIfExists(targetPath)) removed++
  }
  return removed
}

/**
 * Ownership verdict for an individual Codex prompt file at a shared path like
 * `~/.codex/prompts/<file>.md`. Used by callers in the Codex install and
 * standalone-cleanup paths to gate legacy-name allow-list moves before
 * renaming a file into `compound-engineering/legacy-backup/`.
 *
 * Verdicts:
 *   - `"ce-owned"`: body + frontmatter fingerprint match a known
 *     compound-engineering prompt-wrapper shape. Safe to move.
 *   - `"foreign"`: we have a fingerprint on record for this filename and the
 *     file does NOT match it. A user or sibling plugin authored this file —
 *     leave it alone. `~/.codex/prompts/` is a cross-plugin directory, so a
 *     name-only match (e.g. `ce-plan.md`) is not a strong enough signal.
 *   - `"unknown"`: we have no fingerprint on record for this filename. This
 *     applies to historical prompt wrappers whose corresponding CE skill no
 *     longer ships (e.g. `reproduce-bug.md`, `report-bug.md`) — user
 *     collisions at those names are unlikely, and the historical allow-list
 *     was written specifically to clean them up. Callers may fall back to
 *     name-only cleanup in this case.
 *
 * Rationale for the three-way split: `LEGACY_PROMPT_CURRENT_SKILL_FOR_FILE`
 * + `LEGACY_PROMPT_DESCRIPTION_ALIASES` only cover prompt filenames whose
 * corresponding ce-* skill is still shipped. For names that are fully
 * retired, we have no description to compare against, so a strict ownership
 * gate would strand genuinely-owned orphan wrappers. Reporting `"unknown"`
 * lets callers keep the historical allow-list behavior for those while still
 * gating the realistic collision vectors.
 */
export type CodexPromptOwnership = "ce-owned" | "foreign" | "unknown"

export async function classifyCodexLegacyPromptOwnership(
  promptPath: string,
): Promise<CodexPromptOwnership> {
  const fileName = path.basename(promptPath)
  const { prompts } = await loadLegacyFingerprints()
  const hasFingerprint = prompts.has(fileName) || fileName in LEGACY_PROMPT_DESCRIPTION_ALIASES
  if (!hasFingerprint) return "unknown"
  const ceOwned = await isLegacyPromptWrapper(promptPath, prompts.get(fileName))
  return ceOwned ? "ce-owned" : "foreign"
}
