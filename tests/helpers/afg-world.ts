import { expect } from "bun:test"
import { spawnSync } from "node:child_process"
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

export const SCRIPT = path.join(__dirname, "../../skills/afg/scripts/autonomous.py")
export const ME = "maintainer"
const roots: string[] = []
export const cleanup = () => roots.forEach((r) => rmSync(r, { recursive: true, force: true }))

// Answers reads from world.json and appends every call to calls.jsonl.
const FAKE_GH = `#!/usr/bin/env python3
import json, os, sys, re
d = os.environ["FAKE_GH_DIR"]
a = sys.argv[1:]
open(os.path.join(d, "calls.jsonl"), "a").write(json.dumps(a) + "\\n")
w = json.load(open(os.path.join(d, "world.json")))
def out(o): print(json.dumps(o)); sys.exit(0)
if a[:2] == ["repo", "view"]: out({"nameWithOwner": "o/r", "defaultBranchRef": {"name": "main"}})
if a[:2] == ["pr", "list"]:
    if "--base" in a: out([p for p in w["prs"].values() if p["baseRefName"] == a[a.index("--base") + 1]])
    out(list(w["prs"].values()))
if a[:2] == ["issue", "list"]: out(w.get("issue_list", []))
if a[:2] == ["pr", "view"]:
    if w.get("view_fails"): sys.exit(1)
    out(w["prs"][a[2]])
if a[:2] == ["pr", "merge"]:
    head = a[a.index("--match-head-commit") + 1]
    if not w.get("merge_invisible"):
        import subprocess
        subprocess.run(["git", "-C", os.path.join(d, "..", "origin.git"), "update-ref", "refs/heads/main", head], check=True)
    w["prs"][a[2]].update(state="MERGED", mergeCommit={"oid": head if not w.get("merge_invisible") else "f" * 40})
    json.dump(w, open(os.path.join(d, "world.json"), "w")); sys.exit(0)
if a[0] in ("pr", "issue") and a[1] in ("close", "comment"):
    if a[1] == "close" and not w.get("close_ignored"):
        w["issues"][a[2]]["state"] = "closed"
        json.dump(w, open(os.path.join(d, "world.json"), "w"))
    sys.exit(0)
if a[0] == "api":
    u = a[1]
    if u == "graphql": out({"data": {"repository": {"mergeQueue": w.get("queue")}}})
    if u == "-X": sys.exit(0)
    if u == "user": out({"login": "${ME}"})
    m = re.search(r"commits/([0-9a-f]+)/check-runs", u)
    if m:
        runs = w["checks"].get(m[1], [{"name": "ci", "status": "completed", "conclusion": "success"}])
        out({"total_count": len(runs), "check_runs": runs})
    if re.search(r"commits/[0-9a-f]+/status", u): out({"statuses": []})
    if "/rules/branches/" in u:
        if w.get("rules_error"): print(w["rules_error"], file=sys.stderr); sys.exit(1)
        out(w.get("rules", []))
    m = re.search(r"/actions/runs.head_sha=([0-9a-f]+)", u)
    if m:
        flows = w.get("flows", {}).get(m[1], [])
        out({"total_count": len(flows), "workflow_runs": flows})
    m = re.search(r"pulls/(\\d+)/(commits|comments|reviews)", u)
    if m:
        page = int(re.search(r"page=(\\d+)$", u)[1])
        out(w["prs"][m[1]].get("api_" + m[2], [])[(page - 1) * 100:page * 100])
    m = re.search(r"issues/(\\d+)/comments", u)
    if m: out(w.get("comments", {}).get(m[1], []))
    m = re.search(r"issues/(\\d+)$", u)
    if m:
        if m[1] not in w["issues"]:
            p = w["prs"][m[1]]
            out({"number": p["number"], "user": {"login": p["author"]["login"]}, "state": "open", "pull_request": {}, "updated_at": p["updatedAt"]})
        out(w["issues"][m[1]])
    if "/branches/" in u: out({"protected": w.get("protected", False)})
    out({"allow_squash_merge": True})
sys.exit(9)
`

export const HANDS_OFF = "autonomous_profile: hands-off\nautonomous_checks:\n  - { run: true }\nautonomous_trusted_authors:\n  - dependabot[bot]\n"

export class World {
  root = realpathSync(mkdtempSync(path.join(tmpdir(), "afg-")))
  repo = path.join(this.root, "repo")
  fake = path.join(this.root, "fake")
  env: NodeJS.ProcessEnv
  w: any = { prs: {}, checks: {}, issues: {}, flows: {}, comments: {} }
  token = ""

