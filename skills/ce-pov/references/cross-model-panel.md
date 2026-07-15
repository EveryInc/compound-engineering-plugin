# Cross-Model POV Panel

This protocol obtains independent, different-model POVs, lets materially
different positions reconsider one another, and returns one ce-pov decision.
ce-pov remains the decision-maker: peers are cross-checks, never substitutes or
votes. The panel is read-only and non-blocking; every route ends in the panel
POV, a solo POV with an availability note, or an explicit grounding blocker
from the ordinary POV contract.

## 1. Resolve participation

First attest the host's serving provider (`codex`, `claude`, `grok`, or
`composer`). Detect the harness from its host-provided markers: `CLAUDECODE=1`
maps to `claude`; any of `CODEX_SANDBOX`, `CODEX_SANDBOX_NETWORK_DISABLED`,
`CODEX_SESSION_ID`, `CODEX_THREAD_ID`, or `CODEX_CI` maps to `codex`; and
`CURSOR_AGENT` or `CURSOR_CONVERSATION_ID` identifies Cursor. For Cursor, map
the observable active serving model family: GPT/OpenAI -> `codex`,
Claude/Anthropic -> `claude`, Grok/xAI -> `grok`, and Composer -> `composer`.
Do not infer the host from another CLI's installed files or home directory.
Exclude the attested provider. If the harness is unknown, or Cursor's active
model family cannot be observed, run no peer rather than guess and risk a
same-provider check.

Resolve reachable providers by installed route, host exclusion, and the
`CROSS_MODEL_PEERS` egress allowlist. An installed route is only a reachability
signal; authentication, quota, and runtime failures are handled by degradation.
The provider routes are OpenAI via `codex`, Anthropic via `claude`, xAI via
`grok` with `cursor-agent` as its fallback intermediary, and Cursor via
`cursor-agent`/Composer.

Apply exactly one participation branch:

- **Named peers:** consult every named provider directly, with no confirmation.
  Named peers are exact and uncapped: naming three runs all three. Do not replace
  an unavailable named provider with a different provider. Preserve its own
  within-provider route chain (for example, xAI via `grok`, then xAI via the
  Cursor intermediary) and report it if neither route produces a usable POV.
- **`oracle`:** consult reachable different-model providers immediately, with
  no confirmation, up to the **2-peer panel cap**. Use the preference order from
  the conversation, local configuration, active project conventions, then
  `codex,claude,grok,composer`.
- **Explicit unnamed cross-check:** a request such as "get other models' takes"
  bypasses the correction-cost gate on every subject shape. Apply the count rule
  below to resolve its participants.
- **No explicit cross-check:** assess correction cost only after ce-pov has
  formed its own POV. Do not offer for an informational take or when correction
  is merely a later edit. The call is offer-eligible when meaningful downstream
  work will build on it before error surfaces, or when it feeds a shared, public,
  security, or data commitment. For adoption subjects, Tier 1 is ineligible and
  Tier 2/3 are eligible. Warm invocations never offer; they consult only on an
  explicit request. If ineligible, run no panel and say nothing about one.

For an eligible offer or explicit unnamed cross-check, use this count rule:

- zero reachable -> run no panel and say why in one plain line;
- one reachable -> announce that model and consult it; do not ask a question;
- two or more reachable -> ask one concrete confirmation naming the reachable
  providers, default to a **2-peer panel**, and, when more than two are reachable,
  name the two selected by default; allow a subset or skip.

Declining the offer ends the panel branch without changing the solo POV.

## 2. Disclose egress before dispatch

Before any payload leaves the host, tell the user in plain language:

1. what will be sent: the framed question, ce-pov's verified project-floor
   summary, and the supplied document or approach content when that is the
   subject; warn that these can contain proprietary code and architecture facts;
2. every participating provider's **full ordered candidate chain**, including
   every intermediary that may receive the payload (for example, xAI through
   the Grok CLI, then xAI through Cursor if the direct route fails); and
3. that a debate round additionally sends every surviving voice's position,
   reasoning, and evidence summaries to the other participating providers.

