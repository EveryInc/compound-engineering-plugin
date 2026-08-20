---
name: ce-test-xcode
description: "Test iOS apps in a simulator with XcodeBuildMCP. Use when iOS changes need simulator evidence before handoff."
argument-hint: "[scheme name or 'current' to use default]"
disable-model-invocation: true
---

# Xcode Simulator Test

Build and exercise an iOS app on a simulator, preserving screenshots, logs, human-verification results, and failures as evidence for the user.

**Done:**

- A completed run reports overall `PASS`, `FAIL`, or `PARTIAL` plus project, scheme, simulator, build result, per-surface `PASS` / `FAIL` / `SKIP`, console errors, human checks, and residual failures.
- Per-surface status is derived from evidence, not the user's routing choice. `PASS` requires completed passing evidence. `FAIL` records observed failing evidence until a completed retest replaces it. `SKIP` means the check has no completed outcome.
- The overall result is `FAIL` while any failure remains, `PARTIAL` when no failure remains but a scoped check is skipped, and otherwise `PASS`.
- Any failure before the launched-with-log-capture handoff stops later stages and reports an actionable setup blocker with its evidence.

**Boundaries:** this skill tests and reports. Diagnosis and any user-approved product fix belong to `ce-debug`, invoked with authority narrowed to return here without committing, pushing, or opening a PR. Keep simulator interaction within the app and flows the user placed in scope.

## Run

1. **Prepare and launch.** Read `references/setup-and-build.md`. It owns the XcodeBuildMCP availability gate, project and scheme discovery, simulator choice, build, install, launch, and log-capture start.
2. **Exercise and report.** After launch, read `references/test-and-report.md`. It owns per-screen evidence, human-only flows, the SwiftUI inline-link automation limitation, failure routing, cleanup, and the fixed summary fields.

Do not replace either required read with remembered tool names. XcodeBuildMCP adapters differ by host, while their observable success conditions do not.
