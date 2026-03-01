# Advanced dbt Testing

Basic dbt tests (`unique`, `not_null`, `accepted_values`, `relationships`) and source freshness configuration are covered by the dbt skill. This reference covers advanced testing patterns.

## dbt-expectations Patterns

The `dbt-expectations` package ports Great Expectations-style assertions into dbt YAML. Install via `packages.yml`:

```yaml
packages:
  - package: calogica/dbt_expectations
    version: ">=0.10.0,<0.11.0"
```

### Column Value Range Assertions

```yaml
models:
  - name: fct_orders
    columns:
      - name: order_total
        data_tests:
          - dbt_expectations.expect_column_values_to_be_between:
              min_value: 0
              max_value: 1000000
              row_condition: "order_status != 'cancelled'"
          - dbt_expectations.expect_column_mean_to_be_between:
              min_value: 50
              max_value: 500
      - name: discount_pct
        data_tests:
          - dbt_expectations.expect_column_values_to_be_between:
              min_value: 0
              max_value: 1
              mostly: 0.99  # Allow 1% tolerance
```

### Pattern Matching

```yaml
columns:
  - name: email
    data_tests:
      - dbt_expectations.expect_column_values_to_match_regex:
          regex: "^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\\.[a-zA-Z0-9-.]+$"
          mostly: 0.98
  - name: phone_number
    data_tests:
      - dbt_expectations.expect_column_values_to_match_regex:
          regex: "^\\+?[1-9]\\d{1,14}$"
```

### Aggregate and Distribution Checks

```yaml
models:
  - name: fct_orders
    data_tests:
      - dbt_expectations.expect_table_row_count_to_be_between:
          min_value: 1000
          max_value: 10000000
      - dbt_expectations.expect_table_row_count_to_equal_other_table:
          compare_model: ref("stg_shopify__orders")
          row_condition: "order_status = 'completed'"
          compare_row_condition: "status = 'completed'"
    columns:
      - name: order_status
        data_tests:
          - dbt_expectations.expect_column_distinct_count_to_be_between:
              min_value: 3
              max_value: 10
          - dbt_expectations.expect_column_proportion_of_unique_values_to_be_between:
              min_value: 0
              max_value: 0.01  # Low cardinality expected
```

### Recency and Freshness

```yaml
models:
  - name: fct_orders
    columns:
      - name: created_at
        data_tests:
          - dbt_expectations.expect_row_values_to_have_recent_data:
              datepart: hour
              interval: 24
          - dbt_expectations.expect_column_values_to_be_increasing:
              sort_column: created_at
              strictly: false
              group_by: [order_source]
```

## Unit Tests (dbt 1.8+)

Unit tests validate transformation logic by providing mock inputs and asserting expected outputs. Use for any model with non-trivial business logic.

### Testing CASE Logic

```yaml
unit_tests:
  - name: test_order_status_classification
    description: Verify order status rollup logic
    model: int_orders_classified
    given:
      - input: ref('stg_shopify__orders')
        rows:
          - {order_id: "A1", status: "fulfilled", refund_status: null}
          - {order_id: "A2", status: "fulfilled", refund_status: "partial"}
          - {order_id: "A3", status: "cancelled", refund_status: null}
          - {order_id: "A4", status: "pending", refund_status: null}
    expect:
      rows:
        - {order_id: "A1", order_class: "completed"}
        - {order_id: "A2", order_class: "partial_refund"}
        - {order_id: "A3", order_class: "cancelled"}
        - {order_id: "A4", order_class: "pending"}
```

### Testing Calculations

```yaml
unit_tests:
  - name: test_revenue_calculation
    description: Verify revenue net of discounts and refunds
    model: int_orders_revenue
    given:
      - input: ref('stg_shopify__orders')
        rows:
          - {order_id: "B1", subtotal: 100.00, discount: 10.00, tax: 9.00, refund_amount: 0.00}
          - {order_id: "B2", subtotal: 200.00, discount: 0.00, tax: 18.00, refund_amount: 50.00}
          - {order_id: "B3", subtotal: 0.00, discount: 0.00, tax: 0.00, refund_amount: 0.00}
    expect:
      rows:
        - {order_id: "B1", net_revenue: 99.00}
        - {order_id: "B2", net_revenue: 168.00}
        - {order_id: "B3", net_revenue: 0.00}
```

### Testing NULL Handling