This disclosure is informed consent, not an implementation log. Name provider
and intermediary destinations; omit job ids, environment variables, polling,
fallback machinery, and other lifecycle jargon. If the user does not consent,
deliver the solo POV. Never launch first and disclose afterward.

Prepare one original subject payload containing the framed question, subject
shape, ce-pov's independently formed position, verified project-floor summary,
and the document or approach material required to reassess the subject. Exclude
credentials and raw secret-bearing file contents. Do not truncate the subject
for reconcile rounds.

## 3. Dispatch, wait, and reap

Use the bundled worker to obtain the POV capability and the bundled runner for
detached lifecycle control. Set `SKILL_DIR` to the absolute directory containing
this skill's `SKILL.md` in every shell call; shell variables do not persist.
Store the payload and round outputs under
`/tmp/compound-engineering/ce-pov/<run-id>/`, with mode `0600` for payload files.

For `oracle`, accepted offers, and explicit unnamed checks, pass the complete
ordered candidate chain in one job and set the selected maximum to `1` or `2`
from the resolved count. Runtime failure may then fall through to a disclosed
later candidate without exceeding the selected count:

```bash
SKILL_DIR="<absolute path of the directory containing the ce-pov SKILL.md>";
CROSS_MODEL_MAX_PEERS="<1-or-2>" python3 "$SKILL_DIR/scripts/peer-job-runner.py" start --skill ce-pov --run-id "<run-id>" --label "independent-0" -- env CROSS_MODEL_MAX_PEERS="<1-or-2>" bash "$SKILL_DIR/scripts/cross-model-pov.sh" "<host-provider>" "<ordered-candidates>" "<subject-payload>" "<round-output-dir>"
```

For named peers, exact honor is load-bearing: start one job per named provider,
pass only that provider as its candidate list, and set
`CROSS_MODEL_MAX_PEERS=1`. This is how named peers remain uncapped while each
worker's selected-panel cap remains two. Start all jobs before waiting.

Record every returned job id and the epoch immediately after the final `start`.
Poll all outstanding jobs in bounded slices; no shell call spans a worker's
runtime:

```bash
SKILL_DIR="<absolute path of the directory containing the ce-pov SKILL.md>";
python3 "$SKILL_DIR/scripts/peer-job-runner.py" wait --max-secs 30 --json <job-ids...>
```

Use one aggregate deadline: stop polling at 610 seconds after the final start.
Never begin a wait slice that can cross the deadline. At the deadline, `reap`
each nonterminal job in its own short call, then make one final
`wait --max-secs 10 --json` call so asynchronous terminal records can land.
Classify every started job from its terminal state; `done` does not itself prove
that a peer artifact exists.

## 4. Collect and attribute

For each `pov-<provider>.json` that exists, read it through the runner's bounded,
ownership-checked path interface:

```bash
SKILL_DIR="<absolute path of the directory containing the ce-pov SKILL.md>";
python3 "$SKILL_DIR/scripts/peer-job-runner.py" result --path "<round-output-dir>/pov-<provider>.json"
```

Accept only schema-shaped artifacts with non-empty `position` and `reasoning`.
Treat raw files, absent files, unreadable results, and non-`done` jobs as no
usable voice. Attribute from the receipt, never from expectation:

- when `model_actual` names a served model, attribute the position to that model;
- when `model_actual` is `unverified`, say "requested <model>; serving model
  unverified" rather than claiming that the requested model served it;
- when actual and requested differ, use the actual model and disclose the
  mismatch;
- use `cross_model_route` to disclose the actual provider/intermediary path,
  especially `grok-cursor`; never attribute a position to a model that did not
  run.

Reconcile the pre-egress announcement against every receipt. In the final panel
disclosure, state any actual provider, intermediary, requested model, or served
model that differed from the announced primary chain.

Before cleanup, inspect every job that produced no usable artifact, ended
non-`done`, or used a fallback provider or route. Read its bounded `out.log`
through the runner's ownership-checked result interface, never directly:

