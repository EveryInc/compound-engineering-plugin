---
name: databricks
description: Build Databricks notebooks, Spark SQL queries, and Delta Lake pipelines. Use when working with Databricks workspaces, writing PySpark or Spark SQL, configuring Delta Lake tables, or managing Unity Catalog assets.
---

# Databricks

Build production-grade Databricks notebooks, Spark SQL queries, Delta Lake pipelines, and Unity Catalog configurations. This skill covers Delta Lake table management, Unity Catalog governance, Spark performance tuning, and Terraform-based infrastructure provisioning for Databricks Runtime 13.3+.

## Essential Conventions

**Unity Catalog namespace:** Always use the three-level namespace `catalog.schema.table`. Never use legacy hive_metastore references in new code.

**Table creation:** Use Liquid Clustering for all new Delta tables (DBR 13.3+). Legacy ZORDER and static partitioning are deprecated for new workloads.

```sql
CREATE TABLE catalog.schema.events (
  event_id BIGINT,
  event_type STRING,
  event_date DATE,
  payload STRING
)
CLUSTER BY (event_date, event_type);
```

**Delta Lake defaults:**
- All tables are Delta format (no need to specify `USING DELTA`)
- Enable Change Data Feed on tables consumed by downstream pipelines
- Set `delta.deletionVectors.enabled = true` for faster deletes and merges

**Authentication:** Use service principals for all automated workloads. Never inline tokens or passwords. Store credentials in Databricks secrets or environment variables.

```python
# Correct: environment variable
import os
token = os.environ["DATABRICKS_TOKEN"]

# Wrong: hardcoded token
token = "dapi1234567890abcdef"  # NEVER do this
```

<intake>
What are you working on?

1. **Delta Lake** - MERGE, OPTIMIZE, time travel, VACUUM, Change Data Feed, table properties
2. **Unity Catalog** - Namespaces, permissions, external locations, Delta Sharing, lineage
3. **Spark Optimization** - AQE, broadcast joins, shuffle tuning, caching, Photon, UDFs
4. **Terraform** - Provider setup, workspace resources, Unity Catalog IaC, secrets management

**Specify a number or describe your task.**
</intake>

<routing>

| Response | Reference to Read |
|----------|-------------------|
| 1, delta, merge, optimize, vacuum, time travel, cdf, table | [delta-lake.md](./references/delta-lake.md) |
| 2, unity, catalog, permissions, grant, sharing, lineage, namespace | [unity-catalog.md](./references/unity-catalog.md) |
| 3, spark, performance, aqe, broadcast, shuffle, cache, photon, udf | [spark-optimization.md](./references/spark-optimization.md) |
| 4, terraform, infrastructure, iac, provider, cluster, job, secret | [terraform.md](./references/terraform.md) |

**After reading relevant references, apply patterns to the user's Databricks code.**
</routing>

<quick_reference>
## Common Spark SQL Patterns

```sql
-- Upsert with MERGE
MERGE INTO catalog.schema.target AS t
USING catalog.schema.source AS s
ON t.id = s.id
WHEN MATCHED THEN UPDATE SET *
WHEN NOT MATCHED THEN INSERT *;

-- Incremental read with Change Data Feed
SELECT * FROM table_changes('catalog.schema.events', 2)
WHERE _change_type IN ('insert', 'update_postimage');

-- Time travel
SELECT * FROM catalog.schema.events VERSION AS OF 5;
SELECT * FROM catalog.schema.events TIMESTAMP AS OF '2024-01-15T00:00:00Z';

-- Optimize with Liquid Clustering (replaces ZORDER)
OPTIMIZE catalog.schema.events;

-- Vacuum stale files
VACUUM catalog.schema.events RETAIN 168 HOURS;
```

## Common PySpark Patterns

```python
# Read Delta table via Unity Catalog
df = spark.table("catalog.schema.events")

# Write with merge schema evolution
(df.write
   .format("delta")
   .mode("append")
   .option("mergeSchema", "true")
   .saveAsTable("catalog.schema.events"))

# Broadcast small dimension table
from pyspark.sql.functions import broadcast
result = large_df.join(broadcast(small_df), "key")

# Prefer SQL expressions over Python UDFs
from pyspark.sql.functions import expr
df.withColumn("category", expr("CASE WHEN amount > 100 THEN 'high' ELSE 'low' END"))
```

## Unity Catalog Grants

```sql
-- Grant read access to a group
GRANT SELECT ON TABLE catalog.schema.events TO `data-readers`;

-- Grant schema-level write access
GRANT CREATE TABLE, MODIFY ON SCHEMA catalog.schema TO `data-engineers`;

-- Grant catalog browse
GRANT USE CATALOG ON CATALOG catalog TO `all-users`;
GRANT USE SCHEMA ON SCHEMA catalog.schema TO `all-users`;
```
</quick_reference>

<reference_index>
## Detailed Reference Files

| File | Topics |
|------|--------|
| [delta-lake.md](./references/delta-lake.md) | MERGE patterns, OPTIMIZE, Liquid Clustering, time travel, VACUUM, CDF, deletion vectors |
| [unity-catalog.md](./references/unity-catalog.md) | Three-level namespace, GRANT/REVOKE, external locations, Delta Sharing, lineage, tagging |
| [spark-optimization.md](./references/spark-optimization.md) | AQE, broadcast joins, shuffle tuning, caching, Photon, partition pruning, UDF performance |
| [terraform.md](./references/terraform.md) | Provider setup, clusters, jobs, Unity Catalog IaC, secrets, service principal auth |
</reference_index>

<security>
## Security Requirements

- Authenticate automated workloads with service principals, not personal access tokens
- Store tokens and secrets in Databricks secret scopes or environment variables
- Never commit `.env` files, tokens, or credentials to version control
- Use Unity Catalog for access control instead of legacy table ACLs
- Enable audit logging on workspaces handling sensitive data
- Restrict cluster creation to approved policies via cluster policies
</security>
