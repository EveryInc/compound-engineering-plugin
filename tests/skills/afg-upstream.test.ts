import { spawnSync } from "node:child_process"
import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test"
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import path from "node:path"
import { cleanup, ME, SCRIPT, World } from "../helpers/afg-world"

setDefaultTimeout(60_000)
afterAll(cleanup)

// Parent o/r is origin.git, fork maintainer/r is fork.git. A write is an unexpected call, which fails.
const FAKE_GH = `#!/usr/bin/env python3
import json, os, re, subprocess, sys, urllib.parse
d = os.environ["FAKE_GH_DIR"]
a = sys.argv[1:]
open(os.path.join(d, "calls.jsonl"), "a").write(json.dumps(a) + "\\n")
f = os.path.join(d, "world.json")
w = json.load(open(f))
def out(o): print(json.dumps(o)); sys.exit(0)
def opt(k): return a[a.index(k) + 1] if k in a else None
NO = {"admin": False, "maintain": False, "push": False, "triage": False, "pull": True}
def rest(p):
    merged = p["state"] == "MERGED"
    return {"number": p["number"], "title": p["title"], "html_url": p["url"], "draft": p["isDraft"], "state": "open" if p["state"] == "OPEN" else "closed",
        "merged_at": w["now"] if merged else None, "created_at": p["createdAt"], "updated_at": p["updatedAt"], "user": {"login": p["author"]["login"], "type": "User"},
        "head": {"sha": p["headRefOid"], "ref": p["headRefName"], "user": p["headRepositoryOwner"]}}
if a[:2] == ["pr", "list"]:
    assert opt("-R") == "o/r", a
    assert "--author" not in a, "the author search lags"
    rows = [p for p in w["prs"].values() if p["state"] == "OPEN"]
    out(rows[:int(opt("--limit"))])
if a[:2] == ["repo", "view"] and w.get("ordinary"): out({"nameWithOwner": "${ME}/r", "defaultBranchRef": {"name": "main"}})
if a[:2] == ["pr", "view"]: out(w["prs"][a[2]])
if a[:2] == ["issue", "list"]:
    if w.get("parent", {}).get("has_issues") is False: print("the 'o/r' repository has disabled issues", file=sys.stderr); sys.exit(1)
    out([i for i in w["issues"].values() if i["state"] == "open"])
if a[0] == "api":
    u = a[1]
    if u == "user": out({"login": "${ME}"})
    if u == "repos/${ME}/r":
        out({"full_name": "${ME}/r", "fork": True, "default_branch": "main", "archived": False, "permissions": {**NO, "push": True, "admin": True},
             "parent": {"full_name": "o/r"}, "source": {"full_name": "o/r"}, **w.get("fork", {})})
    if u == "repos/o/r":
        out({"full_name": "o/r", "fork": False, "default_branch": "main", "archived": False, "has_issues": True, "permissions": {**NO, **w.get("rights", {})}, **w.get("parent", {})})
    m = re.match(r"repos/o/r/pulls\\?(.+)$", u)
    if m:
        q = dict(x.split("=", 1) for x in m[1].split("&"))
        rows = [p for p in w["prs"].values() if q["state"] == "all" or p["state"] == "OPEN"]
        rows.sort(key=lambda p: p["createdAt"], reverse=True)
        page = int(q["page"])
        out([rest(p) for p in rows[(page - 1) * 100:page * 100]])
    m = re.match(r"repos/(o/\\.github)/contents/(.+)$", u)
    if m:
        import base64
        out({"content": base64.b64encode(w["contents"][m[2]].encode()).decode()})
    if u.endswith("/community/profile"):
        if w.get("parent", {}).get("fork"): print("gh: Not Found (HTTP 404)", file=sys.stderr); sys.exit(1)
        out({"files": w.get("profile", {"contributing": None, "pull_request_template": None})})
    m = re.search(r"search/issues.q=([^&]+)", u)
    if m:
        q = urllib.parse.unquote(m[1])
        assert q.startswith("repo:o/r is:"), q
        kind = "pr" if " is:pr " in q else "issue"
        hits = [h for h in w.get("hits", []) if ("pull_request" in h) == (kind == "pr")]
        out({"total_count": w.get("total", len(hits)), "incomplete_results": w.get("incomplete", False), "items": hits})
    m = re.search(r"/commits/([0-9a-f]{40})$", u)
    if m:
        # A fork shares objects with its parent, so a pushed commit is known to both.
        known = subprocess.run(["git", "-C", os.path.join(d, "..", "fork.git"), "cat-file", "-e", m[1]], capture_output=True).returncode == 0
        if known or m[1] in w.get("published", []): out({"sha": m[1]})
        print("gh: No commit found for SHA (HTTP 422)", file=sys.stderr); sys.exit(1)
    if "/check-runs" in u:
        runs = w["checks"].get(re.search(r"commits/([0-9a-f]+)", u)[1], [{"name": "ci", "status": "completed", "conclusion": "success"}])
        out({"total_count": len(runs), "check_runs": runs})
    if u.endswith("status?per_page=100"): out({"statuses": []})
    if "/actions/runs" in u: out({"total_count": 0, "workflow_runs": []})
    if "/comments" in u: out([])
    m = re.search(r"/(issues|pulls)/(\\d+)", u)
    if m and re.search(r"/(commits|reviews)", u): out([])
    if m: out(w["issues"].get(m[2]) or {"number": int(m[2]), "state": "open", "user": {"login": "${ME}"}, "pull_request": {}, "updated_at": "t"})
print("unexpected " + json.dumps(a), file=sys.stderr)
sys.exit(9)
`

const LOCAL = "autonomous_profile: hands-off\nautonomous_landing: upstream\nautonomous_checks:\n  - { run: make gate }\n"
const TEMPLATE = "<!-- keep this -->\n## What\n\n## Gate\n\n- [ ] The gate passes: `make gate`\n"
const FIX = { "app.rb": "fixed\n", "test/app_test.rb": "grep -q fixed app.rb || echo app-is-broken >&2; grep -q fixed app.rb\n" }
const TOLD = "Written with an AI coding assistant."
const BODY = `## What\n\nThe app said one.\n\n## Gate\n\n- [ ] The gate passes: \`make gate\`\n\n${TOLD}\n`
const READY = { kind: "fix", title: "Fix the wrong answer", body: BODY, disclosure: TOLD }
const RULES = { read: [".github/pull_request_template.md", "CONTRIBUTING.md"], sign_off: "none", cla: "none", ai: "unstated", first: "pr", model: "none", gate: ["make gate"], scope: "bug fixes", because: Object.fromEntries(["sign_off", "cla", "ai", "first", "model"].map((k) => [k, "The files say nothing about it."])) }

