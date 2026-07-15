# Cross-Model POV Panel

This protocol obtains independent peer POVs, reconciles material disagreement,
and returns one ce-pov decision. ce-pov remains the decision-maker: peers are
cross-checks, never substitutes or votes. The panel is read-only and
non-blocking; every branch ends in a panel POV, a solo POV with an availability
note, or the ordinary POV contract's explicit grounding blocker.

## 1. Resolve the subject, host, and participants

Resolve conversational shorthand before spending: "the approach," "these
options," and "the three options presented" mean the single unambiguous
referent in the active conversation. Ask one focused clarification only when
multiple plausible referents would materially change the POV.

Keep four identities separate for the host and every peer:

- **target** — the user-facing choice (`codex`, `claude`, `grok`, `cursor`, or
  `composer`);
- **harness/intermediary route** — the CLI or intermediary that runs it;
- **requested model** — an explicit model or the route's declared default; and
- **served model** — receipt-verified when available, otherwise `unverified`.

Attest the host from host-provided markers and serving evidence, never from
another installed CLI or home directory. Set `independence_verified: true` only
when the peer's served model family is attestably different from the host's.
Otherwise retain the useful cross-check but label independence unverified; do
not present it as different-model corroboration. If the host family is unknown,
automatic discovery excludes any candidate whose independence cannot be
verified rather than guessing.

`Cursor` and `Composer` are distinct targets:

- `cursor` uses `cursor-agent` with no forced model, allowing Cursor's configured
  default/Auto choice. Unless a receipt identifies it, report
  `Cursor default/Auto; serving model unverified` and
  `independence_verified: false`.
- `composer` requests the current compatible Composer model through
  `cursor-agent`.
- `grok` prefers the native Grok CLI and may use a Grok model through Cursor
  only when that intermediary is separately allowed and sanctioned.

Apply exactly one participation branch:

- **Named peers:** exact and uncapped. Run every named target without a confirm.
  Explicit names override `oracle` discovery and its cap. Never rewrite named
  `Cursor` to Composer or replace an explicitly named model with another model.
- **Bare `oracle`:** immediately select up to two reachable, attestably
  different-model targets using conversation preference, local configuration,
  active project conventions, then the declared default order.
- **Explicit unnamed cross-check:** bypass the correction-cost gate and use the
  count rule below.
- **No explicit cross-check:** after ce-pov independently forms its POV, offer
  only when meaningful downstream work will build on the take before an error
  surfaces, or it feeds a shared, public, security, or data commitment.
  Adoption Tier 1 is ineligible; Tier 2/3 are eligible. Warm invocations never
  offer.

For the count rule: zero reachable means solo plus one availability line; one
means announce and consult without asking; two or more means one concrete
confirmation naming the reachable targets and the default two, with subset and
skip available. Cursor-default counts automatically only when its serving
family can be attested as different from the host; it remains eligible when
explicitly named or configured as a preference.

## 2. Normalize scope and freeze repository identity

Normalize the allowed read scope once as:

- one repository-relative workspace root; and
- optional ordered include and exclude path patterns.

Pass that identical representation to every peer prompt, disclosure, and route
adapter. The default is the repository root. A narrower user- or host-supplied
scope is binding and is never broadened. Enforce the workspace root and patterns
through sandbox controls where the route supports them; otherwise state the
exact restriction in the prompt and disclose which portion is cooperatively
enforced. Peers may search and read within scope but may not mutate the project
or inspect outside the declared scope.

Before initial dispatch, capture one **repository-scope identity**: the committed
revision plus a digest of dirty and untracked content inside the normalized
scope. Include it in every peer payload. Revalidate it before every reconcile
dispatch and before final fold-in. If it changed, never reconcile or fold stale
voices into the current project: disclose the change and either restart all
voices on the new identity or return an incomplete panel result.

Keep payloads, raw output, logs, and result artifacts in private scratch outside
the repository under `/tmp/compound-engineering/ce-pov/<run-id>/`. Use mode
`0600` for payload files.

## 3. Resolve and sanction one fixed route before egress

Routing is adaptable only inside hard boundaries. The requested target plus
safety, authority, independence, read scope, and egress rules are durable;
concrete model IDs, CLI flags, and availability are adapter defaults.

For each peer:

1. Probe current route and model capabilities without giving the process project
   content or repository access.
2. Try the declared preferred mapping first.
3. If that default is observed unavailable, obsolete, or incompatible, choose
   only the closest compatible equivalent in the same requested target, model
   family, and reasoning tier. Record the observed local fact and substitute.
   An explicit user model request cannot become another model.
4. Resolve one concrete target, model choice, harness route, provider, and every
   intermediary. Confirm every actual recipient is in the egress allowlist.
5. Disclose and obtain sanction for that fixed route before giving it content or
   repository access.

The dispatched worker runs only the fixed route. It must return failure to the
host rather than automatically hopping to another provider or intermediary. If
a retry would add or change a recipient, resolve it at the host, disclose and
sanction the new actual route, then start a new fixed-route job. A named peer
that cannot run within these rules is reported, never silently replaced or
dropped.

Before each fixed-route dispatch, tell the user in plain language:

1. what becomes readable or is sent: the framed question, ce-pov's verified
   project-floor summary, the normalized repository scope, and the supplied
   document or approach material when applicable;
2. the resolved provider and every intermediary that will actually receive
   access, plus any same-target model-default substitution; and
3. that a reconcile round additionally shares every surviving voice's position,
   reasoning, and bounded evidence summaries with the other participating
   recipients.

Warn that the material can contain proprietary code and architecture facts.
State which scope and external-query restrictions are adapter-enforced versus
cooperative. This is privacy disclosure, not lifecycle jargon. If sanction is
not available, deliver the solo POV. External checks may use public
subject-level terms only—never repository-derived fragments, private names,
paths, or secrets.

