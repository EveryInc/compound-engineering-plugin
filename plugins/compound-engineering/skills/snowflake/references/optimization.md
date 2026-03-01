# Snowflake Query Optimization

Reference for clustering keys, micro-partition pruning, caching, materialized views, and performance troubleshooting.

---

## Clustering Keys

Snowflake stores data in micro-partitions (50-500 MB compressed). Clustering keys determine how rows are organized across these partitions, directly impacting query pruning efficiency.

### When to add clustering keys

- Table exceeds 1 TB in size
- Queries consistently filter or join on specific columns
- Partition pruning ratio is poor (check with query profile)
- Natural data ordering does not align with query patterns

### When NOT to add clustering keys

- Tables under 1 TB (Snowflake auto-clusters well for smaller tables)
- Columns with very high cardinality used alone (e.g., UUID primary keys)
- Queries access most partitions regardless of filter
- Table is append-only and queries filter on ingestion-time columns (already naturally clustered)

### Choose clustering key columns

Prioritize columns in this order:
1. Columns in WHERE clauses (most selective filters first)
2. Columns in JOIN conditions
3. Columns used in GROUP BY

```sql
-- Cluster by the most common filter columns
ALTER TABLE events CLUSTER BY (event_date, event_type);

-- Verify clustering quality
SELECT SYSTEM$CLUSTERING_INFORMATION('events', '(event_date, event_type)');
```

### Clustering key guidelines

- Limit to 3-4 columns maximum
- Place low-cardinality columns first (e.g., date, status, region)
- Place higher-cardinality columns second (e.g., user_id)
- Use expressions when appropriate: `CLUSTER BY (TO_DATE(created_at), region)`
- Automatic Clustering maintains the key over time (no manual re-clustering needed)

### Monitor clustering depth

```sql
-- Check clustering ratio (lower is better, 1.0 is perfect)
SELECT SYSTEM$CLUSTERING_DEPTH('events', '(event_date, event_type)');

-- Detailed partition overlap statistics
SELECT SYSTEM$CLUSTERING_INFORMATION('events', '(event_date, event_type)');
```

---

## Micro-Partition Pruning

Pruning is the primary mechanism for query performance. Snowflake skips micro-partitions that cannot contain matching rows.

### Maximize pruning efficiency

Write predicates that align with partition boundaries:

```sql
-- Good: filter on clustered column with explicit range
SELECT * FROM events
WHERE event_date BETWEEN '2024-01-01' AND '2024-01-31';

-- Bad: function on clustered column prevents pruning
SELECT * FROM events
WHERE YEAR(event_date) = 2024 AND MONTH(event_date) = 1;

-- Good: IN list allows pruning
SELECT * FROM events
WHERE region IN ('us-east-1', 'us-west-2');

-- Bad: LIKE with leading wildcard scans all partitions
SELECT * FROM events
WHERE event_type LIKE '%click%';
```

### Check pruning in query profile

Open the query profile in the Snowflake UI and inspect the TableScan operator:
- **Partitions total** - total partitions in the table
- **Partitions scanned** - partitions actually read
- Target: scanned / total < 10% for well-pruned queries

### Anti-patterns that defeat pruning

- Applying functions to clustered columns in WHERE clauses
- Using OR across different clustered columns
- Leading wildcards in LIKE patterns
- Casting clustered columns to different types
- Joining on expressions rather than raw columns

---

## Search Optimization Service

A serverless feature that creates a search access path for point lookup queries.

### Enable for specific columns

```sql
ALTER TABLE customers ADD SEARCH OPTIMIZATION ON EQUALITY(customer_id, email);
ALTER TABLE events ADD SEARCH OPTIMIZATION ON EQUALITY(event_id), SUBSTRING(event_payload);
```

### When to use search optimization

- Point lookups on high-cardinality columns (e.g., `WHERE id = :id`)
- Substring searches on semi-structured or string data
- Tables with billions of rows where clustering alone is insufficient
- VARIANT field searches (`WHERE payload:user_id = :user_id`)

### Monitor and manage

```sql
-- Check optimization status
SELECT * FROM TABLE(INFORMATION_SCHEMA.SEARCH_OPTIMIZATION_HISTORY(
    DATE_RANGE_START => DATEADD(DAY, -7, CURRENT_TIMESTAMP())
));

-- Remove search optimization
ALTER TABLE customers DROP SEARCH OPTIMIZATION ON EQUALITY(email);
```

---

## Materialized Views

Pre-computed results maintained automatically by Snowflake. Queries transparently use materialized views when beneficial.

### Create a materialized view

```sql
CREATE MATERIALIZED VIEW daily_order_summary AS
SELECT
    order_date,
    region,
    COUNT(*) AS order_count,
    SUM(amount) AS total_amount,
    AVG(amount) AS avg_amount
FROM orders
GROUP BY order_date, region;
```

### Limitations and considerations

- Base table must not have more than one level of nesting in GROUP BY
- Cannot reference other views, UDFs, or external tables
- Cannot use non-deterministic functions (e.g., CURRENT_TIMESTAMP)
- Snowflake charges for background maintenance (serverless compute)
- Best for aggregation queries with predictable filter patterns
- Limited to a single base table (no joins)