// Only the network goes to a local folder. What git says an address resolves to stays what it would be.
const shim = (real: string, root: string) => `#!/bin/sh
case "$1" in config) exec ${real} "$@";; esac
exec ${real} -c "url.${root}/fork.git.insteadOf=https://github.com/${ME}/r.git" -c "url.${root}/origin.git.insteadOf=https://github.com/o/r.git" "$@"
`

class Fork extends World {
  fork = path.join(this.root, "fork.git")
  n = 0
  constructor(local = LOCAL, guide = "Run make gate.\n", template = TEMPLATE) {
    super(null)
    this.w.now = new Date().toISOString()
    this.write("CONTRIBUTING.md", guide)
    this.write(".github/pull_request_template.md", template)
    this.write("Makefile", "gate:\n\t@true\n")
    this.commit("project")
    this.git(this.repo, "push", "-q", "origin", "main")
    this.git(this.root, "clone", "-q", "--bare", "origin.git", "fork.git")
    this.git(this.repo, "remote", "set-url", "origin", `https://github.com/${ME}/r.git`)
    this.git(this.repo, "config", "--unset-all", `url.${path.join(this.root, "origin.git")}.insteadOf`)
    writeFileSync(path.join(this.root, "bin/git"), shim(Bun.which("git")!, this.root))
    chmodSync(path.join(this.root, "bin/git"), 0o755)
    writeFileSync(path.join(this.root, "bin/gh"), FAKE_GH)
    chmodSync(path.join(this.root, "bin/gh"), 0o755)
    this.local(local)
    this.save()
  }
  local(text: string) { this.write(".compound-engineering/config.local.yaml", text) }
  t(...args: string[]) { return this.run([args[0]!, "--token", this.token, ...args.slice(1)]) }
  tin(input: unknown, ...args: string[]) { return this.run([args[0]!, "--token", this.token, ...args.slice(1)], input) }
  rules(over: any = {}) { return this.tin({ ...RULES, ...over }, "rules") }
  job(origin = "internal", motion = "bugs") { return this.t("job", "--motion", motion, "--origin", origin, "--what", "x") }
  branch(files: Record<string, string>, msg = "Fix the wrong answer", from = "refs/afg/parent/main") {
    this.git(this.repo, "checkout", "-q", "-b", `work${this.n++}`, from)
    for (const [p, t] of Object.entries(files)) this.write(p, t)
    const sha = this.commit(msg, Object.keys(files))
    this.git(this.repo, "checkout", "-q", "main")
    return sha
  }
  review(sha: string, files: number) {
    const base = this.git(this.repo, "rev-parse", "refs/afg/parent/main")
    return this.tin({ status: "complete", verdict: "Ready to merge", findings: [], run_id: "r", scope: { base, head_sha: sha, files_changed: files } }, "review", "--sha", sha)
  }
  reproduce(sha: string, expectText = "app-is-broken") {
    return this.t("reproduce", "--sha", sha, "--run", "sh test/app_test.rb", "--expect", expectText)
  }
  search(job: string) { return this.t("search", "--job", job, "--term", "wrong answer", "--term", "app says one") }
  prove(o: { skip?: string[]; files?: Record<string, string>; origin?: string; msg?: string; rules?: any } = {}) {
    const skip = o.skip ?? [], files = o.files ?? FIX
    this.begin()
    if (!skip.includes("rules")) expect(this.rules(o.rules).json.reasons).toBeUndefined()
    const job = this.job(o.origin).json.job as string
    const sha = this.branch(files, o.msg)
    expect(this.t("adopt", "--job", job, "--sha", sha).json.reasons).toBeUndefined()
    if (!skip.includes("test")) expect(this.t("test", "--sha", sha).json.ok).toBe(true)
    if (!skip.includes("review")) expect(this.review(sha, Object.keys(files).length).json.ok).toBe(true)
    if (!skip.includes("reproduce")) expect(this.reproduce(sha).json.ok).toBe(true)
    if (!skip.includes("search")) expect(this.search(job).code).toBe(0)
    return { job, sha }
  }
  compose(j: { job: string; sha: string }, over: any = {}) { return this.tin({ ...READY, ...over }, "ready", "--job", j.job, "--sha", j.sha).json }
  verdict(j: { job: string; sha: string }, body_sha: string, over: any = {}) {
    return this.tin({ head_sha: j.sha, body_sha, title: READY.title, reviewer: "r", reason: "read it", truthful: true, is_fix: true, within_rules: true, not_a_duplicate: true, security: false, names_a_model: false, ...over }, "verdict", "--job", j.job).json
  }
  finished(o: Parameters<Fork["prove"]>[0] = {}, over: any = {}) {
    const j = this.prove(o)
    const r = this.compose(j, over)
    expect(r.reasons).toBeUndefined()
    expect(this.verdict(j, r.body_sha).ok).toBe(true)
    return j
  }
  theirs(n: number, o: any = {}) {
    this.w.prs[n] = { number: n, title: "t", url: "u", author: { login: ME }, state: "OPEN", isDraft: false, headRefOid: "a".repeat(40), headRefName: `b${n}`,
      headRepositoryOwner: { login: ME }, createdAt: "2026-01-01T00:00:00Z", updatedAt: "t", mergeable: "MERGEABLE", reviewDecision: "", baseRefName: "main", files: [], ...o }
    this.save()
  }
  refs(dir: string) { return this.git(this.root, "-C", dir, "for-each-ref", "--format=%(refname) %(objectname)") }
  published() { return this.calls().filter((c) => c[1] === "create" || (c[0] !== "api" && !["list", "view"].includes(c[1]!)) || c.some((x) => /^-[XfF]$/.test(x))) }
}
const own = (w: Fork) => w.run(["policy"]).json

