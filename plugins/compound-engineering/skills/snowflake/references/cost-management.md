# Snowflake Cost Management

Reference for credit consumption, warehouse sizing, resource monitors, query tagging, and cost optimization strategies.

---

## Credit Consumption Model

Snowflake charges based on compute credits consumed. Understand the primary cost drivers.

### Credit sources

| Service | Billing Model |
|---------|--------------|
| Virtual warehouses | Credits per hour based on size (prorated per second) |
| Serverless tasks | Credits per compute-second |
| Snowpipe | Credits per file notification + compute |
| Automatic Clustering | Credits for background re-clustering |
| Materialized view refresh | Credits for background maintenance |
| Search Optimization | Credits for maintaining search access paths |
| Query Acceleration | Credits proportional to accelerated compute |
| Replication | Credits for cross-region/cross-cloud replication |

### Storage costs

- Charged per TB per month (separate from compute credits)
- Includes active storage + Time Travel + Fail-safe
- Compressed storage (Snowflake compresses data automatically)
- Reduce storage costs by setting appropriate Time Travel retention

```sql
-- Set Time Travel retention per table
ALTER TABLE staging_events SET DATA_RETENTION_TIME_IN_DAYS = 1;
ALTER TABLE dim_customers SET DATA_RETENTION_TIME_IN_DAYS = 7;
```

---

## Warehouse Auto-Suspend and Auto-Resume

Proper suspend/resume configuration is the single largest lever for cost control.

### Configure every warehouse

```sql
CREATE WAREHOUSE etl_wh
    WAREHOUSE_SIZE = 'MEDIUM'
    AUTO_SUSPEND = 60          -- Suspend after 60 seconds of inactivity
    AUTO_RESUME = TRUE          -- Resume automatically on query submission
    INITIALLY_SUSPENDED = TRUE; -- Do not start running at creation time
```

### Suspend timing guidelines

| Workload Pattern | AUTO_SUSPEND | Rationale |
|-----------------|-------------|-----------|
| ELT batch jobs (scheduled) | 60 | Suspend immediately after job completes |
| BI dashboards (interactive) | 300 | Keep warm for rapid re-query within 5 min |
| Ad-hoc analytics | 60-120 | Short idle windows between queries |
| Dev/test | 60 | Minimize idle cost during development |
| CI/CD pipelines | 60 | Deterministic workload, no idle benefit |

### Auto-resume behavior

- Queries submitted to a suspended warehouse trigger automatic resume
- Resume takes 1-2 seconds for most warehouse sizes
- First query waits for resume; subsequent queries execute normally
- Set `AUTO_RESUME = TRUE` on all warehouses to avoid manual intervention

---

## Resource Monitors

Enforce budget limits with automated alerts and warehouse suspension.

### Create a resource monitor

```sql
-- Monthly budget with alerts at 75%, 90%, and hard stop at 100%
CREATE RESOURCE MONITOR monthly_budget
    WITH
        CREDIT_QUOTA = 1000
        FREQUENCY = MONTHLY
        START_TIMESTAMP = IMMEDIATELY
        TRIGGERS
            ON 75 PERCENT DO NOTIFY
            ON 90 PERCENT DO NOTIFY
            ON 100 PERCENT DO SUSPEND;
```

### Assign monitors to warehouses

```sql
-- Apply monitor to a specific warehouse
ALTER WAREHOUSE analytics_wh SET RESOURCE_MONITOR = monthly_budget;

-- Apply account-level monitor (ACCOUNTADMIN only)
ALTER ACCOUNT SET RESOURCE_MONITOR = account_budget;
```

### Monitor hierarchy

- **Account-level monitors** - cap total account spend; override warehouse-level monitors
- **Warehouse-level monitors** - cap spend for a specific warehouse
- Combine both: account-level as a safety net, warehouse-level for granular control

### Monitor actions

| Action | Behavior |
|--------|----------|
| NOTIFY | Send alert notification (email, webhook) |
| SUSPEND | Suspend warehouse after current queries complete |
| SUSPEND_IMMEDIATE | Suspend warehouse and cancel all running queries |

---

## Warehouse Sizing Guidelines

Choose the smallest warehouse that completes work within acceptable time.

### Size reference

| Size | Credits/Hr | Nodes | Typical Use Case |
|------|-----------|-------|------------------|
| XS   | 1         | 1     | Development, ad-hoc queries, light ELT |
| S    | 2         | 2     | Dashboards, moderate ELT, small transforms |
| M    | 4         | 4     | Production ELT, medium analytics |
| L    | 8         | 8     | Heavy transformations, large joins |
| XL   | 16        | 16    | Bulk data loads, complex aggregations |
| 2XL  | 32        | 32    | Very large data processing |
| 3XL  | 64        | 64    | Massive scale operations |
| 4XL  | 128       | 128   | Extreme workloads |
| 5XL  | 256       | 256   | Extreme workloads |
| 6XL  | 512       | 512   | Extreme workloads |

### Sizing strategy

- **Start small** - begin with XS or S, measure performance, scale up only if needed
- **Doubling rule** - each size up doubles compute AND cost; query runtime roughly halves for scan-heavy queries
- **Diminishing returns** - complex queries with many sequential steps do not scale linearly
- **Right-size per workload** - separate warehouses for ELT, BI, ad-hoc, and dev

### Separate warehouses by workload

