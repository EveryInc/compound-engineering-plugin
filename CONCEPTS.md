# Concepts

Shared domain vocabulary for this project — entities, named processes, and status concepts with project-specific meaning. Seeded with core domain vocabulary, then accretes as ce-compound and ce-compound-refresh process learnings; direct edits are fine. Glossary only, not a spec or catch-all.

## The plugin and its parts

### Plugin
A distributable bundle of Skills, Agents, Commands, and Hooks (optionally MCP servers) described by a single manifest and installed into a coding-agent platform as one unit — the artifact the Converter translates for non-Claude Targets and the Marketplace distributes.

### Skill
A user-invoked capability defined in its own directory, and the primary entry point a user reaches for. A Skill orchestrates: it can progressively pull in its own reference files as needed and dispatch generic subagents seeded with Specialist prompt assets. Distinct from an Agent in that a Skill is user-invoked and coordinates, whereas an Agent or subagent is dispatched to perform scoped work.

### Agent
A specialized, single-purpose worker running in its own isolated context and returning a result, rather than conversing with the user. Also called a subagent. In the current plugin design, most CE specialist behavior is not exposed as standalone Agent definitions; Skills seed generic subagents with Skill-local prompt material instead.

### Specialist prompt asset
An internal prompt file owned by one Skill that defines a specialist persona or research/review role for a generic subagent. It is not an externally exposed plugin component: the owning Skill controls when it is loaded, which model or tool policy applies, and how its output is merged.

## Conversion

### Target
A destination coding-agent platform other than Claude Code (OpenCode, Codex, Pi, Antigravity, Kimi Code, and others) that the repo supports through native plugin metadata or a Converter/Writer pair. Also called a target provider when it uses the conversion path.

A Plugin is installed to a Target at one of two scopes: global (user-wide) or per-workspace.

### Native plugin surface
A platform-provided install contract that can consume this repo's committed plugin manifest or marketplace metadata directly, without generating a converted Bundle. When a Target has a native plugin surface, user-facing support usually belongs in platform metadata, release validation, and docs instead of a new Converter and Writer.

### Converter
The step that transforms a parsed Plugin into one Target's in-memory form, mapping tools, permissions, hooks, and model names explicitly rather than by convention.

### Writer
The step that emits a Target's converted Bundle onto disk, in that Target's expected paths and merge semantics. Paired with a Converter, one per Target.

### Bundle
The in-memory converted form of a Plugin for a single Target — the handoff a Converter produces and a Writer consumes.

### Install manifest
A per-plugin ledger, written by a Writer at install time, of exactly which skill, agent, prompt, and extension paths that install created on a Target — the record later installs consult to tell tool-owned content apart from user-managed content.

The load-bearing invariant is that a Writer never claims a path it did not write: a path the user has replaced (a symlink into a personal fork, a hand-authored directory) is excluded from the manifest and preserved on reinstall rather than overwritten, and the ledger is self-healing — removing the override lets the next install resume tracking that path. A path with no manifest entry — including one from an install predating the mechanism — reads as unowned and is therefore preserved.

### Marketplace
The catalog metadata listing installable plugins and their versions for distribution, kept consistent with each Plugin's manifest by release validation.

## Compound engineering

### Compound engineering
The methodology this project embodies: structure engineering work so each unit makes the next one easier, capturing reusable knowledge as you go so the toolset gets smarter with every use.

### Pipeline
The chained progression of Skills that carries a piece of work from strategy and ideation through brainstorm, plan, execution, and review, and closes by capturing what was learned. Each stage hands a durable artifact to the next, and research is gathered at the stage that needs it rather than re-gathered downstream.

### Learning
A documented solution to a past problem — a bug fix, a convention, or a workflow pattern — stored as the unit of compounded knowledge so future work can find and reuse it. Also called a solution doc. Carries structured metadata (category, tags, problem type) for retrieval; its creation date lives in the entry, not the filename.

### Pattern doc
Guidance generalized from several Learnings into a broader rule. Higher-leverage than any single incident-level Learning, and higher-risk when stale, because future work treats it as broadly applicable.

### Explainer
A dense, visual teaching artifact written for the developer personally — explaining a concept, a change, an idea, or a window of their own recent work — so the human keeps learning when agents do the writing. The complement of a Learning: a Learning teaches the repo's future work; an explainer teaches the human.

### Check-in
The active-recall step that can follow an explainer in the same session: the developer predicts or answers first and the explanation confirms or corrects — predict-then-reveal for changes, checked exercises for concepts. Skippable when the material does not warrant retention work.

### Concept-teaching section
A conditional section of a generated PR description, added by agent judgment when the change introduces a concept new to the codebase, that teaches the concept — what it is, why it was chosen here, and an example from the PR — so a reader can understand and re-explain the change without reading the diff. The passive, in-description counterpart of an Explainer.

## Skill orchestration

### Model tier
A semantic cost class for a dispatched sub-agent — extraction (cheapest capable, for retrieval and quoting), generation (mid-tier, for evidence-driven work and mechanical verification), or ceiling (the orchestrator's own model, inherited by omitting any model selection) — declared once per Skill and referenced by tier name so model names never hardcode into skill content.

When a platform cannot select models per agent, every role runs on the inherited model and cost control falls back to structure: read budgets and output caps.

### Evidence dossier
A bulk evidence artifact — verbatim quotes with source pointers, gathered by a cheap scout agent — written to scratch storage instead of returned inline, so the orchestrator carries only a short gist and downstream agents read the full dossier themselves.

### Load stub
The inline remnant left in a Skill when load-bearing content moves to a reference file: a load instruction that names what the reference contains and the failure mode of skipping it, while keeping no detail an agent could improvise from — making the load structurally necessary rather than advisory.

## Review and workflow vocabulary

### Reviewer persona
A single-lens reviewer role that evaluates work from one specific perspective — security, correctness, scope, design, and so on. Review Skills dispatch a panel of personas as subagents and merge their findings.

### Confidence anchor
A discrete, self-scored confidence value on a fixed small scale, each level tied to a behavioral criterion the model can honestly apply, used to gate and rank review findings instead of a continuous score that invites false precision. Each review Skill sets its own actionable threshold; corroboration across personas promotes a finding by one level.

### Autofix class
The classification of a review finding by how safely its proposed fix can be applied: applied silently, applied only after user confirmation, left for a human to resolve, or recorded as advisory with no action.

### Headless mode
An explicit opt-in mode that runs a Skill unattended, with no user prompts — it produces a written report as its deliverable and conservatively defers genuinely ambiguous decisions rather than guessing.

### Feedback source
A configured origin of customer or user feedback — a Slack channel, a GitHub Issues repo, an email inbox — declared once in the shared local config under a generic key so any Skill can read the list. Each source entry has its own identity and ingestion cursor; the Skill that ingests from it owns the per-item state, not the source declaration.

### Beta skill
A parallel copy of a stable Skill, suffixed `-beta`, used to trial a new version alongside the stable one without disrupting users. Invoked manually (model auto-invocation is disabled); promoting it to stable is more than a rename — every caller must move in the same change so none silently inherits stale defaults, and the retired beta name must be registered for stale-artifact cleanup so upgrading users don't keep a dead duplicate of the skill alongside the promoted one.
