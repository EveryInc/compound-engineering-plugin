# Namespaced Extension System for Compound Engineering Plugin

**Date:** 2026-02-13
**Status:** Brainstorm
**Author:** Matthew Thompson

## What We're Building

A general extensibility system that lets users create optional plugins ("extensions") that work alongside the core compound-engineering plugin. Extensions follow a naming convention (`compound-engineering-<name>`) and are distributed through the same marketplace. They enable three categories of customization:

1. **Custom agents/skills** - Specialized agents and skills for specific domains (e.g., a Phoenix reviewer, a Terraform skill)
2. **Framework packs** - Bundled sets of agents + skills + commands for a specific stack (e.g., "Rails Pack" with Rails-specific reviewers, generators, and conventions)
3. **Convention configs** - Team/personal rules and style preferences delivered as curated CLAUDE.md snippets that influence how existing core agents behave

## Why This Approach

We chose a **namespaced extension system** (Approach 2) over alternatives because:

- **Works within current Claude Code spec** - No custom fields or spec changes needed. The marketplace already supports multiple plugins (coding-tutor proves this).
- **Convention over configuration** - Naming patterns (`compound-engineering-*`) and tags create clear relationships without formal dependency mechanisms.
- **Seamless experience** - The primary success metric. Extensions should feel like a natural part of the core with no conflicts or configuration headaches.
- **Upgradable** - Can graduate to a formal manifest system (Approach 3) later if the ecosystem grows large enough to need it.

### Rejected Alternatives

- **Flat plugin ecosystem** - Too loose. No way to signal which plugins complement the core. Users would have to guess.
- **Pack manifest system** - Adds `extends` field not in the Claude Code spec. Premature complexity for current ecosystem size.

## Key Decisions

### 1. Naming Convention

All extensions use the pattern: `compound-engineering-<name>`

Examples:
- `compound-engineering-rails` (Rails framework pack)
- `compound-engineering-security` (security-focused agents)
- `compound-engineering-every-conventions` (team convention config)

This makes extensions immediately identifiable and groups them naturally in marketplace listings.

### 2. Convention Configs via CLAUDE.md

Convention configs are plugins that ship curated CLAUDE.md instructions rather than (or in addition to) agents. Claude already reads CLAUDE.md files as context, so this is the most natural mechanism. No new infrastructure needed.

A convention config plugin structure:
```
plugins/compound-engineering-my-team/
├── .claude-plugin/plugin.json
├── CLAUDE.md              # Team conventions that agents read
└── README.md
```

### 3. Discovery via Tags and Browse Command

- Extensions use a shared tag (e.g., `compound-engineering-extension`) in marketplace.json
- A `/extensions` command (or similar) lets users browse available extensions with descriptions
- The marketplace listing groups extensions visually

### 4. Distribution Through Same Marketplace

All extensions live in the same marketplace repo (`every-marketplace`). This provides:
- One-stop browsing
- Consistent quality (maintainers can review contributions)
- Simple installation (`claude /plugin install compound-engineering-rails`)

### 5. No Formal Dependencies

Claude Code doesn't support plugin dependencies. Each extension must function independently - it can complement the core but shouldn't break without it. This is a platform constraint we accept.

### 6. Component Namespacing

To avoid name collisions between extensions:
- Agents: prefix or suffix with pack name (e.g., `rails-model-reviewer` not just `reviewer`)
- Skills: use descriptive names (e.g., `rails-generators` not just `generators`)
- Commands: use pack prefix (e.g., `rails:scaffold` not just `scaffold`)

## Extension Categories

### Framework Packs
A framework pack bundles domain-specific tooling for a technology stack.

Example: `compound-engineering-rails`
```
plugins/compound-engineering-rails/
├── .claude-plugin/plugin.json
├── CLAUDE.md                    # Rails conventions and preferences
├── agents/
│   ├── rails-model-reviewer.md
│   ├── rails-migration-checker.md
│   └── rails-performance-agent.md
├── skills/
│   └── rails-generators/SKILL.md
└── README.md
```

### Custom Agents/Skills
Individual agents or skills for specific needs.

Example: `compound-engineering-security`
```
plugins/compound-engineering-security/
├── .claude-plugin/plugin.json
├── agents/
│   ├── owasp-scanner.md
│   └── dependency-auditor.md
├── skills/
│   └── threat-model/SKILL.md
└── README.md
```

### Convention Configs
Team or personal preferences that shape agent behavior.

Example: `compound-engineering-every-conventions`
```
plugins/compound-engineering-every-conventions/
├── .claude-plugin/plugin.json
├── CLAUDE.md                    # Every's coding standards, style preferences, etc.
└── README.md
```

## Open Questions

1. **Quality control** - Should there be a review process for community-contributed extensions, or is it open contribution?
2. **Versioning alignment** - Should extensions declare which version of the core they're designed for, even informally?
3. **Starter template** - Should we provide a `/create-extension` command or template repo to scaffold new extensions?
4. **Testing** - How do we verify extensions don't conflict with each other or the core?
5. **Documentation** - Should the docs site auto-generate pages for extensions, or is README.md sufficient?

## Next Steps

- Plan the implementation: directory structure, marketplace.json changes, example extensions
- Build 1-2 example extensions to validate the pattern
- Create documentation for extension authors
- Consider a `/create-extension` scaffolding command
