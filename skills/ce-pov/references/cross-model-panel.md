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

`oracle` is shorthand for the panel behavior, not a keyword gate. An explicit
request to consult other models, gather independent peer opinions, pressure-test
with named peers, or reconcile their disagreement enters the same protocol even
when the request never says `oracle`. A request for ce-pov's take alone does not.

- **Named peers:** exact and uncapped. Announce and run every named target.
  Explicit names override
  `oracle` discovery and its cap. Never rewrite named `Cursor` to Composer or
  replace an explicitly named model with another model.
- **Bare `oracle`:** select up to two reachable, attestably different-model
  targets using conversation preference, local configuration, active project
  conventions, then the declared default order; announce the selection and run
  it. Invoking `oracle` authorizes this ordinary read-only consultation against
  the current project.
- **Explicit unnamed cross-check:** bypass the correction-cost gate and use the
  count rule below; announce the selected peers and run them.
- **No explicit cross-check:** after ce-pov independently forms its POV, offer
  only when meaningful downstream work will build on the take before an error
  surfaces, or it feeds a shared, public, security, or data commitment.
  Adoption Tier 1 is ineligible; Tier 2/3 are eligible. Warm invocations never
  offer.

For the count rule: zero reachable means solo plus one availability line. One
or more auto-selected peers means one concise progress line naming the selected
targets before dispatch.
Cursor-default counts automatically only when its serving family can be
attested as different from the host; it remains eligible when explicitly named
or configured as a preference.

### Freeze execution routing after participation is fixed

Routing executes the selected peer persona; it never summons the panel, changes
the count, replaces a named peer, changes `independent` versus `skeptic`, or
alters the round cap. Once the branch above fixes participants, and before any
payload or prompt is assembled:

1. Issue one `ce-routing/v1` `resolve_batch` with normalized named/conversational
   intent and one instance of stable role `ce-pov.panel-peer` per already-selected
   peer. Pass the full grounding snapshot envelope when present; otherwise freeze this first snapshot.
   Retain its source revisions, bindings, candidate attempt
   locks, ordered candidates, and participant association for every round.
2. Read legacy `cross_model_peer` only from each `resolution.compatibility`,
   including field-level provenance and the `applied` decision. Do not run a
   separate `inspect` or parse project/global settings; generalized and legacy
   inputs were read in the same frozen snapshot and never enter peer text.
3. Consume each returned binding. The resolver applies task, project role,
   owning project compatibility, project class, global role, owning global
   compatibility, global class, then built-in precedence; a narrower
   `ce-default` reset stops lower inheritance. Legacy preference is already
   normalized to that target, remaining shipped discovery order, then solo
   CE-default. With no generalized route and no applied compatibility route,
   preserve prior participant/route behavior.

For a named peer, a profile candidate is eligible only when it preserves that
exact target; an incompatible candidate is unavailable rather than a
replacement. For auto-selected peers, generalized candidates may supply the
execution targets for the already-fixed slots. `ce-default` uses the old route
discovery and editorial model mapping. The same frozen snapshot is reused on
recovery and reconciliation; live configuration is never reread mid-panel.

**Prior-opinion subjects.** When the subject is an already-formed position —
ce-pov's own prior POV or the user's stated view — that position is the subject
artifact and ships in the payload; peers answer the underlying question with
their own verdict, and those `independent` voices enter convergence (unlike
`skeptic` mode, where the critique does not). Any fresh host meta-judgment formed
after the summons is withheld per Section 4's round-1 sequencing. A user-supplied
position is handled identically to a host-authored one — shipped as the subject,
never capitulated to.

## 2. Normalize scope and freeze repository identity

Normalize the allowed read scope once as:

- one repository-relative workspace root; and
- optional ordered include and exclude path patterns.

Pass that identical representation to every peer prompt and route adapter. The
default is the repository root. A narrower user- or host-supplied scope is
binding and is never broadened. Peers launched on the same host inspect existing
subject files and supporting evidence directly from this shared working tree;
point them to those files instead of copying their contents into the payload.
Pass material inline only when it exists solely in the conversation or is
otherwise unavailable in the workspace.

Treat include and exclude path patterns as cooperative unless the concrete
adapter turns them into filesystem controls. Never present prompt-only patterns,
a working directory, or a read-only flag as a confidentiality boundary, and
never promise that secrets inside the readable scope are inaccessible. Peers may
search and read within the declared scope but may not mutate the project or
intentionally inspect outside it.

