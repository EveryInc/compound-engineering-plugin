# Anomaly Detection

## Z-Score Based Detection

Detect anomalies by comparing current metric values to historical distributions. Flag values that deviate beyond a configurable number of standard deviations.

### Volume Anomaly (Row Count)

```sql
-- Calculate z-score for daily row counts
WITH daily_counts AS (
    SELECT
        DATE_TRUNC('day', created_at) AS load_date,
        COUNT(*) AS row_count
    FROM {{ ref('fct_orders') }}
    WHERE created_at >= DATEADD('day', -90, CURRENT_DATE)
    GROUP BY 1
),
stats AS (
    SELECT
        AVG(row_count) AS mean_count,
        STDDEV(row_count) AS stddev_count
    FROM daily_counts
    WHERE load_date < CURRENT_DATE  -- Exclude today (partial)
),
scored AS (
    SELECT
        d.load_date,
        d.row_count,
        s.mean_count,
        s.stddev_count,
        CASE
            WHEN s.stddev_count = 0 THEN 0
            ELSE (d.row_count - s.mean_count) / s.stddev_count
        END AS z_score
    FROM daily_counts d
    CROSS JOIN stats s
)
SELECT *
FROM scored
WHERE ABS(z_score) > 3
ORDER BY load_date DESC
```

### Freshness Anomaly

```sql
-- Detect tables with stale data based on historical load patterns
WITH load_times AS (
    SELECT
        DATE_TRUNC('day', loaded_at) AS load_date,
        MAX(loaded_at) AS last_load
    FROM {{ source('raw', 'events') }}
    WHERE loaded_at >= DATEADD('day', -30, CURRENT_DATE)
    GROUP BY 1
),
intervals AS (
    SELECT
        load_date,
        DATEDIFF(
            'minute',
            LAG(last_load) OVER (ORDER BY load_date),
            last_load
        ) AS minutes_since_last
    FROM load_times
),
stats AS (
    SELECT
        AVG(minutes_since_last) AS mean_interval,
        STDDEV(minutes_since_last) AS stddev_interval
    FROM intervals
    WHERE minutes_since_last IS NOT NULL
)
SELECT
    i.load_date,
    i.minutes_since_last,
    CASE
        WHEN s.stddev_interval = 0 THEN 0
        ELSE (i.minutes_since_last - s.mean_interval) / s.stddev_interval
    END AS z_score
FROM intervals i
CROSS JOIN stats s
WHERE i.minutes_since_last IS NOT NULL
ORDER BY i.load_date DESC
```

### Metric Value Anomaly

```sql
-- Detect anomalous daily revenue
WITH daily_revenue AS (
    SELECT
        DATE_TRUNC('day', order_date) AS revenue_date,
        SUM(order_total) AS total_revenue
    FROM {{ ref('fct_orders') }}
    WHERE order_date >= DATEADD('day', -90, CURRENT_DATE)
    GROUP BY 1
),
stats AS (
    SELECT
        AVG(total_revenue) AS mean_revenue,
        STDDEV(total_revenue) AS stddev_revenue
    FROM daily_revenue
    WHERE revenue_date < CURRENT_DATE
)
SELECT
    d.revenue_date,
    d.total_revenue,
    ROUND((d.total_revenue - s.mean_revenue) / NULLIF(s.stddev_revenue, 0), 2) AS z_score
FROM daily_revenue d
CROSS JOIN stats s
WHERE ABS((d.total_revenue - s.mean_revenue) / NULLIF(s.stddev_revenue, 0)) > 3
ORDER BY d.revenue_date DESC
```

## Percentage Threshold Alerts

Simpler than z-scores. Compare current values to recent baselines with fixed percentage thresholds.

### Row Count Threshold

```yaml
# SodaCL percentage threshold check
checks for fct_orders:
  - change for row_count:
      warn: when > 30%
      fail: when > 50%
      name: Row count change alert
```

### NULL Rate Threshold

```yaml
checks for fct_orders:
  - missing_percent(customer_email) < 5%:
      name: Email NULL rate
  - missing_percent(order_total) = 0%:
      name: Order total must not be NULL
```

### Distinct Count Threshold

```yaml
checks for fct_orders:
  - change for distinct(order_status):
      warn: when differs
      name: Order status values changed
  - distinct(currency_code) between 3 and 10:
      name: Currency code cardinality
```

### Custom SQL Threshold

```yaml
checks for fct_orders:
  - failed rows:
      name: Orders with negative totals
      fail query: |
        SELECT order_id, order_total
        FROM fct_orders
        WHERE order_total < 0
```

## Elementary Data Observability

### Setup

Add Elementary to a dbt project:

```yaml
# packages.yml
packages:
  - package: elementary-data/elementary
    version: ">=0.16.0,<0.17.0"
```

