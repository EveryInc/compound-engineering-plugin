import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test"
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { cleanup, HANDS_OFF, ME, World } from "../helpers/afg-world"

setDefaultTimeout(60_000)
afterAll(cleanup)

describe("own work", () => {
  function own(w: World, motion: string, origin?: string, files: Record<string, string> = { "app.rb": "two\n" }) {
    w.begin()
    const job = w.run(["job", "--token", w.token, "--motion", motion, "--what", "x", "--opens-pr", ...(origin ? ["--origin", origin] : [])]).json.job
    const head = w.pr(7, files, { login: ME })
    expect(w.run(["adopt", "--token", w.token, "--job", job, "--pr", "7", "--head", head]).code).toBe(0)
    w.receipts(7, head)
    return head
  }

  test("an unrecorded PR by the same account is not its own work", () => {
    const w = new World()
    w.pr(7, { "app.rb": "two\n" }, { login: ME })
    expect(w.gate().reasons).toContain("author-not-trusted")
  })

  test("a forged record for someone else's PR does not count", () => {
    const w = new World().begin()
    const job = w.run(["job", "--token", w.token, "--motion", "stack", "--what", "x"]).json.job
    const head = w.pr(7, { "app.rb": "two\n" }, { login: "stranger" })
    const file = path.join(w.repo, ".context/compound-engineering/afg/ledger.jsonl")
    writeFileSync(file, readFileSync(file, "utf8") + JSON.stringify({ event: "adopt", at: "2026-01-01T00:00:00Z", pr: 7, job, head }) + "\n")
    expect(w.gate().reasons).toContain("author-not-trusted")
  })

  test.each([[ME, undefined], ["stranger", "origin-not-trusted"]])("a bug asked for by %s", (login, reason) => {
    const w = new World()
    w.w.issues["3"] = { number: 3, user: { login }, state: "open" }
    w.save()
    own(w, "bugs", "issue:3")
    expect(w.gate().reasons ?? []).toEqual(reason ? [reason] : [])
  })

  test("a stranger's comment on a trusted issue also counts as an origin", () => {
    const w = new World()
    w.w.issues["3"] = { number: 3, user: { login: ME }, state: "open" }
    w.w.comments = { 3: [{ user: { login: "stranger" } }] }
    w.save()
    own(w, "bugs", "issue:3")
    expect(w.gate().reasons).toEqual(["origin-not-trusted"])
  })

  test("a red-main repair lands only when it fixes every failing check", () => {
    const w = new World()
    const tip = w.git(w.repo, "rev-parse", "origin/main")
    w.fail(tip)
    own(w, "main-red")
    expect(w.gate().allowed).toBe(true)
    w.fail(tip, "other-check")
    expect(w.gate().reasons).toContain("main-not-green")
  })

  test("a push after the recorded head is not the recorded work", () => {
    const w = new World()
    own(w, "stack")
    w.git(w.repo, "branch", "-D", "pr7")
    w.git(w.repo, "push", "-q", "origin", ":refs/pull/7/head", ":refs/heads/pr7")
    w.pr(7, { "app.rb": "three\n" }, { login: ME })
    expect(w.gate().reasons).toContain("author-not-trusted")
    expect(w.run(["observe"]).json.prs[0].handling).toBe("own-moved")
  })

  test("an own PR never becomes trusted by listing the running account", () => {
    const w = new World(HANDS_OFF + "  - maintainer\n")
    w.pr(7, { "app.rb": "two\n" }, { login: ME })
    expect(w.gate().reasons).toContain("author-not-trusted")
  })

  test("another person's commit on an own PR cannot be recorded", () => {
    const w = new World().begin()
    const job = w.run(["job", "--token", w.token, "--motion", "stack", "--what", "x"]).json.job
    const head = w.pr(7, { "app.rb": "two\n" }, { login: ME }, { })
    w.w.prs[7].api_commits[0].author.login = "stranger"
    w.save()
    const adopt = (h: string) => w.run(["adopt", "--token", w.token, "--job", job, "--pr", "7", "--head", h]).json.reasons
    expect(adopt(head)).toEqual(["commit-not-attributed"])
    expect(adopt("a".repeat(40))).toEqual(["head-moved"])
  })

  test("recording a PR again under an internal job keeps its untrusted origin", () => {
    const w = new World()
    w.w.issues["3"] = { number: 3, user: { login: "stranger" }, state: "open" }
    w.save()
    const head = own(w, "bugs", "issue:3")
    const job = w.run(["job", "--token", w.token, "--motion", "stack", "--what", "x"]).json.job
    w.run(["adopt", "--token", w.token, "--job", job, "--pr", "7", "--head", head])
    expect(w.gate().reasons).toEqual(["origin-not-trusted"])
  })

  test.each(["api_comments", "api_reviews"])("a stranger's %s after the work began caps it", (what) => {
    const w = new World()
    own(w, "stack")
    expect(w.gate().allowed).toBe(true)
    w.w.prs[7][what] = [{ user: { login: "stranger" } }]
    w.save()
    expect(w.gate().reasons).toEqual(["origin-not-trusted"])
  })

  test("outside reports are never internal", () => {
    const w = new World().begin()
    const job = (o: string) => w.run(["job", "--token", w.token, "--motion", "bugs", "--what", "x", "--origin", o]).json
    expect(job("internal").reasons).toEqual(["origin-missing"])
    expect(job("external").origin_trusted).toBe(false)
  })

  test("a repair must also turn the failed workflow green", () => {
    const w = new World()
    const tip = w.git(w.repo, "rev-parse", "origin/main")
    w.fail(tip)
    const head = own(w, "main-red")
    const flow = (conclusion: string) => [{ name: "CI", event: "push", status: "completed", conclusion }]
    w.w.flows = { [tip]: flow("failure") }
    w.save()
    expect(w.gate().reasons).toEqual(["main-not-green"])
    w.w.flows[head] = flow("success")
    w.save()
    expect(w.gate().allowed).toBe(true)
  })

  test("a skipped check does not count as repaired", () => {
    const w = new World()
    w.fail(w.git(w.repo, "rev-parse", "origin/main"))
    const head = own(w, "main-red")
    w.w.checks[head] = [{ name: "ci", status: "completed", conclusion: "skipped" }, { name: "x", status: "completed", conclusion: "success" }]
    w.save()
    expect(w.gate().reasons).toContain("main-not-green")
  })

  test("a person's merge of recorded work is a clean landing, and a closed PR is not", () => {
    const w = new World(HANDS_OFF.replace("hands-off", "balanced"))
    const head = own(w, "stack")
    w.run(["end", "--token", w.token])
    w.git(w.repo, "push", "-q", "origin", `${head}:main`)
    Object.assign(w.w.prs[7], { state: "MERGED", mergeCommit: { oid: head } })
    w.save()
    w.begin()
    expect(w.run(["digest"]).json.land).toMatchObject([{ pr: 7, motion: "stack", by: "person" }])
  })

  test("a squashed revert that names the PR resets earning", () => {
    const w = new World(HANDS_OFF.replace("hands-off", "balanced")).begin()
    const file = path.join(w.repo, ".context/compound-engineering/afg/ledger.jsonl")
    writeFileSync(file, [1, 2, 3, 4, 5].map((i) =>
      JSON.stringify({ event: "land", at: "2026-01-01T00:00:00Z", motion: "stack", pr: i, merge_sha: `${i}`.repeat(40) })).join("\n") + "\n")
    expect(w.run(["policy"]).json.levels.stack).toBe("merge")
    w.git(w.repo, "commit", "-q", "--allow-empty", "-m", "Revert it\n\nReverts o/r#3")
    w.git(w.repo, "push", "-q", "origin", "main")
    expect(w.run(["policy"]).json.levels.stack).toBe("babysit")
  })

  test("an unreadable PR at the start of a run does not hold the lease", () => {
    const w = new World()
    own(w, "stack")
    w.run(["end", "--token", w.token])
    w.w.view_fails = true
    w.save()
    expect(w.run(["begin"]).json.token).toBeTruthy()
  })

  test("reverting an older landing resets earning", () => {
    const w = new World(HANDS_OFF.replace("hands-off", "balanced")).begin()
    const file = path.join(w.repo, ".context/compound-engineering/afg/ledger.jsonl")
    writeFileSync(file, [1, 2, 3, 4, 5, 6].map((i) =>
      JSON.stringify({ event: "land", at: "2026-01-01T00:00:00Z", motion: "stack", merge_sha: `${i}`.repeat(40) })).join("\n") + "\n")
    expect(w.run(["policy"]).json.levels.stack).toBe("merge")
    w.git(w.repo, "commit", "-q", "--allow-empty", "-m", `Revert\n\nThis reverts commit ${"1".repeat(40)}.`)
    w.git(w.repo, "push", "-q", "origin", "main")
    expect(w.run(["policy"]).json.levels.stack).toBe("babysit")
  })

  test("a damaged ledger denies instead of forgetting", () => {
    const w = new World()
    w.ready()
    const file = path.join(w.repo, ".context/compound-engineering/afg/ledger.jsonl")
    writeFileSync(file, readFileSync(file, "utf8") + "{\n")
    expect(w.run(["gate", "--pr", "7"]).code).toBe(3)
  })

  test("work started under another motion is not a red-main repair", () => {
    const w = new World()
    own(w, "stack")
    w.fail(w.git(w.repo, "rev-parse", "origin/main"))
    expect(w.gate().reasons).toEqual(["main-not-green"])
  })

  test("five clean landings raise a motion to its ceiling and a revert resets it", () => {
    const w = new World(HANDS_OFF.replace("hands-off", "balanced"))
    w.begin()
    const file = path.join(w.repo, ".context/compound-engineering/afg/ledger.jsonl")
    const land = (i: number) => JSON.stringify({ event: "land", at: "2026-01-01T00:00:00Z", motion: "stack", merge_sha: `${i}`.repeat(40) })
    writeFileSync(file, [1, 2, 3, 4].map(land).join("\n") + "\n")
    expect(w.run(["policy"]).json.levels.stack).toBe("babysit")
    writeFileSync(file, [1, 2, 3, 4, 5].map(land).join("\n") + "\n")
    expect(w.run(["policy"]).json.levels).toMatchObject({ stack: "merge", bugs: "babysit" })
    w.git(w.repo, "commit", "-q", "--allow-empty", "-m", `Revert\n\nThis reverts commit ${"5".repeat(40)}.`)
    w.git(w.repo, "push", "-q", "origin", "main")
    expect(w.run(["policy"]).json.levels.stack).toBe("babysit")
  })
})

