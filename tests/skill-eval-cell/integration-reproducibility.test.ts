import { expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fingerprint } from "./provenance"

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
    expect(result.status, result.stderr).toBe(0)
    const input = JSON.parse(fs.readFileSync(path.join(out, "input-manifest.json"), "utf8"))
    expect(input.requested_ref).toBe("WORKTREE")
    expect(input.source_commit_is_skill_identity).toBe(false)
    expect(input.skill.sha256.length).toBe(64)
    expect(input.observed_model).toBe(null)
    const runtime = JSON.parse(fs.readFileSync(path.join(out, "hosts/codex/runtime.json"), "utf8"))
    expect(runtime.version).toBe("codex fixture-cli")
    expect(runtime.observed_model).toBe(null)
    expect(fs.existsSync(path.join(out, "evidence-manifest.json"))).toBeTruthy()
  }))

  integrationTest("collector refuses output reuse and keeps previous stdout", () => fixture(({ root, collect }) => {
    const out = path.join(root, "cell")
    expect(collect(out).status).toBe(0)
    const evidence = path.join(out, "hosts/codex/stdout.txt")
    const before = fs.readFileSync(evidence)
    const rerun = collect(out)
    expect(rerun.status).not.toBe(0)
    expect(rerun.stderr).toMatch(/empty/)
    expect(fs.readFileSync(evidence)).toEqual(before)
  }))

  integrationTest("regrading uses current criteria by default and original criteria on request", () => fixture(({ root, catalog, call, pack }) => {
    const out = path.join(root, "pack")
    const result = pack(out, ["--id", "fixture/pass"])
    expect(result.status, result.stderr).toBe(0)
    const source = path.join(out, "pack.json"), before = fs.readFileSync(source)
    fs.writeFileSync(catalog, fs.readFileSync(catalog, "utf8").replaceAll('["proof"]', '["new criterion absent from output"]'))
    const current = call("regrade.ts", [source])
    expect(current.status, current.stderr).toBe(1)
    const original = call("regrade.ts", [source, "--mode", "original"])
    expect(original.status, original.stderr).toBe(0)
    expect(fs.readFileSync(source)).toEqual(before)
    expect(current.stdout.trim()).not.toBe(original.stdout.trim())
    expect(JSON.parse(fs.readFileSync(current.stdout.trim(), "utf8")).mode).toBe("current")
    expect(JSON.parse(fs.readFileSync(original.stdout.trim(), "utf8")).mode).toBe("original")
  }))

  integrationTest("a corrected rubric reassesses preserved observations without replacing the original failure", () => fixture(({ root, catalog, call, pack }) => {
    const goodCatalog = fs.readFileSync(catalog, "utf8")
    fs.writeFileSync(catalog, goodCatalog.replaceAll('["proof"]', '["incorrect requirement"]'))
    const out = path.join(root, "pack")
    expect(pack(out, ["--id", "fixture/pass"]).status).toBe(1)
    const source = path.join(out, "pack.json"), before = fs.readFileSync(source)
    fs.writeFileSync(catalog, goodCatalog)
    const result = call("regrade.ts", [source])
    expect(result.status, result.stderr).toBe(0)
    const report = JSON.parse(fs.readFileSync(result.stdout.trim(), "utf8"))
    expect(report.scenarios["fixture/pass"].used_grade.must_include).toEqual(["proof"])
    expect(report.scenarios["fixture/pass"].used_grade_sha256).not.toBe(report.scenarios["fixture/pass"].original_grade_sha256)
    expect(JSON.parse(before.toString()).scenarios["fixture/pass"].arms.post.ok).toBe(false)
    expect(fs.readFileSync(source)).toEqual(before)
    expect(call("regrade.ts", [source, "--mode", "original"]).status).toBe(1)
  }))

  integrationTest("current criteria cannot replace the recorded task, controls, or fixture contents", () => fixture(({ root, repo, catalog, call, pack }) => {
    const fixtureDir = path.join(repo, "fixture")
    fs.mkdirSync(fixtureDir)
    fs.writeFileSync(path.join(fixtureDir, "context.txt"), "original context")
    const initialCatalog = fs.readFileSync(catalog, "utf8").replaceAll('task:"task"', 'task:"task",fixture:"fixture"')
    fs.writeFileSync(catalog, initialCatalog)
    const out = path.join(root, "pack")
    expect(pack(out, ["--id", "fixture/pass"]).status).toBe(0)
    const source = path.join(out, "pack.json"), before = fs.readFileSync(source)
    for (const [from, to] of [['task:"task"', 'task:"different task"'], ["read_only:true", "read_only:false"]]) {
      fs.writeFileSync(catalog, initialCatalog.replaceAll(from!, to!))
      const result = call("regrade.ts", [source])
      expect(result.status, result.stderr).toBe(1)
      const arm = JSON.parse(fs.readFileSync(result.stdout.trim(), "utf8")).scenarios["fixture/pass"].arms.post
      expect(arm.status).toBe("not-assessable")
      expect(arm.reason).toMatch(/task or collection controls changed/)
      expect(call("regrade.ts", [source, "--mode", "original"]).status).toBe(0)
    }
    fs.writeFileSync(catalog, initialCatalog)
    fs.writeFileSync(path.join(fixtureDir, "context.txt"), "changed context")
    const result = call("regrade.ts", [source])
    expect(result.status, result.stderr).toBe(1)
    const arm = JSON.parse(fs.readFileSync(result.stdout.trim(), "utf8")).scenarios["fixture/pass"].arms.post
    expect(arm.status).toBe("not-assessable")
    expect(arm.reason).toMatch(/fixture contents changed/)
    expect(call("regrade.ts", [source, "--mode", "original"]).status).toBe(0)
    expect(fs.readFileSync(path.join(out, "fixture__pass/post/workspace/context.txt"), "utf8")).toBe("original context")
    expect(fs.readFileSync(source)).toEqual(before)
  }))

  integrationTest("current mode uses changed grader code and original mode rejects it", () => fixture(({ root, dir, call, pack }) => {
    const out = path.join(root, "pack")
    expect(pack(out, ["--id", "fixture/pass"]).status).toBe(0)
    const source = path.join(out, "pack.json"), before = fs.readFileSync(source)
    const grader = path.join(dir, "grade.ts")
    fs.writeFileSync(grader, fs.readFileSync(grader, "utf8").replace(
      "const allReasons = [...reasons, ...pointer_reasons]",
      'const allReasons = [...reasons, ...pointer_reasons, "changed grader criterion"]',
    ))
    const current = call("regrade.ts", [source])
    expect(current.status, current.stderr).toBe(1)
    const report = JSON.parse(fs.readFileSync(current.stdout.trim(), "utf8"))
    expect(report.grader_changed).toBe(true)
    expect(report.scenarios["fixture/pass"].arms.post.grades[0].reasons).toContain("changed grader criterion")
    const original = call("regrade.ts", [source, "--mode", "original"])
    expect(original.status).toBe(2)
    expect(original.stderr).toMatch(/grader changed/)
    expect(fs.readdirSync(out).filter((name) => name.includes(".regrade-"))).toHaveLength(1)
    expect(fs.readFileSync(source)).toEqual(before)
  }))

  integrationTest("original mode remains available after the catalog scenario is removed", () => fixture(({ root, catalog, call, pack }) => {
    const out = path.join(root, "pack")
    expect(pack(out, ["--id", "fixture/pass"]).status).toBe(0)
    const source = path.join(out, "pack.json"), before = fs.readFileSync(source)
    fs.writeFileSync(catalog, fs.readFileSync(catalog, "utf8").replace('id:"fixture/pass"', 'id:"fixture/replacement"'))
    const current = call("regrade.ts", [source])
    expect(current.status, current.stderr).toBe(1)
    const arm = JSON.parse(fs.readFileSync(current.stdout.trim(), "utf8")).scenarios["fixture/pass"].arms.post
    expect(arm.status).toBe("not-assessable")
    expect(arm.reason).toMatch(/absent from the current catalog/)
    expect(call("regrade.ts", [source, "--mode", "original"]).status).toBe(0)
    expect(fs.readFileSync(source)).toEqual(before)
  }))

  integrationTest("invalid regrade modes fail without creating an assessment", () => fixture(({ root, call, pack }) => {
    const out = path.join(root, "pack")
    expect(pack(out, ["--id", "fixture/pass"]).status).toBe(0)
    const source = path.join(out, "pack.json"), before = fs.readFileSync(source)
    for (const flags of [["--mode", "unknown"], ["--mode"], ["--mode", "current", "--mode", "original"]]) {
      const result = call("regrade.ts", [source, ...flags])
      expect(result.status).toBe(2)
      expect(result.stderr).toMatch(/usage:/)
    }
    expect(fs.readdirSync(out).filter((name) => name.includes(".regrade-"))).toHaveLength(0)
    expect(fs.readFileSync(source)).toEqual(before)
  }))

  for (const [observer, criterion] of [["Git", 'git:"clean"'], ["command shims", 'shim_log_must_not:["git push"]']]) {
    integrationTest(`current mode requires ${observer} observations while original mode preserves the historical verdict`, () => fixture(({ root, catalog, call, pack }) => {
      fs.writeFileSync(catalog, fs.readFileSync(catalog, "utf8").replaceAll("grade:{", `grade:{${criterion},`))
      const out = path.join(root, "pack")
      // The original grader treated a missing observation as an empty, passing value.
      expect(pack(out, ["--id", "fixture/pass"]).status).toBe(0)
      const source = path.join(out, "pack.json"), before = fs.readFileSync(source)
      const current = call("regrade.ts", [source])
      expect(current.status, current.stderr).toBe(1)
      const arm = JSON.parse(fs.readFileSync(current.stdout.trim(), "utf8")).scenarios["fixture/pass"].arms.post
      expect(arm.status).toBe("not-assessable")
      expect(arm.reason).toMatch(/not collected|not installed/)
      const original = call("regrade.ts", [source, "--mode", "original"])
      expect(original.status, original.stderr).toBe(0)
      expect(JSON.parse(fs.readFileSync(original.stdout.trim(), "utf8")).scenarios["fixture/pass"].arms.post.status).toBe("regraded")
      expect(fs.readFileSync(source)).toEqual(before)
    }))
  }

  integrationTest("installed shims with no calls provide a valid negative observation", () => fixture(({ root, catalog, call, pack }) => {
    fs.writeFileSync(catalog, fs.readFileSync(catalog, "utf8").replaceAll(
      "grade:{", 'shim_git_push:true,grade:{shim_log_must_not:["git push"],',
    ))
    const out = path.join(root, "pack")
    expect(pack(out, ["--id", "fixture/pass"]).status).toBe(0)
    const shimDir = path.join(out, "fixture__pass/post/hosts/codex/.bin")
    expect(fs.existsSync(path.join(shimDir, "git"))).toBe(true)
    expect(fs.existsSync(path.join(shimDir, "shim-invocations.log"))).toBe(false)
    const result = call("regrade.ts", [path.join(out, "pack.json")])
    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(fs.readFileSync(result.stdout.trim(), "utf8")).scenarios["fixture/pass"].arms.post.status).toBe("regraded")
  }))

  integrationTest("Python imports use independent host copies while preserving and sealing every skill artifact", () => fixture(({ root, repo, bin, catalog, call }) => {
    const python = ["python3", "python", "py"].map((name) => Bun.which(name)).find((executable) =>
      executable && spawnSync(executable, ["-c", "import sys; assert sys.version_info.major == 3"], { timeout: 5000 }).status === 0,
    )
    expect(python, "a working Python 3 interpreter is required").toBeTruthy()
    fs.writeFileSync(catalog, fs.readFileSync(catalog, "utf8").replaceAll("read_only:true", "read_only:false"))
    const scripts = path.join(repo, "skills/fixture/scripts")
    fs.mkdirSync(scripts)
    fs.writeFileSync(path.join(scripts, "helper.py"), 'VALUE = "proof"\n')
    fs.writeFileSync(path.join(scripts, "main.py"), `import helper
from pathlib import Path
marker = Path(__file__).with_name("ran.txt")
assert not marker.exists(), "another host already used this skill copy"
marker.write_text("executed")
print(helper.VALUE)
print("ACTIONS: none")
`)
    const hostScript = path.join(root, "fake-host.py")
    fs.writeFileSync(hostScript, `import subprocess, sys
from pathlib import Path
if sys.argv[1:] == ["--version"]:
    print("fake Python host")
else:
    host = Path.cwd().parent
    first_line = (host / "prompt.md").read_text().splitlines()[0]
    skill = Path(first_line.removeprefix("Read the skill at ").removesuffix(" first.")).parent
    assert skill == host / "skill", "prompt must point to the host execution copy"
    subprocess.run([sys.executable, str(skill / "scripts/main.py")], check=True)
`)
    for (const host of ["codex", "claude"]) {
      fs.writeFileSync(path.join(bin, host), '#!/bin/sh\nexec "$CE_FAKE_PYTHON" "$CE_FAKE_HOST_SCRIPT" "$@"\n', { mode: 0o755 })
    }
    const out = path.join(root, "pack")
    const result = call("pack.ts", ["--hosts", "codex,claude", "--arm", "post", "--id", "fixture/pass", "--out", out], {
      CE_FAKE_PYTHON: python ?? undefined, CE_FAKE_HOST_SCRIPT: hostScript,
      PYTHONDONTWRITEBYTECODE: undefined, PYTHONPYCACHEPREFIX: undefined,
    })
    expect(result.status, result.stderr).toBe(0)
    const cell = path.join(out, "fixture__pass/post")
    const input = JSON.parse(fs.readFileSync(path.join(cell, "input-manifest.json"), "utf8"))
    const originalSkill = path.join(cell, "extract/skills/fixture")
    expect(fingerprint(originalSkill)).toEqual(input.skill)
    expect(fs.existsSync(path.join(originalSkill, "scripts/__pycache__"))).toBe(false)
    expect(fs.existsSync(path.join(originalSkill, "scripts/ran.txt"))).toBe(false)
    const caches: string[] = []
    for (const host of ["codex", "claude"]) {
      const executionScripts = path.join(cell, "hosts", host, "skill/scripts")
      expect(fs.readFileSync(path.join(executionScripts, "ran.txt"), "utf8")).toBe("executed")
      const cache = path.join(executionScripts, "__pycache__")
      const bytecode = fs.readdirSync(cache).find((name) => name.endsWith(".pyc"))
      expect(bytecode).toBeDefined()
      caches.push(path.join(cache, bytecode!))
    }
    const source = path.join(out, "pack.json"), before = fs.readFileSync(source)
    const regraded = call("regrade.ts", [source])
    expect(regraded.status, regraded.stderr).toBe(0)
    fs.appendFileSync(caches[0]!, "tampered")
    const tampered = call("regrade.ts", [source])
    expect(tampered.status).toBe(2)
    expect(tampered.stderr).toMatch(/evidence/)
    expect(fs.readFileSync(source)).toEqual(before)
  }))

  integrationTest("failed collection preserves partial pack and does not stop later bookkeeping", () => fixture(({ root, pack }) => {
    const out = path.join(root, "pack")
    const result = pack(out)
    expect(result.status, result.stderr).toBe(1)
    const recorded = JSON.parse(fs.readFileSync(path.join(out, "pack.json"), "utf8"))
    expect(recorded.scenarios["fixture/pass"].arms.post.status).toBe("graded")
    expect(recorded.scenarios["fixture/pass"].arms.post.ok).toBe(true)
    expect(recorded.scenarios["fixture/missing"].arms.post.status).toBe("collection-error")
    expect(recorded.scenarios["fixture/after-failure"].arms.post.status).toBe("graded")
    expect(recorded.scenarios["fixture/after-failure"].arms.post.ok).toBe(true)
    expect(recorded.finished_at).toBeTruthy()
  }))

  integrationTest("pack refuses nonempty output before changing an original result", () => fixture(({ root, pack }) => {
    const out = path.join(root, "pack")
    expect(pack(out, ["--id", "fixture/pass"]).status).toBe(0)
    const before = fs.readFileSync(path.join(out, "pack.json"))
    expect(pack(out, ["--id", "fixture/pass"]).status).not.toBe(0)
    expect(fs.readFileSync(path.join(out, "pack.json"))).toEqual(before)
  }))

  integrationTest("pack refuses unsealed workspace criteria before launching a host", () => fixture(({ root, catalog, pack }) => {
    fs.writeFileSync(catalog, fs.readFileSync(catalog, "utf8").replaceAll(
      'grade:{must_include:["proof"]',
      'grade:{workspace_contains:[{path:".git/config",needle:"proof"}],must_include:["proof"]',
    ))
    const out = path.join(root, "unsealed")
    expect(pack(out, ["--id", "fixture/pass"]).status).toBe(1)
    const recorded = JSON.parse(fs.readFileSync(path.join(out, "pack.json"), "utf8"))
    const arm = recorded.scenarios["fixture/pass"].arms.post
    expect(arm.status).toBe("collection-error")
    expect(arm.error).toMatch(/unsealed workspace grade path/)
    expect(fs.existsSync(path.join(out, "fixture__pass/post"))).toBe(false)
  }))

  integrationTest("CLI regrading detects changed evidence and produces no success report", () => fixture(({ root, pack, call }) => {
    const out = path.join(root, "pack")
    expect(pack(out, ["--id", "fixture/pass"]).status).toBe(0)
    fs.writeFileSync(path.join(out, "fixture__pass/post/hosts/codex/stdout.txt"), "tampered")
    const result = call("regrade.ts", [path.join(out, "pack.json")])
    expect(result.status).toBe(2)
    expect(result.stderr).toMatch(/evidence/)
    expect(fs.readdirSync(out).filter(f => f.includes(".regrade-")).length).toBe(0)
  }))

  integrationTest("collector records timeouts separately from completed host processes", () => fixture(({ root, collect }) => {
    const out = path.join(root, "timeout")
    const result = collect(out, ["--timeout-secs", "0.1"], { CE_FAKE_MODE: "timeout" })
    expect(result.status, result.stderr).toBe(0)
    const exit = JSON.parse(fs.readFileSync(path.join(out, "hosts/codex/exit.json"), "utf8"))
    expect(exit.timedOut).toBe(true)
    expect(exit.exitCode).toBe(null)
    const summary = JSON.parse(fs.readFileSync(path.join(out, "summary.json"), "utf8"))
    expect(summary.cells.codex.process_outcome).toBe("timeout")
  }))

  integrationTest("CLI absence never produces a pass", () => fixture(({ root, bin, fake, collect }) => {
    fs.unlinkSync(fake)
    // Do not fall through to a contributor's installed, authenticated host CLI.
    const result = collect(path.join(root, "missing"), [], { PATH: bin })
    expect(result.status, result.stderr).toBe(2)
    expect(result.stderr).toMatch(/no harness/)
  }))

  integrationTest("nonzero host exits retain diagnostic evidence", () => fixture(({ root, collect }) => {
    const out = path.join(root, "nonzero")
    expect(collect(out, [], { CE_FAKE_MODE: "nonzero" }).status).toBe(0)
    const exit = JSON.parse(fs.readFileSync(path.join(out, "hosts/codex/exit.json"), "utf8"))
    expect(exit.exitCode).toBe(7)
    expect(fs.readFileSync(path.join(out, "hosts/codex/stderr.txt"), "utf8")).toMatch(/failure/)
  }))

  integrationTest("mutable refs resolve to a recorded commit and exclude uncommitted skill edits", () => fixture(({ root, repo, collect }) => {
    const git = (args: string[]) => {
      const result = spawnSync("git", args, { cwd: repo, encoding: "utf8" })
      expect(result.status, result.stderr).toBe(0)
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
    expect(result.status, result.stderr).toBe(0)
    const input = JSON.parse(fs.readFileSync(path.join(out, "input-manifest.json"), "utf8"))
    expect(input.source_commit).toBe(commit)
    expect(input.requested_ref).toBe("HEAD")
    expect(input.source_commit_is_skill_identity).toBe(true)
    expect(fs.readFileSync(path.join(out, "extract/skills/fixture/SKILL.md"), "utf8")).toBe("fixture skill")
  }))

  integrationTest("WORKTREE identity includes modified and untracked skill bytes", () => fixture(({ root, repo, collect }) => {
    const first = path.join(root, "first")
    expect(collect(first).status).toBe(0)
    const before = JSON.parse(fs.readFileSync(path.join(first, "input-manifest.json"), "utf8"))
    fs.writeFileSync(path.join(repo, "skills/fixture/SKILL.md"), "modified skill")
    fs.writeFileSync(path.join(repo, "skills/fixture/new-reference.md"), "untracked reference")
    const second = path.join(root, "second")
    expect(collect(second).status).toBe(0)
    const after = JSON.parse(fs.readFileSync(path.join(second, "input-manifest.json"), "utf8"))
    expect(after.skill.sha256).not.toBe(before.skill.sha256)
    expect(fs.readFileSync(path.join(second, "extract/skills/fixture/SKILL.md"), "utf8")).toBe("modified skill")
    expect(fs.readFileSync(path.join(second, "extract/skills/fixture/new-reference.md"), "utf8")).toBe("untracked reference")
  }))

  integrationTest("invalid timeout is rejected before collecting", () => fixture(({ root, collect }) => {
    for (const value of ["0", "-1", "NaN", "Infinity"]) {
      expect(collect(path.join(root, `invalid-${value}`), ["--timeout-secs", value]).status).not.toBe(0)
    }
  }))
}
