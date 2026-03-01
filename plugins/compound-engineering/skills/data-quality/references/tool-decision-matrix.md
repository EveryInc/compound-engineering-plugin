# Tool Decision Matrix

## Pandera: DataFrame Validation

Validate pandas and Polars DataFrames with schema enforcement, statistical checks, and type coercion guards.

### Core Pattern: Schema Definition

```python
import pandera as pa
from pandera import Column, Check, Index

order_schema = pa.DataFrameSchema(
    columns={
        "order_id": Column(int, Check.greater_than(0), unique=True, nullable=False),
        "customer_id": Column(int, Check.greater_than(0), nullable=False),
        "order_total": Column(
            float,
            [
                Check.greater_than_or_equal_to(0),
                Check.less_than(1_000_000),
            ],
            nullable=False,
        ),
        "currency": Column(str, Check.isin(["USD", "EUR", "GBP"]), nullable=False),
        "created_at": Column("datetime64[ns]", nullable=False),
    },
    index=Index(int),
    strict=True,  # Fail on unexpected columns
    coerce=True,  # Attempt type coercion before validation
)

# Validate
validated_df = order_schema.validate(raw_df)
```

### Statistical Checks

```python
schema = pa.DataFrameSchema({
    "revenue": Column(
        float,
        [
            Check(lambda s: s.mean() > 100, error="Mean revenue too low"),
            Check(lambda s: s.std() < 10000, error="Revenue variance too high"),
            Check.in_range(0, 1_000_000),
        ],
    ),
    "conversion_rate": Column(float, Check.in_range(0.0, 1.0)),
})
```

### Polars Lazy Validation

```python
import pandera.polars as pa_polars
import polars as pl

class OrderSchema(pa_polars.DataFrameModel):
    order_id: int = pa_polars.Field(gt=0, unique=True, nullable=False)
    order_total: float = pa_polars.Field(ge=0, lt=1_000_000, nullable=False)
    currency: str = pa_polars.Field(isin=["USD", "EUR", "GBP"], nullable=False)

# Validate lazy frame
lazy_df = pl.scan_parquet("orders.parquet")
validated = OrderSchema.validate(lazy_df)
result = validated.collect()
```

### When to Use Pandera

- Validating DataFrames in Python ETL scripts or notebooks
- Enforcing schemas at pipeline stage boundaries
- Statistical assertions on column distributions
- Type enforcement before loading to a warehouse

## Great Expectations (GX)

Full-featured validation framework with suites, checkpoints, data documentation, and alerting integrations.

### Suite Definition

```python
import great_expectations as gx

context = gx.get_context()

datasource = context.data_sources.add_pandas("my_datasource")
asset = datasource.add_dataframe_asset("orders")

batch = asset.add_batch_definition_whole_dataframe("full_batch")

suite = context.suites.add(gx.ExpectationSuite(name="orders_suite"))

suite.add_expectation(
    gx.expectations.ExpectColumnValuesToNotBeNull(column="order_id")
)
suite.add_expectation(
    gx.expectations.ExpectColumnValuesToBeUnique(column="order_id")
)
suite.add_expectation(
    gx.expectations.ExpectColumnValuesToBeBetween(
        column="order_total", min_value=0, max_value=1_000_000
    )
)
```

### Checkpoints

```python
checkpoint = context.checkpoints.add(
    gx.Checkpoint(
        name="orders_checkpoint",
        validation_definitions=[
            gx.ValidationDefinition(
                name="validate_orders",
                suite=suite,
                data=batch,
            )
        ],
        actions=[
            gx.checkpoint_actions.SlackNotificationAction(
                name="slack_alert",
                slack_webhook="{{ env_var('SLACK_WEBHOOK_URL') }}",
                notify_on="failure",
            ),
        ],
    )
)

result = checkpoint.run(batch_parameters={"dataframe": df})
```

### Data Docs

GX generates static HTML documentation of validation results. Host data docs on S3, GCS, or serve locally for visibility into data health.

### When to Use Great Expectations

- Production pipelines needing automated alerting on validation failures
- Teams requiring data documentation for compliance or auditing
- Complex multi-source validation orchestrated through checkpoints
- Organizations that need historical validation result tracking

## Soda Core / SodaCL

Human-readable YAML-based data quality checks. Lightweight, works with any SQL warehouse directly.

### SodaCL Check Syntax

```yaml
# checks/orders_checks.yml
checks for orders:
  - row_count > 0
  - missing_count(order_id) = 0
  - duplicate_count(order_id) = 0
  - invalid_percent(email) < 5%:
      valid regex: "^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\\.[a-zA-Z0-9-.]+$"
  - avg(order_total) between 50 and 500
  - max(order_total) < 1000000
  - freshness(updated_at) < 24h
  - schema:
      fail:
        when required column missing:
          - order_id
          - customer_id
          - order_total
        when wrong type:
          order_id: integer
          order_total: decimal
```

### Running Soda Checks

```bash
soda scan -d my_warehouse -c configuration.yml checks/orders_checks.yml
```

