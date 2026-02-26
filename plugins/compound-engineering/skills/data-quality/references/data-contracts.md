# Data Contracts

## What Is a Data Contract

A data contract is a formal agreement between a data producer and its consumers that defines the schema, semantics, quality guarantees, and SLAs for a dataset. Treat data contracts as APIs for data: versioned, documented, and enforced.

## Open Data Contract Standard (ODCS) Template

The ODCS provides a vendor-neutral YAML format for describing data contracts. Use this structure as a starting point.

```yaml
# orders-contract.yml
apiVersion: v3.0.0
kind: DataContract
id: urn:datacontract:orders:v2
info:
  title: Orders Dataset
  version: 2.1.0
  description: Completed customer orders with line items
  owner: data-platform-team
  contact:
    name: Data Platform
    url: https://internal.example.com/data-platform
    email: data-platform@example.com

servers:
  production:
    type: snowflake
    account: "${SNOWFLAKE_ACCOUNT}"
    database: ANALYTICS
    schema: MARTS

terms:
  usage: Internal analytics and reporting only
  limitations: No PII exposure to third-party tools
  billing: Included in platform cost

models:
  - name: fct_orders
    description: One row per completed order
    type: table
    columns:
      - name: order_id
        type: varchar
        description: Primary key, globally unique
        required: true
        unique: true
        primaryKey: true
      - name: customer_id
        type: varchar
        description: Foreign key to dim_customers
        required: true
      - name: order_total
        type: decimal(18,2)
        description: Total order amount in USD
        required: true
        constraints:
          - type: range
            min: 0
            max: 1000000
      - name: order_status
        type: varchar
        description: Current order status
        required: true
        constraints:
          - type: enum
            values: ["completed", "refunded", "cancelled"]
      - name: created_at
        type: timestamp_tz
        description: Order creation timestamp in UTC
        required: true

quality:
  type: SodaCL
  specification:
    checks for fct_orders:
      - row_count > 0
      - duplicate_count(order_id) = 0
      - freshness(created_at) < 24h

sla:
  freshness: 24h
  availability: 99.5%
  queryResponseTime: 30s
```

## Schema Enforcement Patterns

### Pattern 1: Enforce at Build Time (dbt Contracts)

```yaml
models:
  - name: fct_orders
    access: public
    config:
      contract:
        enforced: true
    columns:
      - name: order_id
        data_type: varchar
        constraints:
          - type: not_null
          - type: primary_key
      - name: order_total
        data_type: numeric(18,2)
        constraints:
          - type: not_null
          - type: check
            expression: "order_total >= 0"
      - name: created_at
        data_type: timestamp_tz
        constraints:
          - type: not_null
```

dbt contracts enforce column names, types, and constraints at DDL time. A build fails if the model output does not match the contract. Use for all `access: public` models.

### Pattern 2: Enforce at Validation Time (Soda)

```yaml
checks for fct_orders:
  - schema:
      name: Orders schema contract
      fail:
        when required column missing:
          - order_id
          - customer_id
          - order_total
          - order_status
          - created_at
        when wrong type:
          order_id: varchar
          customer_id: varchar
          order_total: decimal
          created_at: timestamp_tz
        when forbidden column present:
          - debug_flag
          - internal_notes
```

Soda schema checks run as post-build validation. Use when enforcement at build time is not available or when validating data sources outside dbt.

### Pattern 3: Enforce at Ingestion (Pandera)

```python
import pandera as pa

order_contract = pa.DataFrameSchema(
    columns={
        "order_id": pa.Column(str, nullable=False, unique=True),
        "customer_id": pa.Column(str, nullable=False),
        "order_total": pa.Column(float, pa.Check.ge(0), nullable=False),
        "order_status": pa.Column(
            str,
            pa.Check.isin(["completed", "refunded", "cancelled"]),
            nullable=False,
        ),
        "created_at": pa.Column("datetime64[ns, UTC]", nullable=False),
    },
    strict=True,
)
```