### Check maintenance cost

```sql
SELECT *
FROM TABLE(INFORMATION_SCHEMA.MATERIALIZED_VIEW_REFRESH_HISTORY(
    DATE_RANGE_START => DATEADD(DAY, -7, CURRENT_TIMESTAMP())
));
```

---

## Query Acceleration Service (QAS)

Offloads portions of large scan-heavy queries to shared compute resources.

### Enable on a warehouse

```sql
ALTER WAREHOUSE analytics_wh SET
    ENABLE_QUERY_ACCELERATION = TRUE
    QUERY_ACCELERATION_MAX_SCALE_FACTOR = 8;
```

### Identify queries that benefit

```sql
-- Find queries eligible for acceleration
SELECT *
FROM TABLE(INFORMATION_SCHEMA.QUERY_ACCELERATION_HISTORY(
    DATE_RANGE_START => DATEADD(DAY, -7, CURRENT_TIMESTAMP())
));

-- Check estimated benefit before enabling
SELECT SYSTEM$ESTIMATE_QUERY_ACCELERATION(:query_id);
```

### Best candidates for QAS

- Large table scans with selective filters
- Ad-hoc analytics queries scanning wide date ranges
- Queries with significant partition scanning
- NOT beneficial for small, quick queries (overhead exceeds benefit)

---

## Reading EXPLAIN Plans

Use the query profile to diagnose performance issues.

### Access the query profile

```sql
-- Get the last query ID
SELECT LAST_QUERY_ID();

-- View explain plan (text format)
EXPLAIN USING TEXT
SELECT * FROM orders WHERE order_date = '2024-01-15';

-- View explain plan (JSON format for programmatic analysis)
EXPLAIN USING JSON
SELECT * FROM orders WHERE order_date = '2024-01-15';
```

### Key metrics to inspect

| Metric | What it indicates |
|--------|-------------------|
| Partitions scanned vs total | Pruning efficiency |
| Bytes scanned | Data volume processed |
| Spillage to local/remote | Insufficient memory, consider larger warehouse |
| Percentage scanned from cache | Cache hit rate |
| Rows produced vs rows scanned | Filter selectivity |
| Join explosion | Unexpected row multiplication |

### Common performance problems and solutions

| Symptom | Likely Cause | Solution |
|---------|-------------|----------|
| High partition scan ratio | Poor pruning | Add/adjust clustering key |
| Spillage to remote storage | Warehouse too small | Size up warehouse |
| Long compilation time | Complex query or too many CTEs | Simplify query, reduce CTE depth |
| Queuing delay | Warehouse concurrency maxed | Use multi-cluster warehouse or separate workloads |
| Full table scan on join | Missing predicate pushdown | Add explicit filters before join |

---

## Caching Layers

Snowflake provides three layers of caching. Understand each to optimize repeat query performance.

### 1. Metadata cache

- Automatic and always active
- Answers MIN, MAX, COUNT, and schema queries instantly
- No compute required (no warehouse credits consumed)

```sql
-- These resolve from metadata cache (no warehouse needed)
SELECT COUNT(*) FROM large_table;
SELECT MIN(created_at), MAX(created_at) FROM events;
```

### 2. Result cache

- Caches exact query results for 24 hours
- Returns instantly when the same query runs again with unchanged underlying data
- No compute credits consumed on cache hit
- Invalidated when underlying data changes

```sql
-- Second execution returns from result cache (0 credits)
SELECT region, COUNT(*) FROM orders GROUP BY region;
```

### 3. Local disk cache (warehouse cache)

- Each warehouse node caches micro-partition data on local SSD
- Speeds up subsequent queries scanning the same partitions
- Lost when warehouse suspends (data evicted from SSD)
- Reason to keep frequently used warehouses running (balance with cost)

### Optimize cache usage

- Route similar queries to the same warehouse to maximize local disk cache
- Avoid unnecessary query variation (whitespace, comments) that defeats result cache
- Set AUTO_SUSPEND high enough for frequently queried warehouses (e.g., 300 seconds)
- Use RESULT_SCAN to reuse results of a previous query in the same session

```sql
-- Reuse the result of the last query
SELECT * FROM TABLE(RESULT_SCAN(LAST_QUERY_ID())) WHERE region = 'us-east-1';
```

---

## Common Performance Anti-Patterns

### Avoid SELECT *
```sql
-- Bad: reads all columns, all partitions
SELECT * FROM events WHERE event_date = '2024-01-15';

-- Good: read only needed columns
SELECT event_id, event_type, user_id
FROM events
WHERE event_date = '2024-01-15';
```

### Avoid excessive CTEs
```sql
-- Bad: 10+ chained CTEs cause compilation overhead
-- Refactor into intermediate tables or materialized views for complex pipelines
```

### Avoid ORDER BY without LIMIT
```sql
-- Bad: sorts entire result set in memory
SELECT * FROM events ORDER BY created_at;

-- Good: limit sorted output
SELECT * FROM events ORDER BY created_at LIMIT 1000;
```

### Avoid cross-joins and Cartesian products
```sql
-- Verify join conditions produce expected row counts
-- Check query profile for "Join explosion" indicators
```
