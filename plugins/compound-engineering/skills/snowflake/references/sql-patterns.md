# Snowflake SQL Patterns

Comprehensive reference for Snowflake-specific SQL syntax, semi-structured data handling, and common idioms.

---

## QUALIFY - Window Function Filtering

QUALIFY filters results of window functions directly, eliminating the need for subqueries or CTEs.

### Deduplicate rows

```sql
-- Keep only the most recent record per customer
SELECT *
FROM raw_customers
QUALIFY ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY updated_at DESC) = 1;
```

### Top-N per group

```sql
-- Top 3 orders per customer by amount
SELECT
    customer_id,
    order_id,
    amount
FROM orders
QUALIFY RANK() OVER (PARTITION BY customer_id ORDER BY amount DESC) <= 3;
```

### Filter with aggregate window functions

```sql
-- Customers with more than 5 orders
SELECT
    customer_id,
    order_id,
    order_date
FROM orders
QUALIFY COUNT(*) OVER (PARTITION BY customer_id) > 5;
```

### Combine QUALIFY with WHERE and HAVING

```sql
-- QUALIFY applies after WHERE, GROUP BY, and HAVING
SELECT
    department,
    employee_id,
    SUM(sales) AS total_sales
FROM sales_data
WHERE fiscal_year = 2024
GROUP BY department, employee_id
HAVING SUM(sales) > 1000
QUALIFY ROW_NUMBER() OVER (PARTITION BY department ORDER BY total_sales DESC) = 1;
```

---

## FLATTEN - Semi-Structured Data Expansion

FLATTEN converts semi-structured data (VARIANT, OBJECT, ARRAY) into rows.

### Basic array expansion

```sql
-- Expand a JSON array into individual rows
SELECT
    order_id,
    f.value::STRING AS tag
FROM orders,
LATERAL FLATTEN(input => tags) f;
```

### Nested object access

```sql
-- Extract fields from array of objects
SELECT
    order_id,
    f.value:product_id::INTEGER AS product_id,
    f.value:name::STRING AS product_name,
    f.value:quantity::INTEGER AS quantity,
    f.value:price::NUMBER(10,2) AS unit_price
FROM orders,
LATERAL FLATTEN(input => order_data:line_items) f;
```

### Recursive FLATTEN for deeply nested structures

```sql
-- Flatten all keys at any depth
SELECT
    f.key,
    f.path,
    f.value
FROM raw_events,
LATERAL FLATTEN(input => event_payload, RECURSIVE => TRUE) f
WHERE f.key = 'email';
```

### OUTER FLATTEN to preserve rows without matches

```sql
-- Keep orders even when line_items array is empty or NULL
SELECT
    o.order_id,
    f.value:product_id::INTEGER AS product_id
FROM orders o,
LATERAL FLATTEN(input => o.order_data:line_items, OUTER => TRUE) f;
```

### Multi-level FLATTEN

```sql
-- Flatten nested arrays (order -> items -> attributes)
SELECT
    o.order_id,
    items.value:name::STRING AS item_name,
    attrs.value::STRING AS attribute
FROM orders o,
LATERAL FLATTEN(input => o.order_data:items) items,
LATERAL FLATTEN(input => items.value:attributes) attrs;
```

---

## Dot Notation for Semi-Structured Data

Access nested VARIANT fields with colon and dot notation. Always cast to a target type.

### Basic field access

```sql
SELECT
    raw:user_id::INTEGER AS user_id,
    raw:event_type::STRING AS event_type,
    raw:timestamp::TIMESTAMP_NTZ AS event_ts
FROM raw_events;
```

### Nested object traversal

```sql
SELECT
    raw:user.profile.first_name::STRING AS first_name,
    raw:user.profile.last_name::STRING AS last_name,
    raw:user.address.city::STRING AS city,
    raw:user.address.state::STRING AS state
FROM raw_events;
```

### Array element access by index