Set `strict=True` to reject unexpected columns. Apply at pipeline ingestion boundaries before any transformation.

## Contract Evolution and Versioning

### Semantic Versioning for Data Contracts

Apply semantic versioning to data contracts the same way as APIs:

| Version Bump | When | Example |
|-------------|------|---------|
| PATCH (2.1.0 -> 2.1.1) | Documentation updates, description changes | Fix typo in column description |
| MINOR (2.1.0 -> 2.2.0) | Additive, backward-compatible changes | Add optional column, relax constraint |
| MAJOR (2.1.0 -> 3.0.0) | Breaking changes | Remove column, change type, rename column |

### Migration Workflow

```
1. Producer proposes contract change (PR with updated contract YAML)
2. Automated check identifies breaking vs non-breaking
3. Breaking changes require consumer sign-off
4. Non-breaking changes auto-merge after CI passes
5. Version bump applied
6. Consumers notified of new version
```

## Breaking vs Non-Breaking Changes

### Non-Breaking (MINOR version bump)

- Add a new optional (nullable) column
- Widen a column type (varchar(50) to varchar(100))
- Relax a constraint (remove NOT NULL from non-key column)
- Add a new enum value to an accepted_values list
- Increase a freshness SLA window (24h to 48h)

### Breaking (MAJOR version bump)

- Remove a column
- Rename a column
- Change a column data type to a narrower type
- Add NOT NULL constraint to an existing column
- Change primary key composition
- Remove an enum value from accepted_values
- Tighten a freshness SLA (48h to 12h)

### Detecting Breaking Changes Automatically

```python
def detect_breaking_changes(old_contract: dict, new_contract: dict) -> list[str]:
    """Compare two contract versions and return breaking changes."""
    breaking = []
    old_cols = {c["name"]: c for c in old_contract.get("columns", [])}
    new_cols = {c["name"]: c for c in new_contract.get("columns", [])}

    for col_name in old_cols:
        if col_name not in new_cols:
            breaking.append(f"REMOVED column: {col_name}")
        elif old_cols[col_name].get("type") != new_cols[col_name].get("type"):
            breaking.append(
                f"TYPE CHANGED for {col_name}: "
                f"{old_cols[col_name]['type']} -> {new_cols[col_name]['type']}"
            )

    return breaking
```

Integrate this check into CI to block merges that introduce unannounced breaking changes.

## Consumer-Driven Contracts

In consumer-driven contracts, downstream consumers declare what columns and guarantees they require. The producer contract must satisfy all consumer expectations.

### Consumer Declaration

```yaml
# consumer: marketing-dashboard
consumer:
  name: marketing-dashboard
  team: marketing-analytics
  requires:
    dataset: fct_orders
    columns:
      - name: order_id
        type: varchar
      - name: customer_id
        type: varchar
      - name: order_total
        type: decimal
      - name: created_at
        type: timestamp_tz
    sla:
      freshness: 12h
      availability: 99%
```

### Validation Against Producer Contract

```python
def validate_consumer_requirements(
    producer_contract: dict, consumer_requirements: list[dict]
) -> list[str]:
    """Check that all consumer requirements are met by producer contract."""
    violations = []
    producer_cols = {
        c["name"]: c for c in producer_contract.get("columns", [])
    }

    for consumer in consumer_requirements:
        for req_col in consumer.get("columns", []):
            col_name = req_col["name"]
            if col_name not in producer_cols:
                violations.append(
                    f"Consumer '{consumer['name']}' requires column "
                    f"'{col_name}' not in producer contract"
                )

    return violations
```

### Workflow

```
1. Consumer registers requirements against a dataset
2. Producer contract CI checks all consumer requirements
3. Breaking changes that violate consumer requirements block merge
4. Consumer team must update or drop requirements before producer can remove columns
```

## dbt Model Contracts

### Enforcement Configuration

