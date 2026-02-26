# Slowly Changing Dimensions (SCD)

Slowly changing dimensions track how dimension attributes evolve over time. Select the SCD type based on whether historical values matter and how consumers query the data.

## SCD Type 0: Retain Original

Never update the attribute after initial load. The original value is the permanent value:

```sql
-- customer_type is set at creation and never changes
CREATE TABLE dim_customer (
    customer_key     INT PRIMARY KEY,
    customer_id      VARCHAR(50),
    customer_type    VARCHAR(20),   -- SCD Type 0: immutable
    original_market  VARCHAR(50),   -- SCD Type 0: immutable
    created_at       TIMESTAMP
);
```

**When to use:**
- Attributes assigned at entity creation that must remain fixed for reporting consistency
- Original classification, first-touch attribution, signup source
- Regulatory requirements to retain the original recorded value

**Trade-off:** No history needed and no history tracked. If the source changes, the change is ignored.

## SCD Type 1: Overwrite

Replace the current value with the new value. No history is preserved:

```sql
-- Before update:
-- | customer_key | customer_id | email              |
-- | 1001         | C-100       | alice@old.com      |

UPDATE dim_customer
SET email = 'alice@new.com'
WHERE customer_id = 'C-100';

-- After update:
-- | customer_key | customer_id | email              |
-- | 1001         | C-100       | alice@new.com      |
```

**When to use:**
- Correcting data entry errors (typo in name, wrong phone number)
- Attributes where only the current value matters
- Low-cardinality attributes where historical tracking adds no analytical value
- When storage and complexity must be minimized

**Trade-off:** Simple to implement but all historical queries reflect the current state, not the state at the time of the transaction.

## SCD Type 2: Add Row

Insert a new dimension row for each change. Maintain full history with validity windows:

```sql
CREATE TABLE dim_customer (
    customer_key     INT PRIMARY KEY,       -- surrogate key (unique per version)
    customer_id      VARCHAR(50),           -- natural key (same across versions)
    customer_name    VARCHAR(200),
    city             VARCHAR(100),
    valid_from       TIMESTAMP NOT NULL,
    valid_to         TIMESTAMP,             -- NULL = current record
    is_current       BOOLEAN DEFAULT TRUE
);

-- Customer moves from NYC to SF:
-- | customer_key | customer_id | city         | valid_from  | valid_to    | is_current |
-- | 1001         | C-100       | New York     | 2023-01-01  | 2024-06-15  | false      |
-- | 1002         | C-100       | San Francisco| 2024-06-15  | NULL        | true       |
```

**Joining facts to historical dimension state:**

```sql
SELECT
    f.order_date,
    f.net_amount,
    d.city AS customer_city_at_time_of_order
FROM fct_orders f
JOIN dim_customer d
    ON f.customer_key = d.customer_key
    AND f.order_date >= d.valid_from
    AND (f.order_date < d.valid_to OR d.valid_to IS NULL);
```

**When to use:**
- Full historical tracking is required (compliance, audit, analytics)
- Reports must reflect the dimension state at the time of each transaction
- Customer segmentation, geographic reporting, organizational hierarchy changes
- Any attribute where "what was the value when this event happened?" is a valid question

**Trade-off:** Row count grows with each change. Joins require range predicates on validity dates. Surrogate keys differ across versions of the same entity.

**Implementation considerations:**
- Always include both `valid_from` and `valid_to` (not just one)
- Use `valid_to IS NULL` or `is_current = TRUE` for the active record (include both for flexibility)
- Set `valid_to` of the previous row to match `valid_from` of the new row (no gaps)
- Consider adding a `version_number` column for debugging

## SCD Type 3: Add Column

Store the previous and current values as separate columns. Track one level of history:

```sql
CREATE TABLE dim_customer (
    customer_key         INT PRIMARY KEY,
    customer_id          VARCHAR(50),
    current_city         VARCHAR(100),
    previous_city        VARCHAR(100),
    city_changed_at      TIMESTAMP
);

-- | customer_key | customer_id | current_city   | previous_city | city_changed_at |
-- | 1001         | C-100       | San Francisco  | New York      | 2024-06-15      |
```

