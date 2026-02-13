# SECURITY

## Scope

Document security boundaries and standard patterns.

## Authentication and Authorization

- [PLACEHOLDER auth mechanism]
- [PLACEHOLDER authorization boundary checks]

## Input Validation Boundaries

- Validate external input at [PLACEHOLDER boundary].
- Reject unknown fields for [PLACEHOLDER payload types].

## Secrets Management

- Store secrets in [PLACEHOLDER secret manager/env pattern].
- Never commit secrets to repo.
- Rotate [PLACEHOLDER critical credentials] on schedule.

## Dependency Auditing

- Audit command: `[PLACEHOLDER dependency audit command]`
- Remediation SLA: [PLACEHOLDER policy]

## Logging and PII

- Do not log [PLACEHOLDER sensitive fields].
- Redact [PLACEHOLDER token/key patterns].

## Incident Response

- Owner: [PLACEHOLDER]
- Escalation path: [PLACEHOLDER]
- Postmortem storage: [PLACEHOLDER docs path]