### Configuration

```yaml
# configuration.yml
data_source my_warehouse:
  type: snowflake
  account: ${SNOWFLAKE_ACCOUNT}
  username: ${SNOWFLAKE_USER}
  password: ${SNOWFLAKE_PASSWORD}
  database: ANALYTICS
  schema: PUBLIC
  warehouse: TRANSFORM_XS
```

### Freshness Monitoring

```yaml
checks for raw_events:
  - freshness(loaded_at) < 1h:
      name: Event data freshness
  - freshness(loaded_at) < 6h:
      warn: true
      name: Event data freshness warning
```

### When to Use Soda Core

- Lightweight data quality checks without Python code
- Teams preferring YAML-based configuration over code
- Freshness monitoring across multiple data sources
- Quick setup for data contract enforcement
- Non-dbt SQL warehouse environments

## dbt Tests

Warehouse-native validation that runs inside the transformation layer. See [dbt-testing-advanced.md](./dbt-testing-advanced.md) for advanced patterns.

### Generic Tests (Basics in dbt Skill)

`unique`, `not_null`, `accepted_values`, `relationships` - covered by the dbt skill.

### Contract Enforcement

```yaml
models:
  - name: fct_orders
    config:
      contract:
        enforced: true
    columns:
      - name: order_id
        data_type: varchar
        constraints:
          - type: not_null
          - type: primary_key
```

Contracts fail at build time (DDL enforcement), not at test time. Use for public models consumed by other teams.

### When to Use dbt Tests

- All warehouse models managed by dbt
- Primary key integrity and referential integrity
- Source freshness monitoring
- Contract enforcement for public models
- CI/CD pipeline validation of model changes

## Pydantic: Boundary Validation

Validate structured data at application boundaries. Use for API inputs, configuration files, and event payloads - NOT for DataFrame validation.

### API Input Validation

```python
from pydantic import BaseModel, Field, field_validator
from datetime import datetime

class OrderRequest(BaseModel):
    customer_id: int = Field(gt=0)
    items: list[dict] = Field(min_length=1)
    currency: str = Field(pattern=r"^[A-Z]{3}$")
    requested_at: datetime

    @field_validator("currency")
    @classmethod
    def validate_currency(cls, v: str) -> str:
        allowed = {"USD", "EUR", "GBP", "JPY"}
        if v not in allowed:
            raise ValueError(f"Currency must be one of {allowed}")
        return v
```

### Configuration Validation

```python
from pydantic_settings import BaseSettings

class PipelineConfig(BaseSettings):
    warehouse_host: str
    warehouse_port: int = Field(ge=1, le=65535)
    batch_size: int = Field(ge=1, le=100_000, default=10_000)
    freshness_threshold_hours: int = Field(ge=1, default=24)

    class Config:
        env_prefix = "PIPELINE_"
```

### When to Use Pydantic

- Validating API request/response payloads
- Configuration file validation
- Event schema enforcement at ingestion boundaries
- Type-safe data transfer objects

**Do NOT use Pydantic for:** DataFrame row-level validation (use Pandera), SQL-based assertions (use dbt or Soda), statistical column checks (use Pandera or GX).

## Comparison Matrix

| Feature | Pandera | Great Expectations | Soda Core | dbt Tests | Pydantic |
|---------|---------|-------------------|-----------|-----------|----------|
| DataFrame validation | Native | Supported | No | No | No |
| SQL warehouse checks | No | Yes | Native | Native | No |
| YAML configuration | No | Partial | Native | Native | No |
| Statistical checks | Yes | Yes | Basic | Via packages | No |
| Schema enforcement | Yes | Yes | Yes | Contracts | Yes |
| Freshness monitoring | No | Yes | Native | Native | No |
| Alerting integrations | No | Slack, email, PD | Slack, email | Via Elementary | No |
| Data documentation | No | Data Docs | Soda Cloud | Elementary | No |
| Learning curve | Low | High | Low | Low (if using dbt) | Low |
| Infrastructure needed | None | GX Cloud or self-host | Optional Soda Cloud | dbt project | None |
| Polars support | Yes | No | No | No | No |

## Multi-Tool Integration Patterns

### Pattern 1: Pydantic at Ingestion, Pandera in Processing, dbt in Warehouse

```
API Request → Pydantic validates payload
    → Python transforms → Pandera validates DataFrames
        → Load to warehouse → dbt tests validate models
```

### Pattern 2: dbt for Transformation Tests, Soda for Freshness and Cross-DB

```
dbt build (includes generic tests + contracts)
    → Soda scan (freshness, schema, cross-database comparisons)
        → Alert on failures via Soda Cloud or CLI exit codes
```

### Pattern 3: Great Expectations for End-to-End Production

```
Ingestion → GX checkpoint validates raw data
    → Transform → GX checkpoint validates intermediate
        → Load → GX checkpoint validates final output
            → Data Docs updated → Slack alert on failure
```

Select the pattern that matches the existing stack. Avoid introducing tools the team will not maintain.
