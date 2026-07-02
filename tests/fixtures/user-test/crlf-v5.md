---
schema_version: 5
scenario: "crlf-flow"
app_url: "http://localhost:3000"
created: "2026-06-01"
last_run: "2026-06-15"
---

# CRLF Flow

## Areas

| Area | Status | Last Score | Last Quality | Last Time | Consecutive Passes | Notes |
|------|--------|------------|--------------|-----------|--------------------|-------|
| crlf/area | Uncharted | 3 | 3 | 14 | 0 | line endings matter |

## Area Details

### crlf/area

**Interactions:** Exercise a CRLF-backed flow.

**What's tested:** Migration preserves CRLF line endings.

**Queries:**

| Query | Ideal Outcome | Check | Notes |
|-------|---------------|-------|-------|
| "crlf query" | Good answer | Check output | |

**Probes:**

| Query | Verify | Status | Generated From | Run History |
|-------|--------|--------|----------------|-------------|
| "crlf probe" | crlf verify | untested | verification failure: line ending issue | |

## Run History

| Date | Areas Tested | Quality Avg | Delta | Pass Rate | Demo Ready | Context | Key Finding |
|------|--------------|-------------|-------|-----------|------------|---------|-------------|
| 2026-06-15 | crlf/area | 3.0 | â€” | 0% | partial | crlf context | line ending issue |
