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
A destination coding-agent platform other than Claude Code (OpenCode, Codex, Gemini, and others) that a Plugin is converted into and installed onto, each with its own file layout and capability mapping. Also called a target provider.

A Plugin is installed to a Target at one of two scopes: global (user-wide) or per-workspace.

### Converter
The step that transforms a parsed Plugin into one Target's in-memory form, mapping tools, permissions, hooks, and model names explicitly rather than by convention.

### Writer
The step that emits a Target's converted Bundle onto disk, in that Target's expected paths and merge semantics. Paired with a Converter, one per Target.

### Bundle
The in-memory converted form of a Plugin for a single Target — the handoff a Converter produces and a Writer consumes.

### Marketplace
The catalog metadata listing installable plugins and their versions for distribution, kept consistent with each Plugin's manifest by release validation.

## Compound engineering

### Compound engineering
The methodology this project embodies: structure engineering work so each unit makes the next one easier, capturing reusable knowledge as you go so the toolset gets smarter with every use.

### Pipeline
The chained progression of Skills that carries a piece of work from strategy and ideation through brainstorm, plan, execution, and review, and closes by capturing what was learned. Each stage hands a durable artifact to the next, and research is gathered at the stage that needs it rather than re-gathered downstream.

### Task-graph
A committed, diffable decomposition of a whole project, sitting one level above a single Plan: a markdown index plus one file per node, where each node is a feature-sized unit tagged with the pipeline stage it next enters and a recommended model tier, carrying an embedded plan when settled or a brief otherwise. The repo owns project structure; a node's live status is derived from git on read rather than stored. Produced by the ce-decompose Skill.

### Learning
A documented solution to a past problem — a bug fix, a convention, or a workflow pattern — stored as the unit of compounded knowledge so future work can find and reuse it. Also called a solution doc. Carries structured metadata (category, tags, problem type) for retrieval; its creation date lives in the entry, not the filename.

### Pattern doc
Guidance generalized from several Learnings into a broader rule. Higher-leverage than any single incident-level Learning, and higher-risk when stale, because future work treats it as broadly applicable.

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

### Beta skill
A parallel copy of a stable Skill, suffixed `-beta`, used to trial a new version alongside the stable one without disrupting users. Invoked manually (model auto-invocation is disabled); promoting it to stable is an orchestration change, not just a rename — every caller must move in the same change so none silently inherits stale defaults.
