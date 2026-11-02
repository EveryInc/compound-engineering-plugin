# Coding standards

Rules code in this repository follows. Each one came from a bug a reviewer caught or a fix we shipped.

## Time

1. **Store timestamps in UTC.** A local-time column shifted invoices across a month boundary (#7). Convert only at the display boundary.