```bash
dbt deps
dbt run --select elementary
```

Elementary creates monitoring tables in the warehouse that store test results, run metadata, and anomaly scores.

### Anomaly Tests

```yaml
# models/marts/_marts__models.yml
models:
  - name: fct_orders
    columns:
      - name: order_total
        data_tests:
          - elementary.column_anomalies:
              column_anomalies:
                - mean
                - standard_deviation
                - zero_count
              timestamp_column: created_at
              backfill_days: 30
              sensitivity: 3  # Z-score threshold
      - name: order_id
        data_tests:
          - elementary.column_anomalies:
              column_anomalies:
                - null_count
                - null_percent
              timestamp_column: created_at
              backfill_days: 30

  - name: fct_orders
    data_tests:
      - elementary.volume_anomalies:
          timestamp_column: created_at
          backfill_days: 30
          sensitivity: 3
      - elementary.freshness_anomalies:
          timestamp_column: created_at
          backfill_days: 30
```

### Available Elementary Anomaly Types

| Test | Monitors | When to Use |
|------|---------|-------------|
| `volume_anomalies` | Row count over time | Every table |
| `freshness_anomalies` | Time since last row | Every table with timestamps |
| `column_anomalies` | Column-level metrics | Key business columns |
| `all_columns_anomalies` | All columns at once | Initial setup, broad monitoring |
| `dimension_anomalies` | Group-by distribution shifts | Categorical columns |
| `event_freshness_anomalies` | Event-level arrival time | Streaming or event-driven data |

### Elementary Dashboard

```bash
# Generate and open the Elementary report
edr report --open

# Send report to Slack
edr send-report --slack-token "${SLACK_TOKEN}" --slack-channel-name data-alerts
```

The report provides a unified view of all test results, anomalies, and model metadata.

## Custom Anomaly Detection with SQL

### Moving Average Comparison

```sql
-- Alert when today's value deviates from 7-day moving average
WITH daily_metrics AS (
    SELECT
        DATE_TRUNC('day', created_at) AS metric_date,
        COUNT(*) AS daily_count,
        AVG(COUNT(*)) OVER (
            ORDER BY DATE_TRUNC('day', created_at)
            ROWS BETWEEN 7 PRECEDING AND 1 PRECEDING
        ) AS moving_avg_7d
    FROM {{ ref('fct_orders') }}
    WHERE created_at >= DATEADD('day', -30, CURRENT_DATE)
    GROUP BY 1
)
SELECT
    metric_date,
    daily_count,
    ROUND(moving_avg_7d, 0) AS moving_avg_7d,
    ROUND(
        (daily_count - moving_avg_7d) / NULLIF(moving_avg_7d, 0) * 100,
        1
    ) AS pct_deviation
FROM daily_metrics
WHERE ABS((daily_count - moving_avg_7d) / NULLIF(moving_avg_7d, 0)) > 0.3
ORDER BY metric_date DESC
```

### Distribution Shift Detection

```sql
-- Detect shifts in categorical column distributions
WITH current_dist AS (
    SELECT
        order_status,
        COUNT(*) * 1.0 / SUM(COUNT(*)) OVER () AS current_pct
    FROM {{ ref('fct_orders') }}
    WHERE created_at >= DATEADD('day', -1, CURRENT_DATE)
    GROUP BY 1
),
baseline_dist AS (
    SELECT
        order_status,
        COUNT(*) * 1.0 / SUM(COUNT(*)) OVER () AS baseline_pct
    FROM {{ ref('fct_orders') }}
    WHERE created_at BETWEEN DATEADD('day', -31, CURRENT_DATE)
        AND DATEADD('day', -1, CURRENT_DATE)
    GROUP BY 1
)
SELECT
    COALESCE(c.order_status, b.order_status) AS order_status,
    ROUND(COALESCE(b.baseline_pct, 0) * 100, 2) AS baseline_pct,
    ROUND(COALESCE(c.current_pct, 0) * 100, 2) AS current_pct,
    ROUND(
        ABS(COALESCE(c.current_pct, 0) - COALESCE(b.baseline_pct, 0)) * 100,
        2
    ) AS drift_pct
FROM current_dist c
FULL OUTER JOIN baseline_dist b ON c.order_status = b.order_status
WHERE ABS(COALESCE(c.current_pct, 0) - COALESCE(b.baseline_pct, 0)) > 0.05
```

## Time-Series Aware Detection (Handling Seasonality)

### Day-of-Week Adjustment

