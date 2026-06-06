# YAML Frontmatter Schema

`schema.yaml` in this directory is the canonical contract for `docs/solutions/` frontmatter written by `ce-compound`.

## Tracks

| Track | problem_types |
|-------|--------------|
| **Bug** | `build_error`, `test_failure`, `runtime_error`, `performance_issue`, `database_issue`, `security_issue`, `ui_bug`, `integration_issue`, `logic_error` |
| **Knowledge** | `best_practice`, `documentation_gap`, `workflow_issue`, `developer_experience`, `architecture_pattern`, `design_pattern`, `tooling_decision`, `convention` |

## Required Fields (both tracks)

- **module**: Module or area affected
- **date**: ISO date in `YYYY-MM-DD`
- **problem_type**: One of the values listed in the Tracks table
- **component**: One of `rails_model`, `rails_controller`, `rails_view`, `service_object`, `background_job`, `database`, `frontend_stimulus`, `hotwire_turbo`, `email_processing`, `brief_system`, `assistant`, `authentication`, `payments`, `development_workflow`, `testing_framework`, `documentation`, `tooling`
- **severity**: One of `critical`, `high`, `medium`, `low`

## Bug Track Fields

Required:
- **symptoms**: YAML array with 1-5 observable symptoms
- **root_cause**: One of `missing_association`, `missing_include`, `missing_index`, `wrong_api`, `scope_issue`, `thread_violation`, `async_timing`, `memory_leak`, `config_error`, `logic_error`, `test_isolation`, `missing_validation`, `missing_permission`, `missing_workflow_step`, `inadequate_documentation`, `missing_tooling`, `incomplete_setup`
- **resolution_type**: One of `code_fix`, `migration`, `config_change`, `test_fix`, `dependency_update`, `environment_setup`, `workflow_improvement`, `documentation_update`, `tooling_addition`, `seed_data_update`

## Knowledge Track Fields

No additional required fields beyond the shared ones. Optional:
- **applies_when**, **symptoms**, **root_cause**, **resolution_type**

## Optional Fields (both tracks)

- **related_components**, **tags**

## Category Mapping

- `build_error` -> `docs/solutions/build-errors/`
- `test_failure` -> `docs/solutions/test-failures/`
- `runtime_error` -> `docs/solutions/runtime-errors/`
- `performance_issue` -> `docs/solutions/performance-issues/`
- `database_issue` -> `docs/solutions/database-issues/`
- `security_issue` -> `docs/solutions/security-issues/`
- `ui_bug` -> `docs/solutions/ui-bugs/`
- `integration_issue` -> `docs/solutions/integration-issues/`
- `logic_error` -> `docs/solutions/logic-errors/`
- `developer_experience` -> `docs/solutions/developer-experience/`
- `workflow_issue` -> `docs/solutions/workflow-issues/`
- `best_practice` -> `docs/solutions/best-practices/`
- `documentation_gap` -> `docs/solutions/documentation-gaps/`
- `architecture_pattern` -> `docs/solutions/architecture-patterns/`
- `design_pattern` -> `docs/solutions/design-patterns/`
- `tooling_decision` -> `docs/solutions/tooling-decisions/`
- `convention` -> `docs/solutions/conventions/`

## YAML Safety Rules

Strict YAML 1.2 parsers reject array items that start with a reserved indicator character as unquoted scalars. When writing items for any array-of-strings field, wrap the value in double quotes if it starts with any of: `` ` ``, `[`, `*`, `&`, `!`, `|`, `>`, `%`, `@`, `?`. Also quote if the value contains the substring `": "`.
