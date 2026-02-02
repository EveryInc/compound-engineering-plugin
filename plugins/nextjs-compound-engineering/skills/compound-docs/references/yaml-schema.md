# YAML Frontmatter Schema

**See `.claude/skills/codify-docs/schema.yaml` for the complete schema specification.**

## Required Fields

- **module** (string): Module name (e.g., "Authentication") or "System" for system-wide issues
- **date** (string): ISO 8601 date (YYYY-MM-DD)
- **problem_type** (enum): One of [build_error, test_failure, runtime_error, performance_issue, database_issue, security_issue, ui_bug, integration_issue, logic_error, developer_experience, workflow_issue, best_practice, documentation_gap]
- **component** (enum): One of [server_component, client_component, route_handler, server_action, middleware, database, react_hook, api_route, layout, authentication, payments, development_workflow, testing_framework, documentation, tooling]
- **symptoms** (array): 1-5 specific observable symptoms
- **root_cause** (enum): One of [missing_relation, missing_join, missing_index, wrong_api, scope_issue, hydration_mismatch, async_timing, memory_leak, config_error, logic_error, test_isolation, missing_validation, missing_permission, missing_workflow_step, inadequate_documentation, missing_tooling, incomplete_setup, boundary_error]
- **resolution_type** (enum): One of [code_fix, migration, config_change, test_fix, dependency_update, environment_setup, workflow_improvement, documentation_update, tooling_addition, seed_data_update]
- **severity** (enum): One of [critical, high, medium, low]

## Optional Fields

- **nextjs_version** (string): Next.js version in X.Y.Z format
- **tags** (array): Searchable keywords (lowercase, hyphen-separated)

## Validation Rules

1. All required fields must be present
2. Enum fields must match allowed values exactly (case-sensitive)
3. symptoms must be YAML array with 1-5 items
4. date must match YYYY-MM-DD format
5. nextjs_version (if provided) must match X.Y.Z format
6. tags should be lowercase, hyphen-separated

## Example

```yaml
---
module: Data Layer
date: 2026-01-12
problem_type: performance_issue
component: server_component
symptoms:
  - "N+1 query when loading user posts"
  - "Page load taking >3 seconds"
root_cause: missing_join
nextjs_version: 16.0.0
resolution_type: code_fix
severity: high
tags: [n-plus-one, drizzle, performance]
---
```

## Category Mapping

Based on `problem_type`, documentation is filed in:

- **build_error** → `docs/solutions/build-errors/`
- **test_failure** → `docs/solutions/test-failures/`
- **runtime_error** → `docs/solutions/runtime-errors/`
- **performance_issue** → `docs/solutions/performance-issues/`
- **database_issue** → `docs/solutions/database-issues/`
- **security_issue** → `docs/solutions/security-issues/`
- **ui_bug** → `docs/solutions/ui-bugs/`
- **integration_issue** → `docs/solutions/integration-issues/`
- **logic_error** → `docs/solutions/logic-errors/`
- **developer_experience** → `docs/solutions/developer-experience/`
- **workflow_issue** → `docs/solutions/workflow-issues/`
- **best_practice** → `docs/solutions/best-practices/`
- **documentation_gap** → `docs/solutions/documentation-gaps/`
