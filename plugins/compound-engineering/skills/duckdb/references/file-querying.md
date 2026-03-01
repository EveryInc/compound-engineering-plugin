# File Querying

Read and write Parquet, CSV, JSON, and other file formats directly with SQL. DuckDB treats files as virtual tables without requiring explicit import.

## Reading Parquet Files

### Single File

```sql
SELECT * FROM 'path/to/file.parquet';

-- Or explicitly
SELECT * FROM read_parquet('path/to/file.parquet');
```

### Glob Patterns

```sql
-- All Parquet files in a directory
SELECT * FROM 'data/*.parquet';

-- Recursive glob
SELECT * FROM 'data/**/*.parquet';

-- Multiple specific files
SELECT * FROM read_parquet(['file1.parquet', 'file2.parquet']);
```

### Partitioned Parquet (Hive-Style)

```sql
-- Automatically detect Hive partition columns (year=2024/month=01/data.parquet)
SELECT * FROM read_parquet('data/**/*.parquet', hive_partitioning = true);

-- Filter pushdown on partition columns (avoids reading unnecessary files)
SELECT * FROM read_parquet('data/**/*.parquet', hive_partitioning = true)
WHERE year = 2024 AND month = 6;
```

### Include Filename Column

```sql
-- Add a column showing which file each row came from
SELECT *, filename FROM read_parquet('data/*.parquet', filename = true);
```

### Schema Merging

```sql
-- Union files with different schemas (missing columns become NULL)
SELECT * FROM read_parquet('data/*.parquet', union_by_name = true);
```

## Reading CSV Files

### Basic CSV

```sql
SELECT * FROM 'data.csv';

-- Auto-detect delimiter, header, types
SELECT * FROM read_csv_auto('data.csv');
```

### CSV with Options

```sql
SELECT * FROM read_csv('data.csv',
    header = true,
    delim = '|',
    quote = '"',
    escape = '\\',
    dateformat = '%Y-%m-%d',
    timestampformat = '%Y-%m-%d %H:%M:%S',
    nullstr = 'NA',
    skip = 2,
    max_line_size = 1048576
);
```

### Explicit Column Types

```sql
SELECT * FROM read_csv('data.csv',
    columns = {
        'id': 'INTEGER',
        'name': 'VARCHAR',
        'amount': 'DECIMAL(10,2)',
        'created_at': 'TIMESTAMP'
    }
);
```

### Sample Rows for Inspection

```sql
-- Preview structure and types
DESCRIBE SELECT * FROM 'data.csv';

-- First 10 rows
SELECT * FROM 'data.csv' LIMIT 10;
```

### Multiple CSV Files

```sql
-- Glob with consistent schema
SELECT * FROM read_csv('logs_*.csv', header = true);

-- Union files with different columns
SELECT * FROM read_csv('reports/*.csv', union_by_name = true);
```

## Reading JSON Files

### Auto-Detect Structure

```sql
-- Newline-delimited JSON (one object per line)
SELECT * FROM 'events.json';

-- JSON array file
SELECT * FROM read_json('data.json', format = 'array');
```

### Nested JSON

```sql
-- Access nested fields
SELECT
    data->>'id' AS id,
    data->'address'->>'city' AS city,
    data->'tags'->>0 AS first_tag
FROM read_json('records.json');
```

### JSON with Explicit Schema

```sql
SELECT * FROM read_json('events.json',
    columns = {
        'event_id': 'VARCHAR',
        'payload': 'JSON',
        'timestamp': 'TIMESTAMP'
    }
);
```

### Newline-Delimited JSON (NDJSON)

```sql
-- Explicitly set format for .ndjson or .jsonl files
SELECT * FROM read_json('logs.ndjson', format = 'newline_delimited');
```

## Querying Files Over HTTP(S)

