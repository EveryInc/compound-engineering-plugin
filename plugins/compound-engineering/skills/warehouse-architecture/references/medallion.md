# Medallion Architecture

The medallion (multi-hop) architecture organizes data into bronze, silver, and gold layers. Each layer progressively refines data quality, structure, and business relevance.

## Bronze Layer

Raw ingestion layer. Capture source data as-is with minimal transformation:

```
bronze/
├── crm/
│   ├── accounts/          -- raw JSON/Parquet from CRM API
│   └── contacts/
├── erp/
│   ├── orders/            -- raw extracts from ERP
│   └── inventory/
└── events/
    └── clickstream/       -- raw event stream (Kafka, Kinesis)
```

**Bronze layer principles:**
- Append-only ingestion: never delete or update raw records
- Schema-on-read: store in source format (JSON, CSV, Parquet) without enforcing schema
- Include ingestion metadata: `_loaded_at`, `_source_file`, `_batch_id`
- Retain full fidelity: no filtering, no deduplication, no type casting
- Partition by ingestion date for efficient scanning and retention management
- Serve as the system of record for reprocessing: if silver logic changes, replay from bronze

**dbt mapping:** `models/staging/` -- source-conformed models with light renaming, 1:1 with source tables

**Materialization:** External tables pointing to raw files, or incremental models with append-only strategy.

```sql
-- Example bronze/staging model in dbt
-- models/staging/crm/stg_crm__accounts.sql
WITH source AS (
    SELECT * FROM {{ source('crm', 'accounts') }}
),

renamed AS (
    SELECT
        id              AS account_id,
        name            AS account_name,
        created_date    AS created_at,
        _loaded_at,
        _source_file
    FROM source
)

SELECT * FROM renamed
```

## Silver Layer

Cleaned, conformed, and deduplicated data. Apply quality rules and integrate across sources:

```
silver/
├── customers/         -- deduplicated, typed, conformed customer entity
├── orders/            -- cleaned orders with valid foreign keys
├── products/          -- merged product catalog across sources
└── events/
    └── sessions/      -- sessionized clickstream data
```

**Silver layer principles:**
- Enforce schema: cast to correct types, reject or quarantine invalid records
- Deduplicate: apply business rules to resolve duplicate records across sources
- Conform: standardize naming, date formats, currency codes, and reference data
- Apply referential integrity: validate foreign keys across entities
- Maintain full history: use SCD Type 2 or append-only with validity windows
- Track data lineage: retain source system identifiers alongside conformed keys

**dbt mapping:** `models/intermediate/` -- joined, cleaned, and conformed models

**Materialization:** Incremental models with merge or delete+insert strategy.

```sql
-- Example silver/intermediate model in dbt
-- models/intermediate/int_customers_deduplicated.sql
WITH ranked AS (
    SELECT
        *,
        ROW_NUMBER() OVER (
            PARTITION BY customer_id
            ORDER BY _loaded_at DESC
        ) AS row_num
    FROM {{ ref('stg_crm__customers') }}
)

SELECT
    customer_id,
    customer_name,
    email,
    CAST(created_at AS TIMESTAMP) AS created_at,
    _loaded_at
FROM ranked
WHERE row_num = 1
```

**Silver layer in the hybrid pattern (Data Vault 2.0):**
When using the 2025 hybrid pattern, the silver layer contains raw vault structures:
- Hubs, links, and satellites instead of flat conformed tables
- Hash keys for parallel loading and deduplication
- Full audit trail through satellite history
- See [data-vault.md](./data-vault.md) for implementation details

## Gold Layer

Business-facing, consumption-ready data. Optimize for analytics, reporting, and BI tool performance:

```
gold/
├── finance/
│   ├── fct_revenue.sql
│   └── dim_account.sql
├── marketing/
│   ├── fct_campaigns.sql
│   └── dim_channel.sql
└── product/
    ├── fct_usage.sql
    └── dim_feature.sql
```

**Gold layer principles:**
- Organize by business domain (finance, marketing, product, sales)
- Denormalize for query performance: star schemas, wide tables, or OBTs
- Apply business logic: calculated metrics, KPI definitions, business rules
- Use conformed dimensions across domain-specific fact tables
- Materialize as tables for dashboard performance
- Version business logic: changes to gold models require review and testing

**dbt mapping:** `models/marts/` -- fact and dimension tables, domain-scoped

**Materialization:** Table or incremental with merge strategy.

