# Sweep run phases (2a-2i)

Required read before Phase 2 of `ce-sweep`. The body carries the ordering invariant, the boundaries, and the stop classes. This file carries the full detail of each phase.

## Interaction method

Default to the host's blocking question tool already in the current tool list (match by capability, not by a host-specific name). Presence in the current tool list is proof the tool exists; never call a user-facing question tool to discover whether it exists. If a matching tool is listed but unloaded, use the host's tool-discovery primitive to load that capability. Do not search for another host's tool name. Never silently skip a question you owe the user. If no blocking tool exists in the harness, the run is non-interactive. Ask one question at a time. The decision round (2h) may group by category but still asks one blocking question per category.

## Config keys

- `feedback_sources` is the list of source entries. Each carries a `type` (`slack`, `github-issues`, `email`), its target, the standing-approved ack action, an optional close-out action, and an optional `sensitive: true`. Presence of this key means the skill is configured.
- `sweep_state_path` is the path to the state file, established at setup; fallback `<root>/feedback-sweep/state.yml`. A repo-internal path means committed mode: the state file is committed each run and must not be gitignored. A path outside the repo (e.g. under `/tmp`) means machine-local mode: the state file is never committed, and only the plan is.
- `sweep_lease_ttl_minutes` is the single-writer lease staleness threshold; default `60`. Passed to `lease-acquire` in 2a.
- `sweep_shared_branch` is `true` when the state file lives on a shared branch that multiple checkouts push to (see 2a topology); default `false`.
- `sweep_ack_cap` is the integer circuit-breaker threshold; default `25`.

## Run identity

Resolve once and reuse for the entire run:
- `<state>` = `sweep_state_path` from config (fallback `<root>/feedback-sweep/state.yml`).
- `<writer>` = a run-unique writer id identifying harness + session + host, e.g. `sweep-<host>-<session>-<YYYY-MM-DD>`. Use the same string for every state-engine call this run.
- `<run-id>` = a short unique token for scratch paths, e.g. the date plus a random suffix.

## Engine invocation

Every Bash call that runs the bundled engine sets `SKILL_DIR` inline (shell state does not persist between calls):

```bash
SKILL_DIR="<absolute path of the directory containing the SKILL.md you just read>";
PY="$(for c in python3 python py; do command -v "$c" >/dev/null 2>&1 && "$c" -c '' >/dev/null 2>&1 && { echo "$c"; break; }; done)"; [ -n "$PY" ] || { echo "no working Python 3 interpreter on PATH" >&2; exit 1; };
"$PY" "$SKILL_DIR/scripts/sweep-state.py" <subcommand> --state <state> ...
```

#### 2a. Acquire lease + validate

`lease-acquire --state <state> --writer <writer> --ttl-minutes <sweep_lease_ttl_minutes>`:
- `LOCKED` means another live writer holds it. Record the outcome and stop: `run-record --state <state> --writer <writer> --outcome aborted-locked --counts '{}' --timestamp <ISO now>`, report that a concurrent sweep is running, and exit. This record is safe against the mid-sweep holder: the engine serializes every state write with an OS advisory lock, so it cannot clobber the holder's concurrent upserts (see `references/state-schema.md`).
- `STALE-RECLAIMED` means an expired lease was taken over. Proceed, and note the takeover in the final summary.
- `OK` means proceed.

**Shared-branch topology** (`sweep_shared_branch: true`): before any source-side write, `git add` the state file, commit, and push it. A rejected push means another writer won the branch. Fetch and rebase, re-run `lease-acquire`, and if the lease is still not yours, back off (record `aborted-locked` and stop). Only once your lease is pushed and confirmed do you touch a source.

Then run `validate --state <state>`. This is a lease-agnostic repair. Note in the summary any ids it downgrades from `closed` to `fix_pending`.

#### 2b. Fetch each source

A generic subagent is one whose whole brief is the prompt you send it. When the host's subagent tool makes you name an agent, use only a name you have seen the host list, and list its agents before the first dispatch if you have not. Pick the plain one that adds no role of its own, which still counts as a generic subagent. Never pick a specialist, such as a reviewer or worker agent, whose own role prompt, output format, or tool limits would replace or narrow your prompt.