describe("direct landing", () => {
  function direct(w: World, motion = "stack") {
    w.begin()
    const job = w.run(["job", "--token", w.token, "--motion", motion, "--what", "x"]).json.job
    w.git(w.repo, "checkout", "-q", "-b", "work", "origin/main")
    w.write("app.rb", "two\n")
    const sha = w.commit("work", ["app.rb"])
    w.run(["adopt", "--token", w.token, "--job", job, "--sha", sha])
    w.run(["test", "--token", w.token, "--sha", sha])
    w.run(["review", "--token", w.token, "--sha", sha], w.reviewJson(sha))
    return { sha, job, go: () => w.run(["direct", "--token", w.token, "--sha", sha, "--job", job]) }
  }

  test("is off by default", () => {
    expect(direct(new World()).go().json.reasons).toEqual(["direct-off"])
  })

  test("fast-forwards the exact tested commit when enabled", () => {
    const w = new World(HANDS_OFF + "autonomous_landing: direct\nautonomous_ci: ignored\n")
    const d = direct(w)
    expect(d.go().json.landed).toBe(d.sha)
    expect(w.git(path.join(w.root, "origin.git"), "rev-parse", "main")).toBe(d.sha)
  })

  test("never runs or lands a commit this account did not record", () => {
    const w = new World(HANDS_OFF + "autonomous_landing: direct\nautonomous_ci: ignored\n").begin()
    const head = w.pr(8, { "app.rb": "evil\n" }, { login: "stranger" })
    w.w.published = [head]
    w.save()
    const job = w.run(["job", "--token", w.token, "--motion", "stack", "--what", "x"]).json.job
    expect(w.run(["test", "--token", w.token, "--sha", head]).json.reasons).toEqual(["author-not-trusted"])
    expect(w.run(["adopt", "--token", w.token, "--job", job, "--sha", head]).json.reasons).toEqual(["author-not-trusted"])
    expect(w.run(["direct", "--token", w.token, "--sha", head, "--job", job]).json.reasons).toEqual(["author-not-trusted"])
  })

  test("a tested commit lands on a main whose hosted checks are red, and an untested one does not", () => {
    const w = new World(HANDS_OFF + "autonomous_landing: direct\nautonomous_ci: ignored\n")
    const d = direct(w)
    w.fail(w.git(w.repo, "rev-parse", "origin/main"))
    expect(d.go().json.landed).toBe(d.sha)
    const u = new World(HANDS_OFF.replace("run: true", "run: false") + "autonomous_landing: direct\nautonomous_ci: ignored\n")
    expect(direct(u).go().json.reasons).toEqual(["test-failed"])
  })

  test("a commit GitHub already knows, or cannot answer for, is not this account's work", () => {
    const w = new World(HANDS_OFF + "autonomous_landing: direct\nautonomous_ci: ignored\n")
    const d = direct(w)
    w.w.published = [d.sha]
    w.save()
    expect(d.go().json.reasons).toEqual(["author-not-trusted"])
    w.w.published = []
    w.w.commit_error = "HTTP 500"
    w.save()
    expect(d.go().json.reasons).toEqual(["author-not-trusted"])
  })

  test("a commit stays with its first job, and a job lands once", () => {
    const w = new World(HANDS_OFF + "autonomous_landing: direct\nautonomous_ci: ignored\n")
    const d = direct(w)
    const other = w.run(["job", "--token", w.token, "--motion", "stack", "--what", "y"]).json.job
    expect(w.run(["adopt", "--token", w.token, "--job", other, "--sha", d.sha]).json.reasons).toEqual(["commit-already-used"])
    expect(d.go().json.landed).toBe(d.sha)
    w.write("app.rb", "four\n")
    const next = w.commit("next", ["app.rb"])
    expect(w.run(["adopt", "--token", w.token, "--job", d.job, "--sha", next]).json.reasons).toEqual(["job-already-used"])
  })

  test("a red-main repair lands directly on its own test when CI is required", () => {
    const w = new World(HANDS_OFF + "autonomous_landing: direct\n")
    w.fail(w.git(w.repo, "rev-parse", "origin/main"))
    expect(direct(w, "main-red").go().json.landed).toBeTruthy()
  })

  test("a repository that stops landing directly can still open PR jobs", () => {
    const w = new World(HANDS_OFF + "autonomous_landing: direct\nautonomous_ci: ignored\n")
    direct(w)
    expect(w.run(["job", "--token", w.token, "--motion", "stack", "--what", "x", "--opens-pr"]).code).toBe(0)
  })

  test("CI still gates a direct landing when settings require it", () => {
    const w = new World(HANDS_OFF + "autonomous_landing: direct\n")
    const d = direct(w)
    w.fail(w.git(w.repo, "rev-parse", "origin/main"))
    expect(d.go().json.reasons).toEqual(["main-not-green"])
  })

  test("more than one commit does not land directly", () => {
    const w = new World(HANDS_OFF + "autonomous_landing: direct\nautonomous_ci: ignored\n")
    const d = direct(w)
    w.write("app.rb", "three\n")
    const sha = w.commit("more", ["app.rb"])
    const job = w.run(["job", "--token", w.token, "--motion", "stack", "--what", "x"]).json.job
    w.run(["adopt", "--token", w.token, "--job", job, "--sha", sha])
    expect(d.sha).not.toBe(sha)
    expect(w.run(["direct", "--token", w.token, "--sha", sha, "--job", job]).json.reasons).toContain("not-one-commit")
  })

  test("a tip that moved since the test voids it", () => {
    const w = new World(HANDS_OFF + "autonomous_landing: direct\nautonomous_ci: ignored\n")
    const d = direct(w)
    w.git(w.repo, "checkout", "-q", "main")
    w.write("other.rb", "x\n")
    w.commit("base", ["other.rb"])
    w.git(w.repo, "push", "-q", "origin", "main")
    expect(d.go().json.landed).toBeUndefined()
  })

  test("a repository that lands directly merges no PR", () => {
    const w = new World(HANDS_OFF + "autonomous_landing: direct\nautonomous_ci: ignored\n")
    w.ready()
    expect(w.gate().reasons).toEqual(["lands-directly"])
  })

  test.each([
    ["protected", { protected: true }],
    ["ruled", { rules: [{ type: "pull_request" }] }],
    ["unreadable", { rules_error: "HTTP 500" }],
  ])("is refused when the branch is %s", (_n, over) => {
    const w = new World(HANDS_OFF + "autonomous_landing: direct\nautonomous_ci: ignored\n")
    const d = direct(w)
    Object.assign(w.w, over)
    w.save()
    expect(d.go().json.reasons).toEqual(["default-branch-protected"])
  })
})