describe("who owns what", () => {
  test("the parent is the subject and its default branch the tip", () => {
    const w = new Fork()
    const up = w.run(["upstream"]).json
    expect(up).toMatchObject({ parent: "o/r", fork: `${ME}/r`, tip: w.git(w.repo, "rev-parse", "main"), rules: ["rules-unread"] })
    expect(up.rule_files).toEqual([".github/pull_request_template.md", "CONTRIBUTING.md"])
    expect(own(w)).toMatchObject({ active: true, levels: { tend: "report", bugs: "report" } })
  })

  test("a stale fork does not decide the tip", () => {
    const w = new Fork()
    w.write("app.rb", "moved\n")
    const tip = w.commit("moved", ["app.rb"])
    w.git(w.repo, "push", "-q", "https://github.com/o/r.git", "main")
    expect(w.run(["upstream"]).json.tip).toBe(tip)
  })

  test.each([
    ["not a fork", { fork: { fork: false, parent: null } }, "upstream-not-a-fork"],
    ["no push right on the fork", { fork: { permissions: { push: false } } }, "upstream-fork-not-yours"],
    ["a parent this account can push to", { rights: { push: true } }, "upstream-is-yours"],
    ["a parent this account maintains", { rights: { maintain: true } }, "upstream-is-yours"],
    ["an archived parent", { parent: { archived: true } }, "upstream-archived"],
  ])("inactive: %s", (_n, world, reason) => {
    const w = new Fork()
    Object.assign(w.w, world)
    w.save()
    expect(own(w)).toMatchObject({ active: false, reason })
    expect(w.run(["begin"]).json.token).toBe(null)
  })

  test("settings the project tracks are not the owner's", () => {
    const w = new Fork()
    w.git(w.repo, "add", "-f", ".compound-engineering/config.local.yaml")
    expect(own(w).reason).toBe("upstream-settings-tracked")
  })

  test("what the parent commits is not policy", () => {
    const w = new Fork()
    w.write(".compound-engineering/config.yaml", "autonomous_profile: hands-off\nautonomous_landing: direct\n")
    w.commit("policy", [".compound-engineering/config.yaml"])
    w.git(w.repo, "push", "-q", "https://github.com/o/r.git", "main")
    expect(own(w)).toMatchObject({ active: true, autonomous_landing: "upstream", source: "config.local.yaml" })
  })

  test.each([
    ["another motion", LOCAL + "autonomous_motions: [stack]\n"],
    ["a publishing mode", LOCAL + "autonomous_upstream: propose\n"],
    ["a repeated key", LOCAL + "autonomous_landing: direct\n"],
  ])("malformed settings are inactive and still refuse landing: %s", (_n, text) => {
    const w = new Fork(text)
    expect(own(w)).toMatchObject({ active: false, reason: "policy-malformed" })
    expect(w.run(["direct", "--sha", "a".repeat(40), "--job", "x"]).json.reasons).toEqual(["upstream-mode"])
  })

  test.each([
    ["an indented key", "autonomous_profile: hands-off\n  autonomous_landing: upstream\n"],
    ["a quoted key", "autonomous_profile: hands-off\n\"autonomous_landing\": upstream\n"],
    ["a value on the next line", "autonomous_profile: hands-off\nautonomous_landing:\n  upstream\n"],
    ["only its key", "autonomous_profile: hands-off\nautonomous_upstream_open: 2\n"],
    ["a tab before a comment", "autonomous_profile: hands-off\nautonomous_landing:\t# how\n  upstream\n"],
    ["a tagged value on the next line", "autonomous_profile: hands-off\nautonomous_landing:\n  !!str upstream\n"],
    ["a nested key", "autonomous_profile: hands-off\nautonomous:\n  landing: upstream\n"],
    ["a hyphen", "autonomous_profile: hands-off\nautonomous-landing: upstream\n"],
    ["a flow value", "autonomous: { landing: upstream }\n"],
    ["a flow value beside a profile", "autonomous_profile: hands-off\nautonomous: { landing: upstream }\n"],
    ["nested list items", "autonomous:\n- profile: hands-off\n- landing: upstream\n"],
    ["a flow document", "{ autonomous_profile: hands-off, autonomous_landing: upstream }\n"],
    ["a complex key", "autonomous_profile: hands-off\n? autonomous_landing\n: upstream\n"],
  ])("a setting in another form never acts, whatever the project commits: %s", (_n, text) => {
    const w = new Fork(text)
    w.write(".compound-engineering/config.yaml", "autonomous_profile: hands-off\nautonomous_landing: direct\nautonomous_ci: ignored\nautonomous_checks:\n  - { run: true }\n")
    w.commit("policy", [".compound-engineering/config.yaml"])
    w.git(w.repo, "push", "-q", "origin", "main")
    w.w.ordinary = true
    w.save()
    expect(own(w)).toMatchObject({ active: false, reason: "policy-malformed" })
    expect(w.run(["begin"]).json.token).toBe(null)
    expect(w.run(["direct", "--token", "x", "--sha", "a".repeat(40), "--job", "x"]).json.reasons).toEqual(["policy-malformed"])
  })

  test("a comment about it, or a rule that says the word, changes nothing elsewhere", () => {
    const w = new World(null, "autonomous_profile: balanced\n# autonomous_landing: upstream\nautonomous_landing: pull-request # | upstream\nautonomous_rules:\n  - Ask about upstream changes\n  - A change to autonomous_upstream waits\nautonomous_checks:\n  - run: make test\n    paths: vendor/upstream\n  - paths: lib/**\n    run: make upstream\nother:\n  remote: upstream\n")
    expect(w.run(["policy"]).json).toMatchObject({ active: true, landing: "pull-request" })
  })

  test("settings that cannot be read are not absent", () => {
    const w = new Fork()
    const file = path.join(w.repo, ".compound-engineering/config.local.yaml")
    rmSync(file)
    symlinkSync("nowhere", file)
    expect(own(w)).toMatchObject({ active: false, reason: "upstream-settings-unreadable" })
  })

  test("once begun, a lost or replaced file never acts as a maintainer", () => {
    const w = new Fork()
    w.begin()
    const file = ".compound-engineering/config.local.yaml"
    rmSync(path.join(w.repo, file))
    w.write(".compound-engineering/config.yaml", "autonomous_profile: hands-off\nautonomous_landing: direct\nautonomous_ci: ignored\n")
    w.commit("policy", [".compound-engineering/config.yaml"])
    w.git(w.repo, "push", "-q", "origin", "main")
    expect(own(w)).toMatchObject({ active: false, reason: "policy-malformed" })
    expect(w.run(["direct", "--sha", "a".repeat(40), "--job", "x"]).json.reasons).toEqual(["upstream-mode"])
    w.write(file, "autonomous_profile: hands-off\n")
    w.git(w.repo, "add", "-f", file)
    expect(own(w)).toMatchObject({ active: false, reason: "upstream-settings-tracked" })
  })

  test("a tracked name that this file system opens as the settings is tracked", () => {
    const w = new Fork()
    w.git(w.repo, "update-index", "--add", "--cacheinfo", `100644,${w.git(w.repo, "hash-object", "-w", "CONTRIBUTING.md")},.compound-engineering/con\ufb01g.local.yaml`)
    expect(own(w)).toMatchObject({ active: false, reason: "upstream-settings-tracked" })
  })

  test("a project without issues is tended and worked all the same", () => {
    const w = new Fork()
    w.w.parent = { has_issues: false }
    w.save()
    expect(w.run(["observe"]).json.issues).toEqual([])
  })

  test("facts are never asked of another host", () => {
    const w = new Fork()
    w.git(w.repo, "remote", "set-url", "origin", `https://gitlab.example/${ME}/r.git`)
    expect(own(w).reason).toBe("upstream-origin-unreadable")
  })

  test("a linked settings folder is not the owner's", () => {
    const w = new Fork()
    renameSync(path.join(w.repo, ".compound-engineering"), path.join(w.repo, "conf"))
    symlinkSync("conf", path.join(w.repo, ".compound-engineering"))
    w.git(w.repo, "add", "-A")
    w.git(w.repo, "commit", "-q", "-m", "link")
    expect(own(w)).toMatchObject({ active: false, reason: "upstream-settings-tracked" })
  })

  test("a shared file cannot set it, and its keys need it", () => {
    expect(new World("autonomous_profile: hands-off\nautonomous_landing: upstream\n").run(["policy"]).json.reason).toBe("policy-malformed")
    expect(new World("autonomous_profile: hands-off\nautonomous_upstream_open: 2\n").run(["policy"]).json.reason).toBe("policy-malformed")
    expect(new World("autonomous_profile: hands-off\nautonomous_motions: [tend]\n").run(["policy"]).json.reason).toBe("policy-malformed")
  })
})

