# Coding standards

Rules code in this repository follows. Each one came from a bug a reviewer caught or a fix we shipped.

## Locks

1. **Lock acquisition retries at most once.** The lock holder is always this process, so a second retry can never succeed (#4).

## Routes

2. **Every route handler validates its input with `validate()` and logs each rejected request with its reason.** An unvalidated body crashed a worker (#6), and a silent rejection took a day to trace (#9).

## Time

3. **Store timestamps in UTC.** A local-time column shifted invoices across a month boundary (#7).