describe("closing", () => {
  const comment = "Fixed on main by the linked change, so closing."
  function issue(w: World) {
    w.w.issues["9"] = { number: 9, user: { login: "stranger" }, state: "open", updated_at: "t" }
    w.save()
    w.begin()
    return (as: string, evidence: string, text = comment, ...more: string[]) =>
      w.run(["close", "--token", w.token, "--kind", "issue", "--number", "9", "--as", as, "--evidence", evidence, "--comment", text, ...more])
  }

  test("closes as fixed by a commit on main, with a comment", () => {
    const w = new World()
    const close = issue(w)
    const ev = `commit:${w.git(w.repo, "rev-parse", "origin/main")}`
    expect(close("fixed", ev, comment, "--dry-run").json.would_close).toBe("issue:9")
    expect(w.writes()).toEqual([])
    expect(close("fixed", ev).json.closed).toBe("issue:9")
    expect(w.writes().map((c) => c[1])).toEqual(["close", "comment"])
  })

  test("an item that stays open is neither recorded nor commented on", () => {
    const w = new World()
    const close = issue(w)
    w.w.close_ignored = true
    w.save()
    expect(close("fixed", `commit:${w.git(w.repo, "rev-parse", "origin/main")}`).json.reasons).toEqual(["not-confirmed-closed"])
    expect(w.run(["digest"]).json.close).toEqual([])
    expect(w.writes().map((c) => c[1])).toEqual(["close"])
  })

  test("refuses unproven evidence and a missing comment", () => {
    const w = new World()
    const close = issue(w)
    w.pr(7, { "app.rb": "two\n" })
    w.w.issues["12"] = { number: 12, state: "open" }
    w.save()
    expect(close("replaced", "pr:7").json.reasons).toEqual(["evidence-unproven"])
    expect(close("duplicate", "issue:12").json.reasons).toEqual(["evidence-unproven"])
    expect(close("fixed", `commit:${"a".repeat(40)}`).json.reasons).toEqual(["evidence-unproven"])
    expect(close("fixed", `commit:${w.git(w.repo, "rev-parse", "origin/main")}`, "x").json.reasons).toEqual(["comment-missing"])
    expect(w.writes()).toEqual([])
  })

  test("a cautious profile does not close", () => {
    const w = new World("autonomous_profile: cautious\n")
    const close = issue(w)
    expect(close("fixed", `commit:${w.git(w.repo, "rev-parse", "origin/main")}`).json.reasons).toEqual(["level-pr"])
  })
})

