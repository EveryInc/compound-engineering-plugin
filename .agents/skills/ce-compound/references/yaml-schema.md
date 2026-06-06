# YAML Frontmatter Schema

`schema.yaml` in this directory is the canonical contract for `docs/solutions/` frontmatter written by `ce-compound`.

Use this file as the quick reference for:

- required fields
- enum values
- validation expectations
- category mapping
- date field alias

## Required Fields (all docs)

- **title**: Clear problem or learning title
- **date**: ISO date in `YYYY-MM-DD` format
- **problem_type**: One of the values listed in the enum table below
- **severity**: One of `critical`, `high`, `medium`, `low`, `process`
- **tags**: Search keywords, lowercase and hyphen-separated (array, max 8 items)

## Date Field Alias

For backward compatibility with existing docs, the `date` field may be replaced with `created` (same `YYYY-MM-DD` format). At least one of `date` or `created` is required.

## Problem Types (Enum)

| Problem Type             | Category Mapping                       | Description                                                |
| ------------------------ | -------------------------------------- | ---------------------------------------------------------- |
| **Architecture**         | `docs/solutions/`                      | High-level architectural decisions and patterns            |
| `architecture_pattern`   | `docs/solutions/`                      |                                                            |
| **Design**               | `docs/solutions/`                      | Recurring design solutions                                 |
| `design_pattern`         | `docs/solutions/`                      |                                                            |
| **Documentation**        | `docs/solutions/`                      | Missing or misleading documentation                        |
| `documentation_gap`      | `docs/solutions/`                      |                                                            |
| **Developer Experience** | `docs/solutions/developer-experience/` | DX issues, tooling pain points                             |
| `developer_experience`   | `docs/solutions/developer-experience/` |                                                            |
| **Integration**          | `docs/solutions/integrations/`         | Cross-platform/integration bugs or patterns                |
| `integration_issue`      | `docs/solutions/integrations/`         |                                                            |
| **Workflow**             | `docs/solutions/workflow/`             | Workflow friction, process bugs, automation issues         |
| `workflow_issue`         | `docs/solutions/workflow/`             |                                                            |
| **Skill Design**         | `docs/solutions/skill-design/`         | Skill architecture and orchestration patterns              |
| `skill_design`           | `docs/solutions/skill-design/`         |                                                            |
| **Best Practices**       | `docs/solutions/best-practices/`       | Practices that compound effectiveness                      |
| `best_practice`          | `docs/solutions/best-practices/`       |                                                            |
| **Tooling**              | `docs/solutions/`                      | Tool selection and CLI design decisions                    |
| `tooling_decision`       | `docs/solutions/`                      |                                                            |
| **Conventions**          | `docs/solutions/`                      | Decisions about naming, structure, or workflow conventions |
| `convention`             | `docs/solutions/`                      |                                                            |
| **Bugs (defects)**       | `docs/solutions/`                      | Actual defects requiring fixes                             |
| `build_error`            | `docs/solutions/`                      | Build or compilation errors                                |
| `test_failure`           | `docs/solutions/`                      | Test failures                                              |
| `runtime_error`          | `docs/solutions/`                      | Runtime errors                                             |
| `performance_issue`      | `docs/solutions/`                      | Performance problems                                       |
| `database_issue`         | `docs/solutions/`                      | Database-related issues                                    |
| `security_issue`         | `docs/solutions/`                      | Security vulnerabilities                                   |
| `ui_bug`                 | `docs/solutions/`                      | UI bugs or rendering issues                                |
| `logic_error`            | `docs/solutions/`                      | Logic errors                                               |

## Severity Levels

- **critical**: Blocks functionality or poses security risk
- **high**: Major impact, significant user-facing issue
- **medium**: Moderate impact, suboptimal but functional
- **low**: Minor impact, edge case or style issue
- **process**: Documentation, workflow, or tooling improvement (no runtime risk)

## Component Enum

Required but not enforced by validator (strongly recommended for discoverability):

- `bundling` — Plugin build and package management
- `cli` — CLI tools and command-line interface
- `codex-target` — Codex platform integration
- `converter-cli` — Converter CLI and conversion logic
- `development-workflow` — Development workflow and process
- `integrations` — Cross-platform integration patterns
- `marketplace` — Marketplace and package listings
- `markdown-rendering` — Markdown rendering and formatting
- `plugin-development` — Plugin development and maintenance
- `release-automation` — Release automation and versioning
- `skill-design` — Skill architecture and design
- `tooling` — Development tools and utilities

## Module Field

Optional but strongly recommended for discoverability:

- General path format (any string): e.g., `src/converters/`, `plugins/compound-engineering`, `docs/`

