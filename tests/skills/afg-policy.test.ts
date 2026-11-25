import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { readFileSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { cleanup, HANDS_OFF, ME, World } from "../helpers/afg-world"

setDefaultTimeout(60_000)
afterAll(cleanup)

describe("policy", () => {
  test("no profile observes and denies landing and closing (AE5)", () => {
    const w = new World(null)
    const head = w.pr(7, { "app.rb": "two\n" })
    expect(w.run(["observe"]).json.main).toBe("green")
    expect(w.run(["begin"]).json).toMatchObject({ token: null, mode: "report-only", reason: "no-profile" })
    expect(w.land(7, head).json.reasons).toEqual(["no-profile"])
    w.w.issues["1"] = { number: 1, user: { login: ME }, state: "open" }
    w.save()
    const close = w.run(["close", "--token", "x", "--kind", "issue", "--number", "1", "--as", "fixed", "--evidence", "pr:7", "--comment", "x".repeat(30)])
    expect(close.json.reasons).toEqual(["no-profile"])
    expect(w.writes()).toEqual([])
  })

  test.each([
    ["unknown key", "autonomous_profile: balanced\nautonomous_yolo: true\n"],
    ["bad profile", "autonomous_profile: yolo\n"],
    ["bad override", "autonomous_profile: balanced\nautonomous_overrides:\n  - { motion: stack, max: direct }\n"],
    ["duplicate", "autonomous_profile: cautious\nautonomous_profile: hands-off\n"],
    ["no profile", "autonomous_trusted_authors: [a]\n"],
    ["CI ignored on the PR route", "autonomous_profile: balanced\nautonomous_ci: ignored\n"],
    ["direct with a rebase", "autonomous_profile: balanced\nautonomous_landing: direct\nautonomous_merge_method: rebase\n"],
    ["paths it cannot match", "autonomous_profile: balanced\nautonomous_checks:\n  - { run: x, paths: \"*.{ts}\" }\n"],
    ["check without a command", "autonomous_profile: balanced\nautonomous_checks:\n  - { paths: x }\n"],
    ["bad number", "autonomous_profile: balanced\nautonomous_jobs_per_hour: lots\n"],
  ])("malformed policy denies: %s", (_n, text) => {
    expect(new World(text).run(["policy"]).json).toMatchObject({ active: false, reason: "policy-malformed" })
  })

  test("a local file is the whole policy only when the repository declares none", () => {
    const w = new World(null, "autonomous_profile: hands-off # mine\nautonomous_rules:\n  - \"Ask me: billing\"\n")
    expect(w.run(["policy"]).json).toMatchObject({ active: true, source: "config.local.yaml", levels: { bugs: "merge" } })
    expect(w.run(["policy"]).json.rules[0].text).toBe("Ask me: billing")
  })

  test("a local file can only tighten a repository policy", () => {
    const w = new World(
      "autonomous_profile: balanced\nautonomous_trusted_authors: [a, b]\nautonomous_jobs_per_hour: 3\n",
      "autonomous_profile: hands-off\nautonomous_trusted_authors: [b, evil]\nautonomous_jobs_per_hour: 99\n",
    )
    const p = w.run(["policy"]).json
    expect(p).toMatchObject({ autonomous_profile: "balanced", autonomous_trusted_authors: ["b"], autonomous_jobs_per_hour: 3 })
    const t = new World("autonomous_profile: balanced\nautonomous_checks:\n  - { run: make }\n", "autonomous_checks:\n  - { run: true }\n")
    expect(t.run(["policy"]).json.reason).toBe("policy-malformed")
    const l = new World("autonomous_profile: balanced\n", "autonomous_landing: direct\n")
    expect(l.run(["policy"]).json.reason).toBe("policy-malformed")
  })

  test("the strictest matching override wins", () => {
    const w = new World("autonomous_profile: hands-off\nautonomous_overrides:\n  - { motion: bugs, max: babysit }\n  - motion: bugs\n    max: pr\n")
    expect(w.run(["policy"]).json.levels).toMatchObject({ bugs: "pr", stack: "merge" })
  })

  test("a PR cannot change the policy that judges it", () => {
    const w = new World("autonomous_profile: cautious\nautonomous_checks:\n  - { run: true }\nautonomous_trusted_authors: [dependabot[bot]]\n")
    w.pr(7, { ".compound-engineering/config.yaml": "autonomous_profile: hands-off\n" })
    expect(w.gate().reasons).toEqual(expect.arrayContaining(["hard-limit", "level-pr"]))
  })
})

describe("lease and caps", () => {
  test("a second run is locked out and an old token is refused after takeover", () => {
    const w = new World().begin()
    expect(w.run(["begin"]).json.reasons).toEqual(["locked"])
    const state = path.join(w.repo, ".context/compound-engineering/afg/state.json")
    writeFileSync(state, JSON.stringify({ token: w.token, at: "2020-01-01T00:00:00Z" }))
    expect(w.run(["heartbeat", "--token", w.token]).code).toBe(3)
    expect(w.run(["begin"]).json.reclaimed).toBe(true)
    expect(w.run(["heartbeat", "--token", w.token]).json.error).toContain("lease-lost")
  })

  test("corrupt state denies rather than starting a second run", () => {
    const w = new World().begin()
    writeFileSync(path.join(w.repo, ".context/compound-engineering/afg/state.json"), "{")
    expect(w.run(["begin"]).json.reasons).toEqual(["state-corrupt"])
  })

  test("the hourly cap stops a third job", () => {
    const w = new World().begin()
    const job = () => w.run(["job", "--token", w.token, "--motion", "stack", "--what", "x"])
    expect(job().code).toBe(0)
    expect(job().code).toBe(0)
    expect(job().json.reasons).toEqual(["hourly-cap"])
  })

  test("the open PR cap still allows one red-main repair", () => {
    const w = new World(HANDS_OFF + "autonomous_open_pr_cap: 1\nautonomous_jobs_per_hour: 9\n").begin()
    const job = w.run(["job", "--token", w.token, "--motion", "stack", "--what", "x", "--opens-pr"]).json.job
    w.pr(7, { "app.rb": "two\n" }, { login: ME })
    w.run(["adopt", "--token", w.token, "--job", job, "--pr", "7", "--head", w.w.prs[7].headRefOid])
    const next = (m: string) => w.run(["job", "--token", w.token, "--motion", m, "--what", "x", "--opens-pr"])
    expect(next("stack").json.reasons).toEqual(["open-pr-cap"])
    expect(next("main-red").json.reasons).toEqual(["main-not-red"])
    w.fail(w.git(w.repo, "rev-parse", "origin/main"))
    expect(next("main-red").code).toBe(0)
  })

  describe("an outside allowance", () => {
    const soon = () => new Date(Date.now() + 3_600_000).toISOString()
    const world = (allowance?: unknown) => {
      const w = new World(HANDS_OFF + "autonomous_jobs_per_hour: 9\n").begin()
      if (allowance !== undefined) give(w, allowance)
      return w
    }
    const give = (w: World, a: unknown) =>
      writeFileSync(path.join(w.repo, ".context/compound-engineering/afg/allowance.json"), typeof a === "string" ? a : JSON.stringify(a))
    const job = (w: World) => w.run(["job", "--token", w.token, "--motion", "stack", "--what", "x"])

    test("is not needed, and policy says this version enforces one", () => {
      const w = world()
      expect(job(w).code).toBe(0)
      expect(w.run(["policy"]).json.allowance).toEqual({ enforced: true, state: "none" })
    })

    test("bounds the jobs going at once, and ending one makes room", () => {
      const w = world({ version: 1, jobs: 1, expires_at: soon() })
      const first = job(w).json.job
      expect(job(w).json.reasons).toEqual(["allowance-spent"])
      w.run(["job-end", "--token", w.token, "--job", first, "--why", "done"])
      expect(job(w).code).toBe(0)
    })

    const ledger = (w: World) => path.join(w.repo, ".context/compound-engineering/afg/ledger.jsonl")
    const again = (w: World) => {
      w.run(["end", "--token", w.token])
      return w.begin()
    }

    test("work outlives the run that started it, until it is too old to be going", () => {
      const w = world({ version: 1, jobs: 1, expires_at: soon() })
      const first = job(w).json.job
      const denied = job(again(w)).json
      expect(denied.reasons).toEqual(["allowance-spent"])
      expect(denied.going).toMatchObject([{ job: first, what: "x" }])
      expect(denied.allowance.file).toEndWith("afg/allowance.json")
      writeFileSync(ledger(w), readFileSync(ledger(w), "utf8").replaceAll(/"at": "[^"]+"(?=, "event": "job")/g, '"at": "2020-01-01T00:00:00Z"'))
      expect(job(w).code).toBe(0)
    })

    test("a worker on work in flight takes a place too", () => {
      const w = world({ version: 1, jobs: 1, expires_at: soon() })
      const worker = w.run(["worker", "--token", w.token, "--what", "fix pr 7"]).json.worker
      expect(job(w).json.reasons).toEqual(["allowance-spent"])
      expect(w.run(["worker", "--token", w.token, "--what", "another"]).json.reasons).toEqual(["allowance-spent"])
      w.run(["worker-end", "--token", w.token, "--worker", worker])
      expect(job(w).code).toBe(0)
    })

    test("that disappears mid-run stops the run it bounded, and not the next", () => {
      const w = world()
      give(w, { version: 1, jobs: 5, expires_at: soon() })
      again(w)
      rmSync(path.join(w.repo, ".context/compound-engineering/afg/allowance.json"))
      expect(job(w).json.reasons).toEqual(["allowance-missing"])
      expect(job(again(w)).code).toBe(0)
    })

    test("a pipe or a folder in its place starts nothing and hangs nothing", () => {
      for (const make of ["mkfifo", "mkdir"]) {
        const w = world()
        spawnSync(make, [path.join(w.repo, ".context/compound-engineering/afg/allowance.json")])
        expect(job(w).json.reasons).toEqual(["allowance-unreadable"])
      }
    })

    test.each([
      ["expired", { version: 1, jobs: 3, expires_at: "2020-01-01T00:00:00Z" }, "allowance-expired"],
      ["zero", { version: 1, jobs: 0, expires_at: "2999-01-01T00:00:00Z" }, "allowance-spent"],
      ["not JSON", "{", "allowance-unreadable"],
      ["another version", { version: 2, jobs: 3, expires_at: "2999-01-01T00:00:00Z" }, "allowance-unreadable"],
      ["no expiry", { version: 1, jobs: 3 }, "allowance-unreadable"],
      ["a naive time", { version: 1, jobs: 3, expires_at: "2999-01-01T00:00:00" }, "allowance-unreadable"],
      ["a negative count", { version: 1, jobs: -1, expires_at: "2999-01-01T00:00:00Z" }, "allowance-unreadable"],
      ["true as a count", { version: 1, jobs: true, expires_at: "2999-01-01T00:00:00Z" }, "allowance-unreadable"],
      ["a list", [], "allowance-unreadable"],
      ["true as a version", { version: true, jobs: 3, expires_at: "2999-01-01T00:00:00Z" }, "allowance-unreadable"],
      ["deeply nested", "[".repeat(4000), "allowance-unreadable"],
    ])("that is %s starts nothing", (_name, given, reason) => {
      expect(job(world(given)).json.reasons).toEqual([reason])
    })

    test("that expires mid-run stops new jobs and lets the run finish", () => {
      const w = world({ version: 1, jobs: 2, expires_at: soon() })
      const going = job(w).json.job
      give(w, { version: 1, jobs: 2, expires_at: "2020-01-01T00:00:00Z" })
      expect(job(w).json.reasons).toEqual(["allowance-expired"])
      expect(w.run(["job-end", "--token", w.token, "--job", going, "--why", "done"]).code).toBe(0)
      expect(w.run(["end", "--token", w.token]).code).toBe(0)
    })
  })

  test("requested work needs an origin", () => {
    const w = new World().begin()
    expect(w.run(["job", "--token", w.token, "--motion", "bugs", "--what", "x"]).json.reasons).toEqual(["origin-missing"])
  })
})
