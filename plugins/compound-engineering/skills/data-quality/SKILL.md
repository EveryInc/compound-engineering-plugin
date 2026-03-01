---
name: data-quality
description: Data validation, schema testing, anomaly detection, and data contract patterns across any warehouse platform. Use when writing data assertions, designing quality checks, implementing data contracts, or monitoring data freshness.
user-invocable: false
---

# Data Quality

Implement data validation, anomaly detection, and data contract enforcement across Python and SQL-based data platforms. This skill covers cross-platform quality frameworks that sit above any individual warehouse or transformation tool.

## Top 5 Data Quality Issues

Address these issues proactively. Every data pipeline should have guards against all five.

### 1. Silent Upstream Schema Changes

A source table adds, removes, or renames a column with no notification. Downstream models break silently or produce NULLs.

**Mitigate:** Enforce schema contracts at ingestion boundaries. Use Pandera schemas for Python pipelines and dbt model contracts for warehouse models. Monitor column-level metadata with Soda schema checks.

### 2. Duplicate and Missing Rows

Row duplication from retry logic, late-arriving data, or CDC misconfiguration. Missing rows from silent ingestion failures or filter bugs.

**Mitigate:** Assert primary key uniqueness and expected row count ranges at every layer. Use volume anomaly detection to catch sudden count changes.

### 3. NULL Propagation

A single NULL in a join key or calculation silently eliminates rows or produces incorrect aggregates downstream.

**Mitigate:** Assert NOT NULL on all join keys, primary keys, and critical business columns. Track NULL rates over time and alert on percentage threshold breaches.

### 4. Data Freshness

Stale data served to consumers because an upstream pipeline failed or ran late.

**Mitigate:** Monitor `loaded_at` or `updated_at` timestamps. Set freshness SLAs per table with automated alerts when thresholds are exceeded.

### 5. Type Coercion

Implicit or incorrect type casting (string to integer, timezone-naive to timezone-aware) introduces subtle data corruption.

**Mitigate:** Enforce explicit column types in contracts. Use Pandera dtype enforcement in Python and dbt contract `data_type` declarations in SQL.

## Tool Selection Decision Framework

Select the right tool based on where the data lives and what needs validation.

| Context | Primary Tool | Why |
|---------|-------------|-----|
| Python DataFrames (pandas/Polars) | Pandera | Native DataFrame schema enforcement, statistical checks, lazy validation for Polars |
| Warehouse tables via dbt | dbt tests + contracts | Runs inside the transformation layer, no extra infrastructure |
| Lightweight warehouse checks (non-dbt) | Soda Core / SodaCL | Human-readable YAML, works standalone, supports freshness natively |
| Full production with alerting/docs | Great Expectations | Checkpoints, data docs, Slack/email/PagerDuty integration |
| API inputs, configs, boundaries | Pydantic | Validates structured data at application boundaries, NOT DataFrames |

### Tool Priority Order

1. **Pandera** - Primary for Python DataFrame validation (pandas + Polars)
2. **dbt tests + contracts** - Primary for warehouse-native validation
3. **Soda Core / SodaCL** - Human-readable YAML checks, lightweight data contracts
4. **Great Expectations** - Full production environments needing alerting/documentation
5. **Pydantic** - Boundary validation (API inputs, configs), NOT DataFrames

### When to Combine Tools

- **dbt + Soda:** Use dbt tests for model-level assertions, Soda for freshness monitoring and cross-database checks outside dbt
- **Pandera + Pydantic:** Pandera validates DataFrames in processing pipelines, Pydantic validates API inputs and configuration before data enters the pipeline
- **dbt + Great Expectations:** Use dbt for transformation-time tests, GX for post-load validation with rich alerting and documentation

## Boundary with dbt Skill

The dbt skill covers native dbt testing: `unique`, `not_null`, `accepted_values`, `relationships`, source freshness configuration, and basic YAML schema tests. This data-quality skill covers:

- Cross-platform quality frameworks (Pandera, GX, Soda)
- Data contract standards and patterns
- Anomaly detection approaches
- Advanced dbt testing patterns (dbt-expectations, unit tests, Elementary integration)
- Multi-tool quality architectures

When a task involves only standard dbt generic tests, defer to the dbt skill. When the task involves quality frameworks beyond dbt, advanced testing patterns, or data contracts, use this skill.

## Reference Index

| File | Topics |
|------|--------|
| [tool-decision-matrix.md](./references/tool-decision-matrix.md) | Pandera, Great Expectations, Soda Core, dbt tests, Pydantic comparison and integration patterns |
| [data-contracts.md](./references/data-contracts.md) | ODCS template, schema enforcement, contract versioning, breaking changes, producer/consumer model |
| [anomaly-detection.md](./references/anomaly-detection.md) | Z-score detection, threshold alerts, Elementary setup, custom SQL anomalies, alert routing |
| [dbt-testing-advanced.md](./references/dbt-testing-advanced.md) | dbt-expectations, unit tests, contract enforcement, Elementary integration, CI/CD testing patterns |