describe("what can never happen", () => {
  test.each([
    ["land", ["land", "--pr", "7", "--head", "a"]],
    ["direct", ["direct", "--sha", "a".repeat(40), "--job", "x"]],
    ["update", ["update", "--pr", "7"]],
    ["gate", ["gate", "--pr", "7"]],
    ["guard", ["guard", "--pr", "7", "--file", "x"]],
    ["close", ["close", "--kind", "issue", "--number", "1", "--as", "fixed", "--evidence", "pr:7", "--comment", "x".repeat(30)]],
    ["adopting a PR", ["adopt", "--job", "x", "--pr", "7", "--head", "a"]],
    ["testing a PR", ["test", "--pr", "7"]],
  ])("%s is refused before anything is read from GitHub", (_n, args) => {
    const w = new Fork()
    expect(w.run(args).json.reasons).toEqual(["upstream-mode"])
    expect(w.calls()).toEqual([])
  })

  test("every subcommand that is not listed is refused", () => {
    const w = new Fork()
    const help = spawnSync("python3", [SCRIPT, "--help"], { env: w.env, encoding: "utf8" }).stdout
    const all = help.match(/\{([^}]+)\}/)![1]!.split(",")
    const src = readFileSync(path.join(__dirname, "../../skills/afg/scripts/upstream.py"), "utf8")
    const list = [...src.match(/ALLOWED = \{([^}]+)\}/)![1]!.matchAll(/"([\w-]+)"/g)].map((m) => m[1]!)
    expect(list.filter((c) => !all.includes(c))).toEqual([])
    // A new one is refused until someone decides it belongs here.
    expect(all.filter((c) => !list.includes(c)).sort()).toEqual(["close", "direct", "gate", "guard", "land", "update"])
  })

  test("a job cannot open a PR, and the upstream commands need the mode", () => {
    const w = new Fork()
    w.begin()
    w.rules()
    expect(w.t("job", "--motion", "bugs", "--origin", "internal", "--what", "x", "--opens-pr").json.reasons).toEqual(["upstream-mode"])
    expect(new World().run(["upstream"]).json.reasons).toEqual(["not-upstream"])
  })

  test("a finished change publishes nothing", () => {
    const w = new Fork()
    const before = [w.refs(w.fork), w.refs(path.join(w.root, "origin.git"))]
    const j = w.finished()
    expect([w.refs(w.fork), w.refs(path.join(w.root, "origin.git"))]).toEqual(before)
    expect(w.published()).toEqual([])
    const p = w.run(["digest"]).json.prepared
    expect(p).toMatchObject([{ job: j.job, sha: j.sha, confirmed: true }])
    expect(readFileSync(p[0].file, "utf8")).toBe(BODY)
  })
})