  constructor(team: string | null = HANDS_OFF, local?: string) {
    roots.push(this.root)
    const bin = path.join(this.root, "bin")
    for (const d of [bin, this.fake, path.join(this.root, "home")]) mkdirSync(d)
    writeFileSync(path.join(bin, "gh"), FAKE_GH)
    chmodSync(path.join(bin, "gh"), 0o755)
    this.env = {
      PATH: `${bin}:${process.env.PATH}`,
      HOME: path.join(this.root, "home"),
      FAKE_GH_DIR: this.fake,
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_AUTHOR_NAME: "t",
      GIT_AUTHOR_EMAIL: "t@example.invalid",
      GIT_COMMITTER_NAME: "t",
      GIT_COMMITTER_EMAIL: "t@example.invalid",
    }
    this.git(this.root, "init", "-q", "--bare", "-b", "main", "origin.git")
    this.git(this.root, "init", "-q", "-b", "main", "repo")
    this.git(this.repo, "config", "user.email", "t@example.invalid")
    this.git(this.repo, "remote", "add", "origin", "https://github.com/o/r.git")
    this.git(this.repo, "config", `url.${path.join(this.root, "origin.git")}.insteadOf`, "https://github.com/o/r.git")
    this.write("app.rb", "one\n")
    this.write("package.json", '{\n  "dependencies": { "left": "1.2.0" }\n}\n')
    if (team !== null) this.write(".compound-engineering/config.yaml", team)
    this.commit("init")
    this.git(this.repo, "push", "-q", "origin", "main")
    if (local) this.write(".compound-engineering/config.local.yaml", local)
    this.save()
  }

  git(cwd: string, ...args: string[]) {
    const r = spawnSync("git", args, { cwd, env: this.env, encoding: "utf8" })
    if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`)
    return r.stdout.trim()
  }
  write(p: string, text: string) {
    mkdirSync(path.dirname(path.join(this.repo, p)), { recursive: true })
    writeFileSync(path.join(this.repo, p), text)
  }
  commit(msg: string, paths = ["."]) {
    this.git(this.repo, "add", "-A", "--", ...paths)
    this.git(this.repo, "commit", "-q", "-m", msg)
    return this.head()
  }
  head() {
    return this.git(this.repo, "rev-parse", "HEAD")
  }
  save() {
    writeFileSync(path.join(this.fake, "world.json"), JSON.stringify(this.w))
  }
  calls(): string[][] {
    const p = path.join(this.fake, "calls.jsonl")
    return existsSync(p) ? readFileSync(p, "utf8").trim().split("\n").map((l) => JSON.parse(l)) : []
  }
  writes() {
    return this.calls().filter((c) => ["merge", "close", "comment"].includes(c[1]!) || c.includes("-X"))
  }
  run(args: string[], input?: unknown) {
    const r = spawnSync("python3", [SCRIPT, ...args], {
      cwd: this.repo, env: this.env, encoding: "utf8", input: input === undefined ? "" : JSON.stringify(input),
    })
    let json: any
    try { json = JSON.parse(r.stdout) } catch { throw new Error(`${args.join(" ")}: ${r.stdout}${r.stderr}`) }
    return { code: r.status, json }
  }
  begin() {
    this.token = this.run(["begin"]).json.token
    return this
  }
  pr(n: number, files: Record<string, string>, author: any = { login: "app/dependabot", is_bot: true }, extra: any = {}) {
    this.git(this.repo, "checkout", "-q", "-b", `pr${n}`, "origin/main")
    for (const [p, t] of Object.entries(files)) this.write(p, t)
    const head = this.commit(`pr ${n}`, Object.keys(files))
    this.git(this.repo, "push", "-q", "origin", `HEAD:refs/pull/${n}/head`, `HEAD:refs/heads/pr${n}`)
    this.git(this.repo, "checkout", "-q", "main")
    this.w.prs[n] = {
      number: n, state: "OPEN", isDraft: false, author, headRefOid: head, headRefName: `pr${n}`, isCrossRepository: false,
      baseRefName: "main", mergeable: "MERGEABLE", mergeStateStatus: "CLEAN", reviewDecision: "", title: "t", url: "u",
      updatedAt: "2026-01-01T00:00:00Z",
      headRepositoryOwner: { login: "o" },
      api_commits: [{
        sha: head,
        author: author.is_bot ? { login: "dependabot[bot]", type: "Bot" } : { login: author.login },
        commit: { verification: { verified: true } },
      }],
      ...extra,
    }
    this.save()
    return head
  }
  reviewJson(head: string, over: any = {}) {
    const base = this.git(this.repo, "rev-parse", "origin/main")
    return {
      status: "complete", verdict: "Ready to merge", findings: [], run_id: "r",
      scope: { base, head_sha: head, files_changed: 1 }, ...over,
    }
  }
  receipts(n: number, head: string) {
    expect(this.run(["test", "--token", this.token, "--pr", `${n}`]).json.ok).toBe(true)
    expect(this.run(["review", "--token", this.token, "--pr", `${n}`], this.reviewJson(head)).json.ok).toBe(true)
  }
  ready(n = 7, files: Record<string, string> = { "app.rb": "two\n" }) {
    this.begin()
    const head = this.pr(n, files)
    this.receipts(n, head)
    return head
  }
  gate(n = 7) {
    return this.run(["gate", "--pr", `${n}`]).json
  }
  land(n: number, head: string, ...more: string[]) {
    return this.run(["land", "--token", this.token, "--pr", `${n}`, "--head", head, ...more])
  }
  fail(sha: string, name = "ci") {
    this.w.checks[sha] = [{ name, status: "completed", conclusion: "failure" }]
    this.save()
  }
}

