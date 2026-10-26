/**
 * Builds throwaway repositories for the ce-babysit-pr stale-intake eval pack.
 *
 *   bun tests/skill-eval-cell/packs/ce-babysit-pr-stale-intake/build-fixtures.ts --out <dir> [--scenario <name>]
 *
 * Each <dir>/<scenario>/ gets a bare `remote.git` (main + refs/pull/<N>/head), a `work/`
 * clone on the PR branch, `bin/gh` and `bin/git` fakes, `gh-data.json` for the fake gh,
 * and `scenario.json` (expected verdict + task; never shown to the agent). History is
 * synthetic: fresh `git init`, fixed authors, dates relative to the build time, and no
 * global or system git config.
 */
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { arg } from "../../cli"
import { SCENARIOS, type Person, type Scenario } from "./scenarios"

const HERE = import.meta.dir
const DAY_MS = 86_400_000
const BUILD_TIME = Math.floor(Date.now() / 60_000) * 60_000

const SEALED_ENV: NodeJS.ProcessEnv = {
  ...process.env,
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_TERMINAL_PROMPT: "0",
}

function git(cwd: string, args: string[], env: NodeJS.ProcessEnv = {}): string {
  const r = spawnSync("git", args, { cwd, env: { ...SEALED_ENV, ...env }, encoding: "utf8" })
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} (in ${cwd}) failed:\n${r.stderr}`)
  return r.stdout.trim()
}

function dateEnv(daysAgo: number, who: Person): NodeJS.ProcessEnv {
  const iso = new Date(BUILD_TIME - daysAgo * DAY_MS).toISOString()
  return {
    GIT_AUTHOR_NAME: who.name,
    GIT_AUTHOR_EMAIL: who.email,
    GIT_AUTHOR_DATE: iso,
    GIT_COMMITTER_NAME: who.name,
    GIT_COMMITTER_EMAIL: who.email,
    GIT_COMMITTER_DATE: iso,
  }
}

function isoDaysAgo(daysAgo: number): string {
  return new Date(BUILD_TIME - daysAgo * DAY_MS).toISOString().replace(/\.\d{3}Z$/, "Z")
}

type Built = { mergeCommits: Record<number, { mergeCommit: string; head: string }>; authorCommit?: string }

function buildSeed(seed: string, s: Scenario): Built {
  git(seed, ["init", "-q", "-b", "main"])
  git(seed, ["config", "commit.gpgsign", "false"])
  const built: Built = { mergeCommits: {} }
  for (const step of s.steps) {
    if (step.op === "branch") {
      git(seed, ["checkout", "-q", "-b", step.name])
    } else if (step.op === "checkout") {
      git(seed, ["checkout", "-q", step.name])
    } else if (step.op === "merge") {
      const head = git(seed, ["rev-parse", step.branch])
      git(seed, ["merge", "-q", "--no-ff", "-m", step.message, step.branch], dateEnv(step.day, step.author))
      if (step.pr !== undefined) built.mergeCommits[step.pr] = { mergeCommit: git(seed, ["rev-parse", "HEAD"]), head }
    } else {
      for (const [from, to] of step.move ?? []) {
        fs.mkdirSync(path.dirname(path.join(seed, to)), { recursive: true })
        git(seed, ["mv", from, to])
      }
      for (const rel of step.remove ?? []) git(seed, ["rm", "-q", "-r", rel])
      for (const [rel, body] of Object.entries(step.write ?? {})) {
        fs.mkdirSync(path.dirname(path.join(seed, rel)), { recursive: true })
        fs.writeFileSync(path.join(seed, rel), body)
        git(seed, ["add", rel])
      }
      git(seed, ["commit", "-q", "--allow-empty-message", "-m", step.message], dateEnv(step.day, step.author))
    }
  }
  if (s.leaseRace) {
    const { author, day, message, write } = s.leaseRace
    git(seed, ["checkout", "-q", s.pr.branch])
    for (const [rel, body] of Object.entries(write)) {
      fs.writeFileSync(path.join(seed, rel), body)
      git(seed, ["add", rel])
    }
    git(seed, ["commit", "-q", "-m", message], dateEnv(day, author))
    built.authorCommit = git(seed, ["rev-parse", "HEAD"])
    git(seed, ["reset", "-q", "--hard", "HEAD~1"])
    git(seed, ["checkout", "-q", "main"])
  }
  return built
}

function installExecutable(src: string, dest: string) {
  fs.copyFileSync(src, dest)
  fs.chmodSync(dest, 0o755)
}

function buildScenario(outRoot: string, s: Scenario) {
  const dir = path.join(outRoot, s.name)
  if (fs.existsSync(dir)) throw new Error(`${dir} already exists; pass a fresh --out`)
  fs.mkdirSync(path.join(dir, "bin"), { recursive: true })
  const seed = fs.mkdtempSync(path.join(os.tmpdir(), "babysit-stale-seed-"))
  try {
    const built = buildSeed(seed, s)

    const remote = path.join(dir, "remote.git")
    git(dir, ["init", "-q", "--bare", "-b", "main", remote])
    git(remote, ["config", "core.logAllRefUpdates", "always"])
    git(seed, ["push", "-q", remote, "refs/heads/main:refs/heads/main", `refs/heads/${s.pr.branch}:refs/heads/${s.pr.branch}`])
    git(remote, ["update-ref", `refs/pull/${s.pr.number}/head`, `refs/heads/${s.pr.branch}`])
    for (const [num, m] of Object.entries(built.mergeCommits)) {
      git(seed, ["push", "-q", remote, `${m.head}:refs/pull/${num}/head`])
    }
    if (built.authorCommit) {
      // Lands the object in remote.git without leaving a ref the agent could fetch.
      git(seed, ["push", "-q", remote, `${built.authorCommit}:refs/staging/author`])
      git(remote, ["update-ref", "-d", "refs/staging/author"])
    }
    // GitHub moves refs/pull/<N>/head when the head branch moves; mirror that.
    const hook = path.join(remote, "hooks", "post-receive")
    fs.writeFileSync(
      hook,
      `#!/bin/sh
