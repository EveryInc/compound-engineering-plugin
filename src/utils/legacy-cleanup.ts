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
import { load } from "js-yaml"
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
  // ce-polish-beta -> ce-polish (promoted to stable)
  "ce-polish-beta",
  // ce-dogfood-beta -> ce-dogfood (promoted to stable)
  "ce-dogfood-beta",

  // Removed skills (no replacement)
  "ce-andrew-kane-gem-writer",
  "ce-agent-native-architecture",
  "ce-agent-native-audit",
  "ce-changelog",
  "ce-clean-gone-branches",
  "ce-deploy-docs",
  "ce-demo-reel",
  "ce-dhh-rails-style",
  "ce-dspy-ruby",
  "ce-every-style-editor",
  "ce-frontend-design",
  "ce-gemini-imagegen",
  "ce-onboarding",
  "ce-pr-description",
  "ce-release-notes",
  "ce-report-bug",
  "ce-sessions",
  "ce-slack-research",
  "ce-update",
  "ce-work-beta",

  // ce-session-inventory and ce-session-extract were script-host skills called
  // only from ce-session-historian via the Skill tool. That dispatch path
  // deadlocked on Claude Code (subagents cannot invoke Skill — issue #794), so
  // their scripts moved into ce-compound/scripts/session-history/ and the skills were removed.
  "ce-session-inventory",
  "ce-session-extract",
]