```sql
CREATE WAREHOUSE etl_wh        WAREHOUSE_SIZE = 'MEDIUM' AUTO_SUSPEND = 60 AUTO_RESUME = TRUE;
CREATE WAREHOUSE bi_wh          WAREHOUSE_SIZE = 'SMALL'  AUTO_SUSPEND = 300 AUTO_RESUME = TRUE;
CREATE WAREHOUSE adhoc_wh       WAREHOUSE_SIZE = 'XSMALL' AUTO_SUSPEND = 60 AUTO_RESUME = TRUE;
CREATE WAREHOUSE dev_wh         WAREHOUSE_SIZE = 'XSMALL' AUTO_SUSPEND = 60 AUTO_RESUME = TRUE;
```

---

## Multi-Cluster Warehouses

Scale out for concurrency without scaling up for individual query performance.

### Configure multi-cluster

```sql
CREATE WAREHOUSE bi_wh
    WAREHOUSE_SIZE = 'SMALL'
    MIN_CLUSTER_COUNT = 1
    MAX_CLUSTER_COUNT = 4
    SCALING_POLICY = 'STANDARD'   -- or 'ECONOMY'
    AUTO_SUSPEND = 300
    AUTO_RESUME = TRUE;
```

### Scaling policies

| Policy | Behavior | Best For |
|--------|----------|----------|
| STANDARD | Add cluster as soon as a query queues | Low-latency interactive workloads |
| ECONOMY | Add cluster only after 6+ minutes of queuing | Cost-sensitive batch workloads |

### When to use multi-cluster

- Many concurrent users hitting the same warehouse
- Dashboard refresh storms during business hours
- Queries are fast individually but queue under load
- NOT a substitute for warehouse sizing (does not speed up individual queries)

---

## Query Tagging for Cost Attribution

Tag queries to attribute costs to teams, projects, or pipelines.

### Set query tags

```sql
-- Session-level tag (applies to all queries in the session)
ALTER SESSION SET QUERY_TAG = 'team:data-eng;pipeline:daily_refresh;env:prod';

-- Per-query tag via comment convention (for tools that do not support session tags)
SELECT /* team:analytics, dashboard:revenue */ *
FROM revenue_summary;
```

### Query cost attribution report

```sql
-- Aggregate credits consumed by query tag
SELECT
    query_tag,
    COUNT(*) AS query_count,
    SUM(credits_used_cloud_services) AS cloud_credits,
    SUM(total_elapsed_time) / 1000 AS total_seconds,
    SUM(bytes_scanned) / POWER(1024, 3) AS gb_scanned
FROM snowflake.account_usage.query_history
WHERE start_time >= DATEADD(DAY, -30, CURRENT_TIMESTAMP())
  AND query_tag IS NOT NULL
GROUP BY query_tag
ORDER BY cloud_credits DESC;
```

### Warehouse-level cost report

```sql
SELECT
    warehouse_name,
    SUM(credits_used) AS total_credits,
    SUM(credits_used_compute) AS compute_credits,
    SUM(credits_used_cloud_services) AS cloud_service_credits
FROM snowflake.account_usage.warehouse_metering_history
WHERE start_time >= DATEADD(DAY, -30, CURRENT_TIMESTAMP())
GROUP BY warehouse_name
ORDER BY total_credits DESC;
```

---

## Serverless vs Standard Warehouses

### Serverless features

These consume serverless credits (different rate than standard):
- Snowpipe
- Automatic Clustering
- Materialized view maintenance
- Search Optimization Service
- Tasks (serverless mode)
- Query Acceleration Service

### Standard warehouses

- User-managed compute with explicit sizing
- Full control over suspend/resume
- Predictable per-second billing
- Better for sustained, predictable workloads

### Decision framework

| Factor | Standard Warehouse | Serverless |
|--------|-------------------|------------|
| Workload pattern | Predictable, sustained | Sporadic, event-driven |
| Cost control | Warehouse size + monitors | Per-compute-second billing |
| Latency | Resume delay (1-2s) | Always available |
| Management overhead | Sizing and tuning required | Fully managed |

---

## Cost Optimization Checklist

### Immediate wins
- [ ] Set AUTO_SUSPEND = 60 on all non-interactive warehouses
- [ ] Set AUTO_RESUME = TRUE on all warehouses
- [ ] Create resource monitors with NOTIFY at 75% and SUSPEND at 100%
- [ ] Separate warehouses by workload (ELT, BI, ad-hoc, dev)
- [ ] Drop or reduce Time Travel on staging/temporary tables

### Query-level optimization
- [ ] Eliminate SELECT * in production queries
- [ ] Add LIMIT to exploratory queries
- [ ] Use clustering keys on tables > 1 TB with consistent filter patterns
- [ ] Review queries scanning > 50% of table partitions
- [ ] Enable Query Acceleration Service on scan-heavy ad-hoc warehouses

### Governance
- [ ] Implement query tagging for cost attribution
- [ ] Review warehouse metering history weekly
- [ ] Right-size warehouses based on actual query performance
- [ ] Set STATEMENT_TIMEOUT_IN_SECONDS to prevent runaway queries
- [ ] Audit and remove unused warehouses, schemas, and tables

### Storage
- [ ] Set appropriate DATA_RETENTION_TIME_IN_DAYS per table criticality
- [ ] Drop TRANSIENT tables after pipeline completion
- [ ] Use TEMPORARY tables for session-scoped intermediate results
- [ ] Monitor storage costs via `snowflake.account_usage.storage_usage`

```sql
-- Find expensive warehouses with low utilization
SELECT
    warehouse_name,
    SUM(credits_used) AS total_credits,
    AVG(avg_running) AS avg_queries_running,
    AVG(avg_queued_load) AS avg_queued
FROM snowflake.account_usage.warehouse_metering_history
WHERE start_time >= DATEADD(DAY, -30, CURRENT_TIMESTAMP())
GROUP BY warehouse_name
HAVING SUM(credits_used) > 100 AND AVG(avg_running) < 1
ORDER BY total_credits DESC;
```