## 4. Dispatch, wait, reap, and collect

Prepare one complete canonical payload containing the framed question, subject
shape, ce-pov's independently formed position, verified project-floor summary,
normalized read scope, repository-scope identity, mode, and required document or
approach material. Exclude credentials and raw secret-bearing content. Verify
that the same complete payload fits every selected route; never truncate it per
provider. A route that cannot accept it is unavailable under the ordinary
partial-panel degradation rule.

Use `scripts/cross-model-pov.sh` from this skill's directory to run one resolved
fixed route per peer, and `scripts/peer-job-runner.py` for detached lifecycle
control. Follow the worker's current usage rather than reconstructing provider
arguments. Pass the fixed target/route, any host-resolved same-family model
override, the canonical scope and identity, payload path, and round output
directory. Pass the actual repository root separately from any narrower read
root, and pre-create the round output directory as private scratch outside the
repository. For named peers, start one job per exact target; for a selected panel,
start one job per selected peer. Start all jobs before waiting.

Record every job id and the epoch after the final start. Poll all jobs in
bounded slices with the runner's `wait --max-secs 30 --json` interface. Use one
aggregate deadline of 610 seconds after the final start; never begin a wait that
can cross it. At the deadline, reap each nonterminal job in a short call, then
make one final `wait --max-secs 10 --json` call. Classify every started job from
its terminal state; `done` alone does not prove a usable artifact exists.

Read artifacts and logs only through the runner's ownership-checked `result`
interface. Accept only schema-shaped artifacts with non-empty `position` and
`reasoning`, a valid `movement`, and the route/model receipt tuple. Initial
responses require `movement: initial`; reconcile responses require `moved` or
`held` plus what changed or why the new evidence was insufficient.

Attribute from the receipt, never expectation. Record target, actual
harness/intermediary route, requested model, served model, and
`independence_verified` separately. A served model of `unverified` remains
unverified. If a job yields no usable artifact, use bounded `peer skip evidence`
from its log to state an observed quota, authentication, or route failure; never
invent a cause.

## 5. Detect dissent, verify claims, and reconcile

Only `mode: independent` voices enter convergence. Material dissent means a
different adoption grade, a different selected approach, or document bottom
lines that imply different reader actions (`proceed`, `revise-first`, or
`reject`) or disagree on whether a risk is fatal. Wording, emphasis, confidence,
or supporting detail with the same decision is concurrence.

For each reconcile exchange:

1. Revalidate repository-scope identity. Restart or return incomplete on change.
2. Have ce-pov reconsider every current position and its evidence.
3. Identify only disputed project claims that could change the decision. Verify
   them against the allowed scope and classify each as `verified`,
   `contradicted`, or `unverifiable`, with source locations when available.
4. Build one common evidence delta. Send the identical complete delta to every
   surviving peer—never route-specific truncation—along with the full original
   subject and every surviving voice's current position and reasoning, capped at
   five succinct source-attributed evidence bullets per voice.
5. Re-resolve and sanction every fixed route under Section 3, then dispatch a
   fresh stateless round. A failed peer is dropped for later rounds; do not reuse
   its older position as if it participated.

After fold-in, stop on the first matching enum:

- **`confident`** — ce-pov has a reasoned POV after weighing every survivor;
- **`no-movement`** — every surviving peer returned `held` and ce-pov is still
  not confident; or
- **`cap-2`** — two reconcile exchanges completed after initial dissent and
  ce-pov is still not confident.

Convergence is ce-pov's reasoned confidence, not a vote. A three-way split still
ends in a confident decision or the stalemate disclosure. Route `confident` to
the **Confident** disclosure below. Route `no-movement` and `cap-2` to the
**Stalemate** disclosure; those stops mean bounded reconciliation ended without
confident convergence, never that ce-pov should infer a settled result.

## 6. Decide and disclose

Lead with ce-pov's POV in the active subject shape, followed by a compact panel
note:

- **Confident:** state whether voices aligned. Concurrence raises confidence but
  does not eliminate correlated-model blind spots. If ce-pov decided over
  dissent, name the disagreement and why its result prevailed.
- **Stalemate:** state ce-pov's current position, each surviving peer's position
  and movement, every dropped voice's last state, and whether the disagreement
  is an evidence gap or judgment difference. Recommend when there is a real
  basis; otherwise say "Either is viable" with the material tradeoffs.
- **Partial:** name surviving and dropped targets and the observed failure state.
- **No survivor:** deliver the solo POV with "cross-model check unavailable or
  incomplete."

For every peer, disclose the user-facing target, actual harness/intermediary,
requested model, receipt-verified or unverified served model, and whether
different-model independence was verified. Never attribute a position to a
model that did not run.

The panel itself never mutates. After delivery, apply SKILL.md Phase 4's
four-part conjunction: the original prompt explicitly authorized the named
downstream action, the result is non-stalemated, the action stays in inherited
scope, and it is non-destructive and otherwise authorized. All four must pass
for handoff; otherwise offer one logical next step and wait.

## 7. Skeptic mode and degradation

When asked to challenge ce-pov rather than form an independent POV, set
`mode: skeptic`. Fold a valid attributed critique into ce-pov once, but do not
put that voice into convergence. Disclose whether it changed the POV. A failed
skeptic degrades like any unavailable peer.

A peer never blocks a POV. Mid-round failure drops only that voice; an
oversized canonical payload drops routes that cannot accept the identical
payload; no surviving peer yields the solo POV plus the availability note.

## 8. Cleanup

Remove every consumed job directory, round output directory, payload, raw log,
and result beneath this run's private scratch root on success, failure, timeout,
interruption, and reap. Never delete outside the current run root. Peer reasoning
and project context must not outlive their use.
