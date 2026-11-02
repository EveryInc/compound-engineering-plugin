# `ce-compound-refresh`

> The old name for a refresh, which now lives in [`ce-compound`](./ce-compound.md#refresh).

This name will go away in an upcoming release. Until then it keeps working: it prints a short notice naming the new form, then runs the refresh with the same scope and mode, so existing prompts and schedules do not break.

| Instead of | Use |
|---|---|
| `/ce-compound-refresh [scope]` | `/ce-compound refresh [scope]` |
| `/ce-compound-refresh [scope] mode:non-interactive`, in a schedule or another skill | `/ce-compound mode:refresh mode:non-interactive [scope]` |
