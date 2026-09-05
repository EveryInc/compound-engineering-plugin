import { test } from "bun:test"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const integrationTest = (name: string, body: () => void) => test(name, body, 30_000)

// Unix shell/process support matches the existing runner. No live model, network,
// personal configuration or real credentials are used by these subprocess tests.
function fixture(work: (ctx: ReturnType<typeof make>) => void) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ce-collector-test-"))
  try { work(make(root)) } finally { fs.rmSync(root, { recursive: true, force: true }) }
}

function make(root: string) {
  const repo = path.join(root, "repo")
  const dir = path.join(repo, "tests", "skill-eval-cell")
  const bin = path.join(root, "bin")
  fs.mkdirSync(dir, { recursive: true }); fs.mkdirSync(bin)
  for (const name of ["run.ts", "pack.ts", "regrade.ts", "provenance.ts", "grade.ts", "hosts.ts", "extract.ts", "cli.ts", "path-shim.ts"]) {
    fs.copyFileSync(path.join(import.meta.dir, name), path.join(dir, name))
  }
  fs.mkdirSync(path.join(repo, "skills", "fixture"), { recursive: true })
  fs.writeFileSync(path.join(repo, "skills", "fixture", "SKILL.md"), "fixture skill")
  const catalog = path.join(dir, "catalog.ts")
  fs.writeFileSync(catalog, `export const POST_SWEEP_REF = "WORKTREE";
export const PRE_SWEEP_REF = "HEAD";
export const rows = [
{id:"fixture/pass",skill:"fixture",cohort:"untouched",key_behavior:"judgment",read_only:true,task:"task",grade:{must_include:["proof"],actions:"none"}},
{id:"fixture/missing",skill:"does-not-exist",cohort:"untouched",key_behavior:"judgment",read_only:true,task:"task",grade:{must_include:["proof"]}},
{id:"fixture/after-failure",skill:"fixture",cohort:"untouched",key_behavior:"judgment",read_only:true,task:"task",grade:{must_include:["proof"]}},
];
export const scenariosMatching = ({id}) => rows.filter(r => !id || r.id === id);
export const scenarioById = id => rows.find(r => r.id === id);
`)
  const fake = path.join(bin, "codex")
  fs.writeFileSync(fake, `#!/bin/sh
if [ "$1" = "--version" ]; then echo 'codex fixture-cli'; exit 0; fi
if [ "$CE_FAKE_MODE" = "timeout" ]; then sleep 5; fi
if [ "$CE_FAKE_MODE" = "nonzero" ]; then echo 'failure' >&2; exit 7; fi
printf 'proof\\nFILES_READ: SKILL.md\\nACTIONS: none\\nDELEGATES_DISPATCHED: none\\n'
`, { mode: 0o755 })
  const executable = process.execPath
  const env = { ...process.env, PATH: `${bin}${path.delimiter}${path.dirname(executable)}${path.delimiter}${process.env.PATH ?? ""}` }
  const call = (script: string, args: string[], moreEnv: NodeJS.ProcessEnv = {}) => spawnSync(executable, [path.join(dir, script), ...args], {
    cwd: repo, env: { ...env, ...moreEnv }, encoding: "utf8", timeout: 20000,
  })
  const collect = (out: string, more: string[] = [], moreEnv: NodeJS.ProcessEnv = {}) => call("run.ts", [
    "--skill", "fixture", "--hosts", "codex", "--task", "task", "--read-only", "--out", out, ...more,
  ], moreEnv)
  const pack = (out: string, more: string[] = []) => call("pack.ts", ["--hosts", "codex", "--arm", "post", "--out", out, ...more])
  return { root, repo, dir, bin, fake, catalog, call, collect, pack }
}

