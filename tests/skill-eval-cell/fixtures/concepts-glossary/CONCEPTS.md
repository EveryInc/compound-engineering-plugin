# Concepts

Shared domain vocabulary for this project — entities, named processes, and status concepts with project-specific meaning. Glossary only, not a spec or catch-all.

## Delivery

### Delivery Run

One execution of the outbound delivery pipeline for a single recipient list.

A run freezes its recipient set when queued, so editing a list never races a live run. Lifecycle: queued, sending, settled, with cancelled and failed branches. A run advances exactly once to settled and never reopens.

### Recipient List

The named, reusable set of addresses a Delivery Run sends to. Owned by an organization and editable between runs, never during one.

### Suppression

A standing rule that removes an address from every Delivery Run regardless of which Recipient List names it. Suppressions are permanent once recorded; there is no un-suppress.