```yaml
unit_tests:
  - name: test_null_coalesce_logic
    description: Verify NULL handling in customer name assembly
    model: int_customers_named
    given:
      - input: ref('stg_crm__contacts')
        rows:
          - {contact_id: 1, first_name: "Jane", last_name: "Doe", display_name: null}
          - {contact_id: 2, first_name: null, last_name: null, display_name: "JDoe"}
          - {contact_id: 3, first_name: null, last_name: null, display_name: null}
    expect:
      rows:
        - {contact_id: 1, full_name: "Jane Doe"}
        - {contact_id: 2, full_name: "JDoe"}
        - {contact_id: 3, full_name: "Unknown"}
```

### When to Write Unit Tests

- Complex CASE statements with many branches
- Revenue, commission, or financial calculations
- NULL coalescing chains
- Date/timezone transformations
- Any logic where incorrect output passes generic tests (unique/not_null) silently

Run unit tests with `dbt test --select test_type:unit`.

## Contract Enforcement for Public Models

### Minimum Contract for Public Models

Every model with `access: public` should have a contract. This prevents accidental breaking changes to consumers.

```yaml
models:
  - name: fct_orders
    access: public
    group: order-management
    config:
      contract:
        enforced: true
    columns:
      - name: order_id
        data_type: varchar
        description: "Globally unique order identifier"
        constraints:
          - type: not_null
          - type: primary_key
      - name: customer_id
        data_type: varchar
        constraints:
          - type: not_null
      - name: order_total
        data_type: numeric(18,2)
        constraints:
          - type: not_null
          - type: check
            expression: "order_total >= 0"
      - name: order_status
        data_type: varchar
        constraints:
          - type: not_null
      - name: created_at
        data_type: timestamp_tz
        constraints:
          - type: not_null
```

### Contract Violation Behavior

- Contract violations fail during `dbt build` (DDL enforcement), not during `dbt test`
- A model that adds an undeclared column will fail if `contract.enforced: true`
- Column type mismatches fail at build time
- Constraint violations (NOT NULL, CHECK) fail when data violates the constraint

## Cross-Model Assertions (Singular Tests)

### Revenue Reconciliation

```sql
-- tests/assert_revenue_reconciliation.sql
-- Total revenue in facts must match sum of line items
WITH fact_totals AS (
    SELECT SUM(order_total) AS total_from_facts
    FROM {{ ref('fct_orders') }}
    WHERE order_status = 'completed'
),
line_item_totals AS (
    SELECT SUM(line_total) AS total_from_lines
    FROM {{ ref('fct_order_line_items') }}
    WHERE order_status = 'completed'
)
SELECT
    f.total_from_facts,
    l.total_from_lines,
    ABS(f.total_from_facts - l.total_from_lines) AS difference
FROM fact_totals f
CROSS JOIN line_item_totals l
WHERE ABS(f.total_from_facts - l.total_from_lines) > 0.01
```

### Referential Integrity Across Marts

```sql
-- tests/assert_all_orders_have_customers.sql
-- Every order in fct_orders must have a matching customer in dim_customers
SELECT
    o.order_id,
    o.customer_id
FROM {{ ref('fct_orders') }} o
LEFT JOIN {{ ref('dim_customers') }} c
    ON o.customer_id = c.customer_id
WHERE c.customer_id IS NULL
```

### Completeness Check

```sql
-- tests/assert_no_orphaned_line_items.sql
-- Every line item must belong to a valid order
SELECT
    li.line_item_id,
    li.order_id
FROM {{ ref('fct_order_line_items') }} li
LEFT JOIN {{ ref('fct_orders') }} o
    ON li.order_id = o.order_id
WHERE o.order_id IS NULL
```

## Source Freshness Monitoring Patterns

### Tiered Freshness SLAs

```yaml
sources:
  - name: shopify
    loaded_at_field: _fivetran_synced
    freshness:
      warn_after: {count: 6, period: hour}
      error_after: {count: 12, period: hour}
    tables:
      - name: orders
        freshness:
          warn_after: {count: 1, period: hour}   # Tighter SLA for critical tables
          error_after: {count: 3, period: hour}
      - name: products
        freshness:
          warn_after: {count: 24, period: hour}  # Looser SLA for slow-changing data
          error_after: {count: 48, period: hour}
```

### Custom Freshness with Macros

```sql
-- macros/check_freshness.sql
{% macro check_freshness(source_name, table_name, max_hours) %}
    SELECT
        '{{ source_name }}.{{ table_name }}' AS source_table,
        MAX(loaded_at) AS last_loaded,
        DATEDIFF('hour', MAX(loaded_at), CURRENT_TIMESTAMP()) AS hours_since_load
    FROM {{ source(source_name, table_name) }}
    HAVING DATEDIFF('hour', MAX(loaded_at), CURRENT_TIMESTAMP()) > {{ max_hours }}
{% endmacro %}
```

