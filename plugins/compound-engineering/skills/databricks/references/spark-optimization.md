# Spark Optimization Reference

Performance tuning patterns for PySpark and Spark SQL on Databricks Runtime 13.3+.

## Adaptive Query Execution (AQE)

AQE is enabled by default on Databricks. It dynamically optimizes query plans at runtime based on actual data statistics.

### Auto-Coalesce Shuffle Partitions

AQE automatically reduces the number of shuffle partitions after a shuffle stage based on actual data volume.

```python
# AQE handles partition count automatically; avoid manual overrides
# Default spark.sql.shuffle.partitions = 200 is a starting point that AQE adjusts

# Only override if AQE produces too many small files in output
spark.conf.set("spark.sql.adaptive.coalescePartitions.minPartitionSize", "64MB")
```

### Skew Join Handling

AQE detects skewed partitions and splits them automatically.

```python
# Enabled by default on Databricks
spark.conf.set("spark.sql.adaptive.skewJoin.enabled", "true")

# Adjust skew detection thresholds if needed
spark.conf.set("spark.sql.adaptive.skewJoin.skewedPartitionFactor", "5")
spark.conf.set("spark.sql.adaptive.skewJoin.skewedPartitionThresholdInBytes", "256MB")
```

**Manual skew mitigation** when AQE is insufficient:

```python
# Salt the join key to distribute skewed partitions
from pyspark.sql.functions import lit, rand, floor, concat, col

num_salts = 10

# Add salt to the skewed (large) table
skewed_df = large_df.withColumn("salt", floor(rand() * num_salts))
skewed_df = skewed_df.withColumn("salted_key", concat(col("join_key"), lit("_"), col("salt")))

# Explode the small table to match all salt values
from pyspark.sql.functions import explode, array
small_exploded = small_df.withColumn("salt", explode(array([lit(i) for i in range(num_salts)])))
small_exploded = small_exploded.withColumn("salted_key", concat(col("join_key"), lit("_"), col("salt")))

# Join on salted key
result = skewed_df.join(small_exploded, "salted_key")
```

### Dynamic Partition Pruning

AQE applies runtime partition pruning for star-schema joins.

```sql
-- AQE automatically prunes partitions when filtering through a dimension join
SELECT f.*, d.category_name
FROM catalog.schema.fct_sales f
JOIN catalog.schema.dim_products d
  ON f.product_id = d.product_id
WHERE d.category_name = 'Electronics';
-- Partitions of fct_sales not matching 'Electronics' products are pruned at runtime
```

## Broadcast Joins

Force a small table to be sent to all executors, eliminating shuffle. Default broadcast threshold is 10 MB.

```python
from pyspark.sql.functions import broadcast

# Explicit broadcast hint (recommended for clarity)
result = large_events.join(broadcast(dim_countries), "country_code")
```

```sql
-- SQL broadcast hint
SELECT /*+ BROADCAST(d) */ f.*, d.country_name
FROM catalog.schema.fct_events f
JOIN catalog.schema.dim_countries d
  ON f.country_code = d.country_code;
```

**When to use broadcast joins:**
- Small table fits in driver and executor memory (< 1 GB practical limit)
- One side of the join is orders of magnitude smaller than the other
- Avoid broadcasting when the small table is still large enough to cause OOM

```python
# Adjust auto-broadcast threshold (default 10 MB)
spark.conf.set("spark.sql.autoBroadcastJoinThreshold", "50MB")

# Disable auto-broadcast (force sort-merge join)
spark.conf.set("spark.sql.autoBroadcastJoinThreshold", "-1")
```

## Shuffle Optimization

### Repartition vs Coalesce

```python
# repartition: full shuffle, creates exactly N partitions
# Use when increasing partitions or redistributing data
df = df.repartition(200, "partition_key")

# coalesce: no shuffle, combines existing partitions
# Use only when reducing partitions (never to increase)
df = df.coalesce(10)

# Common pattern: repartition before write to control output file count
(df
  .repartition(50, "date_column")
  .write
  .format("delta")
  .mode("overwrite")
  .saveAsTable("catalog.schema.output"))
```

### Shuffle Partition Tuning