if (process.platform !== "win32") {
  integrationTest("collector writes actual input hashes, host metadata and sealed evidence", () => fixture(({ root, collect }) => {
    const out = path.join(root, "cell")
    const result = collect(out)
    assert.equal(result.status, 0, result.stderr)
    const input = JSON.parse(fs.readFileSync(path.join(out, "input-manifest.json"), "utf8"))
    assert.equal(input.requested_ref, "WORKTREE")
    assert.equal(input.source_commit_is_skill_identity, false)
    assert.equal(input.skill.sha256.length, 64)
    assert.equal(input.observed_model, null)
    const runtime = JSON.parse(fs.readFileSync(path.join(out, "hosts/codex/runtime.json"), "utf8"))
    assert.equal(runtime.version, "codex fixture-cli")
    assert.equal(runtime.observed_model, null)
    assert.ok(fs.existsSync(path.join(out, "evidence-manifest.json")))
  }))

  integrationTest("collector refuses output reuse and keeps previous stdout", () => fixture(({ root, collect }) => {
    const out = path.join(root, "cell")
    assert.equal(collect(out).status, 0)
    const evidence = path.join(out, "hosts/codex/stdout.txt")
    const before = fs.readFileSync(evidence)
    const rerun = collect(out)
    assert.notEqual(rerun.status, 0)
    assert.match(rerun.stderr, /empty/)
    assert.deepEqual(fs.readFileSync(evidence), before)
  }))

  integrationTest("frozen criteria survive catalog changes across fresh regrade processes", () => fixture(({ root, catalog, call, pack }) => {
    const out = path.join(root, "pack")
    const result = pack(out, ["--id", "fixture/pass"])
    assert.equal(result.status, 0, result.stderr)
    const source = path.join(out, "pack.json"), before = fs.readFileSync(source)
    fs.writeFileSync(catalog, fs.readFileSync(catalog, "utf8").replaceAll('["proof"]', '["new criterion absent from output"]'))
    const regraded = call("regrade.ts", [source])
    assert.equal(regraded.status, 0, regraded.stderr)
    assert.deepEqual(fs.readFileSync(source), before)
    assert.notEqual(regraded.stdout.trim(), source)
  }))

  integrationTest("failed collection preserves partial pack and does not stop later bookkeeping", () => fixture(({ root, pack }) => {
    const out = path.join(root, "pack")
    const result = pack(out)
    assert.equal(result.status, 1, result.stderr)
    const recorded = JSON.parse(fs.readFileSync(path.join(out, "pack.json"), "utf8"))
    assert.equal(recorded.scenarios["fixture/pass"].arms.post.status, "graded")
    assert.equal(recorded.scenarios["fixture/pass"].arms.post.ok, true)
    assert.equal(recorded.scenarios["fixture/missing"].arms.post.status, "collection-error")
    assert.equal(recorded.scenarios["fixture/after-failure"].arms.post.status, "graded")
    assert.equal(recorded.scenarios["fixture/after-failure"].arms.post.ok, true)
    assert.ok(recorded.finished_at)
  }))

  integrationTest("pack refuses nonempty output before changing an original result", () => fixture(({ root, pack }) => {
    const out = path.join(root, "pack")
    assert.equal(pack(out, ["--id", "fixture/pass"]).status, 0)
    const before = fs.readFileSync(path.join(out, "pack.json"))
    assert.notEqual(pack(out, ["--id", "fixture/pass"]).status, 0)
    assert.deepEqual(fs.readFileSync(path.join(out, "pack.json")), before)
  }))

  integrationTest("pack refuses unsealed workspace criteria before launching a host", () => fixture(({ root, catalog, pack }) => {
    fs.writeFileSync(catalog, fs.readFileSync(catalog, "utf8").replaceAll(
      'grade:{must_include:["proof"]',
      'grade:{workspace_contains:[{path:".git/config",needle:"proof"}],must_include:["proof"]',
    ))
    const out = path.join(root, "unsealed")
    assert.equal(pack(out, ["--id", "fixture/pass"]).status, 1)
    const recorded = JSON.parse(fs.readFileSync(path.join(out, "pack.json"), "utf8"))
    const arm = recorded.scenarios["fixture/pass"].arms.post
    assert.equal(arm.status, "collection-error")
    assert.match(arm.error, /unsealed workspace grade path/)
    assert.equal(fs.existsSync(path.join(out, "fixture__pass/post")), false)
  }))

  integrationTest("CLI regrading detects changed evidence and produces no success report", () => fixture(({ root, pack, call }) => {
    const out = path.join(root, "pack")
    assert.equal(pack(out, ["--id", "fixture/pass"]).status, 0)
    fs.writeFileSync(path.join(out, "fixture__pass/post/hosts/codex/stdout.txt"), "tampered")
    const result = call("regrade.ts", [path.join(out, "pack.json")])
    assert.equal(result.status, 2)
    assert.match(result.stderr, /evidence/)
    assert.equal(fs.readdirSync(out).filter(f => f.includes(".regrade-")).length, 0)
  }))

  integrationTest("collector records timeouts separately from completed host processes", () => fixture(({ root, collect }) => {
    const out = path.join(root, "timeout")
    const result = collect(out, ["--timeout-secs", "0.1"], { CE_FAKE_MODE: "timeout" })
    assert.equal(result.status, 0, result.stderr)
    const exit = JSON.parse(fs.readFileSync(path.join(out, "hosts/codex/exit.json"), "utf8"))
    assert.equal(exit.timedOut, true)
    assert.equal(exit.exitCode, null)
    const summary = JSON.parse(fs.readFileSync(path.join(out, "summary.json"), "utf8"))
    assert.equal(summary.cells.codex.process_outcome, "timeout")
  }))

  integrationTest("CLI absence never produces a pass", () => fixture(({ root, bin, fake, collect }) => {
    fs.unlinkSync(fake)
    // Do not fall through to a contributor's installed, authenticated host CLI.
    const result = collect(path.join(root, "missing"), [], { PATH: bin })
    assert.equal(result.status, 2, result.stderr)
    assert.match(result.stderr, /no harness/)
  }))

  integrationTest("nonzero host exits retain diagnostic evidence", () => fixture(({ root, collect }) => {
    const out = path.join(root, "nonzero")
    assert.equal(collect(out, [], { CE_FAKE_MODE: "nonzero" }).status, 0)
    const exit = JSON.parse(fs.readFileSync(path.join(out, "hosts/codex/exit.json"), "utf8"))
    assert.equal(exit.exitCode, 7)
    assert.match(fs.readFileSync(path.join(out, "hosts/codex/stderr.txt"), "utf8"), /failure/)
  }))

  integrationTest("mutable refs resolve to a recorded commit and exclude uncommitted skill edits", () => fixture(({ root, repo, collect }) => {
    const git = (args: string[]) => {
      const result = spawnSync("git", args, { cwd: repo, encoding: "utf8" })
      assert.equal(result.status, 0, result.stderr)
      return result.stdout.trim()
    }
    git(["init", "-b", "main"])
    git(["config", "user.name", "Eval fixture"])
    git(["config", "user.email", "eval@example.invalid"])
    git(["add", "."])
    git(["commit", "-m", "fixture"])
    const commit = git(["rev-parse", "HEAD"])
    fs.writeFileSync(path.join(repo, "skills/fixture/SKILL.md"), "uncommitted change")
    const out = path.join(root, "committed")
    const result = collect(out, ["--ref", "HEAD"])
    assert.equal(result.status, 0, result.stderr)
    const input = JSON.parse(fs.readFileSync(path.join(out, "input-manifest.json"), "utf8"))
    assert.equal(input.source_commit, commit)
    assert.equal(input.requested_ref, "HEAD")
    assert.equal(input.source_commit_is_skill_identity, true)
    assert.equal(fs.readFileSync(path.join(out, "extract/skills/fixture/SKILL.md"), "utf8"), "fixture skill")
  }))

  integrationTest("WORKTREE identity includes modified and untracked skill bytes", () => fixture(({ root, repo, collect }) => {
    const first = path.join(root, "first")
    assert.equal(collect(first).status, 0)
    const before = JSON.parse(fs.readFileSync(path.join(first, "input-manifest.json"), "utf8"))
    fs.writeFileSync(path.join(repo, "skills/fixture/SKILL.md"), "modified skill")
    fs.writeFileSync(path.join(repo, "skills/fixture/new-reference.md"), "untracked reference")
    const second = path.join(root, "second")
    assert.equal(collect(second).status, 0)
    const after = JSON.parse(fs.readFileSync(path.join(second, "input-manifest.json"), "utf8"))
    assert.notEqual(after.skill.sha256, before.skill.sha256)
    assert.equal(fs.readFileSync(path.join(second, "extract/skills/fixture/SKILL.md"), "utf8"), "modified skill")
    assert.equal(fs.readFileSync(path.join(second, "extract/skills/fixture/new-reference.md"), "utf8"), "untracked reference")
  }))

  integrationTest("invalid timeout is rejected before collecting", () => fixture(({ root, collect }) => {
    for (const value of ["0", "-1", "NaN", "Infinity"]) {
      assert.notEqual(collect(path.join(root, `invalid-${value}`), ["--timeout-secs", value]).status, 0)
    }
  }))
}