For each entry in `feedback_sources`, dispatch a generic subagent at the **extraction tier** (`references/model-tiers.md`) seeded with:
- the matching persona file contents (`references/sources/<type>.md`),
- the source's config entry verbatim,
- the current cursor from `cursor-get --state <state> --source <source-id>`.

The persona returns mapped items (`id`, `origin`, `author_class`, `body`, `media`, identity-scoped `existing_ack`, `existing_closeout`) or one of its degrade/skip sentences. Personas report facts and never advance cursors.
- **Skipped source** (read tools unavailable): drop it this run and note that in the summary.
- **Write-degraded source** (read works, no ack-write tool): upsert its items as `ack_deferred` and do NOT advance the cursor past them. They get acked on a later run once write capability returns.
- **Reopened item:** an id the fetch returns whose status in state is `source_closed` was reopened at the source. Treat it as new in 2d. Its upsert must set `status: acknowledged`, or `ack_deferred` when 2d defers the ack, and set `source_closed_at`, `source_close_reason`, `fix_ref`, `verified_merge_sha`, and `verified_at` to null. `upsert-item` merges into the old record, so it would otherwise keep those values.

#### 2c. Circuit breaker (before any acknowledgment batch)

Count new unacknowledged items per source. If the count exceeds `sweep_ack_cap`:
- interactive -> ask whether to proceed with acking that many;
- non-interactive -> upsert the whole batch as `ack_deferred`, do NOT ack, and flag it prominently in the summary.

#### 2d. Acknowledge each item — correctness core

Process each new item in cursor order. This ordering is an invariant. Do not reorder it or batch across the read-back:

1. If the source's config entry has `approved: false` (the user declined standing approval for source-side writes), skip the ack write entirely and upsert the item as `ack_deferred`. Never write to a source the user did not approve, even when the write tool is available. Otherwise: if the item's `existing_ack` (own identity) is true, skip the ack write; else perform the source's configured ack action at the source.
2. Read back and confirm the ack is visible at the source before trusting it.
3. `upsert-item --state <state> --id <id> --source <source-id> --json <item-json> --writer <writer>`. Include `"sensitive": true` in the item JSON when the source's config entry is marked sensitive, so the engine drops `body`/`quote` before writing.
4. `cursor-advance --state <state> --source <source-id> --to <item's own cursor value> --past-item <id> --writer <writer>`, only after the item is durably in state. Never advance past an item not yet upserted.

A failed ack write -> upsert the item as `ack_deferred` and hold the cursor (do not advance past it). A `LEASE-LOST` from any engine call means another writer took over. Stop writing, record `partial` at wrap-up, and exit.

#### 2e. Media

Resolve and create media scratch with this shell block, substituting the current run id:

```bash
SCRATCH_ROOT="/tmp/compound-engineering-$(id -u)";
[ ! -L "$SCRATCH_ROOT" ] && (umask 077; mkdir -p "$SCRATCH_ROOT") 2>/dev/null && [ ! -L "$SCRATCH_ROOT" ] && [ -O "$SCRATCH_ROOT" ] && [ -w "$SCRATCH_ROOT" ] || SCRATCH_ROOT="${TMPDIR:-/tmp}/compound-engineering-$(id -u)";
if [ -L "$SCRATCH_ROOT" ]; then echo "unsafe scratch root symlink: $SCRATCH_ROOT" >&2; exit 1; fi;
(umask 077; mkdir -p "$SCRATCH_ROOT") || exit 1;
if [ -L "$SCRATCH_ROOT" ] || [ ! -O "$SCRATCH_ROOT" ]; then echo "scratch root is not owned by the current user: $SCRATCH_ROOT" >&2; exit 1; fi;
chmod 700 "$SCRATCH_ROOT" || exit 1;
MEDIA_DIR="$SCRATCH_ROOT/ce-sweep/<run-id>";
(umask 077; mkdir -p "$MEDIA_DIR") || exit 1; chmod 700 "$MEDIA_DIR" || exit 1;
```

