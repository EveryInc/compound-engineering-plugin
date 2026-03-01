# Data Vault 2.0 Modeling

Data Vault 2.0 (DV2) is a detail-oriented, historically tracked, and uniquely linked set of normalized tables. Design for auditability, parallel loading, and resilience to source system change.

## Core Components

### Hubs

Hubs represent unique business entities identified by their business keys:

```sql
CREATE TABLE hub_customer (
    hub_customer_hk    BINARY(32) PRIMARY KEY,  -- hash of business key
    customer_id        VARCHAR(50) NOT NULL,     -- business key
    load_date          TIMESTAMP NOT NULL,
    record_source      VARCHAR(100) NOT NULL
);
```

**Hub rules:**
- One hub per business concept (customer, product, order, account)
- Contains only the business key, hash key, load date, and record source
- Never stores descriptive attributes (those belong in satellites)
- Business key must be a true identifier from the source system
- Insert-only: once a hub row exists, it is never updated or deleted
- A hub row is created the first time a business key is observed from any source

### Links

Links represent relationships and transactions between hubs:

```sql
CREATE TABLE link_order_customer (
    link_order_customer_hk  BINARY(32) PRIMARY KEY,  -- hash of combined business keys
    hub_order_hk            BINARY(32) NOT NULL REFERENCES hub_order,
    hub_customer_hk         BINARY(32) NOT NULL REFERENCES hub_customer,
    load_date               TIMESTAMP NOT NULL,
    record_source           VARCHAR(100) NOT NULL
);
```

**Link rules:**
- Record relationships between two or more hubs
- Hash key derived from the combination of parent hub business keys
- Insert-only: once a link row exists, it is never updated or deleted
- Transaction links may include a degenerate key (e.g., transaction ID) in the link itself
- Same-as links connect two instances of the same hub (e.g., customer merges)
- Hierarchical links connect a hub to itself (e.g., employee-manager)

**Link types:**
- **Standard link:** Relationship between two or more hubs
- **Transaction link:** Event-level with optional degenerate key and embedded measures
- **Same-as link:** Merge two business keys of the same entity
- **Hierarchical link:** Parent-child within one hub

### Satellites

Satellites store descriptive attributes and their change history:

```sql
CREATE TABLE sat_customer_details (
    hub_customer_hk    BINARY(32) NOT NULL REFERENCES hub_customer,
    load_date          TIMESTAMP NOT NULL,
    load_end_date      TIMESTAMP,                -- NULL = current record
    hash_diff          BINARY(32) NOT NULL,       -- hash of all descriptive columns
    record_source      VARCHAR(100) NOT NULL,
    customer_name      VARCHAR(200),
    email              VARCHAR(200),
    phone              VARCHAR(50),
    address_line_1     VARCHAR(200),
    city               VARCHAR(100),
    state              VARCHAR(50),
    postal_code        VARCHAR(20),
    PRIMARY KEY (hub_customer_hk, load_date)
);
```

**Satellite rules:**
- Attach to a single hub or link (never to multiple)
- Primary key is the parent hash key + load_date
- Insert a new row only when descriptive attributes change (delta detection via hash_diff)
- Group attributes by rate of change and source system
- Split satellites when attributes change at different frequencies

**Satellite splitting guidance:**
- `sat_customer_personal` (name, email, phone) -- changes rarely
- `sat_customer_address` (street, city, state, zip) -- changes occasionally
- `sat_customer_preferences` (language, currency, notifications) -- changes frequently
- `sat_customer_crm` (CRM-sourced attributes) -- different source system

## Data Vault 2.0 Additions

### Hash Keys

Replace sequence-based surrogate keys with deterministic hash keys:

```sql
-- Hash key generation (MD5 or SHA-256)
hub_customer_hk = MD5(UPPER(TRIM(customer_id)))

-- Composite hash key for links
link_order_customer_hk = MD5(CONCAT(
    UPPER(TRIM(order_id)), '||',
    UPPER(TRIM(customer_id))
))
```

**Hash key benefits:**
- Deterministic: same input always produces same key (no sequence dependency)
- Enable parallel loading across multiple source systems without key coordination
- Idempotent loads: reloading the same data produces the same hash keys
- Platform-independent: hash functions work identically across systems

**Hash key conventions:**
- Apply `UPPER(TRIM(...))` to all business key components before hashing
- Use a consistent delimiter (`||`) between composite key components
- Choose one algorithm (MD5 for speed, SHA-256 for collision resistance) and use it everywhere
- Store as `BINARY(16)` for MD5 or `BINARY(32)` for SHA-256

### Hash Diffs

Detect changes in satellite attributes without comparing every column:

```sql
hash_diff = MD5(CONCAT(
    COALESCE(UPPER(TRIM(customer_name)), '^^'),
    '||',
    COALESCE(UPPER(TRIM(email)), '^^'),
    '||',
    COALESCE(UPPER(TRIM(phone)), '^^')
))
```

- Hash all descriptive columns in the satellite
- Compare incoming hash_diff against the current row's hash_diff
- Insert a new satellite row only when hash_diff changes
- Use a consistent NULL replacement token (`^^` or `__NULL__`)

### Effectivity Satellites

Track the validity period of a link relationship:

```sql
CREATE TABLE sat_eff_order_customer (
    link_order_customer_hk  BINARY(32) NOT NULL,
    load_date               TIMESTAMP NOT NULL,
    load_end_date           TIMESTAMP,           -- NULL = currently active
    is_active               BOOLEAN DEFAULT TRUE,
    record_source           VARCHAR(100) NOT NULL,
    PRIMARY KEY (link_order_customer_hk, load_date)
);
```

- Indicate when a relationship became active and when it ended
- Use for relationships that change over time (customer-account assignments, employee-department)
- `load_end_date IS NULL` identifies the current relationship

## Loading Patterns

### Hub-First Loading

Load hubs before links and satellites to maintain referential integrity:

```
Step 1: Load all hubs (can be parallel across different hub types)
Step 2: Load all links (can be parallel across different link types)
Step 3: Load all satellites (can be parallel across all satellites)
```

### Parallel Loading

DV2 hash keys enable parallel loading without coordination:

```
Source A (CRM) ──> hub_customer (insert if new hash_key)
                   sat_customer_crm (insert if hash_diff changed)

Source B (Web) ──> hub_customer (insert if new hash_key)
                   sat_customer_web (insert if hash_diff changed)

Source C (ERP) ──> hub_customer (insert if new hash_key)
                   sat_customer_erp (insert if hash_diff changed)
```

- Multiple sources load the same hub simultaneously without conflict
- Each source writes to its own satellite (no cross-source collision)
- Hash keys are deterministic: same customer_id from different sources produces the same hub row

### Loading in dbt

```
models/
├── staging/              -- source-conformed, 1:1 with source tables
│   ├── stg_crm__customers.sql
│   └── stg_erp__customers.sql
├── intermediate/         -- raw vault
│   ├── raw_vault/
│   │   ├── hubs/
│   │   │   └── hub_customer.sql
│   │   ├── links/
│   │   │   └── link_order_customer.sql
│   │   └── satellites/
│   │       ├── sat_customer_crm.sql
│   │       └── sat_customer_erp.sql
│   └── business_vault/
│       ├── bridges/
│       │   └── bridge_customer_order.sql
│       └── pit/
│           └── pit_customer.sql
└── marts/                -- star schemas built from vault
    ├── dim_customer.sql
    └── fct_orders.sql
```

**dbt packages for Data Vault:**
- `dbtvault` (by Datavault) -- macros for hub, link, satellite, and PIT generation
- `automate_dv` -- automated vault generation from metadata

## Business Vault

The Business Vault layer adds derived and calculated structures on top of the raw vault. It applies business rules while maintaining auditability.

### Calculated Satellites

Derive new attributes from raw satellite data:

```sql
-- sat_customer_classification (business vault)
-- Derives customer tier from raw attributes
SELECT
    hub_customer_hk,
    load_date,
    CASE
        WHEN lifetime_revenue > 100000 THEN 'Enterprise'
        WHEN lifetime_revenue > 10000  THEN 'Mid-Market'
        ELSE 'SMB'
    END AS customer_tier,
    record_source
FROM sat_customer_revenue;
```

- Apply business logic to raw vault data
- Store results in new satellites (not in raw vault satellites)
- Mark record_source to indicate the calculation origin
- Recalculate when business rules change

### Bridge Tables

Pre-join hubs and links for query performance:

```sql
-- bridge_customer_order: pre-resolved join path
CREATE TABLE bridge_customer_order AS
SELECT
    hc.hub_customer_hk,
    hc.customer_id,
    lo.link_order_customer_hk,
    ho.hub_order_hk,
    ho.order_id
FROM hub_customer hc
JOIN link_order_customer lo ON hc.hub_customer_hk = lo.hub_customer_hk
JOIN hub_order ho ON lo.hub_order_hk = ho.hub_order_hk;
```

- Eliminate multi-hop joins for common access patterns
- Rebuild on schedule (not real-time)
- Include only active relationships (filter by effectivity satellite)

### Point-in-Time (PIT) Tables

Resolve temporal joins across multiple satellites for a given hub:

```sql
-- pit_customer: snapshot of latest satellite records per load_date
CREATE TABLE pit_customer AS
SELECT
    hc.hub_customer_hk,
    snap.snapshot_date,
    sd.load_date AS details_load_date,
    sa.load_date AS address_load_date,
    sp.load_date AS preferences_load_date
FROM hub_customer hc
CROSS JOIN date_spine snap
LEFT JOIN sat_customer_details sd
    ON hc.hub_customer_hk = sd.hub_customer_hk
    AND sd.load_date <= snap.snapshot_date
    AND (sd.load_end_date > snap.snapshot_date OR sd.load_end_date IS NULL)
LEFT JOIN sat_customer_address sa
    ON hc.hub_customer_hk = sa.hub_customer_hk
    AND sa.load_date <= snap.snapshot_date
    AND (sa.load_end_date > snap.snapshot_date OR sa.load_end_date IS NULL)
LEFT JOIN sat_customer_preferences sp
    ON hc.hub_customer_hk = sp.hub_customer_hk
    AND sp.load_date <= snap.snapshot_date
    AND (sp.load_end_date > snap.snapshot_date OR sp.load_end_date IS NULL);
```

- Resolve "what did we know about this customer on date X?" queries
- Pre-compute temporal joins that are expensive at query time
- Rebuild daily or on schedule
- Essential for reporting against historical state

## When to Use Data Vault

**Data Vault is a strong fit when:**
- Multiple source systems feed the warehouse (4+)
- Source schemas change frequently
- Full historical tracking is required for audit or compliance
- Parallel loading from multiple sources is necessary
- The team needs to onboard new sources without redesigning existing models
- Business rules change often (separate raw vault from business vault)

**Data Vault may be overkill when:**
- A single source system with stable schema
- Rapid time-to-first-report is the priority
- The team lacks Data Vault experience and the timeline is tight
- Reporting requirements are well-understood and unlikely to change

## Anti-Patterns

### Over-Satelliting

Creating too many satellites for a single hub:

```
-- Anti-pattern: one satellite per attribute
sat_customer_name
sat_customer_email
sat_customer_phone
sat_customer_address_line_1
sat_customer_city
...
```

**Fix:** Group attributes by rate of change and source system. Three to five satellites per hub is typical. Splitting beyond that adds join complexity without meaningful benefit.

### Missing Business Keys

Using surrogate IDs or system-generated keys as hub business keys:

```
-- Anti-pattern: using auto-increment ID as business key
hub_customer_hk = MD5(auto_increment_id)
```

**Fix:** Identify the true business key (customer email, account number, SKU). If the source system only provides surrogate keys, compose a business key from stable, identifying attributes.

### Raw Vault Business Logic

Applying business rules, transformations, or filters inside raw vault models:

```sql
-- Anti-pattern: filtering in raw vault
SELECT * FROM stg_customers
WHERE customer_status = 'active'  -- business rule in raw vault
```

**Fix:** Raw vault loads everything from the source without judgment. Apply business rules in the Business Vault layer (calculated satellites, bridges).

### Ignoring Effectivity Satellites

Loading links without tracking when relationships start and end:

**Fix:** Add effectivity satellites to any link where relationships change over time. Without them, point-in-time queries on relationships become impossible.

### Treating Data Vault as the Query Layer

Exposing raw vault tables directly to BI tools and analysts:

**Fix:** Build star schemas or OBTs in the marts layer on top of the vault. The vault is optimized for loading and auditability, not for ad-hoc queries. Analysts should query gold-layer dimensional models.
