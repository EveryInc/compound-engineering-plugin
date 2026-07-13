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
    // babysit passes a bounded scope whose exclusions (never rebase/force-push/merge/approve) the
    // delegates must honor. If either child drops the boundary, babysit's contract is one-sided.
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
    for (const reason of ["terminal", "blocked-external", "actionable", "needs-human", "merge-ready"]) {
      expect(script, `watch must be able to wake on '${reason}'`).toContain(reason)
    }
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

  test("settle policy: ~600s exists only as the re-arm after a rejected merge-ready wake", async () => {
    const babysit = await readRepoFile(BABYSIT)
    // Every 600s mention must live inside the wake protocol's rejection branch.
    const paragraphs = babysit.split("\n\n").filter((p) => p.includes("600"))
    expect(paragraphs.length, "the generous settle must be documented exactly once").toBe(1)
    expect(paragraphs[0]).toMatch(/reject the wake/i)
    expect(paragraphs[0], "600s must be framed as the post-rejection re-arm").toMatch(/re-arm/i)
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

  test("authority boundary: babysit never merges; readiness is reported as the user's call", async () => {
    const babysit = await readRepoFile(BABYSIT)
    expect(babysit).toMatch(/\*\*never\*\* merges the PR/i)
    expect(babysit).toContain("looks ready — your call")
    expect(babysit).toMatch(/never .safe to merge./)
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
