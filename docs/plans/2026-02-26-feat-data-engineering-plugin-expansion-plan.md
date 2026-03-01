---
title: "feat: Add comprehensive data engineering capabilities"
type: feat
status: completed
date: 2026-02-26
---

# Add Comprehensive Data Engineering Capabilities

## Enhancement Summary

**Deepened on:** 2026-02-26
**Research agents used:** architecture-strategist, code-simplicity-reviewer, pattern-recognition-specialist, performance-oracle, security-sentinel, create-agent-skills expert, dbt-best-practices-researcher, data-quality-researcher, Context7 (dbt, Polars, DuckDB), competitive analysis (Altimate plugin)

### Key Improvements from Deepening
1. **Reduced scope from 14 to 9 components** based on simplicity review -- cut web-scraping (agent-browser exists), dropped polars (Context7 covers it), merged data-model into dbt-scaffold
2. **Added critical security requirements** -- credential handling standards for every skill, parameterized SQL only, dbt profiles.yml must use `env_var()`, Terraform state file protections
3. **Corrected all frontmatter** to match exact codebase patterns (agents: quoted descriptions; skills: unquoted; commands: `disable-model-invocation: true`)
4. **Added competitive differentiation** -- Altimate already has 10 dbt/Snowflake skills; we differentiate with architecture, quality, multi-platform depth, and review agents
5. **Refined context budget analysis** -- projected 69-73% (safe), but existing skill descriptions should be trimmed first

### New Considerations Discovered
- Altimate Data Engineering Skills plugin already covers dbt + Snowflake for Claude Code
- `warehouse-architecture` and `data-quality` should be `user-invocable: false` (background knowledge)
- `duckdb` should use linear SKILL.md (not intake/routing) -- it's a focused tool
- Every SQL skill must use parameterized queries exclusively in all examples
- Agent negative routing examples are critical to prevent misrouting between 8 data-adjacent agents

---

## Overview

Expand the compound-engineering plugin from a web development-focused toolkit into the best Claude Code plugin for data engineers. This adds **6 new skills, 2 new agents, and 1 new command** covering dbt, Snowflake, DuckDB, Databricks, warehouse architecture, and data quality.

**Current state:** 29 agents, 22 commands, 19 skills -- focused on web development (Rails, TypeScript, Python, frontend design). The only data-adjacent components are 3 review agents (`data-integrity-guardian`, `data-migration-expert`, `schema-drift-detector`) targeting application database migrations.

**Target state:** 31 agents, 23 commands, 25 skills -- with deep data engineering coverage spanning the modern data stack.

