# dbt Packages

## Tier 1: Essential

### dbt-utils

Core utility macros. Install in every project.

```yaml
# packages.yml
packages:
  - package: dbt-labs/dbt_utils
    version: [">=1.3.0", "<2.0.0"]
```

**Key macros:**
- `generate_surrogate_key` - Consistent hash-based surrogate keys
- `star` - Select all columns except specified ones
- `date_spine` - Generate complete date ranges
- `union_relations` - Union tables with same structure
- `pivot` / `unpivot` - Reshape data
- `get_column_values` - Dynamic column value extraction
- `safe_divide` - Division without divide-by-zero errors

### dbt-expectations

Statistical and pattern validation tests:

```yaml
packages:
  - package: calogica/dbt_expectations
    version: [">=0.10.0", "<0.11.0"]
```

**Key tests:**
- `expect_column_values_to_be_between` - Range validation
- `expect_column_values_to_match_regex` - Pattern matching
- `expect_column_values_to_not_be_null` - Conditional not-null
- `expect_row_values_to_have_recent_data` - Freshness at model level
- `expect_column_proportion_of_unique_values_to_be_between` - Cardinality checks
- `expect_table_row_count_to_be_between` - Row count bounds

### dbt Project Evaluator

Automated best-practice checks for project structure:

```yaml
packages:
  - package: dbt-labs/dbt_project_evaluator
    version: [">=0.9.0", "<0.10.0"]
```

Run with `dbt build --select package:dbt_project_evaluator`. Flags:
- Models without primary key tests
- Direct source references in marts
- Unused models
- Models with too many dependencies
- Missing documentation

## Tier 2: Recommended

### elementary

Data observability and anomaly detection:

```yaml
packages:
  - package: elementary-data/elementary
    version: [">=0.15.0", "<0.16.0"]
```

**Capabilities:**
- Automated anomaly detection (volume, freshness, schema changes)
- Test result dashboard
- Slack/email alerting
- dbt artifacts monitoring

```yaml
# Add elementary tests to models
models:
  - name: fct_orders
    columns:
      - name: order_total
        data_tests:
          - elementary.column_anomalies:
              column_anomalies:
                - zero_count
                - zero_percent
                - average
```

### dbt-date

Date utility macros:

```yaml
packages:
  - package: calogica/dbt_date
    version: [">=0.10.0", "<0.11.0"]
```

**Key macros:** `get_date_dimension` (generate date dim table), `n_days_ago`, `n_months_ago`, `periods_since`, `day_name`, `month_name`

### dbt-audit-helper

Compare model versions during refactoring:

```yaml
packages:
  - package: dbt-labs/dbt_audit_helper
    version: [">=0.11.0", "<0.12.0"]
```

```sql
-- Compare old and new model versions
{{ audit_helper.compare_relations(
    a_relation=ref('fct_orders_v1'),
    b_relation=ref('fct_orders_v2'),
    primary_key='order_id'
) }}
```

## Tier 3: Platform-Specific

### Snowflake

```yaml
packages:
  - package: get-select/dbt_snowflake_query_tags
    version: [">=2.0.0", "<3.0.0"]
```

Automatic query tagging for cost attribution across all dbt-issued queries.

### Configuration

```yaml
# packages.yml - Complete example
packages:
  # Tier 1
  - package: dbt-labs/dbt_utils
    version: [">=1.3.0", "<2.0.0"]
  - package: calogica/dbt_expectations
    version: [">=0.10.0", "<0.11.0"]
  - package: dbt-labs/dbt_project_evaluator
    version: [">=0.9.0", "<0.10.0"]

  # Tier 2
  - package: elementary-data/elementary
    version: [">=0.15.0", "<0.16.0"]
  - package: calogica/dbt_date
    version: [">=0.10.0", "<0.11.0"]

  # Install from git (for private packages)
  # - git: "https://github.com/company/dbt-internal-utils.git"
  #   revision: v1.0.0
```

```bash
# Install packages
dbt deps

# Update packages
dbt deps --upgrade
```

## Package Selection Guidelines

1. **Start with Tier 1** - Every project should have dbt-utils and dbt-expectations
2. **Add dbt_project_evaluator** in CI to enforce best practices
3. **Add elementary** when data reliability becomes critical (production dashboards)
4. **Add audit-helper** during major refactors to verify correctness
5. **Avoid package sprawl** - Each package adds compile time and maintenance burden
6. **Pin version ranges** - Use `[">=X.Y.0", "<X.Z.0"]` to allow patches but not breaking changes