```sql
SELECT
    raw:items[0]:name::STRING AS first_item_name,
    raw:items[0]:price::NUMBER(10,2) AS first_item_price,
    ARRAY_SIZE(raw:items) AS item_count
FROM raw_events;
```

### Bracket notation for special characters

```sql
-- Use brackets when keys contain spaces, dots, or special characters
SELECT
    raw:user["first-name"]::STRING AS first_name,
    raw:user["email.address"]::STRING AS email,
    raw:metadata["Content-Type"]::STRING AS content_type
FROM raw_events;
```

---

## TRY_CAST and Safe Type Conversion

Handle potentially invalid data without query failure.

### TRY_CAST

```sql
-- Returns NULL instead of failing on invalid data
SELECT
    TRY_CAST(raw_amount AS NUMBER(10,2)) AS amount,
    TRY_CAST(raw_date AS DATE) AS event_date,
    TRY_CAST(raw_flag AS BOOLEAN) AS is_active
FROM staging_data;
```

### TRY_TO_NUMBER, TRY_TO_DATE, TRY_TO_TIMESTAMP

```sql
SELECT
    TRY_TO_NUMBER(price_string, 10, 2) AS price,
    TRY_TO_DATE(date_string, 'YYYY-MM-DD') AS parsed_date,
    TRY_TO_TIMESTAMP(ts_string, 'YYYY-MM-DD HH24:MI:SS') AS parsed_ts
FROM raw_input;
```

### Validation pattern: find bad records

```sql
-- Identify rows with unparseable data
SELECT *
FROM staging_data
WHERE TRY_CAST(raw_amount AS NUMBER(10,2)) IS NULL
  AND raw_amount IS NOT NULL;
```

---

## ARRAY_AGG and OBJECT_CONSTRUCT

Build semi-structured results from relational data.

### Aggregate into arrays

```sql
SELECT
    customer_id,
    ARRAY_AGG(DISTINCT product_id) AS purchased_products,
    ARRAY_AGG(order_id) WITHIN GROUP (ORDER BY order_date) AS ordered_order_ids
FROM orders
GROUP BY customer_id;
```

### Build JSON objects

```sql
SELECT
    customer_id,
    OBJECT_CONSTRUCT(
        'name', customer_name,
        'email', email,
        'total_orders', COUNT(*),
        'total_spend', SUM(amount)
    ) AS customer_summary
FROM orders
JOIN customers USING (customer_id)
GROUP BY customer_id, customer_name, email;
```

### Combine ARRAY_AGG with OBJECT_CONSTRUCT

```sql
-- Build a nested JSON structure from relational data
SELECT
    department_id,
    ARRAY_AGG(
        OBJECT_CONSTRUCT(
            'employee_id', employee_id,
            'name', employee_name,
            'salary', salary
        )
    ) AS employees
FROM employees
GROUP BY department_id;
```

### ARRAY_CONSTRUCT and OBJECT_CONSTRUCT_KEEP_NULL

```sql
-- Explicit array construction
SELECT ARRAY_CONSTRUCT(1, 2, 3, NULL) AS with_nulls;

-- Keep NULL values in objects (default OBJECT_CONSTRUCT drops them)
SELECT OBJECT_CONSTRUCT_KEEP_NULL(
    'name', customer_name,
    'phone', phone_number  -- preserved even when NULL
) AS customer_obj
FROM customers;
```

---

## MERGE INTO - Upsert Pattern

Perform insert, update, and delete in a single atomic statement.

### Basic upsert

```sql
MERGE INTO target_table t
USING staging_table s
    ON t.id = s.id
WHEN MATCHED AND s.is_deleted = TRUE THEN
    DELETE
WHEN MATCHED THEN
    UPDATE SET
        t.name = s.name,
        t.amount = s.amount,
        t.updated_at = CURRENT_TIMESTAMP()
WHEN NOT MATCHED THEN
    INSERT (id, name, amount, created_at, updated_at)
    VALUES (s.id, s.name, s.amount, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP());
```