Pass absolute artifact paths beneath `$MEDIA_DIR` to subagents. If that block exits without a usable `$MEDIA_DIR`, media is the only thing lost. Upsert every item carrying `media` as `needs_download` (counting the attempt), note the scratch failure in the summary, and continue the run at 2f. State is still writable, so the run does not stop.

For each new item carrying `media`:
- Download attachments into `$MEDIA_DIR`; raw media is never committed. A download failure -> set the item `needs_download` and continue.
- Dispatch one generic subagent per recording, in parallel, at the **generation tier**, using `references/subagent-template.md` filled from `references/agents/media-analyzer.md`. Fill the template's `{skill_dir}` slot with the same absolute ce-sweep skill directory you resolve for your own `SKILL_DIR` Bash calls. A fresh subagent does not inherit your shell state, so it cannot run the bundled analyzer without being told the path. Pass the absolute media PATHS, a scratch artifact path, and the item's `sensitive` flag; collect the compact 1-2 line summary each returns. A subagent failure -> set the item `needs_analysis`, retain the media, and continue.
- Track attempts on the item (a `media_attempts` count upserted on each try). After 3 failed attempts across runs (`needs_download`/`needs_analysis`), set the item `manual_stuck` and list it separately, out of the routine nag.

#### 2f. Fix verification

A fix can close an item only when its merge evidence belongs to the checkout repository. Repository identity is the full hostname, owner, and repository name, compared case-insensitively; matching `owner/repo` alone is insufficient. Resolve the checkout once with `gh repo view --json nameWithOwner,defaultBranchRef,url`, and each GitHub Issues source with `gh repo view "<source-target>" --json nameWithOwner,url`. Use each returned URL's hostname and `nameWithOwner` as its identity. Leave affected items unchanged when an identity cannot be resolved, and report the failure; never substitute the checkout for an unknown source.

Check every nonterminal item from a readable `github-issues` source by id, since the fetch returns only open issues. Skip sources skipped this run and statuses `closed`, `source_closed`, and `source_gone`. Run `gh issue view "<number>" --repo "<source-host>/<source-repo>" --json state,stateReason,closedAt,closedByPullRequestsReferences`. The number must be all digits and the repository in the item's `id` must match the resolved source repository. Any stored issue URL must also identify that source; a mismatch leaves the item unchanged and is reported.
- `OPEN` -> no change.
- `CLOSED` with `stateReason` `COMPLETED` -> the item is closed as completed. Verify its fix below.
- `CLOSED` with any other `stateReason` -> `upsert-item` with `status: source_closed`, `source_closed_at` (from `closedAt`), and `source_close_reason` (from `stateReason`). Set `fix_ref`, `verified_merge_sha`, and `verified_at` to null. Do not verify a fix or perform a close-out action, because the source did not close it as done.
- `Could not resolve to an issue` -> set `source_gone`.
- Any other failure (rate limit, auth, transport, a repository that does not resolve) -> leave the item unchanged, stop checking this source, and note it in the summary. The next run checks again.

For each eligible `fix_pending` item and each item closed as completed, verify the claimed fix against the checkout's default branch. **Validate its shape before it reaches any git/gh command:** accept only a bare PR number (`#?\d+`) or a commit SHA (`[0-9a-f]{7,40}`); anything else is an unverified claim. Strip a number's leading `#` and quote the substituted value.

PR numbers are repository-scoped. For GitHub Issues items, a stored bare number belongs to the resolved source identity; a `closedByPullRequestsReferences` number belongs to the identity in that PR's URL. For other source types, retain the existing convention that bare fix numbers refer to the checkout. Try the eligible stored ref first, then eligible closing PRs, and retain the first verified candidate as `fix_ref`.

