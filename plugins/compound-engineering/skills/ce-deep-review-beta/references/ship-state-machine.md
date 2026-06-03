# Run-state machine (thin slice)

The thin-slice run has several independent state dimensions. Tracking them explicitly keeps the
flow honest about partial coverage and prevents egress without consent.

| Dimension | States | Notes |
|---|---|---|
| **arms-detected** | `<per-arm: ok \| unauthed \| missing>` | from `env-detect.sh`; only `ok` arms are offered at the gate |
| **pass-1** | `idle → running → complete \| failed` | `failed` (error / timeout / no `Review complete`) STOPS the run; the gate never opens |
| **consent** | `pending → granted(<subset>) \| declined` | `declined` (Cancel, or empty after the one re-prompt) → panel-only chat, no sidecar |
| **per-arm pass-2** | `idle → running → ok \| timeout \| missing \| auth_fail \| empty \| malformed` | per (model, lens); any non-`ok` → coverage `reduced-confidence` |
| **coverage** | `full \| reduced-confidence \| panel-only` | `full` = all consented arms `ok`; `panel-only` = zero arms / pass-2 never ran |
| **verification** | `none (thin-slice)` | thin slice does not verify; later phase adds `queued → running → complete` |
| **sidecar** | `unwritten → written` | `.deep-review-draft.md` (thin slice) / `.panel-review.md` (panel-only) / none (declined) |

## Hard preconditions (never violate)

- **No gate, no egress.** `consent != granted` ⇒ pass-2 must not run. The `--models` subset passed
  to the harness is exactly the granted subset — nothing else is ever invoked.
- **No panel, no gate.** `pass-1 != complete` ⇒ the consent gate must not open (see pass-1 failure UX).
- **Filename reservation.** `<plan>.deep-review.md` is written only by the (later) verified phase.
  The thin slice writes `<plan>.deep-review-draft.md`; a declined run writes neither.

## Transitions (happy path)

`detect arms → pass-1 running → complete → consent pending → granted(subset) → per-arm running →
(ok/…)* → coverage computed → sidecar written (draft) → summary to chat`.

Any `failed`/`declined` short-circuits to its terminal (report + stop) without egress beyond what
consent granted.