```sql
-- Example gold/marts model in dbt
-- models/marts/finance/fct_revenue.sql
SELECT
    o.order_id,
    o.order_date,
    c.customer_key,
    p.product_key,
    o.quantity,
    o.unit_price,
    o.quantity * o.unit_price AS gross_revenue,
    o.discount_amount,
    (o.quantity * o.unit_price) - o.discount_amount AS net_revenue
FROM {{ ref('int_orders_cleaned') }} o
JOIN {{ ref('dim_customer') }} c ON o.customer_id = c.customer_id
JOIN {{ ref('dim_product') }} p ON o.product_id = p.product_id
```

## Mapping to dbt Layers

Complete mapping between medallion layers and dbt project structure:

| Medallion | dbt Layer | Directory | Materialization | Naming Convention |
|-----------|-----------|-----------|-----------------|-------------------|
| Bronze | Staging | `models/staging/<source>/` | View or incremental (append) | `stg_<source>__<entity>` |
| Silver | Intermediate | `models/intermediate/` | Incremental (merge) | `int_<entity>_<verb>` |
| Gold | Marts | `models/marts/<domain>/` | Table or incremental (merge) | `fct_<entity>`, `dim_<entity>` |
| Consumption | Marts or Consumption | `models/marts/` or `models/consumption/` | Table | `obt_<domain>`, `rpt_<entity>` |

**dbt_project.yml configuration:**

```yaml
models:
  my_project:
    staging:
      +materialized: view
      +schema: bronze
    intermediate:
      +materialized: incremental
      +schema: silver
    marts:
      +materialized: table
      +schema: gold
```

## Open Table Formats Comparison

### Apache Iceberg

- Engine-agnostic: works with Spark, Trino, Flink, Dremio, Snowflake, BigQuery
- Hidden partitioning: partition columns are metadata, not physical directory layout
- Partition evolution: change partitioning strategy without rewriting data
- Schema evolution: add, drop, rename, reorder columns without table rewrite
- Snapshot isolation with time travel via manifest lists
- Best fit: multi-engine lakehouse, avoiding vendor lock-in

### Delta Lake

- Deep Spark and Databricks integration with Unity Catalog
- Transaction log (JSON-based `_delta_log/`) for ACID compliance
- Z-ORDER optimization for multi-column filtering
- Change Data Feed (CDF) for downstream CDC consumption
- Liquid Clustering (Databricks) for automatic file organization
- Best fit: Databricks-centric analytics stack

### Apache Hudi

- Copy-on-write and merge-on-read table types
- Built-in CDC and incremental processing from day one
- Timeline-based versioning for point-in-time queries
- Record-level indexing for fast upserts
- Native streaming ingestion from Kafka and Flink
- Best fit: near-real-time data ingestion with frequent upserts

### Decision guidance

| Requirement | Recommended Format |
|-------------|-------------------|
| Multi-engine access (Spark + Trino + Flink) | Iceberg |
| Databricks-native stack | Delta Lake |
| Near-real-time upserts and CDC | Hudi |
| Partition evolution without rewrite | Iceberg |
| Deep Spark integration | Delta Lake or Iceberg |
| Streaming-first architecture | Hudi |

## Lakehouse Architecture Principles

The lakehouse combines the low-cost storage of a data lake with the reliability and performance of a data warehouse:

- Store all data in open formats (Parquet, ORC) on object storage (S3, GCS, ADLS)
- Layer ACID transactions on top via Iceberg, Delta, or Hudi
- Separate compute from storage: scale processing independently of data volume
- Support both batch and streaming workloads on the same data
- Enforce governance through catalog-level access control (Unity Catalog, Polaris, Nessie)
- Eliminate the ETL pipeline from lake to warehouse by querying the lake directly

**Lakehouse + medallion:**
- Bronze: raw files on object storage, registered in the catalog
- Silver: open table format (Iceberg/Delta) with schema enforcement
- Gold: open table format with aggressive compaction and optimization

## When Medallion Fits Best

**Strong fit:**
- Cloud-native platform (Databricks, Snowflake, BigQuery, AWS EMR)
- Using Delta Lake, Iceberg, or Hudi as the storage layer
- Mixing streaming and batch ingestion into the same pipeline
- Team prefers progressive refinement over upfront schema design
- Data volume is large enough to benefit from lakehouse economics
- Multiple consumers (BI, ML, data science) need different levels of refinement

**Weaker fit:**
- Small data volumes where a traditional RDBMS warehouse is sufficient
- Strict regulatory requirements demanding full audit history (consider Data Vault in silver)
- Team unfamiliar with Spark, Databricks, or distributed processing
- Single-source, well-structured data that fits directly into a star schema
