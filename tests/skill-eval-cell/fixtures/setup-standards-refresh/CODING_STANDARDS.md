# Coding standards

Rules code in this repository follows. Each one came from a bug a reviewer caught or a fix we shipped.

## Money

1. **Store and compute money as integer cents.** Floating-point amounts drift on addition and rounding (#11). Convert to a display string only at the response boundary.

## Route handlers

2. **Every async route handler wraps its body in try/catch and responds 500 itself.** An unhandled rejection in a handler hung the request until the client timed out (#12, #14).

## Imports

3. **No unused imports.** Dead imports hid a circular dependency that broke startup (#13).

## Maintaining this file

Add a rule only when a review finding the author fixed, a fix commit, or a cleanup across the codebase shows it, and no lint, type, or CI check already covers it.
