# Pass 2 — arm invocation, record parsing, progress streaming

Pass 2 shells out to the **bundled** harness to run the consented models. Egress equals consent:
the `--models <subset>` flag filters arms *before* the run, so a deselected vendor never receives
the plan (never filter records post-hoc — the document would already have been sent).

## Invocation

```bash
bash "${CLAUDE_SKILL_DIR}/scripts/panel-critique.sh" --models <subset> "<plan-path>"
```

- `<subset>` is the comma-separated list from the consent gate (e.g. `codex,agy`).
- The bundled `panel-critique.sh` runs each selected model across the six lenses (coherence,
  feasibility, security, scope, product, adversarial) via `python3 arms.py run-arm`, writing one
  record per (model, lens). Records land at `${CMRE_OUT_DIR:-/tmp/cmre-panel}/records/<cli>__<lens>.json`.
- Set `CMRE_TIMEOUT` (seconds, per (model, lens)) if the default is too tight; agy can be slow.

## If the dispatch is blocked (harness egress classifier)

Under Claude Code's default auto-mode, this `bash` call is screened by a permission *classifier*
that reasons about whether the conversation authorized the egress — `allowed-tools:
Bash(bash *panel-critique.sh)` is **not** sufficient on its own (verified 2026-05-28). The consent
gate's verb-carrying option labels (`Send the plan to <model> (<Vendor>)`) exist to make the
recorded consent legible to it; with a legible selection the dispatch should clear.

If it is still denied (reason mentions "Data Exfiltration" / "not cleared by the consent-gate
authorization"), do NOT silently work around it. Fall back in this order:

1. **Re-state the authorization, then retry** — surface to the user that the dispatch was blocked,
   restate exactly which vendors they consented to and that the plan content will be sent, and
   retry once. The classifier reads the immediately-preceding authorization.
2. **`!`-handoff** — ask the user to re-issue the exact command via the `!` prefix (a user-initiated
   command is self-authorizing). Show them the full `bash …/panel-critique.sh --models <subset>
   "<plan>"` line to paste.
3. **Settings rule (durable / headless)** — point the user to the onboarding doc's
   `permissions.allow` rule for unattended runs where no interactive consent turn exists.

See `docs/solutions/skill-design/2026-05-28-od4-egress-classifier-consent-scope.md` for the full
behavior characterization.

## Progress streaming (R15 — no silent multi-minute runs)

Stream the harness's per-(model, lens) stderr lines to chat as they arrive. The harness emits one
line per cell:

```
  [codex   coherence   ] findings=3
  [agy     adversarial ] SKIP — agy not installed
```

Surface each arm's terminal outcome so the user sees coverage in real time: `ok` / `timeout` /
`missing` / `auth_fail` / `empty` / `malformed`. Do not run silently for minutes.

## Record parsing

After completion, read each `records/<cli>__<lens>.json` for the selected (model, lens) cells. Each
record is `{arm, doc_id, trial, status, latency_ms, findings:[{id,text}], model}`. Build a
structured set keyed by `(model, lens)`; the `findings` arrays are the raw cross-model findings.
Raw records remain on disk for audit.

- `status: "ok"` with a non-empty `findings` array → usable.
- `status` non-ok, or empty findings → mark that cell's outcome; coverage degrades to
  `reduced-confidence` if any selected arm reports a non-`ok` outcome.

## Thin-slice output

The parsed findings are **unverified** at this stage. Present them to chat and write
`<plan>.deep-review-draft.md` per SKILL.md Phase 4 (`skill_phase: thin-slice`, `verification: none`,
the UNVERIFIED banner). Verification tags (CONFIRMED / NOT-FOUND-IN-DOC / NEEDS-HUMAN) and the
reconciled `<plan>.deep-review.md` are added in a later phase.

## agy arm (RU2 — landed)

The arm set is **codex + agy** (gemini was retired from the skill — it 410s on 2026-06-18; the
shared `arms.py` gemini arm remains for the cross-model eval, but the skill no longer offers it).
agy is **macOS-only**: its read-only floor is a macOS seatbelt, so
`env-detect.sh` reports agy `unavailable` off-darwin and the gate must not offer it; `arms.py`
independently refuses the agy arm when the seatbelt prefix is empty (off-darwin or a missing
template) rather than running it unfloored.

Two bundled-context details, now handled:

- The bundled `arms.py` `agy_sandbox_prefix()` reads `validation/agy-readonly.sb.tmpl` relative to
  itself — `bundle-harness.sh` copies the template into `scripts/validation/`, so it resolves;
  verify after any restructure.
- `arms.py` `_repo_root()` now honors `CMRE_REPO_DIR` (the reviewed plan's repo) so the deny-write
  floor protects the user's plan repo, not arms.py's own location. `panel-critique.sh` exports it
  via `git -C <plan-dir> rev-parse --show-toplevel` (fallback: the plan's directory).
