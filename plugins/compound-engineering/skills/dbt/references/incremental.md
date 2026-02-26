# dbt Incremental Models

## Strategy Selection

| Strategy | Best For | Key Config | Supported Adapters |
|----------|----------|------------|-------------------|
| `merge` (default) | Upserts with unique key | `unique_key` | All |
| `delete+insert` | Non-unique keys, high cardinality | `unique_key` | Snowflake, BigQuery, Redshift |
| `insert_overwrite` | Partition-based replacement | `partition_by` | BigQuery, Spark |
| `microbatch` (1.9+) | Time-series, event data | `event_time`, `batch_size` | All |
| `append` | Insert-only, no updates | None | All |

**Decision tree:**
1. Have a unique key and need upserts? Use `merge`
2. High cardinality, non-unique key? Use `delete+insert`
3. Time-series data on dbt 1.9+? Use `microbatch`
4. Partitioned data (BigQuery/Spark)? Use `insert_overwrite`
5. Append-only log data? Use `append`

## Merge Strategy

```sql
{{
    config(
        materialized='incremental',
        unique_key='order_id',
        incremental_strategy='merge',
        on_schema_change='append_new_columns'
    )
}}

select
    order_id,
    customer_id,
    order_total,
    order_status,
    updated_at
from {{ ref('stg_shopify__orders') }}

{% if is_incremental() %}
where updated_at > (select max(updated_at) from {{ this }})
{% endif %}
```

## Delete+Insert Strategy

Better performance than merge for large datasets when you can identify the affected partitions:

```sql
{{
    config(
        materialized='incremental',
        unique_key='event_date',
        incremental_strategy='delete+insert',
        on_schema_change='append_new_columns'
    )
}}

select
    event_id,
    event_type,
    cast(event_timestamp as date) as event_date,
    event_timestamp,
    user_id
from {{ ref('stg_analytics__events') }}

{% if is_incremental() %}
where event_timestamp >= dateadd(day, -3, current_date())
{% endif %}
```

## Microbatch Strategy (dbt 1.9+)

Eliminates manual `is_incremental()` logic for time-series data:

```sql
{{
    config(
        materialized='incremental',
        incremental_strategy='microbatch',
        event_time='event_timestamp',
        batch_size='day',
        lookback=1,
        begin='2023-01-01'
    )
}}

-- No is_incremental() guard needed - dbt handles it
select
    event_id,
    event_type,
    event_timestamp,
    user_id,
    properties
from {{ ref('stg_analytics__events') }}
```

**Microbatch config:**
- `event_time` - Timestamp column for batching (required)
- `batch_size` - `'hour'`, `'day'`, `'month'`, `'year'` (required)
- `lookback` - Number of extra batches to reprocess (handles late-arriving data)
- `begin` - Earliest date to process (for initial backfill)

**Advantages over manual incremental:**
- Automatic retry of failed batches
- Built-in late-arriving data handling via `lookback`
- Parallel batch processing
- No manual `is_incremental()` logic

## Top 8 Incremental Anti-Patterns

### 1. Missing unique_key

```sql
-- BAD: No unique_key means duplicates on re-run
{{ config(materialized='incremental') }}

-- GOOD: Always specify unique_key
{{ config(materialized='incremental', unique_key='event_id') }}
```

### 2. NULL in unique_key

```sql
-- BAD: NULLs in unique_key cause phantom duplicates
{{ config(materialized='incremental', unique_key='user_id') }}
-- If user_id can be NULL, merge won't match NULLs

-- GOOD: Use a composite key or coalesce NULLs
{{ config(materialized='incremental', unique_key=['event_id', 'event_type']) }}
```

### 3. No Lookback Window

```sql
-- BAD: Exactly at max timestamp misses late-arriving data
{% if is_incremental() %}
where event_timestamp > (select max(event_timestamp) from {{ this }})
{% endif %}

-- GOOD: Overlap with lookback window (3 days)
{% if is_incremental() %}
where event_timestamp >= (
    select dateadd(day, -3, max(event_timestamp)) from {{ this }}
)
{% endif %}
```

### 4. Not Testing Full Refresh

```bash
# Always verify full refresh works
dbt run --select my_incremental_model --full-refresh
```

If full refresh produces different results than incremental, there is a logic bug.

### 5. Wrong Strategy for Key Cardinality

High cardinality unique keys with `merge` is slow on Snowflake. Use `delete+insert` for better performance when the number of affected rows is small relative to total rows.

### 6. Missing on_schema_change

```sql
-- BAD: Source adds a new column, incremental model silently ignores it
{{ config(materialized='incremental', unique_key='id') }}

-- GOOD: Handle schema evolution
{{ config(
    materialized='incremental',
    unique_key='id',
    on_schema_change='append_new_columns'
) }}
```

Options: `'ignore'` (default), `'fail'`, `'append_new_columns'`, `'sync_all_columns'`

### 7. Over-Engineering Simple Models

If a model has <1M rows and builds in <60 seconds, keep it as a `table`. Incremental adds complexity for minimal benefit on small datasets.

### 8. Not Using Microbatch When Applicable

If targeting dbt 1.9+ and the model processes time-series events, prefer `microbatch` over manual `is_incremental()`. It handles late-arriving data, retries, and parallelism automatically.

## Incremental Predicates (Snowflake Optimization)

```sql
{{
    config(
        materialized='incremental',
        unique_key='event_id',
        incremental_predicates=[
            "DBT_INTERNAL_DEST.event_date >= dateadd(day, -7, current_date())"
        ]
    )
}}
```

Incremental predicates filter the target table during merge, improving performance on large tables by reducing scan scope.

## Full Refresh Schedule

```bash
# Weekly full refresh to correct any drift
# In orchestrator (Airflow/Dagster):
dbt run --select tag:incremental --full-refresh  # Sunday night
dbt run --select tag:incremental                  # Mon-Sat
```
