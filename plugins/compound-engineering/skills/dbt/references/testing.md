# dbt Testing

## 5-Tier Testing Strategy

| Tier | Type | Purpose | When to Add |
|------|------|---------|-------------|
| 1 | Generic tests | Primary key integrity | Every model |
| 2 | Source freshness | Data pipeline monitoring | Every source |
| 3 | dbt-expectations | Column-level validation | Key business columns |
| 4 | Unit tests (1.8+) | Logic validation | Complex transforms |
| 5 | Singular tests | Custom business rules | Cross-model assertions |

## Tier 1: Generic Tests

Every model must have `unique` + `not_null` on its primary key:

```yaml
# models/staging/stripe/_stripe__models.yml
models:
  - name: stg_stripe__payments
    description: Cleaned Stripe payments
    columns:
      - name: payment_id
        description: Primary key
        data_tests:        # Key renamed from `tests:` in dbt 1.8+
          - unique
          - not_null
      - name: payment_status
        data_tests:
          - accepted_values:
              values: ['succeeded', 'failed', 'pending', 'refunded']
      - name: order_id
        data_tests:
          - not_null
          - relationships:
              to: ref('stg_shopify__orders')
              field: order_id
```

**Built-in generic tests:**
- `unique` - No duplicate values
- `not_null` - No NULL values
- `accepted_values` - Column only contains specified values
- `relationships` - Referential integrity to another model

## Tier 2: Source Freshness

```yaml
sources:
  - name: stripe
    loaded_at_field: _fivetran_synced
    freshness:
      warn_after: {count: 12, period: hour}
      error_after: {count: 24, period: hour}
    tables:
      - name: payments
        loaded_at_field: _fivetran_synced  # Override at table level if needed
```

Run with `dbt source freshness`. Integrate into CI/CD to catch stale data before transformations run.

## Tier 3: dbt-expectations

Column-level statistical and pattern validation:

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
          - dbt_expectations.expect_column_values_to_not_be_null:
              row_condition: "order_status = 'completed'"
      - name: email
        data_tests:
          - dbt_expectations.expect_column_values_to_match_regex:
              regex: "^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\\.[a-zA-Z0-9-.]+$"
      - name: created_at
        data_tests:
          - dbt_expectations.expect_row_values_to_have_recent_data:
              datepart: day
              interval: 1
```

## Tier 4: Unit Tests (dbt 1.8+)

Test transformation logic with mock inputs and expected outputs:

```yaml
# models/staging/stripe/_stripe__models.yml
unit_tests:
  - name: test_payment_status_mapping
    description: Verify payment status mapping logic
    model: stg_stripe__payments
    given:
      - input: ref('raw_stripe_payments')
        rows:
          - {id: 1, status: 'succeeded', amount: 1000}
          - {id: 2, status: 'failed', amount: 500}
          - {id: 3, status: null, amount: 0}
    expect:
      rows:
        - {payment_id: 1, payment_status: 'succeeded', amount: 10.00}
        - {payment_id: 2, payment_status: 'failed', amount: 5.00}
        - {payment_id: 3, payment_status: 'unknown', amount: 0.00}
```

**When to use unit tests:**
- Complex `CASE` statements
- Currency conversions or calculations
- NULL handling logic
- Date transformations
- Any model where incorrect output would go undetected by generic tests

Run with `dbt test --select test_type:unit`.

## Tier 5: Singular Tests

Custom SQL assertions in the `tests/` directory. Must return zero rows to pass:

```sql
-- tests/assert_total_payment_matches_order.sql
-- Verify that total payments for completed orders match order amount
select
    o.order_id,
    o.order_total,
    p.total_paid,
    abs(o.order_total - p.total_paid) as difference
from {{ ref('fct_orders') }} o
join {{ ref('int_payments_pivoted_to_orders') }} p
    on o.order_id = p.order_id
where o.order_status = 'completed'
    and abs(o.order_total - p.total_paid) > 0.01
```

## Contract Tests (dbt 1.5+)

Enforce column names and types on public models:

```yaml
models:
  - name: fct_revenue
    config:
      contract:
        enforced: true
    columns:
      - name: revenue_id
        data_type: varchar
        data_tests:
          - unique
          - not_null
      - name: amount
        data_type: numeric(18, 2)
      - name: currency_code
        data_type: varchar(3)
```

Contract violations fail at build time, not test time. Use for models consumed by other teams or projects.

## Testing Commands

```bash
# Run all tests
dbt test

# Run tests for specific model
dbt test --select stg_stripe__payments

# Run only unit tests
dbt test --select test_type:unit

# Run only generic tests
dbt test --select test_type:generic

# Run source freshness
dbt source freshness

# Run tests for modified models and downstream
dbt test --select state:modified+
```

## CI/CD Testing Pattern

```bash
# In CI pipeline
dbt deps
dbt seed                           # Load test seeds
dbt build --select state:modified+ # Build and test modified models + downstream
dbt source freshness               # Check source freshness
```

Use `dbt build` instead of separate `dbt run` + `dbt test` to run tests immediately after each model builds, catching failures early.
