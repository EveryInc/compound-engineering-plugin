import { readFile } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"

// Cross-skill contract parity for ce-babysit-pr's delegation seams. These tokens are protocol
// shared between a producer skill and a consumer skill; a rename or drop on one side alone breaks
// the loop silently (babysit mis-parses a ce-debug status, or references a trajectory field
// pr-snapshot no longer emits). Each assertion below fails under exactly that one-sided drift.
//
// Sensitivity note: presence/exact-set based. It catches renames and drops (the drift that
// actually happens); a field added to BOTH sides in the same change is in sync and intentionally
// does not fail. The emitter-set check additionally catches an emitter-only addition.

async function readRepoFile(relativePath: string): Promise<string> {
  return readFile(path.join(process.cwd(), relativePath), "utf8")
}

const BABYSIT = "skills/ce-babysit-pr/SKILL.md"
const CEDEBUG_PIPELINE = "skills/ce-debug/references/pipeline-mode.md"
const CERESOLVE = "skills/ce-resolve-pr-feedback/SKILL.md"
const CERESOLVE_FULL_MODE = "skills/ce-resolve-pr-feedback/references/full-mode.md"
const PR_SNAPSHOT = "skills/ce-babysit-pr/scripts/pr-snapshot"

// ce-debug's pipeline-mode structured return. babysit branches on this exact set (Step 2 step 5)
// and warns "do not invent infra-retry/stale" — so both the vocabulary and the ban are protocol.
const CEDEBUG_STATUS = ["fixed-and-pushed", "diagnosed-no-fix", "flaky-infra", "needs-human"]

// pr-snapshot's trajectory block (emitted by _update_trajectory). The subset each consumer cites
// by name is protocol for that consumer: rename a field in the emitter and the citation dangles.
const TRAJECTORY_FIELDS = [
  "check_recur_max",
  "recurring_checks",
  "unresolved_threads",
  "unresolved_series",
  "unresolved_trend",
  "new_threads_this_tick",
  "stream_alternations",
  "heads_since_progress",
]
const BABYSIT_TRAJECTORY_REFS = [
  "check_recur_max",
  "recurring_checks",
  "unresolved_trend",
  "new_threads_this_tick",
  "stream_alternations",
  "heads_since_progress",
]
const CERESOLVE_TRAJECTORY_REFS = ["unresolved_trend", "new_threads_this_tick"]

function emittedTrajectoryKeys(script: string): string[] {
  const fn = script.slice(script.indexOf("def _update_trajectory"))
  const retStart = fn.indexOf("return {")
  const block = fn.slice(retStart, fn.indexOf("\n    }", retStart))
  return [...block.matchAll(/"([a-z_]+)":/g)].map((m) => m[1])
}