**When to use:**
- Only one prior value is needed (not full history)
- Before-and-after analysis (e.g., comparing current vs previous segment)
- When SCD Type 2 row proliferation is unacceptable
- Limited number of tracked attributes (adding column pairs for many attributes is unwieldy)

**Trade-off:** Only one level of history. If the value changes again, the oldest value is lost. Schema changes required for each tracked attribute.

## SCD Type 4: Separate History Table

Keep the current dimension table clean and push all history into a separate table:

```sql
-- Current dimension (always one row per entity)
CREATE TABLE dim_customer (
    customer_key     INT PRIMARY KEY,
    customer_id      VARCHAR(50),
    customer_name    VARCHAR(200),
    city             VARCHAR(100),
    updated_at       TIMESTAMP
);

-- History table (all prior versions)
CREATE TABLE dim_customer_history (
    customer_history_key  INT PRIMARY KEY,
    customer_key          INT REFERENCES dim_customer,
    customer_id           VARCHAR(50),
    customer_name         VARCHAR(200),
    city                  VARCHAR(100),
    valid_from            TIMESTAMP,
    valid_to              TIMESTAMP
);
```

**When to use:**
- Current-state queries must be fast and simple (no range predicates)
- Historical queries are infrequent but must be supported
- The current dimension is exposed to BI tools that cannot handle SCD Type 2 range joins
- Separating hot-path (current) from cold-path (historical) access patterns

**Trade-off:** Two tables to maintain. Current-state queries are fast; historical queries require joining the history table.

## SCD Type 6: Hybrid (Type 1 + 2 + 3)

Combine Type 1 (overwrite), Type 2 (add row), and Type 3 (add column) in a single table:

```sql
CREATE TABLE dim_customer (
    customer_key       INT PRIMARY KEY,       -- surrogate (Type 2)
    customer_id        VARCHAR(50),           -- natural key
    current_city       VARCHAR(100),          -- Type 1: always current value
    historical_city    VARCHAR(100),          -- Type 3: value at this version
    valid_from         TIMESTAMP,             -- Type 2: version tracking
    valid_to           TIMESTAMP,
    is_current         BOOLEAN
);

-- Customer moves NYC -> SF -> LA:
-- | customer_key | customer_id | current_city | historical_city | valid_from  | valid_to    | is_current |
-- | 1001         | C-100       | Los Angeles  | New York        | 2023-01-01  | 2024-06-15  | false      |
-- | 1002         | C-100       | Los Angeles  | San Francisco   | 2024-06-15  | 2025-03-01  | false      |
-- | 1003         | C-100       | Los Angeles  | Los Angeles     | 2025-03-01  | NULL        | true       |
```

**Key behavior:**
- `current_city` (Type 1): Overwritten on all rows to reflect the latest value
- `historical_city` (Type 3): Preserves the value that was active during this version's validity
- `valid_from` / `valid_to` (Type 2): Full version history maintained

**When to use:**
- Need both "what is the current value?" and "what was the value at event time?" queries
- Analysts want to filter by current city while also seeing historical assignments
- BI tool requires a single table with both current and versioned attributes

**Trade-off:** Most complex to implement and maintain. `current_city` must be updated across all historical rows when a change occurs. Best suited for high-value dimensions with critical time-variant analysis needs.

## dbt Snapshots for SCD Type 2

dbt snapshots automate SCD Type 2 tracking with two strategy options:

### Timestamp Strategy

Detect changes using an `updated_at` column in the source:

```sql
-- snapshots/snap_customers.sql
{% snapshot snap_customers %}

{{
    config(
        target_schema='snapshots',
        unique_key='customer_id',
        strategy='timestamp',
        updated_at='updated_at'
    )
}}

SELECT
    customer_id,
    customer_name,
    city,
    email,
    updated_at
FROM {{ source('crm', 'customers') }}

{% endsnapshot %}
```

- Requires a reliable `updated_at` column in the source
- Only detects changes when the timestamp advances
- Faster than check strategy for wide tables
- Preferred when the source provides a trustworthy update timestamp

### Check Strategy

Detect changes by comparing column values directly:

```sql
-- snapshots/snap_products.sql
{% snapshot snap_products %}

{{
    config(
        target_schema='snapshots',
        unique_key='product_id',
        strategy='check',
        check_cols=['product_name', 'category', 'price']
    )
}}

SELECT
    product_id,
    product_name,
    category,
    price
FROM {{ source('erp', 'products') }}

{% endsnapshot %}
```

- Use when the source has no reliable `updated_at` column
- Specify `check_cols` to watch specific columns, or use `check_cols='all'`
- Compares every specified column on each run (more expensive for wide tables)
- Catches changes that do not update the timestamp

**Snapshot output columns:**
- `dbt_scd_id`: unique ID per snapshot row
- `dbt_valid_from`: when this version became active
- `dbt_valid_to`: when this version was superseded (NULL = current)
- `dbt_updated_at`: snapshot run timestamp

**Querying snapshot output:**

```sql
-- Current records
SELECT * FROM {{ ref('snap_customers') }}
WHERE dbt_valid_to IS NULL;

-- Historical state at a specific date
SELECT * FROM {{ ref('snap_customers') }}
WHERE '2024-03-15' >= dbt_valid_from
  AND ('2024-03-15' < dbt_valid_to OR dbt_valid_to IS NULL);
```

## When to Use Each SCD Type

| SCD Type | History Depth | Complexity | Best For |
|----------|--------------|------------|----------|
| Type 0 | None (immutable) | Trivial | First-touch attribution, creation-time attributes |
| Type 1 | None (overwrite) | Low | Error corrections, attributes where only current matters |
| Type 2 | Full | Medium | Compliance, audit, time-variant analysis |
| Type 3 | One prior value | Low | Before/after comparisons, limited change tracking |
| Type 4 | Full (separate table) | Medium | Fast current-state queries + historical archive |
| Type 6 | Full + current overlay | High | Both current and historical queries in one table |

**Decision guide:**
1. Does the attribute ever change? No --> Type 0
2. Does history matter? No --> Type 1
3. Do consumers need full history? Yes --> Type 2 (default choice)
4. Is one prior value sufficient? Yes --> Type 3
5. Must current-state queries avoid range joins? Yes --> Type 4
6. Need both current and historical in one table? Yes --> Type 6

**Default recommendation:** Start with SCD Type 2 (via dbt snapshots) unless there is a specific reason to choose another type. Type 2 preserves the most optionality and is well-supported by tooling.

## OBT (One Big Table) Pattern

The One Big Table joins all relevant facts and dimensions into a single wide, denormalized table for consumption:

```sql
-- models/marts/obt_sales.sql
SELECT
    f.order_id,
    f.order_date,
    f.quantity,
    f.net_amount,
    c.customer_name,
    c.customer_segment,
    c.city AS customer_city,
    p.product_name,
    p.category AS product_category,
    p.brand AS product_brand,
    s.store_name,
    s.region AS store_region,
    d.fiscal_quarter,
    d.fiscal_year
FROM fct_orders f
JOIN dim_customer c ON f.customer_key = c.customer_key AND c.is_current = TRUE
JOIN dim_product p ON f.product_key = p.product_key
JOIN dim_store s ON f.store_key = s.store_key
JOIN dim_date d ON f.order_date_key = d.date_key
```

**OBT design principles:**
- Scope each OBT to a single analytical domain (sales, marketing, support)
- Build OBTs from gold-layer star schemas, not directly from silver
- Use `is_current = TRUE` for SCD Type 2 dimensions unless time-variant analysis is needed
- Accept wide tables (50-100+ columns) as a trade-off for zero-join consumption
- Materialize as a table refreshed on schedule for dashboard performance
- Include calculated metrics inline rather than requiring consumers to compute them

**When OBT is appropriate:**
- Self-serve analytics where consumers cannot write joins
- BI tools (Looker, Tableau, Power BI) that perform best against flat tables
- Embedded analytics with strict query latency requirements
- Data science feature stores requiring denormalized input

**When OBT is not appropriate:**
- As a replacement for star schemas (build stars first, OBT second)
- When the table exceeds hundreds of columns (split by domain)
- When different consumers need different grains (build multiple OBTs)
- As the primary modeling layer (OBT is always a derivative)
