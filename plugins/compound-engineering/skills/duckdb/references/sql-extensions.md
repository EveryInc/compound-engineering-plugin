# SQL Extensions

DuckDB extends standard SQL with analytical operators, list comprehensions, pattern-based column selection, and advanced types. These extensions reduce boilerplate and eliminate common subquery patterns.

## ASOF JOIN

Join each row to the closest matching row by an inequality condition. Designed for time-series data where timestamps do not align exactly.

### Basic Syntax

```sql
SELECT t.symbol, t.ts, t.price, q.bid, q.ask
FROM trades t
ASOF JOIN quotes q
  ON t.symbol = q.symbol
  AND t.ts >= q.ts;
```

Each trade joins to the most recent quote at or before the trade timestamp. Rows with no matching quote are excluded (use `ASOF LEFT JOIN` to keep them with NULLs).

### With Multiple Equality Conditions

```sql
SELECT s.sensor_id, s.reading_time, s.value, c.calibration_factor
FROM sensor_readings s
ASOF JOIN calibrations c
  ON s.sensor_id = c.sensor_id
  AND s.reading_time >= c.effective_from;
```

### ASOF LEFT JOIN

```sql
-- Keep all trades even if no matching quote exists
SELECT t.*, q.bid, q.ask
FROM trades t
ASOF LEFT JOIN quotes q
  ON t.symbol = q.symbol
  AND t.ts >= q.ts;
```

### Requirements

- The last `ON` condition must be an inequality (`>=` or `>`)
- All other `ON` conditions must be equality (`=`)
- Both sides should be sorted on the inequality column for performance

## PIVOT and UNPIVOT

### PIVOT: Rows to Columns

```sql
-- Aggregate rows into columns
PIVOT sales
ON month
USING sum(revenue)
GROUP BY region;
```

Result transforms rows with `month` values into separate columns (`jan`, `feb`, etc.).

### PIVOT with Multiple Aggregates

```sql
PIVOT sales
ON quarter
USING sum(revenue) AS total, avg(revenue) AS average
GROUP BY region;
```

### PIVOT with IN Filter

```sql
-- Only pivot specific values
PIVOT sales
ON month IN ('jan', 'feb', 'mar')
USING sum(revenue)
GROUP BY region;
```

### UNPIVOT: Columns to Rows

```sql
-- Convert columns back to rows
UNPIVOT monthly_report
ON jan, feb, mar, apr, may, jun
INTO NAME month VALUE revenue;
```

### UNPIVOT with Column Selection

```sql
-- Unpivot all columns except specific ones
UNPIVOT quarterly_data
ON COLUMNS(* EXCLUDE (region, year))
INTO NAME metric VALUE amount;
```

## QUALIFY

Filter rows based on window function results without a subquery or CTE.

### Basic Usage

```sql
-- Latest record per group
SELECT *
FROM events
QUALIFY row_number() OVER (PARTITION BY user_id ORDER BY created_at DESC) = 1;
```

### With Multiple Window Conditions

```sql
-- Top 3 products by revenue per category, excluding ties
SELECT category, product_name, revenue
FROM products
QUALIFY dense_rank() OVER (PARTITION BY category ORDER BY revenue DESC) <= 3;
```

### Combined with WHERE and HAVING

```sql
-- QUALIFY runs after WHERE and HAVING
SELECT department, employee, salary
FROM employees
WHERE active = true
QUALIFY rank() OVER (PARTITION BY department ORDER BY salary DESC) = 1;
```

Execution order: `WHERE` -> `GROUP BY` -> `HAVING` -> window functions -> `QUALIFY`.

## List Comprehensions and Lambdas

### List Comprehensions

```sql
-- Filter a list
SELECT [x FOR x IN tags IF x LIKE 'prod_%'] AS prod_tags FROM items;

-- Transform a list
SELECT [upper(x) FOR x IN names] AS upper_names FROM contacts;

-- Filter and transform
SELECT [x * 2 FOR x IN values IF x > 0] AS doubled_positives FROM metrics;
```

### Lambda Functions

```sql
-- list_transform: apply function to each element
SELECT list_transform([1, 2, 3, 4], x -> x * x) AS squares;
-- [1, 4, 9, 16]

-- list_filter: keep elements matching predicate
SELECT list_filter(['apple', 'banana', 'apricot'], x -> x[1] = 'a') AS a_fruits;
-- ['apple', 'apricot']

-- list_reduce: aggregate a list
SELECT list_reduce([1, 2, 3, 4], (acc, x) -> acc + x) AS total;
-- 10

-- list_sort with custom comparator
SELECT list_sort([3, 1, 4, 1, 5], 'DESC') AS sorted_desc;
```

### Nested List Operations

