---
name: data-scaffold
description: Scaffold dbt models or dimensional data models from source descriptions
argument-hint: "[dbt source.table | model business-domain]"
disable-model-invocation: true
allowed-tools: Read, Write, Bash(dbt *), Grep, Glob
---

# Data Scaffold

Generate dbt models or dimensional data models from source descriptions.

## Usage

```
/data-scaffold dbt stripe.payments
/data-scaffold model e-commerce orders
```

## Parse Arguments

Parse `$ARGUMENTS` to determine mode and parameters:

- If arguments start with `dbt`: **dbt mode** - scaffold staging model from source
- If arguments start with `model`: **model mode** - scaffold dimensional model from business domain
- Otherwise: ask which mode to use

## dbt Mode

**Input:** `/data-scaffold dbt <source>.<table>`

### Steps

1. **Parse source and table name** from arguments (e.g., `stripe.payments` → source: `stripe`, table: `payments`)

2. **Check for existing dbt project:**
   ```bash
   ls dbt_project.yml 2>/dev/null
   ```
   If no `dbt_project.yml` found, ask if the user wants to initialize a new dbt project.

3. **Check for existing source definition:**
   ```bash
   grep -r "name: <source>" models/ --include="*.yml" 2>/dev/null
   ```

4. **Generate staging model** at `models/staging/<source>/stg_<source>__<table>.sql`:
   ```sql
   with source as (
       select * from {{ source('<source>', '<table>') }}
   ),

   renamed as (
       select
           -- TODO: Add column mappings
           -- id as <table>_id,
           -- column_name,
           -- cast(created_at as timestamp) as created_at
           *
       from source
   )

   select * from renamed
   ```

5. **Generate source YAML** at `models/staging/<source>/_<source>__sources.yml`:
   ```yaml
   sources:
     - name: <source>
       description: "TODO: Describe the <source> data source"
       # database: raw
       # schema: <source>
       loaded_at_field: _loaded_at  # TODO: Set actual loaded_at column
       freshness:
         warn_after: {count: 12, period: hour}
         error_after: {count: 24, period: hour}
       tables:
         - name: <table>
           description: "TODO: Describe the <table> table"
   ```

6. **Generate model YAML** at `models/staging/<source>/_<source>__models.yml`:
   ```yaml
   models:
     - name: stg_<source>__<table>
       description: "Cleaned <source> <table> with standardized column names"
       columns:
         - name: <table>_id
           description: Primary key
           data_tests:
             - unique
             - not_null
   ```

7. **Generate .gitignore** if not present (or append missing entries):
   ```
   target/
   dbt_packages/
   logs/
   profiles.yml
   *.env
   .env
   ```

8. **Generate profiles.yml template** at `~/.dbt/profiles.yml` (only if file does not exist):
   ```yaml
   my_project:
     target: dev
     outputs:
       dev:
         type: snowflake
         account: "{{ env_var('SNOWFLAKE_ACCOUNT') }}"
         user: "{{ env_var('SNOWFLAKE_USER') }}"
         password: "{{ env_var('SNOWFLAKE_PASSWORD') }}"
         role: "{{ env_var('SNOWFLAKE_ROLE') }}"
         database: "{{ env_var('SNOWFLAKE_DATABASE') }}"
         warehouse: "{{ env_var('SNOWFLAKE_WAREHOUSE') }}"
         schema: "{{ env_var('SNOWFLAKE_SCHEMA') }}"
         threads: 4
   ```
   **SECURITY:** Never write credentials inline. Always use `{{ env_var() }}`.

9. **Suggest next steps:**
   - Fill in column mappings in the staging model
   - Update source/model descriptions
   - Run `dbt compile` to validate
   - Consider intermediate and mart models

## Model Mode

**Input:** `/data-scaffold model <business-domain> <entity>`

### Steps

1. **Parse domain and entity** from arguments

2. **Ask clarifying questions:**
   - What is the grain? (one row per what?)
   - What are the key business processes? (orders, payments, shipments)
   - What source systems feed this domain?
   - Preferred architecture? (Kimball star schema, Data Vault, Medallion)

3. **Propose architecture:**
   - Recommend fact and dimension tables based on business processes
   - Identify conformed dimensions
   - Suggest grain for each fact table

4. **Generate ERD as Mermaid diagram:**
   ```markdown
   ```mermaid
   erDiagram
       fct_orders ||--o{ dim_customers : "customer_id"
       fct_orders ||--o{ dim_products : "product_id"
       fct_orders {
           string order_id PK
           string customer_id FK
           string product_id FK
           decimal order_total
           timestamp ordered_at
       }
   ```

5. **Generate dbt model SQL** for each entity in the star schema

6. **Generate schema YAML** with tests and descriptions for all models

7. **Suggest next steps:**
   - Review and refine the data model
   - Create staging models for each source system
   - Add intermediate models for complex joins
   - Configure incremental strategies for large fact tables
