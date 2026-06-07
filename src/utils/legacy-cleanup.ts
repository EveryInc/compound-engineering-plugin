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
import { pathExists } from "./files"

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

  // Removed skills (no replacement)
  "ce-andrew-kane-gem-writer",
  "ce-changelog",
  "ce-deploy-docs",
  "ce-dspy-ruby",
  "ce-every-style-editor",
  "ce-onboarding",
  "ce-pr-description",

  // ce-session-inventory and ce-session-extract were script-host skills called
  // only from ce-session-historian via the Skill tool. That dispatch path
  // deadlocked on Claude Code (subagents cannot invoke Skill — issue #794), so
  // their scripts moved into ce-sessions/scripts/ and the skills were removed.
  "ce-session-inventory",
  "ce-session-extract",

  // Removed Slack feature (agent + skill dropped together)
  "ce-slack-research",

  // Removed niche domain skills (slim/plugin-lightweight)
  "ce-dhh-rails-style",
  "ce-test-xcode",
  "ce-riffrec-feedback-analysis",
  "ce-product-pulse",
  "ce-proof",
  "ce-promote",
  "ce-gemini-imagegen",

  // Merged into ce-commit-push-pr (commit-only mode covers this use case)
  "ce-commit",

  // Merged into ce-compound as mode:refresh (slim/plugin-lightweight)
  "ce-compound-refresh",

  // Merged into ce-work (delegation mode absorbed into stable skill)
  "ce-work-beta",

  // Removed autonomous pipeline orchestrator (slim/ultra-minimal)
  "lfg",

  // Removed branch-hygiene skill (slim/ultra-minimal)
  "ce-clean-gone-branches",

  // Removed bug-filing skill (slim/ultra-minimal). The renamed-era
  // "report-bug-ce" entry above stays; this is the current-era dir name.
  "ce-report-bug",

  // Removed upstream-anchor strategy skill (slim/ultra-minimal)
  "ce-strategy",

  // Removed diff-scoped browser QA dogfood skill (slim/ultra-minimal)
  "ce-dogfood-beta",

  // Removed end-to-end browser testing skill (slim/ultra-minimal). The renamed-era
  // "test-browser" entry above stays; this is the current-era dir name.
  "ce-test-browser",

  // Removed visual evidence capture skill (slim/ultra-minimal). The renamed-era
  // "demo-reel" entry (in plugin-legacy-artifacts) stays; this is the current-era dir name.
  "ce-demo-reel",

  // Removed plugin release-history skill (slim/ultra-minimal). The colon-era
  // "ce:release-notes" entry (in plugin-legacy-artifacts) stays; this is the
  // current-era dash dir name.
  "ce-release-notes",

  // Removed parallel PR-feedback resolution skill (slim/ultra-minimal). The
  // renamed-era "resolve-pr-feedback" entry above stays; this is the
  // current-era dir name.
  "ce-resolve-pr-feedback",

  // Removed big-picture ideation skill (slim/ultra-minimal). The colon-era
  // "ce:ideate" entry above stays; this is the current-era dash dir name.
  "ce-ideate",

  // Removed conversational UX polish skill (slim/ultra-minimal). The
  // "ce-polish-beta" entry above stays; this is the promoted stable dir name.
  "ce-polish",

  // Removed agent-native skill pair (slim/ultra-minimal). The unprefixed
  // "agent-native-architecture"/"agent-native-audit" entries above stay; these
  // are the current-era ce- prefixed dir names.
  "ce-agent-native-architecture",
  "ce-agent-native-audit",

  // Removed metric-driven optimization skill (slim/ultra-minimal). Only ever
  // shipped under the ce- prefix, so no colon/unprefixed variant is needed.
  "ce-optimize",
]

