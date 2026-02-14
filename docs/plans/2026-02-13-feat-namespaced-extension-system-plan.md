---
title: "feat: Namespaced Extension System"
type: feat
date: 2026-02-13
brainstorm: docs/brainstorms/2026-02-13-namespaced-extension-system-brainstorm.md
related: plans/grow-your-own-garden-plugin-architecture.md
---

# Namespaced Extension System

## Overview

Create an extension ecosystem where users can install optional plugins that complement the core compound-engineering plugin. Extensions follow the naming convention `compound-engineering-<name>`, live in the same marketplace, and enable three categories of customization: custom agents/skills, framework packs, and convention configs (delivered as CLAUDE.md snippets).

## Problem Statement / Motivation

The compound-engineering plugin is monolithic — 30 agents, 25 commands, 21 skills. Users working in Rails don't need Python reviewers, and vice versa. Teams want their own conventions baked in. The "Grow Your Own Garden" plan identified this problem but proposed a complex growth-loop mechanism. This plan takes a simpler approach: let people install optional extensions from the same marketplace.

The infrastructure already works — `coding-tutor` proves multiple plugins can coexist in the marketplace. We just need conventions, templates, and a discovery mechanism.

## Proposed Solution

### What Claude Code Already Handles

These are platform-level capabilities we don't need to build:

- **Installation**: `claude /plugin install <name>` works for any plugin in a marketplace
- **Component discovery**: Agents, commands, skills auto-discovered from standard directories
- **CLAUDE.md loading**: All CLAUDE.md files in installed plugins are read as context
- **Plugin isolation**: Each plugin is cached independently, no cross-plugin file access
- **Sandboxing**: User permission model applies to all plugin components equally

### What We Build

1. **Extension template** — Scaffold structure for creating extensions
2. **Example extensions** — Two reference implementations (framework pack + convention config)
3. **`/extensions` command** — Browse available extensions from the marketplace
4. **Marketplace entries** — Add extensions to marketplace.json with shared tags
5. **Author guide** — Documentation for creating and submitting extensions
6. **Naming validation** — Script to check naming conventions and detect collisions

## Technical Considerations

### Naming Conventions

| Component | Pattern | Example |
|-----------|---------|---------|
| Plugin name | `compound-engineering-<domain>` | `compound-engineering-rails` |
| Agent names | `<domain>-<purpose>` | `rails-model-reviewer` |
| Skill names | `<domain>-<purpose>` | `rails-generators` |
| Command names | `<domain>:<action>` | `rails:scaffold` |
| Marketplace tag | `compound-engineering-extension` | — |

### Extension Types

**Framework Pack** — Bundled agents + skills + commands + CLAUDE.md for a stack:
```
plugins/compound-engineering-rails/
├── .claude-plugin/plugin.json
├── CLAUDE.md                    # Rails conventions (prefer RSpec, follow Rails Way, etc.)
├── README.md
├── agents/
│   ├── rails-model-reviewer.md
│   └── rails-migration-checker.md
├── commands/
│   └── rails-console.md
└── skills/
    └── rails-generators/
        └── SKILL.md
```

**Convention Config** — Just CLAUDE.md with team/personal rules:
```
plugins/compound-engineering-every-conventions/
├── .claude-plugin/plugin.json
├── CLAUDE.md                    # Team coding standards, PR conventions, etc.
└── README.md
```

**Custom Agents/Skills** — Individual specialized components:
```
plugins/compound-engineering-security/
├── .claude-plugin/plugin.json
├── README.md
└── agents/
    ├── owasp-scanner.md
    └── dependency-auditor.md
```

### CLAUDE.md Convention Configs

Claude Code loads all CLAUDE.md files from installed plugins as context. Priority order (per Claude Code docs): project CLAUDE.md > user CLAUDE.md > plugin CLAUDE.md. This means:

- Extension conventions apply globally when installed
- Project-level CLAUDE.md can always override extension conventions
- Multiple extension CLAUDE.md files all load (no conflict resolution needed — Claude synthesizes instructions naturally)

**Guidelines for convention config authors:**
- Keep CLAUDE.md under 2KB (respect token budget)
- Use clear section headers so instructions are scannable
- Prefix rules with context: "When working on Rails code..." rather than absolute rules
- Document which core agents the conventions influence

### Collision Avoidance

- Naming convention is the primary defense (convention over enforcement)
- Validation script checks for collisions against core plugin components at submission time
- Component names must not match any existing agent/command/skill in core or other extensions
- If collision detected, author must rename before merging

### Plugin.json for Extensions (Minimal)

