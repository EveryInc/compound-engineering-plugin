---
title: "feat: Add onboarding skill to generate ONBOARDING.md from repo crawl"
type: feat
status: complete
date: 2026-03-25
origin: docs/brainstorms/2026-03-25-vonboarding-skill-requirements.md
---

# feat: Add onboarding skill to generate ONBOARDING.md from repo crawl

## Overview

Add an `/onboarding` skill to the compound-engineering plugin that crawls a repository and generates `ONBOARDING.md` at the repo root. The skill uses a bundled inventory script for deterministic data gathering and model judgment for narrative synthesis, producing a document that helps new contributors understand the codebase without requiring the creator to explain it.

## Problem Frame

When a codebase is built through AI-assisted "vibe coding," the creator may not fully understand their own architecture. New team members are left without the mental model they need to contribute. The onboarding document reconstructs this mental model from the code itself.

The primary audience is human developers. A document that works for human comprehension is also effective as agent context, but the inverse is not true. (see origin: `docs/brainstorms/2026-03-25-vonboarding-skill-requirements.md`)

## Requirements Trace

- R1. A skill named `onboarding` that crawls a repository and generates `ONBOARDING.md` at the repo root
- R2. The skill always regenerates the full document from scratch -- no surgical updates or diffing
- R3. Fixed filename (`ONBOARDING.md`) is the only state -- exists means refresh, doesn't exist means create
- R4. Exactly five sections: What is this thing? / How is it organized? / Key concepts / Primary flow / Where do I start?
- R5. Inline-link existing docs when directly relevant to a section; no separate references section
- R6. Written for human comprehension first -- clear prose, not structured data
- R7. Use visual aids -- ASCII diagrams, markdown tables -- where they improve readability over prose
- R8. Proper markdown formatting throughout -- backticks for file names, paths, commands, code references, and technical terms

## Scope Boundaries

- Does not infer or fabricate design rationale
- Does not assess fragility or risk areas
- Does not generate README.md, CLAUDE.md, AGENTS.md, or any other document
- Does not preserve hand-edits from a previous version
- No `ce:` prefix -- standalone utility skill
- No new agents -- the skill uses a bundled script plus the model's own file-reading and writing capabilities

## Context & Research

### Relevant Code and Patterns

- Skills live in `plugins/compound-engineering/skills/<name>/SKILL.md` with optional `scripts/`, `references/`, `assets/` directories
- Skills are auto-discovered from directory structure -- no registration in `plugin.json`
- SKILL.md requires YAML frontmatter with `name` and `description` fields
- Arguments received via `#$ARGUMENTS` interpolation in an XML tag
- Platform-agnostic interaction: use capability-class tool descriptions with platform hints
- Reference files must be proper markdown links, not bare backtick paths

### Institutional Learnings

