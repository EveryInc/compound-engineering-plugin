### Stage 4: Spawn sub-agents

#### Inline fast pass (emit before the reviewer queue)

To surface findings in seconds, **immediately before the first foreground reviewer dispatch** the orchestrator does a quick first-principles scan of the diff it already holds — emit the fast-pass block as text, then begin the deterministic reviewer queue without an intervening wait.

Scan only for **high-signal, obvious** issues a careful first read catches: data/SQL safety, injection (shell/SQL/LLM-output trust boundary), broken control flow, a missing `await`/unhandled promise, a swapped argument or off-by-one, an enum/status added without updating its sibling switch, a null deref on a value the diff makes reachable. Do **not** do deep analysis, read beyond the diff (except a quick Grep for enum completeness), or chase subtle concerns. Quote the verbatim motivating line for each, same bar as a persona finding.

Show the preliminary fast pass only when it finds an urgent P0/P1 candidate. Present those under a clearly preliminary header (e.g. `### Fast pass (preliminary — deep review in progress)`) as a short list of `severity — file:line — what`, with one line stating they are unverified and will be deduplicated into the final report. Keep P2/P3 candidates internal until the final report, where validation and deduplication provide the needed context. If there are no P0/P1 candidates, emit only a brief "No urgent fast-pass findings; deep review continues" progress line. Do **not** assign stable `#` numbers here.

The fast pass enters Stage 5 as a pseudo-reviewer named `fast-pass`, with two hard constraints because it is the orchestrator's own read, **not** an independent reviewer (it shares the session model and its blind spots with the orchestrator and the session-model personas):

- **Cap every `fast-pass` finding at anchor 50.** At anchor 50 it surfaces on its own only when P0 (P0+50 survives the gate); otherwise it reaches the actionable tier only by deduping onto an independent persona finding that carries its own ≥75 anchor.
- **`fast-pass` never counts toward cross-reviewer promotion** (Stage 5 step 3). A `fast-pass`+persona fingerprint match is noted in the Reviewer column but does **not** bump the anchor — only independent reviewers corroborate.

Do not feed `fast-pass` candidates into the persona or validator prompts — those agents review the raw diff independently, and seeding them would manufacture the false agreement this cap exists to prevent. If the fast pass finds nothing obvious, emit one line saying so and proceed; never block dispatch on it.

When Stage 3c selected the lite roster, the fast pass still runs.

**Reconcile the preliminary block in the final report.** A preliminary fast-pass item that did not survive (deduped away, demoted at the gate, or dropped by validation) must be accounted for, not left dangling — add a one-line "Preliminary fast-pass items withdrawn: <n> (<reason>)" note so a user who saw a scary preliminary finding learns it was cleared. Mark any final finding that survived from `fast-pass` alone (no persona corroboration) so its weaker provenance is visible.

**`mode:agent`:** do **not** emit the preliminary block — that mode's response must be a single raw JSON object with nothing before it. Still run the scan internally and seed its findings into Stage 5 dedup as `fast-pass`.

#### Model tiering

Three reviewers inherit the session model with no override: `correctness-reviewer`, `security-reviewer`, and `adversarial-reviewer`. These perform the highest-stakes analysis — logic bugs, security vulnerabilities, adversarial failure scenarios — and should run at whatever capability level the user has configured. If the user is on Opus, these get Opus.

All other persona subagents and CE local prompt assets use the platform's mid-tier model to reduce cost and latency. See the Spawning subsection below for the exact dispatch-time override.

The orchestrator (this skill) also inherits the session model; it handles intent discovery, reviewer selection, finding merge/dedup, and synthesis.

#### Run ID

Use the run ID and absolute run dir already created at the Stage 3d routing boundary. Pass `{run_id}` and `{run_dir}` to every persona sub-agent so they can write their full analysis to `{run_dir}/{reviewer_name}.json`.

**Large shared context — pass paths, not contents.** The diff and file list go to every reviewer and validator. When inlining them into each subagent prompt would be wasteful (many files / a big diff), write them once into the run dir (e.g. `full.diff`, `files.txt`) and pass those **paths** in the diff / changed-files slots instead of inline content — the subagent and validator templates instruct the child to Read a staged path. Inline a small diff directly.

#### Spawning

Omit the `mode` parameter when dispatching sub-agents so the user's configured permission settings apply. Do not pass `mode: "auto"`.

**Model override at dispatch time — this is a correctness guarantee, not cosmetics.** Omitting the override on a top-tier parent session (e.g. Opus) silently runs that reviewer at the expensive tier — the regression this prevents. The tier is a deterministic function of the persona, so as you select reviewers in Stage 3, **record each reviewer's tier in an internal working list** — that list is your external memory (the role the old printed `[session model]`/`[mid-tier]` labels served) and it must exist and be honored even though it is no longer rendered in the user-facing announce:

- **Session model** (no override; inherits the session model) — `correctness-reviewer`, `security-reviewer`, and `adversarial-reviewer` only.
- **Mid-tier** — every other persona and CE agent: pass the platform's balanced mid-tier model. In Claude Code, that is the Sonnet class. In Codex, apply this tier only when the active dispatch primitive exposes an explicit model or custom-agent selector; task wording alone does not select a different model. Otherwise omit the override and inherit the parent model — a working review on the parent model beats a broken dispatch on an unrecognized name.