Before initial dispatch, capture one **repository-scope identity**: the committed
revision plus a digest of dirty and untracked content inside the normalized
scope. Include it in every peer payload. Revalidate it before every reconcile
dispatch and before final fold-in. If it changed, never reconcile or fold stale
voices into the current project: disclose the change and either restart all
voices on the new identity or return an incomplete panel result.

The caller passes this panel the resolved absolute `$SCRATCH_DIR` created in
SKILL.md Phase 1. Keep payloads, raw output, logs, and result artifacts there;
do not reconstruct the scratch root in this reference. Create each payload under
`umask 077`, then `chmod 600 "$PAYLOAD_PATH"` before dispatch; do not rely on
the ambient umask or a mode flag alone.

## 3. Qualify and announce one fixed route per selected peer

Routing is adaptable only inside hard boundaries. The requested target plus
safety, authority, independence, read scope, and egress rules are durable;
concrete model IDs, CLI flags, and availability are adapter defaults. Qualify
each peer's frozen candidates in declared order. Freeze `resolve_batch` before adapter
qualification or material egress. Candidate `harness`, `route`, `model`,
and `effort` are data interpreted only by the bundled adapter; never put
selectors in payload text or shell-evaluate them.

Map Codex to `codex`, Claude to `claude`, native Grok to `grok-cli`, separately
sanctioned Grok-via-Cursor to `grok-cursor`, Cursor without a model to `cursor`,
Composer or a Composer-family Cursor model to `composer`, and another explicit
safe Cursor model to `cursor --model`. Unsupported harnesses or effort selectors,
unsafe tokens, unavailable CLIs, same-family automatic peers, and missing host
selectors are unavailable.

For each peer:

1. Probe current route and model capabilities without giving the process project
   content or repository access.
2. Try the frozen candidate's declared preferred mapping first; CE-default uses
   the prior editorial mapping.
3. If an adapter-owned default is observed unavailable, obsolete, or incompatible, choose
   only the closest compatible equivalent in the same requested target, model
   family, and reasoning tier. Record the observed local fact and substitute.
   An explicit candidate or user model request cannot become another model.
4. Resolve one concrete target, model choice, effort, harness route, provider, and every
   intermediary. Confirm every actual recipient is in the egress allowlist.
5. Announce the selected target and route in ordinary language before dispatch.

Binary presence proves only that a route is a candidate. Use an available
non-egressing authentication or capability probe when the harness exposes one,
and do not call a route usable until it returns a valid artifact. Classify a
failed run from its structured diagnostics rather than guessing from a generic
terminal state.

Before dispatch, independently sanction the target, intermediary, exact
repository/material scope, and a credential-minimized environment. A profile is
not egress authority. The dispatched worker runs only the fixed route and must
return failure to the host rather than hopping providers. An unavailable `require` candidate
blocks that panel voice without prompting or substitution; the panel's ordinary
partial/solo degradation still owns the overall POV. An unavailable `prefer`
candidate may advance before dispatch. Once work starts, the recipient is fixed.
A preferred candidate may advance only after a terminal unintegrated attempt and
fresh recipient, intermediary, material, and environment sanction. If a retry
would add an unsanctioned recipient or intermediary, classify that candidate
unavailable without prompting; continue only when the resolver advances to
another already sanctioned candidate, otherwise block that panel voice. Never
switch an in-flight recipient or consume discarded output. A named peer that
cannot run within these rules is reported, never silently replaced or dropped.

The pre-dispatch update should say who will inspect the subject and that the
review is read-only. Do not recite scope mechanics, promise that repository
secrets are inaccessible, or describe probe results, CLI versions, model tiers,
commit hashes, repository identity, route health, job lifecycle, or scratch
paths. Mention a cooperative scope restriction only when it materially changes
the user's choice. Refer to the codebase as "this project" or "the repository"
unless the user supplied a recognizable name.

## 4. Dispatch, wait, reap, and collect

Prepare one complete canonical payload containing the framed question, subject
shape, normalized read scope, repository-scope identity, mode, paths to subject
material already in the workspace, and required conversational material that is
not available there. Let peers inspect and ground against the shared working
tree. Do not duplicate readable files or add a host-curated architecture summary
merely to brief the peer.