describe("the project's rules", () => {
  test("no work starts before they are recorded, or after they change", () => {
    const w = new Fork()
    w.begin()
    expect(w.job().json.reasons).toEqual(["rules-unread"])
    expect(w.rules().code).toBe(0)
    w.write("CONTRIBUTING.md", "No more.\n")
    w.commit("guide", ["CONTRIBUTING.md"])
    w.git(w.repo, "push", "-q", "https://github.com/o/r.git", "main")
    expect(w.job().json.reasons).toEqual(["rules-stale"])
  })

  test.each([
    ["a file not read", {}, { read: ["CONTRIBUTING.md"] }, "rules-unread"],
    ["a gate this machine does not run", {}, { gate: ["make other"] }, "gate-not-a-check"],
    ["a lax reading without its reason", {}, { because: { cla: "They say nothing of it." } }, "rules-unexplained"],
    ["an unknown value", {}, { ai: "fine" }, "rules-unreadable"],
  ])("denied: %s", (_n, o: any, over, reason) => {
    const w = new Fork(LOCAL, o.guide)
    w.begin()
    expect(w.rules(over).json.reasons).toEqual([reason])
  })

  test("a project that wants no AI work gets none", () => {
    const w = new Fork()
    w.begin()
    w.rules({ ai: "forbidden" })
    expect(w.job().json.reasons).toEqual(["ai-not-welcome"])
  })

  test.each(["PULL_REQUEST_TEMPLATE.md", ".github/pull_request_template.md"])("an organization's template at %s counts", (at) => {
    const w = new Fork()
    w.git(w.repo, "rm", "-q", ".github/pull_request_template.md")
    w.git(w.repo, "commit", "-q", "-m", "no template")
    w.git(w.repo, "push", "-q", "https://github.com/o/r.git", "main")
    w.w.profile = { contributing: null, pull_request_template: { url: `https://api.github.com/repos/o/.github/contents/${at}` } }
    w.w.contents = { [at]: TEMPLATE }
    w.save()
    const j = w.prove({ rules: { read: ["CONTRIBUTING.md", `o/.github:${at}`] } })
    expect(w.compose(j, { body: `Trust me. ${TOLD}\n` }).reasons).toContain("template-missing")
    expect(w.compose(j).ready).toBe(j.job)
  })

  test("a rule file that is a link is read through it", () => {
    const w = new Fork()
    w.git(w.repo, "mv", "CONTRIBUTING.md", "docs-guide.md")
    w.write("docs-guide.md", "Commits need Signed-off-by.\n")
    symlinkSync("docs-guide.md", path.join(w.repo, "CONTRIBUTING.md"))
    w.commit("link", ["docs-guide.md", "CONTRIBUTING.md"])
    w.git(w.repo, "push", "-q", "https://github.com/o/r.git", "main")
    w.begin()
    expect(w.rules().code).toBe(0)
    w.write("docs-guide.md", "We take no AI patches.\n")
    w.commit("target", ["docs-guide.md"])
    w.git(w.repo, "push", "-q", "https://github.com/o/r.git", "main")
    expect(w.job().json.reasons).toEqual(["rules-stale"])
  })

  test("a link to a folder, or through one, is read", () => {
    const w = new Fork()
    w.write(".agents/rules/one.md", "Run make gate.\n")
    symlinkSync(".agents", path.join(w.repo, "linked"))
    mkdirSync(path.join(w.repo, ".cursor/rules"), { recursive: true })
    symlinkSync("../../linked/rules", path.join(w.repo, ".cursor/rules/shared"))
    symlinkSync("linked/rules/one.md", path.join(w.repo, "AGENTS.md"))
    w.commit("links", [".agents", "linked", ".cursor", "AGENTS.md"])
    w.git(w.repo, "push", "-q", "https://github.com/o/r.git", "main")
    expect(w.run(["upstream"]).json.rule_files).toEqual(expect.arrayContaining([".cursor/rules/shared", "AGENTS.md"]))
  })

  test("finished work is confirmed only under the rules as they are", () => {
    const w = new Fork()
    w.finished()
    w.rules({ ai: "forbidden" })
    expect(w.run(["digest"]).json.prepared).toMatchObject([{ confirmed: false, behind: false }])
  })

  test("a parent that is a fork has no profile", () => {
    const w = new Fork()
    w.w.parent = { fork: true }
    w.save()
    expect(w.run(["upstream"]).json.rule_files).toContain("CONTRIBUTING.md")
  })
})