```sql
-- Remote Parquet
SELECT * FROM 'https://example.com/data/events.parquet';

-- Remote CSV
SELECT * FROM read_csv('https://example.com/data/report.csv');

-- S3 (requires httpfs extension)
INSTALL httpfs;
LOAD httpfs;
SET s3_region = 'us-east-1';
SET s3_access_key_id = 'KEY';
SET s3_secret_access_key = 'SECRET';
SELECT * FROM 's3://bucket/path/data.parquet';

-- GCS
SET s3_endpoint = 'storage.googleapis.com';
SELECT * FROM 's3://bucket/path/data.parquet';
```

**Security:** Validate all URLs before querying. Never construct URLs from untrusted user input. Remote file reads can expose internal network resources (SSRF).

## Hive Partitioning

Hive partitioning encodes column values in directory names:

```
data/
  year=2023/
    month=01/
      part-001.parquet
    month=02/
      part-001.parquet
  year=2024/
    month=01/
      part-001.parquet
```

```sql
-- Enable Hive partitioning (auto-detects partition columns)
SELECT * FROM read_parquet('data/**/*.parquet', hive_partitioning = true);

-- Partition columns are available for filtering
SELECT * FROM read_parquet('data/**/*.parquet', hive_partitioning = true)
WHERE year = 2024;

-- Hive partitioning also works with CSV
SELECT * FROM read_csv('data/**/*.csv', hive_partitioning = true);
```

## COPY TO for Writing Files

### Write Parquet

```sql
-- Write query results to Parquet
COPY (SELECT * FROM sales WHERE year = 2024)
TO 'output/sales_2024.parquet' (FORMAT PARQUET);

-- With compression
COPY (SELECT * FROM events)
TO 'output/events.parquet' (FORMAT PARQUET, COMPRESSION ZSTD);

-- Partitioned output
COPY (SELECT * FROM events)
TO 'output/events' (FORMAT PARQUET, PARTITION_BY (year, month));
```

### Write CSV

```sql
COPY (SELECT * FROM results)
TO 'output/results.csv' (FORMAT CSV, HEADER true, DELIMITER ',');

-- With specific options
COPY (SELECT * FROM results)
TO 'output/results.tsv' (FORMAT CSV, HEADER true, DELIMITER '\t', QUOTE '"');
```

### Write JSON

```sql
COPY (SELECT * FROM records)
TO 'output/records.json' (FORMAT JSON);

-- Newline-delimited JSON
COPY (SELECT * FROM records)
TO 'output/records.ndjson' (FORMAT JSON, ARRAY false);
```

## Combining Multiple File Formats

```sql
-- Join CSV and Parquet directly
SELECT c.customer_name, p.total_amount
FROM 'customers.csv' c
JOIN 'purchases.parquet' p ON c.id = p.customer_id;

-- UNION across formats
SELECT 'csv' AS source, * FROM 'legacy_data.csv'
UNION ALL
SELECT 'parquet' AS source, * FROM 'current_data.parquet';

-- Create a table from mixed sources
CREATE TABLE combined AS
SELECT * FROM 'data_2023.csv'
UNION ALL BY NAME
SELECT * FROM 'data_2024.parquet';
```

## Glob Patterns for File Discovery

```sql
-- List files matching a pattern (useful for debugging)
SELECT * FROM glob('data/**/*.parquet');

-- Count rows per file
SELECT filename, count(*) AS row_count
FROM read_parquet('data/*.parquet', filename = true)
GROUP BY filename
ORDER BY row_count DESC;

-- Schema inspection across files
DESCRIBE SELECT * FROM 'data/*.parquet';
```

### Pattern Reference

| Pattern | Matches |
|---------|---------|
| `*` | Any characters in a single directory level |
| `**` | Any characters across directory levels (recursive) |
| `?` | Single character |
| `[abc]` | Character class |
| `{a,b}` | Alternation |

## Performance Tips

- Filter on Hive partition columns to skip reading unnecessary files
- Use `LIMIT` during exploration to avoid scanning entire datasets
- Parquet column pruning: selecting specific columns avoids reading unused data
- Enable `filename = true` to trace data provenance without modifying source files
- Use `DESCRIBE` to inspect schema before writing large queries
- Prefer `ZSTD` compression for Parquet output (best compression ratio)