```python
# Set initial shuffle partitions (AQE adjusts at runtime)
spark.conf.set("spark.sql.shuffle.partitions", "auto")  # DBR 13.3+

# Rule of thumb without AQE: 2-3x the number of cores
# Example: 10 workers * 8 cores = 80 cores -> 160-240 shuffle partitions
```

### Avoiding Unnecessary Shuffles

```python
# Anti-pattern: groupBy followed by join on the same key shuffles twice
# Better: co-partition both DataFrames first

# Anti-pattern: multiple aggregations causing multiple shuffles
bad = df.groupBy("key").agg(count("*")).join(df.groupBy("key").agg(sum("value")), "key")

# Better: combine aggregations in a single groupBy
good = df.groupBy("key").agg(count("*").alias("cnt"), sum("value").alias("total"))
```

## Caching Strategies

### DataFrame Cache and Persist

```python
from pyspark import StorageLevel

# cache() = persist(StorageLevel.MEMORY_AND_DISK)
df.cache()
df.count()  # Materialize the cache

# persist with explicit storage level
df.persist(StorageLevel.MEMORY_AND_DISK_SER)  # Serialized, lower memory footprint

# Unpersist when done to free memory
df.unpersist()
```

**When to cache:**
- DataFrame reused multiple times in the same job
- After an expensive transformation (large join, aggregation)
- Never cache DataFrames read directly from Delta (Delta caching is automatic)

**When NOT to cache:**
- DataFrame used only once
- DataFrame is very large relative to cluster memory
- Reading from Delta tables (Databricks has automatic Delta caching)

### Delta Caching (Databricks-Specific)

Databricks automatically caches Delta table data on local SSDs. No code changes needed.

```python
# Delta caching is enabled by default on Databricks clusters
# Verify with:
spark.conf.get("spark.databricks.io.cache.enabled")  # Should be "true"

# Control cache size
spark.conf.set("spark.databricks.io.cache.maxDiskUsage", "50g")
spark.conf.set("spark.databricks.io.cache.maxMetaDataCache", "2g")
```

### Temporary Views for SQL Reuse

```python
# Create temp view for SQL-based reuse (no caching by default)
df.createOrReplaceTempView("filtered_events")

# Query multiple times
spark.sql("SELECT COUNT(*) FROM filtered_events WHERE event_type = 'click'")
spark.sql("SELECT event_date, COUNT(*) FROM filtered_events GROUP BY event_date")
```

## Partition Pruning and Predicate Pushdown

### Partition Pruning

```python
# Delta with Liquid Clustering: pruning is automatic
# Ensure filter columns match clustering columns
df = spark.table("catalog.schema.events").filter("event_date = '2024-06-15'")

# Check if pruning is applied
df.explain(True)  # Look for "PartitionFilters" or "PushedFilters" in the plan
```

### Predicate Pushdown

```python
# Predicates push down to Delta scan automatically
# Supported: =, <, >, <=, >=, IN, IS NULL, IS NOT NULL, BETWEEN, LIKE
# Not pushed down: UDF-based filters, complex expressions

# Good: pushdown works
df.filter("amount > 100 AND status = 'completed'")

# Bad: UDF prevents pushdown
from pyspark.sql.functions import udf
my_udf = udf(lambda x: x > 100)
df.filter(my_udf("amount"))  # Full table scan
```

### Column Pruning

```python
# Select only needed columns early to reduce I/O
# Good: read only required columns
df = spark.table("catalog.schema.wide_table").select("id", "name", "amount")

# Bad: select * then filter columns later
df = spark.table("catalog.schema.wide_table")  # Reads all columns from storage
df = df.select("id", "name", "amount")  # Too late, already read everything
# Note: Spark's optimizer may handle this, but explicit selection is clearer
```

## Common Performance Anti-Patterns

### Collect to Driver

```python
# Anti-pattern: collecting large datasets to driver
all_rows = df.collect()  # OOM risk on driver
for row in all_rows:
    process(row)

# Better: use distributed operations
df.foreach(process)
# Or write results to Delta and process downstream
```

### Python UDFs (Avoid When Possible)