## Elementary Integration with dbt

### Setup

```yaml
# packages.yml
packages:
  - package: elementary-data/elementary
    version: ">=0.16.0,<0.17.0"
```

```bash
dbt deps
dbt run --select elementary  # Create Elementary monitoring tables
```

### Volume and Freshness Monitoring

```yaml
models:
  - name: fct_orders
    data_tests:
      - elementary.volume_anomalies:
          timestamp_column: created_at
          backfill_days: 30
          sensitivity: 3
      - elementary.freshness_anomalies:
          timestamp_column: created_at
          backfill_days: 30
```

### Column-Level Monitoring

```yaml
models:
  - name: fct_orders
    columns:
      - name: order_total
        data_tests:
          - elementary.column_anomalies:
              column_anomalies:
                - mean
                - zero_count
                - null_count
              timestamp_column: created_at
              backfill_days: 30
              sensitivity: 3
```

### Generating Reports

```bash
# Generate HTML report
edr report --open

# Send to Slack
edr send-report \
    --slack-token "${SLACK_TOKEN}" \
    --slack-channel-name data-alerts

# Generate and upload to S3
edr report --output-path s3://data-quality-reports/latest.html
```

## CI/CD Testing Patterns

### What to Run When

| Trigger | Tests to Run | Command |
|---------|-------------|---------|
| Every PR | Unit tests + generic tests on modified models | `dbt build --select state:modified+` |
| Merge to main | Full test suite on all models | `dbt build` |
| Scheduled (hourly) | Source freshness only | `dbt source freshness` |
| Scheduled (daily) | Elementary anomaly detection | `dbt test --select tag:elementary` |
| Post-deploy | Smoke tests on critical models | `dbt test --select tag:critical` |

### CI Pipeline Example

```bash
# .github/workflows/dbt-ci.yml steps
dbt deps
dbt seed --full-refresh

# Build and test only modified models + downstream dependencies
dbt build --select state:modified+ --defer --state ./prod-manifest

# Run source freshness
dbt source freshness

# Run Elementary tests if any monitored models changed
dbt test --select tag:elementary,state:modified+
```

### Tagging Tests for Selective Execution

```yaml
models:
  - name: fct_orders
    config:
      tags: ["critical", "elementary"]
    data_tests:
      - elementary.volume_anomalies:
          timestamp_column: created_at
          tags: ["elementary", "daily"]
    columns:
      - name: order_id
        data_tests:
          - unique:
              tags: ["critical"]
          - not_null:
              tags: ["critical"]
```

```bash
# Run only critical tests
dbt test --select tag:critical

# Run only daily scheduled tests
dbt test --select tag:daily
```

## Test Severity Levels: warn vs error

### Configuration

```yaml
models:
  - name: fct_orders
    columns:
      - name: order_id
        data_tests:
          - unique:
              severity: error  # Blocks pipeline
          - not_null:
              severity: error  # Blocks pipeline
      - name: customer_email
        data_tests:
          - not_null:
              severity: warn   # Logs warning, does not block
          - dbt_expectations.expect_column_values_to_match_regex:
              regex: "^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\\.[a-zA-Z0-9-.]+$"
              severity: warn
              mostly: 0.95
```

### Severity Decision Framework

| Condition | Severity | Rationale |
|-----------|----------|-----------|
| Primary key uniqueness | error | Downstream joins produce duplicates |
| Primary key not_null | error | Downstream joins silently drop rows |
| Foreign key integrity | error | Broken relationships corrupt reports |
| Business metric range | warn | May indicate a real business change, not a bug |
| Email/phone format | warn | Dirty source data should not block pipeline |
| Row count within range | warn | Legitimate volume changes should not block |
| Source freshness | warn (default), error for critical | Stale data is better than no data in most cases |

### Handling Warnings in CI

```bash
# dbt build returns exit code 0 for warnings, 1 for errors
dbt build --select state:modified+

# To also fail on warnings (stricter CI):
dbt build --select state:modified+ --warn-error

# To fail on specific warning types only:
dbt build --select state:modified+ --warn-error-options '{"include": ["NoNodesForSelectionCriteria"]}'
```

Use `--warn-error` in CI only when the team is confident all warnings are actionable. Start without it and upgrade to strict mode as data quality matures.