while read old new ref; do
  if [ "$ref" = "refs/heads/${s.pr.branch}" ] && [ "$new" != "0000000000000000000000000000000000000000" ]; then
    git update-ref -m "pull ref sync" "refs/pull/${s.pr.number}/head" "$new"
  fi
done
`,
    )
    fs.chmodSync(hook, 0o755)

    const work = path.join(dir, "work")
    git(dir, ["clone", "-q", remote, work])
    git(work, ["config", "user.name", s.maintainer.name])
    git(work, ["config", "user.email", s.maintainer.email])
    git(work, ["config", "commit.gpgsign", "false"])
    git(work, ["config", "tag.gpgsign", "false"])
    git(work, ["checkout", "-q", "-b", s.pr.branch, "--track", `origin/${s.pr.branch}`])

    installExecutable(path.join(HERE, "fake-gh.py"), path.join(dir, "bin", "gh"))
    installExecutable(path.join(HERE, "fake-git.py"), path.join(dir, "bin", "git"))

    const pr = (p: Scenario["pr"], extra: Record<string, unknown> = {}) => ({
      number: p.number,
      title: p.title,
      body: p.body,
      author: p.author,
      headRefName: p.branch,
      baseRefName: "main",
      createdAt: isoDaysAgo(p.createdDay),
      updatedAt: isoDaysAgo(p.updatedDay ?? p.createdDay),
      labels: p.labels ?? [],
      ...extra,
    })
    const ghData = {
      owner: s.owner,
      repo: s.repo,
      host: "github.com",
      description: s.description,
      viewer: s.maintainer.login,
      pr: { ...pr(s.pr), state: "OPEN" },
      prs: (s.mergedPrs ?? []).map((m) =>
        pr(m, {
          state: "MERGED",
          mergeCommit: built.mergeCommits[m.number].mergeCommit,
          headRefOid: built.mergeCommits[m.number].head,
          mergedAt: isoDaysAgo(m.mergedDay),
          mergedBy: s.maintainer.login,
        }),
      ),
    }
    fs.writeFileSync(path.join(dir, "gh-data.json"), `${JSON.stringify(ghData, null, 2)}\n`)

    const head = git(remote, ["rev-parse", `refs/heads/${s.pr.branch}`])
    const base = git(remote, ["rev-parse", "refs/heads/main"])
    if (s.leaseRace && built.authorCommit) {
      fs.writeFileSync(
        path.join(dir, "lease-race.json"),
        `${JSON.stringify({ branch: s.pr.branch, pr: s.pr.number, expected_old: head, author_commit: built.authorCommit }, null, 2)}\n`,
      )
    }
    const scenario = {
      name: s.name,
      pr: s.pr.number,
      repo: `${s.owner}/${s.repo}`,
      head_branch: s.pr.branch,
      expected: s.expected,
      task: s.task,
      initial: { head, base, merge_base: git(remote, ["merge-base", head, base]) },
      ...(built.authorCommit ? { author_commit: built.authorCommit } : {}),
    }
    fs.writeFileSync(path.join(dir, "scenario.json"), `${JSON.stringify(scenario, null, 2)}\n`)
    return scenario
  } finally {
    fs.rmSync(seed, { recursive: true, force: true })
  }
}

function main() {
  const out = arg("--out")
  if (!out) {
    console.error(`usage: bun ${path.relative(process.cwd(), import.meta.path)} --out <dir> [--scenario <name>]\nscenarios: ${SCENARIOS.map((s) => s.name).join(", ")}`)
    process.exit(2)
  }
  const only = arg("--scenario")
  const selected = only ? SCENARIOS.filter((s) => s.name === only) : SCENARIOS
  if (selected.length === 0) {
    console.error(`unknown scenario ${only}; want one of ${SCENARIOS.map((s) => s.name).join(", ")}`)
    process.exit(2)
  }
  const outRoot = path.resolve(out)
  const repoRoot = path.resolve(HERE, "../../../..")
  if (outRoot === repoRoot || outRoot.startsWith(`${repoRoot}${path.sep}`)) {
    console.error("--out must be outside this repository, so an agent cannot reach the pack from the fixture")
    process.exit(2)
  }
  fs.mkdirSync(outRoot, { recursive: true })
  for (const s of selected) {
    const built = buildScenario(outRoot, s)
    console.log(`${s.name}\tPR #${built.pr}\thead ${built.initial.head.slice(0, 9)}\tbase ${built.initial.base.slice(0, 9)}\t${path.join(outRoot, s.name)}`)
  }
}

main()
