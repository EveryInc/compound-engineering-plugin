# Changelog

All notable changes to the compound-engineering plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.24.0] - 2026-01-13

### Added

- **`agent-browser` skill** - Comprehensive documentation for Vercel's agent-browser CLI. Automate browser interactions for web testing, form filling, screenshots, and data extraction. Features:
  - Fast Rust CLI with Node.js fallback
  - Element references (`@e1`, `@e2`) for precise interactions
  - Session state persistence for authentication
  - Parallel browser sessions
  - Semantic locators (find by role, text, label)

### Changed

- **`/browser-test` command** (formerly `/playwright-test`) - Renamed and migrated from Playwright MCP to agent-browser CLI. The command now uses `agent-browser` commands via Bash for browser automation:
  - `agent-browser open <url>` for navigation
  - `agent-browser snapshot -i` for page state capture
  - `agent-browser console` for error checking
  - `agent-browser click @ref` for interactions

### Removed

- **Playwright MCP server** - Removed `@playwright/mcp` dependency. Browser automation now handled by agent-browser CLI (installed via npx).

---

## [2.23.0] - 2026-01-08

### Added

- **`kieran-code-quality` skill** - Extracted common code quality principles from all Kieran reviewers. This skill provides the foundation that language-specific reviewers build upon:
  - Duplication > Complexity philosophy
  - Strict on existing code, pragmatic on new code
  - Testing as quality indicator
  - 5-second naming rule
  - Module extraction signals

### Changed

- **Kieran reviewers refactored** - All three language-specific reviewers now reference the `kieran-code-quality` skill:
  - `kieran-rails-reviewer` - Now focused on Rails-specific conventions (Turbo Streams, namespacing, service extraction)
  - `kieran-python-reviewer` - Now focused on Python-specific patterns (type hints, PEP 8, modern Python features)
  - `kieran-typescript-reviewer` - Now focused on TypeScript-specific rules (type safety, React patterns, ES6+)

  This reduces duplication and ensures consistency across all Kieran reviewers.

---

## [2.22.0] - 2026-01-07

### Removed

- **`dhh-rails-style` skill** - Consolidated into `dhh-ruby-style`. The two skills had identical descriptions and overlapping content. All references from `dhh-rails-style` (controllers.md, models.md, frontend.md, architecture.md, gems.md) have been merged into `dhh-ruby-style`.
- **`every-style-editor` agent** - Removed duplicate agent. The `every-style-editor` skill provides the same functionality with better reference documentation.

### Changed

- **`dhh-ruby-style` skill** - Now includes comprehensive references from the removed `dhh-rails-style`:
  - controllers.md - REST mapping, concerns, Turbo responses, API patterns
  - models.md - Concerns, state records, callbacks, scopes, POROs
  - frontend.md - Turbo, Stimulus, CSS architecture, view patterns
  - architecture.md - Routing, auth, jobs, caching, multi-tenancy, config
  - gems.md - What they use vs avoid, and why

---

## [2.21.0] - 2026-01-05

### Removed

- **`/xcode-test` command** - Removed iOS simulator testing command
- **`mobile-patterns.md` reference** - Removed iOS/Swift mobile patterns from agent-native-architecture skill

This release removes all iOS-specific implementations to focus on web development workflows.

---

## [2.20.0] - 2026-01-01

### Changed

- **`create-agent-skills` skill** - Complete rewrite to match Anthropic's official skill specification:
  - **Format change**: Skills now use standard markdown headings (`## Quick Start`, `## Instructions`), NOT XML tags. The previous version incorrectly recommended XML tags which is not the official format.
  - **Naming convention**: Updated to use gerund form (`creating-agent-skills`, `processing-pdfs`) per official spec
  - **Description format**: Must be third person, include both what and when to use
  - Added `references/official-spec.md` - Anthropic's official skill specification from code.claude.com/docs/en/skills
  - Added `references/best-practices.md` - Skill authoring best practices from platform.claude.com
  - Removed obsolete `references/use-xml-tags.md` - this was incorrect guidance

### Philosophy

This update aligns the skill with Anthropic's official documentation. The key insight: **Skills are prompts**. All standard prompting best practices apply. Use standard markdown, not custom XML tags. Keep SKILL.md under 500 lines with progressive disclosure to reference files.

