import { describe, expect, setDefaultTimeout, test } from "bun:test"

setDefaultTimeout(20_000)
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { HANDOFF_RECORDER, SHIM_LOG, installHandoffRecorder, installPathShims, writeHandoffProbeSkill } from "./path-shim"

describe("path shims", () => {
  test("git push records when the required marker does not match HEAD", () => {
    const cell = fs.mkdtempSync(path.join(os.tmpdir(), "ce-path-shim-"))
    const workspace = path.join(cell, "workspace")
    fs.mkdirSync(workspace)
    try {
      spawnSync("git", ["init", "-b", "main"], { cwd: workspace, encoding: "utf8" })
      spawnSync("git", ["config", "user.name", "CE"], { cwd: workspace, encoding: "utf8" })
      spawnSync("git", ["config", "user.email", "ce@example.test"], { cwd: workspace, encoding: "utf8" })
      fs.writeFileSync(path.join(workspace, "keep.txt"), "ok\n")
      spawnSync("git", ["add", "."], { cwd: workspace, encoding: "utf8" })
      spawnSync("git", ["commit", "-m", "seed"], { cwd: workspace, encoding: "utf8" })
      fs.writeFileSync(path.join(workspace, "new.txt"), "fresh\n")
      const env = {
        ...process.env,
        ...installPathShims(cell, [
          {
            bin: "git",
            subcommand: "push",
            exitCode: 1,
            stderr: "fatal: no configured remote",
            precondition: {
              kind: "git-head-marker",
              path: ".publish-gate-passed",
            },
          },
        ]),
      }
      fs.writeFileSync(path.join(workspace, ".publish-gate-passed"), "verified stale-head\n")
      const compound = spawnSync(
        "bash",
        ["--noprofile", "--norc", "-c", "git add new.txt && git commit -m add-new && git push origin HEAD"],
        { cwd: workspace, env, encoding: "utf8" },
      )
      expect(compound.status).not.toBe(0)
      expect(compound.stderr).toContain("fatal: no configured remote")
      const log = spawnSync("git", ["log", "--oneline", "-2"], { cwd: workspace, encoding: "utf8" })
      expect(log.stdout).toContain("add-new")
      const shimLog = fs.readFileSync(path.join(cell, ".bin", SHIM_LOG), "utf8")
      expect(shimLog).toContain("precondition-missing git push")

      const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: workspace, encoding: "utf8" })
      fs.writeFileSync(path.join(workspace, ".publish-gate-passed"), `verified ${head.stdout.trim()}\n`)
      const contextual = spawnSync("git", ["-C", workspace, "push", "origin", "HEAD"], {
        cwd: cell,
        env,
        encoding: "utf8",
      })
      expect(contextual.status).toBe(1)
      const contextualLog = fs.readFileSync(path.join(cell, ".bin", SHIM_LOG), "utf8")
      expect(contextualLog.match(/precondition-missing/g)).toHaveLength(1)
      fs.unlinkSync(path.join(workspace, ".publish-gate-passed"))
      // The workspace the skill under test sees must not gain harness files.
      const status = spawnSync("git", ["status", "--porcelain"], { cwd: workspace, encoding: "utf8" })
      expect(status.stdout.trim()).toBe("")
      expect(fs.existsSync(path.join(workspace, ".bin"))).toBe(false)
    } finally {
      fs.rmSync(cell, { recursive: true, force: true })
    }
  })

  test("gh -R owner/repo pr list still hits the pr shim from another cwd", () => {
    const cell = fs.mkdtempSync(path.join(os.tmpdir(), "ce-path-shim-gh-"))
    const workspace = path.join(cell, "workspace")
    fs.mkdirSync(workspace)
    try {
      const env = {
        ...process.env,
        ...installPathShims(cell, [
          { bin: "gh", subcommand: "pr", exitCode: 1, stderr: "error: GitHub API failed" },
        ]),
      }
      const r = spawnSync("bash", ["--noprofile", "--norc", "-c", "gh -R example/tiny-lib pr list"], {
        cwd: workspace,
        env,
        encoding: "utf8",
      })
      expect(r.status).toBe(1)
      expect(r.stderr).toContain("GitHub API failed")
      expect(fs.existsSync(path.join(workspace, ".bin"))).toBe(false)
      // The attempt survives the failed call, so a forbidden command stays observable.
      const log = fs.readFileSync(path.join(cell, ".bin", SHIM_LOG), "utf8")
      expect(log).toContain("gh -R example/tiny-lib pr list")
    } finally {
      fs.rmSync(cell, { recursive: true, force: true })
    }
  })

  test("a handoff probe records the call it names, beside the gh shim", () => {
    const cell = fs.mkdtempSync(path.join(os.tmpdir(), "ce-handoff-probe-"))
    try {
      const skillMd = fs.readFileSync(
        path.join(writeHandoffProbeSkill(path.join(cell, "skills", "ce-babysit-pr"), "ce-babysit-pr"), "SKILL.md"),
        "utf8",
      )
      expect(skillMd).toContain(`${HANDOFF_RECORDER} ce-babysit-pr`)
      const env = {
        ...process.env,
        ...installPathShims(cell, [{ bin: "gh", subcommand: "pr", exitCode: 1 }]),
        ...installHandoffRecorder(cell),
      }
      const run = spawnSync(HANDOFF_RECORDER, ["ce-babysit-pr", "https://github.com/acme/widgets/pull/42"], {
        cwd: cell,
        env,
        encoding: "utf8",
      })
      expect(run.status).toBe(0)
      const log = fs.readFileSync(path.join(cell, ".bin", SHIM_LOG), "utf8")
      expect(log).toContain("handoff ce-babysit-pr https://github.com/acme/widgets/pull/42")
    } finally {
      fs.rmSync(cell, { recursive: true, force: true })
    }
  })
})