```sql
-- Flatten nested lists
SELECT flatten([[1, 2], [3, 4], [5]]) AS flat;
-- [1, 2, 3, 4, 5]

-- Unnest to rows
SELECT unnest([10, 20, 30]) AS value;
-- Returns 3 rows
```

## COLUMNS() Expression

Select or transform multiple columns by pattern, type, or expression.

### By Pattern (Regex)

```sql
-- Sum all revenue columns
SELECT sum(COLUMNS('revenue_.*')) FROM quarterly;

-- Apply function to columns matching pattern
SELECT min(COLUMNS('price_.*')), max(COLUMNS('price_.*')) FROM products;
```

### By Exclusion

```sql
-- All columns except metadata
SELECT COLUMNS(* EXCLUDE (created_at, updated_at, _etl_loaded)) FROM users;
```

### With Lambda

```sql
-- Coalesce all nullable columns to empty string
SELECT COLUMNS(c -> c IN ('first_name', 'last_name', 'email')),
       COALESCE(COLUMNS(c -> c LIKE '%_note'), '') AS notes
FROM contacts;
```

## EXCLUDE and REPLACE in SELECT

### EXCLUDE

```sql
-- Drop specific columns
SELECT * EXCLUDE (password_hash, internal_id) FROM users;

-- Combine with COLUMNS()
SELECT COLUMNS('*') EXCLUDE (debug_col) FROM logs;
```

### REPLACE

```sql
-- Transform a column inline without listing all others
SELECT * REPLACE (amount / 100.0 AS amount) FROM transactions;

-- Multiple replacements
SELECT * REPLACE (
    upper(name) AS name,
    round(price, 2) AS price
) FROM products;
```

## STRUCT Types

### Create Structs

```sql
-- Struct literal
SELECT {'name': 'Alice', 'age': 30} AS person;

-- Struct from columns
SELECT struct_pack(id := id, name := name) AS person_struct FROM users;
```

### Access Struct Fields

```sql
-- Dot notation
SELECT person.name, person.age FROM people;

-- Bracket notation
SELECT person['name'] FROM people;
```

### Nested Structs

```sql
SELECT {
    'user': {'name': 'Alice', 'email': 'alice@example.com'},
    'metadata': {'created': current_timestamp}
} AS record;

-- Access nested
SELECT record.user.name FROM records;
```

## MAP Types

```sql
-- Create a MAP
SELECT MAP {'key1': 'value1', 'key2': 'value2'} AS m;

-- Access by key
SELECT m['key1'] FROM (SELECT MAP {'a': 1, 'b': 2} AS m);

-- Map from arrays
SELECT map_from_entries([('k1', 'v1'), ('k2', 'v2')]) AS m;

-- Extract keys and values
SELECT map_keys(m), map_values(m) FROM maps_table;
```

## Recursive CTEs

```sql
-- Organizational hierarchy
WITH RECURSIVE org_tree AS (
    -- Base case: top-level managers
    SELECT id, name, manager_id, 1 AS depth
    FROM employees
    WHERE manager_id IS NULL

    UNION ALL

    -- Recursive case: reports
    SELECT e.id, e.name, e.manager_id, t.depth + 1
    FROM employees e
    JOIN org_tree t ON e.manager_id = t.id
    WHERE t.depth < 10  -- Safety limit
)
SELECT * FROM org_tree ORDER BY depth, name;
```

### Graph Traversal

```sql
WITH RECURSIVE paths AS (
    SELECT src, dst, [src, dst] AS path, 1 AS hops
    FROM edges
    WHERE src = 'A'

    UNION ALL

    SELECT p.src, e.dst, list_append(p.path, e.dst), p.hops + 1
    FROM paths p
    JOIN edges e ON p.dst = e.src
    WHERE p.hops < 5
    AND NOT list_contains(p.path, e.dst)  -- Prevent cycles
)
SELECT * FROM paths;
```

## SAMPLE Clause

```sql
-- Random 10% of rows
SELECT * FROM large_table USING SAMPLE 10%;

-- Fixed number of rows
SELECT * FROM large_table USING SAMPLE 1000;

-- Reservoir sampling (deterministic with seed)
SELECT * FROM large_table USING SAMPLE 5% (reservoir, 42);

-- Bernoulli sampling (row-level, unbiased)
SELECT * FROM large_table USING SAMPLE 10% (bernoulli);

-- System sampling (block-level, faster but less uniform)
SELECT * FROM large_table USING SAMPLE 10% (system);
```

## SUMMARIZE Command

Generate descriptive statistics for a table or query:

```sql
-- Summarize a table
SUMMARIZE sales;

-- Summarize a query
SUMMARIZE SELECT * FROM read_parquet('data/*.parquet') WHERE year = 2024;
```

Output includes column name, type, min, max, unique count, null count, and approximate percentiles. Useful for initial data exploration before writing queries.
