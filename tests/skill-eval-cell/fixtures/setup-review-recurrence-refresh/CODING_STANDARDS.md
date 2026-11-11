# Coding standards

## Data access

- Build SQL with parameterized queries. Never concatenate request values into a query string.

## Control flow

- Prefer early returns over nested conditionals. Code nested more than two levels deep hides the main path from the reader.
