import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test"
import { writeFileSync } from "node:fs"
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
    ["direct with a merge commit", "autonomous_profile: balanced\nautonomous_landing: direct\nautonomous_merge_method: merge\n"],
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

  test("requested work needs an origin", () => {
    const w = new World().begin()
    expect(w.run(["job", "--token", w.token, "--motion", "bugs", "--what", "x"]).json.reasons).toEqual(["origin-missing"])
  })
})