---

## [2.19.0] - 2025-12-31

### Added

- **`/deepen-plan` command** - Power enhancement for plans. Takes an existing plan and runs parallel research sub-agents for each major section to add:
  - Best practices and industry patterns
  - Performance optimizations
  - UI/UX improvements (if applicable)
  - Quality enhancements and edge cases
  - Real-world implementation examples

  The result is a deeply grounded, production-ready plan with concrete implementation details.

### Changed

- **`/workflows:plan` command** - Added `/deepen-plan` as option 2 in post-generation menu. Added note: if running with ultrathink enabled, automatically run deepen-plan for maximum depth.

## [2.18.0] - 2025-12-25

### Added

- **`agent-native-architecture` skill** - Added **Dynamic Capability Discovery** pattern and **Architecture Review Checklist**:

  **New Patterns in mcp-tool-design.md:**
  - **Dynamic Capability Discovery** - For external APIs (HealthKit, HomeKit, GraphQL), build a discovery tool (`list_*`) that returns available capabilities at runtime, plus a generic access tool that takes strings (not enums). The API validates, not your code. This means agents can use new API capabilities without code changes.
  - **CRUD Completeness** - Every entity the agent can create must also be readable, updatable, and deletable. Incomplete CRUD = broken action parity.

  **New in SKILL.md:**
  - **Architecture Review Checklist** - Pushes reviewer findings earlier into the design phase. Covers tool design (dynamic vs static, CRUD completeness), action parity (capability map, edit/delete), UI integration (agent → UI communication), and context injection.
  - **Option 11: API Integration** - New intake option for connecting to external APIs like HealthKit, HomeKit, GraphQL
  - **New anti-patterns:** Static Tool Mapping (building individual tools for each API endpoint), Incomplete CRUD (create-only tools)
  - **Tool Design Criteria** section added to success criteria checklist

  **New in shared-workspace-architecture.md:**
  - **iCloud File Storage for Multi-Device Sync** - Use iCloud Documents for your shared workspace to get free, automatic multi-device sync without building a sync layer. Includes implementation pattern, conflict handling, entitlements, and when NOT to use it.

### Philosophy

This update codifies a key insight for **agent-native apps**: when integrating with external APIs where the agent should have the same access as the user, use **Dynamic Capability Discovery** instead of static tool mapping. Instead of building `read_steps`, `read_heart_rate`, `read_sleep`... build `list_health_types` + `read_health_data(dataType: string)`. The agent discovers what's available, the API validates the type.

Note: This pattern is specifically for agent-native apps following the "whatever the user can do, the agent can do" philosophy. For constrained agents with intentionally limited capabilities, static tool mapping may be appropriate.

---

## [2.17.0] - 2025-12-25

### Enhanced

- **`agent-native-architecture` skill** - Major expansion based on real-world learnings from building the Every Reader iOS app. Added 5 new reference documents and expanded existing ones:

  **New References:**
  - **dynamic-context-injection.md** - How to inject runtime app state into agent system prompts. Covers context injection patterns, what context to inject (resources, activity, capabilities, vocabulary), implementation patterns for Swift/iOS and TypeScript, and context freshness.
  - **action-parity-discipline.md** - Workflow for ensuring agents can do everything users can do. Includes capability mapping templates, parity audit process, PR checklists, tool design for parity, and context parity guidelines.
  - **shared-workspace-architecture.md** - Patterns for agents and users working in the same data space. Covers directory structure, file tools, UI integration (file watching, shared stores), agent-user collaboration patterns, and security considerations.
  - **agent-native-testing.md** - Testing patterns for agent-native apps. Includes "Can Agent Do It?" tests, the Surprise Test, automated parity testing, integration testing, and CI/CD integration.
  - **mobile-patterns.md** - Mobile-specific patterns for iOS/Android. Covers background execution (checkpoint/resume), permission handling, cost-aware design (model tiers, token budgets, network awareness), offline handling, and battery awareness.

  **Updated References:**
  - **architecture-patterns.md** - Added 3 new patterns: Unified Agent Architecture (one orchestrator, many agent types), Agent-to-UI Communication (shared data store, file watching, event bus), and Model Tier Selection (fast/balanced/powerful).

  **Updated Skill Root:**
  - **SKILL.md** - Expanded intake menu (now 10 options including context injection, action parity, shared workspace, testing, mobile patterns). Added 5 new agent-native anti-patterns (Context Starvation, Orphan Features, Sandbox Isolation, Silent Actions, Capability Hiding). Expanded success criteria with agent-native and mobile-specific checklists.