/** Old agent names (used as generated skill dirs or flat .md files). */
const STALE_AGENT_NAMES = [
  // Current ce-* standalone agent names removed by the agentless surface
  // reduction. Surviving behavior now lives as skill-local prompt assets.
  "ce-adversarial-document-reviewer",
  "ce-adversarial-reviewer",
  "ce-agent-native-reviewer",
  "ce-ankane-readme-writer",
  "ce-api-contract-reviewer",
  "ce-architecture-strategist",
  "ce-best-practices-researcher",
  "ce-code-simplicity-reviewer",
  "ce-coherence-reviewer",
  "ce-correctness-reviewer",
  "ce-data-integrity-guardian",
  "ce-data-migration-reviewer",
  "ce-deployment-verification-agent",
  "ce-design-implementation-reviewer",
  "ce-design-iterator",
  "ce-design-lens-reviewer",
  "ce-feasibility-reviewer",
  "ce-figma-design-sync",
  "ce-framework-docs-researcher",
  "ce-git-history-analyzer",
  "ce-issue-intelligence-analyst",
  "ce-julik-frontend-races-reviewer",
  "ce-learnings-researcher",
  "ce-maintainability-reviewer",
  "ce-pattern-recognition-specialist",
  "ce-performance-oracle",
  "ce-performance-reviewer",
  "ce-previous-comments-reviewer",
  "ce-pr-comment-resolver",
  "ce-product-lens-reviewer",
  "ce-project-standards-reviewer",
  "ce-reliability-reviewer",
  "ce-repo-research-analyst",
  "ce-scope-guardian-reviewer",
  "ce-security-lens-reviewer",
  "ce-security-reviewer",
  "ce-security-sentinel",
  "ce-session-historian",
  "ce-slack-researcher",
  "ce-spec-flow-analyzer",
  "ce-swift-ios-reviewer",
  "ce-testing-reviewer",
  "ce-web-researcher",

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
  "ce-data-migration-expert",
  "ce-data-migrations-reviewer",
  "ce-dhh-rails-reviewer",
  "ce-kieran-python-reviewer",
  "ce-kieran-rails-reviewer",
  "ce-kieran-typescript-reviewer",
  "ce-schema-drift-detector",
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
  "ce-brainstorm": [
    "Explore requirements and approaches through collaborative dialogue, then write a right-sized requirements document. Use when the user says \"let's brainstorm\", \"what should we build\", or \"help me think through X\", presents a vague or ambitious feature request, or seems unsure about scope or direction -- even without explicitly asking to brainstorm.",
  ],
  "ce:brainstorm": [
    "Explore requirements and approaches through collaborative dialogue, then write a right-sized requirements document. Use when the user says \"let's brainstorm\", \"what should we build\", or \"help me think through X\", presents a vague or ambitious feature request, or seems unsure about scope or direction -- even without explicitly asking to brainstorm.",
  ],
  "workflows-brainstorm": [
    "Explore requirements and approaches through collaborative dialogue, then write a right-sized requirements document. Use when the user says \"let's brainstorm\", \"what should we build\", or \"help me think through X\", presents a vague or ambitious feature request, or seems unsure about scope or direction -- even without explicitly asking to brainstorm.",
  ],
  "workflows:brainstorm": [
    "Explore requirements and approaches through collaborative dialogue, then write a right-sized requirements document. Use when the user says \"let's brainstorm\", \"what should we build\", or \"help me think through X\", presents a vague or ambitious feature request, or seems unsure about scope or direction -- even without explicitly asking to brainstorm.",
  ],
  "ce-code-review": [
    "Structured code review using tiered persona agents, confidence-gated findings, and a merge/dedup pipeline. In interactive mode it applies safe, verified fixes and commits them when the working tree is clean (it never pushes); in mode:agent it reports only and the caller applies. Use when reviewing code changes before creating a PR.",
  ],
  "ce-review": [
    "Structured code review using tiered persona agents, confidence-gated findings, and a merge/dedup pipeline. In interactive mode it applies safe, verified fixes and commits them when the working tree is clean (it never pushes); in mode:agent it reports only and the caller applies. Use when reviewing code changes before creating a PR.",
  ],
  "workflows-review": [
    "Structured code review using tiered persona agents, confidence-gated findings, and a merge/dedup pipeline. In interactive mode it applies safe, verified fixes and commits them when the working tree is clean (it never pushes); in mode:agent it reports only and the caller applies. Use when reviewing code changes before creating a PR.",
  ],
  "workflows:review": [
    "Structured code review using tiered persona agents, confidence-gated findings, and a merge/dedup pipeline. In interactive mode it applies safe, verified fixes and commits them when the working tree is clean (it never pushes); in mode:agent it reports only and the caller applies. Use when reviewing code changes before creating a PR.",
  ],
  "ce-commit": [
    "Create a git commit with a clear, value-communicating message. Use when the user says \"commit\", \"commit this\", \"save my changes\", \"create a commit\", or wants to commit staged or unstaged work. Produces well-structured commit messages that follow repo conventions when they exist, and defaults to conventional commit format otherwise.",
  ],
  "git-commit": [
    "Create a git commit with a clear, value-communicating message. Use when the user says \"commit\", \"commit this\", \"save my changes\", \"create a commit\", or wants to commit staged or unstaged work. Produces well-structured commit messages that follow repo conventions when they exist, and defaults to conventional commit format otherwise.",
  ],
  "ce-plan": [
    "Create structured plans for multi-step tasks -- software features, research workflows, events, study plans, or any goal that benefits from breakdown. Also deepens existing plans with interactive sub-agent review. Use when the user says 'plan this', 'create a plan', 'how should we build', 'break this down', or when a brainstorm doc is ready for planning. Use 'deepen the plan' or 'deepening pass' for the deepening flow. For exploratory requests, prefer ce-brainstorm first.",
  ],
  "ce:plan": [
    "Create structured plans for multi-step tasks -- software features, research workflows, events, study plans, or any goal that benefits from breakdown. Also deepens existing plans with interactive sub-agent review. Use when the user says 'plan this', 'create a plan', 'how should we build', 'break this down', or when a brainstorm doc is ready for planning. Use 'deepen the plan' or 'deepening pass' for the deepening flow. For exploratory requests, prefer ce-brainstorm first.",
  ],
  "workflows-plan": [
    "Create structured plans for multi-step tasks -- software features, research workflows, events, study plans, or any goal that benefits from breakdown. Also deepens existing plans with interactive sub-agent review. Use when the user says 'plan this', 'create a plan', 'how should we build', 'break this down', or when a brainstorm doc is ready for planning. Use 'deepen the plan' or 'deepening pass' for the deepening flow. For exploratory requests, prefer ce-brainstorm first.",
  ],
  "workflows:plan": [
    "Create structured plans for multi-step tasks -- software features, research workflows, events, study plans, or any goal that benefits from breakdown. Also deepens existing plans with interactive sub-agent review. Use when the user says 'plan this', 'create a plan', 'how should we build', 'break this down', or when a brainstorm doc is ready for planning. Use 'deepen the plan' or 'deepening pass' for the deepening flow. For exploratory requests, prefer ce-brainstorm first.",
  ],
  "git-commit-push-pr": [
    "Commit, push, and open a PR with an adaptive, value-first description that scales in depth with the change. Use when the user says \"commit and PR\", \"ship this\", \"create a PR\", or \"open a pull request\". Also handles description-only flows (\"write a PR description\", \"rewrite the PR body\", \"describe this PR\") without committing or pushing.",
  ],
  "ce-compound": [
    "Document a recently solved problem to compound your team's knowledge or CONCEPTS.md, the project's shared domain vocabulary.",
  ],
  "ce:compound": [
    "Document a recently solved problem to compound your team's knowledge or CONCEPTS.md, the project's shared domain vocabulary.",
  ],
  "workflows-compound": [
    "Document a recently solved problem to compound your team's knowledge or CONCEPTS.md, the project's shared domain vocabulary.",
  ],
  "workflows:compound": [
    "Document a recently solved problem to compound your team's knowledge or CONCEPTS.md, the project's shared domain vocabulary.",
  ],
  "ce-compound-refresh": [
    "Refresh stale learning and pattern docs under docs/solutions/ by reviewing them against the current codebase, then updating, consolidating, or deleting drifted ones. Use when the user asks to \"refresh my learnings\", \"audit docs/solutions/\", \"clean up stale learnings\", or \"consolidate overlapping docs\", or when ce-compound flags an older doc as superseded. Do not trigger for general refactor, debugging, or code-review work unless the user has explicitly pointed at docs/solutions/.",
  ],
  "ce:compound-refresh": [
    "Refresh stale learning and pattern docs under docs/solutions/ by reviewing them against the current codebase, then updating, consolidating, or deleting drifted ones. Use when the user asks to \"refresh my learnings\", \"audit docs/solutions/\", \"clean up stale learnings\", or \"consolidate overlapping docs\", or when ce-compound flags an older doc as superseded. Do not trigger for general refactor, debugging, or code-review work unless the user has explicitly pointed at docs/solutions/.",
  ],
  "ce-doc-review": [
    "Review requirements or plan documents using parallel persona agents that surface role-specific issues. Use when a requirements document or plan document exists and the user wants to improve it.",
  ],
  "ce-document-review": [
    "Review requirements or plan documents using parallel persona agents that surface role-specific issues. Use when a requirements document or plan document exists and the user wants to improve it.",
  ],
  "document-review": [
    "Review requirements or plan documents using parallel persona agents that surface role-specific issues. Use when a requirements document or plan document exists and the user wants to improve it.",
  ],
  "ce-ideate": [
    "Generate and critically evaluate grounded ideas about a topic. Use when asking what to improve, requesting idea generation, exploring surprising directions, or wanting the AI to proactively suggest strong options before brainstorming one in depth. Triggers on phrases like 'what should I improve', 'give me ideas', 'ideate on X', 'surprise me', 'what would you change', or any request for AI-generated suggestions rather than refining the user's own idea.",
  ],
  "ce:ideate": [
    "Generate and critically evaluate grounded ideas about a topic. Use when asking what to improve, requesting idea generation, exploring surprising directions, or wanting the AI to proactively suggest strong options before brainstorming one in depth. Triggers on phrases like 'what should I improve', 'give me ideas', 'ideate on X', 'surprise me', 'what would you change', or any request for AI-generated suggestions rather than refining the user's own idea.",
  ],
  "ce-polish-beta": [
    "Start the dev server, open the feature in a browser, and iterate on improvements together. Manual invocation only — type /ce-polish to run it.",
  ],
  "ce-dogfood-beta": [
    "[BETA] Hands-off end-to-end branch dogfood pass with browser testing, auto-fixes, regression tests, and fix commits.",
  ],
  proof: [
    "Publish, view, comment on, and edit markdown via Proof (proofeditor.ai) — create a shareable doc, read a shared doc, and make comment/suggestion/block edits over its API. Use when the user says \"view this in proof\", \"share to proof\", \"publish to proof\", or wants a shareable markdown surface for a spec, plan, or draft, including publish handoffs from ce-brainstorm, ce-ideate, or ce-plan. Do not trigger on \"proof\" meaning evidence, math proofs, proof-of-concept, or \"proofread this\".",
  ],
  "ce-resolve-pr-feedback": [
    "Resolve PR review feedback by evaluating validity and fixing issues in parallel. Use when addressing PR review comments, resolving review threads, or fixing code review feedback.",
  ],
  "resolve-pr-feedback": [
    "Resolve PR review feedback by evaluating validity and fixing issues in parallel. Use when addressing PR review comments, resolving review threads, or fixing code review feedback.",
  ],
  "ce-work": [
    "Execute a plan or concrete work prompt end-to-end. Use when implementing from docs/plans, a spec path, or a clear build request; use ce-debug for open-ended bugs.",
    "Execute work efficiently while maintaining quality and finishing features",
  ],
  "ce:work": [
    "Execute a plan or concrete work prompt end-to-end. Use when implementing from docs/plans, a spec path, or a clear build request; use ce-debug for open-ended bugs.",
    "Execute work efficiently while maintaining quality and finishing features",
  ],
  "workflows-work": [
    "Execute a plan or concrete work prompt end-to-end. Use when implementing from docs/plans, a spec path, or a clear build request; use ce-debug for open-ended bugs.",
    "Execute work efficiently while maintaining quality and finishing features",
  ],
  "workflows:work": [
    "Execute a plan or concrete work prompt end-to-end. Use when implementing from docs/plans, a spec path, or a clear build request; use ce-debug for open-ended bugs.",
    "Execute work efficiently while maintaining quality and finishing features",
  ],
  "ce-work-beta": [
    "[BETA] Execute work with external delegate support. Same as ce-work but includes experimental Codex delegation mode for token-conserving code implementation.",
  ],
  "ce:work-beta": [
    "[BETA] Execute work with external delegate support. Same as ce-work but includes experimental Codex delegation mode for token-conserving code implementation.",
  ],
  "ce-worktree": [
    "Ensure work happens in an isolated git worktree without disturbing the current checkout. Use when starting work that should stay isolated, or when `ce-work` or `ce-code-review` offers a worktree option. Detects existing isolation first, prefers the harness's native worktree tool, and falls back to plain git.",
  ],
  "git-worktree": [
    "Ensure work happens in an isolated git worktree without disturbing the current checkout. Use when starting work that should stay isolated, or when `ce-work` or `ce-code-review` offers a worktree option. Detects existing isolation first, prefers the harness's native worktree tool, and falls back to plain git.",
  ],
  "test-browser": [
    "Run browser tests on pages affected by current PR or branch",
  ],
  "test-xcode": [
    "Build and test iOS apps on simulator using XcodeBuildMCP. Use after making iOS code changes, before creating a PR, or when verifying app behavior and checking for crashes on simulator.",
  ],
  setup: [
    "Configure project-level settings for compound-engineering workflows. Currently a placeholder — review agent selection is handled automatically by ce:review.",
    "Check Compound Engineering health and repo-local config. Reports optional tool capabilities, removes obsolete local config, refreshes the config example, and helps safely gitignore machine-local settings. Use when verifying setup, troubleshooting missing optional tools, or onboarding a repo.",
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
    "Create structured plans for multi-step tasks -- software features, research workflows, events, study plans, or any goal that benefits from breakdown. Also deepens existing plans with interactive sub-agent review. Use when the user says 'plan this', 'create a plan', 'how should we build', 'break this down', or when a brainstorm doc is ready for planning. Use 'deepen the plan' or 'deepening pass' for the deepening flow. For exploratory requests, prefer ce-brainstorm first.",
    "Create structured plans for any multi-step task -- software features, research workflows, events, study plans, or any goal that benefits from structured breakdown. Also deepen existing plans with interactive review of sub-agent findings. Use for plan creation when the user says 'plan this', 'create a plan', 'write a tech plan', 'plan the implementation', 'how should we build', 'what's the approach for', 'break this down', 'plan a trip', 'create a study plan', or when a brainstorm/requirements document is ready for planning. Use for plan deepening when the user says 'deepen the plan', 'deepen my plan', 'deepening pass', or uses 'deepen' in reference to a plan.",
    "Create structured plans for any multi-step task -- software features, research workflows, events, study plans, or any goal that benefits from structured breakdown. Also deepen existing plans with interactive review of sub-agent findings.",
    "Transform feature descriptions or requirements into implementation plans grounded in repo patterns and research.",
  ],
  "ce-work.md": [
    "Execute a plan or concrete work prompt end-to-end. Use when implementing from docs/plans, a spec path, or a clear build request; use ce-debug for open-ended bugs.",
    "Execute work efficiently while maintaining quality and finishing features",
    "Transform feature descriptions or requirements into implementation plans grounded in repo patterns and research.",
  ],
  "ce-work-beta.md": [
    // Last shipped ce-work-beta description (the file was deleted, so this is
    // the final live frontmatter description preserved for upgrade cleanup).
    "[BETA] Execute ce-work with external delegate support.",
    "[BETA] Execute work with external delegate support. Same as ce-work but includes experimental Codex delegation mode for token-conserving code implementation.",
    "[BETA] Execute work with external delegate support. Same as ce:work but includes experimental Codex delegation mode for token-conserving code implementation.",
  ],
  "ce-brainstorm.md": [
    "Explore requirements and approaches through collaborative dialogue, then write a right-sized requirements document. Use when the user says \"let's brainstorm\", \"what should we build\", or \"help me think through X\", presents a vague or ambitious feature request, or seems unsure about scope or direction -- even without explicitly asking to brainstorm.",
    "Explore requirements and approaches through collaborative dialogue before writing a right-sized requirements document and planning implementation. Use for feature ideas, problem framing, when the user says 'let's brainstorm', or when they want to think through options before deciding what to build. Also use when a user describes a vague or ambitious feature request, asks 'what should we build', 'help me think through X', presents a problem with multiple valid solutions, or seems unsure about scope or direction — even if they don't explicitly ask to brainstorm.",
  ],
  "ce-ideate.md": [
    "Generate and critically evaluate grounded ideas about a topic. Use when asking what to improve, requesting idea generation, exploring surprising directions, or wanting the AI to proactively suggest strong options before brainstorming one in depth. Triggers on phrases like 'what should I improve', 'give me ideas', 'ideate on X', 'surprise me', 'what would you change', or any request for AI-generated suggestions rather than refining the user's own idea.",
  ],
  "ce-compound.md": [
    "Document a recently solved problem to compound your team's knowledge or CONCEPTS.md, the project's shared domain vocabulary.",
    "Document a recently solved problem to compound your team's knowledge",
  ],
  "ce-compound-refresh.md": [
    "Refresh stale learning and pattern docs under docs/solutions/ by reviewing them against the current codebase, then updating, consolidating, or deleting drifted ones. Use when the user asks to \"refresh my learnings\", \"audit docs/solutions/\", \"clean up stale learnings\", or \"consolidate overlapping docs\", or when ce-compound flags an older doc as superseded. Do not trigger for general refactor, debugging, or code-review work unless the user has explicitly pointed at docs/solutions/.",
    "Refresh stale or drifting learnings and pattern docs in docs/solutions/ by reviewing, updating, consolidating, replacing, or deleting them against the current codebase. Use after refactors, migrations, dependency upgrades, or when a retrieved learning feels outdated or wrong. Also use when reviewing docs/solutions/ for accuracy, when a recently solved problem contradicts an existing learning, when pattern docs no longer reflect current code, or when multiple docs seem to cover the same topic and might benefit from consolidation.",
  ],
  "ce-review.md": [
    "Structured code review using tiered persona agents, confidence-gated findings, and a merge/dedup pipeline. In interactive mode it applies safe, verified fixes and commits them when the working tree is clean (it never pushes); in mode:agent it reports only and the caller applies. Use when reviewing code changes before creating a PR.",
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
  "ce:work-beta":
    "[BETA] Execute ce-work with external delegate support.",
  "ce-work-beta":
    "[BETA] Execute ce-work with external delegate support.",
  "ce-onboarding":
    "Generate or regenerate ONBOARDING.md to help new contributors understand a codebase. Use when the user asks to 'create onboarding docs', 'generate ONBOARDING.md', 'document this project for new developers', 'write onboarding documentation', 'vonboard', 'vonboarding', 'prepare this repo for a new contributor', 'refresh the onboarding doc', or 'update ONBOARDING.md'. Also use when someone needs to onboard a new team member and wants a written artifact, or when a codebase lacks onboarding documentation and the user wants to generate one.",
  "ce-andrew-kane-gem-writer":
    "This skill should be used when writing Ruby gems following Andrew Kane's proven patterns and philosophy. It applies when creating new Ruby gems, refactoring existing gems, designing gem APIs, or when clean, minimal, production-ready Ruby library code is needed. Triggers on requests like \"create a gem\", \"write a Ruby library\", \"design a gem API\", or mentions of Andrew Kane's style.",
  "ce-changelog":
    "Create engaging changelogs for recent merges to main branch",
  "ce-deploy-docs":
    "Validate and prepare documentation for GitHub Pages deployment",
  "ce-demo-reel":
    "Capture a visual demo reel (GIF, terminal recording, screenshots) for PR descriptions. Use when shipping UI changes, CLI features, or any work with observable behavior that benefits from visual proof. Also use when asked to add a demo, record a GIF, screenshot a feature, show what changed visually, create a demo reel, capture evidence, add proof to a PR, or create a before/after comparison.",
  "ce-dspy-ruby":
    "Build type-safe LLM applications with DSPy.rb — Ruby's programmatic prompt framework with signatures, modules, agents, and optimization. Use when implementing predictable AI features, creating LLM signatures and modules, configuring language model providers, building agent systems with tools, optimizing prompts, or testing LLM-powered functionality in Ruby applications.",
  "ce-every-style-editor":
    "This skill should be used when reviewing or editing copy to ensure adherence to Every's style guide. It provides a systematic line-by-line review process for grammar, punctuation, mechanics, and style guide compliance.",
  "ce-pr-description":
    "Write or regenerate a value-first pull-request description (title + body) for the current branch's commits or for a specified PR. Use when the user says 'write a PR description', 'refresh the PR description', 'regenerate the PR body', 'rewrite this PR', 'freshen the PR', 'update the PR description', 'draft a PR body for this diff', 'describe this PR properly', 'generate the PR title', or pastes a GitHub PR URL / #NN / number. Also used internally by ce-commit-push-pr (single-PR flow) and ce-pr-stack (per-layer stack descriptions) so all callers share one writing voice. Input is a natural-language prompt. A PR reference (a full GitHub PR URL, `pr:561`, `#561`, or a bare number alone) picks a specific PR; anything else is treated as optional steering for the default 'describe my current branch' mode. Returns structured {title, body_file} (body written to an OS temp file) for the caller to apply via gh pr edit or gh pr create — this skill never edits the PR itself and never prompts for confirmation.",
  "ce-session-extract":
    "Extract conversation skeleton or error signals from a single session file at a given path. Invoked by session-research agents after they have selected which sessions to deep-dive — not intended for direct user queries.",
  "ce-session-inventory":
    "Discover session files for a repo across Claude Code, Codex, and Cursor, and extract session metadata (timestamps, branch, cwd, size, platform). Invoked by session-research agents — not intended for direct user queries.",
  "ce-agent-native-audit":
    "Run comprehensive agent-native architecture review with scored principles",
  "ce-agent-native-architecture":
    "Build applications where agents are first-class citizens. Use this skill when designing autonomous agents, creating MCP tools, implementing self-modifying systems, or building apps where features are outcomes achieved by agents operating in a loop.",
  "ce-clean-gone-branches":
    "Clean up local branches whose remote tracking branch is gone. Use when the user says \"clean up branches\", \"delete gone branches\", \"prune local branches\", \"clean gone\", or wants to remove stale local branches that no longer exist on the remote. Also handles removing associated worktrees for branches that have them.",
  "ce-dhh-rails-style":
    "This skill should be used when writing Ruby and Rails code in DHH's distinctive 37signals style. It applies when writing Ruby code, Rails applications, creating models, controllers, or any Ruby file. Triggers on Ruby/Rails code generation, refactoring requests, code review, or when the user mentions DHH, 37signals, Basecamp, HEY, or Campfire style. Embodies REST purity, fat models, thin controllers, Current attributes, Hotwire patterns, and the \"clarity over cleverness\" philosophy.",
  "ce-frontend-design":
    "Build web interfaces with genuine design quality, not AI slop. Use for any frontend work - landing pages, web apps, dashboards, admin panels, components, interactive experiences. Activates for both greenfield builds and modifications to existing applications. Detects existing design systems and respects them. Covers composition, typography, color, motion, and copy. Verifies results via screenshots before declaring done.",
  "ce-gemini-imagegen":
    "This skill should be used when generating and editing images using the Gemini API (Nano Banana Pro). It applies when creating images from text prompts, editing existing images, applying style transfers, generating logos with text, creating stickers, product mockups, or any image generation/manipulation task. Supports text-to-image, image editing, multi-turn refinement, and composition from multiple reference images.",
  "ce-release-notes":
    "Summarize recent compound-engineering plugin releases, or answer a specific question about a past release with a version citation. Use when the user types `/ce-release-notes` or asks \"what changed in compound-engineering recently?\" or \"what happened to `<skill-name>`?\".",
  "ce-report-bug":
    "Report a bug in the compound-engineering plugin",
  "ce-sessions":
    "Search and ask questions about coding agent session history across Claude Code, Codex, and Cursor. Use when asking what was worked on, what was tried before, how a problem was investigated across sessions, what happened recently, or any question about past agent sessions. Also use when the user references prior sessions, previous attempts, or past investigations — even without saying 'sessions' explicitly.",
  "ce-slack-research":
    "Search Slack for interpreted organizational context -- decisions, constraints, and discussion arcs -- and produce a synthesized research digest with cross-cutting analysis. Use when the user says 'search slack for', 'what did we discuss about', 'slack context for', or 'what does the team think about'. Differs from slack:find-discussions, which returns raw message results without synthesis.",
  "ce-update":
    "Check if the compound-engineering plugin is up to date and recommend the\nupdate command if not. Use when the user says \"update compound engineering\",\n\"check compound engineering version\", \"ce update\", \"is compound engineering\nup to date\", \"update ce plugin\", or reports issues that might stem from a\nstale compound-engineering plugin version. This skill only works in Claude\nCode — it relies on the plugin harness cache layout.\n",
}

/**
 * Historical frontmatter descriptions for stale agent names that no longer
 * have a current ce-* replacement shipped in the plugin. Same purpose and
 * contract as `LEGACY_ONLY_SKILL_DESCRIPTIONS`.
 */
const LEGACY_ONLY_AGENT_DESCRIPTIONS: Record<string, string> = {
  "ce-adversarial-document-reviewer":
    "Conditional document-review persona for high-stakes documents -- those with significant architectural decisions, new abstractions, or more than 5 requirements. Challenges premises, surfaces unstated assumptions, and stress-tests decisions rather than evaluating document quality.",
  "ce-adversarial-reviewer":
    "Conditional code-review persona, selected when the diff is large (>=50 changed lines) or touches high-risk domains like auth, payments, data mutations, or external APIs. Actively constructs failure scenarios to break the implementation rather than checking against known patterns.",
  "ce-agent-native-reviewer":
    "Reviews code to ensure agent-native parity -- any action a user can take, an agent can also take. Use after adding UI features, agent tools, or system prompts.",
  "ce-ankane-readme-writer":
    "Creates or updates README files following Ankane-style template for Ruby gems. Use when writing gem documentation with imperative voice, concise prose, and standard section ordering.",
  "ce-api-contract-reviewer":
    "Conditional code-review persona, selected when the diff touches API routes, request/response types, serialization, versioning, or exported type signatures. Reviews code for breaking contract changes.",
  "ce-architecture-strategist":
    "Analyzes code changes from an architectural perspective for pattern compliance and design integrity. Use when reviewing PRs, adding services, or evaluating structural refactors.",
  "ce-best-practices-researcher":
    "Researches and synthesizes external best practices, documentation, and examples for any technology or framework. Use when you need industry standards, community conventions, or implementation guidance.",
  "ce-code-simplicity-reviewer":
    "Final review pass to ensure code is as simple and minimal as possible. Use after implementation is complete to identify YAGNI violations and simplification opportunities.",
  "ce-coherence-reviewer":
    "Reviews planning documents for internal consistency -- contradictions between sections, terminology drift, structural issues, and ambiguity where readers would diverge. Spawned by the document-review skill.",
  "ce-correctness-reviewer":
    "Always-on code-review persona. Reviews code for logic errors, edge cases, state management bugs, error propagation failures, and intent-vs-implementation mismatches.",
  "ce-data-integrity-guardian":
    "Reviews database migrations, data models, and persistent data code for safety. Use when checking migration safety, data constraints, transaction boundaries, or privacy compliance.",
  "ce-data-migration-reviewer":
    "Conditional code-review persona for migration files, schema dumps, backfills, and data transformations. Covers schema drift, mapping correctness, deploy-window safety, and verification plans.",
  "ce-deployment-verification-agent":
    "Produces Go/No-Go deployment checklists with SQL verification queries, rollback procedures, and monitoring plans. Use when PRs touch production data, migrations, or risky data changes.",
  "ce-design-implementation-reviewer":
    "Visually compares live UI implementation against Figma designs and provides detailed feedback on discrepancies. Use after writing or modifying HTML/CSS/React components to verify design fidelity.",
  "ce-design-iterator":
    "Iteratively refines UI design through N screenshot-analyze-improve cycles. Use PROACTIVELY when design changes aren't coming together after 1-2 attempts, or when user requests iterative refinement.",
  "ce-design-lens-reviewer":
    "Reviews planning documents for missing design decisions -- information architecture, interaction states, user flows, and AI slop risk. Uses dimensional rating to identify gaps. Spawned by the document-review skill.",
  "ce-feasibility-reviewer":
    "Evaluates whether proposed technical approaches in planning documents will survive contact with reality -- architecture conflicts, dependency gaps, migration risks, and implementability. Spawned by the document-review skill.",
  "ce-figma-design-sync":
    "Detects and fixes visual differences between a web implementation and its Figma design. Use iteratively when syncing implementation to match Figma specs.",
  "ce-framework-docs-researcher":
    "Gathers comprehensive documentation and best practices for frameworks, libraries, or dependencies. Use when you need official docs, version-specific constraints, or implementation patterns.",
  "ce-git-history-analyzer":
    "Performs archaeological analysis of git history to trace code evolution, identify contributors, and understand why code patterns exist. Use when you need historical context for code changes.",
  "ce-issue-intelligence-analyst":
    "Fetches and analyzes GitHub issues to surface recurring themes, pain patterns, and severity trends. Use when understanding a project's issue landscape, analyzing bug patterns for ideation, or summarizing what users are reporting.",
  "ce-julik-frontend-races-reviewer":
    "Conditional code-review persona, selected when the diff touches async UI code, Stimulus/Turbo lifecycles, or DOM-timing-sensitive frontend behavior. Reviews code for race conditions and janky UI failure modes.",
  "ce-learnings-researcher":
    "Searches docs/solutions/ for applicable past learnings via frontmatter metadata (bugs, architecture, design patterns, conventions, workflow learnings). Use before implementing features, making decisions, or starting work in a documented area so institutional knowledge carries forward.",
  "ce-maintainability-reviewer":
    "Always-on code-review persona. Reviews code for structural quality, complexity deletion, coupling, naming, dead code, type-boundary leaks, and abstraction debt.",
  "ce-pattern-recognition-specialist":
    "Analyzes code for design patterns, anti-patterns, naming conventions, and duplication. Use when checking codebase consistency or verifying new code follows established patterns.",
  "ce-performance-oracle":
    "Analyzes code for performance bottlenecks, algorithmic complexity, database queries, memory usage, and scalability. Use after implementing features or when performance concerns arise.",
  "ce-performance-reviewer":
    "Conditional code-review persona, selected when the diff touches database queries, loop-heavy data transforms, caching layers, or I/O-intensive paths. Reviews code for runtime performance and scalability issues.",
  "ce-pr-comment-resolver":
    "Evaluates and resolves one or more related PR review threads -- assesses validity, implements fixes, and returns structured summaries with reply text. Spawned by the resolve-pr-feedback skill.",
  "ce-previous-comments-reviewer":
    "Conditional code-review persona, selected when reviewing a PR that has existing review comments or review threads. Checks whether prior feedback has been addressed in the current diff.",
  "ce-product-lens-reviewer":
    "Reviews planning documents as a senior product leader -- challenges premise claims, assesses strategic consequences (trajectory, identity, adoption, opportunity cost), and surfaces goal-work misalignment. Spawned by the document-review skill.",
  "ce-project-standards-reviewer":
    "Always-on code-review persona. Audits changes against the project's own CLAUDE.md and AGENTS.md standards -- frontmatter rules, reference inclusion, naming conventions, cross-platform portability, and tool selection policies.",
  "ce-reliability-reviewer":
    "Conditional code-review persona, selected when the diff touches error handling, retries, circuit breakers, timeouts, health checks, background jobs, or async handlers. Reviews code for production reliability and failure modes.",
  "ce-repo-research-analyst":
    "Conducts thorough research on repository structure, documentation, conventions, and implementation patterns. Use when onboarding to a new codebase or understanding project conventions.",
  "ce-scope-guardian-reviewer":
    "Reviews planning documents for scope alignment and unjustified complexity -- challenges unnecessary abstractions, premature frameworks, and scope that exceeds stated goals. Spawned by the document-review skill.",
  "ce-security-lens-reviewer":
    "Evaluates planning documents for security gaps at the plan level -- auth/authz assumptions, data exposure risks, API surface vulnerabilities, and missing threat model elements. Spawned by the document-review skill.",
  "ce-security-reviewer":
    "Conditional code-review persona, selected when the diff touches auth middleware, public endpoints, user input handling, or permission checks. Reviews code for exploitable vulnerabilities.",
  "ce-security-sentinel":
    "Performs security audits for vulnerabilities, input validation, auth/authz, hardcoded secrets, and OWASP compliance. Use when reviewing code for security issues or before deployment.",
  "ce-session-historian":
    "Synthesizes findings from prior coding-agent sessions about the same problem or topic. Receives pre-extracted skeleton/error file paths from a `ce-sessions` orchestrator and returns prose findings — investigation journey, what didn't work, key decisions, related context. Not intended for direct dispatch — use `/ce-sessions` (or another caller that runs the full discovery + extract pipeline first).",
  "ce-slack-researcher":
    "Searches Slack for organizational context -- decisions, constraints, and discussions that may not be documented elsewhere. Use when the user explicitly asks to search Slack for context during ideation, planning, or brainstorming.",
  "ce-spec-flow-analyzer":
    "Analyzes specifications and feature descriptions for user flow completeness and gap identification. Use when a spec, plan, or feature description needs flow analysis, edge case discovery, or requirements validation.",
  "ce-swift-ios-reviewer":
    "Conditional code-review persona, selected when the diff touches Swift files, SwiftUI/UIKit views, iOS entitlements, privacy manifests, Core Data models, SPM manifests, storyboards/XIBs, or semantic .pbxproj changes. Reviews for SwiftUI correctness, state management, memory safety, Swift concurrency, Core Data threading, and accessibility.",
  "ce-testing-reviewer":
    "Always-on code-review persona. Reviews code for test coverage gaps, weak assertions, brittle implementation-coupled tests, and missing edge case coverage.",
  "ce-web-researcher":
    "Performs iterative web research and returns structured external grounding. Use when planning or ideating outside the codebase, validating prior art, scanning competitor patterns, finding cross-domain analogies, or fetching market signals. Prefer over manual web searches for structured external context.",

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
  "data-migration-expert":
    "Validates data migrations, backfills, and production data transformations against reality. Use when PRs involve ID mappings, column renames, enum conversions, or schema changes.",
  "data-migrations-reviewer":
    "Conditional code-review persona, selected when the diff touches migration files, schema changes, data transformations, or backfill scripts. Reviews code for data integrity and migration safety.",
  "dhh-rails-reviewer":
    "Conditional code-review persona, selected when Rails diffs introduce architectural choices, abstractions, or frontend patterns that may fight the framework. Reviews code from an opinionated DHH perspective.",
  "kieran-python-reviewer":
    "Conditional code-review persona, selected when the diff touches Python code. Reviews changes with Kieran's strict bar for Pythonic clarity, type hints, and maintainability.",
  "kieran-rails-reviewer":
    "Conditional code-review persona, selected when the diff touches Rails application code. Reviews Rails changes with Kieran's strict bar for clarity, conventions, and maintainability.",
  "kieran-typescript-reviewer":
    "Conditional code-review persona, selected when the diff touches TypeScript code. Reviews changes with Kieran's strict bar for type safety, clarity, and maintainability.",
  "schema-drift-detector":
    "Detects unrelated schema.rb changes in PRs by cross-referencing against included migrations. Use when reviewing PRs with database schema changes.",
  "ce-data-migration-expert":
    "Validates data migrations, backfills, and production data transformations against reality. Use when PRs involve ID mappings, column renames, enum conversions, or schema changes.",
  "ce-data-migrations-reviewer":
    "Conditional code-review persona, selected when the diff touches migration files, schema changes, data transformations, or backfill scripts. Reviews code for data integrity and migration safety.",
  "ce-dhh-rails-reviewer":
    "Conditional code-review persona, selected when Rails diffs introduce architectural choices, abstractions, or frontend patterns that may fight the framework. Reviews code from an opinionated DHH perspective.",
  "ce-kieran-python-reviewer":
    "Conditional code-review persona, selected when the diff touches Python code. Reviews changes with Kieran's strict bar for Pythonic clarity, type hints, and maintainability.",
  "ce-kieran-rails-reviewer":
    "Conditional code-review persona, selected when the diff touches Rails application code. Reviews Rails changes with Kieran's strict bar for clarity, conventions, and maintainability.",
  "ce-kieran-typescript-reviewer":
    "Conditional code-review persona, selected when the diff touches TypeScript code. Reviews changes with Kieran's strict bar for type safety, clarity, and maintainability.",
  "ce-schema-drift-detector":
    "Detects unrelated schema.rb changes in PRs by cross-referencing against included migrations. Use when reviewing PRs with database schema changes.",
}

type LegacyFingerprints = {
  skills: Map<string, string>
  agents: Map<string, string>
  prompts: Map<string, string>
}

let legacyFingerprintsPromise: Promise<LegacyFingerprints> | null = null

function currentAgentNameForLegacy(legacyName: string): string {
  return legacyName.startsWith("ce-") ? legacyName : `ce-${legacyName}`
}

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
    // Promoted-from-beta renames: map to the shipping stable name so cleanup
    // seeds a fingerprint. Without this, loadLegacyFingerprints leaves the
    // description undefined and isLegacyPluginOwned bails, so the stale beta
    // dir is never swept on upgrade.
    case "ce-polish-beta":
      return "ce-polish"
    case "ce-dogfood-beta":
      return "ce-dogfood"
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
    const rootPluginManifest = path.join(current, ".claude-plugin", "plugin.json")
    if (await pathExists(rootPluginManifest)) return current
    const legacyPluginRoot = path.join(current, "plugins", "compound-engineering")
    if (await pathExists(legacyPluginRoot)) return current
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
  if (!(await pathExists(dir))) return index
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

async function readYamlDescription(filePath: string): Promise<string | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8")
    const parsed = load(raw)
    if (!parsed || typeof parsed !== "object") return null
    const description = (parsed as Record<string, unknown>).description
    return typeof description === "string" ? description : null
  } catch {
    return null
  }
}