### MERGE with deduplication

```sql
-- Deduplicate source before merging
MERGE INTO dim_customers t
USING (
    SELECT *
    FROM staging_customers
    QUALIFY ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY loaded_at DESC) = 1
) s
    ON t.customer_id = s.customer_id
WHEN MATCHED THEN
    UPDATE SET t.name = s.name, t.email = s.email, t.updated_at = CURRENT_TIMESTAMP()
WHEN NOT MATCHED THEN
    INSERT (customer_id, name, email, created_at, updated_at)
    VALUES (s.customer_id, s.name, s.email, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP());
```

---

## GENERATOR - Sequence and Series Generation

Generate rows without a source table.

### Numeric sequence

```sql
SELECT ROW_NUMBER() OVER (ORDER BY SEQ4()) AS id
FROM TABLE(GENERATOR(ROWCOUNT => 1000));
```

### Date series

```sql
-- Generate a continuous date range
SELECT DATEADD(DAY, ROW_NUMBER() OVER (ORDER BY SEQ4()) - 1, '2024-01-01'::DATE) AS date_value
FROM TABLE(GENERATOR(ROWCOUNT => 365));
```

### Fill gaps in time series

```sql
WITH date_spine AS (
    SELECT DATEADD(DAY, ROW_NUMBER() OVER (ORDER BY SEQ4()) - 1, :start_date::DATE) AS dt
    FROM TABLE(GENERATOR(ROWCOUNT => 365))
)
SELECT
    ds.dt,
    COALESCE(m.daily_total, 0) AS daily_total
FROM date_spine ds
LEFT JOIN daily_metrics m ON ds.dt = m.metric_date;
```

---

## Common Idioms

### Conditional aggregation

```sql
SELECT
    customer_id,
    COUNT_IF(status = 'completed') AS completed_orders,
    SUM(IFF(status = 'completed', amount, 0)) AS completed_revenue,
    RATIO_TO_REPORT(SUM(amount)) OVER () AS revenue_share
FROM orders
GROUP BY customer_id;
```

### PIVOT and UNPIVOT

```sql
-- Pivot rows to columns
SELECT *
FROM monthly_sales
PIVOT (SUM(revenue) FOR month IN ('Jan', 'Feb', 'Mar', 'Apr')) AS p;

-- Unpivot columns to rows
SELECT *
FROM quarterly_report
UNPIVOT (value FOR quarter IN (q1, q2, q3, q4));
```

### LISTAGG for string aggregation

```sql
SELECT
    department,
    LISTAGG(DISTINCT employee_name, ', ') WITHIN GROUP (ORDER BY employee_name) AS team_members
FROM employees
GROUP BY department;
```

### Parameterized queries in application code

```python
import snowflake.connector
import os

conn = snowflake.connector.connect(
    account=os.environ["SNOWFLAKE_ACCOUNT"],
    user=os.environ["SNOWFLAKE_USER"],
    private_key_file=os.environ["SNOWFLAKE_PRIVATE_KEY_PATH"],
    warehouse=os.environ["SNOWFLAKE_WAREHOUSE"],
    database=os.environ["SNOWFLAKE_DATABASE"],
    schema=os.environ["SNOWFLAKE_SCHEMA"],
)

cursor = conn.cursor()

# Always use parameterized queries - never interpolate user input
cursor.execute(
    "SELECT * FROM customers WHERE customer_id = %s AND region = %s",
    (customer_id, region)
)

results = cursor.fetchall()
cursor.close()
conn.close()
```

### Session parameters for query control

```sql
-- Set session-level parameters for a batch job
ALTER SESSION SET QUERY_TAG = 'etl:daily_refresh:orders';
ALTER SESSION SET STATEMENT_TIMEOUT_IN_SECONDS = 3600;
ALTER SESSION SET TIMESTAMP_INPUT_FORMAT = 'YYYY-MM-DD HH24:MI:SS';
```
