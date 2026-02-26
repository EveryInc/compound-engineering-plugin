# dbt Jinja & Macros

## Top 9 Macro Patterns

### 1. generate_schema_name Override

Control schema naming per environment:

```sql
-- macros/generate_schema_name.sql
{% macro generate_schema_name(custom_schema_name, node) -%}
    {%- set default_schema = target.schema -%}
    {%- if custom_schema_name is none -%}
        {{ default_schema }}
    {%- elif target.name == 'prod' -%}
        {{ custom_schema_name | trim }}
    {%- else -%}
        {{ default_schema }}_{{ custom_schema_name | trim }}
    {%- endif -%}
{%- endmacro %}
```

In prod: models use `custom_schema_name` directly. In dev: models use `dev_schema_custom_schema`.

### 2. Dynamic Pivot

```sql
-- macros/pivot.sql
{% macro pivot(column, values, alias=true, agg='sum', then_value=1, else_value=0, prefix='', suffix='', quote_identifiers=true) %}
    {% for value in values %}
        {{ agg }}(
            case
                when {{ column }} = '{{ value }}'
                then {{ then_value }}
                else {{ else_value }}
            end
        ) {% if alias %} as {{ adapter.quote(prefix ~ value ~ suffix) if quote_identifiers else prefix ~ value ~ suffix }}{% endif %}
        {% if not loop.last %},{% endif %}
    {% endfor %}
{% endmacro %}
```

### 3. Surrogate Key

```sql
-- macros/surrogate_key.sql
{% macro surrogate_key(field_list) %}
    {{ dbt_utils.generate_surrogate_key(field_list) }}
{% endmacro %}
```

Prefer `dbt_utils.generate_surrogate_key` over manual concatenation to handle NULLs and type casting consistently.

### 4. star() - Select All Columns Except

```sql
-- Use dbt_utils.star to select all columns except specified ones
select
    {{ dbt_utils.star(from=ref('stg_stripe__payments'), except=['_fivetran_synced', '_fivetran_deleted']) }}
from {{ ref('stg_stripe__payments') }}
```

### 5. Date Spine

```sql
-- Generate a complete date range (no gaps)
{{ dbt_utils.date_spine(
    datepart="day",
    start_date="cast('2020-01-01' as date)",
    end_date="current_date()"
) }}
```

### 6. union_relations

```sql
-- Combine tables with same structure from multiple schemas/sources
{{ dbt_utils.union_relations(
    relations=[
        ref('stg_us__customers'),
        ref('stg_eu__customers'),
        ref('stg_apac__customers')
    ]
) }}
```

### 7. Grant Management

```sql
-- macros/grants.sql
{% macro grant_select_on_schemas(schemas, role) %}
    {% for schema in schemas %}
        grant usage on schema {{ schema }} to role {{ role }};
        grant select on all tables in schema {{ schema }} to role {{ role }};
        grant select on future tables in schema {{ schema }} to role {{ role }};
    {% endfor %}
{% endmacro %}
```

### 8. Logging

```sql
-- macros/log_model_timing.sql
{% macro log_model_timing() %}
    {{ log("Model " ~ this ~ " started at " ~ run_started_at, info=true) }}
{% endmacro %}
```

### 9. Conditional Materialization

```sql
-- Materialize differently based on target
{{ config(
    materialized = 'table' if target.name == 'prod' else 'view'
) }}
```

## Version Detection

```sql
-- Use version-specific features conditionally
{% if dbt_version >= '1.9.0' %}
    {{ config(materialized='incremental', incremental_strategy='microbatch') }}
{% else %}
    {{ config(materialized='incremental', incremental_strategy='merge') }}
{% endif %}
```

## Jinja Control Flow

```sql
-- If/else
{% if target.name == 'prod' %}
    {{ config(materialized='table') }}
{% else %}
    {{ config(materialized='view') }}
{% endif %}

-- For loops
{% set payment_methods = ['credit_card', 'bank_transfer', 'gift_card'] %}

{% for method in payment_methods %}
    sum(case when payment_method = '{{ method }}' then amount else 0 end) as {{ method }}_amount
    {% if not loop.last %},{% endif %}
{% endfor %}

-- Set variables
{% set query %}
    select distinct status from {{ ref('stg_stripe__payments') }}
{% endset %}

{% set results = run_query(query) %}
{% set statuses = results.columns[0].values() %}
```

## run_query Pattern

Execute SQL during compilation to get dynamic values:

```sql
{% macro get_column_values(model, column) %}
    {% set query %}
        select distinct {{ column }}
        from {{ model }}
        order by 1
    {% endset %}

    {% set results = run_query(query) %}

    {% if execute %}
        {% set values = results.columns[0].values() %}
        {{ return(values) }}
    {% else %}
        {{ return([]) }}
    {% endif %}
{% endmacro %}
```

**Important:** Always wrap `run_query` results in `{% if execute %}` to handle parse-time vs. execution-time.

## Macro Testing

```sql
-- tests/test_surrogate_key_macro.sql
-- Verify the macro produces consistent output
{% set expected = dbt_utils.generate_surrogate_key(['order_id', 'line_item_id']) %}
select 1
where {{ expected }} is null  -- Should return 0 rows
```