For an initial `independent` round, exclude ce-pov's position and every other
voice's conclusion. The proposal, document, or approach set being judged is the
subject and remains fully available; independence means withholding prior
judgments about it, not withholding the artifact. The host's own argument —
candidate-risk enumerations, decisive premises stated as fact, advocacy framing,
and evaluative option labels — is reconcile-round material, not round-1 material;
the independent round carries only the framed question, the subject, the read
scope, and the evidence. Define round-1 evidence by provenance: source-located
facts and the user's decision-relevant need are round-1 material, while host
interpretations, risk rankings, and recommended consequences are not (for
example, "the file at PATH contains X" is round-1 evidence, while "X is the risky
option" waits for reconcile). Label inlined conversation-only material as such,
and carry the user's stated goal — including its intensity — when it bears on the
decision. State in the payload that rejecting every supplied option, or the
framing itself, is a valid position. When ce-pov authored the subject in-session,
present the options symmetrically in the payload's own words even though the full
subject document remains attached. When the subject is itself an already-formed
position (Section 1), the strip list above applies only to fresh host framing
generated in response to the summons: the position's own premises, labels, and
advocacy ship intact as the subject artifact, and only host meta-judgment formed
about it after the summons waits for reconcile — peers still return their own
independent verdict. For `skeptic` mode, include
ce-pov's position because critiquing it is the task. Reconciliation payloads
follow Section 5 and deliberately include already-formed positions.

Verify that the same complete payload fits every selected route; never truncate
it per provider. A route that cannot accept it is unavailable under the ordinary
partial-panel degradation rule.

Use `scripts/clean-launcher.py` from this skill's directory to open and run the
co-located `scripts/cross-model-pov.sh` adapter for one resolved fixed route per
peer, and `scripts/peer-job-runner.py` for detached lifecycle control. Never
invoke the Bash adapter directly, including adapter-emission tests. The launcher
must start from the canonical declared repository root; it removes Bash startup
hooks, exported functions, ambient API/OAuth keys, provider config pointers,
and ambient home/config roots before Bash starts. It retains only bounded route
selectors, locale, timeout controls, and inert provider discovery data,
and passes caller `PATH` as inert provider discovery data. Follow the worker's
current usage rather than reconstructing provider arguments. Pass the fixed target/route, any eligible host-resolved same-family
default-model override, the canonical scope and identity, payload path, and round
output directory. Also pass the frozen candidate as
`CE_ROUTING_CANDIDATE_HARNESS`, `CE_ROUTING_CANDIDATE_ROUTE`, optional
`CE_ROUTING_CANDIDATE_MODEL`, and optional `CE_ROUTING_CANDIDATE_EFFORT`; the
script validates route compatibility and token safety before invoking the CLI.
For each fixed route, the script resolves the first provider match and its
bounded shebang chain exactly once, canonicalizes symlink launchers, rejects any
provider or interpreter beneath the canonical declared root independently of
VCS, rejects unsafe owner/mode/ancestry, and binds every executable's metadata
and digest. Shebangs support only argument-free absolute interpreters or
`/usr/bin/env [--] <simple-name>`; interpreter arguments that select, preload, or
evaluate code are unavailable. It revalidates the complete chain immediately
before dispatch and invokes an explicit absolute interpreter/provider argv under
a fixed trusted helper `PATH`. Unsupported chains and unsafe, missing, or changed
first matches are unavailable without searching for another executable;
preferred retry remains the host's declared next-candidate decision, never an
adapter fallback.

Every provider process receives empty private `HOME`, `TMPDIR`, XDG config/data/cache,
and provider-config roots beneath that peer's private scratch directory. No user or
project provider configuration, plugin, hook, MCP declaration, JSON credential, or
API/OAuth key is staged there. Codex additionally pins the built-in `openai` provider
and disables hook, app/plugin, subagent, skill-MCP-install, and MCP-server surfaces
through fixed CLI overrides; the flags supplement rather than replace filesystem
isolation. A route that needs a readable credential or config file is unavailable.
Credential-free execution and authentication brokered outside the model-readable
filesystem remain eligible.
Codex starts with its working directory in private scratch rather than the repository,
while the prompt and read-only sandbox carry the absolute declared read root; this
prevents repository `.codex/config.toml` files from becoming an active config layer.
Pass the actual repository root separately from any narrower read root, and
pre-create the round output directory as private scratch outside the repository.
For named peers, start one job per exact target; for a selected panel, start one
job per selected peer. Start all jobs before waiting.

Each worker writes `<run-dir>/pov-<target>.json`, where `<target>` is the resolved
route target with `grok-cli`/`grok-cursor` collapsing to `grok`. Pass exactly that
path as `--result-path` to `peer-job-runner.py start`, so `done` is keyed to the
artifact and `result <job-id>` reads it without guessing the filename or the
host's provider key. `start` exclusively reserves that path and rejects any
preexisting artifact or concurrent reservation. A terminal result is accepted
only when its direct-write inode or atomic replacement descends from this job's
reservation and its verified bytes still match the proof published before
`done`; timestamp freshness alone is never sufficient.

Start each job from the declared repository root. Put the selector and scope
environment on the runner process so the fixed clean launcher receives it by
inheritance; after `--`, the worker argv must begin at that launcher:

```bash
SKILL_DIR="<absolute path of the directory containing the SKILL.md you just read — this skill's own directory>";
CROSS_MODEL_REPO_ROOT="<canonical-repository-root>" CROSS_MODEL_READ_ROOT="<read-root>" \
CROSS_MODEL_HOST_HARNESS="<host-harness>" CE_ROUTING_CANDIDATE_HARNESS="<candidate-harness>" \
CE_ROUTING_CANDIDATE_ROUTE="<fixed-route>" CE_ROUTING_CANDIDATE_MODEL="<model>" \
CE_ROUTING_CANDIDATE_EFFORT="<effort>" \
  /usr/bin/python3 -I -S "$SKILL_DIR/scripts/peer-job-runner.py" start \
  --skill ce-pov --run-id "<run-id>" --label "<target>" \
  --result-path "<run-dir>/pov-<target>.json" -- \
  /usr/bin/python3 -I -S "$SKILL_DIR/scripts/clean-launcher.py" \
  "<host-serving-family>" "<fixed-route>" "<payload-path>" "<run-dir>"
```

Record every job id and the epoch after the final start. Poll all jobs in
bounded slices with
`/usr/bin/python3 -I -S "$SKILL_DIR/scripts/peer-job-runner.py" wait --max-secs 30 --json <job-ids...>`.
Job ids or job-directory paths are positional. `--skill`, `--run-id`, and
`--label` are start-only; never pass them to `wait`. Do not add a separate shell
sleep: `wait` itself provides the bounded polling delay. Use one aggregate
deadline of 610 seconds after the final start; never begin a wait that can cross
it. At the deadline, reap each nonterminal job in a short call, then make one
final
`/usr/bin/python3 -I -S "$SKILL_DIR/scripts/peer-job-runner.py" wait --max-secs 10 --json <job-ids...>`
call. Classify every started job from its terminal state; `done` alone does not
prove a usable artifact exists.

Read artifacts and logs only through the runner's ownership-checked `result`
interface. Accept only schema-shaped artifacts with non-empty `position` and
`reasoning`, a valid `movement`, and the route/model receipt tuple. Initial
responses require `movement: initial`; reconcile responses require `moved` or
`held` plus what changed or why the new evidence was insufficient.

Keep every artifact quarantined and convert adapter state to typed outcome `ok`,
`unavailable`, or `failed`. Call `finalize_attempt` with the exact snapshot,
candidate `attempt_lock`, outcome, terminal/integrated booleans, complete prior
receipt history, and identity evidence before consuming any position; never send a binding. For `ok`, matched
family evidence uses the requested token while retaining the raw served ID,
literal `unverified` omits the actual field, and mismatch passes the actual value.
`accept` admits the voice. Only a successful preferred `ok` attempt with absent
identity evidence records `accepted_unverified`. `next_candidate` is legal only
for unavailable, failed, or known-mismatch terminal unintegrated attempts with
complete lock-bound history: discard output, freshly sanction/disclose the next
recipient/material, and launch a new job. Required failures block without prompt.

Expose the redacted `finalize_attempt` receipt in the panel record: role/class,
profile/source, policy, requested selectors, actual or unverified identity,
attempts, fallback reason, and terminal status. Omit payloads, paths, credential
values, raw provider output, and private snapshot data. Attribute from the
receipt, never expectation. Record target, actual
harness/intermediary route, requested model, served model, and
`independence_verified` separately. A served model of `unverified` remains
unverified. Serving identity and independence are separate: neither proves the
other. If a job yields no usable artifact, use bounded `peer skip evidence`
from its log to state an observed quota, authentication, or route failure; never
invent a cause. An authentication-shaped peer failure (`not logged in`, `please
log in`, 401, or CLI text prompting login) describes only the peer's execution
context: a sandboxed host — e.g. a restricted Codex task denying spawned commands
network or keychain access — produces the identical signal to a genuine account
logout, so state it as a cross-model execution-context authentication failure and
never report it as the user's account being logged out or prompt the user to run
a login command on that basis.

## 5. Detect dissent, verify claims, and reconcile

Only `mode: independent` voices enter convergence. Material dissent means a
different adoption grade, a different selected approach, or document bottom
lines that imply different reader actions (`proceed`, `revise-first`, or
`reject`) or disagree on whether a risk is fatal. Wording, emphasis, confidence,
or supporting detail with the same decision is concurrence.

The default limit is the independent initial round plus at most two reconcile
exchanges. A user-supplied pass or round limit overrides it: "one pass" or "one
round" means no reconcile exchange, while a larger explicit limit replaces the
default cap. Never reinterpret a smaller user limit as a suggestion.

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
5. Re-qualify each fixed route from its frozen candidate list under Section 3,
   without rerunning `inspect` or `resolve_batch`, then dispatch a fresh stateless
   round. The same recipients need no question; an unexpected new recipient or
   intermediary does. A failed peer is dropped for later rounds; do not reuse its
   older position as if it participated.

After fold-in, stop on the first matching enum:

- **`confident`** — ce-pov has a reasoned POV after weighing every survivor;
- **`no-movement`** — every surviving peer returned `held` and ce-pov is still
  not confident; or
- **`limit-reached`** — the effective user-authorized finite limit completed
  after initial dissent and ce-pov is still not confident.

Convergence is ce-pov's reasoned confidence, not a vote. A three-way split still
ends in a confident decision or the stalemate disclosure. Route `confident` to
the **Confident** disclosure below. Route `no-movement` and `limit-reached` to
the **Stalemate** disclosure; those stops mean bounded reconciliation ended
without confident convergence, never that ce-pov should infer a settled result.

The cap stops automatic dispatch; it is a checkpoint, not proof that another
round would be useless. At the checkpoint, decide whether a bounded extension is
likely to change the result. Recommend a specific number of additional exchanges
only when ce-pov can name the unresolved decision-relevant question, the new
evidence or framing the extension would introduce, and why it could move a
position. Otherwise recommend stopping. Further rounds require user approval
unless the user supplied the larger limit in advance; each approval establishes
a new finite cap, never an open-ended loop.

## 6. Decide and disclose

Lead with ce-pov's POV in the active subject shape, followed by a compact panel
note:

- **Confident:** state whether voices aligned. Concurrence raises confidence but
  does not eliminate correlated-model blind spots. If ce-pov decided over
  dissent, name the disagreement and why its result prevailed.
- **Stalemate:** state ce-pov's current position, each surviving peer's position
  and movement, every dropped voice's last state, and whether the disagreement
  is an evidence gap or judgment difference. Recommend when there is a real
  basis; otherwise say "Either is viable" with the material tradeoffs. At a cap,
  add **Further rounds:** recommend a specific bounded extension with its new
  evidence path, or recommend stopping because no additional exchange is likely
  to change the result.
- **Partial:** name surviving and dropped targets and the observed failure state.
- **No survivor:** deliver the solo POV with "cross-model check unavailable or
  incomplete." When a summons was present but the panel branch never entered
  (no reachable peers, or the branch never fired), still state that panel status —
  which peers were attempted, or that none ran and the observed reason — rather
  than shipping a bare solo verdict.

Retain target, route, requested model, served model, and independence receipts in
the panel record, but keep the default chat note decision-relevant: name the
peer, its position and movement, any observed failure, and an independence caveat
when it affects credibility. Do not dump route or model diagnostics unless they
materially change the conclusion or the user asks. Never attribute a position to
a model that did not run.

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
payload; no surviving peer yields the solo POV plus the availability note. For
a frozen binding, an unavailable or failed preferred candidate may advance only
under Section 3's terminal-unintegrated and fresh-sanction gates. A required
candidate failure blocks that voice without prompting or substitution and is
reported in the partial/solo panel note; it does not convert the read-only POV
itself into a mutation or an unrelated workflow blocker.

Distinguish a route-level failure from a dispatch-infrastructure failure. A
route that runs and returns no usable artifact is dropped as above. But if the
dispatch scripts themselves fail unexpectedly — a crash, a non-zero exit before
any job starts, an unresolved script path — do not drop the leg on the first
error. Attempt the same resolved route by hand, holding the selected target and
model, the normalized read scope, and the round's independence rules fixed.
Keep attempting only while each failure is a new, plausibly recoverable one and
the panel's aggregate deadline has not passed; stop and fall to the solo POV
once a failure repeats or the deadline is spent. A hand recovery may not
substitute a different target, widen read scope, or include a withheld
position — those make the recovered leg untrustworthy, not merely unavailable.

## 8. Cleanup

Remove every consumed job directory, round output directory, payload, raw log,
and result beneath this run's private scratch root on success, failure, timeout,
interruption, and reap. Never delete outside the current run root. Peer reasoning
and project context must not outlive their use.
