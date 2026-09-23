# YAML Frontmatter Schema

`schema.yaml` in this directory is the canonical contract for `<root>/solutions/` frontmatter written by `ce-compound`.

Use this file as the quick reference for:
- required fields
- enum values and open-vocabulary defaults
- validation expectations
- category mapping
- track classification (bug vs knowledge)

## Corpus-First Vocabulary

`component` and `root_cause` are open vocabulary, and the category directories are a default layout, not a fixed one. Repos that already hold learnings usually have their own self-consistent values and directory names, and their retrieval (agent instructions, greps, tooling) is keyed on those. A doc written to this file's defaults instead of the repo's vocabulary is a doc the repo cannot find, which defeats the point of writing it.

So, before classifying: when `<root>/solutions/` already contains docs, sample their frontmatter (`component`, `root_cause`, `problem_type`, `tags`) and directory names for this area. For `component`, use the value the corpus's existing docs use for this area (the component/directory grouping this change belongs to). For `root_cause`, match by the cause itself rather than the area: use the value existing docs use for this same underlying cause, wherever in the corpus those docs live — an area's typical root_cause does not carry over to a doc whose verified cause is different. For either field, when the corpus has more than one spelling for the same area (component) or the same cause (root_cause), use the spelling the most docs use (tie: the most recently dated doc); use the schema's suggested default only when no existing doc covers the area (component) or names the cause (root_cause). Reuse corpus values as spelled — do not coin a near-synonym of a value the corpus already uses. Directory choice is a separate condition: file the doc in the existing directory that covers this area; use the Category Mapping below only when no existing directory covers it. `problem_type`, `severity`, and `resolution_type` remain closed enums (`problem_type` drives track selection).

## Tracks

The `problem_type` determines which **track** applies. Each track has different required and optional fields.

| Track | problem_types | Description |
|-------|--------------|-------------|
| **Bug** | `build_error`, `test_failure`, `runtime_error`, `performance_issue`, `database_issue`, `security_issue`, `ui_bug`, `integration_issue`, `logic_error` | Defects and failures that were diagnosed and fixed |
| **Knowledge** | `best_practice`, `documentation_gap`, `workflow_issue`, `developer_experience`, `architecture_pattern`, `design_pattern`, `tooling_decision`, `convention` | Practices, patterns, conventions, decisions, workflow improvements, and documentation. Prefer the narrowest applicable value; `best_practice` is the fallback. |

## Required Fields (both tracks)

- **module**: Module or area affected
- **date**: ISO date in `YYYY-MM-DD`
- **problem_type**: One of the values listed in the Tracks table above
- **component**: Component or area involved — open vocabulary (see Corpus-First Vocabulary). Suggested defaults when the corpus has no value for the area: `data_model`, `api_layer`, `service_layer`, `background_job`, `database`, `frontend`, `messaging`, `infrastructure`, `observability`, `authentication`, `payments`, `development_workflow`, `testing_framework`, `documentation`, `tooling`
- **severity**: One of `critical`, `high`, `medium`, `low`

## Bug Track Fields

Required:
- **symptoms**: YAML array with 1-5 observable symptoms (errors, broken behavior)
- **root_cause**: Fundamental technical cause — open vocabulary (see Corpus-First Vocabulary). Suggested defaults: `wrong_api`, `data_integrity`, `concurrency`, `async_timing`, `memory_leak`, `config_error`, `logic_error`, `test_isolation`, `missing_validation`, `missing_permission`, `missing_workflow_step`, `inadequate_documentation`, `missing_tooling`, `incomplete_setup`
- **resolution_type**: One of `code_fix`, `migration`, `config_change`, `test_fix`, `dependency_update`, `environment_setup`, `workflow_improvement`, `documentation_update`, `tooling_addition`, `seed_data_update`

## Knowledge Track Fields

No additional required fields beyond the shared ones. All fields below are optional:

- **applies_when**: Conditions or situations where this guidance applies
- **symptoms**: Observable gaps or friction that prompted this guidance
- **root_cause**: Underlying cause, if there is a specific one
- **resolution_type**: Type of change, if applicable

