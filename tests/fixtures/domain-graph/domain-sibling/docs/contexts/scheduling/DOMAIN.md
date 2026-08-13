# Domaine — Scheduling

Current business truth for scheduling. Vocabulary lives in [CONCEPTS.md](./CONCEPTS.md).

## Invariants

### Slot occupancy

- A **Slot** never carries two confirmed **Rendez-vous** at the same time.
- Cancelling a **Rendez-vous** frees its **Slot** immediately.
- **Slot** allocation applies when **overbooking** is off: the calendar refuses the second confirmation.

## Machines à états

### Rendez-vous lifecycle

```
proposed -> confirmed -> honored
proposed -> cancelled
```

The transition confirmed -> proposed is forbidden.

## Relations et contrats

- Scheduling owns slot allocation; billing reads honored rendez-vous counts only.