describe("ce-babysit-pr cross-skill contract parity", () => {
  test("ce-debug pipeline return-status enum agrees between producer and babysit consumer", async () => {
    const [producer, consumer] = await Promise.all([readRepoFile(CEDEBUG_PIPELINE), readRepoFile(BABYSIT)])
    for (const status of CEDEBUG_STATUS) {
      expect(producer, `ce-debug must still emit '${status}'`).toContain(status)
      expect(consumer, `babysit must still branch on '${status}'`).toContain(status)
    }
    // The ban babysit states must remain true of the producer, or the warning is stale.
    expect(producer).not.toContain("infra-retry")
    expect(consumer).toContain("do not invent `infra-retry`")
  })

  test("pr-snapshot emits exactly the canonical trajectory field set", async () => {
    const keys = emittedTrajectoryKeys(await readRepoFile(PR_SNAPSHOT))
    expect(keys.sort()).toEqual([...TRAJECTORY_FIELDS].sort())
  })

  test("the delegated-mutation exclusion boundary is stated at all three ends of the chain", async () => {
    // Babysit passes a bounded target-fixer scope whose exclusions
    // (never rebase/force-push/merge/approve) the delegates must honor. Babysit may separately own
    // a confirmed manager's post-push transaction; that exception must never leak into a child.
    // 'rebase' and 'force-push' are specific enough to canary the exclusion block; 'merge' is not
    // (merge-ready / merge conflict are ordinary prose here).
    const [babysit, cedebug, ceresolve] = await Promise.all([
      readRepoFile(BABYSIT),
      readRepoFile(CEDEBUG_PIPELINE),
      readRepoFile(CERESOLVE),
    ])
    for (const [name, text] of [["babysit", babysit], ["ce-debug", cedebug], ["ce-resolve", ceresolve]] as const) {
      expect(text, `${name} must state the 'rebase' exclusion`).toContain("rebase")
      expect(text, `${name} must state the 'force-push' exclusion`).toContain("force-push")
    }
  })

  test("every trajectory field cited in consumer prose is one pr-snapshot actually emits", async () => {
    const script = await readRepoFile(PR_SNAPSHOT)
    const emitted = new Set(emittedTrajectoryKeys(script))
    const [babysit, ceresolve] = await Promise.all([readRepoFile(BABYSIT), readRepoFile(CERESOLVE)])
    for (const field of BABYSIT_TRAJECTORY_REFS) {
      expect(emitted.has(field), `babysit cites '${field}' but pr-snapshot no longer emits it`).toBe(true)
      expect(babysit).toContain(field)
    }
    for (const field of CERESOLVE_TRAJECTORY_REFS) {
      expect(emitted.has(field), `ce-resolve cites '${field}' but pr-snapshot no longer emits it`).toBe(true)
      expect(ceresolve).toContain(field)
    }
  })

  test("babysit's default mode is a self-sustaining in-session watch backed by pr-snapshot watch", async () => {
    // The self-initiation contract: babysit does NOT do one tick and hand back a resume command by
    // default; it backgrounds the token-free change-detector and stays in-session, woken by a sentinel.
    const [babysit, script] = await Promise.all([readRepoFile(BABYSIT), readRepoFile(PR_SNAPSHOT)])
    expect(babysit, "must describe the self-sustaining in-session watch").toMatch(/self-sustaining[, ]+in-session watch/i)
    expect(babysit, "must invoke the pr-snapshot watch detector").toContain("pr-snapshot watch")
    expect(babysit, "must wait on the BABYSIT_WAKE sentinel").toContain("BABYSIT_WAKE")
    // producer side: the watch subcommand emits the sentinel and can wake on each precedence reason
    expect(script).toContain("def cmd_watch")
    expect(script).toContain("BABYSIT_WAKE")
    for (const reason of ["terminal", "blocked-external", "actionable", "feedback-candidate", "stack-blocked", "needs-human", "merge-ready", "invocation-superseded"]) {
      expect(script, `watch must be able to wake on '${reason}'`).toContain(reason)
    }
  })

  test("watch ownership is latest-valid-wins and stale wake generations are coalesced", async () => {
    const [babysit, watchLoop, script] = await Promise.all([
      readRepoFile(BABYSIT),
      readRepoFile("skills/ce-babysit-pr/references/watch-loop.md"),
      readRepoFile(PR_SNAPSHOT),
    ])
    for (const text of [babysit, watchLoop]) {
      expect(text).toContain("watch_generation")
      expect(text).toMatch(/successful[^.]{0,100}(fetch|snapshot)[^.]{0,160}supersed/i)
      expect(text).toMatch(/newer invocation[^.]{0,160}(cancel|stop)[^.]{0,160}(preflight|first fetch)/i)
      expect(text).toMatch(/stale[^.]{0,120}wake[^.]{0,160}(coalesc|ignore|discard)/i)
      expect(text).toMatch(/invocation-superseded[^.]{0,180}(end|stop)[^.]{0,120}(old )?(loop|watch)/i)
    }
    expect(script).toContain('"watch_generation"')
    expect(script).toContain("_reserve_watch_candidate")
    expect(script).toContain("_terminate_replaced_watch")
  })

  test("the paginated snapshot is canonical for review-thread state", async () => {
    const babysit = await readRepoFile(BABYSIT)
    expect(babysit).toMatch(/fresh `snapshot`[^.]{0,160}(canonical|source of truth)/i)
    expect(babysit).toContain("`hasNextPage == false`")
  })

  test("babysit reconciles every passed comment so the loop can settle (never-settle fix)", async () => {
    // Regression guard: marking only the comments ce-resolve explicitly 'handled' left its
    // silently-dropped bot wrappers actionable forever, so counts.comments never reached 0.
    const babysit = await readRepoFile(BABYSIT)
    expect(babysit).toMatch(/silently drop/i)
    expect(babysit, "must mark every passed comment, not only the handled ones").toMatch(/mark \*?every\*? comment you passed/i)
    expect(babysit).toContain("never settle")
  })

  test("ce-resolve routes a whole-PR URL to full mode, a comment-fragment URL to targeted", async () => {
    // babysit hands ce-resolve the fork->upstream PR URL; a bare /pull/N must run full mode against
    // the parsed host/repo, while a comment-fragment URL stays targeted.
    const ceresolve = await readRepoFile(CERESOLVE)
    expect(ceresolve).toContain("PR URL")
    expect(ceresolve).toContain("no comment fragment")
    expect(ceresolve).toMatch(/#discussion_r|#issuecomment/)
  })

  test("ce-resolve passes the GHE host inline on every bundled-script call, not via one export", async () => {
    // A single `export GH_HOST` does not survive between separate Bash tool calls, so each script
    // call carries the host inline; on GHE, dropping it silently queries github.com.
    const fullMode = await readRepoFile(CERESOLVE_FULL_MODE)
    const prefixCount = (fullMode.match(/GH_HOST=<derived-host>/g) || []).length
    expect(prefixCount, "each bundled-script call needs its own inline GH_HOST prefix").toBeGreaterThanOrEqual(4)
    expect(fullMode, "must state that a single export does not carry between Bash calls").toContain("does **not** carry")
  })

  test("babysit's final merge-ready checkpoint self-refreshes a stale PR description via ce-commit-push-pr", async () => {
    // Incremental commits during a watch leave the PR description stale; babysit must reflect on
    // that before declaring merge-ready and route a stale one to ce-commit-push-pr's description
    // update — autonomously, as an owned/pre-authorized mutation, not a user prompt.
    const babysit = await readRepoFile(BABYSIT)
    expect(babysit).toContain("PR-description freshness")
    expect(babysit).toContain("description-update mode")
    expect(babysit).toContain("ce-commit-push-pr")
    expect(babysit, "description refresh must be in the owned mutation envelope").toMatch(/refresh(es|ing) (the |a )PR description/)
  })

  test("settle policy: the normal watch arm omits --settle-seconds; the script owns the 300s default", async () => {
    // Regression guard (PR #1126 watch): stating "use ~600s whenever review bots are present" in the
    // looks-ready gate made agents pre-widen the initial arm, so a finished review sat unrecognized
    // until the longer window elapsed. The initial arm must always ride the script default.
    const [babysit, script] = await Promise.all([readRepoFile(BABYSIT), readRepoFile(PR_SNAPSHOT)])
    const watchCommands = [...babysit.matchAll(/^.*pr-snapshot" watch.*$/gm)].map((m) => m[0])
    expect(watchCommands.length, "the watch invocation must still be shown").toBeGreaterThanOrEqual(1)
    for (const cmd of watchCommands) {
      expect(cmd, "the normal watch invocation must not set --settle-seconds").not.toContain("--settle-seconds")
    }
    expect(script, "the script must own the 300s settle default").toMatch(/--settle-seconds"[^)]*default=300/s)
    // No prose may reintroduce the bots-present pre-widening rule the wake protocol replaced.
    expect(babysit).not.toMatch(/whenever the repo uses review bots/i)
  })

  test("settle policy: an incomplete review lifecycle gets a 15-minute floor and 30-minute ceiling", async () => {
    const [babysit, script] = await Promise.all([readRepoFile(BABYSIT), readRepoFile(PR_SNAPSHOT)])
    expect(babysit).toContain("incomplete review lifecycle")
    expect(babysit).toContain("15 minutes")
    expect(babysit).toContain("30 minutes")
    expect(babysit).toMatch(/trajectory.*extend/i)
    expect(babysit).toMatch(/never.*shorten/i)
    expect(babysit).toMatch(/must not re-arm.*same unchanged signal/i)
    expect(babysit).toMatch(/unattributed lifecycle incomplete/i)
    expect(babysit).toMatch(/reviewer when identifiable.*observed signal/i)
    expect(babysit).toMatch(/only uncleared condition.*incomplete lifecycle.*15 quiet minutes.*30-minute terminal ceiling/i)
    expect(script).toContain("review_signal_seen_on_head")
    // A done signal on the current head must end the wait, not start another settle period.
    expect(babysit).toContain("never extends the wait")
    expect(babysit).toContain("no further settle period")
  })

  test("watcher silence is defined as no-information, with a fresh snapshot for mid-watch status asks", async () => {
    // Regression guard: an agent narrated detector silence as "review still active"; silence only
    // means no wake condition has fired.
    const babysit = await readRepoFile(BABYSIT)
    expect(babysit).toContain("Watcher silence carries no PR-state information")
    expect(babysit, "a mid-watch status ask must be answered from a fresh snapshot").toMatch(
      /asks for status before a wake.*fresh `snapshot`/s,
    )
  })

  test("live updates report PR state without leaking routine watcher mechanics", async () => {
    // Regression guard: progress narration led with a wake race and re-arm details instead of the
    // user-relevant outcome (feedback already addressed; CI still running).
    const babysit = await readRepoFile(BABYSIT)
    expect(babysit).toContain("PR state first in live updates")
    expect(babysit).toMatch(/wake, snapshot, re-arm, or head as internal implementation detail/)
    expect(babysit).toMatch(/only when they explain a failure or required user action/)
  })

  test("authority boundary: babysit never merges; readiness is reported as the user's call", async () => {
    const babysit = await readRepoFile(BABYSIT)
    expect(babysit).toMatch(/\*\*never\*\* merges the PR/i)
    expect(babysit).toContain("looks ready — your call")
    expect(babysit).toMatch(/never .safe to merge./)
    expect(babysit).toMatch(/merge-readiness[^.]{0,120}never[^.]{0,80}merge authorization/i)
  })

  test("stack-aware routing is automatic, CLI-first, and never uses checkout as a probe", async () => {
    const [babysit, watchLoop, script] = await Promise.all([
      readRepoFile(BABYSIT),
      readRepoFile("skills/ce-babysit-pr/references/watch-loop.md"),
      readRepoFile(PR_SNAPSHOT),
    ])
    expect(script).toContain('"gh", "stack", "view", "--json"')
    expect(script).toContain("fetch_pr_chain")
    expect(script).toContain("manager_status")
    for (const status of ["confirmed", "absent", "probe-error"]) {
      expect(script, `pr-snapshot must preserve manager status '${status}'`).toContain(status)
    }
    expect(babysit).toMatch(/automatically classify.*PR chain/i)
    expect(babysit).toContain("gh stack view --json")
    expect(babysit).toMatch(/GraphQL fallback/i)
    expect(babysit).toMatch(/stack-field schema-unavailable[\s\S]{0,100}.absent./i)
    expect(babysit).toMatch(/separate read-only lookup[\s\S]{0,100}default branch/i)
    expect(babysit).toMatch(/auth, transport, rate-limit, malformed[\s\S]{0,100}.probe-error./i)
    expect(babysit).toContain("Discovery never runs `gh stack checkout`")
    expect(babysit).not.toMatch(/gh stack checkout\s+<[^>]+>/)
    expect(watchLoop).not.toMatch(/gh stack checkout\s+<[^>]+>/)
  })

  test("managed and manual dependency chains have distinct currency and readiness contracts", async () => {
    const babysit = await readRepoFile(BABYSIT)
    expect(babysit).toMatch(/managed stack[\s\S]{0,1200}do not run `gh pr update-branch`/i)
    expect(babysit).toMatch(/ready as the next PR in the stack/i)
    expect(babysit).toMatch(/manual dependency chain/i)
    expect(babysit).toMatch(/relative to (its|the) parent/i)
    expect(babysit).toMatch(/do not redirect/i)
    expect(babysit).toMatch(/upstack.*residual/i)
  })

  test("a target push in a confirmed managed stack is followed by transactional upstack maintenance", async () => {
    const [babysit, watchLoop] = await Promise.all([
      readRepoFile(BABYSIT),
      readRepoFile("skills/ce-babysit-pr/references/watch-loop.md"),
    ])

    for (const text of [babysit, watchLoop]) {
      expect(text).toContain("gh stack rebase <first-dependent-branch> --upstack --no-trunk")
      expect(text).toContain("gh stack push")
      expect(text).toContain("--force-with-lease --atomic")
      expect(text).toMatch(/gh stack rebase --abort[\s\S]{0,300}(residual|needs-human)/i)
      expect(text).toMatch(/manual dependency[\s\S]{0,500}(never|do not)[\s\S]{0,120}(rebase|rewrite|restack)/i)
      expect(text).toMatch(/target[^.]{0,160}(local|head)[^.]{0,160}(pushed SHA|unchanged)/i)
    }
    expect(babysit).toMatch(/after (an|any) authorized target-head push[\s\S]{0,1600}gh stack rebase <first-dependent-branch> --upstack --no-trunk/i)
    expect(babysit).toMatch(/manager-owned[\s\S]{0,200}(implicit|babysit)[\s\S]{0,200}author/i)
  })

  test("sequential babysitting is a confirmed-managed-stack-only, one-watcher scope", async () => {
    const [babysit, watchLoop] = await Promise.all([
      readRepoFile(BABYSIT),
      readRepoFile("skills/ce-babysit-pr/references/watch-loop.md"),
    ])

    expect(babysit).toMatch(/only when[^.]{0,180}`manager_status == "confirmed"`[^.]{0,180}stack-wide continuation/i)
    expect(babysit).toMatch(/repository-level stack availability[^.]{0,180}not a managed stack/i)
    expect(babysit).toMatch(/requested PR[^.]{0,180}(looks ready|settled)[^.]{0,220}offer once[^.]{0,220}upstack/i)
    expect(babysit).toMatch(/accepted[^.]{0,220}(without asking again|do not ask again)[^.]{0,220}(draft|end of the stack)/i)
    expect(babysit).toMatch(/manual dependency chain[^.]{0,240}(never|must not)[^.]{0,120}stack-wide continuation/i)
    expect(babysit).toMatch(/unsettled downstack[^.]{0,260}offer once[^.]{0,260}lowest unsettled/i)
    expect(babysit).toMatch(/draft[^.]{0,180}(only|unless)[^.]{0,180}explicit/i)
    expect(babysit).toMatch(/one active (PR )?(target|watcher)/i)
    expect(watchLoop).toMatch(/one active (PR )?(target|watcher)/i)
  })

  test("managed-stack continuation preserves one fixed invocation budget", async () => {
    const [babysit, watchLoop] = await Promise.all([
      readRepoFile(BABYSIT),
      readRepoFile("skills/ce-babysit-pr/references/watch-loop.md"),
    ])

    for (const text of [babysit, watchLoop]) {
      expect(text).toContain("--invocation-id \"$RUN_INVOCATION_ID\"")
      expect(text).toContain("--session-started-at \"$RUN_STARTED_AT\"")
      expect(text).toContain("--invocation-budget-seconds \"$RUN_BUDGET_SECONDS\"")
      expect(text).toMatch(/(one|same|fixed)[^.]{0,220}(invocation )?budget/i)
      expect(text).toMatch(/(layer|state dir)[^.]{0,260}(same|fixed|continue-invocation)[^.]{0,180}(invocation|budget)/i)
    }
  })

  test("mark writes are fenced by the active invocation tuple", async () => {
    const [babysit, watchLoop, script] = await Promise.all([
      readRepoFile(BABYSIT),
      readRepoFile("skills/ce-babysit-pr/references/watch-loop.md"),
      readRepoFile(PR_SNAPSHOT),
    ])
    for (const text of [babysit, watchLoop]) {
      expect(text).toMatch(/mark[\s\S]{0,500}(invocation ID|RUN_INVOCATION_ID)[\s\S]{0,500}(start anchor|RUN_STARTED_AT)[\s\S]{0,500}(budget|RUN_BUDGET_SECONDS)/i)
    }
    expect(script).toMatch(/m\.add_argument\("--invocation-id", required=True/)
    expect(script).toMatch(/def cmd_mark\(args\):[\s\S]{0,180}_apply_invocation\(box, args, now\)/)
  })

  test("blocked approval watching stays inside the invocation budget", async () => {
    const babysit = await readRepoFile(BABYSIT)
    expect(babysit).toContain("within this invocation's remaining fixed budget")
    expect(babysit).toContain("never promise or mint a longer approval-watch window after invocation entry")
    expect(babysit).not.toContain("hard-capped at 24h")
  })

  test("deadline precedence preserves stop results without starting another work round", async () => {
    const [babysit, watchLoop] = await Promise.all([
      readRepoFile(BABYSIT),
      readRepoFile("skills/ce-babysit-pr/references/watch-loop.md"),
    ])
    for (const text of [babysit, watchLoop]) {
      expect(text).toMatch(/deadline[\s\S]{0,300}terminal[\s\S]{0,200}merge-ready[\s\S]{0,300}max-runtime/i)
    }
  })

  test("pipeline success requires clean chain currency in both loaded contracts", async () => {
    const [babysit, watchLoop] = await Promise.all([
      readRepoFile(BABYSIT),
      readRepoFile("skills/ce-babysit-pr/references/watch-loop.md"),
    ])

    for (const text of [babysit, watchLoop]) {
      expect(text).toMatch(/success only when[^.]{0,260}`all_checks_ok`[^.]{0,260}`stack_blocker`[^.]{0,80}(null|clear)/i)
    }
  })

  test("bounded-class sweep contract: babysit routes it, ce-resolve classifies/enumerates/bounds it", async () => {
    // A correct finding recurring across sibling sites must be swept as one class, not dripped
    // one-per-head. The split is protocol: babysit only recognizes + routes ("request a
    // bounded-class assessment"); ce-resolve owns whether the sites are equivalent, the enumerated
    // locations, and the fixer's mutation boundary. Dropping either side silently reverts to
    // one-site-per-round (babysit routes a request nothing fulfills, or the resolver never sweeps).
    const [babysit, watchLoop, fullMode, rubric, fixer] = await Promise.all([
      readRepoFile(BABYSIT),
      readRepoFile("skills/ce-babysit-pr/references/watch-loop.md"),
      readRepoFile(CERESOLVE_FULL_MODE),
      readRepoFile("skills/ce-resolve-pr-feedback/references/evaluation-rubric.md"),
      readRepoFile("skills/ce-resolve-pr-feedback/references/agents/pr-comment-resolver.md"),
    ])
    // Babysit side: recognizes + routes, does not decide/execute the sweep.
    expect(babysit, "babysit Step 2 must request the assessment inline").toMatch(/bounded-class assessment/i)
    expect(watchLoop).toMatch(/bounded-class assessment/i)
    // Resolver side: owns classification, enumeration, and the fixer's enumerated mutation boundary.
    expect(rubric).toContain("A validated finding can span sites this PR itself introduced")
    expect(fullMode).toMatch(/Class fix:/)
    expect(fixer, "class-fix mutation boundary must reach the fixer prompt").toMatch(/enumerated set is the mutation boundary/i)
  })
})