```python
# Anti-pattern: Python UDF for simple logic
from pyspark.sql.functions import udf
from pyspark.sql.types import StringType

@udf(StringType())
def categorize(amount):
    if amount > 100:
        return "high"
    return "low"

df.withColumn("category", categorize("amount"))  # Slow: serializes data to Python

# Better: use built-in SQL expression
from pyspark.sql.functions import expr, when, col
df.withColumn("category", when(col("amount") > 100, "high").otherwise("low"))

# If UDF is unavoidable, use Pandas UDF (Arrow-based, vectorized)
import pandas as pd
from pyspark.sql.functions import pandas_udf

@pandas_udf(StringType())
def categorize_pandas(amounts: pd.Series) -> pd.Series:
    return amounts.apply(lambda x: "high" if x > 100 else "low")

df.withColumn("category", categorize_pandas("amount"))  # 10-100x faster than Python UDF
```

### Repeated Reads Without Caching

```python
# Anti-pattern: reading the same expensive computation multiple times
expensive = df.join(other_df, "key").groupBy("category").agg(sum("amount"))
result1 = expensive.filter("category = 'A'").count()
result2 = expensive.filter("category = 'B'").count()
# Spark recomputes the join + aggregation twice

# Better: cache the intermediate result
expensive = df.join(other_df, "key").groupBy("category").agg(sum("amount"))
expensive.cache()
expensive.count()  # Materialize
result1 = expensive.filter("category = 'A'").count()
result2 = expensive.filter("category = 'B'").count()
expensive.unpersist()
```

### Narrow Transformations After Wide

```python
# Anti-pattern: filter after join (processes more data than needed)
result = large_df.join(other_df, "key").filter("date > '2024-01-01'")

# Better: filter before join (reduces shuffle data)
filtered = large_df.filter("date > '2024-01-01'")
result = filtered.join(other_df, "key")
```

## Photon Engine

Photon is Databricks' native vectorized query engine written in C++. It accelerates SQL and DataFrame operations without code changes.

```python
# Photon is enabled at the cluster level, not in code
# Verify Photon is active
spark.conf.get("spark.databricks.photon.enabled")  # Should be "true"
```

**Photon benefits:**
- Scan, filter, aggregation, and join operations run 2-8x faster
- Most effective on wide tables with many columns
- Automatic; no code modification needed
- Works with Delta Lake, Parquet, CSV, and JSON

**Photon limitations:**
- Python UDFs still execute in Python (not accelerated)
- Streaming micro-batches may see less improvement
- Some complex expressions fall back to Spark JVM engine

**Cluster selection for Photon:**
- Use Photon-enabled cluster types (instance types ending in `d` or labeled Photon)
- Best ROI on I/O-heavy and aggregation-heavy workloads
- Compare cost vs. performance; Photon clusters cost more per DBU

## UDF Performance Guide

**Preference order (fastest to slowest):**

1. **Built-in functions and SQL expressions** - native Spark, fully optimized
2. **Pandas UDFs (vectorized)** - Arrow-based, batch processing, 10-100x faster than Python UDFs
3. **Scala UDFs** - JVM-native, no serialization overhead
4. **Python UDFs** - last resort, serialization penalty per row

```python
# Pandas UDF for complex logic
from pyspark.sql.functions import pandas_udf
from pyspark.sql.types import DoubleType
import pandas as pd

@pandas_udf(DoubleType())
def custom_score(value1: pd.Series, value2: pd.Series) -> pd.Series:
    return (value1 * 0.7) + (value2 * 0.3)

df.withColumn("score", custom_score("metric_a", "metric_b"))
```

```python
# Grouped Map Pandas UDF for per-group operations
from pyspark.sql.functions import pandas_udf, PandasUDFType

@pandas_udf("user_id long, prediction double", PandasUDFType.GROUPED_MAP)
def predict_per_user(pdf: pd.DataFrame) -> pd.DataFrame:
    # Train model per user group
    model = fit_model(pdf)
    pdf["prediction"] = model.predict(pdf[["feature1", "feature2"]])
    return pdf[["user_id", "prediction"]]

df.groupby("user_id").apply(predict_per_user)
```
