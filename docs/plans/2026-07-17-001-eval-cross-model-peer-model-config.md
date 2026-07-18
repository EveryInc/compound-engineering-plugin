# Eval: is `gpt-5.6-terra` (high) a non-inferior, cheaper, faster Codex peer than `gpt-5.6-sol`?

Executable eval spec for the ce-code-review (and parity-tested ce-doc-review)
cross-model adversarial peer. Decides whether to swap the Codex route's model.

> **Phase 1 directional result (2026-07-17) — lean against adopting Terra-high;
> the live question is Sol-high vs Sol-medium.** Seeded smoke + security-class
> hardening (3 arms; 3 general + 4 security diffs; n=6). Phase 0 confirmed all
> three model ids on codex-cli 0.144.5. Terra-high is ~2.2x faster and ~32%
> cheaper on the (bigger) security set. On security **risk detection** (surfaced
> as a finding OR in residual-risks/testing-gaps) the order is Sol-high 100% >
> Sol-medium 92% > Terra-high 79%; on **assertiveness** (surfaced specifically as
> a `finding`) it is Sol-high 92% > Sol-medium 71% > Terra-high 50%. Terra
> detects more than it asserts — it hedges unconfirmable vulns into
> residual-risks rather than claiming a finding, which is defensible but leaves
> security issues in a lower-priority channel. **Methodology correction: scoring
> only `.findings` conflates detection with assertiveness and penalizes epistemic
> conservatism; Phase 2's judge must decide whether a residual-risk counts as a
> catch.** Sol-medium nearly matches Sol-high detection at ~40% lower token cost —
> a real cost/assertiveness tradeoff worth a decision-grade Phase 2.
>
> **Phase 2 pilot (2026-07-18, real express bugs, blind judge)** sharpens it: on
> 3 reversed real bugs (n=3) Sol-medium detected 100% vs Sol-high 78% vs Terra
> 67%, at ~2.5x lower tokens than Sol-high (104k vs 262k median) — Sol-high's high
> tier bought no detection edge for its cost. Assertiveness identical (67% all).
> Directional lean: **drop Sol to medium**; do NOT adopt Terra. n is tiny
> (detection ranking rests on one XSS diff); scale before committing.
>
> **Phase 2 SCALED (2026-07-18, 10 reversed real express bugs, n=5, 3-vote blind
> judge) — DECISION-GRADE.** 150 runs, 0 failures. Sol-medium and Sol-high are
> quality-tied within noise: detection 92% vs 94%, assertiveness 82% vs 84%
> (50 reviews/arm). Sol-medium costs ~31% fewer tokens by median (69% of
> Sol-high; ~55% fewer by mean, since high has an expensive reasoning tail on
> hard diffs) and is ~29% faster. Terra-high is weakest quality (detection 78%,
> 11/50 missed) despite being fastest/cheapest — Sol-medium beats it on quality
> at comparable token cost. **Recommendation: drop the Codex peer's
> `model_reasoning_effort` from `high` to `medium` (confirms the "medium sweet
> spot"); do NOT adopt `gpt-5.6-terra`.** Scope: JS/web code, one target repo,
> Opus judge.

## The question

The Codex peer route currently ships `gpt-5.6-sol` at `model_reasoning_effort="high"`
(`skills/ce-code-review/scripts/cross-model-adversarial-review.sh`, kept byte-parity
with `skills/ce-doc-review/scripts/cross-model-doc-review.sh`). An external
benchmark claims `gpt-5.6-terra` at high reasoning is meaningfully faster and
cheaper than `gpt-5.6-sol` at any reasoning tier, at similar quality. If true on
*our* review task, we should swap.

This is a **non-inferiority** claim, not a superiority claim: Terra-high wins by
being cheaper/faster *while staying within a quality margin* of the baseline. The
eval is designed accordingly.

## Baseline reconciliation (read first)

The shipped Codex reasoning tier is **high**, not medium. PR #1159
("right-size review orchestration") reasserted "ONE model per provider at HIGH
reasoning." A prior belief that "Sol-medium was the sweet spot" is not reflected
on disk. Therefore:

- The baseline Terra-high must beat is **Sol-high** (what ships).
- **Sol-medium is carried as a third arm** to settle that belief in the same run
  and to expose the full cost/quality curve. If Sol-medium turns out ~equal to
  Sol-high at lower cost, that is itself a result and changes what "the baseline"
  should be.

## Design principles

1. **Quality-first, non-inferiority framing.** Speed and cost are near-deterministic
   functions of the model and its token count and are cheap to confirm. Quality is
   the only real risk, so the decision reduces to: *does Terra-high's review
   quality stay within a pre-registered margin of the baseline?*
2. **Isolate at the peer-worker layer.** Drive `codex exec` with the real
   `references/personas/adversarial-reviewer.md` prompt against a fixed diff,
   holding persona / diff / read-only in-tree sandbox / `findings-schema.json`
   constant, swapping only `-m <model>` and `-c model_reasoning_effort=<tier>`.
   No orchestration confound; benchmarks the model on the exact task.
3. **Independence is unaffected.** Terra and Sol are both gpt-5.6 / OpenAI family,
   so swapping between them does not touch the "different serving family from the
   Claude host" property. Not a variable here.
4. **Trials, not single runs.** Reviews are nondeterministic. A single run per
   config cannot support a non-inferiority claim; every cell is run N times and
   reported as mean + spread.
5. **Pre-register the decision rule** (below) before looking at results.

## Arms

| Arm | `-m` | `model_reasoning_effort` | Role |
|-----|------|--------------------------|------|
| A | `gpt-5.6-sol` | `high` | Shipping baseline |
| B | `gpt-5.6-terra` | `high` | Candidate |
| C | `gpt-5.6-sol` | `medium` | Reconcile "medium sweet spot" belief |

Everything else identical: same persona prompt, same diff, same
`-s read-only --json -c hide_agent_reasoning=false`, same repo `PEER_WORKDIR`.

## Phase 0 — availability smoke test (blocking)

Before any measurement, confirm the CLI accepts the Terra id and returns a usage
receipt. One run:

```
codex exec - -C "$REPO_ROOT" --skip-git-repo-check -s read-only --json \
  -o /tmp/terra-smoke.json -m gpt-5.6-terra -c 'model_reasoning_effort="high"' \
  -c 'hide_agent_reasoning=false' <<<'Review: print the file list, then stop.'
```

Confirm: exit 0, `/tmp/terra-smoke.json` has a `.findings`-shaped or turn output,
and the stream contains a `turn.completed` event with `.usage`. If the id is
rejected, stop and get the correct id — do not proceed against a guessed model.

## The harness

A thin wrapper around the production peer invocation. For each (arm, diff, trial):

1. **Build the prompt** exactly as the skill does: `adversarial-reviewer.md`
   persona body + the diff appendix (`git diff <base>` for a repo diff, or an
   embedded unified diff for a synthetic one). This is the same `PROMPT_FILE` the
   production script assembles.
2. **Run under timing**, capturing wall-clock:
   ```
   /usr/bin/time -p codex exec - -C "$PEER_WORKDIR" --skip-git-repo-check \
     -s read-only --json -o "$RAW_OUT" \
     -m "$ARM_MODEL" -c "model_reasoning_effort=\"$ARM_EFFORT\"" \
     -c 'hide_agent_reasoning=false' < "$PROMPT_FILE"
   ```
3. **Capture three artifacts per run:**
   - **Findings:** `$RAW_OUT` — `.findings[]` (title, severity P0–P3, file, line,
     confidence, pre_existing, why_it_matters, evidence).
   - **Usage/cost:** the last `turn.completed` `.usage` object, same extraction
     the script already uses:
     `jq -s '[.[] | select(.type=="turn.completed") | .usage] | last' "$STREAM"`.
     Cost = input/output tokens × the arm's per-model price.
   - **Latency:** wall-clock from `time -p` (real seconds).

Store as `runs/<arm>/<diff-id>/<trial>/{findings.json,usage.json,latency,meta.json}`.
Keep it a standalone eval harness (throwaway scratch dir); do not wire it into the
shipped skill — this is maintainer tooling, not runtime skill content, so it must
not land under `skills/**/references/`.

## Corpus

Two grading surfaces, both used.

### Seeded spine (deterministic grading)

Controlled difficulty, unambiguous scoring, no judge. Construct:

- Take ~10–12 clean, realistic diffs (real repo diffs or hand-built).
- Inject one known defect into most of them, spanning classes the adversarial
  persona targets: off-by-one / boundary, null / undefined deref, missing
  `await` or a race, removed/weakened auth or validation check, resource leak,
  swallowed error / wrong error path, broken cross-file invariant.
- Keep ~3 **clean** diffs (no injected defect) to measure the false-positive /
  noise floor.
- Each injected defect is a **ledger entry**: `{diff_id, file, line, category,
  severity}`. Clean diffs have an empty ledger.

A finding **catches** a ledger entry when it names the same file, a line within
±`W` of the ledger line (`W`=5 as a start), and a compatible category. Pure
string/line matching — no model in the loop.

### Real validation (blind-judge grading)

External realism, on-distribution. Construct:

- Mine target repo history for PRs where a **later fix commit** repaired a defect
  introduced in that PR. The repaired defect is the ledger entry
  (`{file, line-ish, description, severity}`); fuzzier than seeded, so judge-scored.
- ~6–8 such diffs.

**Blind judge** (host model, e.g. Opus — not a gpt-5.6 arm, avoids family
self-preference): pool all arms' findings for a diff, **shuffle and strip arm
labels**, then have the judge (a) map each finding to a ledger entry or (b)
classify unmatched findings as `true-but-unlabeled` / `false-positive` /
`style-nit`. Unblind only for aggregation. Randomized order + label-blinding kill
ordering and label bias.

## Metrics

Per (arm, diff), aggregated across trials:

- **Severity-weighted recall** = Σ(weight of caught ledger defects) / Σ(weight of
  all ledger defects). Weights `P0=8, P1=4, P2=2, P3=1`. This is the headline
  quality metric — it rewards catching the *serious* bugs, not raw finding count.
- **Noise** = false findings per review (seeded: findings matching no ledger entry
  on any diff; real: judge-labeled `false-positive` + `style-nit`). An adversarial
  reviewer that spews low-value findings degrades the review, so noise is a
  penalty, not a bonus.
- **Latency** = median real-seconds per review.
- **Cost** = mean (input+output tokens × per-model price) per review.
- **Severity calibration** (secondary) = does the arm assign P0/P1 to the ledger's
  high-severity defects rather than burying them at P3.

## Phases

### Phase 1 — quick directional gate (run first)

- 3 arms × ~6 diffs (4 seeded + 2 real) × **n=2** ≈ 36 runs.
- Point estimates only. **Gate:** proceed to Phase 2 iff Terra-high's
  severity-weighted recall is within ~15 points of Sol-high AND shows a visible
  latency/cost advantage. If Terra-high is clearly worse on quality, **stop and
  keep Sol** — the cheaper/faster win doesn't matter if it misses real bugs.
- If Sol-medium already matches Sol-high here at lower cost, note it; it may become
  the real comparison baseline.

### Phase 2 — decision-grade non-inferiority (only if Phase 1 passes)

- 3 arms × ~18 diffs (12 seeded + 6 real) × **n=5** ≈ 270 runs.
- Report per-arm mean recall with a bootstrap confidence interval, median latency,
  mean cost, noise rate.

## Pre-registered decision rule

Adopt Terra-high **iff all** hold in Phase 2:

1. **Quality non-inferior:** `recall(Terra-high) ≥ recall(Sol-high) − δ`, with the
   **lower** bound of Terra-high's recall CI also `≥ recall(Sol-high) − δ`.
   `δ = 0.10` (severity-weighted).
2. **No noise regression:** `noise(Terra-high) ≤ noise(Sol-high) + ε`,
   `ε = 0.5` false findings/review.
3. **Faster:** `median_latency(Terra-high) ≤ 0.85 × median_latency(Sol-high)`
   (≥15% faster — sanity-checks the external claim on our task).
4. **Cheaper:** `mean_cost(Terra-high) ≤ 0.85 × mean_cost(Sol-high)` (≥15% cheaper).

If quality is non-inferior but the speed/cost win is smaller than claimed, that is
a judgment call — record it; a modest win may still justify the swap, but the
external benchmark's magnitude did not reproduce on our task, which is worth
knowing. If **Sol-medium** meets criteria 1–2 vs Sol-high at materially lower cost,
re-run the comparison with Sol-medium as the baseline before deciding.

## On a positive result — what to change

A single maintenance point, kept in byte-parity across the two scripts (CI
parity test enforces this):

- `M_CODEX` and the `-c 'model_reasoning_effort="..."'` in `adapter_argv`'s codex
  branch, in **both** `skills/ce-code-review/scripts/cross-model-adversarial-review.sh`
  and `skills/ce-doc-review/scripts/cross-model-doc-review.sh`.
- Update the tier comment on `M_CODEX` and any "HIGH reasoning per provider" prose.
- Re-run the orchestration eval (`references/cross-model-eval.md`) — swapping the
  model must not change activation/routing/disclosure behavior.

## Phase 1 results (2026-07-17, seeded smoke + security hardening)

Harness: 3 arms, codex-cli 0.144.5, in-tree read-only, exact production
adversarial-reviewer prompt. Two corpora: (a) general smoke — off-by-one (P1),
missing-auth (P0), 1 clean; n=2 then n=6. (b) security hardening — 4 diverse P0
security bugs (authz removal, IDOR in added code, SQLi, authn-bypass); n=6. All
runs exited 0, zero parse failures, zero false positives on the clean diff.

**Critical scoring correction.** The first-pass metric counted only `.findings`
and reported Terra "missing" P0s. Inspecting the runs showed Terra frequently
*detected* the vuln but routed it to `residual_risks` / `testing_gaps` with an
explicit "cannot confirm from the diff alone" hedge (e.g. IDOR: "a user could
request another user's invoice ID… the diff contains no DB contract to verify
that boundary"). So the honest metric is two-dimensional — **detection**
(surfaced anywhere) vs **assertiveness** (surfaced as a `finding`):

Security corpus (4 P0 bugs x n=6 = 24 trials/arm):

| metric | Sol-high | Terra-high | Sol-medium |
|---|---|---|---|
| detection: surfaced anywhere | 24/24 (100%) | 19/24 (79%) | 22/24 (92%) |
| assertiveness: as a `finding` | 22/24 (92%) | 12/24 (50%) | 17/24 (71%) |
| median latency | 28.5s | 13.2s | 20.8s |
| mean tokens | 73k | 49.7k | 41.7k |

Findings:

1. **Terra-high trails on detection but the gap is smaller than findings-only
   scoring implied** (79% vs 100%). Its larger deficit is **assertiveness**: it
   hedges ~29% of detected vulns into residual-risks instead of asserting a
   finding. Defensible epistemically (the seeded IDOR is genuinely unprovable
   from the diff), but it parks security issues in a lower-priority channel that
   downstream synthesis may weight less.
2. **Terra-high is not globally worse** — it caught the general off-by-one 6/6 vs
   Sol-high's 3/6, and matched everyone on the authn-bypass (6/6). Weakness is
   concentrated in *absent-check* recognition (authz removal, IDOR).
3. **Speed confirmed (~2.2x median); cheaper confirmed and now larger (~32% fewer
   tokens)** on the bigger security diffs — the reasoning-token savings that were
   invisible on tiny diffs show up as diffs grow. Cost axis still needs real PRs
   + pricing for a $ figure.
4. **Sol-medium nearly matches Sol-high on detection (92% vs 100%) at ~40% lower
   token cost and lower latency**, hedging somewhat more (71% vs 92% asserted).
   A genuine cost/assertiveness tradeoff — the real Phase 2 question. Note: the
   rosier "Sol-medium best" read from the tiny general corpus did NOT survive the
   harder security set (it bombed SQLi findings 1/6, though 5/6 surfaced).
5. **Severity mis-calibration is model-independent** — nearly every arm graded P0
   bugs as P1. A persona/prompt issue to fix separately from model choice.

Directional decision: **lean against Terra-high** for the security-critical
adversarial role (weaker detection + more hedging outweigh its speed/cost win),
but not "disqualified." The higher-value open question is Sol-high vs Sol-medium,
which needs Phase 2 with a blind judge that explicitly rules whether a
residual-risk hedge counts as a catch. Caveats: all bugs are synthetic and
author-written; P0 labels are debatable; SQLi showed high variance; n=6 is noisy.
Do not treat any single number as decision-grade.

## Phase 2 pilot (2026-07-18, real expressjs/express bugs, blind judge)

Corpus: 3 real express bug-fix commits, **reversed** so the review diff
re-introduces the bug (XSS via redirect anchor href @54271f69b5; res.jsonp
crash-on-undefined @9dd0e7afdb; large-stack routing regression @7ec5dd2b3c),
code file only (no test/History leakage). 3 arms x 3 diffs x n=3 = 27 runs, all
exit 0, zero parse failures. Graded by a blind Opus judge (`phase2/judge.py`):
per review, defect surfaced as a `finding`, only in `residual_risks`/
`testing_gaps` (hedged), or `missed`. Arms unlabeled + shuffled per diff.

| arm | as-finding | +residual | missed | detect% | assert% | median tokens |
|---|---|---|---|---|---|---|
| sol-high | 6/9 | 1 | 2 | 78% | 67% | 262k |
| sol-medium | 6/9 | 3 | 0 | **100%** | 67% | **104k** |
| terra-high | 6/9 | 0 | 3 | 67% | 67% | 104k |

Findings (n is tiny — pilot to validate the pipeline, not decision-grade):

1. **Sol-high's high-reasoning tier is a poor cost trade here.** It spent ~2.5x
   Sol-medium's tokens (262k vs 104k median; per-diff up to 538k vs 253k on the
   routing bug) and did NOT detect more — Sol-medium surfaced 100% vs Sol-high's
   78%. The most robust pilot signal (holds by median, across the two hard diffs).
2. **Assertiveness was identical (67% all three).** The seeded-security hint that
   medium/Terra hedge more did NOT reproduce on real bugs. All three asserted the
   same 6/9 (jsonp + routing) and none asserted the subtle XSS as a finding.
3. **The XSS was the whole detection spread.** Nobody filed it as a finding
   (escapeHtml'd URL in an href; the javascript:-scheme bypass is subtle).
   Sol-medium flagged it as a residual risk 3/3, Sol-high 1/3, Terra 0/3. So the
   detection ranking hangs on ONE diff — thin.
4. **Terra-high: fastest, token-competitive with medium, weakest detection**
   (missed the subtle XSS entirely) — consistent with the security-hardening
   result across corpora.
5. **Corpus disagreement to resolve at scale:** seeded-security suggested
   Sol-medium was *weaker* (SQLi 1/6 findings); this real pilot shows it *equal or
   better* at far lower cost. Real diffs and seeded diffs disagree — the reason to
   scale on real diffs.

Pilot conclusion: pipeline validated end-to-end. Directional read = **dropping
Sol to medium looks like a real win (comparable detection, ~2.5x cheaper, faster);
Terra-high stays weakest on subtle-security detection.** Scale-up needed before
committing: ~12-15 reversed real bugs (mix security/correctness), n>=5, and ideally
a multi-judge vote (single-judge, single-pass here). Token figures are the pilot's
most trustworthy output; the detection ranking rests on one diff.

## Phase 2 scaled results (2026-07-18) — decision-grade

Corpus: 10 reversed real expressjs/express bug-fix commits (XSS, jsonp crash,
routing regression, two HEAD double-`end` crashes, prototype-key `res.location`,
`req.is` charset, decode-param error masking, sendfile abort, route-middleware
aliasing). 3 arms x 10 diffs x n=5 = 150 runs, all exit 0, zero parse failures.
Graded by a 3-vote blind Opus judge (`phase2/judge.py --votes 3`, reshuffled per
pass, majority vote per review), 50 reviews/arm.

| arm | detect% (surfaced) | assert% (finding) | missed | median tokens | median latency |
|---|---|---|---|---|---|
| sol-high | 94% (47/50) | 84% (42/50) | 3 | 170k | 82s |
| sol-medium | 92% (46/50) | 82% (41/50) | 4 | 118k (69%) | 58s |
| terra-high | 78% (39/50) | 74% (37/50) | 11 | 70k (41%) | 31s |

1. **Sol-medium == Sol-high on quality, within noise.** 92% vs 94% detection and
   82% vs 84% assertion is a 1-review gap across 50 — not a real difference.
   Medium is at most a hair below high, not equal-or-better; treat as a tie.
2. **Sol-medium is materially cheaper and faster.** ~31% fewer tokens by median
   (~55% by mean — Sol-high's `high` tier balloons on hard-reasoning diffs like
   the routing regression and jsonp), ~29% lower median latency. The high tier
   buys no quality it can be shown to buy on this corpus.
3. **Terra-high is the weakest.** 78% detection, 11/50 missed — roughly double
   Sol-medium's miss count. Fastest and lowest-token, but Sol-medium beats it on
   quality (92% vs 78%) at only modestly higher token cost; Terra's sole
   advantage is latency. Consistent with every prior pass (weak on subtle bugs).
4. **The seeded-vs-real disagreement resolved toward "tie."** Seeded-security had
   hinted Sol-medium was weaker (SQLi); the pilot had hinted better; at scale on
   real bugs it lands equal. The scaled real-bug corpus is the trustworthy read.

## Recommendation

**Drop the Codex peer's `model_reasoning_effort` from `high` to `medium`; do NOT
adopt `gpt-5.6-terra`.** Medium matches high-tier review quality within noise at
~30-55% lower token cost and ~30% lower latency — the "medium sweet spot" the
original question remembered, now confirmed decision-grade on real bugs. Terra is
faster/cheaper but a measurably worse detector, the wrong trade for an adversarial
security reviewer.

Implementation (single maintenance point, byte-parity across both scripts, guarded
by the CI parity test): in `skills/ce-code-review/scripts/cross-model-adversarial-review.sh`
AND `skills/ce-doc-review/scripts/cross-model-doc-review.sh`, change the codex
`adapter_argv` branch `-c 'model_reasoning_effort="high"'` -> `"medium"` and update
the `M_CODEX` tier comment. Leave `M_CODEX=gpt-5.6-sol` unchanged. Re-run the
orchestration eval (`references/cross-model-eval.md`); a reasoning-tier change must
not alter activation/routing/disclosure.

Scope / caveats: JS-web code, one target repo (express), single judge family
(Opus), synthetic + reversed-real bugs. The quality tie is well-supported on this
corpus; a different language/domain could shift it, but the cost asymmetry (high
tier's expensive tail) is a general property worth capturing regardless.

## Cross-language spot-check (2026-07-18) — Python + Go

Purpose: confirm the JS "Sol-medium ties Sol-high, cheaper" result is not
JS-specific. Same reversed-real-bug + blind-judge method, Sol-high vs Sol-medium
vs Terra-high. Python: psf/requests, 2 bugs, n=3. Go: gin-gonic/gin, 4 bugs, n=3.
3-vote blind Opus judge. Detection% / assertion% / median tokens / median latency:

| lang | Sol-high | Sol-medium | Terra-high |
|---|---|---|---|
| Python | 100 / 100 / 238k / 111s | 100 / 100 / 212k / 61s | 100 / 100 / 35k / 31s |
| Go | 100 / 92 / 616k / 170s | 100 / 83 / 189k / 64s | 67 / 67 / 130k / 44s |

- **Sol-medium ties Sol-high on detection in both** (100/100 Python; 100/100 Go),
  at lower cost — dramatically so on Go (189k vs 616k median tokens, ~70% cheaper).
  The JS quality tie generalizes.
- **Terra weakest where bugs are hard enough to discriminate** (Go 67%). Python's 2
  bugs were too easy (all arms 100%) — it separates cost, not quality.
- Confirms the recommendation across JS + Python + Go. Full write-up with the
  shareable cost-vs-effectiveness chart:
  `docs/plans/2026-07-18-adversarial-peer-benchmark-report.md`
  (chart: https://claude.ai/code/artifact/693e1aa6-6619-4a81-a61f-59b08da137e5).

## Threats to validity

- **Wrong baseline.** If Sol-medium ≈ Sol-high, comparing Terra-high to Sol-high
  overstates the quality bar. The 3-arm design surfaces this; honor it.
- **Corpus leakage.** Real diffs mined from public history may be in a model's
  training data, inflating recall. Prefer recent/private diffs for the real set;
  lean on the seeded spine (novel injected defects) for the primary quality signal.
- **Judge bias.** Blind + shuffle + a non-arm judge family. Spot-check a sample of
  judge mappings by hand.
- **Price drift.** Cost uses list prices at eval time; record the price sheet in
  `meta.json` so the result is reproducible.
- **Small-N latency noise.** Report median, not mean, for latency; network/queue
  variance skews the mean.
```