```sql
-- Compare to same day-of-week historical average
WITH daily_counts AS (
    SELECT
        DATE_TRUNC('day', created_at) AS metric_date,
        DAYOFWEEK(DATE_TRUNC('day', created_at)) AS dow,
        COUNT(*) AS row_count
    FROM {{ ref('fct_orders') }}
    WHERE created_at >= DATEADD('day', -90, CURRENT_DATE)
    GROUP BY 1, 2
),
dow_stats AS (
    SELECT
        dow,
        AVG(row_count) AS mean_count,
        STDDEV(row_count) AS stddev_count
    FROM daily_counts
    WHERE metric_date < CURRENT_DATE
    GROUP BY 1
)
SELECT
    d.metric_date,
    d.row_count,
    ds.mean_count AS dow_mean,
    CASE
        WHEN ds.stddev_count = 0 THEN 0
        ELSE ROUND((d.row_count - ds.mean_count) / ds.stddev_count, 2)
    END AS dow_adjusted_z_score
FROM daily_counts d
JOIN dow_stats ds ON d.dow = ds.dow
WHERE ABS(
    CASE
        WHEN ds.stddev_count = 0 THEN 0
        ELSE (d.row_count - ds.mean_count) / ds.stddev_count
    END
) > 3
ORDER BY d.metric_date DESC
```

### Holiday and Known-Event Exclusion

Exclude known anomalous dates (holidays, sales events, outages) from baseline calculations. Maintain a reference table of exclusion dates:

```sql
-- Exclude known events from baseline
WITH baseline AS (
    SELECT
        DATE_TRUNC('day', created_at) AS metric_date,
        COUNT(*) AS row_count
    FROM {{ ref('fct_orders') }}
    WHERE created_at >= DATEADD('day', -90, CURRENT_DATE)
        AND DATE_TRUNC('day', created_at) NOT IN (
            SELECT event_date FROM {{ ref('dim_known_events') }}
        )
    GROUP BY 1
)
-- Then compute stats from this filtered baseline
```

## Alert Routing

### Severity-Based Routing

| Severity | Condition | Route | Response Time |
|----------|-----------|-------|---------------|
| Critical | Primary key violation, schema mismatch | PagerDuty on-call | Immediate |
| High | Freshness SLA breach, volume drop > 50% | Slack #data-alerts | 1 hour |
| Medium | NULL rate spike, metric anomaly (z > 3) | Slack #data-quality | 4 hours |
| Low | Distribution drift, cardinality change | Email digest | Next business day |

### Slack Alert Integration

```yaml
# Elementary Slack alerts
# In .edr/config.yml
slack:
  token: "${SLACK_TOKEN}"
  channel_name: data-alerts
  alert_suppression_interval: 24  # Hours between repeat alerts

# Soda Slack integration
# In configuration.yml
soda_cloud:
  host: cloud.soda.io
  api_key_id: "${SODA_API_KEY_ID}"
  api_key_secret: "${SODA_API_KEY_SECRET}"
```

### Custom Alert Script

```python
import requests
import os


def send_alert(severity: str, message: str, details: dict) -> None:
    """Route alerts based on severity level."""
    webhook_url = os.environ["SLACK_WEBHOOK_URL"]

    color_map = {
        "critical": "#FF0000",
        "high": "#FF6600",
        "medium": "#FFCC00",
        "low": "#0066FF",
    }

    payload = {
        "attachments": [
            {
                "color": color_map.get(severity, "#808080"),
                "title": f"Data Quality Alert: {severity.upper()}",
                "text": message,
                "fields": [
                    {"title": k, "value": str(v), "short": True}
                    for k, v in details.items()
                ],
            }
        ]
    }

    requests.post(webhook_url, json=payload, timeout=10)
```

## False Positive Management

### Tuning Sensitivity

- Start with z-score threshold of 3 (99.7% confidence interval)
- If too many false positives, increase to 3.5 or 4
- If missing real anomalies, decrease to 2.5
- Different metrics warrant different thresholds: volume checks can use 3, revenue checks may need 2.5

### Suppression Strategies

1. **Time-based suppression:** Do not re-alert on the same anomaly within 24 hours
2. **Known-event suppression:** Exclude holidays, promotions, and planned outages from baselines
3. **Minimum baseline requirement:** Require at least 14 days of historical data before alerting
4. **Consecutive-failure requirement:** Alert only after 2+ consecutive anomalous readings to filter transient spikes

### Feedback Loop

Track alert outcomes to improve detection:

```sql
-- Alert tracking table
CREATE TABLE IF NOT EXISTS data_quality.alert_outcomes (
    alert_id VARCHAR PRIMARY KEY,
    alert_timestamp TIMESTAMP_TZ,
    metric_name VARCHAR,
    severity VARCHAR,
    outcome VARCHAR,  -- 'true_positive', 'false_positive', 'acknowledged'
    resolved_at TIMESTAMP_TZ,
    notes VARCHAR
);
```

Review alert outcomes monthly. Adjust thresholds for metrics with high false positive rates. Remove checks that consistently produce false positives without delivering value.