```bash
SKILL_DIR="<absolute path of the directory containing the ce-pov SKILL.md>";
python3 "$SKILL_DIR/scripts/peer-job-runner.py" result --path "/tmp/compound-engineering/ce-pov/<run-id>/jobs/<job-id>/out.log"
```

Use the worker's `peer skip evidence:` lines to replace generic degradation
wording with the specific observed quota, authentication, or route failure and
name the fallback that served instead when applicable. If the log is unreadable
or has no specific evidence, retain the terminal/no-output disclosure; the
panel remains non-blocking.

## 5. Detect dissent and reconcile

Only `mode: independent` voices enter convergence. Material dissent means:

- adoption: a different grade;
- approach set: a different chosen option;
- document: bottom lines imply different reader actions (`proceed`,
  `revise-first`, or `reject`), or one voice rates a risk fatal that another
  rates acceptable.

Wording, emphasis, confidence, or supporting-detail differences with the same
grade, option, and reader action are concurrence, not dissent.

When material dissent exists, ce-pov weighs all voices; it is never mechanically
outvoted. For each reconcile exchange, first have ce-pov reconsider against all
positions and evidence. Then freshly dispatch every surviving peer with:

- the **full original subject payload**; and
- every surviving voice's current position and key reasoning, with no more than
  **5 succinct, source-attributed evidence bullets per voice**.

The evidence cap bounds only the reconcile delta, never the subject. Each fresh
peer sees all voices, not a pairwise subset. Use a new round output directory and
the same start/wait/deadline/reap/receipt rules as the independent round. A peer
that times out, fails, or returns no usable artifact is dropped for later rounds;
do not restore its older position as if it participated in the new exchange.

Evaluate this stop-rule enum after every fold-in and stop on the first match:

- **`confident`** — ce-pov has a POV it is confident in after weighing every
  surviving voice; alignment is desirable but not required;
- **`no-movement`** — the exchange changed no surviving voice's position;
- **`cap-2`** — two reconcile exchanges have completed since initial dissent.

Convergence is ce-pov's reasoned confidence, not a vote tally. A three-way split
must still end in a confident decision or the stalemate disclosure below.

## 6. Decide and disclose

Always lead with ce-pov's POV in the active subject shape, then give a compact
panel note in plain language:

- **Confident result:** state whether voices aligned. If they concurred, say
  concurrence raises confidence but does not eliminate correlated-model blind
  spots. If ce-pov decided over continuing dissent, name that divergence and why
  ce-pov preferred its result.
- **Stalemate:** attribute every surviving voice's position and every dropped
  voice's last state. Name the source of disagreement as either an evidence gap
  (which voice found which fact the others lacked) or a judgment difference. If
  ce-pov has a reasoned basis to prefer one path, recommend it and say why. If
  the options are genuinely viable either way, say exactly that and give the
  material pros and cons; never force a pick.
- **Partial panel:** name the surviving voices and each dropped provider plus its
  terminal or no-output state. Continue with the surviving panel.
- **No surviving peer:** deliver ce-pov's solo POV and add the plain note
  "cross-model check unavailable or incomplete." A peer never blocks a POV.

The calling host decides whether to act. Do not mutate files or external state
after delivering the POV.

## 7. Skeptic mode

When the request asks a peer to challenge ce-pov rather than form its own POV,
set the payload mode to `skeptic`. Fold a schema-valid skeptic artifact into
ce-pov's reasoning using the same receipt attribution. Do **not** put a skeptic
voice into the convergence loop: if its critique lands, ce-pov reconsiders once,
keeps or revises the POV, and discloses how the attributed critique influenced
the result. A failed skeptic run degrades like any other unavailable peer.

## 8. Cleanup

After fold-in, or after deadline reaping and the final wait, delete every
consumed job directory, round output directory, and payload file beneath this
run's `/tmp/compound-engineering/ce-pov/<run-id>/`. Do this on successful,
partial, solo-degraded, and skeptic routes. Peer reasoning and project context
must not outlive their use. Never delete a path outside the current run root.