Apply this on **every** Agent / `spawn_agent` / subagent call. A missed override is a silent cost-and-quality regression, so treat the internal tier list as load-bearing — moving it out of the user-facing output removed the *display*, not the discipline.

**Bounded foreground dispatch.** Dispatch the selected reviewers as a **foreground concurrent batch** rather than serially. Where the harness runs tool calls issued in a single message concurrently (e.g. Claude Code's `Agent`), spawn as many reviewers as the host's active-agent cap accepts in one message with background execution off, and let that single blocking wait return all their compact JSON together — collecting multiple returns from one batch is the harness's job, so no polling, status calls, or per-reviewer waits are needed to gather them. Size each batch to the cap the host actually accepts and refill it as reviewers complete; never hard-code a number. Reviewers are independent by construction (none is fed another's output — see the independence rule above), so batch composition and completion order cannot change any finding, and stable numbers are assigned downstream after the post-merge sort. On a harness whose subagent primitive is asynchronous — e.g. Codex, where `spawn_agent` returns agent ids and a single `wait_agent` returns whichever target finishes first rather than an all-results barrier — spawn the whole batch, then **collect every spawned reviewer before synthesis**, waiting repeatedly until all spawned agent ids have returned. Those repeated collection waits are how an async batch is gathered, not the forbidden detached-delegate poll loop; Stage 5 must never run on a partial roster because only the first agent was awaited. On such a harness, awaiting a reviewer does not by itself free its concurrency slot: a completed agent keeps occupying the slot until it is explicitly closed (e.g. Codex `close_agent`). Close every collected async reviewer as soon as you have its result — **unconditionally, before leaving Stage 4**, not only when refilling a freed slot. Refilling mid-batch is one case, but a roster at or below the cap never refills, yet its completed-but-open agents would still occupy every slot and starve the Stage 5b validator batch (and any later subagent work) with capacity backpressure after Stage 4 has supposedly finished. The invariant is that no async reviewer stays open past collection. Where the harness does not run same-message calls concurrently, this identical dispatch **degrades to serial** automatically — that is the correct floor, not a failure.

This foreground batch is **not** the forbidden pattern. What is banned is turning local review into a *detached* delegate the orchestrator must poll: a background bash/CLI invocation plus foreground `sleep`/status-file loops, or scheduled wakeups and "still waiting" turns (the retired ce-work-beta failure mode). That discipline governs detached delegates such as the cross-model peer, which stays detached and is the only work allowed to overlap this batch; it does not require serializing harness-managed subagents, which return on their own tool call with no poll loop. Never insert shell no-ops (`echo waiting`, `noop`, `yield turn`, `end turn`, `true`, or sleeps), task-list/status polls, scheduled wakeups, or user-facing "still waiting" turns to await reviewers.

Treat active-agent/thread/concurrency-limit spawn errors as backpressure, not reviewer failure: a slot the host rejects for capacity stays queued and is retried in a later batch as active reviewers free capacity — a requested batch larger than the host cap clamps down to what the host accepts, dropping no reviewer. If the first dispatch itself repeatedly reports zero capacity, proceed with a user-visible degraded/no-subagent review path instead of waiting forever. Do not shrink the roster, ask the user, or record a reviewer as failed for capacity backpressure. Record a reviewer as failed only after a successful dispatch fails, or when dispatch fails for a non-capacity reason.

Before assembling any spawn prompt, read these three files from this skill's directory now — they define the dispatch shape and the JSON contract every subagent needs, and you cannot construct a valid spawn without them: `references/subagent-template.md`, `references/diff-scope.md`, and `references/findings-schema.json`. Read them and all selected persona prompt assets in one parallel read-tool wave rather than one turn per file.

For each selected reviewer, read the corresponding local prompt asset from `references/personas/<reviewer-name>.md` and spawn a generic subagent using the subagent template. Do not use `subagent_type`, typed `Agent` names, or platform-level CE agent registration. Each persona subagent receives:

1. Their persona file content (identity, failure modes, calibration, suppress conditions)
2. Shared diff-scope rules from `references/diff-scope.md`
3. The JSON output contract from `references/findings-schema.json`
4. PR metadata: title, body, and URL when reviewing a PR (empty string otherwise). Passed in a `<pr-context>` block so reviewers can verify code against stated intent
5. Review context: intent summary, file list, diff, scope mode (`local-aligned` | `pr-remote` | `branch-remote`), and remote head ref (`PR_HEAD_REF` or `<branch-head-ref>`) when set
6. Run ID and reviewer name for the artifact file path
7. **For selected `project-standards` only:** the non-empty standards file path list from Stage 3b, wrapped in a `<standards-paths>` block appended to the review context
8. **For `data-migration` only:** the resolved review base ref from Stage 1 (`BASE:` marker), wrapped in `<review-base>` inside the review context so schema drift checks never assume `main`

