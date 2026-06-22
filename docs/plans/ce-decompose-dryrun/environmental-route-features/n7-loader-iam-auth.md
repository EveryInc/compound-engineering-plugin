# n7 — Loader IAM auth for the ogr2ogr subprocess

- **Stage:** work · **Model:** generation · **Depends on:** (none — independent infra root)
- **Base commit:** `<main@decompose>`

> **Independent root:** surfaced while loading CO OSM roads. No dependency on the feature chain, but
> n10 (and any future ogr2ogr-based load) is blocked on it. This is why the graph is a multi-root DAG,
> not a tree.

## Goal

Make `load_reference_trails` / `load_osm_trails` (and `load_canopy`) work under RDS Proxy IAM auth,
where the DB password is a short-lived per-connection token rather than a static secret.

## Requirements

- Under `DB_USE_IAM_AUTH=1`, the `ogr2ogr` subprocess must authenticate with a freshly minted IAM token
  rather than the empty `settings["PASSWORD"]`.
- No static credential is written to disk or passed where it could be logged.

## Approach

Mint an IAM token (the same path the ORM uses via `config/db_backend/base.py::_iam_token`) and pass it
to the `ogr2ogr` subprocess environment per invocation. Keep the token out of argv (env only) and never
persist it.

## Test scenarios

- With IAM auth on, the loader subprocess connects and loads without a static password.
- The minted token is short-lived and not logged.

## Verification

CO loads run under IAM auth. (Shipped: PR for LAB-873; completed 2026-06-14.)
