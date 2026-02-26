# Integration

Connect DuckDB with dbt, Python, Arrow, and cloud services. Understand dialect differences when migrating queries between DuckDB and Snowflake.

## DuckDB as dbt Adapter (dbt-duckdb)

### Installation

```bash
pip install dbt-duckdb
```

### Profile Configuration

```yaml
# ~/.dbt/profiles.yml
my_project:
  target: dev
  outputs:
    dev:
      type: duckdb
      path: dev.duckdb       # Persistent database file
      threads: 4
    memory:
      type: duckdb
      path: ':memory:'        # In-memory (ephemeral)
      threads: 4
```

### When to Use dbt-duckdb

- **Local development:** Run models on a laptop without cloud credentials
- **CI/CD testing:** Validate SQL logic without provisioning a warehouse
- **Prototyping:** Iterate on transformation logic before deploying to Snowflake or BigQuery
- **Small datasets:** Production use for datasets that fit in memory (single-digit GB)

### Limitations

- Single-writer: only one process can write at a time
- No concurrent multi-user access to the same database file
- Memory-bound for large datasets (no spill-to-disk for joins by default)
- Some Snowflake/BigQuery functions require replacement (see dialect differences below)

### Reading External Sources in dbt-duckdb

```yaml
# dbt_project.yml
plugins:
  - module: local
    config:
      external_root: ./seeds
```

```sql
-- models/staging/stg_events.sql
SELECT * FROM read_parquet('{{ env_var("DATA_PATH") }}/events/*.parquet')
```

## DuckDB + Python

### Basic Connection

```python
import duckdb

# In-memory database
con = duckdb.connect()

# Persistent database
con = duckdb.connect('my_data.duckdb')

# Execute queries
result = con.sql("SELECT 42 AS answer").fetchall()

# Close when done
con.close()
```

### Pandas Integration

```python
import duckdb
import pandas as pd

df = pd.DataFrame({'id': [1, 2, 3], 'value': [10, 20, 30]})

# Query a DataFrame directly (no import needed)
result = duckdb.sql("SELECT * FROM df WHERE value > 15").df()

# Register a DataFrame as a named virtual table
con = duckdb.connect()
con.register('my_table', df)
con.sql("SELECT sum(value) FROM my_table").show()

# Write query results back to DataFrame
output_df = con.sql("SELECT * FROM 'data.parquet' LIMIT 1000").df()
```

### Polars Integration

```python
import duckdb
import polars as pl

# Read Polars DataFrame
lf = pl.scan_parquet('data/*.parquet')
result = duckdb.sql("SELECT * FROM lf WHERE amount > 100").pl()

# DuckDB and Polars share Apache Arrow under the hood (zero-copy)
df = pl.DataFrame({'x': [1, 2, 3]})
duckdb.sql("SELECT sum(x) FROM df").show()
```

### Fetch Formats

```python
con = duckdb.connect()

# As list of tuples
con.sql("SELECT * FROM t").fetchall()

# As pandas DataFrame
con.sql("SELECT * FROM t").df()

# As Polars DataFrame
con.sql("SELECT * FROM t").pl()

# As Arrow Table
con.sql("SELECT * FROM t").arrow()

# As numpy arrays
con.sql("SELECT * FROM t").fetchnumpy()

# Streaming large results
reader = con.sql("SELECT * FROM large_table").fetch_arrow_reader(batch_size=10000)
for batch in reader:
    process(batch)
```

## DuckDB + Arrow (Zero-Copy Data Exchange)

DuckDB can read and write Apache Arrow tables without copying data:

```python
import duckdb
import pyarrow as pa
import pyarrow.parquet as pq

# Read Arrow table
arrow_table = pq.read_table('data.parquet')

# Query Arrow directly (zero-copy)
result = duckdb.sql("SELECT * FROM arrow_table WHERE id > 100").arrow()

# Arrow RecordBatchReader for streaming
reader = pq.ParquetFile('large.parquet').iter_batches(batch_size=50000)
con = duckdb.connect()
con.register('stream', reader)
con.sql("SELECT count(*) FROM stream").show()
```

Zero-copy exchange means DuckDB reads Arrow memory directly without deserialization. This makes DuckDB an efficient SQL engine for Arrow-native data pipelines.

## Dialect Differences: DuckDB vs Snowflake

### Array and JSON Flattening