## Optional Fields (both tracks)

- **related_components**: Other components involved
- **tags**: Search keywords, lowercase and hyphen-separated

## Optional Fields (bug track only)

- **framework_version**: Framework or runtime name and version the bug was observed on, e.g. `rails 7.1.2` or `node 22.4.0`

## Backward Compatibility

Docs created before the track system may have `symptoms`/`root_cause`/`resolution_type` on knowledge-type problem_types. These are valid legacy docs:

- Bug-track fields present on a knowledge-track doc are harmless. Do not strip them during refresh unless the doc is being rewritten for other reasons.
- Docs written before `component`/`root_cause` became open vocabulary may carry values from the earlier closed list or the earlier `rails_version` field (now `framework_version`). They stay valid, and a corpus that consistently uses them keeps using them.
- When creating **new** docs, follow the track rules above.

## Category Mapping

Default layout for a repo with no existing learnings. When `<root>/solutions/` already has an established directory taxonomy, place the doc in the existing directory that covers this area (the corpus-first rule above) rather than creating a new directory from this table that nothing else uses.

- `build_error` -> `<root>/solutions/build-errors/`
- `test_failure` -> `<root>/solutions/test-failures/`
- `runtime_error` -> `<root>/solutions/runtime-errors/`
- `performance_issue` -> `<root>/solutions/performance-issues/`
- `database_issue` -> `<root>/solutions/database-issues/`
- `security_issue` -> `<root>/solutions/security-issues/`
- `ui_bug` -> `<root>/solutions/ui-bugs/`
- `integration_issue` -> `<root>/solutions/integration-issues/`
- `logic_error` -> `<root>/solutions/logic-errors/`
- `developer_experience` -> `<root>/solutions/developer-experience/`
- `workflow_issue` -> `<root>/solutions/workflow-issues/`
- `best_practice` -> `<root>/solutions/best-practices/`
- `documentation_gap` -> `<root>/solutions/documentation-gaps/`
- `architecture_pattern` -> `<root>/solutions/architecture-patterns/`
- `design_pattern` -> `<root>/solutions/design-patterns/`
- `tooling_decision` -> `<root>/solutions/tooling-decisions/`
- `convention` -> `<root>/solutions/conventions/`

## Validation Rules

1. Determine the track from `problem_type` using the Tracks table.
2. All shared required fields must be present.
3. Bug-track required fields (`symptoms`, `root_cause`, `resolution_type`) must be present on bug-track docs.
4. Knowledge-track docs have no additional required fields beyond the shared ones.
5. Bug-track fields on existing knowledge-track docs are harmless (see Backward Compatibility).
6. Enum fields (`problem_type`, `severity`, `resolution_type`) must match the allowed values exactly.
7. Open-vocabulary fields (`component`, `root_cause`) follow the Corpus-First Vocabulary rule above.
8. Array fields must respect min/max item counts.
9. `date` must match `YYYY-MM-DD`.
10. `framework_version`, if present, only applies to bug-track docs.

## YAML Safety Rules

Strict YAML 1.2 parsers (`yq`, `js-yaml` strict, PyYAML) reject array items
that start with a reserved indicator character as unquoted scalars. When
writing items for any array-of-strings field (`symptoms`, `applies_when`,
`tags`, `related_components`, or any future array field), wrap the value in
double quotes if it starts with any of:

`` ` ``, `[`, `*`, `&`, `!`, `|`, `>`, `%`, `@`, `?`

Also quote if the value contains the substring `": "` — that punctuation
confuses flow-style parsers.

Example — before (breaks strict YAML):

    symptoms:
      - `sudo dscacheutil -flushcache` does not restore in-container mDNS

Example — after (parses cleanly):

    symptoms:
      - "`sudo dscacheutil -flushcache` does not restore in-container mDNS"

This rule applies to all array-of-strings frontmatter fields. Scalar string
fields like `description:` have their own quoting rules (see plugin
`AGENTS.md` under "YAML Frontmatter").
