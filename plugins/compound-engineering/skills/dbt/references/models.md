# dbt Model Patterns

## Materializations

| Type | When to Use | Storage | Build Time |
|------|-------------|---------|------------|
| `view` | Small data, staging models, infrequently queried | None | Instant |
| `table` | Frequently queried, marts, complex transforms | Full | Full rebuild |
| `incremental` | Large tables, append-heavy, >1M rows | Full | Delta only |
| `ephemeral` | DRY logic shared across models (compiles to CTE) | None | N/A |
| `dynamic_table` | Snowflake-managed refresh with `target_lag` | Full | Managed |

**Decision tree:**
1. Default to `view` (zero cost, always fresh)
2. Upgrade to `table` when query performance suffers or model is queried >10x/day
3. Upgrade to `incremental` when full rebuild exceeds SLA or data volume >1M rows
4. Use `ephemeral` only for simple reusable logic (avoid for debugging - invisible in warehouse)

## Staging Model Pattern

Staging models perform light transformations: renaming, type casting, basic filtering. One staging model per source table.

```sql
-- models/staging/stripe/stg_stripe__payments.sql
with source as (
    select * from {{ source('stripe', 'payments') }}
),

renamed as (
    select
        id as payment_id,
        order_id,
        cast(amount as decimal(18, 2)) as amount,
        lower(currency) as currency,
        status as payment_status,
        cast(created as timestamp) as created_at,
        cast(_fivetran_synced as timestamp) as loaded_at
    from source
    where not _fivetran_deleted
)

select * from renamed
```

**Rules:**
- Always select explicit columns (no `SELECT *` in final output)
- Rename columns to business-friendly names
- Cast types explicitly
- Filter soft-deleted rows
- One CTE for source, one for transformations

## Intermediate Model Pattern

Intermediate models join, aggregate, and reshape data. They contain the bulk of business logic.

```sql
-- models/intermediate/finance/int_payments_pivoted_to_orders.sql
with payments as (
    select * from {{ ref('stg_stripe__payments') }}
),

orders as (
    select * from {{ ref('stg_shopify__orders') }}
),

payment_totals as (
    select
        order_id,
        sum(case when payment_status = 'succeeded' then amount else 0 end) as total_paid,
        count(*) as payment_count,
        min(created_at) as first_payment_at,
        max(created_at) as last_payment_at
    from payments
    group by order_id
)

select
    orders.order_id,
    orders.customer_id,
    orders.order_date,
    payment_totals.total_paid,
    payment_totals.payment_count,
    payment_totals.first_payment_at
from orders
left join payment_totals
    on orders.order_id = payment_totals.order_id
```

**Rules:**
- Name describes the transformation: `int_<entity>_<verb>`
- Use CTEs, not subqueries
- If a model exceeds 10 CTEs, split into multiple intermediate models
- Materialize as `view` by default; upgrade to `table` if performance requires it

## Mart Model Pattern

Marts are wide, business-facing tables optimized for consumption.

```sql
-- models/marts/finance/fct_orders.sql
with orders as (
    select * from {{ ref('int_payments_pivoted_to_orders') }}
),

customers as (
    select * from {{ ref('dim_customers') }}
)

select
    orders.order_id,
    orders.customer_id,
    customers.customer_name,
    customers.customer_segment,
    orders.order_date,
    orders.total_paid,
    orders.payment_count,
    orders.first_payment_at,
    case
        when orders.total_paid > 0 then 'paid'
        else 'unpaid'
    end as payment_status
from orders
left join customers
    on orders.customer_id = customers.customer_id
```

## CTE Best Practices

```sql
-- Import CTEs first (one per ref)
with customers as (
    select * from {{ ref('stg_shopify__customers') }}
),

orders as (
    select * from {{ ref('stg_shopify__orders') }}
),

-- Logical CTEs next (transformations)
customer_orders as (
    select
        customer_id,
        count(*) as order_count,
        sum(amount) as lifetime_value,
        min(order_date) as first_order_date,
        max(order_date) as most_recent_order_date
    from orders
    group by customer_id
),

-- Final CTE combines everything
final as (
    select
        customers.customer_id,
        customers.customer_name,
        coalesce(customer_orders.order_count, 0) as order_count,
        coalesce(customer_orders.lifetime_value, 0) as lifetime_value,
        customer_orders.first_order_date,
        customer_orders.most_recent_order_date
    from customers
    left join customer_orders
        on customers.customer_id = customer_orders.customer_id
)

select * from final
```

**CTE naming rules:**
- Import CTEs: match the referenced model name
- Logical CTEs: describe what the CTE computes
- Always end with a `final` CTE and `select * from final`

## Python Models (dbt 1.3+)

For transformations that are difficult in SQL (ML, complex string parsing, API calls):

```python
# models/intermediate/int_customers_clustered.py
def model(dbt, session):
    customers = dbt.ref("dim_customers").to_pandas()

    from sklearn.cluster import KMeans

    features = customers[["lifetime_value", "order_count"]].fillna(0)
    kmeans = KMeans(n_clusters=4, random_state=42)
    customers["segment_cluster"] = kmeans.fit_predict(features)

    return customers
```

**Use Python models sparingly** - SQL is preferred for maintainability and performance. Reserve Python for ML, complex string operations, or external API integrations.

## Model Configs

```yaml
# In dbt_project.yml (project-level defaults)
models:
  my_project:
    marts:
      +materialized: table
      +tags: ['daily']

# In schema YAML (model-level override)
models:
  - name: fct_orders
    config:
      materialized: incremental
      unique_key: order_id

# In model SQL (inline config - highest precedence)
{{ config(materialized='incremental', unique_key='order_id') }}
```

**Precedence:** SQL config > schema YAML > dbt_project.yml