Bind verification commands to the resolved checkout, never to an implicit CLI default:
- PR: verify only a candidate whose full host/owner/repository identity equals the checkout’s. Skip a known foreign candidate. If its identity is unknown, leave the item unchanged unless another candidate verifies. For an eligible candidate, run `gh pr view "<validated-number>" --repo "<checkout-host>/<checkout-repo>" --json mergedAt,baseRefName,mergeCommit`; it must be merged with the default branch as its base.
- SHA: `gh api --hostname "<checkout-host>" "repos/<checkout-repo>/compare/<default-branch>...<validated-sha>" --jq .status`. `behind` or `identical` verifies ancestry. Use the same host and repository for the control compare below. GitHub answers these comparisons, so stale or shallow local history cannot change the result.
- A ref is unverified only when a read succeeded and showed no merge to the default branch. That means an unmerged PR, a PR with another base, `Could not resolve to a PullRequest`, a compare status of `ahead` or `diverged`, or a compare `Not Found` for the SHA. A bad repository or branch gives the same `Not Found`, so trust it only after a control compare of `<default-branch>...<default-branch>`, run once per run, returned `identical`. Any other `gh` failure in this step, including a failed control, tells you nothing about the merge. Unless another ref verifies, leave the item unchanged for the next run and note it in the summary.
- The same `approved: false` rule as 2d applies. A source the user did not approve for writes, or a write-degraded source, receives no close-out action. Advance its verified item's status in state only.
- Verified -> perform the source's configured close-out action against its resolved source identity (same write -> read-back -> confirm discipline as 2d), then `upsert-item` with `status: closed` carrying all three evidence fields: `fix_ref`, `verified_merge_sha`, `verified_at`. Close-out is terminal.
- When every candidate read succeeded and none verified, or there is no fix ref -> if the item is not known to be closed as completed, it stays open: record the claim on the item, but do not close. If it is closed as completed, write the same `source_closed` record as above, with no close-out action, because no fix was verified.
- Item deleted at source -> set `source_gone`.

#### 2g. Plan reconciliation

Read `references/plan-template.md` and follow it. Target the stable path `<root>/plans/feedback-sweep-plan.md`.

**Rotation check first.** If the file exists and it is not a `product_contract_source: ce-sweep` artifact containing only requirements, with no implementation planning, archive it untouched to a dated sibling `<root>/plans/feedback-sweep-plan-YYYY-MM-DD.md` and write a fresh plan from the template. Never overwrite an unrelated plan in place.

Rewrite ONLY the machine-written region: the `date` frontmatter key, `### Summary`, the `<!-- sweep-items:start -->` / `<!-- sweep-items:end -->` marker region, and `### Outstanding Questions` (matching the template's reconciliation rules), and never read or write inside the human-owned notes region. Append new actionable items with their state ids, drain items that are now `closed`, `source_closed`, or `source_gone`, and land any non-interactive-deferred decisions in the Outstanding Questions section.

#### 2h. Decision round

Interactive only. For items needing a product call, ask the user, grouped by category with one blocking question per category, and fold the answers into the plan. Non-interactive skips this; the deferrals are already in the plan's Outstanding Questions.

#### 2i. Wrap-up

Render the handoff invocation exactly as the skill body's 2i section states.

- **Commit.** `git add` ONLY `<root>/plans/feedback-sweep-plan.md` plus `<state>` when it is repo-internal (never `-A`; machine-local state under `/tmp` is never committed), then commit `docs(sweep): feedback sweep <date>`. A commit failure is reported, not fatal. In local-commit mode, never push. In shared-branch mode (`sweep_shared_branch: true`), fetch, rebase, and push the final commit.
- **Record the run.** `run-record --state <state> --writer <writer> --outcome <completed|partial|failed> --counts '<per-source JSON>' --timestamp <ISO now>`.
- **Release.** `lease-release --state <state> --writer <writer>`.
- **Summary** (always emit): new items by source; recordings analyzed, each with its one-line finding; closed items with their fix evidence; `source_closed` items with their close reason; the `ack_deferred` / `manual_stuck` / needs-attention list; any circuit-breaker or stale-reclaim note; and always the plan path with the handoff line:

