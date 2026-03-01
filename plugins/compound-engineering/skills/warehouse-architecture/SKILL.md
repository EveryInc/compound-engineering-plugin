---
name: warehouse-architecture
description: Data warehouse design patterns including star schema, Data Vault 2.0, medallion architecture, and slowly changing dimensions. Use when designing fact and dimension tables, choosing modeling methodology, or evaluating architecture trade-offs.
user-invocable: false
---

# Data Warehouse Architecture

Design robust, scalable data warehouses by selecting the right modeling methodology, layering strategy, and storage format for the use case at hand.

## Pattern Selection Decision Tree

Choose a modeling methodology based on organizational needs and data landscape:

```
START
  |
  v
How many source systems feed the warehouse?
  |
  |-- 1-3 sources, stable schemas, known business requirements
  |     --> Kimball Star Schema (fastest to value)
  |
  |-- 4+ sources, frequent schema changes, auditability required
  |     --> Data Vault 2.0 (flexible, auditable, parallel-loadable)
  |
  |-- Cloud-native platform (Databricks, Snowflake, BigQuery)
  |   with streaming + batch ingestion needs
  |     --> Medallion Architecture (bronze/silver/gold layers)
  |
  v
Need to combine approaches?
  |
  |-- Yes: Use the 2025 Hybrid Pattern (see below)
  |-- No: Proceed with single methodology
```

**Quick selection matrix:**

| Factor | Kimball | Data Vault 2.0 | Medallion |
|--------|---------|-----------------|-----------|
| Time to first report | Days | Weeks | Days |
| Schema change tolerance | Low | High | High |
| Full history by default | No (needs SCD) | Yes (satellites) | Depends on layer |
| Source system count | Few | Many | Any |
| Auditability | Moderate | Excellent | Moderate |
| Team skill requirement | SQL + business | Specialized DV | Platform-specific |
| Best platform fit | Any RDBMS | Any RDBMS | Lakehouse (Spark, Databricks) |

## Medallion-to-dbt Layer Mapping

Map medallion architecture layers directly to dbt project structure:

| Medallion Layer | dbt Layer | Directory | Purpose |
|-----------------|-----------|-----------|---------|
| Bronze | Staging | `models/staging/` | Raw ingestion, 1:1 with source, light renaming |
| Silver | Intermediate | `models/intermediate/` | Cleaned, deduplicated, typed, conformed |
| Gold | Marts | `models/marts/` | Business-facing aggregates, star schemas |

**Naming conventions per layer:**
- Bronze/Staging: `stg_<source>__<entity>.sql`
- Silver/Intermediate: `int_<entity>_<verb>.sql`
- Gold/Marts: `fct_<entity>.sql`, `dim_<entity>.sql`

## The 2025 Hybrid Pattern

Combine Data Vault 2.0 and Kimball star schemas in a single warehouse for maximum flexibility and query performance:

```
Sources --> Bronze (raw ingestion)
              |
              v
            Silver (Data Vault 2.0)
              |  Hubs, Links, Satellites
              |  Full history, parallel loading
              |  Auditable, schema-change tolerant
              v
            Gold (Kimball Star Schemas)
              |  Fact + dimension tables
              |  Optimized for BI tools
              |  Conformed dimensions across subject areas
              v
            Consumption (OBT / Metrics Layer)
```

**Why this hybrid works:**
- Silver (Data Vault) absorbs source complexity, schema drift, and provides full audit history
- Gold (Kimball) delivers fast, intuitive query patterns that BI tools and analysts expect
- Separation of concerns: ingestion flexibility in silver, query performance in gold
- Each layer can evolve independently without breaking downstream consumers

**Implementation in dbt:**
- `models/staging/` -- bronze: source-conformed staging models
- `models/intermediate/` -- silver: raw vault hubs, links, satellites; business vault bridges and PITs
- `models/marts/` -- gold: dimensional star schemas built from vault structures

## OBT (One Big Table) as Consumption Layer

Treat the One Big Table as a downstream derivative of the gold layer, not a primary modeling strategy:

- Join all relevant facts and dimensions into a single wide, denormalized table
- Materialize as a table or incremental model for dashboard performance
- Scope each OBT to a single analytical domain (e.g., `obt_sales`, `obt_marketing`)
- Accept controlled redundancy in exchange for query simplicity
- Rebuild OBTs from star schemas; never treat them as source of truth
- Place in `models/marts/` or a dedicated `models/consumption/` directory

**When OBT is appropriate:**
- Self-serve analytics where users cannot write joins
- BI tools that perform best against flat tables
- Embedded analytics with strict latency requirements

**When OBT is not appropriate:**
- As a replacement for proper dimensional modeling
- When the table exceeds hundreds of columns (split into domain-scoped OBTs)
- When different consumers need different grains

## Activity Schema Standard

Activity Schema provides a unified event modeling pattern for customer behavioral data:

**Core structure:**
- Single `activity_stream` table containing all customer events
- Each row: `activity_id`, `entity_id`, `activity`, `ts`, `feature_1..N`, `revenue_impact`
- Activities are verb-based: `completed_order`, `viewed_page`, `submitted_form`
- Features are positional columns reused across activity types (feature_1 = order_total for `completed_order`, page_url for `viewed_page`)

**Key conventions:**
- One entity type per activity stream (customer, account, device)
- Append-only; no updates to historical records
- Aggregation happens at query time or in downstream models
- Self-join patterns to compute sessionization, funnels, and retention

**When to use Activity Schema:**
- Product analytics and behavioral tracking
- Customer 360 use cases requiring a single event backbone
- Teams standardizing disparate event sources into a common format

## Open Table Format Comparison

Compare Apache Iceberg, Delta Lake, and Apache Hudi for lakehouse storage:

| Capability | Apache Iceberg | Delta Lake | Apache Hudi |
|------------|---------------|------------|-------------|
| ACID transactions | Yes | Yes | Yes |
| Time travel | Yes (snapshot-based) | Yes (log-based) | Yes (timeline-based) |
| Schema evolution | Full (add, drop, rename, reorder) | Add/rename columns | Add columns |
| Partition evolution | Yes (hidden partitioning) | Manual rewrite | Manual rewrite |
| Engine support | Spark, Trino, Flink, Dremio, Snowflake, BigQuery | Spark, Trino (limited), Databricks | Spark, Flink, Trino (limited) |
| Ecosystem lock-in | Low (engine-agnostic) | Medium (Databricks-optimized) | Medium (Uber-originated) |
| Compaction | Automatic + manual | Optimize command | Built-in cleaning |
| Streaming support | Flink integration | Structured Streaming | Native streaming ingestion |
| Best fit | Multi-engine lakehouse | Databricks-centric stack | Near-real-time ingestion |

**Decision guidance:**
- Default to Iceberg for engine-agnostic lakehouse architectures
- Choose Delta Lake when running primarily on Databricks
- Choose Hudi when near-real-time upserts and CDC are the primary use case

## Reference Index

| File | Topics |
|------|--------|
| [kimball.md](./references/kimball.md) | Star schema, fact tables, dimension types, conformed dimensions, grain, surrogate keys |
| [data-vault.md](./references/data-vault.md) | Hubs, Links, Satellites, hash keys, Business Vault, loading patterns |
| [medallion.md](./references/medallion.md) | Bronze/silver/gold layers, open table formats, lakehouse architecture |
| [scd.md](./references/scd.md) | Slowly changing dimensions Types 0-6, dbt snapshots, OBT pattern |