describe("finished", () => {
  test.each([
    ["untested", { skip: ["test"] }, ["test-missing", "gate-not-passed"]],
    ["unreviewed", { skip: ["review"] }, ["review-missing"]],
    ["unreproduced", { skip: ["reproduce"] }, ["reproduce-missing"]],
    ["unsearched", { skip: ["search"] }, ["search-missing"]],
    ["issue first without an issue", { rules: { first: "issue" } }, ["issue-first"]],
    ["a feature", { msg: "feat: a new thing" }, ["not-a-fix"]],
    ["a commit that mentions someone", { msg: "Fix it, thanks @octocat" }, ["mentions-someone"]],
    ["a trailer with a version", { msg: "Fix it\n\nCo-Authored-By: Some Tool 9 <a@example.invalid>" }, ["names-a-model"]],
    ["a commit that refers elsewhere", { msg: "Fix it like #12" }, ["refers-elsewhere"]],
    ["a commit about a security problem", { msg: "Fix the path traversal" }, ["looks-like-security"]],
  ])("denied: %s", (_n, o: any, reasons) => {
    const w = new Fork()
    const j = w.prove(o)
    expect(w.compose(j).reasons).toEqual(reasons)
  })

  test.each([
    ["a heading dropped", { body: BODY.replace("## What\n", "") }, "template-missing"],
    ["a heading only in a comment", { body: BODY.replace("## What\n", "<!--\n## What\n-->\n") }, "text-hidden"],
    ["a box dropped", { body: BODY.replace(/- \[ \].*\n/, "") }, "template-missing"],
    ["an invisible character", { body: BODY + "\u202eo\n" }, "text-hidden"],
    ["a ticked box", { body: BODY.replace("[ ]", "[x]") }, "box-ticked"],
    ["a box added and ticked", { body: BODY + "- - [X] Everything is fine\n" }, "box-ticked"],
    ["a tick after a carriage return", { body: BODY + "x\r- [x] fine\n" }, "box-ticked"],
    ["an entity for a mention", { body: BODY + "&commat;octocat\n" }, "text-hidden"],
    ["a disclosure in a link definition", { body: BODY.replace(TOLD, `[//]: # (${TOLD})`) }, "text-hidden"],
    ["a disclosure inside another line", { body: BODY.replace(TOLD, `Not: ${TOLD}`) }, "disclosure-missing"],
    ["a credit with a version", { body: BODY + "Generated with Some Tool 9.\n" }, "names-a-model"],
    ["a title that names a version of a tool in markup", { title: "Fix <b>it</b>" }, "title-invalid"],
    ["a mention", { body: BODY + "cc @octocat\n" }, "mentions-someone"],
    ["a mention in code", { body: BODY + "`@octocat`\n" }, "mentions-someone"],
    ["another issue", { body: BODY + "See #4\n" }, "refers-elsewhere"],
    ["another repository", { body: BODY + "See a/b#4\n" }, "refers-elsewhere"],
    ["a path on this machine", { body: BODY + "/Users/someone/x\n" }, "private-text"],
    ["a security problem", { body: BODY + "An attacker gets code execution.\n" }, "looks-like-security"],
    ["no disclosure", { disclosure: "Not in the body." }, "disclosure-missing"],
    ["a disclosure only in a comment", { body: BODY.replace(TOLD, `<!-- ${TOLD} -->`) }, "text-hidden"],
    ["a disclosure with a version", { body: BODY + "Made with Some Tool 9.\n", disclosure: "Made with Some Tool 9." }, "names-a-model"],
    ["a feature title", { title: "feat: more" }, "not-a-fix"],
    ["docs that change code", { kind: "docs" }, "not-docs"],
    ["an unknown template", { template: "other.md" }, "template-unknown"],
  ])("denied text: %s", (_n, over, reason) => {
    const w = new Fork()
    expect(w.compose(w.prove(), over).reasons).toContain(reason)
  })




  test.each([
    ["## \u2705 Checklist", []],
    ["## `<type>: <subject>` Q&amp;A", []],
    ["- [ ] No security vulnerabilities are introduced", []],
    ["- [ ] Linked (e.g. Fixes #123)", ["refers-elsewhere"]],
    ["- [ ] Told @o/reviewers", ["mentions-someone"]],
  ])("the template's own words: %s", (line, calls) => {
    const w = new Fork(LOCAL, undefined, `## What\n\n${line}\n`)
    expect(w.compose(w.prove(), { body: `## What\n\n${line}\n\n${TOLD}\n` }).template_calls_out).toEqual(calls)
  })

  test.each([["_@octocat_", "mentions-someone"], ["_GH-12_", "refers-elsewhere"], ["/var/folders/x/T/a", "private-text"], ["~/Code/x", "private-text"]])("denied in text: %s", (more, reason) => {
    const w = new Fork()
    expect(w.compose(w.prove(), { body: `${BODY}${more}\n` }).reasons).toEqual([reason])
  })

  test("a reference to the issue it answers is fine", () => {
    const w = new Fork()
    w.w.issues["3"] = { number: 3, state: "open", locked: false, user: { login: "someone" }, updated_at: "t" }
    w.save()
    const j = w.prove({ origin: "issue:3" })
    expect(w.compose(j, { body: BODY + "Fixes #3\n" }).ready).toBe(j.job)
    w.w.issues["3"].state = "closed"
    w.save()
    expect(w.compose(j).reasons).toContain("issue-not-open")
  })

  test("a reproduction must fail first, with that text, and pass after", () => {
    const w = new Fork()
    const { sha } = w.prove({ skip: ["reproduce", "search"] })
    expect(w.reproduce(sha, "another text").json.reasons).toEqual(["does-not-fail-first"])
    expect(w.t("reproduce", "--sha", sha, "--run", "true", "--expect", "text").json.reasons).toEqual(["does-not-fail-first"])
    expect(w.t("reproduce", "--sha", sha, "--run", "sh test/app_test.rb; exit 1", "--expect", "app-is-broken").json.reasons).toEqual(["does-not-pass-after"])
    expect(w.git(w.repo, "worktree", "list").split("\n").length).toBe(1)
  })

  test("a command that fails without the tests proves nothing about them", () => {
    const w = new Fork()
    const { sha } = w.prove({ skip: ["reproduce", "search"] })
    expect(w.t("reproduce", "--sha", sha, "--run", "grep -q fixed app.rb || { echo app-is-broken; exit 1; }", "--expect", "app-is-broken").json.reasons).toEqual(["not-the-tests"])
  })

  test("a version bump in a text file is not documentation", () => {
    const w = new Fork()
    const j = w.prove({ files: { "data/words.txt": "a\n" }, skip: ["reproduce"] })
    expect(w.compose(j, { kind: "docs" }).reasons).toContain("not-docs")
  })

  test("a fix without a test is not reproduced, and docs need none", () => {
    const w = new Fork()
    const { sha } = w.prove({ files: { "app.rb": "fixed\n" }, skip: ["reproduce", "search"] })
    expect(w.reproduce(sha).json.reasons).toEqual(["no-test-in-change"])
    const d = new Fork()
    const j = d.prove({ files: { "docs/use.md": "right\n" }, skip: ["reproduce"] })
    expect(d.compose(j, { kind: "docs" }).ready).toBe(j.job)
  })

  test("a moved parent voids the receipts", () => {
    const w = new Fork()
    const j = w.prove()
    w.write("other.rb", "x\n")
    w.commit("moved", ["other.rb"])
    w.git(w.repo, "push", "-q", "https://github.com/o/r.git", "main")
    expect(w.compose(j).reasons).toEqual(expect.arrayContaining(["author-not-trusted", "test-missing", "reproduce-missing"]))
  })

  test("a private draft is kept, and its job is refused", () => {
    const w = new Fork()
    const j = w.finished()
    const r = w.tin({ kind: "security", title: "Private", body: "A code execution report." }, "ready", "--job", j.job).json
    expect(readFileSync(r.file, "utf8")).toContain("code execution")
    expect(w.compose(j).reasons).toEqual(["security-draft"])
  })

  test("a reply is held to the same text, and only answers on an own PR", () => {
    const w = new Fork()
    const j = w.prove()
    expect(w.tin({ kind: "reply", title: "t", body: `Because of the lock.\n${TOLD}`, disclosure: TOLD }, "ready", "--job", j.job).json.reasons).toEqual(["not-your-pr"])
    const reply = w.tin({ kind: "reply", title: "t", body: "@octocat see #4 in /Users/me/x, written by Some Tool 9, code execution\n- [x] done <span hidden>" }, "ready", "--job", j.job).json.reasons
    expect(reply).toEqual(expect.arrayContaining(["mentions-someone", "refers-elsewhere", "private-text", "looks-like-security", "names-a-model", "not-your-pr", "box-ticked", "text-hidden", "disclosure-missing"]))
  })

  test("a reader who sees a model named says so", () => {
    const w = new Fork()
    const j = w.prove()
    expect(w.verdict(j, w.compose(j).body_sha, { names_a_model: true }).no).toEqual(["names_a_model"])
  })

  test.each(["truthful", "is_fix", "within_rules", "not_a_duplicate"])("a reader's no on %s stands", (k) => {
    const w = new Fork()
    const j = w.prove()
    const r = w.compose(j)
    expect(w.verdict(j, r.body_sha, { [k]: false }).no).toEqual([k])
    expect(w.verdict(j, r.body_sha).reasons).toEqual(["verdict-no"])
  })

  test("a verdict is about the title it read", () => {
    const w = new Fork()
    const j = w.prove()
    const first = w.compose(j)
    expect(w.compose(j, { title: "Fix another answer" }).ready).toBe(j.job)
    expect(w.verdict(j, first.body_sha).reasons).toEqual(["head-moved"])
  })
})

