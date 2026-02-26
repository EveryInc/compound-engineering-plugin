# Unity Catalog Reference

Governance, access control, and data organization patterns for Databricks Unity Catalog.

## Three-Level Namespace

Unity Catalog organizes all data assets into a three-level hierarchy: `catalog.schema.table`.

```
account
├── metastore (one per region)
│   ├── catalog_prod
│   │   ├── raw
│   │   │   ├── events
│   │   │   └── users
│   │   ├── curated
│   │   │   ├── dim_users
│   │   │   └── fct_orders
│   │   └── analytics
│   │       └── daily_metrics
│   ├── catalog_dev
│   │   └── sandbox
│   │       └── experiments
│   └── catalog_shared
│       └── reference_data
│           └── country_codes
```

**Naming conventions:**
- Catalogs: environment or domain-based (`prod`, `dev`, `staging`, `finance`, `marketing`)
- Schemas: layer or team-based (`raw`, `curated`, `analytics`, `sandbox`)
- Tables: descriptive, snake_case (`dim_users`, `fct_orders`, `stg_payments`)

```sql
-- Always use fully qualified names
SELECT * FROM prod.curated.dim_users;

-- Never rely on implicit catalog/schema resolution in production code
-- Avoid: SELECT * FROM dim_users;
```

## Catalog and Schema Creation

```sql
-- Create a catalog
CREATE CATALOG IF NOT EXISTS prod
COMMENT 'Production data catalog';

-- Create a schema within a catalog
CREATE SCHEMA IF NOT EXISTS prod.raw
COMMENT 'Raw ingestion layer - source system replicas'
MANAGED LOCATION 'abfss://container@storage.dfs.core.windows.net/prod/raw';

-- Create schema with default properties
CREATE SCHEMA IF NOT EXISTS prod.curated
COMMENT 'Curated business entities'
WITH DBPROPERTIES (
  'team' = 'data-engineering',
  'sla' = 'tier-1'
);

-- Drop schema (must be empty or use CASCADE)
DROP SCHEMA IF EXISTS dev.sandbox CASCADE;
```

## Permissions Model

Unity Catalog uses a hierarchical permissions model. Grants at a higher level cascade to children.

### GRANT and REVOKE

```sql
-- Catalog-level grants
GRANT USE CATALOG ON CATALOG prod TO `data-analysts`;
GRANT CREATE SCHEMA ON CATALOG prod TO `data-engineers`;

-- Schema-level grants
GRANT USE SCHEMA ON SCHEMA prod.curated TO `data-analysts`;
GRANT SELECT ON SCHEMA prod.curated TO `data-analysts`;
GRANT CREATE TABLE, MODIFY ON SCHEMA prod.raw TO `data-engineers`;

-- Table-level grants
GRANT SELECT ON TABLE prod.curated.dim_users TO `marketing-team`;

-- Function grants
GRANT EXECUTE ON FUNCTION prod.curated.parse_json TO `data-analysts`;

-- Revoke access
REVOKE SELECT ON SCHEMA prod.raw FROM `data-analysts`;

-- View effective grants
SHOW GRANTS ON TABLE prod.curated.dim_users;
SHOW GRANTS `data-analysts`;
```

### Privilege Types

| Privilege | Applies To | Effect |
|-----------|------------|--------|
| `USE CATALOG` | Catalog | Browse catalog contents |
| `USE SCHEMA` | Schema | Browse schema contents |
| `SELECT` | Table, View | Read data |
| `MODIFY` | Table | Insert, update, delete data |
| `CREATE TABLE` | Schema | Create new tables |
| `CREATE SCHEMA` | Catalog | Create new schemas |
| `CREATE FUNCTION` | Schema | Create UDFs |
| `ALL PRIVILEGES` | Any | Full access (use sparingly) |

### Ownership

Every securable object has a single owner. Owners have full control regardless of grants.

```sql
-- Transfer ownership
ALTER TABLE prod.curated.dim_users OWNER TO `data-platform-team`;
ALTER SCHEMA prod.curated OWNER TO `data-platform-team`;
ALTER CATALOG prod OWNER TO `platform-admins`;

-- Check ownership
DESCRIBE TABLE EXTENDED prod.curated.dim_users;
```

## External Locations and Storage Credentials

External locations map cloud storage paths to Unity Catalog for governed access.

### Storage Credentials

```sql
-- Create storage credential (admin operation, usually via Terraform)
CREATE STORAGE CREDENTIAL IF NOT EXISTS azure_prod_cred
COMMENT 'Azure production storage credential'
WITH (AZURE_MANAGED_IDENTITY = 'managed-identity-id');

-- For AWS
CREATE STORAGE CREDENTIAL IF NOT EXISTS aws_prod_cred
COMMENT 'AWS production storage credential'
WITH (AWS_IAM_ROLE = 'arn:aws:iam::123456789:role/databricks-access');
```

### External Locations

