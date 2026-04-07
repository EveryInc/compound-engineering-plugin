# Persona Catalog

Reviewer personas are registered in [`reviewer-registry.yaml`](./reviewer-registry.yaml), which is the single source of truth for which reviewers exist, their categories, and selection criteria. This document explains the system.

## Categories

| Category | Behavior |
|----------|----------|
| `always-on` | Spawned on every review regardless of diff content. Returns structured JSON. |
| `ce-always` | CE-specific agents spawned on every review. Returns unstructured output, synthesized separately. |
| `conditional` | Spawned when the orchestrator judges the diff touches the reviewer's domain. |
| `stack` | Like conditional, but scoped to a specific language or framework. |
| `ce-conditional` | CE-specific agents spawned for migration-related diffs. |

## Selection rules

1. **Always spawn all `always-on` and `ce-always` reviewers.**
2. **For each `conditional` reviewer**, the orchestrator reads the diff and decides whether the reviewer's `select_when` criteria are relevant. This is a judgment call, not a keyword match.
3. **For each `stack` reviewer**, use file types and changed patterns as a starting point, then decide whether the diff actually introduces meaningful work for that reviewer. Do not spawn language-specific reviewers just because one config or generated file happens to match the extension.
4. **For `ce-conditional` reviewers**, spawn when the diff includes migration files (`db/migrate/*.rb`, `db/schema.rb`) or data backfill scripts.
5. **Announce the team** before spawning with a one-line justification per conditional reviewer selected.

## Setup

Reviewer `.md` files are not committed to the plugin repo. They live in external repos configured under `sources` in `reviewer-registry.yaml`. Run `/ce:refresh` to sync them into `agents/review/`.

## Adding a custom reviewer

1. Add a new `.md` file to your reviewer repo following the persona format (frontmatter with name/description/model/tools, then the prompt body with hunting targets, confidence calibration, suppression rules, and output format).
2. Add an entry to `reviewer-registry.yaml` with the appropriate category and selection criteria.
3. Run `/ce:refresh` to pull it in.
4. The orchestrator will automatically discover and use the new reviewer.
