# dbt Project Structure

## Directory Layout

```
my_project/
├── dbt_project.yml
├── packages.yml
├── models/
│   ├── staging/           # 1:1 with source tables, light transformations
│   │   ├── stripe/
│   │   │   ├── _stripe__sources.yml
│   │   │   ├── _stripe__models.yml
│   │   │   └── stg_stripe__payments.sql
│   │   └── salesforce/
│   │       ├── _salesforce__sources.yml
│   │       ├── _salesforce__models.yml
│   │       └── stg_salesforce__accounts.sql
│   ├── intermediate/      # Business logic, joins, aggregations
│   │   ├── finance/
│   │   │   └── int_payments_pivoted_to_orders.sql
│   │   └── marketing/
│   │       └── int_web_events_sessionized.sql
│   └── marts/             # Business-facing, wide tables
│       ├── finance/
│       │   ├── _finance__models.yml
│       │   ├── fct_orders.sql
│       │   └── dim_customers.sql
│       └── marketing/
│           └── fct_web_sessions.sql
├── seeds/                 # Static CSV reference data
├── snapshots/             # SCD Type 2 tracking
├── macros/                # Reusable Jinja macros
├── tests/                 # Singular (custom SQL) tests
└── analyses/              # Ad-hoc SQL (not materialized)
```

## Naming Conventions

| Layer | Prefix | Example | Rule |
|-------|--------|---------|------|
| Staging | `stg_` | `stg_stripe__payments` | Double underscore separates source from entity |
| Intermediate | `int_` | `int_payments_pivoted_to_orders` | Describe the transformation verb |
| Fact | `fct_` | `fct_orders` | Business event or transaction |
| Dimension | `dim_` | `dim_customers` | Business entity attributes |

**YAML file naming:**
- Source definitions: `_<source>__sources.yml` (leading underscore sorts first)
- Model properties: `_<source>__models.yml` or `_<directory>__models.yml`
- One YAML file per source system in staging; one per subdirectory elsewhere

## Model Organization Rules

1. **Staging models** reference only `{{ source() }}` - never `{{ ref() }}` to another staging model
2. **Intermediate models** reference staging or other intermediate models via `{{ ref() }}`
3. **Mart models** reference intermediate or staging models - never raw sources
4. **No circular references** - DAG must be acyclic
5. **Limit fan-out** - If one staging model feeds 10+ downstream models, add an intermediate layer

## dbt_project.yml Configuration

```yaml
name: 'my_project'
version: '1.0.0'

profile: 'my_project'

model-paths: ["models"]
analysis-paths: ["analyses"]
test-paths: ["tests"]
seed-paths: ["seeds"]
macro-paths: ["macros"]
snapshot-paths: ["snapshots"]

clean-targets:
  - "target"
  - "dbt_packages"

models:
  my_project:
    staging:
      +materialized: view
      +tags: ['staging']
    intermediate:
      +materialized: view
      +tags: ['intermediate']
    marts:
      +materialized: table
      +tags: ['marts']
```

## Source Definitions

```yaml
# models/staging/stripe/_stripe__sources.yml
sources:
  - name: stripe
    database: raw
    schema: stripe
    description: Stripe payment data loaded by Fivetran
    loaded_at_field: _fivetran_synced
    freshness:
      warn_after: {count: 12, period: hour}
      error_after: {count: 24, period: hour}
    tables:
      - name: payments
        description: Raw Stripe payment records
        columns:
          - name: id
            description: Primary key from Stripe
            data_tests:
              - unique
              - not_null
```

## Groups and Access (dbt Mesh)

```yaml
# models/_groups.yml
groups:
  - name: finance
    owner:
      name: Finance Analytics
      email: finance-analytics@company.com

# In model YAML
models:
  - name: fct_revenue
    group: finance
    access: public          # public, protected (default), private
    config:
      contract:
        enforced: true      # Required for public models
```

**Access levels:**
- `private` - Only models in the same group can reference
- `protected` (default) - Only models in the same project
- `public` - Any project can reference via cross-project ref
