# Skills Documentation

This document provides detailed documentation for all 13 skills included in the Compound Engineering Plugin.

## Quick Reference

| Skill | Category | Purpose |
|-------|----------|---------|
| [agent-native-architecture](#agent-native-architecture) | Architecture | Build AI agents using prompt-native design |
| [andrew-kane-gem-writer](#andrew-kane-gem-writer) | Ruby | Write gems following Andrew Kane patterns |
| [compound-docs](#compound-docs) | Documentation | Capture solved problems as docs |
| [create-agent-skills](#create-agent-skills) | Development | Create Claude Code skills |
| [dhh-rails-style](#dhh-rails-style) | Ruby/Rails | Write code in DHH's 37signals style |
| [dspy-ruby](#dspy-ruby) | Ruby/AI | Build type-safe LLM applications |
| [every-style-editor](#every-style-editor) | Editing | Review copy for Every's style guide |
| [file-todos](#file-todos) | Workflow | File-based todo tracking |
| [frontend-design](#frontend-design) | Design | Create distinctive frontend interfaces |
| [gemini-imagegen](#gemini-imagegen) | Image | Generate images with Gemini API |
| [git-worktree](#git-worktree) | Git | Manage worktrees for parallel dev |
| [rclone](#rclone) | File Transfer | Upload to S3, R2, B2, cloud storage |
| [skill-creator](#skill-creator) | Development | Guide for creating Claude skills |

## Installation

### Claude Code (Native)

Skills are automatically available when the plugin is installed:

```bash
claude /plugin install compound-engineering
```

### Portable Installation (Other AI Coding Agents)

Skills follow the [Agent Skills Standard](https://agentskills.io) and can be installed into any compatible AI coding agent.

#### Manual Installation

1. Copy the skill folder to your agent's skills directory:
   ```bash
   # Example for Claude Code
   cp -r skills/skill-name ~/.claude/skills/

   # Example for Cursor
   cp -r skills/skill-name ~/.cursor/skills/

   # Example for Windsurf
   cp -r skills/skill-name ~/.windsurf/skills/
   ```

2. Restart your agent to load the skill

#### From GitHub

```bash
# Clone the repo
git clone https://github.com/EveryInc/compound-engineering-plugin.git

# Copy desired skills
cp -r compound-engineering-plugin/plugins/compound-engineering/skills/skill-name ~/.claude/skills/
```

## Skill Details

### agent-native-architecture

Build AI agents using prompt-native architecture principles.

**Triggers:** "agent-native", "prompt architecture", "action context parity", "agentic design patterns", "build AI agent"

**Key Features:**
- Pattern library for agentic architectures
- Action/context parity validation
- Tool use optimization strategies

[Full documentation](./agent-native-architecture_skill.md)

---

### andrew-kane-gem-writer

Write Ruby gems following Andrew Kane's battle-tested patterns from 100+ gems.

**Triggers:** "create a gem", "write a Ruby library", "Andrew Kane style", "gem API design", "minimal gem", "Searchkick patterns"

**Key Features:**
- Zero-dependency gem architecture
- Rails integration patterns with ActiveSupport.on_load
- Class macro DSL patterns
- Minitest-based testing

[Full documentation](./andrew-kane-gem-writer_skill.md)

---

### compound-docs

Capture solved problems as categorized documentation that compounds team knowledge.

**Triggers:** "document solution", "create solution doc", "compound knowledge", "capture fix", "record how we solved"

**Key Features:**
- Categorized solution templates
- Problem/solution/prevention format
- Knowledge compounding over time

[Full documentation](./compound-docs_skill.md)

---

### create-agent-skills

Expert guidance for creating Claude Code skills following official specifications.

**Triggers:** "create skill", "write skill", "SKILL.md", "skill best practices", "author skill"

**Key Features:**
- Skill structure templates
- Progressive disclosure patterns
- Quality checklists

[Full documentation](./create-agent-skills_skill.md)

---

### dhh-rails-style

Write Ruby/Rails code in DHH's 37signals style with strong opinions on structure.

**Triggers:** "DHH style", "37signals Rails", "Rails conventions", "Basecamp patterns", "Hotwire implementation"

**Key Features:**
- Controller patterns (thin controllers, fat models)
- Hotwire/Turbo integration
- Convention over configuration

[Full documentation](./dhh-rails-style_skill.md)

---

### dspy-ruby

Build type-safe LLM applications with DSPy.rb framework.

**Triggers:** "DSPy", "DSPy.rb", "LLM in Ruby", "Ruby AI", "type-safe LLM", "Ruby language model"

**Key Features:**
- Type-safe signatures for LLM operations
- Composable modules and workflows
- Multi-provider support (OpenAI, Anthropic, Gemini, Ollama)
- Multimodal/vision capabilities

[Full documentation](./dspy-ruby_skill.md)

---

### every-style-editor

Review and edit copy to ensure adherence to Every's comprehensive style guide.

**Triggers:** "edit for style", "review article", "check grammar", "Every style guide", "proofread", "copy edit"

**Key Features:**
- 4-phase review process
- Detailed line edit checklists
- Style guide quick reference tables

[Full documentation](./every-style-editor_skill.md)

---

### file-todos

File-based todo tracking system for managing tasks across projects.

**Triggers:** "track todos", "file-based tasks", "todo list", "task tracking"

**Key Features:**
- Persistent file-based storage
- Status tracking (pending, in_progress, completed)
- Integration with development workflow

[Full documentation](./file-todos_skill.md)

---

### frontend-design

Create distinctive, production-grade frontend interfaces that avoid generic AI aesthetics.

**Triggers:** "build a landing page", "create a component", "design a UI", "make a web page", "build frontend", "React component", "Vue component"

**Key Features:**
- 3-phase design workflow
- Aesthetic direction system (8 distinct directions)
- Production-grade component patterns

[Full documentation](./frontend-design_skill.md)

---

### gemini-imagegen

Generate and edit images using Google's Gemini API with multi-turn refinement.

**Triggers:** "generate image", "create picture", "Gemini image", "AI image generation", "imagen", "gemini-imagegen"

**Key Features:**
- Text-to-image generation
- Image editing and manipulation
- Multi-turn refinement workflows
- Multiple reference image composition (up to 14 images)

**Requirements:**
- `GEMINI_API_KEY` environment variable
- Python packages: `google-genai`, `pillow`

[Full documentation](./gemini-imagegen_skill.md)

---

### git-worktree

Manage Git worktrees for parallel development across multiple features.

**Triggers:** "git worktree", "parallel branches", "multiple features", "worktree setup"

**Key Features:**
- Worktree lifecycle management
- Parallel development patterns
- Branch isolation strategies

[Full documentation](./git-worktree_skill.md)

---

### rclone

Upload files to S3, Cloudflare R2, Backblaze B2, and other cloud storage providers.

**Triggers:** "upload to S3", "cloud storage", "rclone sync", "backup files", "R2 upload", "B2 backup"

**Key Features:**
- Multi-provider support (S3, R2, B2, GDrive, Dropbox)
- Sync and copy operations
- Transfer verification

[Full documentation](./rclone_skill.md)

---

### skill-creator

Comprehensive guide for creating effective Claude Code skills with bundled resources.

**Triggers:** "create a skill", "new skill", "write a skill", "update skill", "skill template"

**Key Features:**
- 6-step creation process
- Bundled resources guide (scripts, references, assets)
- Packaging and validation scripts

[Full documentation](./skill-creator_skill.md)

---

## Skill Compatibility

All skills in this plugin follow the [Agent Skills Standard](https://agentskills.io) and are compatible with:

| Agent | Skill Directory | Status |
|-------|-----------------|--------|
| Claude Code | `~/.claude/skills/` | Tested |
| Cursor | `~/.cursor/skills/` | Compatible |
| Windsurf | `~/.windsurf/skills/` | Compatible |
| Continue | `~/.continue/skills/` | Compatible |
| Aider | `~/.aider/skills/` | Compatible |
| Cline | `~/.cline/skills/` | Compatible |
| OpenCode | `~/.opencode/skills/` | Compatible |
| Codex CLI | `~/.codex/skills/` | Compatible |

## Contributing

To contribute a new skill:

1. Use the `create-agent-skills` or `skill-creator` skill for guidance
2. Follow the YAML frontmatter specification
3. Include trigger keywords in the description
4. Add quality checklist if applicable
5. Submit a PR with documentation

## License

MIT
