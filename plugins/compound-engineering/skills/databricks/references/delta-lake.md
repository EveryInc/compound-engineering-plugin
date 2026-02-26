# Delta Lake Reference

Comprehensive patterns for Delta Lake table management on Databricks Runtime 13.3+.

## MERGE INTO Patterns

### SCD Type 1 (Overwrite Current Values)

Replace existing records with the latest values. Use for dimension tables where history is not required.

```sql
MERGE INTO catalog.schema.customers AS target
USING catalog.schema.customers_staging AS source
ON target.customer_id = source.customer_id
WHEN MATCHED THEN
  UPDATE SET
    target.name = source.name,
    target.email = source.email,
    target.address = source.address,
    target.updated_at = current_timestamp()
WHEN NOT MATCHED THEN
  INSERT (customer_id, name, email, address, created_at, updated_at)
  VALUES (source.customer_id, source.name, source.email, source.address, current_timestamp(), current_timestamp());
```

### SCD Type 2 (Track Full History)

Maintain historical records by closing old rows and inserting new versions. Use for slowly changing dimensions where audit history matters.

```sql
-- Step 1: Identify changed records and close them
MERGE INTO catalog.schema.customers_history AS target
USING (
  SELECT
    s.customer_id,
    s.name,
    s.email,
    s.address,
    current_timestamp() AS effective_from,
    CAST(NULL AS TIMESTAMP) AS effective_to,
    TRUE AS is_current
  FROM catalog.schema.customers_staging s
) AS source
ON target.customer_id = source.customer_id AND target.is_current = TRUE
WHEN MATCHED AND (
  target.name != source.name OR
  target.email != source.email OR
  target.address != source.address
) THEN
  UPDATE SET
    target.is_current = FALSE,
    target.effective_to = current_timestamp()
WHEN NOT MATCHED THEN
  INSERT (customer_id, name, email, address, effective_from, effective_to, is_current)
  VALUES (source.customer_id, source.name, source.email, source.address, source.effective_from, source.effective_to, source.is_current);

-- Step 2: Insert new current rows for changed records
INSERT INTO catalog.schema.customers_history
SELECT
  s.customer_id,
  s.name,
  s.email,
  s.address,
  current_timestamp() AS effective_from,
  NULL AS effective_to,
  TRUE AS is_current
FROM catalog.schema.customers_staging s
JOIN catalog.schema.customers_history h
  ON s.customer_id = h.customer_id
  AND h.is_current = FALSE
  AND h.effective_to = (SELECT MAX(effective_to) FROM catalog.schema.customers_history WHERE customer_id = s.customer_id);
```

### Deduplication MERGE

Remove duplicate records during upsert by selecting the most recent row per key.

```sql
MERGE INTO catalog.schema.events AS target
USING (
  SELECT * FROM (
    SELECT
      *,
      ROW_NUMBER() OVER (PARTITION BY event_id ORDER BY event_timestamp DESC) AS rn
    FROM catalog.schema.events_raw
  )
  WHERE rn = 1
) AS source
ON target.event_id = source.event_id
WHEN MATCHED THEN UPDATE SET *
WHEN NOT MATCHED THEN INSERT *;
```

### Conditional MERGE with Delete

Handle inserts, updates, and soft deletes in a single operation.

```sql
MERGE INTO catalog.schema.products AS target
USING catalog.schema.products_cdc AS source
ON target.product_id = source.product_id
WHEN MATCHED AND source.operation = 'DELETE' THEN DELETE
WHEN MATCHED AND source.operation = 'UPDATE' THEN
  UPDATE SET *
WHEN NOT MATCHED AND source.operation != 'DELETE' THEN
  INSERT *;
```

## OPTIMIZE and Clustering

### Liquid Clustering (DBR 13.3+, Recommended)

Liquid Clustering replaces both static partitioning and ZORDER. Databricks automatically manages file layout.

```sql
-- Create table with Liquid Clustering
CREATE TABLE catalog.schema.events (
  event_id BIGINT,
  event_type STRING,
  event_date DATE,
  user_id BIGINT
)
CLUSTER BY (event_date, event_type);

-- Trigger clustering optimization
OPTIMIZE catalog.schema.events;

-- Change clustering columns without rewriting data
ALTER TABLE catalog.schema.events CLUSTER BY (event_date, user_id);

-- Remove clustering
ALTER TABLE catalog.schema.events CLUSTER BY NONE;
```

Key advantages of Liquid Clustering:
- No need to specify columns at query time (unlike ZORDER)
- Automatic incremental clustering on write
- Columns can be changed without full table rewrite
- Works with both SQL and streaming writes

### Legacy ZORDER (Pre-13.3 or Existing Tables)

Use only for maintaining existing tables that have not migrated to Liquid Clustering.

```sql
-- Co-locate data by frequently filtered columns
OPTIMIZE catalog.schema.events
ZORDER BY (event_date, event_type);

-- Optimize specific partitions only
OPTIMIZE catalog.schema.events
WHERE event_date >= '2024-01-01'
ZORDER BY (event_type);
```

### Migration from ZORDER to Liquid Clustering

```sql
-- Drop existing ZORDER (no explicit command; just stop running ZORDER)
-- Enable Liquid Clustering
ALTER TABLE catalog.schema.events CLUSTER BY (event_date, event_type);

-- Run OPTIMIZE to apply new clustering
OPTIMIZE catalog.schema.events;
```

## Time Travel

### Query Historical Versions

