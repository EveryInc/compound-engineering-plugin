---
schema_version: 5
scenario: "custom-content"
app_url: "http://localhost:3000"
created: "2026-06-01"
last_run: "2026-06-20"
future_key: keep-me
---

# Custom Content

## Areas

| Area | Status | Last Score | Mystery | Last Quality | Last Time | Consecutive Passes | Notes |
|------|--------|------------|---------|--------------|-----------|--------------------|-------|
| custom/area | Uncharted | 3 | hidden-cell | 3 | 11 | 0 | keep the custom column |

## Area Details

### custom/area

**Interactions:** Exercise a custom flow.

**What's tested:** Custom notes and unknown metadata must survive.

**pass_threshold:** 4

**Queries:**

| Query | Ideal Outcome | Check | Notes |
|-------|---------------|-------|-------|
| "custom query" | custom answer | custom check | custom note |

**Probes:**

| Query | Verify | Status | Generated From | Run History |
|-------|--------|--------|----------------|-------------|
| "custom probe" | custom verify | untested | score-based: custom finding | |

## Custom Notes

This custom section is user-authored.
It must remain byte-for-byte within the migrated file body.

## Run History

| Date | Areas Tested | Quality Avg | Delta | Pass Rate | Demo Ready | Context | Key Finding |
|------|--------------|-------------|-------|-----------|------------|---------|-------------|
| 2026-06-20 | custom/area | 3.0 | — | 0% | partial | custom context | custom finding |
