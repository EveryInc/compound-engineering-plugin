---
name: snowflake
description: Write optimized Snowflake SQL, configure warehouses, and manage access control. Use when writing Snowflake queries, tuning performance, designing clustering keys, working with semi-structured data, or configuring roles and grants.
---

<objective>
Apply Snowflake best practices to SQL queries, warehouse configuration, cost management, and infrastructure-as-code. This skill provides domain expertise for writing performant Snowflake SQL, optimizing query costs, and managing Snowflake infrastructure with Terraform.
</objective>

<essential_conventions>
## Core Snowflake SQL Patterns

**QUALIFY** - Filter window function results without subqueries:
```sql
SELECT *
FROM orders
QUALIFY ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY order_date DESC) = 1;
```

**FLATTEN** - Expand semi-structured data into rows:
```sql
SELECT
    f.value:name::STRING AS item_name,
    f.value:price::NUMBER(10,2) AS item_price
FROM orders,
LATERAL FLATTEN(input => order_data:items) f;
```

**Dot notation** - Access nested semi-structured fields:
```sql
SELECT
    raw:user.profile.email::STRING AS email,
    raw:user.preferences[0]:theme::STRING AS theme
FROM raw_events;
```

**Warehouse sizing rules:**
- XS for development, ad-hoc queries, and light ELT
- S/M for production dashboards and moderate ELT
- L/XL for heavy transformations and large data loads
- Set AUTO_SUSPEND = 60 (seconds) minimum for all warehouses
- Set AUTO_RESUME = TRUE on every warehouse
- Never leave warehouses running idle

**Security rules:**
- Store credentials in environment variables, never inline
- Prefer key-pair authentication over password authentication
- Use role-based access control (RBAC) for all object grants
- Store Terraform state in remote backends, never locally
</essential_conventions>

<intake>
What are you working on?

1. **SQL Patterns** - QUALIFY, FLATTEN, MERGE, semi-structured data, common idioms
2. **Query Optimization** - Clustering keys, pruning, caching, materialized views, QAS
3. **Cost Management** - Warehouse sizing, resource monitors, credit consumption, tagging
4. **Terraform Infrastructure** - Provider setup, RBAC, grants, databases, schemas

**Specify a number or describe your task.**
</intake>

<routing>

| Response | Reference to Read |
|----------|-------------------|
| 1, sql, query, flatten, qualify, merge, json, variant | [sql-patterns.md](./references/sql-patterns.md) |
| 2, optimize, performance, clustering, cache, slow, explain | [optimization.md](./references/optimization.md) |
| 3, cost, credit, warehouse, sizing, monitor, suspend, budget | [cost-management.md](./references/cost-management.md) |
| 4, terraform, iac, role, grant, rbac, infrastructure | [terraform.md](./references/terraform.md) |
| General task | Read relevant references based on context |

**After reading relevant references, apply patterns to the user's code.**
</routing>

<quick_reference>
## Essential SQL Patterns

**Deduplicate with QUALIFY:**
```sql
SELECT *
FROM raw_events
QUALIFY ROW_NUMBER() OVER (PARTITION BY event_id ORDER BY loaded_at DESC) = 1;
```

**Safe type casting:**
```sql
SELECT
    TRY_CAST(raw_value AS INTEGER) AS parsed_int,
    TRY_TO_NUMBER(price_string, 10, 2) AS parsed_price
FROM staging_table;
```

**MERGE for upserts:**
```sql
MERGE INTO target t
USING source s ON t.id = s.id
WHEN MATCHED THEN UPDATE SET t.name = s.name, t.updated_at = CURRENT_TIMESTAMP()
WHEN NOT MATCHED THEN INSERT (id, name, updated_at) VALUES (s.id, s.name, CURRENT_TIMESTAMP());
```

**Build objects from rows:**
```sql
SELECT
    customer_id,
    ARRAY_AGG(order_id) AS order_ids,
    OBJECT_CONSTRUCT('total', SUM(amount), 'count', COUNT(*)) AS summary
FROM orders
GROUP BY customer_id;
```

**Generate sequences:**
```sql
SELECT ROW_NUMBER() OVER (ORDER BY SEQ4()) AS id
FROM TABLE(GENERATOR(ROWCOUNT => 1000));
```

## Warehouse Quick Guide

| Size | Credits/Hr | Use Case |
|------|-----------|----------|
| XS   | 1         | Dev, ad-hoc, light ELT |
| S    | 2         | Dashboards, moderate ELT |
| M    | 4         | Production workloads |
| L    | 8         | Heavy transformations |
| XL   | 16        | Large data loads |

## Connection Pattern

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
```
</quick_reference>

<reference_index>
## Domain Knowledge

All detailed patterns in `references/`:

| File | Topics |
|------|--------|
| [sql-patterns.md](./references/sql-patterns.md) | QUALIFY, FLATTEN, MERGE, semi-structured data, TRY_CAST, ARRAY_AGG, GENERATOR, common idioms |
| [optimization.md](./references/optimization.md) | Clustering keys, micro-partition pruning, materialized views, QAS, caching layers, EXPLAIN plans |
| [cost-management.md](./references/cost-management.md) | Credit model, warehouse sizing, resource monitors, multi-cluster, query tagging, serverless |
| [terraform.md](./references/terraform.md) | Provider setup, databases, schemas, warehouses, RBAC, grants, key-pair auth, remote state |
</reference_index>

<success_criteria>
Snowflake code follows best practices when:
- QUALIFY replaces subqueries for window function filtering
- FLATTEN with LATERAL handles semi-structured data expansion
- Dot notation accesses nested VARIANT fields with explicit casting
- TRY_CAST/TRY_TO_NUMBER handle potentially invalid data
- Clustering keys match common query filter and join columns
- Warehouses auto-suspend within 60 seconds and auto-resume
- Resource monitors enforce budget limits with alerts and suspend actions
- Credentials live in environment variables, never in code
- Key-pair authentication is preferred over password authentication
- Terraform state is stored in a remote backend, never committed
- Role hierarchy follows least-privilege RBAC patterns
</success_criteria>