test("a parked item stays parked until it changes", () => {
  const w = new World().begin()
  w.pr(7, { "app.rb": "two\n" })
  w.w.issues["7"] = { number: 7, updated_at: "2026-01-01T00:00:00Z" }
  w.save()
  w.run(["park", "--token", w.token, "--item", "pr:7", "--updated", "2026-01-01T00:00:00Z", "--why", "x", "--recommend", "y"])
  expect(w.run(["observe"]).json.prs[0].parked).toBe(true)
  w.w.prs[7].updatedAt = "2026-01-02T00:00:00Z"
  w.save()
  expect(w.run(["observe"]).json.prs[0].parked).toBe(false)
  expect(w.run(["digest"]).json.parked).toHaveLength(1)
})

describe("recorded decisions", () => {
  const answer = (w: World, ...more: string[]) =>
    w.run(["answer", "--item", "pr:7", "--situation", "lane full", "--option", "wait", "--option", "start", "--choice", "wait", ...more])
  const stated = ["--reason", "overlapping gates slow both", "--reason-from", "stated", "--scope", "future"]

  test("an answer unparks its item and is offered next time", () => {
    const w = new World().begin()
    w.pr(7, { "app.rb": "two\n" })
    w.w.issues["7"] = { number: 7, updated_at: "2026-01-01T00:00:00Z" }
    w.save()
    w.run(["park", "--token", w.token, "--item", "pr:7", "--updated", "2026-01-01T00:00:00Z", "--why", "x", "--recommend", "y"])
    const id = answer(w, ...stated).json.id
    expect(w.run(["observe"]).json.prs[0].parked).toBe(false)
    expect(w.run(["decisions"]).json.decisions).toMatchObject([{ id, choice: "wait", reason: "overlapping gates slow both" }])
  })

  test("a one-time answer is not a precedent and a skipped guess is not recorded", () => {
    const w = new World()
    answer(w, "--reason", "my guess", "--reason-from", "none", "--scope", "once")
    expect(w.run(["decisions"]).json.decisions).toEqual([])
    expect(w.run(["digest"]).json.answer[0].reason).toBeNull()
    expect(answer(w, "--reason-from", "stated", "--scope", "future").json.reasons).toEqual(["reason-missing"])
  })

  test("a newer decision replaces an older one and a wrong one is retired", () => {
    const w = new World()
    const first = answer(w, ...stated).json.id
    const second = answer(w, ...stated, "--replaces", first).json.id
    expect(w.run(["decisions"]).json.decisions.map((d: any) => d.id)).toEqual([second])
    w.run(["retire", "--id", second, "--why", "wrong"])
    expect(w.run(["decisions"]).json.decisions).toEqual([])
  })

  test("a decision never changes what the gate allows", () => {
    const w = new World()
    w.pr(7, { "db/migrate/1.rb": "x\n" }, { login: "stranger" })
    const before = w.gate().reasons
    answer(w, ...stated)
    expect(w.gate().reasons).toEqual(before)
  })
})