**Competitive context:** [Altimate Data Engineering Skills](https://github.com/AltimateAI/data-engineering-skills) already provides 7 dbt + 3 Snowflake workflow skills for Claude Code (53% accuracy on ADE-bench). Our differentiation: deeper reference material, warehouse architecture knowledge, data quality frameworks, multi-platform coverage (DuckDB, Databricks), and dedicated review agents.

## Problem Statement / Motivation

Data engineering is one of the fastest-growing engineering disciplines, yet Claude Code plugin support for it is limited to narrow workflow skills. Data engineers need:
- dbt model writing, testing, project structure, and anti-pattern detection
- SQL optimization across Snowflake, DuckDB, and Databricks dialects
- Dimensional modeling (Kimball, Data Vault 2.0, Medallion architecture)
- Data quality frameworks, contracts, and validation
- Local data exploration and prototyping with DuckDB

Adding these capabilities makes the plugin valuable to an entirely new audience while maintaining its existing web development strengths.

## Proposed Solution

### Component Summary (Revised from Deepening)

| Category | Count | Names |
|----------|-------|-------|
| Skills | 6 | `dbt`, `snowflake`, `duckdb`, `databricks`, `warehouse-architecture`, `data-quality` |
| Agents | 2 | `dbt-model-reviewer`, `data-pipeline-reviewer` |
| Commands | 1 | `data-scaffold` |
| Existing agents enhanced | 2 | `performance-oracle` (add warehouse SQL section), `architecture-strategist` (add data warehouse section) |

### What Was Cut (and Why)

| Proposed Component | Decision | Reasoning |
|-------------------|----------|-----------|
| `web-scraping` skill | **Cut** | `agent-browser` skill already exists; web scraping is tangential to data engineering |
| `polars` skill | **Cut** | Single-library skill; Context7 MCP server provides Polars docs on demand (82,933 code snippets available at `/websites/rs_polars_polars`) |
| `sql-query-optimizer` agent | **Merged** | Extend existing `performance-oracle` with a "Warehouse SQL Optimization" section covering Snowflake/DuckDB/Databricks dialects |
| `warehouse-architecture-reviewer` agent | **Merged** | Extend existing `architecture-strategist` with a "Data Warehouse Architecture" section covering star schemas, SCD, medallion patterns |
| `data-model` command | **Merged** | Combined into `data-scaffold` command with type argument: `/data-scaffold dbt`, `/data-scaffold model` |

### Implementation Approach

**Single release, not 4 tiers.** All new components are additive with no breaking changes. No migration risk. Ship everything in one MINOR version bump (v2.36.0).

```
New Skills (6):           New Agents (2):          New Command (1):
──────────────           ──────────────           ──────────────
dbt                      dbt-model-reviewer       data-scaffold
snowflake                data-pipeline-reviewer
duckdb
databricks
warehouse-architecture
data-quality

Enhanced Existing (2):
──────────────────────
performance-oracle      → add warehouse SQL optimization section
architecture-strategist → add data warehouse architecture section
```

## Technical Approach

### Architecture

All new components follow existing plugin patterns:

- **Skills** → `plugins/compound-engineering/skills/{name}/SKILL.md` with `references/` subdirectories
- **Agents** → `plugins/compound-engineering/agents/review/{name}.md` with YAML frontmatter
- **Commands** → `plugins/compound-engineering/commands/{name}.md` with YAML frontmatter

### Pattern Compliance (from pattern-recognition-specialist)

**Agent frontmatter rules:**
- Description MUST be double-quoted (`"..."`)
- Must include "Use when..." or "Use after..." trigger phrase
- Must stay under 190 characters
- Must include `model: inherit`
- Body must have: `<examples>` block (2-3), role statement, review checklist, quick reference, common bugs, output format

**Skill frontmatter rules:**
- Description must NOT be quoted
- Must include trigger keywords and "Use when..." conditions
- No `model` field
- SKILL.md under 500 lines; reference files 5-15KB each, total under 80KB per skill
- References linked as `[file.md](./references/file.md)` -- never backtick references

**Command frontmatter rules:**
- Description must NOT be quoted
- Must include `disable-model-invocation: true` (generates files = side effect)
- Must include `argument-hint`
- Use hyphens, not underscores

### Agent Routing Boundaries

**Critical to avoid overlap with 8 data-adjacent agents after this change:**

| Context | Routes To | NOT To | Signal |
|---------|-----------|--------|--------|
| `.sql` in dbt `models/` directory | `dbt-model-reviewer` | `performance-oracle` | File path contains `models/` + uses `ref()` or `source()` |
| `.sql` in dbt `tests/` directory | `dbt-model-reviewer` | `data-quality` skill | File path contains `tests/` in dbt project |
| `.sql` in `queries/` or standalone warehouse SQL | `performance-oracle` (enhanced) | `dbt-model-reviewer` | No `ref()`/`source()`, standalone SQL |
| Rails migration files | `data-migration-expert` (existing) | `data-pipeline-reviewer` | Ruby file with `ActiveRecord::Migration` |
| Python ETL/ELT pipeline code (Airflow, Dagster, Prefect) | `data-pipeline-reviewer` | `kieran-python-reviewer` | Imports from airflow/dagster/prefect |
| Python general code quality | `kieran-python-reviewer` (existing) | `data-pipeline-reviewer` | No orchestration imports |
| Warehouse DDL, schema design docs | `architecture-strategist` (enhanced) | `schema-drift-detector` | CREATE TABLE/VIEW for warehouse, ERD diagrams |
| Application DB schema changes | `data-integrity-guardian` (existing) | `architecture-strategist` | Rails schema.rb or application migrations |
| dbt macros (Jinja SQL) | `dbt-model-reviewer` | N/A | Files in `macros/` directory |

**Each new agent must include negative routing examples:**
```markdown
<example>
Context: User has a slow Rails query with N+1 issues.
user: "This endpoint loads users with posts and it's slow"
assistant: "I'll use performance-oracle for this application query"
<commentary>Application ORM query, not warehouse SQL. Route to performance-oracle, NOT dbt-model-reviewer.</commentary>
</example>
```

### Security Requirements (from security-sentinel)

**CRITICAL: Create a shared credential handling reference.**

Before implementing any skills, create `plugins/compound-engineering/skills/dbt/references/credential-security.md` (cross-referenced by all data skills) covering:

1. **Never show inline credentials** in any example. Use environment variables exclusively.
2. **dbt profiles.yml** must use `{{ env_var('SNOWFLAKE_PASSWORD') }}` -- never hardcode passwords. Generate profiles.yml in `~/.dbt/`, not project root.
3. **Terraform state files** contain all secrets in plaintext. All Terraform examples must include remote state backend and `.gitignore` with `*.tfstate`, `*.tfvars`, `.terraform/`.
4. **SQL examples** must use parameterized queries exclusively. Never show f-strings, `.format()`, or concatenation in SQL.
5. **Snowflake** authentication: prefer key-pair auth over password auth.
6. **Databricks** authentication: prefer service principal auth.
7. **DuckDB file paths**: warn against user-controlled paths in `read_*` functions.

**Scaffold command security:**
- `.gitignore` must be generated alongside `profiles.yml` (include `profiles.yml`, `target/`, `dbt_packages/`, `logs/`, `*.env`)
- Generate `.env.example` with empty placeholders
- Never offer a "quick start" mode with inline credentials

### Context Budget Analysis (from performance-oracle)

**Current state:** 9,612 chars always-on context (65% budget)

| Component Type | Count | Always-On Impact |
|----------------|-------|-----------------|
| New agents (descriptions) | 2 | ~360 chars |
| New skills (enabled, descriptions) | 4 | ~720 chars (capped at 180 each) |
| New skills (user-invocable: false) | 2 | ~360 chars |
| New command (disabled) | 1 | 0 chars |
| Enhanced existing agents | 2 | 0 chars (body only) |
| **Total new always-on** | | **~1,440 chars** |

**Projected:** ~11,052 chars (~69% budget). Safe.

**Optimization prerequisites (do before adding components):**
- [ ] Trim existing 13 enabled skill descriptions to ~180 chars max (currently avg 317). This reclaims ~1,781 chars.
- [ ] Fix marketplace.json version (shows 2.34.0, should match plugin.json 2.35.0)

**Skills marked `user-invocable: false` (background knowledge, auto-loaded by Claude):**
- `warehouse-architecture` -- reference knowledge, not a standalone action
- `data-quality` -- cross-cutting concern, auto-loaded when testing/validation topics arise

**Skills with intake/routing pattern (broad domain, multiple sub-topics):**
- `dbt` -- 6 reference files, routing by task type
- `snowflake` -- 4 reference files, routing by concern area
- `databricks` -- 4 reference files, routing by service

**Skills with linear pattern (focused tool, direct examples):**
- `duckdb` -- focused tool, direct code examples
- `warehouse-architecture` -- linear reference document
- `data-quality` -- linear reference document

## Implementation Details

### 1. dbt Skill

```yaml
---
name: dbt
description: Write and optimize dbt models, macros, tests, and project configuration. Use when working with dbt Core or dbt Cloud, writing SQL models, creating Jinja macros, configuring incremental strategies, or adding schema tests.
---
```

**Structure:** Intake menu + routing table (follows `dhh-rails-style` pattern)

```
skills/dbt/
├── SKILL.md                           # Intake menu, routing table, essential conventions (~300 lines)
└── references/
    ├── project-structure.md           # Staging/intermediate/marts, naming conventions (~200 lines)
    ├── models.md                      # Materializations, CTEs, model patterns (~250 lines)
    ├── testing.md                     # Generic, singular, unit (1.8+), contract tests (~300 lines)
    ├── jinja.md                       # Macros, generate_schema_name, loops, run_query (~250 lines)
    ├── incremental.md                 # Merge, delete+insert, microbatch (1.9+), anti-patterns (~300 lines)
    └── packages.md                    # dbt-utils, dbt-expectations, elementary, dbt_project_evaluator (~200 lines)
```

**SKILL.md must include:**

Essential conventions (always in context):
- Naming: `stg_<source>__<entity>`, `int_<entity>_<verb>`, `fct_`, `dim_`
- Materialization decision tree: view → table → incremental
- Target version: dbt 1.8+ (note differences for 1.5-1.9 features)
- Security: all `profiles.yml` examples use `{{ env_var() }}`

Intake routing table:
| Task | Reference |
|------|-----------|
| Project setup, model organization | [project-structure.md](./references/project-structure.md) |
| Writing models, materializations | [models.md](./references/models.md) |
| Testing strategy | [testing.md](./references/testing.md) |
| Jinja, macros | [jinja.md](./references/jinja.md) |
| Incremental models | [incremental.md](./references/incremental.md) |
| Packages | [packages.md](./references/packages.md) |

**Key reference content (from dbt best-practices research):**

`references/incremental.md` must cover:
- Strategy selection: merge (unique key, upsert), delete+insert (non-unique keys), microbatch (1.9+, time-series)
- Top 8 incremental mistakes: missing unique_key, NULL in keys, no lookback window, not testing full-refresh, wrong strategy for key cardinality, missing `on_schema_change`, over-engineering simple models, not using microbatch when applicable
- Microbatch pattern (dbt 1.9+): `event_time`, `batch_size`, `lookback`, `begin` -- eliminates manual `is_incremental()` logic

`references/testing.md` must cover:
- 5-tier testing strategy: generic (unique/not_null) → source freshness → dbt-expectations → unit tests (1.8+) → singular tests
- Contract enforcement: `contract: { enforced: true }` for public models
- `data_tests:` key (renamed from `tests:` in 1.8+)

`references/jinja.md` must cover:
- Top 9 macro patterns: `generate_schema_name` override, dynamic pivot, surrogate key, `star()`, date spine, union_relations, grant management, logging, conditional materialization
- Version detection: `{% if dbt_version >= '1.9.0' %}`

`references/packages.md` must cover:
- Tier 1 (essential): dbt-utils, dbt-expectations, dbt_project_evaluator
- Tier 2 (recommended): elementary, dbt-date, dbt-audit-helper
- Tier 3 (Snowflake-specific): dbt-snowflake-utils, snowflake_spend

**dbt Mesh / cross-project patterns:**
- Groups and access levels (`public`, `protected`, `private`)
- Model contracts for public models
- Cross-project refs: `{{ ref('finance_project', 'fct_revenue') }}`
- Model versioning for breaking changes

**Snowflake-specific dbt patterns (cross-reference with snowflake skill):**
- Dynamic tables: `materialized='dynamic_table'` with `target_lag`
- Transient tables (default in dbt): set `transient: false` only for critical marts
- Warehouse routing: `+snowflake_warehouse` per model/layer
- Query tags for cost attribution: `+query_tag: 'dbt_{{ model.name }}'`
- Copy grants: `+copy_grants: true`
- Python models with Snowpark

### 2. Snowflake Skill

```yaml
---
name: snowflake
description: Write optimized Snowflake SQL, configure warehouses, and manage access control. Use when writing Snowflake queries, tuning performance, designing clustering keys, working with semi-structured data, or configuring roles and grants.
---
```

**Structure:** Intake menu + routing table

```
skills/snowflake/
├── SKILL.md                           # Core SQL patterns, routing table (~250 lines)
└── references/
    ├── sql-patterns.md                # QUALIFY, FLATTEN, semi-structured, dot notation (~250 lines)
    ├── optimization.md                # Clustering, search optimization, materialized views, QAS (~200 lines)
    ├── cost-management.md             # Credits, auto-suspend, resource monitors, warehouse sizing (~200 lines)
    └── terraform.md                   # Provider v2.0+, roles, grants, warehouses (~200 lines)
```

**Security requirements:**
- All connection examples use environment variables, never inline credentials
- Prefer key-pair authentication over password auth
- Terraform examples include remote state backend
- `.gitignore` template for Terraform included

### 3. DuckDB Skill

```yaml
---
name: duckdb
description: Query local files and databases with DuckDB SQL and extensions. Use when reading Parquet, CSV, or JSON files with DuckDB, writing analytical queries, using ASOF JOIN or PIVOT, or performing local data exploration without a server.
---
```

**Structure:** Linear SKILL.md (focused tool, direct examples like `gemini-imagegen`)

```
skills/duckdb/
├── SKILL.md                           # Core patterns + quick reference (~350 lines)
└── references/
    ├── file-querying.md               # Parquet, CSV, JSON, HTTP, hive partitioning (~200 lines)
    ├── sql-extensions.md              # ASOF JOIN, PIVOT/UNPIVOT, QUALIFY, list comprehensions (~200 lines)
    └── integration.md                 # DuckDB + dbt adapter, DuckDB + Polars, DuckDB + Arrow (~150 lines)
```

**Cross-platform section:** Document DuckDB as local dbt development adapter, known dialect differences with Snowflake (`LATERAL FLATTEN` vs `UNNEST`, `TRY_CAST` behavior).

**Security:** Warn against user-controlled file paths in `read_*` functions.

### 4. Databricks Skill

```yaml
---
name: databricks
description: Build Databricks notebooks, Spark SQL queries, and Delta Lake pipelines. Use when working with Databricks workspaces, writing PySpark or Spark SQL, configuring Delta Lake tables, or managing Unity Catalog assets.
---
```

**Structure:** Intake menu + routing table

```
skills/databricks/
├── SKILL.md                           # Core patterns, routing (~250 lines)
└── references/
    ├── delta-lake.md                  # MERGE, OPTIMIZE, time travel, Liquid Clustering (~250 lines)
    ├── unity-catalog.md               # Three-level namespace, permissions, governance (~200 lines)
    ├── spark-optimization.md          # AQE, broadcast, shuffle, caching (~200 lines)
    └── terraform.md                   # Provider patterns, jobs, clusters (~200 lines)
```

**Key content:**
- Liquid Clustering replaces Z-ORDER for new tables (DBR 13.3+)
- Delta Lake operations: MERGE INTO, OPTIMIZE, time travel, RESTORE
- Unity Catalog: `catalog.schema.table` namespace
- Security: use service principal auth, never inline tokens

### 5. Warehouse Architecture Skill

```yaml
---
name: warehouse-architecture
description: Data warehouse design patterns including star schema, Data Vault 2.0, medallion architecture, and slowly changing dimensions. Use when designing fact and dimension tables, choosing modeling methodology, or evaluating architecture trade-offs.
user-invocable: false
---
```

**Structure:** Linear background knowledge document (auto-loaded by Claude)

```
skills/warehouse-architecture/
├── SKILL.md                           # Pattern selection decision tree, overview (~300 lines)
└── references/
    ├── kimball.md                     # Star schema, fact/dimension, conformed dimensions (~250 lines)
    ├── data-vault.md                  # Hubs, links, satellites, DV 2.0 with dbt (~250 lines)
    ├── medallion.md                   # Bronze/silver/gold, mapping to dbt layers, open table formats (~200 lines)
    └── scd.md                         # SCD types 1-6, dbt snapshots, OBT pattern (~200 lines)
```

**Must include:**
- Pattern selection decision tree (when to use Kimball vs Data Vault vs Medallion)
- Medallion ↔ dbt layer mapping: bronze = staging, silver = intermediate, gold = marts
- The 2025 hybrid pattern: Data Vault 2.0 in silver layer, Kimball star schemas in gold layer
- OBT as consumption layer (downstream derivative, not primary model)
- Activity Schema standard overview
- Apache Iceberg vs Delta Lake vs Hudi comparison

### 6. Data Quality Skill

```yaml
---
name: data-quality
description: Data validation, schema testing, anomaly detection, and data contract patterns across any warehouse platform. Use when writing data assertions, designing quality checks, implementing data contracts, or monitoring data freshness.
user-invocable: false
---
```

**Structure:** Linear background knowledge document (auto-loaded by Claude)

```
skills/data-quality/
├── SKILL.md                           # Decision framework, top 5 quality issues (~300 lines)
└── references/
    ├── tool-decision-matrix.md        # Pandera vs GX vs dbt tests vs Soda (~200 lines)
    ├── data-contracts.md              # ODCS template, enforcement patterns, schema evolution (~250 lines)
    ├── anomaly-detection.md           # Z-score, percentage thresholds, Elementary (~200 lines)
    └── dbt-testing-advanced.md        # Beyond basics: expectations, unit tests, contract enforcement (~200 lines)
```

**Tool priority (from data-quality research):**
1. **Pandera** -- primary for Python DataFrame validation (pandas + Polars)
2. **dbt tests + contracts** -- primary for warehouse-native validation
3. **Soda Core / SodaCL** -- human-readable YAML checks, lightweight data contracts
4. **Great Expectations** -- full production environments needing alerting/documentation
5. **Pydantic** -- boundary validation (API inputs, configs, JSON), NOT DataFrames

**Top 5 data quality issues to address:**
1. Silent upstream schema changes (31% of teams)
2. Duplicate/missing rows from pipeline failures
3. NULL propagation through joins
4. Data freshness / staleness
5. Type coercion and precision loss

**Boundary with dbt skill:** dbt-native tests (`unique`, `not_null`, `relationships`, `accepted_values`, unit tests) are covered by the `dbt` skill. This skill covers cross-platform quality frameworks, data contracts, and non-dbt tools.

### 7. dbt-model-reviewer Agent

```yaml
---
name: dbt-model-reviewer
description: "Reviews dbt models for SQL quality, ref/source usage, materialization strategy, and testing coverage. Use after writing or modifying dbt models."
model: inherit
---
```

**Location:** `agents/review/dbt-model-reviewer.md`

**Required body structure:**

```markdown
<examples>
<example>
Context: User writes a new staging model.
user: "Review this new staging model for stripe payments"
assistant: "I'll use dbt-model-reviewer to check naming, ref usage, materializations, and test coverage"
<commentary>dbt model in models/ directory with source() reference. Route to dbt-model-reviewer.</commentary>
</example>
<example>
Context: User has a slow Rails query with N+1 issues.
user: "This endpoint loads users with their posts and it's slow"
assistant: "I'll use performance-oracle for this application query optimization"
<commentary>Application ORM query, not dbt model. Route to performance-oracle, NOT dbt-model-reviewer.</commentary>
</example>
</examples>
```

**Review checklist (top 10 anti-patterns from research):**
- [ ] Naming conventions: `stg_`, `int_`, `fct_`, `dim_` prefixes with double-underscore source separation
- [ ] Source references only in staging models (`{{ source() }}`); downstream uses `{{ ref() }}`
- [ ] No hardcoded schema/database names -- use `{{ target.schema }}` or config
- [ ] Materialization appropriate for model size and update frequency
- [ ] Incremental models: `unique_key` set, `is_incremental()` guard, `on_schema_change` configured
- [ ] Schema YAML: descriptions for all models and key columns
- [ ] Primary key tests: `unique` + `not_null` on every model's primary key
- [ ] No `SELECT *` in staging models (explicit column selection for documentation)
- [ ] CTEs preferred over subqueries; extract to intermediate models if >10 CTEs
- [ ] Tags and docs present for orchestration and discoverability
- [ ] No fan-out without intermediate layer (one staging model feeding 10+ downstream)
- [ ] Source freshness configured with explicit `loaded_at_field`

**Quick reference SQL:** correct `ref()`/`source()` patterns, incremental model skeleton, schema.yml test block

**Common bugs to catch:** swapped unique_key columns, NULL in unique_key, missing lookback in incremental filter, `current_timestamp()` instead of `max(col)` for incremental, `on_schema_change` not set

### 8. data-pipeline-reviewer Agent

```yaml
---
name: data-pipeline-reviewer
description: "Reviews data pipeline code for reliability, idempotency, error handling, and credential safety. Use when building or modifying ETL/ELT pipelines."
model: inherit
---
```

**Location:** `agents/review/data-pipeline-reviewer.md`

**Required body structure:**

```markdown
<examples>
<example>
Context: User writes an Airflow DAG for data ingestion.
user: "Review this DAG that loads data from our API into Snowflake"
assistant: "I'll use data-pipeline-reviewer to check idempotency, error handling, and credential safety"
<commentary>Airflow DAG with data orchestration. Route to data-pipeline-reviewer.</commentary>
</example>
<example>
Context: User has a general Python code quality concern.
user: "Review this Python utility function for processing strings"
assistant: "I'll use kieran-python-reviewer for general Python code quality"
<commentary>General Python code, not data pipeline. Route to kieran-python-reviewer, NOT data-pipeline-reviewer.</commentary>
</example>
</examples>
```

**Review checklist:**
- [ ] Idempotency: can the pipeline re-run safely without creating duplicates?
- [ ] Error handling: retries with exponential backoff, dead letter queues
- [ ] Backfill capability: can it process historical data ranges?
- [ ] Data validation at boundaries (input validation before loading)
- [ ] Incremental vs full-refresh patterns appropriate for data volume
- [ ] Secret management: no hardcoded credentials (check for AWS keys `AKIA*`, tokens, connection strings with embedded passwords)
- [ ] Logging and observability: structured logs, metrics, alerting hooks
- [ ] Resource cleanup: temporary tables/files cleaned up after pipeline completes
- [ ] Timeout configuration: SLA-aware timeouts set

**Credential detection patterns:**
- dbt `profiles.yml` not in project root (should be in `~/.dbt/`)
- `password:` or `token:` not wrapped in `env_var()` in dbt configs
- `Connection()` objects with inline credentials (Airflow)
- `spark.conf.set("spark.hadoop.fs.s3a.access.key", "AKIA...")` patterns
- Connection strings with embedded passwords: `://user:pass@host`
- Docker Compose `environment:` sections with inline secrets

### 9. data-scaffold Command

```yaml
---
name: data-scaffold
description: Scaffold dbt models or dimensional data models from source descriptions
argument-hint: "[dbt source.table | model business-domain]"
disable-model-invocation: true
allowed-tools: Read, Write, Bash(dbt *), Grep, Glob
---
```

**Location:** `commands/data-scaffold.md`

**Workflow (dbt mode -- `/data-scaffold dbt stripe.payments`):**
1. Parse `$ARGUMENTS` to identify source and table
2. Check for existing `dbt_project.yml` and source definitions
3. Generate staging model: `stg_<source>__<entity>.sql` with `{{ source() }}` reference
4. Generate `_<source>__models.yml` with column descriptions and `unique`/`not_null` tests
5. Generate `_<source>__sources.yml` with source definition and freshness config
6. Suggest intermediate and mart model structure
7. **Security:** generate `profiles.yml` in `~/.dbt/` with `{{ env_var() }}` wrappers, generate `.gitignore` excluding `profiles.yml`, `target/`, `dbt_packages/`, `logs/`, `*.env`
8. Run `dbt compile` to validate

**Workflow (model mode -- `/data-scaffold model e-commerce orders`):**
1. Parse `$ARGUMENTS` to understand business domain
2. Ask clarifying questions (grain, key business processes, source systems)
3. Propose architecture pattern (Kimball star, Data Vault, Medallion)
4. Generate ERD as Mermaid diagram
5. Generate dbt model SQL for each entity
6. Generate schema YAML with tests and descriptions

### 10. Enhance Existing Agents

**`agents/review/performance-oracle.md` -- add warehouse SQL section:**

Add a new section covering:
- Snowflake: clustering keys, micro-partition pruning, warehouse sizing, EXPLAIN plan reading
- DuckDB: memory management, parallelism, file format optimization
- Databricks: shuffle reduction, broadcast joins, Liquid Clustering, AQE
- Cross-dialect: unnecessary DISTINCT, missing predicate pushdown, correlated subqueries
- Cost estimation: Snowflake credit impact, Databricks DBU consumption

**`agents/review/architecture-strategist.md` -- add data warehouse section:**

Add a new section covering:
- Grain definition clarity (one row per what?)
- Conformed dimensions across fact tables
- Appropriate SCD strategy for each dimension
- Medallion layer boundaries (no business logic in bronze)
- Star schema vs snowflake schema trade-offs
- Referential integrity patterns

## Acceptance Criteria

### Functional Requirements

- [x] All 6 skills have SKILL.md with proper frontmatter (name matches directory, unquoted description with triggers)
- [x] All skills with reference files use proper markdown links `[file.md](./references/file.md)`
- [x] All 2 agents have proper frontmatter (name, quoted description under 190 chars, `model: inherit`)
- [x] All 2 agents have `<examples>` blocks with positive AND negative routing examples
- [x] Command has `disable-model-invocation: true` and `argument-hint`
- [x] `warehouse-architecture` and `data-quality` skills have `user-invocable: false`
- [x] Every SQL example uses parameterized queries (no f-strings, `.format()`, or concatenation)
- [x] dbt `profiles.yml` examples always use `{{ env_var() }}` wrappers
- [x] Terraform examples include remote state backend and `.gitignore`
- [x] Each platform skill includes version targeting information
- [x] `performance-oracle` enhanced with warehouse SQL section
- [x] `architecture-strategist` enhanced with data warehouse section

### Non-Functional Requirements

- [ ] Total context budget stays under 80% (projected ~69%)
- [ ] New agent descriptions under 190 characters
- [ ] New skill descriptions capped at 180 characters
- [ ] Reference files 5-15KB each, total under 80KB per skill
- [ ] SKILL.md files under 500 lines

### Quality Gates

- [x] Component counts updated in plugin.json, marketplace.json, and README.md (all 3 match)
- [x] marketplace.json version matches plugin.json
- [x] Version bumped to 2.36.0 in both files
- [x] CHANGELOG.md updated with all additions under `### Added`
- [ ] `/release-docs` run to regenerate documentation site
- [x] JSON files validated with `jq`
- [x] All reference file links verified (no broken markdown links)
- [ ] Existing enabled skill descriptions trimmed to ~180 chars (prerequisite optimization)

## Risk Analysis & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Context budget exceeded | Low | High | Projected 69%; trim existing descriptions first; mark 2 skills user-invocable: false |
| Agent routing confusion (8 data-adjacent agents) | Medium | Medium | Negative routing examples in each agent; test 20+ prompts before release |
| Credential exposure in examples | High | Critical | Mandatory security reference; all SQL parameterized; env_var() in profiles.yml |
| Stale content (dbt versions change) | Low | Medium | Version-pin all content; dbt 1.8+ as baseline |
| Overlap with Altimate plugin | Medium | Low | Differentiate on depth (architecture, quality, multi-platform) not breadth |
| SQL injection in skill examples | Medium | Critical | Every SQL example uses `?` or `%s` parameters; security review before merge |

## Intentionally Deferred

1. **Orchestration skill** (Airflow, Dagster, Prefect) -- large scope, framework-specific
2. **Streaming/real-time** (Kafka, Flink, CDC) -- different paradigm from batch
3. **Data governance** (Atlan, DataHub, OpenMetadata) -- tooling fragmented
4. **Semantic layer** (dbt Semantic Layer, Cube.js) -- still maturing
5. **`/data-lfg` workflow command** -- wait until skills are validated
6. **Dedicated IaC skill** -- Terraform patterns embedded in platform skills for now
7. **Polars skill** -- Context7 MCP server provides documentation on demand
8. **Web scraping skill** -- `agent-browser` skill already exists
9. **`agents/data/` category** -- consider when data agents exceed 10 total (currently 5 existing + 2 new = 7)

## References & Research

### Internal References

- Plugin structure: `plugins/compound-engineering/.claude-plugin/plugin.json`
- Agent pattern: `plugins/compound-engineering/agents/review/data-migration-expert.md`
- Skill pattern with references: `plugins/compound-engineering/skills/dhh-rails-style/SKILL.md`
- Skill creator spec: `plugins/compound-engineering/skills/create-agent-skills/SKILL.md`
- Update checklist: `CLAUDE.md` → "Updating the Compounding Engineering Plugin"
- Context budget learning: `CHANGELOG.md` v2.31.0
- Versioning requirements: `docs/solutions/plugin-versioning-requirements.md`
- Existing rclone credential issue: `plugins/compound-engineering/skills/rclone/SKILL.md` (lines 57-71, inline credentials)

### External References

- dbt Best Practices: https://docs.getdbt.com/best-practices/how-we-structure/1-guide-overview
- dbt Unit Tests (1.8+): https://docs.getdbt.com/docs/build/unit-tests
- dbt Incremental Strategies: https://docs.getdbt.com/docs/build/incremental-strategy
- dbt Microbatch (1.9+): https://docs.getdbt.com/docs/build/incremental-microbatch
- dbt Model Contracts: https://docs.getdbt.com/docs/mesh/govern/model-contracts
- dbt Mesh: https://docs.getdbt.com/best-practices/how-we-mesh/mesh-4-implementation
- dbt Project Evaluator: https://github.com/dbt-labs/dbt-project-evaluator
- Snowflake FLATTEN: https://docs.snowflake.com/en/sql-reference/functions/flatten
- Snowflake Clustering: https://docs.snowflake.com/en/user-guide/tables-clustering-keys
- Snowflake Terraform v2.0: https://registry.terraform.io/providers/Snowflake-Labs/snowflake/latest
- DuckDB Documentation: https://duckdb.org/docs/stable/
- Databricks Delta Lake: https://docs.databricks.com/aws/en/delta/best-practices
- Databricks Liquid Clustering: https://docs.databricks.com/aws/en/delta/clustering
- Open Data Contract Standard (ODCS): https://github.com/bitol-io/open-data-contract-standard
- Great Expectations: https://docs.greatexpectations.io/
- Pandera: https://pandera.readthedocs.io/
- Elementary: https://www.elementary-data.com/
- Altimate Data Engineering Skills: https://github.com/AltimateAI/data-engineering-skills
- MetaOps dbt Anti-Patterns: https://metaops.solutions/blog/dbt-anti-patterns

### Context7 Library IDs (for reference lookups)

- dbt docs: `/dbt-labs/docs.getdbt.com` (12,640 snippets, benchmark 91)
- dbt-utils: `/dbt-labs/dbt-utils` (125 snippets, benchmark 80.3)
- dbt Project Evaluator: `/dbt-labs/dbt-project-evaluator` (64 snippets, benchmark 78.5)
- Polars: `/websites/pola_rs` (35,264 snippets, benchmark 86.8)
- DuckDB: `/websites/duckdb` (24,204 snippets, benchmark 80.9)