async function readTomlDescription(filePath: string): Promise<string | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8")
    const match = raw.match(/^description\s*=\s*"((?:\\.|[^"\\])*)"/m)
    if (!match) return null
    return match[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\")
  } catch {
    return null
  }
}

function normalizeLegacyWorkflowReferences(value: string): string {
  return value.replace(/\bce:([a-z0-9-]+)\b/g, "ce-$1")
}

function normalizeDescriptionFingerprint(value: string): string {
  return normalizeLegacyWorkflowReferences(value).replace(/\s+/g, " ").trim()
}

function descriptionsMatch(
  actualDescription: string | null | undefined,
  expectedDescription: string | undefined,
  aliases: string[] = [],
): boolean {
  if (!actualDescription || !expectedDescription) return false
  const normalizedActual = normalizeDescriptionFingerprint(actualDescription)
  const candidates = [expectedDescription, ...aliases].map(normalizeDescriptionFingerprint)
  return candidates.includes(normalizedActual)
}

async function loadLegacyFingerprints(): Promise<LegacyFingerprints> {
  if (!legacyFingerprintsPromise) {
    legacyFingerprintsPromise = (async () => {
      const repoRoot = await findRepoRoot(path.dirname(fileURLToPath(import.meta.url)))
      if (!repoRoot) {
        return { skills: new Map(), agents: new Map(), prompts: new Map() }
      }

      const rootPluginManifest = path.join(repoRoot, ".claude-plugin", "plugin.json")
      const pluginRoot = await pathExists(rootPluginManifest)
        ? repoRoot
        : path.join(repoRoot, "plugins", "compound-engineering")
      const [skillIndex, agentIndex] = await Promise.all([
        buildSkillIndex(path.join(pluginRoot, "skills")),
        buildAgentIndex(path.join(pluginRoot, "agents")),
      ])

      const skills = new Map<string, string>()
      const agents = new Map<string, string>()
      const prompts = new Map<string, string>()

      for (const [skillName, skillPath] of skillIndex.entries()) {
        const description = await readDescription(skillPath)
        if (description) skills.set(skillName, description)
      }

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
          ?? LEGACY_ONLY_SKILL_DESCRIPTIONS[currentSkillNameForLegacy(legacyName)]
        if (legacyOnly) skills.set(legacyName, legacyOnly)
      }

      for (const legacyName of STALE_AGENT_NAMES) {
        const currentPath = agentIndex.get(currentAgentNameForLegacy(legacyName))
        if (currentPath) {
          const description = await readDescription(currentPath)
          if (description) agents.set(legacyName, description)
          continue
        }
        const legacyOnly = LEGACY_ONLY_AGENT_DESCRIPTIONS[legacyName]
          ?? LEGACY_ONLY_AGENT_DESCRIPTIONS[currentAgentNameForLegacy(legacyName)]
        if (legacyOnly) agents.set(legacyName, legacyOnly)
      }

      for (const [fileName, skillName] of Object.entries(LEGACY_PROMPT_CURRENT_SKILL_FOR_FILE)) {
        const currentPath = skillIndex.get(skillName)
        if (currentPath) {
          const description = await readDescription(currentPath)
          if (description) prompts.set(fileName, description)
          continue
        }
        // The mapped skill no longer ships (fully retired, e.g. ce-work-beta).
        // Seed the prompt fingerprint with any historical alias so cleanup can
        // still match and sweep the orphaned wrapper on upgrade. The specific
        // value is not significant — isLegacyPromptWrapper unions the full
        // LEGACY_PROMPT_DESCRIPTION_ALIASES list when matching; this only has to
        // be a non-empty description to clear descriptionsMatch's guard. Mirrors
        // the LEGACY_ONLY_SKILL_DESCRIPTIONS / LEGACY_ONLY_AGENT_DESCRIPTIONS
        // fallbacks above; the prompts dir is cross-plugin, so a description
        // fingerprint (not a name-only match) is required to sweep safely.
        const historicalFingerprint = LEGACY_PROMPT_DESCRIPTION_ALIASES[fileName]?.[0]
        if (historicalFingerprint) prompts.set(fileName, historicalFingerprint)
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
  if (extension === ".yaml") {
    const actualDescription = await readYamlDescription(targetPath)
    return descriptionsMatch(actualDescription, expectedDescription)
  }
  if (extension === ".toml") {
    const actualDescription = await readTomlDescription(targetPath)
    return descriptionsMatch(actualDescription, expectedDescription)
  }

  const filePath = extension === null ? path.join(targetPath, "SKILL.md") : targetPath
  const actualDescription = await readDescription(filePath)
  const aliases = extension === null
    ? LEGACY_SKILL_DESCRIPTION_ALIASES[path.basename(targetPath)] ?? []
    : []
  if (descriptionsMatch(actualDescription, expectedDescription, aliases)) return true

  return false
}

export async function isLegacyAgentArtifactOwned(
  targetPath: string,
  legacyName: string,
  extension: string | null,
): Promise<boolean> {
  const { agents } = await loadLegacyFingerprints()
  return isLegacyPluginOwned(targetPath, agents.get(legacyName), extension)
}

export async function isLegacySkillArtifactOwned(
  targetPath: string,
  legacyName: string,
): Promise<boolean> {
  const { skills, agents } = await loadLegacyFingerprints()
  if (await isLegacyPluginOwned(targetPath, skills.get(legacyName), null)) {
    return true
  }
  return isLegacyPluginOwned(targetPath, agents.get(legacyName), null)
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