describe("a refusal stays with the work", () => {
  function again(w: Fork, o: any = {}) {
    const job = o.job ?? w.job().json.job
    const sha = w.branch(o.files ?? FIX, "Fix it again")
    w.t("adopt", "--job", job, "--sha", sha)
    w.t("test", "--sha", sha)
    w.review(sha, 2)
    w.reproduce(sha)
    w.search(job)
    return { job, sha }
  }

  test("a new commit of a job the reader refused", () => {
    const w = new Fork()
    const j = w.prove()
    w.verdict(j, w.compose(j).body_sha, { security: true })
    expect(w.compose(again(w, { job: j.job })).reasons).toEqual(["verdict-no"])
  })

  test("the same change under a new job", () => {
    const w = new Fork()
    const j = w.prove()
    w.verdict(j, w.compose(j).body_sha, { not_a_duplicate: false })
    expect(w.compose(again(w)).reasons).toEqual(["verdict-no"])
  })

  test("an owner's answer is not a refusal, and one taken back counts no more", () => {
    const w = new Fork()
    const j = w.finished()
    const id = w.run(["answer", "--item", `commit:${j.sha}`, "--situation", "s", "--choice", "go on", "--reason-from", "none", "--scope", "once"]).json.id
    expect(w.run(["digest"]).json.prepared).toEqual([])
    expect(w.compose(j).ready).toBe(j.job)
    w.run(["retire", "--id", id, "--why", "wrong"])
    expect(w.run(["digest"]).json.prepared.length).toBe(1)
  })

  test("a branch the owner opened waits no longer", () => {
    const w = new Fork(LOCAL + "autonomous_upstream_open: 1\n")
    const j = w.finished()
    expect(w.job().json.reasons).toEqual(["prepared-waiting"])
    w.theirs(9, { state: "MERGED", headRefOid: j.sha, createdAt: new Date(Date.now() + 5000).toISOString() })
    expect(w.job().code).toBe(0)
  })

  test("a security draft made before anything was ready, for the same change", () => {
    const w = new Fork()
    const j = w.prove()
    w.tin({ kind: "security", title: "Private", body: "A report." }, "ready", "--job", j.job)
    expect(w.compose(again(w)).reasons).toEqual(["security-draft"])
  })

  test("a reader of other work on the same files is told what was refused", () => {
    const w = new Fork()
    const j = w.prove()
    w.verdict(j, w.compose(j).body_sha, { security: true })
    expect(w.compose(again(w, { files: { ...FIX, "app.rb": "fixed \n" } })).refused_before).toEqual([j.job])
  })

  test("an open issue found the same by one job is answered by the job for it", () => {
    const w = new Fork()
    w.w.issues["3"] = { number: 3, state: "open", locked: false, user: { login: "someone" }, updated_at: "t" }
    w.w.hits = [{ number: 3, title: "t", state: "open", state_reason: null }]
    w.save()
    const j = w.prove()
    w.t("judge", "--job", j.job, "--number", "3", "--is", "same", "--why", "An open issue reports this")
    const k = again(w, { job: w.job("issue:3").json.job })
    w.t("judge", "--job", k.job, "--number", "3", "--is", "answers", "--why", "This job is for that issue")
    expect(w.compose(k).ready).toBe(k.job)
  })

  test("a hit that was the same, for another job", () => {
    const w = new Fork()
    w.w.hits = [{ number: 5, title: "t", state: "closed", state_reason: "not_planned" }]
    w.save()
    const j = w.prove()
    w.t("judge", "--job", j.job, "--number", "5", "--is", "same", "--why", "It is what they turned down")
    const k = again(w, { files: { ...FIX, "app.rb": "fixed \n" } })
    w.t("judge", "--job", k.job, "--number", "5", "--is", "different", "--why", "It is another thing entirely")
    expect(w.compose(k).reasons).toEqual(["duplicate"])
  })

  test("refused and ended work leaves room for other work", () => {
    const w = new Fork(LOCAL + "autonomous_upstream_open: 1\n")
    const j = w.prove()
    w.verdict(j, w.compose(j).body_sha, { is_fix: false })
    expect(w.job().code).toBe(0)
  })
})