/** Old agent names (used as generated skill dirs or flat .md files). */
const STALE_AGENT_NAMES = [
  // Legacy agent names that were renamed from <name> to ce-<name>
  "adversarial-document-reviewer",
  "adversarial-reviewer",
  "agent-native-reviewer",
  "ce-agent-native-reviewer",
  "ankane-readme-writer",
  "api-contract-reviewer",
  "ce-api-contract-reviewer",
  "architecture-strategist",
  "best-practices-researcher",
  "bug-reproduction-validator",
  "ce-ankane-readme-writer",
  "ce-cli-agent-readiness-reviewer",
  "ce-cli-readiness-reviewer",
  "ce-data-migration-expert",
  "ce-data-migrations-reviewer",
  "ce-design-implementation-reviewer",
  "ce-design-iterator",
  "ce-dhh-rails-reviewer",
  "ce-kieran-python-reviewer",
  "ce-kieran-rails-reviewer",
  "ce-kieran-typescript-reviewer",
  "ce-schema-drift-detector",
  "ce-swift-ios-reviewer",
  "cli-agent-readiness-reviewer",
  "cli-readiness-reviewer",
  "code-simplicity-reviewer",
  "ce-code-simplicity-reviewer",
  "coherence-reviewer",
  "correctness-reviewer",
  "data-integrity-guardian",
  "ce-data-integrity-guardian",
  "data-migration-expert",
  "data-migration-reviewer",
  "ce-data-migration-reviewer",
  "data-migrations-reviewer",
  "deployment-verification-agent",
  "ce-deployment-verification-agent",
  "design-implementation-reviewer",
  "design-iterator",
  "design-lens-reviewer",
  "ce-design-lens-reviewer",
  "dhh-rails-reviewer",
  "feasibility-reviewer",
  "figma-design-sync",
  "ce-figma-design-sync",
  "ce-framework-docs-researcher",
  "git-history-analyzer",
  "ce-git-history-analyzer",
  "issue-intelligence-analyst",
  "ce-issue-intelligence-analyst",
  "julik-frontend-races-reviewer",
  "ce-julik-frontend-races-reviewer",
  "kieran-python-reviewer",
  "kieran-rails-reviewer",
  "kieran-typescript-reviewer",
  "learnings-researcher",
  "lint",
  "maintainability-reviewer",
  "ce-maintainability-reviewer",
  "pattern-recognition-specialist",
  "ce-pattern-recognition-specialist",
  "performance-oracle",
  "ce-performance-oracle",
  "performance-reviewer",
  "previous-comments-reviewer",
  "pr-comment-resolver",
  "ce-pr-comment-resolver",
  "product-lens-reviewer",
  "ce-product-lens-reviewer",
  "project-standards-reviewer",
  "ce-project-standards-reviewer",
  "reliability-reviewer",
  "ce-reliability-reviewer",
  "repo-research-analyst",
  "schema-drift-detector",
  "session-historian",
  "slack-researcher",
  "ce-slack-researcher",
  "scope-guardian-reviewer",
  "ce-scope-guardian-reviewer",
  "security-lens-reviewer",
  "ce-security-lens-reviewer",
  "security-reviewer",
  "security-sentinel",
  "ce-security-sentinel",
  "spec-flow-analyzer",
  "ce-spec-flow-analyzer",
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

/**
 * Known historical `description:` frontmatter values we have shipped for each
 * stale skill dir, keyed by the flat dir name the Codex skill-dir cleanup path
 * probes (`~/.codex/skills/<name>/`). Pairs with the SKILL.md description match
 * in `isLegacyPluginOwned` to gate ownership: the current shipped description of
 * the renamed skill is accepted automatically via `loadLegacyFingerprints`, so
 * only historical (now-reworded) values need to live here.
 *
 * This mirrors the contract of `LEGACY_PROMPT_DESCRIPTION_ALIASES`: each entry
 * is the exact, character-for-character `description:` string from a shipped
 * compound-engineering release (all skill rewords across versions, including the
 * ce:/ce- and workflows-* naming eras). Colon-variant dir names (e.g.
 * `workflows:plan`) alias to the same underlying skill as their sanitized
 * sibling and share its description history, so both are keyed here.
 *
 * Adding a release that rewords one of these descriptions means adding the
 * previous description here so a flat-era install from that version still
 * classifies as ce-owned and sweeps cleanly. Missing an entry only strands one
 * orphaned skill dir on upgrade (a mild regression); matching too broadly would
 * relocate another plugin's or a user's same-named skill (destructive). The
 * strings are mined verbatim from git history, never paraphrased.
 */
const LEGACY_SKILL_DESCRIPTION_ALIASES: Record<string, string[]> = {
  "ce-agent-native-architecture": [
    "This skill should be used when building AI agents using prompt-native architecture where features are defined in prompts, not code. Use it when creating autonomous agents, designing MCP servers, implementing self-modifying systems, or adopting the \"trust the agent's intelligence\" philosophy.",
    "Build AI agents using prompt-native architecture where features are defined in prompts, not code. Use when creating autonomous agents, designing MCP servers, implementing self-modifying systems, or adopting the \"trust the agent's intelligence\" philosophy.",
  ],
  "ce-andrew-kane-gem-writer": [
    "Write Ruby gems following Andrew Kane's proven patterns and philosophy. Use when creating new Ruby gems, refactoring existing gems, designing gem APIs, or when the user wants clean, minimal, production-ready Ruby library code. Triggers on requests like \"create a gem\", \"write a Ruby library\", \"design a gem API\", or mentions of Andrew Kane's style.",
  ],
  "ce-dhh-rails-style": [
    "Write Ruby and Rails code in DHH's distinctive 37signals style. Use this skill when writing Ruby code, Rails applications, creating models, controllers, or any Ruby file. Triggers on Ruby/Rails code generation, refactoring requests, code review, or when the user mentions DHH, 37signals, Basecamp, HEY, or Campfire style. Embodies REST purity, fat models, thin controllers, Current attributes, Hotwire patterns, and the \"clarity over cleverness\" philosophy.",
  ],
  "ce-document-review": [
    "This skill should be used to refine requirements or plan documents before proceeding to the next workflow step. It applies when a requirements document or plan document exists and the user wants to improve it.",
    "This skill should be used to refine brainstorm or plan documents before proceeding to the next workflow step. It applies when a brainstorm or plan document exists and the user wants to improve it.",
  ],
  "ce-dspy-ruby": [
    "This skill should be used when working with DSPy.rb, a Ruby framework for building type-safe, composable LLM applications. Use this when implementing predictable AI features, creating LLM signatures and modules, configuring language model providers (OpenAI, Anthropic, Gemini, Ollama), building agent systems with tools, optimizing prompts, or testing LLM-powered functionality in Ruby applications.",
  ],
  "ce-gemini-imagegen": [
    "Generate and edit images using the Gemini API (Nano Banana Pro). Use this skill when creating images from text prompts, editing existing images, applying style transfers, generating logos with text, creating stickers, product mockups, or any image generation/manipulation task. Supports text-to-image, image editing, multi-turn refinement, and composition from multiple reference images.",
    "Generate and edit images using the Gemini API (Nano Banana). Use this skill when creating images from text prompts, editing existing images, applying style transfers, generating logos with text, creating stickers, product mockups, or any image generation/manipulation task. Supports text-to-image, image editing, multi-turn refinement, and composition from multiple reference images.",
  ],
  "ce-ideate": [
    "Generate and critically evaluate grounded improvement ideas for the current project. Use when asking what to improve, requesting idea generation, exploring surprising improvements, or wanting the AI to proactively suggest strong project directions before brainstorming one in depth. Triggers on phrases like 'what should I improve', 'give me ideas', 'ideate on this project', 'surprise me with improvements', 'what would you change', or any request for AI-generated project improvement suggestions rather than refining the user's own idea.",
  ],
  "ce-optimize": [
    "Run metric-driven iterative optimization loops. Define a measurable goal, build measurement scaffolding, then run parallel experiments that try many approaches, measure each against hard gates and/or LLM-as-judge quality scores, keep improvements, and converge toward the best solution. Use when optimizing clustering quality, search relevance, build performance, prompt quality, or any measurable outcome that benefits from systematic experimentation. Inspired by Karpathy's autoresearch, generalized for multi-file code changes and non-ML domains.",
  ],
  "ce-plan-beta": [
    "[BETA] Transform feature descriptions or requirements into structured, decision-first implementation plans. Use when testing the new planning workflow. Produces plans focused on decisions, boundaries, and verification rather than pre-written implementation choreography.",
    "Transform feature descriptions into well-structured project plans following conventions",
    "Transform feature descriptions or requirements into structured implementation plans grounded in repo patterns and research. Use when the user says \"plan this\", \"create a plan\", \"how should we build\", \"write a tech plan\", \"plan the implementation\", or when a brainstorm/requirements document is ready for implementation planning. Also triggers on \"what's the approach for\", \"break this down\", or references to an existing requirements doc that needs a technical plan.",
  ],
  "ce-polish": [
    "[BETA] Start the dev server, open the feature in a browser, and iterate on improvements together.",
  ],
  "ce-pr-description": [
    "Write or regenerate a value-first pull-request description (title + body) for the current branch's commits or for a specified PR. Use when the user says 'write a PR description', 'refresh the PR description', 'regenerate the PR body', 'rewrite this PR', 'freshen the PR', 'update the PR description', 'draft a PR body for this diff', 'describe this PR properly', 'generate the PR title', or pastes a GitHub PR URL / #NN / number. Also used internally by git-commit-push-pr (single-PR flow) and ce-pr-stack (per-layer stack descriptions) so all callers share one writing voice. Input is a natural-language prompt. A PR reference (a full GitHub PR URL, `pr:561`, `#561`, or a bare number alone) picks a specific PR; anything else is treated as optional steering for the default 'describe my current branch' mode. Returns structured {title, body_file} (body written to an OS temp file) for the caller to apply via gh pr edit or gh pr create — this skill never edits the PR itself and never prompts for confirmation.",
    "Write or regenerate a value-first pull-request description (title + body) for the current branch's commits or for a specified PR. Use when the user says 'write a PR description', 'refresh the PR description', 'regenerate the PR body', 'rewrite this PR', 'freshen the PR', 'update the PR description', 'draft a PR body for this diff', 'describe this PR properly', 'generate the PR title', or pastes a GitHub PR URL / #NN / number. Also used internally by git-commit-push-pr (single-PR flow) and ce-pr-stack (per-layer stack descriptions) so all callers share one writing voice. Input is a natural-language prompt. A PR reference (a full GitHub PR URL, `pr:561`, `#561`, or a bare number alone) picks a specific PR; anything else is treated as optional steering for the default 'describe my current branch' mode. Returns structured {title, body} for the caller to apply via gh pr edit or gh pr create — this skill never edits the PR itself and never prompts for confirmation.",
  ],
  "ce-proof": [
    "Create, share, view, comment on, edit, and run human-in-the-loop review loops over markdown documents via Proof, the collaborative markdown editor at proofeditor.ai (\"Proof editor\"). Use when the user wants to render or view a local markdown file in Proof, share markdown to get a URL, iterate collaboratively on a Proof doc, comment on or suggest edits in Proof, HITL a spec/plan/draft for human review, sync a Proof doc back to local, or work from a proofeditor.ai URL. Trigger on phrases like \"view this in proof\", \"share to proof\", \"iterate with proof\", or \"HITL this doc\", and on ce-brainstorm / ce-ideate / ce-plan handoffs for human review. Also match clear requests for a rendered/shared markdown review surface even if the user does not name Proof. Do not trigger on \"proof\" meaning evidence, math/logic proof, burden of proof, proof-of-concept, or bare \"proofread this\" requests where inline text review is expected.",
    "Create, share, view, comment on, edit, and run human-in-the-loop review loops over markdown documents via Proof — the collaborative markdown editor and renderer at proofeditor.ai (also called \"Proof editor\"). Use this skill whenever the user wants to view or render a local markdown file in Proof for easier reading, share a markdown file to Proof to get a shareable URL, iterate on a Proof doc collaboratively, comment on or suggest edits in a Proof doc, HITL a spec/plan/draft for human review, sync a Proof doc back to local, or when given a proofeditor.ai URL. Common phrasings include \"view this in proof\", \"render this markdown in proof\", \"open this md file in proof\", \"share it to proof\", \"share to proof editor\", \"iterate with proof\", \"HITL this doc\". Upstream handoffs from ce-brainstorm / ce-ideate / ce-plan for human review also belong here. Match these intents even when the user doesn't name Proof, as long as they clearly want a rendered/shared markdown surface. Do NOT trigger on \"proof\" meaning evidence, a mathematical/logical proof, burden of proof, proof-of-concept, or a bare \"proofread this\" request where the model is expected to review text inline.",
    "Create, edit, comment on, share, and run human-in-the-loop iteration loops over markdown documents via Proof's web API. Use when asked to \"proof\", \"share a doc\", \"create a proof doc\", \"comment on a document\", \"suggest edits\", \"review in proof\", \"iterate on this doc in proof\", \"HITL this doc\", \"sync a Proof doc to local\", when a caller needs an HITL review loop over a local markdown file (e.g., ce-brainstorm, ce-ideate, or ce-plan handoff), or when given a proofeditor.ai URL. Prefer this skill for any workflow whose output is a Proof URL or that uses a Proof doc as the review surface, even when not named explicitly.",
    "Create, edit, comment on, and share markdown documents via Proof's web API and local bridge. Use when asked to \"proof\", \"share a doc\", \"create a proof doc\", \"comment on a document\", \"suggest edits\", \"review in proof\", or when given a proofeditor.ai URL.",
  ],
  "ce-release-notes": [
    "Summarize recent compound-engineering plugin releases, or answer a specific question about a past release with a version citation. Use when the user types `/ce-release-notes` or asks \"what changed in compound-engineering recently?\" or \"what happened to <skill-name>?\".",
    "Summarize recent compound-engineering plugin releases, or answer a specific question about a past release with a version citation. Use when the user types `/ce:release-notes` or asks \"what changed in compound-engineering recently?\" or \"what happened to <skill-name>?\".",
  ],
  "ce-review": [
    "Structured code review using tiered persona agents, confidence-gated findings, and a merge/dedup pipeline. Use when reviewing code changes before creating a PR.",
    "Perform exhaustive code reviews using multi-agent analysis, ultra-thinking, and worktrees",
    "[BETA] Structured code review using tiered persona agents, confidence-gated findings, and a merge/dedup pipeline. Use when reviewing code changes before creating a PR.",
    "[DEPRECATED] Use /ce:review instead — renamed for clarity.",
  ],
  "ce-slack-research": [
    "Search Slack for interpreted organizational context -- decisions, constraints, and discussion arcs that shape the current task. Produces a research digest with cross-cutting analysis and research-value assessment, not raw message lists. Use when searching Slack for context during planning, brainstorming, or any task where organizational knowledge matters. Trigger phrases: 'search slack for', 'what did we discuss about', 'slack context for', 'organizational context about', 'what does the team think about', 'any slack discussions on'. Differs from slack:find-discussions which returns individual message results without synthesis.",
  ],
  "ce-strategy": [
    "Create or maintain docs/strategy.md - the product's target problem, approach, users, key metrics, and tracks of work. Use when starting a new product, updating direction, or when prompts like 'write our strategy', 'update the roadmap', 'what are we working on', or 'set up the strategy doc' come up. Also triggers when ce-ideate, ce-brainstorm, or ce-plan need upstream grounding and no strategy doc exists yet.",
  ],
  "ce-test-xcode": [
    "Build and test iOS apps on simulator using XcodeBuildMCP",
  ],
  "ce-work-beta": [
    "[BETA] Execute work plans with external delegate support. Same as ce:work but includes experimental Codex delegation mode for token-conserving code implementation.",
    "Execute work plans efficiently while maintaining quality and finishing features",
  ],
  "ce:brainstorm": [
    "Explore requirements and approaches through collaborative dialogue before writing a right-sized requirements document and planning implementation. Use for feature ideas, problem framing, when the user says 'let's brainstorm', or when they want to think through options before deciding what to build. Also use when a user describes a vague or ambitious feature request, asks 'what should we build', 'help me think through X', presents a problem with multiple valid solutions, or seems unsure about scope or direction — even if they don't explicitly ask to brainstorm.",
    "Explore requirements and approaches through collaborative dialogue before planning implementation",
    "[DEPRECATED] Use /ce:brainstorm instead — renamed for clarity.",
  ],
  "ce:compound": [
    "Document a recently solved problem to compound your team's knowledge or CONCEPTS.md, the project's shared domain vocabulary.",
    "Document a recently solved problem to compound your team's knowledge",
    "[DEPRECATED] Use /ce:compound instead — renamed for clarity.",
  ],
  "ce:plan": [
    "Create structured plans for any multi-step task -- software features, research workflows, events, study plans, or any goal that benefits from structured breakdown. Also deepen existing plans with interactive review of sub-agent findings. Use for plan creation when the user says 'plan this', 'create a plan', 'write a tech plan', 'plan the implementation', 'how should we build', 'what's the approach for', 'break this down', 'plan a trip', 'create a study plan', or when a brainstorm/requirements document is ready for planning. Use for plan deepening when the user says 'deepen the plan', 'deepen my plan', 'deepening pass', or uses 'deepen' in reference to a plan. For exploratory or ambiguous requests where the user is unsure what to do, prefer ce-brainstorm first.",
    "Create structured plans for any multi-step task -- software features, research workflows, events, study plans, or any goal that benefits from structured breakdown. Also deepen existing plans with interactive review of sub-agent findings. Use for plan creation when the user says 'plan this', 'create a plan', 'write a tech plan', 'plan the implementation', 'how should we build', 'what's the approach for', 'break this down', 'plan a trip', 'create a study plan', or when a brainstorm/requirements document is ready for planning. Use for plan deepening when the user says 'deepen the plan', 'deepen my plan', 'deepening pass', or uses 'deepen' in reference to a plan.",
    "Create structured plans for any multi-step task -- software features, research workflows, events, study plans, or any goal that benefits from structured breakdown. Also deepen existing plans with interactive review of sub-agent findings. Use for plan creation when the user says 'plan this', 'create a plan', 'write a tech plan', 'plan the implementation', 'how should we build', 'what's the approach for', 'break this down', 'plan a trip', 'create a study plan', or when a brainstorm/requirements document is ready for planning. Use for plan deepening when the user says 'deepen the plan', 'deepen my plan', 'deepening pass', or uses 'deepen' in reference to a plan. For exploratory or ambiguous requests where the user is unsure what to do, prefer ce:brainstorm first.",
    "Transform feature descriptions or requirements into structured implementation plans grounded in repo patterns and research. Also deepen existing plans with interactive review of sub-agent findings. Use for plan creation when the user says 'plan this', 'create a plan', 'write a tech plan', 'plan the implementation', 'how should we build', 'what's the approach for', 'break this down', or when a brainstorm/requirements document is ready for technical planning. Use for plan deepening when the user says 'deepen the plan', 'deepen my plan', 'deepening pass', or uses 'deepen' in reference to a plan. Best when requirements are at least roughly defined; for exploratory or ambiguous requests, prefer ce:brainstorm first.",
    "Transform feature descriptions or requirements into structured implementation plans grounded in repo patterns and research. Use when the user says 'plan this', 'create a plan', 'write a tech plan', 'plan the implementation', 'how should we build', 'what's the approach for', 'break this down', or when a brainstorm/requirements document is ready for technical planning. Best when requirements are at least roughly defined; for exploratory or ambiguous requests, prefer ce:brainstorm first.",
    "Transform feature descriptions into well-structured project plans following conventions",
    "Transform feature descriptions or requirements into structured implementation plans grounded in repo patterns and research. Use when the user says \"plan this\", \"create a plan\", \"how should we build\", \"write a tech plan\", \"plan the implementation\", or when a brainstorm/requirements document is ready for implementation planning. Also triggers on \"what's the approach for\", \"break this down\", or references to an existing requirements doc that needs a technical plan.",
    "[DEPRECATED] Use /ce:plan instead — renamed for clarity.",
  ],
  "ce:plan-beta": [
    "[BETA] Transform feature descriptions or requirements into structured, decision-first implementation plans. Use when testing the new planning workflow. Produces plans focused on decisions, boundaries, and verification rather than pre-written implementation choreography.",
    "Transform feature descriptions into well-structured project plans following conventions",
    "Transform feature descriptions or requirements into structured implementation plans grounded in repo patterns and research. Use when the user says \"plan this\", \"create a plan\", \"how should we build\", \"write a tech plan\", \"plan the implementation\", or when a brainstorm/requirements document is ready for implementation planning. Also triggers on \"what's the approach for\", \"break this down\", or references to an existing requirements doc that needs a technical plan.",
  ],
  "ce:review": [
    "Structured code review using tiered persona agents, confidence-gated findings, and a merge/dedup pipeline. Use when reviewing code changes before creating a PR.",
    "Perform exhaustive code reviews using multi-agent analysis, ultra-thinking, and worktrees",
    "[BETA] Structured code review using tiered persona agents, confidence-gated findings, and a merge/dedup pipeline. Use when reviewing code changes before creating a PR.",
    "[DEPRECATED] Use /ce:review instead — renamed for clarity.",
  ],
  "ce:work": [
    "Execute work plans efficiently while maintaining quality and finishing features",
    "[DEPRECATED] Use /ce:work instead — renamed for clarity.",
  ],
  "ce:work-beta": [
    "[BETA] Execute work plans with external delegate support. Same as ce:work but includes experimental Codex delegation mode for token-conserving code implementation.",
    "Execute work plans efficiently while maintaining quality and finishing features",
  ],
  "document-review": [
    "This skill should be used to refine requirements or plan documents before proceeding to the next workflow step. It applies when a requirements document or plan document exists and the user wants to improve it.",
    "This skill should be used to refine brainstorm or plan documents before proceeding to the next workflow step. It applies when a brainstorm or plan document exists and the user wants to improve it.",
  ],
  "feature-video": [
    "Record a video walkthrough of a feature and add it to the PR description",
  ],
  "frontend-design": [
    "This skill should be used when creating distinctive, production-grade frontend interfaces with high design quality. It applies when the user asks to build web components, pages, or applications. Generates creative, polished code that avoids generic AI aesthetics.",
    "Create distinctive, production-grade frontend interfaces with high design quality. Use this skill when the user asks to build web components, pages, or applications. Generates creative, polished code that avoids generic AI aesthetics.",
  ],
  "git-commit-push-pr": [
    "Commit, push, and open a PR with an adaptive, value-first description. Use when the user says \"commit and PR\", \"push and open a PR\", \"ship this\", \"create a PR\", \"open a pull request\", \"commit push PR\", or wants to go from working changes to an open pull request in one step. Also use when the user says \"update the PR description\", \"refresh the PR description\", \"freshen the PR\", or wants to rewrite an existing PR description. Produces PR descriptions that scale in depth with the complexity of the change, avoiding cookie-cutter templates.",
    "Commit, push, and open a PR with an adaptive, value-first description. Use when the user says \"commit and PR\", \"push and open a PR\", \"ship this\", \"create a PR\", \"open a pull request\", \"commit push PR\", or wants to go from working changes to an open pull request in one step. Produces PR descriptions that scale in depth with the complexity of the change, avoiding cookie-cutter templates.",
    "Commit, push, and open a PR with an adaptive, value-first description. Use when the user says \"commit and PR\", \"push and open a PR\", \"ship this\", \"create a PR\", \"open a pull request\", \"commit push PR\", or wants to go from working changes to an open pull request in one step. Also use when the user says \"update the PR description\", \"refresh the PR description\", \"freshen the PR\", \"rewrite the PR body\", \"write a PR description\", \"draft a PR description\", or \"describe this PR\" — the skill will produce a description without committing or pushing if that is all the user wants. Produces PR descriptions that scale in depth with the complexity of the change, avoiding cookie-cutter templates.",
  ],
  "git-worktree": [
    "This skill manages Git worktrees for isolated parallel development. It handles creating, listing, switching, and cleaning up worktrees with a simple interactive interface, following KISS principles.",
  ],
  lfg: [
    "Full autonomous engineering workflow",
  ],
  "reproduce-bug": [
    "Reproduce and investigate a bug using logs, console inspection, and browser screenshots",
  ],
  setup: [
    "Configure project-level settings for compound-engineering workflows. Currently a placeholder — review agent selection is handled automatically by ce:review.",
    "Configure which review agents run for your project. Auto-detects stack and writes compound-engineering.local.md.",
  ],
  "workflows-brainstorm": [
    "Explore requirements and approaches through collaborative dialogue before writing a right-sized requirements document and planning implementation. Use for feature ideas, problem framing, when the user says 'let's brainstorm', or when they want to think through options before deciding what to build. Also use when a user describes a vague or ambitious feature request, asks 'what should we build', 'help me think through X', presents a problem with multiple valid solutions, or seems unsure about scope or direction — even if they don't explicitly ask to brainstorm.",
    "Explore requirements and approaches through collaborative dialogue before planning implementation",
    "[DEPRECATED] Use /ce:brainstorm instead — renamed for clarity.",
  ],
  "workflows-compound": [
    "Document a recently solved problem to compound your team's knowledge or CONCEPTS.md, the project's shared domain vocabulary.",
    "Document a recently solved problem to compound your team's knowledge",
    "[DEPRECATED] Use /ce:compound instead — renamed for clarity.",
  ],
  "workflows-plan": [
    "Create structured plans for any multi-step task -- software features, research workflows, events, study plans, or any goal that benefits from structured breakdown. Also deepen existing plans with interactive review of sub-agent findings. Use for plan creation when the user says 'plan this', 'create a plan', 'write a tech plan', 'plan the implementation', 'how should we build', 'what's the approach for', 'break this down', 'plan a trip', 'create a study plan', or when a brainstorm/requirements document is ready for planning. Use for plan deepening when the user says 'deepen the plan', 'deepen my plan', 'deepening pass', or uses 'deepen' in reference to a plan. For exploratory or ambiguous requests where the user is unsure what to do, prefer ce-brainstorm first.",
    "Create structured plans for any multi-step task -- software features, research workflows, events, study plans, or any goal that benefits from structured breakdown. Also deepen existing plans with interactive review of sub-agent findings. Use for plan creation when the user says 'plan this', 'create a plan', 'write a tech plan', 'plan the implementation', 'how should we build', 'what's the approach for', 'break this down', 'plan a trip', 'create a study plan', or when a brainstorm/requirements document is ready for planning. Use for plan deepening when the user says 'deepen the plan', 'deepen my plan', 'deepening pass', or uses 'deepen' in reference to a plan.",
    "Create structured plans for any multi-step task -- software features, research workflows, events, study plans, or any goal that benefits from structured breakdown. Also deepen existing plans with interactive review of sub-agent findings. Use for plan creation when the user says 'plan this', 'create a plan', 'write a tech plan', 'plan the implementation', 'how should we build', 'what's the approach for', 'break this down', 'plan a trip', 'create a study plan', or when a brainstorm/requirements document is ready for planning. Use for plan deepening when the user says 'deepen the plan', 'deepen my plan', 'deepening pass', or uses 'deepen' in reference to a plan. For exploratory or ambiguous requests where the user is unsure what to do, prefer ce:brainstorm first.",
    "Transform feature descriptions or requirements into structured implementation plans grounded in repo patterns and research. Also deepen existing plans with interactive review of sub-agent findings. Use for plan creation when the user says 'plan this', 'create a plan', 'write a tech plan', 'plan the implementation', 'how should we build', 'what's the approach for', 'break this down', or when a brainstorm/requirements document is ready for technical planning. Use for plan deepening when the user says 'deepen the plan', 'deepen my plan', 'deepening pass', or uses 'deepen' in reference to a plan. Best when requirements are at least roughly defined; for exploratory or ambiguous requests, prefer ce:brainstorm first.",
    "Transform feature descriptions or requirements into structured implementation plans grounded in repo patterns and research. Use when the user says 'plan this', 'create a plan', 'write a tech plan', 'plan the implementation', 'how should we build', 'what's the approach for', 'break this down', or when a brainstorm/requirements document is ready for technical planning. Best when requirements are at least roughly defined; for exploratory or ambiguous requests, prefer ce:brainstorm first.",
    "Transform feature descriptions into well-structured project plans following conventions",
    "Transform feature descriptions or requirements into structured implementation plans grounded in repo patterns and research. Use when the user says \"plan this\", \"create a plan\", \"how should we build\", \"write a tech plan\", \"plan the implementation\", or when a brainstorm/requirements document is ready for implementation planning. Also triggers on \"what's the approach for\", \"break this down\", or references to an existing requirements doc that needs a technical plan.",
    "[DEPRECATED] Use /ce:plan instead — renamed for clarity.",
  ],
  "workflows-review": [
    "Structured code review using tiered persona agents, confidence-gated findings, and a merge/dedup pipeline. Use when reviewing code changes before creating a PR.",
    "Perform exhaustive code reviews using multi-agent analysis, ultra-thinking, and worktrees",
    "[BETA] Structured code review using tiered persona agents, confidence-gated findings, and a merge/dedup pipeline. Use when reviewing code changes before creating a PR.",
    "[DEPRECATED] Use /ce:review instead — renamed for clarity.",
  ],
  "workflows-work": [
    "Execute work plans efficiently while maintaining quality and finishing features",
    "[DEPRECATED] Use /ce:work instead — renamed for clarity.",
  ],
  "workflows:brainstorm": [
    "Explore requirements and approaches through collaborative dialogue before writing a right-sized requirements document and planning implementation. Use for feature ideas, problem framing, when the user says 'let's brainstorm', or when they want to think through options before deciding what to build. Also use when a user describes a vague or ambitious feature request, asks 'what should we build', 'help me think through X', presents a problem with multiple valid solutions, or seems unsure about scope or direction — even if they don't explicitly ask to brainstorm.",
    "Explore requirements and approaches through collaborative dialogue before planning implementation",
    "[DEPRECATED] Use /ce:brainstorm instead — renamed for clarity.",
  ],
  "workflows:compound": [
    "Document a recently solved problem to compound your team's knowledge or CONCEPTS.md, the project's shared domain vocabulary.",
    "Document a recently solved problem to compound your team's knowledge",
    "[DEPRECATED] Use /ce:compound instead — renamed for clarity.",
  ],
  "workflows:plan": [
    "Create structured plans for any multi-step task -- software features, research workflows, events, study plans, or any goal that benefits from structured breakdown. Also deepen existing plans with interactive review of sub-agent findings. Use for plan creation when the user says 'plan this', 'create a plan', 'write a tech plan', 'plan the implementation', 'how should we build', 'what's the approach for', 'break this down', 'plan a trip', 'create a study plan', or when a brainstorm/requirements document is ready for planning. Use for plan deepening when the user says 'deepen the plan', 'deepen my plan', 'deepening pass', or uses 'deepen' in reference to a plan. For exploratory or ambiguous requests where the user is unsure what to do, prefer ce-brainstorm first.",
    "Create structured plans for any multi-step task -- software features, research workflows, events, study plans, or any goal that benefits from structured breakdown. Also deepen existing plans with interactive review of sub-agent findings. Use for plan creation when the user says 'plan this', 'create a plan', 'write a tech plan', 'plan the implementation', 'how should we build', 'what's the approach for', 'break this down', 'plan a trip', 'create a study plan', or when a brainstorm/requirements document is ready for planning. Use for plan deepening when the user says 'deepen the plan', 'deepen my plan', 'deepening pass', or uses 'deepen' in reference to a plan.",
    "Create structured plans for any multi-step task -- software features, research workflows, events, study plans, or any goal that benefits from structured breakdown. Also deepen existing plans with interactive review of sub-agent findings. Use for plan creation when the user says 'plan this', 'create a plan', 'write a tech plan', 'plan the implementation', 'how should we build', 'what's the approach for', 'break this down', 'plan a trip', 'create a study plan', or when a brainstorm/requirements document is ready for planning. Use for plan deepening when the user says 'deepen the plan', 'deepen my plan', 'deepening pass', or uses 'deepen' in reference to a plan. For exploratory or ambiguous requests where the user is unsure what to do, prefer ce:brainstorm first.",
    "Transform feature descriptions or requirements into structured implementation plans grounded in repo patterns and research. Also deepen existing plans with interactive review of sub-agent findings. Use for plan creation when the user says 'plan this', 'create a plan', 'write a tech plan', 'plan the implementation', 'how should we build', 'what's the approach for', 'break this down', or when a brainstorm/requirements document is ready for technical planning. Use for plan deepening when the user says 'deepen the plan', 'deepen my plan', 'deepening pass', or uses 'deepen' in reference to a plan. Best when requirements are at least roughly defined; for exploratory or ambiguous requests, prefer ce:brainstorm first.",
    "Transform feature descriptions or requirements into structured implementation plans grounded in repo patterns and research. Use when the user says 'plan this', 'create a plan', 'write a tech plan', 'plan the implementation', 'how should we build', 'what's the approach for', 'break this down', or when a brainstorm/requirements document is ready for technical planning. Best when requirements are at least roughly defined; for exploratory or ambiguous requests, prefer ce:brainstorm first.",
    "Transform feature descriptions into well-structured project plans following conventions",
    "Transform feature descriptions or requirements into structured implementation plans grounded in repo patterns and research. Use when the user says \"plan this\", \"create a plan\", \"how should we build\", \"write a tech plan\", \"plan the implementation\", or when a brainstorm/requirements document is ready for implementation planning. Also triggers on \"what's the approach for\", \"break this down\", or references to an existing requirements doc that needs a technical plan.",
    "[DEPRECATED] Use /ce:plan instead — renamed for clarity.",
  ],
  "workflows:review": [
    "Structured code review using tiered persona agents, confidence-gated findings, and a merge/dedup pipeline. Use when reviewing code changes before creating a PR.",
    "Perform exhaustive code reviews using multi-agent analysis, ultra-thinking, and worktrees",
    "[BETA] Structured code review using tiered persona agents, confidence-gated findings, and a merge/dedup pipeline. Use when reviewing code changes before creating a PR.",
    "[DEPRECATED] Use /ce:review instead — renamed for clarity.",
  ],
  "workflows:work": [
    "Execute work plans efficiently while maintaining quality and finishing features",
    "[DEPRECATED] Use /ce:work instead — renamed for clarity.",
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
  "ce-compound-refresh.md": "ce-compound",
  "ce-ideate.md": "ce-ideate",
  "ce-plan.md": "ce-plan",
  "ce-review.md": "ce-code-review",
  "ce-work.md": "ce-work",
  // ce-work-beta was merged into ce-work. Point at the successor so the current
  // ce-work description is also accepted as an ownership signal alongside the
  // historical beta descriptions already in LEGACY_PROMPT_DESCRIPTION_ALIASES.
  "ce-work-beta.md": "ce-work",
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
  "compound-refresh":
    "Refresh stale or drifting learnings and pattern docs in docs/solutions/ by reviewing, updating, consolidating, replacing, or deleting them against the current codebase. Use after refactors, migrations, dependency upgrades, or when a retrieved learning feels outdated or wrong. Also use when reviewing docs/solutions/ for accuracy, when a recently solved problem contradicts an existing learning, when pattern docs no longer reflect current code, or when multiple docs seem to cover the same topic and might benefit from consolidation.",
  "ce-deploy-docs":
    "Validate and prepare documentation for GitHub Pages deployment",
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
  "ce-slack-research":
    "Search Slack for interpreted organizational context -- decisions, constraints, and discussion arcs -- and produce a synthesized research digest with cross-cutting analysis. Use when the user says 'search slack for', 'what did we discuss about', 'slack context for', or 'what does the team think about'. Differs from slack:find-discussions, which returns raw message results without synthesis.",
  "ce-dhh-rails-style":
    "This skill should be used when writing Ruby and Rails code in DHH's distinctive 37signals style. It applies when writing Ruby code, Rails applications, creating models, controllers, or any Ruby file. Triggers on Ruby/Rails code generation, refactoring requests, code review, or when the user mentions DHH, 37signals, Basecamp, HEY, or Campfire style. Embodies REST purity, fat models, thin controllers, Current attributes, Hotwire patterns, and the \"clarity over cleverness\" philosophy.",
  "ce-test-xcode":
    "Build and test iOS apps on simulator using XcodeBuildMCP. Use after making iOS code changes, before creating a PR, or when verifying app behavior and checking for crashes on simulator.",
  "ce-riffrec-feedback-analysis":
    "Riffrec product-feedback workflow. ALWAYS load when the user posts a `riffrec-*.zip`, a bundle with `session.json` + `events.json` + `recording.webm` + `voice.webm`, a video/audio recording for product feedback, or asks how to capture and share Riffrec sessions. Routes between setup, quick bug report, and extensive analysis.",
  "ce-product-pulse":
    "Generate a time-windowed pulse report on what users experienced and how the product performed - usage, quality, errors, signals worth investigating. Use when the user says 'run a pulse', 'show me the pulse', 'how are we doing', 'weekly recap', 'launch-day check', or passes a time window like '24h' or '7d'. Configures via .compound-engineering/config.local.yaml and saves reports to docs/pulse-reports/.",
  "ce-proof":
    "Run human-in-the-loop review loops over markdown via Proof (proofeditor.ai) — share, view, comment on, edit, and sync collaborative docs. Use when the user says \"view this in proof\", \"share to proof\", \"HITL this doc\", or wants a shared markdown review surface for a spec, plan, or draft, including handoffs from ce-brainstorm, ce-ideate, or ce-plan. Do not trigger on \"proof\" meaning evidence, math proofs, proof-of-concept, or \"proofread this\".",
  "ce-promote":
    "Draft user-facing announcement and marketing copy for a feature that just shipped — an X post or thread, a changelog blurb, a LinkedIn post, an email, a blog intro, or a short demo script. Spiral-agnostic by default; voice-matched via the Spiral CLI when it is installed and authed. Use when the user says 'promote this', 'draft the announcement', 'write the launch copy', 'market this feature', 'announce this feature', 'write the release tweet', or 'ce-promote'.",
  "ce-gemini-imagegen":
    "This skill should be used when generating and editing images using the Gemini API (Nano Banana Pro). It applies when creating images from text prompts, editing existing images, applying style transfers, generating logos with text, creating stickers, product mockups, or any image generation/manipulation task. Supports text-to-image, image editing, multi-turn refinement, and composition from multiple reference images.",
  // ce-work-beta was merged into ce-work (delegation mode promoted to stable).
  // Provide descriptions for both the ce: and ce- naming eras so cleanup
  // can fingerprint installs from either era after the skill dir is gone.
  "ce:work-beta":
    "[BETA] Execute work with external delegate support. Same as ce:work but includes experimental Codex delegation mode for token-conserving code implementation.",
  "ce-work-beta":
    "[BETA] Execute work with external delegate support. Same as ce-work but includes experimental Codex delegation mode for token-conserving code implementation.",

  // ce-commit was merged into ce-commit-push-pr (commit-only mode). Provide
  // the historical description for both the merged skill and the legacy
  // git-commit dir so cleanup can fingerprint installs from either era.
  "ce-commit":
    "Create a git commit with a clear, value-communicating message. Use when the user says \"commit\", \"commit this\", \"save my changes\", \"create a commit\", or wants to commit staged or unstaged work. Produces well-structured commit messages that follow repo conventions when they exist, and defaults to conventional commit format otherwise.",
  "git-commit":
    "Create a git commit with a clear, value-communicating message. Use when the user says \"commit\", \"commit this\", \"save my changes\", \"create a commit\", or wants to commit staged or unstaged work. Produces well-structured commit messages that follow repo conventions when they exist, and defaults to conventional commit format otherwise.",

  // lfg was the autonomous end-to-end pipeline orchestrator (removed, no replacement).
  "lfg":
    "Run the full autonomous engineering pipeline end-to-end (plan, work, code review, test, commit, push, open PR, watch CI, fix CI failures until green). Use only when the user explicitly requests hands-off execution of a software task and provides a feature description; do not auto-route casual conversation here.",

  // ce-clean-gone-branches was the branch-hygiene skill (removed, no replacement).
  // Provide the historical description for both the removed skill and the legacy
  // git-clean-gone-branches dir so cleanup can fingerprint installs from either
  // era after the skill dir is gone.
  "ce-clean-gone-branches":
    "Clean up local branches whose remote tracking branch is gone. Use when the user says \"clean up branches\", \"delete gone branches\", \"prune local branches\", \"clean gone\", or wants to remove stale local branches that no longer exist on the remote. Also handles removing associated worktrees for branches that have them.",
  "git-clean-gone-branches":
    "Clean up local branches whose remote tracking branch is gone. Use when the user says \"clean up branches\", \"delete gone branches\", \"prune local branches\", \"clean gone\", or wants to remove stale local branches that no longer exist on the remote. Also handles removing associated worktrees for branches that have them.",

  // ce-report-bug was the plugin bug-filing skill (removed, no replacement).
  // currentSkillNameForLegacy normalizes the legacy "report-bug-ce" dir to
  // "ce-report-bug", so this single entry fingerprints installs from both eras
  // once the skill dir is gone.
  "ce-report-bug":
    "Report a bug in the compound-engineering plugin",

  // ce-strategy was the upstream-anchor strategy skill (removed, no replacement).
  "ce-strategy":
    "Create or maintain STRATEGY.md - the product's target problem, approach, users, key metrics, and tracks of work. Use when starting a new product, updating direction, or when prompts like 'write our strategy', 'update the roadmap', 'what are we working on', or 'set up the strategy doc' come up. Also triggers when ce-ideate, ce-brainstorm, or ce-plan need upstream grounding and no strategy doc exists yet.",

  // ce-dogfood-beta was the diff-scoped browser QA dogfood skill (removed, no replacement).
  "ce-dogfood-beta":
    "[BETA] Dogfood the active branch end-to-end as a QA engineer. Diffs the branch against main, builds an exhaustive browser test matrix of every change (full user journeys, not just features), drives the app with agent-browser, then auto-fixes issues, adds regression tests, and commits each fix until the matrix is green. Use when you want a hands-off 'test everything we just built and make it actually work' pass before shipping.",

  // ce-test-browser was the end-to-end browser testing skill (removed, no replacement).
  "ce-test-browser":
    "Run browser tests on pages affected by current PR or branch",

  // ce-demo-reel was the visual evidence capture skill (removed, no replacement).
  "ce-demo-reel":
    "Capture a visual demo reel (GIF, terminal recording, screenshots) for PR descriptions. Use when shipping UI changes, CLI features, or any work with observable behavior that benefits from visual proof. Also use when asked to add a demo, record a GIF, screenshot a feature, show what changed visually, create a demo reel, capture evidence, add proof to a PR, or create a before/after comparison.",

  // ce-release-notes was the plugin release-history skill (removed, no replacement).
  // Provide descriptions for both the ce: and ce- naming eras so cleanup can
  // fingerprint installs from either era after the skill dir is gone.
  "ce-release-notes":
    "Summarize recent compound-engineering plugin releases, or answer a specific question about a past release with a version citation. Use when the user types `/ce-release-notes` or asks \"what changed in compound-engineering recently?\" or \"what happened to `<skill-name>`?\".",
  "ce:release-notes":
    "Summarize recent compound-engineering plugin releases, or answer a specific question about a past release with a version citation. Use when the user types `/ce-release-notes` or asks \"what changed in compound-engineering recently?\" or \"what happened to `<skill-name>`?\".",

  // ce-resolve-pr-feedback was the parallel PR-feedback resolution skill
  // (removed, no replacement). Provide the description for both the renamed-era
  // "resolve-pr-feedback" name and the current-era "ce-resolve-pr-feedback" name
  // so cleanup can fingerprint installs from either era after the skill dir is
  // gone (its live description previously seeded the "resolve-pr-feedback"
  // fingerprint).
  "resolve-pr-feedback":
    "Resolve PR review feedback by evaluating validity and fixing issues in parallel. Use when addressing PR review comments, resolving review threads, or fixing code review feedback.",
  "ce-resolve-pr-feedback":
    "Resolve PR review feedback by evaluating validity and fixing issues in parallel. Use when addressing PR review comments, resolving review threads, or fixing code review feedback.",

  // ce-ideate was the big-picture ideation skill (removed, no replacement).
  "ce-ideate":
    "Generate and critically evaluate grounded ideas about a topic. Use when asking what to improve, requesting idea generation, exploring surprising directions, or wanting the AI to proactively suggest strong options before brainstorming one in depth. Triggers on phrases like 'what should I improve', 'give me ideas', 'ideate on X', 'surprise me', 'what would you change', or any request for AI-generated suggestions rather than refining the user's own idea.",

  // ce-polish was the conversational UX polish skill (removed, no replacement).
  "ce-polish":
    "Start the dev server, open the feature in a browser, and iterate on improvements together. Manual invocation only — type /ce-polish to run it.",

  // ce-agent-native-architecture and ce-agent-native-audit were the agent-native
  // skill pair (removed, no replacement, slim/ultra-minimal). The unprefixed
  // variants are fingerprinted via STALE_SKILL_DIRS; these ce- entries carry the
  // last shipped descriptions so cleanup can fingerprint current-era installs
  // after the skill dirs are gone.
  "ce-agent-native-architecture":
    "Build applications where agents are first-class citizens. Use this skill when designing autonomous agents, creating MCP tools, implementing self-modifying systems, or building apps where features are outcomes achieved by agents operating in a loop.",
  "ce-agent-native-audit":
    "Run comprehensive agent-native architecture review with scored principles",

  // ce-optimize was the metric-driven iterative optimization skill (removed, no
  // replacement, slim/ultra-minimal). Only ever shipped under the ce- prefix.
  "ce-optimize":
    "Run metric-driven iterative optimization loops -- define a measurable goal, run parallel experiments, measure each against hard gates or LLM-as-judge scores, keep improvements, and converge on the best solution. Use when optimizing clustering quality, search relevance, build performance, prompt quality, or any measurable outcome that benefits from systematic experimentation.",
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
  "ce-ankane-readme-writer":
    "Creates or updates README files following Ankane-style template for Ruby gems. Use when writing gem documentation with imperative voice, concise prose, and standard section ordering.",
  "ce-design-implementation-reviewer":
    "Visually compares live UI implementation against Figma designs and provides detailed feedback on discrepancies. Use after writing or modifying HTML/CSS/React components to verify design fidelity.",
  "ce-design-iterator":
    "Iteratively refines UI design through N screenshot-analyze-improve cycles. Use PROACTIVELY when design changes aren't coming together after 1-2 attempts, or when user requests iterative refinement.",
  "slack-researcher":
    "Searches Slack for organizational context -- decisions, constraints, and discussions that may not be documented elsewhere. Use when the user explicitly asks to search Slack for context during ideation, planning, or brainstorming.",
  "ce-slack-researcher":
    "Searches Slack for organizational context -- decisions, constraints, and discussions that may not be documented elsewhere. Use when the user explicitly asks to search Slack for context during ideation, planning, or brainstorming.",
  // ce-pr-comment-resolver was the worker agent spawned by ce-resolve-pr-feedback
  // (removed, no replacement). Provide the description for both the renamed-era
  // "pr-comment-resolver" name and the current-era "ce-pr-comment-resolver" name
  // so cleanup can fingerprint installs from either era after the agent file is
  // gone (its live description previously seeded the "pr-comment-resolver"
  // fingerprint).
  "pr-comment-resolver":
    "Evaluates and resolves one or more related PR review threads -- assesses validity, implements fixes, and returns structured summaries with reply text. Spawned by the resolve-pr-feedback skill.",
  "ce-pr-comment-resolver":
    "Evaluates and resolves one or more related PR review threads -- assesses validity, implements fixes, and returns structured summaries with reply text. Spawned by the resolve-pr-feedback skill.",

  // ce-issue-intelligence-analyst was the issue-analysis agent exclusive to
  // ce-ideate (removed, no replacement).
  "ce-issue-intelligence-analyst":
    "Fetches and analyzes GitHub issues to surface recurring themes, pain patterns, and severity trends. Use when understanding a project's issue landscape, analyzing bug patterns for ideation, or summarizing what users are reporting.",

  // ce-agent-native-reviewer was the always-on agent-native parity reviewer
  // (removed, no replacement, slim/ultra-minimal). The unprefixed
  // "agent-native-reviewer" name is fingerprinted via STALE_AGENT_NAMES; this
  // ce- entry carries the last shipped description so cleanup can fingerprint
  // current-era installs after the agent file is gone.
  "ce-agent-native-reviewer":
    "Reviews code to ensure agent-native parity -- any action a user can take, an agent can also take. Use after adding UI features, agent tools, or system prompts.",

  // Review personas consolidated into ce-correctness-reviewer and
  // ce-testing-reviewer, plus niche conditional personas pruned with no
  // replacement (slim/ultra-minimal). The unprefixed names are fingerprinted
  // via STALE_AGENT_NAMES; both the unprefixed and ce- entries carry the last
  // shipped descriptions so cleanup can fingerprint installs from either era
  // after the agent files are gone.
  "reliability-reviewer":
    "Conditional code-review persona, selected when the diff touches error handling, retries, circuit breakers, timeouts, health checks, background jobs, or async handlers. Reviews code for production reliability and failure modes.",
  "ce-reliability-reviewer":
    "Conditional code-review persona, selected when the diff touches error handling, retries, circuit breakers, timeouts, health checks, background jobs, or async handlers. Reviews code for production reliability and failure modes.",
  "maintainability-reviewer":
    "Always-on code-review persona. Reviews code for structural quality, complexity deletion, coupling, naming, dead code, type-boundary leaks, and abstraction debt.",
  "ce-maintainability-reviewer":
    "Always-on code-review persona. Reviews code for structural quality, complexity deletion, coupling, naming, dead code, type-boundary leaks, and abstraction debt.",
  "code-simplicity-reviewer":
    "Final review pass to ensure code is as simple and minimal as possible. Use after implementation is complete to identify YAGNI violations and simplification opportunities.",
  "ce-code-simplicity-reviewer":
    "Final review pass to ensure code is as simple and minimal as possible. Use after implementation is complete to identify YAGNI violations and simplification opportunities.",
  "api-contract-reviewer":
    "Conditional code-review persona, selected when the diff touches API routes, request/response types, serialization, versioning, or exported type signatures. Reviews code for breaking contract changes.",
  "ce-api-contract-reviewer":
    "Conditional code-review persona, selected when the diff touches API routes, request/response types, serialization, versioning, or exported type signatures. Reviews code for breaking contract changes.",
  "project-standards-reviewer":
    "Always-on code-review persona. Audits changes against the project's own CLAUDE.md and AGENTS.md standards -- frontmatter rules, reference inclusion, naming conventions, cross-platform portability, and tool selection policies.",
  "ce-project-standards-reviewer":
    "Always-on code-review persona. Audits changes against the project's own CLAUDE.md and AGENTS.md standards -- frontmatter rules, reference inclusion, naming conventions, cross-platform portability, and tool selection policies.",
  "julik-frontend-races-reviewer":
    "Conditional code-review persona, selected when the diff touches async UI code, Stimulus/Turbo lifecycles, or DOM-timing-sensitive frontend behavior. Reviews code for race conditions and janky UI failure modes.",
  "ce-julik-frontend-races-reviewer":
    "Conditional code-review persona, selected when the diff touches async UI code, Stimulus/Turbo lifecycles, or DOM-timing-sensitive frontend behavior. Reviews code for race conditions and janky UI failure modes.",
  "data-migration-reviewer":
    "Conditional code-review persona for migration files, schema dumps, backfills, and data transformations. Covers schema drift, mapping correctness, deploy-window safety, and verification plans.",
  "ce-data-migration-reviewer":
    "Conditional code-review persona for migration files, schema dumps, backfills, and data transformations. Covers schema drift, mapping correctness, deploy-window safety, and verification plans.",
  "deployment-verification-agent":
    "Produces Go/No-Go deployment checklists with SQL verification queries, rollback procedures, and monitoring plans. Use when PRs touch production data, migrations, or risky data changes.",
  "ce-deployment-verification-agent":
    "Produces Go/No-Go deployment checklists with SQL verification queries, rollback procedures, and monitoring plans. Use when PRs touch production data, migrations, or risky data changes.",

  // Document-review personas consolidated: ce-design-lens-reviewer and
  // ce-security-lens-reviewer folded into ce-feasibility-reviewer;
  // ce-product-lens-reviewer and ce-scope-guardian-reviewer folded into
  // ce-adversarial-document-reviewer (slim/ultra-minimal). The unprefixed
  // names are fingerprinted via STALE_AGENT_NAMES; both the unprefixed and ce-
  // entries carry the last shipped descriptions so cleanup can fingerprint
  // installs from either era after the agent files are gone.
  "design-lens-reviewer":
    "Reviews planning documents for missing design decisions -- information architecture, interaction states, user flows, and AI slop risk. Uses dimensional rating to identify gaps. Spawned by the document-review skill.",
  "ce-design-lens-reviewer":
    "Reviews planning documents for missing design decisions -- information architecture, interaction states, user flows, and AI slop risk. Uses dimensional rating to identify gaps. Spawned by the document-review skill.",
  "security-lens-reviewer":
    "Evaluates planning documents for security gaps at the plan level -- auth/authz assumptions, data exposure risks, API surface vulnerabilities, and missing threat model elements. Spawned by the document-review skill.",
  "ce-security-lens-reviewer":
    "Evaluates planning documents for security gaps at the plan level -- auth/authz assumptions, data exposure risks, API surface vulnerabilities, and missing threat model elements. Spawned by the document-review skill.",
  "product-lens-reviewer":
    "Reviews planning documents as a senior product leader -- challenges premise claims, assesses strategic consequences (trajectory, identity, adoption, opportunity cost), and surfaces goal-work misalignment. Spawned by the document-review skill.",
  "ce-product-lens-reviewer":
    "Reviews planning documents as a senior product leader -- challenges premise claims, assesses strategic consequences (trajectory, identity, adoption, opportunity cost), and surfaces goal-work misalignment. Spawned by the document-review skill.",
  "scope-guardian-reviewer":
    "Reviews planning documents for scope alignment and unjustified complexity -- challenges unnecessary abstractions, premature frameworks, and scope that exceeds stated goals. Spawned by the document-review skill.",
  "ce-scope-guardian-reviewer":
    "Reviews planning documents for scope alignment and unjustified complexity -- challenges unnecessary abstractions, premature frameworks, and scope that exceeds stated goals. Spawned by the document-review skill.",

  // Planning research personas consolidated: ce-git-history-analyzer and
  // ce-pattern-recognition-specialist folded into ce-repo-research-analyst
  // (as the `history` and `patterns` scopes); ce-spec-flow-analyzer folded
  // into ce-architecture-strategist (as flow-analysis mode) (slim/ultra-minimal).
  // The unprefixed names were already in STALE_AGENT_NAMES and resolved their
  // fingerprint by reading the live ce-* agent file; with those files removed,
  // both the unprefixed and ce- entries carry the last shipped descriptions so
  // cleanup can fingerprint installs from either era.
  "git-history-analyzer":
    "Performs archaeological analysis of git history to trace code evolution, identify contributors, and understand why code patterns exist. Use when you need historical context for code changes.",
  "ce-git-history-analyzer":
    "Performs archaeological analysis of git history to trace code evolution, identify contributors, and understand why code patterns exist. Use when you need historical context for code changes.",
  "pattern-recognition-specialist":
    "Analyzes code for design patterns, anti-patterns, naming conventions, and duplication. Use when checking codebase consistency or verifying new code follows established patterns.",
  "ce-pattern-recognition-specialist":
    "Analyzes code for design patterns, anti-patterns, naming conventions, and duplication. Use when checking codebase consistency or verifying new code follows established patterns.",
  "spec-flow-analyzer":
    "Analyzes specifications and feature descriptions for user flow completeness and gap identification. Use when a spec, plan, or feature description needs flow analysis, edge case discovery, or requirements validation.",
  "ce-spec-flow-analyzer":
    "Analyzes specifications and feature descriptions for user flow completeness and gap identification. Use when a spec, plan, or feature description needs flow analysis, edge case discovery, or requirements validation.",

  // Deep-risk specialists consolidated into ce-plan-specialist-reviewer
  // (performance, security, and data-integrity scopes), and ce-figma-design-sync
  // pruned with no replacement (slim/ultra-minimal). The unprefixed names are
  // fingerprinted via STALE_AGENT_NAMES; both the unprefixed and ce- entries
  // carry the last shipped descriptions so cleanup can fingerprint installs from
  // either era after the agent files are gone.
  "performance-oracle":
    "Analyzes code for performance bottlenecks, algorithmic complexity, database queries, memory usage, and scalability. Use after implementing features or when performance concerns arise.",
  "ce-performance-oracle":
    "Analyzes code for performance bottlenecks, algorithmic complexity, database queries, memory usage, and scalability. Use after implementing features or when performance concerns arise.",
  "security-sentinel":
    "Performs security audits for vulnerabilities, input validation, auth/authz, hardcoded secrets, and OWASP compliance. Use when reviewing code for security issues or before deployment.",
  "ce-security-sentinel":
    "Performs security audits for vulnerabilities, input validation, auth/authz, hardcoded secrets, and OWASP compliance. Use when reviewing code for security issues or before deployment.",
  "data-integrity-guardian":
    "Reviews database migrations, data models, and persistent data code for safety. Use when checking migration safety, data constraints, transaction boundaries, or privacy compliance.",
  "ce-data-integrity-guardian":
    "Reviews database migrations, data models, and persistent data code for safety. Use when checking migration safety, data constraints, transaction boundaries, or privacy compliance.",
  "figma-design-sync":
    "Detects and fixes visual differences between a web implementation and its Figma design. Use iteratively when syncing implementation to match Figma specs.",
  "ce-figma-design-sync":
    "Detects and fixes visual differences between a web implementation and its Figma design. Use iteratively when syncing implementation to match Figma specs.",
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
    default:
      return legacyName.startsWith("ce-") ? legacyName : `ce-${legacyName}`
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
        const currentPath = agentIndex.get(currentAgentNameForLegacy(legacyName))
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
 * Ownership verdict for an individual legacy Codex artifact at a shared path
 * (a prompt file under `~/.codex/prompts/<file>.md`, or a flat skill directory
 * under `~/.codex/skills/<name>/`). Used by callers in the Codex install and
 * standalone-cleanup paths to gate legacy-name allow-list moves before
 * renaming an artifact into `compound-engineering/legacy-backup/`.
 *
 * Verdicts:
 *   - `"ce-owned"`: the artifact's fingerprint (prompt body + frontmatter, or
 *     skill SKILL.md description) matches a known compound-engineering shape.
 *     Safe to move.
 *   - `"foreign"`: we have a fingerprint on record for this name and the
 *     artifact does NOT match it. A user or sibling plugin authored it — leave
 *     it alone. `~/.codex/prompts/` and `~/.codex/skills/` are cross-plugin
 *     directories, so a name-only match (e.g. `ce-plan.md`, `ce-demo-reel/`)
 *     is not a strong enough signal.
 *   - `"unknown"`: we have no fingerprint on record for this name. This applies
 *     to historical artifacts whose corresponding CE skill/prompt no longer
 *     ships and has no description on record (e.g. `report-bug.md`) — user
 *     collisions at those names are unlikely, and the historical allow-list
 *     was written specifically to clean them up. Callers may fall back to
 *     name-only cleanup in this case so genuinely-owned orphans still sweep.
 *
 * Rationale for the three-way split: the fingerprint maps only cover names
 * whose corresponding ce-* artifact is still shipped or has a hardcoded
 * historical description. For names that are fully retired with no description
 * on record, a strict ownership gate would strand genuinely-owned orphans.
 * Reporting `"unknown"` lets callers keep the historical allow-list behavior
 * for those while still gating the realistic collision vectors.
 */
export type CodexLegacyOwnership = "ce-owned" | "foreign" | "unknown"

export async function classifyCodexLegacyPromptOwnership(
  promptPath: string,
): Promise<CodexLegacyOwnership> {
  const fileName = path.basename(promptPath)
  const { prompts } = await loadLegacyFingerprints()
  const hasFingerprint = prompts.has(fileName) || fileName in LEGACY_PROMPT_DESCRIPTION_ALIASES
  if (!hasFingerprint) return "unknown"
  const ceOwned = await isLegacyPromptWrapper(promptPath, prompts.get(fileName))
  return ceOwned ? "ce-owned" : "foreign"
}

/**
 * Ownership verdict for a flat legacy skill directory at a shared path like
 * `~/.codex/skills/<name>/`. Mirrors `classifyCodexLegacyPromptOwnership`:
 * `~/.codex/skills/` is a cross-plugin directory, so a name match against the
 * legacy allow-list is not a strong enough signal to relocate a user-authored
 * skill that happens to share a removed CE skill's name (e.g. `ce-demo-reel`).
 *
 * The fingerprint is the description of the current (renamed) skill, or — for
 * skills with no live ce-* successor — the hardcoded historical description in
 * `LEGACY_ONLY_SKILL_DESCRIPTIONS`. Both flow through `loadLegacyFingerprints`.
 * `isLegacyPluginOwned` with a null extension reads `<dir>/SKILL.md`, applies
 * `LEGACY_SKILL_DESCRIPTION_ALIASES`, and compares descriptions — we reuse it
 * rather than re-implement that logic.
 */
export async function classifyCodexLegacySkillDirOwnership(
  skillDirPath: string,
): Promise<CodexLegacyOwnership> {
  const name = path.basename(skillDirPath)
  const fingerprint = (await loadLegacyFingerprints()).skills.get(name)
  if (!fingerprint) return "unknown"
  return (await isLegacyPluginOwned(skillDirPath, fingerprint, null)) ? "ce-owned" : "foreign"
}