```yaml
models:
  - name: fct_orders
    access: public
    group: order-management
    config:
      contract:
        enforced: true
    columns:
      - name: order_id
        data_type: varchar
        description: "Primary key"
        constraints:
          - type: not_null
          - type: primary_key
      - name: order_total
        data_type: numeric(18,2)
        constraints:
          - type: not_null
          - type: check
            expression: "order_total >= 0"
```

### Contract Enforcement Rules

- `enforced: true` validates column names, data types, and constraints at DDL time
- Models that violate the contract fail during `dbt build`, not during `dbt test`
- Use `access: public` with contracts for cross-project models (dbt Mesh)
- Private models do not need contracts (internal implementation detail)

### Constraints Available

| Constraint | Behavior | Supported Warehouses |
|-----------|----------|---------------------|
| `not_null` | DDL NOT NULL | All |
| `primary_key` | DDL PRIMARY KEY (advisory on most warehouses) | All |
| `foreign_key` | DDL FOREIGN KEY (advisory on most warehouses) | All |
| `unique` | DDL UNIQUE | All |
| `check` | DDL CHECK expression | Snowflake, Postgres, Redshift |

## Soda Data Contracts

### Contract Definition

```yaml
checks for fct_orders:
  - schema:
      name: Orders contract
      warn:
        when extra column present:
          - "*"
      fail:
        when required column missing:
          - order_id
          - customer_id
          - order_total
          - created_at
        when wrong type:
          order_id: varchar
          order_total: decimal
  - row_count > 0
  - duplicate_count(order_id) = 0
  - freshness(created_at) < 24h
  - missing_count(order_id) = 0
  - missing_count(customer_id) = 0
```

### Running Contract Checks

```bash
# Run as part of CI or scheduled job
soda scan -d warehouse -c configuration.yml contracts/orders_contract.yml
```

Exit code is non-zero on contract violation. Integrate into CI pipelines to gate deployments.

## Producer / Consumer Responsibility Model

### Producer Responsibilities

- Define and maintain the data contract
- Enforce schema constraints at build time
- Monitor data freshness against SLA
- Communicate breaking changes with advance notice
- Run contract validation in CI/CD pipeline
- Version contracts using semantic versioning

### Consumer Responsibilities

- Declare column and SLA requirements formally
- Pin to a contract version (do not assume latest is stable)
- Handle graceful degradation when optional columns are missing
- Report contract violations to the producer team
- Update requirements when consuming new columns

### Responsibility Matrix

| Concern | Producer | Consumer |
|---------|----------|----------|
| Schema definition | Owns | Reviews |
| Type enforcement | Enforces | Validates at read |
| Freshness SLA | Monitors and alerts | Escalates violations |
| Breaking changes | Proposes, communicates | Approves or rejects |
| Quality checks | Runs in CI | Runs on read (optional) |
| Documentation | Maintains contract YAML | Maintains consumer spec |

## Monitoring Contract Compliance

### Automated Compliance Dashboard

Track these metrics per contract:

| Metric | Source | Alert Threshold |
|--------|--------|----------------|
| Schema match rate | Soda schema check | < 100% |
| Freshness | Soda freshness / dbt source freshness | Exceeds SLA |
| Row count anomaly | Soda / Elementary | > 2 std deviations |
| NULL rate per column | Soda missing_count / dbt test | Exceeds baseline |
| Contract version drift | CI comparison | Consumer pinned to old version |

### CI/CD Integration

```bash
# In CI pipeline for producer
dbt build --select fct_orders         # Build with contract enforcement
dbt test --select fct_orders          # Run data tests
soda scan -d warehouse -c config.yml contracts/orders.yml  # Contract validation

# Gate: fail pipeline if any check fails
```

### Alerting on Contract Violations

Route contract violations to the owning team, not a generic data channel. Use severity levels:

- **Error:** Schema mismatch, missing required column, primary key violation - blocks pipeline
- **Warning:** Freshness approaching SLA, NULL rate increasing, row count anomaly - notifies team
- **Info:** New optional column added, contract version bumped - logged for audit