describe("duplicates", () => {
  const hit = (number: number, o: any = {}) => ({ number, title: "t", state: "open", state_reason: null, locked: false, ...o })
  const closedPr = hit(5, { state: "closed", pull_request: { merged_at: null } })

  test("each hit is judged, and a rejection is final", () => {
    const w = new Fork()
    w.w.hits = [closedPr]
    w.save()
    const j = w.prove()
    expect(w.compose(j).reasons).toEqual(["duplicate-unjudged"])
    const judge = (is: string) => w.t("judge", "--job", j.job, "--number", "5", "--is", is, "--why", "It changes another answer entirely")
    judge("same")
    judge("different")
    expect(w.compose(j).reasons).toEqual(["duplicate"])
  })

  test("a different one passes, a later one is asked about again", () => {
    const w = new Fork()
    w.w.hits = [closedPr]
    w.save()
    const j = w.prove()
    w.t("judge", "--job", j.job, "--number", "5", "--is", "different", "--why", "It changes another answer entirely")
    expect(w.compose(j).ready).toBe(j.job)
    w.w.hits.push(hit(6))
    w.save()
    expect(w.compose(j).reasons).toEqual(["duplicate-unjudged"])
  })

  test("an open PR on the same file is a hit that no term finds", () => {
    const w = new Fork()
    const j = w.prove()
    w.theirs(8, { author: { login: "someone" }, files: [{ path: "app.rb" }] })
    expect(w.compose(j).reasons).toEqual(["duplicate-unjudged"])
  })

  test("a hit answers only the open issue the job is for", () => {
    const w = new Fork()
    w.w.hits = [hit(6)]
    w.save()
    const j = w.prove()
    w.t("judge", "--job", j.job, "--number", "6", "--is", "answers", "--why", "This is the report it fixes")
    expect(w.compose(j).reasons).toEqual(["duplicate"])
  })

  test.each([
    ["one term", ["wrong answer"], {}, "search-terms"],
    ["a qualifier", ["wrong answer", "is:closed"], {}, "search-terms"],
    ["an excluded word", ["wrong answer", "answer -wrong"], {}, "search-terms"],
    ["more hits than one page", ["wrong answer", "app says"], { total: 101 }, "search-too-wide"],
    ["an incomplete search", ["wrong answer", "app says"], { incomplete: true }, "unreadable"],
  ])("denied: %s", (_n, terms, world, reason) => {
    const w = new Fork()
    const j = w.prove({ skip: ["test", "review", "reproduce", "search"] })
    Object.assign(w.w, world)
    w.save()
    expect(w.t("search", "--job", j.job, ...terms.flatMap((t) => ["--term=" + t])).json.reasons).toEqual([reason])
  })
})

describe("tending", () => {
  function open(w: Fork) {
    w.begin()
    w.rules()
    const head = w.branch({ "app.rb": "theirs\n" })
    w.git(w.repo, "push", "-q", "origin", `${head}:refs/heads/b7`)
    w.theirs(7, { headRefOid: head, mergeable: "CONFLICTING" })
    return head
  }

  test("an own PR's conflict is prepared here and nothing is pushed", () => {
    const w = new Fork()
    const head = open(w)
    expect(w.run(["observe"]).json.own_prs[0].attention).toEqual(["conflict"])
    const refs = w.refs(w.fork)
    const job = w.job("pr:7", "tend").json.job
    const sha = w.branch({ "more.rb": "x\n" }, "Resolve", head)
    expect(w.t("adopt", "--job", job, "--sha", sha).json.sha).toBe(sha)
    expect(w.t("test", "--sha", sha).json.ok).toBe(true)
    expect(w.compose({ job, sha }).reasons).toContain("job-missing")
    expect(w.published()).toEqual([])
    expect(w.refs(w.fork)).toBe(refs)
  })

  test("what the owner would push says nothing only they may say", () => {
    const w = new Fork()
    const head = open(w)
    const job = w.job("pr:7", "tend").json.job
    const sha = w.branch({ "more.rb": "x\n" }, "Resolve for @octocat\n\nSigned-off-by: t <t@example.invalid>", head)
    expect(w.t("adopt", "--job", job, "--sha", sha).json.reasons).toEqual(["mentions-someone", "sign-off-is-the-owners"])
  })

  test("a reply is read by someone else like any text", () => {
    const w = new Fork()
    open(w)
    const job = w.job("pr:7", "tend").json.job
    const r = w.tin({ kind: "reply", title: READY.title, body: `Because of the lock.\n\n${TOLD}`, disclosure: TOLD }, "ready", "--job", job).json
    expect(w.verdict({ job, sha: null as any }, r.body_sha).ok).toBe(true)
  })

  test("published commits are not a bug fix's own work", () => {
    const w = new Fork()
    const head = open(w)
    const job = w.job().json.job
    expect(w.t("adopt", "--job", job, "--sha", w.branch({ "more.rb": "x\n" }, "More", head)).json.reasons).toEqual(["author-not-trusted"])
  })

  test("a check that waits for approval is not a failure", () => {
    const w = new Fork()
    const head = open(w)
    w.w.checks[head] = [{ name: "ci", status: "completed", conclusion: "action_required" }]
    w.theirs(7, { headRefOid: head })
    expect(w.run(["observe"]).json.own_prs[0].attention).toEqual([])
    w.fail(head)
    expect(w.run(["observe"]).json.own_prs[0].attention).toEqual(["checks-failing"])
  })

  test("only an own open PR is tended", () => {
    const w = new Fork()
    open(w)
    w.theirs(8, { author: { login: "someone" } })
    expect(w.job("pr:8", "tend").json.reasons).toEqual(["not-your-pr"])
  })

  test("more open than the limit means tending only", () => {
    const w = new Fork()
    open(w)
    for (const n of [8, 9]) w.theirs(n)
    expect(w.job().code).toBe(0)
    w.theirs(10)
    expect(w.job().json.reasons).toEqual(["tend-only"])
    expect(w.job("pr:7", "tend").code).toBe(0)
  })

  test("as many prepared branches as the limit wait for the owner first", () => {
    const w = new Fork(LOCAL + "autonomous_upstream_open: 1\n")
    const j = w.finished()
    expect(w.job().json.reasons).toEqual(["prepared-waiting"])
    w.run(["answer", "--item", `commit:${j.sha}`, "--situation", "s", "--choice", "no", "--reason-from", "none", "--scope", "once"])
    expect(w.job().code).toBe(0)
  })
})

test("nothing this keeps in the checkout shows up for the project to commit, and the owner's own ignores stay", () => {
  const w = new Fork()
  writeFileSync(path.join(w.repo, ".git/info/exclude"), "mine")
  w.begin()
  w.begin()
  expect(w.git(w.repo, "status", "--porcelain")).toBe("")
  expect(readFileSync(path.join(w.repo, ".git/info/exclude"), "utf8")).toBe("mine\n/.context/compound-engineering/afg/\n/.compound-engineering/config.local.yaml\n")
})