```sql
-- Query by version number
SELECT * FROM catalog.schema.events VERSION AS OF 5;

-- Query by timestamp
SELECT * FROM catalog.schema.events TIMESTAMP AS OF '2024-06-15T10:30:00Z';

-- View table history
DESCRIBE HISTORY catalog.schema.events;

-- Compare two versions
SELECT * FROM catalog.schema.events VERSION AS OF 10
EXCEPT ALL
SELECT * FROM catalog.schema.events VERSION AS OF 9;
```

### Restore a Table

Roll back a table to a previous state. This creates a new version (does not remove history).

```sql
-- Restore by version
RESTORE TABLE catalog.schema.events VERSION AS OF 5;

-- Restore by timestamp
RESTORE TABLE catalog.schema.events TIMESTAMP AS OF '2024-06-15T10:30:00Z';
```

## VACUUM and Retention

VACUUM removes data files no longer referenced by the Delta log. Required for storage cost management and GDPR compliance.

```sql
-- Remove files older than 7 days (default retention = 168 hours)
VACUUM catalog.schema.events;

-- Specify custom retention period
VACUUM catalog.schema.events RETAIN 720 HOURS;

-- Dry run to preview files to delete
VACUUM catalog.schema.events DRY RUN;
```

**Retention rules:**
- Default retention: 168 hours (7 days)
- Minimum safe retention: must exceed longest running query or streaming job
- Setting retention below 168 hours requires `delta.deletedFileRetentionDuration` override
- Time travel queries fail for versions older than the vacuum threshold

```sql
-- Set table-level retention
ALTER TABLE catalog.schema.events
SET TBLPROPERTIES ('delta.deletedFileRetentionDuration' = 'interval 30 days');

-- Set log retention (how long commit history is kept)
ALTER TABLE catalog.schema.events
SET TBLPROPERTIES ('delta.logRetentionDuration' = 'interval 60 days');
```

## Change Data Feed (CDF)

Enable CDF to expose row-level changes for downstream consumers.

```sql
-- Enable on existing table
ALTER TABLE catalog.schema.events
SET TBLPROPERTIES ('delta.enableChangeDataFeed' = true);

-- Enable at creation
CREATE TABLE catalog.schema.events (
  event_id BIGINT,
  event_type STRING,
  event_date DATE
)
TBLPROPERTIES ('delta.enableChangeDataFeed' = true);

-- Read changes since version 2
SELECT * FROM table_changes('catalog.schema.events', 2);

-- Read changes in a timestamp range
SELECT * FROM table_changes('catalog.schema.events', '2024-06-01T00:00:00Z', '2024-06-02T00:00:00Z');
```

CDF columns added to output:
- `_change_type`: `insert`, `update_preimage`, `update_postimage`, `delete`
- `_commit_version`: Delta log version of the change
- `_commit_timestamp`: Timestamp of the commit

```python
# PySpark CDF read
changes = (spark.read.format("delta")
  .option("readChangeFeed", "true")
  .option("startingVersion", 2)
  .table("catalog.schema.events"))

changes.filter("_change_type IN ('insert', 'update_postimage')").display()
```

## Delta Table Properties

### Common Properties

```sql
ALTER TABLE catalog.schema.events SET TBLPROPERTIES (
  'delta.enableChangeDataFeed' = true,
  'delta.deletionVectors.enabled' = true,
  'delta.columnMapping.mode' = 'name',
  'delta.minReaderVersion' = '3',
  'delta.minWriterVersion' = '7',
  'delta.autoOptimize.optimizeWrite' = true,
  'delta.autoOptimize.autoCompact' = true,
  'delta.deletedFileRetentionDuration' = 'interval 30 days',
  'delta.logRetentionDuration' = 'interval 60 days',
  'delta.tuneFileSizesForRewrites' = true
);
```

### Column Mapping

Enable column rename and drop without full table rewrite (requires writer version 5+).

```sql
ALTER TABLE catalog.schema.events
SET TBLPROPERTIES ('delta.columnMapping.mode' = 'name');

-- Now column rename works
ALTER TABLE catalog.schema.events RENAME COLUMN old_name TO new_name;

-- Column drop works
ALTER TABLE catalog.schema.events DROP COLUMN deprecated_column;
```

## CREATE OR REPLACE TABLE

Use CORT for idempotent table definitions. Preserves table history and downstream dependencies.

```sql
CREATE OR REPLACE TABLE catalog.schema.daily_summary (
  summary_date DATE,
  total_events BIGINT,
  unique_users BIGINT,
  revenue DECIMAL(18, 2)
)
CLUSTER BY (summary_date)
TBLPROPERTIES (
  'delta.enableChangeDataFeed' = true
)
AS
SELECT
  event_date AS summary_date,
  COUNT(*) AS total_events,
  COUNT(DISTINCT user_id) AS unique_users,
  SUM(amount) AS revenue
FROM catalog.schema.events
GROUP BY event_date;
```

## Deletion Vectors

Deletion vectors mark rows as deleted without rewriting data files, improving DELETE and MERGE performance.

```sql
-- Enable deletion vectors
ALTER TABLE catalog.schema.events
SET TBLPROPERTIES ('delta.deletionVectors.enabled' = true);

-- Check if enabled
DESCRIBE DETAIL catalog.schema.events;
-- Look for 'deletionVectors' in table features
```

Deletion vectors are enabled by default on DBR 14.1+. They improve:
- DELETE operations (mark rows instead of rewriting files)
- MERGE with delete clauses
- UPDATE operations on wide tables
- OPTIMIZE compaction (cleans up deletion vectors)

Run `OPTIMIZE` periodically to compact deletion vectors back into base files for optimal read performance.
