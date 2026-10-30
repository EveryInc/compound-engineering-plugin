import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

const USAGE = `usage: bun tests/skill-eval-cell/replay/replay.ts <command> [flags]

  export   --repo owner/name --out dir (--prs 12,34 | --before <ISO time> --limit N)
           Save each merged PR's metadata, files, reviews, inline comments, and conversation as pr-<n>.json.
  build    --source <local clone> --base <sha> [--head <sha>] [--overlay dir]... [--history dir] [--no-peer] --out dir
           Make a fixture repo holding only history up to --base, with no remote. Overlays are committed on
           main as the base; --head is applied as one commit on branch pr-head; --history is copied to
           .pr-history/ and git-excluded.
  base     --source <local clone> --head <sha> --merge <merge sha>
           Print the commit a PR was branched from (merge-base of head and the merge's first parent).
  collect  --runs <dir of cell outs> --out file.json
           Gather each host's mode:agent JSON from cell runs whose out dirs are named <pr>-<arm>.
  blind    --collected file.json --truth ground-truth.json --out dir
           Write one anonymized grading packet per PR plus key.json mapping review ids to arm and host.
  tally    --grades grades.json --key key.json --truth ground-truth.json
           Unblind a grader's marks: real-bug hits and extra findings per arm and host.`

function git(cwd: string, ...args: string[]): string {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: 1 << 30 })
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed in ${cwd}: ${r.stderr}`)
  return r.stdout
}

function gh<T>(endpoint: string): T {
  const r = spawnSync("gh", ["api", "--paginate", "--slurp", endpoint], { encoding: "utf8", maxBuffer: 1 << 30 })
  if (r.status !== 0) throw new Error(`gh api ${endpoint} failed: ${r.stderr}`)
  const pages = JSON.parse(r.stdout) as unknown[]
  return (pages.length === 1 && !Array.isArray(pages[0]) ? pages[0] : pages.flat()) as T
}

type Login = { user: { login: string } }
const NOISE = new Set(["vercel[bot]", "linear[bot]"])

function exportHistory(repo: string, out: string, prs: number[]) {
  fs.mkdirSync(out, { recursive: true })
  const R = `repos/${repo}`
  for (const n of prs) {
    const pr = gh<{ number: number; title: string; body: string | null; merged_at: string; merge_commit_sha: string; head: { sha: string } } & Login>(`${R}/pulls/${n}`)
    const record = {
      pr: { number: pr.number, title: pr.title, body: pr.body, merged_at: pr.merged_at, merge_commit_sha: pr.merge_commit_sha, head: pr.head.sha, user: pr.user.login },
      commits: gh<({ sha: string; commit: { message: string; committer: { date: string } } })[]>(`${R}/pulls/${n}/commits?per_page=100`)
        .map((c) => ({ sha: c.sha, date: c.commit.committer.date, subject: c.commit.message.split("\n")[0] })),
      files: gh<{ filename: string }[]>(`${R}/pulls/${n}/files?per_page=100`).map((f) => f.filename),
      reviews: gh<({ body: string; commit_id: string; submitted_at: string } & Login)[]>(`${R}/pulls/${n}/reviews?per_page=100`)
        .filter((r) => r.body).map((r) => ({ user: r.user.login, commit: r.commit_id, body: r.body, submitted_at: r.submitted_at })),
      inline_comments: gh<({ id: number; in_reply_to_id?: number; path: string; original_line: number | null; original_commit_id: string; body: string; created_at: string } & Login)[]>(`${R}/pulls/${n}/comments?per_page=100`)
        .map((c) => ({ id: c.id, in_reply_to_id: c.in_reply_to_id ?? null, user: c.user.login, commit: c.original_commit_id, path: c.path, line: c.original_line, body: c.body, created_at: c.created_at })),
      conversation: gh<({ body: string; created_at: string } & Login)[]>(`${R}/issues/${n}/comments?per_page=100`)
        .filter((c) => !NOISE.has(c.user.login)).map((c) => ({ user: c.user.login, body: c.body, created_at: c.created_at })),
    }
    fs.writeFileSync(path.join(out, `pr-${n}.json`), JSON.stringify(record, null, 1))
  }
}

function listMergedBefore(repo: string, before: string, limit: number): number[] {
  const r = spawnSync("gh", ["pr", "list", "-R", repo, "--state", "merged", "--limit", "1000", "--json", "number,mergedAt,author"], { encoding: "utf8", maxBuffer: 1 << 30 })
  if (r.status !== 0) throw new Error(`gh pr list failed: ${r.stderr}`)
  return (JSON.parse(r.stdout) as { number: number; mergedAt: string; author: { login: string } }[])
    .filter((p) => p.mergedAt < before && !/renovate|dependabot/.test(p.author.login))
    .sort((a, b) => b.mergedAt.localeCompare(a.mergedAt)).slice(0, limit).map((p) => p.number)
}

function buildFixture(o: { source: string; base: string; head?: string; overlays: string[]; history?: string; noPeer: boolean; out: string }) {
  if (fs.existsSync(o.out)) throw new Error(`${o.out} already exists`)
  const scratch = fs.mkdtempSync(path.join(path.dirname(path.resolve(o.out)), ".replay-"))
  try {
    // A bundle of one ref carries only that commit's ancestry, so the fixture cannot reach later history.
    // A shared bare clone borrows the source's objects, so the source checkout is only read, never written.
    const mirror = path.join(scratch, "mirror.git")
    const bundle = path.join(scratch, "base.bundle")
    git(scratch, "clone", "-q", "--bare", "--shared", path.resolve(o.source), mirror)
    git(mirror, "update-ref", "refs/heads/replay-base", o.base)
    git(mirror, "bundle", "create", "-q", bundle, "refs/heads/replay-base")
    git(scratch, "clone", "-q", bundle, path.resolve(o.out))
    const w = path.resolve(o.out)
    git(w, "checkout", "-q", "-B", "main", o.base)
    git(w, "remote", "remove", "origin")
    git(w, "config", "user.email", "eval@example.invalid")
    git(w, "config", "user.name", "eval")
    for (const dir of o.overlays) fs.cpSync(dir, w, { recursive: true })
    if (o.noPeer) {
      fs.mkdirSync(path.join(w, ".compound-engineering"), { recursive: true })
      fs.writeFileSync(path.join(w, ".compound-engineering/config.yaml"), "cross_model_review_mode: off\n")
    }
    if (o.overlays.length || o.noPeer) { git(w, "add", "-A"); git(w, "commit", "-q", "-m", "chore: review setup") }
    if (o.head) {
      git(w, "checkout", "-q", "-b", "pr-head")
      const patch = git(o.source, "diff", "--binary", o.base, o.head)
      const r = spawnSync("git", ["apply", "-3", "--index"], { cwd: w, input: patch, encoding: "utf8" })
      if (r.status !== 0) throw new Error(`applying ${o.base}..${o.head} failed: ${r.stderr}`)
      git(w, "commit", "-q", "-m", git(o.source, "log", "-1", "--format=%B", o.head))
    }
    if (o.history) {
      fs.cpSync(o.history, path.join(w, ".pr-history"), { recursive: true })
      fs.appendFileSync(path.join(w, ".git/info/exclude"), ".pr-history/\n")
    }
  } finally {
    spawnSync("trash", [scratch])
  }
}

function jsonSpans(text: string): string[] {
  const spans: string[] = []
  let depth = 0, start = -1, inString = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inString) { if (c === "\\") i++; else if (c === '"') inString = false; continue }
    if (c === '"' && depth > 0) inString = true
    else if (c === "{") { if (depth++ === 0) start = i }
    else if (c === "}" && depth > 0 && --depth === 0) spans.push(text.slice(start, i + 1))
  }
  return spans
}

function tryParseObject(span: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(span)
    return value && typeof value === "object" ? value : null
  } catch {
    return null
  }
}

function findReview(text: string): Record<string, unknown> | null {
  let best: { length: number; review: Record<string, unknown> } | null = null
  for (const span of jsonSpans(text)) {
    const review = tryParseObject(span)
    if (review && "findings" in review && span.length > (best?.length ?? 0)) best = { length: span.length, review }
  }
  return best?.review ?? null
}

function collect(runs: string, out: string) {
  const rows: CollectedRow[] = []
  for (const cell of fs.readdirSync(runs).sort()) {
    const m = /^(\d+)-(.+)$/.exec(cell)
    const hosts = path.join(runs, cell, "hosts")
    if (!m || !fs.existsSync(hosts)) continue
    for (const host of fs.readdirSync(hosts)) {
      const stdout = path.join(hosts, host, "stdout.txt")
      if (!fs.existsSync(stdout)) continue
      rows.push({ pr: m[1], arm: m[2], host, review: findReview(fs.readFileSync(stdout, "utf8")) })
    }
  }
  fs.writeFileSync(out, JSON.stringify(rows, null, 1))
}

type Finding = { severity?: string; file?: string; line?: number; title?: string; why_it_matters?: string; evidence?: unknown }
type CollectedRow = { pr: string; arm: string; host: string; review: { findings?: Finding[] } | null }
type ReviewKey = Record<string, { arm: string; host: string }>

function inBlindOrder(pr: string, runs: CollectedRow[]): CollectedRow[] {
  const keyed = runs.map((r) => ({ r, h: Bun.hash(`${pr}${r.arm}${r.host}`) }))
  return keyed.sort((a, b) => (a.h < b.h ? -1 : a.h > b.h ? 1 : 0)).map(({ r }) => r)
}

function blind(collected: string, truth: string, out: string) {
  const rows = JSON.parse(fs.readFileSync(collected, "utf8")) as CollectedRow[]
  const gt = JSON.parse(fs.readFileSync(truth, "utf8")) as Record<string, { findings: unknown[] }>
  fs.mkdirSync(out, { recursive: true })
  const key: ReviewKey = {}
  for (const pr of Object.keys(gt).sort()) {
    const runs = inBlindOrder(pr, rows.filter((r) => r.pr === pr))
    const reviews = runs.map((r, i) => {
      const id = `R${pr}-${String.fromCharCode(65 + i)}`
      key[id] = { arm: r.arm, host: r.host }
      return { review_id: id, findings: (r.review?.findings ?? []).map((f, j) => ({ id: `${id}.${j + 1}`, severity: f.severity, file: f.file, line: f.line, title: f.title, detail: f.why_it_matters ?? "", evidence: f.evidence })) }
    })
    fs.writeFileSync(path.join(out, `pr-${pr}.json`), JSON.stringify({ pr, ground_truth: gt[pr].findings, reviews }, null, 1))
  }
  fs.writeFileSync(path.join(out, "key.json"), JSON.stringify(key, null, 1))
}

type Grades = Record<string, { gt: Record<string, Record<string, "hit" | "partial" | "miss">>; extra: Record<string, "credible" | "weak"> }>

function tally(gradesFile: string, keyFile: string, truth: string) {
  const grades = JSON.parse(fs.readFileSync(gradesFile, "utf8")) as Grades
  const key = JSON.parse(fs.readFileSync(keyFile, "utf8")) as ReviewKey
  const gt = JSON.parse(fs.readFileSync(truth, "utf8")) as Record<string, { findings: { id: string; outcome: string }[] }>
  const rows = new Map<string, { hit: number; partial: number; chances: number; credible: number; weak: number }>()
  const row = (rid: string) => {
    const k = `${key[rid].arm}\t${key[rid].host}`
    if (!rows.has(k)) rows.set(k, { hit: 0, partial: 0, chances: 0, credible: 0, weak: 0 })
    return rows.get(k)!
  }
  for (const [pr, g] of Object.entries(grades)) {
    const realBugIds = new Set(gt[pr].findings.filter((f) => f.outcome === "fixed").map((f) => f.id))
    for (const [gid, byReview] of Object.entries(g.gt)) {
      if (!realBugIds.has(gid)) continue
      for (const [rid, mark] of Object.entries(byReview)) {
        const r = row(rid)
        r.chances++
        if (mark === "hit") r.hit++
        if (mark === "partial") r.partial++
      }
    }
    for (const [fid, label] of Object.entries(g.extra)) row(fid.split(".")[0])[label]++
  }
  console.log("arm\thost\thits\tpartial\tcredible extra\tweak extra")
  for (const [k, r] of [...rows].sort()) console.log(`${k}\t${r.hit}/${r.chances}\t${r.partial}\t${r.credible}\t${r.weak}`)
}

function main(argv: string[]) {
  const [cmd, ...rest] = argv
  const flags = new Map<string, string[]>()
  for (let i = 0; i < rest.length; i++) {
    const k = rest[i]
    if (!k.startsWith("--")) throw new Error(`unexpected argument ${k}`)
    const v = rest[i + 1] !== undefined && !rest[i + 1].startsWith("--") ? rest[++i] : "true"
    flags.set(k, [...(flags.get(k) ?? []), v])
  }
  const one = (k: string) => { const v = flags.get(k)?.[0]; if (!v) throw new Error(`${cmd} needs ${k}\n\n${USAGE}`); return v }
  switch (cmd) {
    case "export": {
      const repo = one("--repo")
      const prs = flags.has("--prs") ? one("--prs").split(",").map(Number) : listMergedBefore(repo, one("--before"), Number(one("--limit")))
      return exportHistory(repo, one("--out"), prs)
    }
    case "build":
      return buildFixture({ source: one("--source"), base: one("--base"), head: flags.get("--head")?.[0], overlays: flags.get("--overlay") ?? [], history: flags.get("--history")?.[0], noPeer: flags.has("--no-peer"), out: one("--out") })
    case "base": {
      const merge = one("--merge")
      return console.log(git(one("--source"), "merge-base", one("--head"), `${merge}^1`).trim())
    }
    case "collect": return collect(one("--runs"), one("--out"))
    case "blind": return blind(one("--collected"), one("--truth"), one("--out"))
    case "tally": return tally(one("--grades"), one("--key"), one("--truth"))
    default: console.error(USAGE); process.exit(cmd ? 2 : 0)
  }
}

if (import.meta.main) main(process.argv.slice(2))