- **`agent-native-reviewer` agent** - Significantly enhanced with comprehensive review process covering all new patterns. Now checks for action parity, context parity, shared workspace, tool design (primitives vs workflows), dynamic context injection, and mobile-specific concerns. Includes detailed anti-patterns, output format template, quick checks ("Write to Location" test, Surprise test), and mobile-specific verification.

### Philosophy

These updates operationalize a key insight from building agent-native mobile apps: **"The agent should be able to do anything the user can do, through tools that mirror UI capabilities, with full context about the app state."** The failure case that prompted these changes: an agent asked "what reading feed?" when a user said "write something in my reading feed"—because it had no `publish_to_feed` tool and no context about what "feed" meant.

## [2.16.0] - 2025-12-21

### Enhanced

- **`dhh-rails-style` skill** - Massively expanded reference documentation incorporating patterns from Marc Köhlbrugge's Unofficial 37signals Coding Style Guide:
  - **controllers.md** - Added authorization patterns, rate limiting, Sec-Fetch-Site CSRF protection, request context concerns
  - **models.md** - Added validation philosophy, let it crash philosophy (bang methods), default values with lambdas, Rails 7.1+ patterns (normalizes, delegated types, store accessor), concern guidelines with touch chains
  - **frontend.md** - Added Turbo morphing best practices, Turbo frames patterns, 6 new Stimulus controllers (auto-submit, dialog, local-time, etc.), Stimulus best practices, view helpers, caching with personalization, broadcasting patterns
  - **architecture.md** - Added path-based multi-tenancy, database patterns (UUIDs, state as records, hard deletes, counter caches), background job patterns (transaction safety, error handling, batch processing), email patterns, security patterns (XSS, SSRF, CSP), Active Storage patterns
  - **gems.md** - Added expanded what-they-avoid section (service objects, form objects, decorators, CSS preprocessors, React/Vue), testing philosophy with Minitest/fixtures patterns

- **`dhh-ruby-style` skill** - Expanded patterns.md with:
  - Development philosophy (ship/validate/refine, fix root causes, vanilla Rails first)
  - Rails 7.1+ idioms (params.expect, StringInquirer, positive naming conventions)
  - Extraction guidelines (rule of three, start in controller extract when complex)

### Credits

- Reference patterns derived from [Marc Köhlbrugge's Unofficial 37signals Coding Style Guide](https://github.com/marckohlbrugge/unofficial-37signals-coding-style-guide)

## [2.15.2] - 2025-12-21

### Fixed

- **All skills** - Fixed spec compliance issues across 13 skills:
  - Reference files now use proper markdown links (`[file.md](./references/file.md)`) instead of backtick text
  - Descriptions now use third person ("This skill should be used when...") per skill-creator spec
  - Affected skills: agent-native-architecture, andrew-kane-gem-writer, compound-docs, create-agent-skills, dhh-rails-style, dhh-ruby-style, dspy-ruby, every-style-editor, file-todos, frontend-design, gemini-imagegen

### Added

- **CLAUDE.md** - Added Skill Compliance Checklist with validation commands for ensuring new skills meet spec requirements

## [2.15.1] - 2025-12-18

### Changed

- **`/workflows:review` command** - Section 7 now detects project type (Web, iOS, or Hybrid) and offers appropriate testing. Web projects get `/playwright-test`, iOS projects get `/xcode-test`, hybrid projects can run both.

## [2.15.0] - 2025-12-18

### Added

- **`/xcode-test` command** - Build and test iOS apps on simulator using XcodeBuildMCP. Automatically detects Xcode project, builds app, launches simulator, and runs test suite. Includes retries for flaky tests.

- **`/playwright-test` command** - Run Playwright browser tests on pages affected by current PR or branch. Detects changed files, maps to affected routes, generates/runs targeted tests, and reports results with screenshots.