## Optional Fields

### Category

Optional general area label (not a path, just a hint for discoverability):

- `best-practices` — Best practice documentation
- `skill-design` — Skill design patterns
- `workflow` — Workflow issues and fixes
- `integrations` — Integration issues
- `developer-experience` — Developer experience improvements

### Bug-Track Extras (Optional on Knowledge Track)

When `problem_type` is a knowledge-track value, these fields are optional:

- **applies_when**: Array of 0-5 conditions where guidance applies
- **root_cause**: String describing the underlying cause
- **symptoms**: Array of 0-5 observable gaps or friction points
- **resolution_type**: String describing the type of change

### Bug-Track Extras (Required on Bug Track)

When `problem_type` is a bug-track value (build_error, test_failure, runtime_error, etc.), these fields are required:

- **root_cause enum**: One of `missing_association`, `missing_include`, `missing_index`, `wrong_api`, `scope_issue`, `thread_violation`, `async_timing`, `memory_leak`, `config_error`, `logic_error`, `test_isolation`, `missing_validation`, `missing_permission`, `missing_workflow_step`, `inadequate_documentation`, `missing_tooling`, `incomplete_setup`
- **resolution_type enum**: One of `code_fix`, `migration`, `config_change`, `test_fix`, `dependency_update`, `environment_setup`, `workflow_improvement`, `documentation_update`, `tooling_addition`, `seed_data_update`

### Bug-Track Extras (Optional on Bug Track)

When `problem_type` is a bug-track value, these fields are optional:

- **symptoms**: Array of 0-5 observable symptoms
- **root_cause**: String or enum (use enum when appropriate)
- **resolution_type**: String or enum (use enum when appropriate)

### Other Optional Fields

- **related_components**: Array of other components involved

## Output Directory Mapping

Each `problem_type` maps to a specific output directory under `docs/solutions/`:

| problem_type                                       | output directory                       |
| -------------------------------------------------- | -------------------------------------- |
| `architecture_pattern`                             | `docs/solutions/`                      |
| `best_practice`                                    | `docs/solutions/best-practices/`       |
| `convention`                                       | `docs/solutions/`                      |
| `design_pattern`                                   | `docs/solutions/`                      |
| `developer_experience`                             | `docs/solutions/developer-experience/` |
| `documentation_gap`                                | `docs/solutions/`                      |
| `integration_issue`                                | `docs/solutions/integrations/`         |
| `skill_design`                                     | `docs/solutions/skill-design/`         |
| `tooling_decision`                                 | `docs/solutions/`                      |
| `workflow_issue`                                   | `docs/solutions/workflow/`             |
| bug-track values (build_error, test_failure, etc.) | `docs/solutions/`                      |

## Validation Rules

1. **Required fields**: `title`, `date` or `created`, `problem_type`, `severity`, `tags` must be present in all docs.
2. **Date format**: `date` must match `YYYY-MM-DD`. `created` may replace `date` for legacy docs.
3. **Enum fields**: Must match allowed values exactly.
4. **Array fields**: Must respect min/max item counts when specified.
5. **tags format**: Should be lowercase and hyphen-separated.
6. **YAML safety**: Array-of-strings fields (`symptoms`, `applies_when`, `tags`, `related_components`) must be wrapped in double quotes when starting with a YAML reserved indicator (``, `[`, `\*`, `&`, `!`, `|`, `>`, `%`, `@`, `?`) or containing the substring `: `.
7. **Bug-track validation**:
   - If `problem_type` is a bug-track value, `symptoms`, `root_cause` (enum), and `resolution_type` (enum) are required.
   - If `problem_type` is a knowledge-track value, these fields are optional (use string form if included).
8. **rails_version**: Not applicable to this project; must not appear in new docs.

## Example Frontmatter

```yaml
---
title: "Adding New Converter Target Providers"
date: 2026-02-23
category: architecture
tags: [converter, target-provider, plugin-conversion, multi-platform, pattern]
created: 2026-02-23
severity: medium
component: converter-cli
problem_type: architecture_pattern
root_cause: architectural_pattern
---
# Adding New Converter Target Providers
...
```

```yaml
---
title: "End-to-end learnings from running the full CE pipeline"
date: 2026-04-17
category: best-practices
module: plugins/compound-engineering
problem_type: best_practice
component: development-workflow
severity: medium
applies_when:
  - Running ce:brainstorm → ce:plan → ce:work → ce:review
  - Orchestrating the full pipeline end-to-end
tags: [compound-engineering, ce-pipeline, workflow, pipeline-discipline]
---
# End-to-end learnings from running the full CE pipeline
...
```