```sql
-- Snowflake: LATERAL FLATTEN
SELECT f.value::STRING AS tag
FROM events,
LATERAL FLATTEN(input => tags) f;

-- DuckDB: UNNEST
SELECT unnest(tags) AS tag
FROM events;
```

### TRY_CAST Behavior

```sql
-- Snowflake: Returns NULL on failure
SELECT TRY_CAST('abc' AS INTEGER);  -- NULL

-- DuckDB: Same behavior, different type names
SELECT TRY_CAST('abc' AS INTEGER);  -- NULL
-- Note: Use INTEGER not INT in DuckDB for TRY_CAST
```

### Semi-Structured Data Access

```sql
-- Snowflake: Colon notation
SELECT payload:user:name::STRING FROM events;

-- DuckDB: Arrow or json_extract
SELECT payload->>'user'->>'name' FROM events;
SELECT json_extract_string(payload, '$.user.name') FROM events;
```

### Date and Time Functions

```sql
-- Snowflake
SELECT DATEADD('day', 7, current_date);
SELECT DATEDIFF('month', start_date, end_date);
SELECT TO_CHAR(ts, 'YYYY-MM-DD');

-- DuckDB
SELECT current_date + INTERVAL 7 DAY;
SELECT date_diff('month', start_date, end_date);
SELECT strftime(ts, '%Y-%m-%d');
```

### String Functions

```sql
-- Snowflake: LISTAGG
SELECT LISTAGG(name, ', ') WITHIN GROUP (ORDER BY name) FROM t;

-- DuckDB: STRING_AGG or LIST + ARRAY_TO_STRING
SELECT string_agg(name, ', ' ORDER BY name) FROM t;
```

### CREATE OR REPLACE

```sql
-- Snowflake: CREATE OR REPLACE TABLE
CREATE OR REPLACE TABLE t AS SELECT 1;

-- DuckDB: Same syntax supported
CREATE OR REPLACE TABLE t AS SELECT 1;
```

## Extensions

Install and load extensions for additional functionality:

```sql
-- Install once, load per session
INSTALL httpfs;
LOAD httpfs;
```

### Core Extensions

| Extension | Purpose |
|-----------|---------|
| `httpfs` | Read files over HTTP(S), S3, and GCS |
| `parquet` | Parquet read/write (included by default) |
| `json` | JSON read/write (included by default) |
| `spatial` | Geospatial types and functions (ST_Point, ST_Distance) |
| `excel` | Read/write Excel files (.xlsx) |
| `icu` | International Components for Unicode (collation, time zones) |
| `fts` | Full-text search with BM25 ranking |
| `tpch` | TPC-H benchmark data generator |
| `postgres_scanner` | Read directly from PostgreSQL |
| `sqlite_scanner` | Read directly from SQLite |
| `mysql_scanner` | Read directly from MySQL |

### Extension Usage Examples

```sql
-- Read Excel
INSTALL excel;
LOAD excel;
SELECT * FROM read_xlsx('report.xlsx', sheet = 'Q4');

-- Geospatial
INSTALL spatial;
LOAD spatial;
SELECT ST_Distance(
    ST_Point(-73.99, 40.74),
    ST_Point(-118.24, 34.05)
) AS distance_degrees;

-- Attach PostgreSQL
INSTALL postgres_scanner;
LOAD postgres_scanner;
ATTACH 'host=localhost dbname=mydb' AS pg (TYPE postgres);
SELECT * FROM pg.public.users LIMIT 10;
```

## MotherDuck (Cloud DuckDB)

MotherDuck provides a cloud-hosted DuckDB service with hybrid query execution.

### Connect

```sql
-- From DuckDB CLI
.open md:my_database

-- From Python
import duckdb
con = duckdb.connect('md:my_database')
```

### Hybrid Queries

MotherDuck executes queries across local and cloud data:

```sql
-- Local data joined with cloud data
SELECT l.*, r.segment
FROM local_events l
JOIN md_main.customer_segments r ON l.customer_id = r.customer_id;
```

### Share Data

```sql
-- Create a share (read-only access for others)
CREATE SHARE my_share FROM my_database;
```

### When to Use MotherDuck

- Share DuckDB databases across team members
- Persist analytical results beyond a local session
- Run queries on datasets too large for local memory
- Collaborate on data without managing infrastructure
