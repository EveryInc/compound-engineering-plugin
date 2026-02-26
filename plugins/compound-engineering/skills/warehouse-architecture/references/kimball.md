# Kimball Dimensional Modeling

Ralph Kimball's dimensional modeling methodology organizes data into fact and dimension tables arranged in star schemas. Optimize for query performance and business user comprehension.

## Star Schema Design

A star schema places a central fact table surrounded by dimension tables joined via foreign keys:

```
           dim_date
              |
dim_product --+-- fct_sales --+-- dim_customer
              |               |
           dim_store       dim_promotion
```

**Design principles:**
- Fact tables hold numeric measures at a defined grain
- Dimension tables hold descriptive attributes for filtering and grouping
- Foreign keys in the fact table reference surrogate keys in dimensions
- Prefer star joins over snowflake joins (flatten dimension hierarchies)
- Keep dimension tables denormalized for query simplicity

**Snowflake schema** normalizes dimensions into sub-dimensions. Avoid unless storage constraints demand it -- the query complexity cost rarely justifies the storage savings on modern platforms.

## Fact Table Types

### Transaction Fact Table

Record one row per discrete business event at the atomic grain:

```sql
CREATE TABLE fct_order_lines (
    order_line_sk    BIGINT PRIMARY KEY,
    order_date_key   INT REFERENCES dim_date(date_key),
    product_key      INT REFERENCES dim_product(product_key),
    customer_key     INT REFERENCES dim_customer(customer_key),
    store_key        INT REFERENCES dim_store(store_key),
    quantity         INT,
    unit_price       DECIMAL(10,2),
    discount_amount  DECIMAL(10,2),
    net_amount       DECIMAL(10,2)
);
```

- Most common fact table type
- Naturally additive measures (quantity, amount)
- Sparse: only rows where events occurred

### Periodic Snapshot Fact Table

Capture cumulative measures at regular intervals (daily, weekly, monthly):

```sql
CREATE TABLE fct_inventory_daily (
    snapshot_date_key   INT REFERENCES dim_date(date_key),
    product_key         INT REFERENCES dim_product(product_key),
    warehouse_key       INT REFERENCES dim_warehouse(warehouse_key),
    quantity_on_hand    INT,
    quantity_on_order   INT,
    days_of_supply      DECIMAL(5,1)
);
```

- Dense: one row per entity per period, even with no activity
- Semi-additive measures (do not sum across time; average or use latest)
- Use for inventory, account balances, pipeline snapshots

### Accumulating Snapshot Fact Table

Track the lifecycle of a process with milestones and lag metrics:

```sql
CREATE TABLE fct_order_fulfillment (
    order_key            INT,
    order_date_key       INT REFERENCES dim_date(date_key),
    ship_date_key        INT REFERENCES dim_date(date_key),
    delivery_date_key    INT REFERENCES dim_date(date_key),
    return_date_key      INT REFERENCES dim_date(date_key),
    order_to_ship_days   INT,
    ship_to_delivery_days INT,
    current_status       VARCHAR(20)
);
```

- Row updated as the process advances through milestones
- Multiple date foreign keys (one per milestone)
- Lag columns measure time between milestones
- Use for order fulfillment, claims processing, loan origination

### Factless Fact Table

Record events or conditions with no numeric measures:

```sql
-- Event tracking: student attended class
CREATE TABLE fct_attendance (
    date_key      INT REFERENCES dim_date(date_key),
    student_key   INT REFERENCES dim_student(student_key),
    class_key     INT REFERENCES dim_class(class_key)
);

-- Coverage tracking: which products are on promotion
CREATE TABLE fct_promotion_coverage (
    date_key       INT REFERENCES dim_date(date_key),
    product_key    INT REFERENCES dim_product(product_key),
    promotion_key  INT REFERENCES dim_promotion(promotion_key)
);
```

- Row existence is the fact
- Useful for tracking coverage, eligibility, attendance, authorization
- Query by counting rows or checking existence

## Dimension Types

### Conformed Dimensions

Share identical dimension tables across multiple fact tables to enable cross-process analysis:

```
dim_customer (conformed)
   |
   +-- fct_sales
   +-- fct_returns
   +-- fct_support_tickets
   +-- fct_web_sessions
```

- Same surrogate keys, same attributes, same values across all stars
- Maintained by a single ETL process
- Enable drill-across queries joining facts from different business processes
- `dim_date` and `dim_customer` are the most commonly conformed dimensions

### Junk Dimensions

Combine low-cardinality flags and indicators into a single dimension instead of cluttering the fact table:

```sql
CREATE TABLE dim_order_flags (
    order_flag_key    INT PRIMARY KEY,
    is_gift_wrapped   BOOLEAN,
    is_expedited      BOOLEAN,
    payment_method    VARCHAR(20),  -- 'credit_card', 'paypal', 'wire'
    order_channel     VARCHAR(20)   -- 'web', 'mobile', 'in_store'
);
```

- Pre-populate all observed combinations
- Keeps fact table row width narrow
- Typically under 1000 rows

### Degenerate Dimensions

Store dimension attributes directly on the fact table when no parent dimension table is needed:

```sql
CREATE TABLE fct_order_lines (
    ...
    order_number    VARCHAR(20),  -- degenerate dimension
    invoice_number  VARCHAR(20),  -- degenerate dimension
    ...
);
```

