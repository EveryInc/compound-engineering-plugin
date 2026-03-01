---
name: duckdb
description: Query local files and databases with DuckDB SQL and extensions. Use when reading Parquet, CSV, or JSON files with DuckDB, writing analytical queries, using ASOF JOIN or PIVOT, or performing local data exploration without a server.
---

# DuckDB

In-process analytical database engine. DuckDB runs embedded (no server), reads files directly, and supports advanced SQL extensions for analytical workloads. Install with `brew install duckdb` or `pip install duckdb`.

## Quick Reference

### Read Files Directly

```sql
-- Parquet (single file, glob, or remote)
SELECT * FROM 'data/events.parquet';
SELECT * FROM 'data/events/*.parquet';
SELECT * FROM 'https://example.com/data.parquet';

-- CSV with options
SELECT * FROM read_csv('sales.csv', header = true, delim = '|');

-- JSON (auto-detect structure)
SELECT * FROM 'logs.json';
```

### ASOF JOIN (Time-Series Alignment)

Join each row to the nearest preceding row by timestamp:

```sql
SELECT t.symbol, t.price, q.bid, q.ask
FROM trades t
ASOF JOIN quotes q
  ON t.symbol = q.symbol
  AND t.ts >= q.ts;
```

### PIVOT and UNPIVOT

```sql
-- Pivot rows to columns
PIVOT sales ON month USING sum(revenue) GROUP BY region;

-- Unpivot columns to rows
UNPIVOT monthly_sales ON jan, feb, mar INTO NAME month VALUE revenue;
```

### QUALIFY (Filter Window Functions)

```sql
-- Latest order per customer, without a subquery
SELECT customer_id, order_date, amount
FROM orders
QUALIFY row_number() OVER (PARTITION BY customer_id ORDER BY order_date DESC) = 1;
```

### COLUMNS() Expression

Select or transform columns by pattern:

```sql
-- Sum all numeric columns matching a pattern
SELECT COLUMNS('revenue_.*')::DECIMAL FROM quarterly;

-- Apply a function across matching columns
SELECT min(COLUMNS('price_.*')) FROM products;
```

### EXCLUDE and REPLACE

```sql
-- All columns except specific ones
SELECT * EXCLUDE (internal_id, debug_flag) FROM events;

-- Replace a column expression inline
SELECT * REPLACE (amount / 100 AS amount) FROM transactions;
```

### List Comprehensions and Lambdas

```sql
-- Filter a list column
SELECT [x FOR x IN tags IF x != 'deprecated'] AS clean_tags FROM items;

-- Transform with lambda
SELECT list_transform(prices, x -> x * 1.1) AS adjusted FROM catalog;
```

## Security Warning

Never pass user-controlled strings directly to `read_csv()`, `read_parquet()`, `read_json()`, or any file-reading function. An attacker who controls the file path argument can read arbitrary files from the filesystem. Always validate and sanitize file paths before constructing DuckDB queries. Prefer allowlisted directories over dynamic path construction.

## Cross-Platform: DuckDB as Local dbt Adapter

DuckDB serves as a local development adapter for dbt via `dbt-duckdb`. This enables running dbt models locally without a cloud warehouse.

**Setup:**

```yaml
# profiles.yml
my_project:
  target: dev
  outputs:
    dev:
      type: duckdb
      path: dev.duckdb
      threads: 4
```

**When to use:** Local development, CI testing, prototyping transformations before deploying to Snowflake or BigQuery.

**Limitations:** No multi-user concurrency, single-writer lock, memory-bound for large datasets.

### Dialect Differences: DuckDB vs Snowflake

| Operation | Snowflake | DuckDB |
|-----------|-----------|--------|
| Flatten array | `LATERAL FLATTEN(input => col)` | `UNNEST(col)` |
| Safe cast | `TRY_CAST(x AS INT)` | `TRY_CAST(x AS INTEGER)` |
| Flatten JSON array | `LATERAL FLATTEN(input => parse_json(col))` | `UNNEST(from_json(col, '["JSON"]'))` |
| Current timestamp | `CURRENT_TIMESTAMP()` | `current_timestamp` (no parens) |
| String to date | `TO_DATE(s, 'YYYY-MM-DD')` | `strptime(s, '%Y-%m-%d')::DATE` |
| Array contains | `ARRAY_CONTAINS(val, arr)` | `list_contains(arr, val)` (arg order flipped) |
| Create temp table | `CREATE TEMPORARY TABLE t AS ...` | `CREATE TEMP TABLE t AS ...` |
| Semi-structured access | `col:key::string` | `col->>'key'` or `json_extract_string(col, '$.key')` |

## Reference Index

| File | Topics |
|------|--------|
| [file-querying.md](./references/file-querying.md) | Parquet, CSV, JSON reading and writing, globs, HTTP, Hive partitions, COPY TO |
| [sql-extensions.md](./references/sql-extensions.md) | ASOF JOIN, PIVOT, QUALIFY, lambdas, COLUMNS(), STRUCTs, MAPs, SAMPLE, SUMMARIZE |
| [integration.md](./references/integration.md) | dbt-duckdb, Python/Pandas/Polars, Arrow, Snowflake differences, extensions, MotherDuck |