```json
{
  "name": "compound-engineering-rails",
  "version": "1.0.0",
  "description": "Rails framework pack for compound-engineering. Adds Rails-specific code review agents, generators, and conventions.",
  "author": {
    "name": "Author Name"
  },
  "keywords": ["compound-engineering-extension", "rails", "ruby", "framework-pack"]
}
```

Required fields: `name`, `version`, `description`, `author`
Required keyword: `compound-engineering-extension` (for discovery)

## Acceptance Criteria

- [ ] Extension template exists with scaffold script or documented structure
- [ ] At least one example extension (`compound-engineering-rails`) is functional
- [ ] At least one convention config extension exists as a reference
- [ ] `/extensions` command lists available extensions with descriptions and install commands
- [ ] Extensions install alongside core plugin without conflicts
- [ ] marketplace.json includes extension entries with `compound-engineering-extension` tag
- [ ] Author guide documents naming conventions, structure, and submission process
- [ ] Validation script detects naming collisions against core plugin components

## Success Metrics

- Extensions install and work alongside the core plugin with zero configuration
- A new extension can be created from template in under 10 minutes
- `/extensions` command provides enough info to decide whether to install

## Dependencies & Risks

**Dependencies:**
- Claude Code plugin system continues to support multiple plugins per marketplace (currently works)
- CLAUDE.md files from plugins continue to be loaded as context (currently works)

**Risks:**
- **Token budget**: Multiple extension CLAUDE.md files could consume too much context. Mitigation: 2KB guideline for convention configs.
- **Name collisions**: Convention-based naming can't prevent all collisions. Mitigation: Validation script checks at submission time.
- **Core plugin changes**: Core agent renames could collide with extensions. Mitigation: Extensions use domain-prefixed names that won't overlap with core's generic names.

## Implementation

### Phase 1: Template and Example Extension

Create the extension template structure and build `compound-engineering-rails` as the reference implementation.

**Files to create:**

1. `plugins/compound-engineering-rails/.claude-plugin/plugin.json` — Minimal manifest
2. `plugins/compound-engineering-rails/CLAUDE.md` — Rails conventions
3. `plugins/compound-engineering-rails/README.md` — Usage documentation
4. `plugins/compound-engineering-rails/agents/rails-model-reviewer.md` — Example agent
5. `plugins/compound-engineering-rails/agents/rails-migration-checker.md` — Example agent
6. `plugins/compound-engineering-rails/skills/rails-generators/SKILL.md` — Example skill

### Phase 2: Convention Config Example

Create `compound-engineering-every-conventions` as a reference convention config.

**Files to create:**

1. `plugins/compound-engineering-every-conventions/.claude-plugin/plugin.json`
2. `plugins/compound-engineering-every-conventions/CLAUDE.md` — Every's coding standards
3. `plugins/compound-engineering-every-conventions/README.md`

### Phase 3: Discovery Command

Build the `/extensions` command that reads marketplace.json and displays available extensions.

**Files to create:**

1. `plugins/compound-engineering/commands/extensions.md` — Browse command

**Command behavior:**
- Reads marketplace.json
- Filters plugins with `compound-engineering-extension` keyword/tag
- Displays each extension: name, description, component counts, install command
- Groups by type (framework pack, convention config, custom agents) if possible

### Phase 4: Marketplace and Documentation

Update marketplace.json with new extensions and create the author guide.

**Files to update:**

1. `.claude-plugin/marketplace.json` — Add extension entries
2. `plugins/compound-engineering/.claude-plugin/plugin.json` — Update description
3. `plugins/compound-engineering/README.md` — Add "Extensions" section

**Files to create:**

1. `docs/guides/creating-extensions.md` — Author guide with naming conventions, structure, submission process

### Phase 5: Validation

Create a validation script that checks extension compliance.

**Files to create:**

1. `scripts/validate-extension.sh` — Checks naming, structure, collisions

**Validation checks:**
- Plugin name starts with `compound-engineering-`
- `compound-engineering-extension` keyword present in plugin.json
- No component names collide with core plugin components
- Required files exist (.claude-plugin/plugin.json, README.md)
- plugin.json is valid JSON with required fields

## References & Research

### Internal References

- Brainstorm: `docs/brainstorms/2026-02-13-namespaced-extension-system-brainstorm.md`
- Related plan: `plans/grow-your-own-garden-plugin-architecture.md`
- Example plugin: `plugins/coding-tutor/` (minimal plugin structure)
- Core plugin: `plugins/compound-engineering/` (full plugin structure)
- Marketplace: `.claude-plugin/marketplace.json`

### External References

- [Claude Code Plugin Documentation](https://docs.claude.com/en/docs/claude-code/plugins)
- [Plugin Marketplace Documentation](https://docs.claude.com/en/docs/claude-code/plugin-marketplaces)
- [Plugin Reference](https://docs.claude.com/en/docs/claude-code/plugins-reference)
