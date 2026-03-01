---
name: dbt
description: Write and optimize dbt models, macros, tests, and project configuration. Use when working with dbt Core or dbt Cloud, writing SQL models, creating Jinja macros, configuring incremental strategies, or adding schema tests.
---

# dbt

Build reliable, well-tested data transformations with dbt. This skill covers project structure, model patterns, testing, macros, incremental strategies, and packages for dbt 1.8+.

## Essential Conventions

**Naming:**
- Staging: `stg_<source>__<entity>.sql` (double underscore separates source from entity)
- Intermediate: `int_<entity>_<verb>.sql`
- Facts: `fct_<entity>.sql`
- Dimensions: `dim_<entity>.sql`

**Materialization decision tree:**
1. Start with `view` (default, zero storage cost)
2. Use `table` when downstream queries are slow or model is queried directly
3. Use `incremental` when data volume makes full refresh impractical (>1M rows or >60s build)

**Source references:**
- `{{ source() }}` only in staging models
- `{{ ref() }}` everywhere else (never hardcode schema or database names)

**Target version:** dbt 1.8+ (note differences for 1.5-1.9 features)

**Security:** All `profiles.yml` examples must use `{{ env_var('SECRET_NAME') }}`. Never hardcode credentials. Generate profiles in `~/.dbt/`, not in project root.

<intake>
What are you working on?

1. **Project Setup** - Directory layout, naming conventions, model organization
2. **Models** - Materializations, CTEs, staging/intermediate/marts patterns
3. **Testing** - Generic, singular, unit (1.8+), contract tests, source freshness
4. **Jinja & Macros** - Custom macros, generate_schema_name, loops, run_query
5. **Incremental Models** - Merge, delete+insert, microbatch (1.9+), anti-patterns
6. **Packages** - dbt-utils, dbt-expectations, elementary, project evaluator

**Specify a number or describe your task.**
</intake>

<routing>

| Response | Reference to Read |
|----------|-------------------|
| 1, project, setup, naming, directory, organization | [project-structure.md](./references/project-structure.md) |
| 2, model, materialization, CTE, staging, mart | [models.md](./references/models.md) |
| 3, test, testing, freshness, contract, unit test | [testing.md](./references/testing.md) |
| 4, jinja, macro, generate_schema_name, loop | [jinja.md](./references/jinja.md) |
| 5, incremental, merge, microbatch, is_incremental | [incremental.md](./references/incremental.md) |
| 6, package, dbt-utils, dbt-expectations, elementary | [packages.md](./references/packages.md) |

**After reading relevant references, apply patterns to the user's dbt code.**
</routing>

<quick_reference>
## Model Skeleton

```sql
-- models/staging/stripe/stg_stripe__payments.sql
with source as (
    select * from {{ source('stripe', 'payments') }}
),

renamed as (
    select
        id as payment_id,
        amount_cents,
        currency,
        status,
        created_at
    from source
)

select * from renamed
```

## Schema YAML

```yaml
# models/staging/stripe/_stripe__models.yml
models:
  - name: stg_stripe__payments
    description: Cleaned Stripe payments with renamed columns
    columns:
      - name: payment_id
        description: Primary key
        data_tests:
          - unique
          - not_null
```

## Incremental Skeleton

```sql
{{
    config(
        materialized='incremental',
        unique_key='event_id',
        on_schema_change='append_new_columns'
    )
}}

select
    event_id,
    event_type,
    event_timestamp
from {{ ref('stg_analytics__events') }}

{% if is_incremental() %}
where event_timestamp > (select max(event_timestamp) from {{ this }})
{% endif %}
```

## dbt Mesh (Cross-Project)

```yaml
# Public model with contract
models:
  - name: fct_revenue
    access: public
    group: finance
    config:
      contract:
        enforced: true
    columns:
      - name: revenue_id
        data_type: varchar
        data_tests:
          - unique
          - not_null
```

```sql
-- Cross-project reference
select * from {{ ref('finance_project', 'fct_revenue') }}
```
</quick_reference>

<snowflake_patterns>
## Snowflake-Specific dbt Patterns

**Dynamic tables:** `materialized='dynamic_table'` with `target_lag` (Snowflake-managed refresh)

**Transient tables:** Default in dbt-snowflake. Set `transient: false` only for critical marts.

**Warehouse routing per layer:**
```yaml
# dbt_project.yml
models:
  my_project:
    staging:
      +snowflake_warehouse: TRANSFORM_XS
    intermediate:
      +snowflake_warehouse: TRANSFORM_S
    marts:
      +snowflake_warehouse: TRANSFORM_M
```

**Query tags for cost attribution:**
```yaml
+query_tag: 'dbt_{{ model.name }}'
```

**Copy grants:** `+copy_grants: true` to preserve downstream grants on rebuild.
</snowflake_patterns>

<reference_index>
## Detailed Reference Files

| File | Topics |
|------|--------|
| [project-structure.md](./references/project-structure.md) | Directory layout, naming, model organization, YAML conventions |
| [models.md](./references/models.md) | Materializations, CTEs, staging/intermediate/marts, Python models |
| [testing.md](./references/testing.md) | Generic, singular, unit tests, contracts, source freshness |
| [jinja.md](./references/jinja.md) | Macros, generate_schema_name, loops, run_query, version detection |
| [incremental.md](./references/incremental.md) | Strategies, microbatch, anti-patterns, lookback windows |
| [packages.md](./references/packages.md) | dbt-utils, dbt-expectations, elementary, project evaluator |
</reference_index>