```sql
-- Create external location
CREATE EXTERNAL LOCATION IF NOT EXISTS prod_raw_landing
URL 'abfss://raw-landing@prodstore.dfs.core.windows.net/'
WITH (STORAGE CREDENTIAL azure_prod_cred)
COMMENT 'Landing zone for raw data ingestion';

-- Grant access to create external tables at this location
GRANT CREATE EXTERNAL TABLE ON EXTERNAL LOCATION prod_raw_landing TO `data-engineers`;
GRANT READ FILES ON EXTERNAL LOCATION prod_raw_landing TO `data-engineers`;

-- List external locations
SHOW EXTERNAL LOCATIONS;
```

## Managed vs External Tables

### Managed Tables (Recommended Default)

Storage lifecycle managed by Unity Catalog. Dropping the table deletes the data.

```sql
CREATE TABLE prod.curated.dim_users (
  user_id BIGINT,
  username STRING,
  email STRING,
  created_at TIMESTAMP
)
CLUSTER BY (created_at);
```

### External Tables

Storage managed outside Unity Catalog. Dropping the table removes metadata only; data remains.

```sql
CREATE TABLE prod.raw.external_events (
  event_id BIGINT,
  event_type STRING,
  event_date DATE
)
LOCATION 'abfss://raw-landing@prodstore.dfs.core.windows.net/events/';
```

**Decision guide:**
- Use managed tables for data owned by the platform (most cases)
- Use external tables for data shared with external systems or requiring independent lifecycle
- External tables require an external location grant

## Delta Sharing

Share data across organizations without copying. Recipients access data via open protocol.

### Provider Side (Data Sharer)

```sql
-- Create a share
CREATE SHARE IF NOT EXISTS customer_analytics_share
COMMENT 'Customer analytics for partner organizations';

-- Add tables to the share
ALTER SHARE customer_analytics_share ADD TABLE prod.curated.dim_users;
ALTER SHARE customer_analytics_share ADD TABLE prod.analytics.daily_metrics
  PARTITION (region = 'us-east-1') AS analytics.daily_metrics;

-- Create a recipient
CREATE RECIPIENT IF NOT EXISTS partner_org
COMMENT 'Partner organization access';

-- Grant share to recipient
GRANT SELECT ON SHARE customer_analytics_share TO RECIPIENT partner_org;

-- View share contents
SHOW ALL IN SHARE customer_analytics_share;
```

### Recipient Side (Data Consumer)

```sql
-- Create a catalog from a share
CREATE CATALOG IF NOT EXISTS partner_data
USING SHARE provider_org.customer_analytics_share;

-- Query shared data (read-only)
SELECT * FROM partner_data.analytics.daily_metrics;
```

## Lineage Tracking

Unity Catalog automatically captures column-level lineage for tables, views, notebooks, and jobs.

```sql
-- View upstream dependencies (what feeds this table)
-- Available in the Unity Catalog UI: Catalog Explorer > Table > Lineage tab

-- Create views that preserve lineage
CREATE VIEW prod.analytics.active_users AS
SELECT user_id, username, email
FROM prod.curated.dim_users
WHERE is_active = TRUE;
-- Lineage: dim_users -> active_users is tracked automatically
```

Lineage captures:
- Table-to-table dependencies from notebooks, jobs, and DLT pipelines
- Column-level lineage (which source columns feed which target columns)
- Cross-workspace lineage within the same metastore
- View definitions and their upstream sources

## Data Classification and Tagging

Apply tags to catalogs, schemas, tables, and columns for governance and discovery.

```sql
-- Tag a table
ALTER TABLE prod.curated.dim_users
SET TAGS ('pii' = 'true', 'data_owner' = 'user-team', 'retention' = '3-years');

-- Tag a column
ALTER TABLE prod.curated.dim_users
ALTER COLUMN email SET TAGS ('pii' = 'true', 'classification' = 'sensitive');

-- Tag a schema
ALTER SCHEMA prod.curated
SET TAGS ('environment' = 'production', 'team' = 'data-engineering');

-- Remove tags
ALTER TABLE prod.curated.dim_users UNSET TAGS ('retention');

-- View tags
SELECT * FROM system.information_schema.table_tags
WHERE catalog_name = 'prod' AND schema_name = 'curated';

SELECT * FROM system.information_schema.column_tags
WHERE catalog_name = 'prod' AND tag_name = 'pii';
```

### Row-Level and Column-Level Security

```sql
-- Column masking with a function
CREATE FUNCTION prod.curated.mask_email(email STRING)
RETURNS STRING
RETURN CASE
  WHEN is_member('pii-readers') THEN email
  ELSE CONCAT(LEFT(email, 2), '***@', SPLIT(email, '@')[1])
END;

ALTER TABLE prod.curated.dim_users
ALTER COLUMN email SET MASK prod.curated.mask_email;

-- Row filter
CREATE FUNCTION prod.curated.region_filter(region STRING)
RETURNS BOOLEAN
RETURN CASE
  WHEN is_member('global-readers') THEN TRUE
  ELSE region = current_user_region()
END;

ALTER TABLE prod.curated.dim_users
SET ROW FILTER prod.curated.region_filter ON (region);
```