- Transaction identifiers (order number, invoice number, receipt number)
- No separate dimension table exists
- Used for grouping transaction lines belonging to the same event

### Role-Playing Dimensions

Reuse a single physical dimension multiple times in the same fact table under different roles:

```sql
-- Single physical dim_date, referenced three ways
SELECT
    order_d.full_date   AS order_date,
    ship_d.full_date    AS ship_date,
    delivery_d.full_date AS delivery_date,
    f.net_amount
FROM fct_order_fulfillment f
JOIN dim_date order_d    ON f.order_date_key = order_d.date_key
JOIN dim_date ship_d     ON f.ship_date_key = ship_d.date_key
JOIN dim_date delivery_d ON f.delivery_date_key = delivery_d.date_key;
```

- `dim_date` is the most common role-playing dimension
- Create views or aliases for clarity: `dim_order_date`, `dim_ship_date`
- In dbt, use `ref('dim_date')` with alias for each role

## Grain Definition

Define the grain before designing any fact table. The grain states what one row represents:

**Examples:**
- `fct_order_lines`: one row per order line item
- `fct_inventory_daily`: one row per product per warehouse per day
- `fct_page_views`: one row per page view event

**Rules for grain:**
- State the grain in plain English before writing DDL
- Every fact and dimension foreign key must be consistent with the declared grain
- Never mix grains in a single fact table (e.g., daily and monthly rows together)
- When in doubt, choose the most atomic grain -- aggregate later in views or downstream models
- Document the grain in the model's YAML description or as a SQL comment

**Grain violations to watch for:**
- Adding a dimension that does not exist at the declared grain
- Aggregating measures before loading (losing atomic detail)
- Storing header-level and line-level data in the same table

## Surrogate Keys vs Natural Keys

Use surrogate keys as the primary key in dimension tables. Retain natural keys as attributes:

```sql
CREATE TABLE dim_product (
    product_key    INT PRIMARY KEY,       -- surrogate key (warehouse-assigned)
    product_id     VARCHAR(50) NOT NULL,  -- natural key (from source system)
    product_name   VARCHAR(200),
    category       VARCHAR(100),
    ...
);
```

**Why surrogate keys:**
- Insulate the warehouse from source system key changes
- Enable SCD Type 2 tracking (multiple rows per natural key)
- Consistent integer joins perform better than VARCHAR joins
- Handle `NULL` or unknown dimension members cleanly

**Generation strategies:**
- Auto-incrementing integer (simple, platform-native)
- `dbt_utils.generate_surrogate_key()` in dbt (deterministic hash)
- Hash of natural key (reproducible across loads, good for Data Vault integration)

**Always retain the natural key** as a non-key attribute for traceability and source system lookups.

## Late-Arriving Facts and Dimensions

### Late-Arriving Facts

Facts that arrive after the reporting period they belong to:

- Insert with the correct date key (the date the event occurred, not the load date)
- Periodic snapshot tables need restatement for the affected period
- Track a `loaded_at` timestamp to distinguish late arrivals from on-time facts

### Late-Arriving Dimensions

Dimension context not yet available when the fact arrives:

```
Scenario: Order arrives referencing customer_id = 9999,
          but customer 9999 hasn't been loaded into dim_customer yet.
```

**Resolution pattern:**
1. Insert a placeholder dimension row: `customer_key = -1, customer_name = 'Unknown'`
2. Load the fact row pointing to the placeholder key
3. When the dimension record arrives, update the placeholder row with real attributes
4. If using SCD Type 2, insert a new row and optionally repoint fact rows

**In dbt:** Handle with a staging model that left-joins to the dimension and coalesces to a default surrogate key for unmatched records.

## Common Anti-Patterns

### Centipede Fact Table

A fact table with dozens of foreign keys (20+), many of which are sparsely populated:

```sql
-- Anti-pattern: too many dimension FKs
CREATE TABLE fct_sales (
    date_key, customer_key, product_key, store_key,
    promotion_key, salesperson_key, campaign_key,
    weather_key, competitor_key, region_key,
    channel_key, device_key, referral_key,
    coupon_key, loyalty_key, ...  -- 30+ foreign keys
);
```

**Problems:**
- Wide rows with many NULLs waste storage
- Joins become unwieldy and slow
- Business users cannot comprehend the schema

**Fixes:**
- Combine low-cardinality flags into junk dimensions
- Move infrequently used dimensions to a separate, linked fact table (bridge or outrigger)
- Question whether each dimension truly belongs at this grain

### Too Many Dimensions (Over-Dimensionalization)

Adding dimension foreign keys that do not match the fact table grain or that duplicate information already captured in other dimensions:

**Symptoms:**
- Dimension provides no filtering or grouping value at the fact grain
- Dimension is always joined through another dimension (use the parent instead)
- Dimension has a 1:1 relationship with another dimension (merge them)

### Other Anti-Patterns

- **Mixed-grain fact table:** Storing daily and monthly aggregates in the same table
- **Overloaded dimension:** A single dimension containing unrelated attributes (e.g., customer + product in one table)
- **Missing conformed dimensions:** Each fact table defines its own customer dimension with different keys and attributes
- **Aggregate-only fact tables:** Loading pre-aggregated data without an atomic-grain base table
- **Treating the warehouse as OLTP:** Normalizing fact tables into 3NF patterns
- **Calendar dimension without fiscal attributes:** Failing to include fiscal year, fiscal quarter, and fiscal period alongside calendar date attributes