- **Script-first skill architecture** (`docs/solutions/skill-design/script-first-skill-architecture.md`): Move deterministic processing into bundled scripts; model does judgment work only. 60-75% token reduction. Applies here as a hybrid -- script gathers structural inventory, model reads key files and writes prose.
- **Compound-refresh skill improvements** (`docs/solutions/skill-design/compound-refresh-skill-improvements.md`): Triage before asking (don't ask users what to document); platform-agnostic tool references; subagents should use file tools not shell; no contradictory rules across phases.
- Skill compliance checklist in `plugins/compound-engineering/AGENTS.md`: imperative voice, no second person, cross-platform question tool patterns, markdown-linked references.

## Key Technical Decisions

- **Hybrid script-first architecture**: The inventory script handles deterministic work (file tree, manifest parsing, framework detection, entry point identification, doc discovery). The model handles judgment work (reading key files, understanding architecture, tracing flows, writing prose). This follows the institutional pattern and avoids burning tokens on mechanical directory traversal.

- **No sub-agent dispatch**: The five sections are interdependent -- understanding architecture informs the primary flow, domain terms appear across sections. A single model pass produces a more coherent document than independent sub-agents writing sections in isolation. The inventory script provides the structural grounding the model needs.

- **No `repo-research-analyst` dependency**: That agent produces research-formatted output for planning skills. Using it would add a layer of indirection (research output -> re-synthesis into human prose). A simpler inventory script gives the model raw facts and lets it write directly for the human audience.

- **Universal inventory script**: The script must work across any language/framework by detecting from manifests and conventional directory locations. It does not parse code ASTs or read file contents -- those are model tasks.

- **No explicit create/refresh mode**: The skill always regenerates. The SKILL.md need not branch on whether `ONBOARDING.md` exists -- the behavior is identical either way.

## Open Questions

### Resolved During Planning

- **Orchestration strategy**: Single-pass with bundled inventory script. Sub-agents per section would create overlapping crawls and lose cross-section coherence. The document is short enough for one model pass.
- **Primary flow strategy**: Entry point tracing guided by inventory. The script identifies entry points; the model reads the primary one and follows the main user-facing path through imports and calls.
- **Section depth/length**: No prescriptive line counts. Guiding principle: each section answers its question concisely enough that a new person reads the entire document. Total should be readable in under 10 minutes.
- **Doc relevance heuristic**: Model judgment during writing. The inventory lists existing docs; when the model writes about a topic and a discovered doc is relevant, it links inline. No programmatic relevance scoring.

### Deferred to Implementation

- Exact JSON schema for inventory script output -- the shape will be refined when writing the script against real repos
- Which conventional entry point locations to check per ecosystem -- will be enumerated during script implementation
- Precise wording of the section writing guidance in SKILL.md -- will iterate during implementation

## Implementation Units

- [ ] **Unit 1: Create the inventory script**

  **Goal:** Build a Node.js script that produces a structured JSON inventory of any repository, giving the model a map to work from without burning tokens on directory traversal.

  **Requirements:** R1 (crawl mechanism), R5 (doc discovery)

  **Dependencies:** None

  **Files:**
  - Create: `plugins/compound-engineering/skills/onboarding/scripts/inventory.mjs`
  - Test: `tests/onboarding-inventory.test.ts`

  **Approach:**

  The script accepts an optional `--root <path>` argument (defaults to cwd) and writes JSON to stdout. It gathers:

  - **Project identity**: Name from the nearest manifest (package.json `name`, Cargo.toml `[package].name`, go.mod module path, etc.), falling back to directory name
  - **Languages and frameworks**: Detected from manifest files using the same ecosystem mapping table as `repo-research-analyst` Phase 0.1. Extract language, major framework dependencies, and versions from each manifest found. Include package manager and test framework when detectable.
  - **Directory structure**: Top-level directories plus one level into `src/`, `lib/`, `app/`, `pkg/`, `internal/` (or equivalent). Cap at 2 levels deep. Exclude `node_modules/`, `.git/`, `vendor/`, `target/`, `dist/`, `build/`, `__pycache__/`, `.next/`, `.cache/`, and other common build/dependency directories.
  - **Entry points**: Check conventional locations per detected ecosystem:
    - Node/TS: `src/index.*`, `src/main.*`, `src/app.*`, `index.*`, `server.*`, `app.*`, `pages/`, `app/` (Next.js)
    - Python: `main.py`, `app.py`, `manage.py`, `src/<project>/`, `__main__.py`
    - Ruby: `config/routes.rb`, `app/controllers/`, `bin/rails`, `config.ru`
    - Go: `main.go`, `cmd/*/main.go`
    - Rust: `src/main.rs`, `src/lib.rs`
    - General: `Makefile`, `Procfile` targets
  - **Scripts/commands**: Extract from `package.json` scripts, Makefile targets, or equivalent. Focus on dev, build, test, start, and lint commands.
  - **Existing documentation**: Find markdown files in repo root and common doc directories (`docs/`, `doc/`, `documentation/`, `docs/solutions/`, `wiki/`). List paths only, don't read contents.
  - **Test infrastructure**: Detect test directories and config files (`tests/`, `test/`, `spec/`, `__tests__/`, `jest.config.*`, `vitest.config.*`, `.rspec`, `pytest.ini`, `conftest.py`)

  Output shape (directional -- exact fields will be refined during implementation):
  ```
  {
    "name": "...",
    "languages": [...],
    "frameworks": [...],
    "packageManager": "...",
    "testFramework": "...",
    "structure": { "topLevel": [...], "srcLayout": [...] },
    "entryPoints": [...],
    "scripts": { ... },
    "docs": [...],
    "testInfra": { "dirs": [...], "config": [...] }
  }
  ```

  The script must:
  - Use only Node.js built-in modules (`fs`, `path`, `child_process` for git-tracked file list if useful)
  - Exit 0 and output valid JSON even when manifests are missing or unparseable
  - Be fast -- no network calls, no AST parsing, bounded directory traversal
  - Handle monorepos gracefully (list workspace structure without recursing into every package)

  **Patterns to follow:**
  - `skills/claude-permissions-optimizer/scripts/extract-commands.mjs` -- script-first pattern, JSON output, CLI flags, Node.js built-ins only

  **Test scenarios:**
  - Script produces valid JSON for a minimal repo (just a README)
  - Script detects Node.js ecosystem from `package.json`
  - Script detects multiple languages in a polyglot repo
  - Script respects directory depth limits
  - Script excludes common build/dependency directories
  - Script exits 0 with empty/partial JSON when manifests are malformed
  - Script finds entry points for at least Node, Python, and Ruby ecosystems
  - Script discovers docs in standard locations

  **Verification:**
  - Running the script against the compound-engineering repo produces sensible output
  - JSON output parses without error
  - Script completes in under 5 seconds on a typical repo

- [ ] **Unit 2: Create the SKILL.md**

  **Goal:** Write the skill definition that orchestrates the inventory script, guided file reading, and narrative synthesis into `ONBOARDING.md`.

  **Requirements:** R1, R2, R3, R4, R5, R6, R7, R8

  **Dependencies:** Unit 1

  **Files:**
  - Create: `plugins/compound-engineering/skills/onboarding/SKILL.md`

  **Approach:**

  The SKILL.md contains:

  1. **Frontmatter**: `name: onboarding`, description that covers what it does and when to use it, `argument-hint` for optional scope/focus hints.

  2. **Execution flow** with three phases:

     **Phase 1: Gather inventory.** Run the bundled script. Parse the JSON output. This gives the model a structural map of the repo without reading every file.

     **Phase 2: Read key files.** Guided by the inventory, read files that are essential for understanding the codebase:
     - README.md (if exists) -- for project purpose and setup
     - Primary entry points identified by the script
     - Route/controller files (for understanding the primary flow)
     - Configuration files that reveal architecture (e.g., docker-compose, database config)
     - A sample of the discovered documentation files (for inline linking in Phase 3)

     Cap the reading at a reasonable number of files (~10-15 key files) to avoid context bloat. Prioritize entry points and routes over config files. Use the native file-read tool, not shell commands.

     **Phase 3: Write ONBOARDING.md.** Synthesize everything into the five sections. Guidance for each section:

     - **What is this thing?** -- Draw from README, manifest descriptions, and entry point examination. State the purpose, who it's for, and what problem it solves. If this can't be determined, say so plainly rather than fabricating.
     - **How is it organized?** -- Use the inventory structure plus what was learned from reading key files. Describe the architecture, key modules, and how they connect. Use an ASCII directory tree to show the high-level structure. Use a markdown table when listing modules with their responsibilities.
     - **Key concepts / domain terms** -- Extract domain vocabulary from code (class names, module names, database tables, API endpoints) and explain each in one sentence. Present as a markdown table (`| Term | Definition |`) for scanability. These are the words someone needs to talk about this codebase.
     - **Primary flow** -- Trace one concrete path from the user's perspective. Start with the main thing the app does (e.g., "when a user submits an order..."), then walk through the code path: which file handles the request, what services it calls, where data is stored. Use an ASCII flow diagram to visualize the path (e.g., `Request -> Router -> Controller -> Service -> DB`). Reference specific file paths at each step.
     - **Where do I start?** -- Dev setup from README or scripts. How to run the app, how to run tests. Where to make common types of changes (e.g., "to add a new API endpoint, look at `src/routes/`"). List the 2-3 most common change patterns.

     For each section: if a discovered documentation file is directly relevant to what the section is explaining, link to it inline (e.g., "authentication uses token-based middleware -- see `docs/solutions/auth-pattern.md` for details"). Do not create a separate references section. If no relevant docs exist, the section stands alone.

  3. **Quality bar**: Before writing the file, verify:
     - Every section answers its question without padding
     - No fabricated design rationale or fragility assessments
     - File paths referenced in the document actually exist in the inventory
     - Prose is written for a human developer, not formatted as agent-consumable structured data
     - Existing docs are linked inline only where directly relevant, not collected in an appendix
     - All file names, paths, commands, code references, and technical terms use backtick formatting
     - Markdown styling is consistent throughout (headers, bold, code blocks, tables)

  4. **Post-generation options**: After writing, present options using the platform's blocking question tool:
     - Open the file for review
     - Commit the file
     - Done

  **Patterns to follow:**
  - `skills/ce-plan/SKILL.md` -- research-then-write orchestration, platform-agnostic tool references
  - `skills/claude-permissions-optimizer/SKILL.md` -- script-first execution pattern
  - Skill compliance checklist in `plugins/compound-engineering/AGENTS.md`

  **Test scenarios:**
  - The skill description triggers on "generate onboarding", "onboard new contributor", "create ONBOARDING.md", "document this codebase for new developers"
  - The skill runs the inventory script as its first action
  - The skill reads key files identified by inventory, not arbitrary files
  - The generated ONBOARDING.md contains exactly five sections
  - The skill does not ask the user what to document -- it triages autonomously
  - File paths referenced in ONBOARDING.md correspond to real files in the repo

  **Verification:**
  - SKILL.md passes the compliance checklist (no hardcoded tool names, imperative voice, markdown-linked scripts, platform-agnostic question patterns)
  - Running the skill against a real repo produces a readable ONBOARDING.md with all five sections
  - Re-running the skill regenerates the file from scratch (no diffing or updating behavior)

- [ ] **Unit 3: Update README and validate plugin**

  **Goal:** Register the new skill in the plugin README and verify plugin consistency.

  **Requirements:** R1

  **Dependencies:** Unit 2

  **Files:**
  - Modify: `plugins/compound-engineering/README.md`

  **Approach:**

  Add `onboarding` to the **Workflow Utilities** table in README.md:

  ```
  | `/onboarding` | Generate ONBOARDING.md to help new contributors understand the codebase |
  ```

  Update the skill count in the Components table if it's now inaccurate (currently "40+").

  **Patterns to follow:**
  - Existing README skill table format and descriptions

  **Test scenarios:**
  - Skill appears in the correct category table
  - Description is concise and matches SKILL.md description intent
  - Component count is accurate

  **Verification:**
  - `bun run release:validate` passes
  - README skill count matches actual skill count

## System-Wide Impact

- **Interaction graph:** The skill is standalone -- no callbacks, middleware, or cross-skill dependencies. Other skills do not invoke it.
- **Error propagation:** If the inventory script fails (malformed JSON, permission error), the skill should report the error and stop rather than attempting to write ONBOARDING.md from incomplete data.
- **API surface parity:** The skill outputs a file, not an API. No parity concerns.
- **Integration coverage:** Manual testing against a real repo is the primary integration check. The inventory script gets unit tests.

## Risks & Dependencies

- **Inventory script universality**: The script needs to handle repos in any language/framework. Risk: edge cases in ecosystem detection for less common stacks. Mitigation: start with the most common ecosystems (Node, Python, Ruby, Go, Rust) and degrade gracefully for others (still produce structure and docs, just skip framework-specific entry point detection).
- **Output quality variance**: The quality of ONBOARDING.md depends heavily on the model's synthesis ability, which varies by codebase complexity. Mitigation: the quality bar in SKILL.md sets clear expectations, and the five-section structure constrains scope.
- **Token budget**: Large codebases could produce large inventories or require reading many files. Mitigation: the inventory script caps directory depth, and the SKILL.md caps file reading at ~10-15 key files.

## Sources & References

- **Origin document:** [docs/brainstorms/2026-03-25-vonboarding-skill-requirements.md](../brainstorms/2026-03-25-vonboarding-skill-requirements.md)
- Script-first architecture: [docs/solutions/skill-design/script-first-skill-architecture.md](../solutions/skill-design/script-first-skill-architecture.md)
- Compound-refresh learnings: [docs/solutions/skill-design/compound-refresh-skill-improvements.md](../solutions/skill-design/compound-refresh-skill-improvements.md)
- Repo-research-analyst agent: `plugins/compound-engineering/agents/research/ce-repo-research-analyst.agent.md`
- Skill compliance checklist: `plugins/compound-engineering/AGENTS.md`