Persona sub-agents are **read-only** with respect to the project: they review and return structured JSON. They do not edit project files or propose refactors. The one permitted write is saving their full analysis to the resolved run-artifact path specified in the output contract.

Read-only here means **non-mutating**, not "no shell access." Reviewer sub-agents may use non-mutating inspection commands when needed to gather evidence or verify scope, including read-oriented `git` / `gh` usage such as `git diff`, `git show`, `git blame`, `git log`, and `gh pr view`. When a finding's claim depends on line history (`pre_existing`, intent, introduced-by-this-diff, or P0/P1 confidence that depends on authorship/age), reviewers are expected to attach one concise provenance evidence line from targeted blame/log on the cited line — additional to the quote-the-line gate, never a full-file dump, and omitted when the finding is justified from the diff alone. In **`pr-remote`** or **`branch-remote`** scope (see Stage 1), inspect changed files via `git show <remote-head-ref>:<path>` or diff hunks — do not Read/Grep workspace paths for files in scope; gather blame/log against that reviewed head ref. They must not edit project files, change branches, commit, push, create PRs, or otherwise mutate the checkout or repository state.

Each persona sub-agent writes full JSON (all schema fields) to `{run_dir}/{reviewer_name}.json` and returns compact JSON with merge-tier fields only:

```json
{
  "reviewer": "security",
  "findings": [
    {
      "title": "User-supplied ID in account lookup without ownership check",
      "severity": "P0",
      "file": "orders_controller.rb",
      "line": 42,
      "confidence": 100,
      "autofix_class": "gated_auto",
      "owner": "downstream-resolver",
      "requires_verification": true,
      "pre_existing": false,
      "suggested_fix": "Add current_user.owns?(account) guard before lookup",
      "first_evidence": "orders_controller.rb:42 -- account = Account.find(params[:account_id])"
    }
  ],
  "residual_risks": [...],
  "testing_gaps": [...]
}
```

`first_evidence` is the **one** detail-tier field promoted into the compact return: the verbatim motivating line with `file:line` that the quote-the-line gate requires. It is **mandatory for every finding at anchor 75 or 100** (the gate is unenforceable without it in-band, since the rest of `evidence` lives only in the artifact). Omit it only for anchor-50 findings. Stage 5 drops/demotes any 75/100 finding missing it; Stage 5b uses it for the validator-skip check. Keep it to the single triggering line, not the full `evidence` array — the array stays in the artifact.

The artifact file **must** carry the full detail-tier fields (`why_it_matters`, `evidence`); the compact *return* omits all detail-tier fields **except `first_evidence`**, but writing the compact shape to the artifact (a common reviewer slip) silently strips the detail Coverage and the keyed detail lines depend on. However review context is delivered — inlined, or staged to disk for a large diff — each reviewer still receives the full subagent-template output contract; staging context never licenses a thinner one. `suggested_fix` is optional in both tiers -- included in compact returns when present so callers can apply fixes after review. If the file write fails, the compact return still provides everything the merge needs.

**CE generic conditional local prompt assets** (`agent-native-reviewer`, `learnings-researcher`) are dispatched only when selected by Stage 3, through the same deterministic foreground batch dispatch as the structured personas. Read their prompt files from `references/personas/`, then give them the same review context bundle the personas receive: entry mode, any PR metadata gathered in Stage 1, intent summary, review base branch name when known, `BASE:` marker, file list, diff, and `UNTRACKED:` scope notes. Do not invoke them with a generic "review this" prompt. Their output is unstructured and synthesized separately in Stage 6.

**CE conditional local prompt assets** (`deployment-verification-agent` only) are dispatched as generic subagents through the same deterministic foreground batch dispatch when the migration-artifact gate applies. Read the prompt file from `references/personas/`, then pass the same review context bundle plus the applicability reason (for example, which migration files triggered the prompt asset). Its output is unstructured and must be preserved for Stage 6 synthesis just like the other selected local prompt assets. Schema drift is handled by the `data-migration` persona as structured findings — not here.

#### Cross-model adversarial pass

Stage 3d already made the exclusive route choice and, when applicable, started the detached peer. Do not resolve, start, or substitute a route here. Dispatch only the materialized local roster.

After the inline fast pass has completed and the local reviewer batch has started, prepare synthesis inputs while reviewers run. Do not poll the peer during that wave. After local reviewers finish, if Stage 3d persisted a peer job ID, perform the reference's single bounded status/wait/reap sequence and fold in whatever terminal artifact is available. Attribute from the artifact and clean up through the runner. A failure or timeout stays non-blocking and is named in Coverage; it never triggers a late in-process adversarial retry. Peer findings enter ordinary synthesis, but agreement promotion requires top-level `independence_verified: true`; false or absent independence is useful evidence, not different-model corroboration. Coverage must say whether the adversarial lens ran cross-model or used the in-process fallback.

The peer return enters Stage 5 as reviewer `adversarial-<provider>`, like any persona artifact. A pass that never started is recorded as not run (or as the in-process fallback when selected); a started peer that fails, times out, dies, or is reaped is named with its terminal state rather than vanishing silently.
