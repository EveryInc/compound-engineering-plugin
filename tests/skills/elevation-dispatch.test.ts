import { afterAll, describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  symlinkSync,
  chmodSync,
  existsSync,
  realpathSync,
  rmSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

const tempRoots: string[] = []
function mkTempRoot(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix))
  tempRoots.push(dir)
  return dir
}
afterAll(() => {
  for (const dir of tempRoots) rmSync(dir, { recursive: true, force: true })
})

const REAL_TOOLS = [
  "bash", "sh", "jq", "date", "sed", "tr", "cat", "wc", "mktemp", "env",
  "sleep", "rm", "mv", "chmod", "printf", "kill", "tail", "grep",
]
function resolveRealToolPaths(): Array<[string, string]> {
  const out: Array<[string, string]> = []
  for (const tool of REAL_TOOLS) {
    const real = spawnSync("command", ["-v", tool], {
      encoding: "utf8",
      shell: "/bin/bash",
    }).stdout?.trim()
    if (real && existsSync(real)) out.push([tool, real])
  }
  return out
}
// Resolved once — PATH entries are static within a run, so re-forking
// `command -v` per sandbox() call would waste ~17 subprocesses each time.
const REAL_TOOL_PATHS = resolveRealToolPaths()

const WORKER = path.join(
  __dirname,
  "../../skills/ce-plan/scripts/elevation-dispatch.sh",
)
const BRAINSTORM_WORKER = path.join(
  __dirname,
  "../../skills/ce-brainstorm/scripts/elevation-dispatch.sh",
)

// Approval/bypass flags the read-only elevation call must never emit.
const NEVER_FLAGS = [
  "--dangerously-skip-permissions",
  "--yolo",
  "--force",
]

/** Sandbox PATH: real coreutils plus a stub `claude` with the given body.
 *  `omit` drops named tools from the PATH to exercise missing-capability paths. */
function sandbox(
  claudeStub: string,
  omit: string[] = [],
): { bin: string; env: NodeJS.ProcessEnv } {
  const bin = path.join(mkTempRoot("elevation-sandbox-"), "bin")
  mkdirSync(bin, { recursive: true })
  for (const [tool, real] of REAL_TOOL_PATHS) {
    if (omit.includes(tool)) continue
    if (existsSync(path.join(bin, tool))) continue
    try {
      symlinkSync(real, path.join(bin, tool))
    } catch {
      /* builtin — harmless */
    }
  }
  const f = path.join(bin, "claude")
  writeFileSync(f, claudeStub)
  chmodSync(f, 0o755)
  return { bin, env: { ...process.env, PATH: bin } }
}

/** Run the worker with a stub claude; returns the parsed result envelope + stderr. */
function runWorker(
  model: string,
  claudeStub: string,
  extraEnv: Record<string, string> = {},
  omit: string[] = [],
): { result: any; stderr: string; status: number | null } {
  const { bin, env } = sandbox(claudeStub, omit)
  const scratch = mkTempRoot("elevation-run-")
  const promptFile = path.join(scratch, "brief.md")
  const resultPath = path.join(scratch, "result.json")
  writeFileSync(promptFile, "author the plan from these findings")
  const r = spawnSync("bash", [WORKER, model, promptFile, resultPath], {
    encoding: "utf8",
    env: { CE_ELEVATION_POLL_SECS: "0.2", ...env, ...extraEnv },
  })
  const result = existsSync(resultPath)
    ? JSON.parse(readFileSync(resultPath, "utf8"))
    : null
  return { result, stderr: r.stderr ?? "", status: r.status }
}

const RESULT_LINE = (result: string, usage: Record<string, unknown> | null) =>
  JSON.stringify({
    type: "result",
    subtype: "success",
    result,
    ...(usage ? { modelUsage: usage } : {}),
  })

describe("elevation-dispatch worker", () => {
  test("both skill copies are byte-identical", () => {
    expect(readFileSync(WORKER, "utf8")).toBe(
      readFileSync(BRAINSTORM_WORKER, "utf8"),
    )
  })

  test("emits a streaming, read-only claude argv", () => {
    const r = spawnSync("bash", [WORKER, "--emit-adapter", "fable", "/fake/handoff/xyz"], {
      encoding: "utf8",
    })
    expect(r.status).toBe(0)
    const argv = (r.stdout ?? "").split("\0").filter(Boolean)
    expect(argv.slice(0, 4)).toEqual(["claude", "-p", "--model", "fable"])
    expect(argv).toContain("--effort")
    expect(argv).toContain("high")
    expect(argv).toContain("stream-json")
    expect(argv).toContain("--verbose")
    // one-shot background call — no resumable session left on disk
    expect(argv).toContain("--no-session-persistence")
    // read-only posture: --tools RESTRICTS the available built-in set to these
    // five (Write/Edit/Bash are not present at all — verified: --allowedTools
    // alone only pre-approves and leaves every other tool available), and
    // --allowedTools pre-approves the same five so --permission-mode dontAsk runs
    // them without a prompt. --tools is the real boundary; --allowedTools keeps
    // them functional. No denylist.
    expect(argv).toContain("--tools")
    expect(argv).toContain("Read,Glob,Grep,WebSearch,WebFetch")
    // handoff read access is scoped to the single per-run handoff dir passed to
    // build_cmd — exactly one --add-dir, and never the whole OS temp root.
    const di = argv.indexOf("--add-dir")
    expect(di).toBeGreaterThan(-1)
    expect(argv[di + 1]).toBe("/fake/handoff/xyz")
    expect(argv.filter((a) => a === "--add-dir").length).toBe(1)
    expect(argv).not.toContain("/tmp")
    const ai = argv.indexOf("--allowedTools")
    expect(ai).toBeGreaterThan(-1)
    for (const tool of ["Read", "Glob", "Grep", "WebSearch", "WebFetch"]) {
      expect(argv).toContain(tool)
    }
    expect(argv).not.toContain("--disallowedTools")
    for (const tool of ["Edit", "Write", "Bash", "Task"]) expect(argv).not.toContain(tool)
    for (const flag of NEVER_FLAGS) expect(argv).not.toContain(flag)
  })

  test("a matching receipt yields a matched envelope with the output", () => {
    const stub =
      "#!/bin/sh\n" +
      `printf '%s\\n' '${RESULT_LINE("PLAN BODY", { "claude-fable-5": { outputTokens: 5 } })}'\n`
    const { result } = runWorker("fable", stub)
    expect(result.status).toBe("ok")
    expect(result.output).toBe("PLAN BODY")
    expect(result.served_model).toBe("claude-fable-5")
    expect(result.receipt).toBe("matched")
  })

  test("grants read access to only the prompt's own dir, not the whole temp root", () => {
    // Security: the elevated model must see the per-run handoff dir (where the
    // orchestrator co-locates prompt + evidence) and nothing else in the temp
    // root. The worker derives --add-dir from the prompt-file's parent dir.
    const scratch = mkTempRoot("elevation-handoff-")
    const promptFile = path.join(scratch, "brief.md")
    const resultPath = path.join(scratch, "result.json")
    const argvDump = path.join(scratch, "argv.txt")
    writeFileSync(promptFile, "author the plan")
    const dumpStub =
      "#!/bin/sh\n" +
      `printf '%s\\n' "$*" > "${argvDump}"\n` +
      `printf '%s\\n' '${RESULT_LINE("OK", { "claude-fable-5": {} })}'\n`
    const { env } = sandbox(dumpStub)
    spawnSync("bash", [WORKER, "fable", promptFile, resultPath], {
      encoding: "utf8",
      env: { CE_ELEVATION_POLL_SECS: "0.2", ...env },
    })
    const argv = readFileSync(argvDump, "utf8")
    const m = argv.match(/--add-dir (\S+)/)
    expect(m).toBeTruthy()
    // realpath both sides — macOS pwd is logical (/var/...) vs realpath (/private/var/...)
    expect(realpathSync(m![1])).toBe(realpathSync(scratch))
    expect(argv).not.toMatch(/--add-dir \/tmp(\s|$)/)
    expect((argv.match(/--add-dir/g) || []).length).toBe(1)
  })

  test("missing jq exits 0 with a failure envelope, so the runner still emits it", () => {
    // jq is optional (ce-setup). The worker must NOT exit nonzero here: the
    // runner classifies a nonzero exit as `failed`, and its `result` command
    // then refuses to emit the artifact — the recovery flow could never read
    // this envelope. Exit 0 makes the job `done` so status:failed degrades
    // cleanly to inline.
    const stub =
      "#!/bin/sh\n" + `printf '%s\\n' '${RESULT_LINE("PLAN BODY", null)}'\n`
    const { result, status } = runWorker("fable", stub, {}, ["jq"])
    expect(status).toBe(0)
    expect(result.status).toBe("failed")
    expect(result.requested_model).toBe("fable")
  })

  test("a large plan is shipped intact — envelope build never passes it as an argv", () => {
    // Guards the ARG_MAX fix: the success envelope pipes the event THROUGH jq
    // rather than passing .result as `jq --arg o "$OUTPUT"`. A ~300KB plan would
    // exceed ARG_MAX and fail the exec if that regressed. printf is a shell
    // builtin, so emitting it from the stub is not itself argv-bounded.
    const big = "PLAN LINE. ".repeat(30000) // ~300KB, well past ARG_MAX
    const stub =
      "#!/bin/sh\n" +
      `printf '%s\\n' '${RESULT_LINE(big, { "claude-fable-5": { outputTokens: 5 } })}'\n`
    const { result } = runWorker("fable", stub)
    expect(result.status).toBe("ok")
    expect(result.output).toBe(big)
  })

  test("a truncated/error terminal result is failed, not shipped as ok", () => {
    // max-turns result still carries .result, but subtype/is_error mark it bad.
    const errLine = JSON.stringify({
      type: "result",
      subtype: "error_max_turns",
      is_error: true,
      result: "PARTIAL PLAN, cut off mid-",
      modelUsage: { "claude-fable-5": { outputTokens: 5 } },
    })
    const stub = "#!/bin/sh\n" + `printf '%s\\n' '${errLine}'\n`
    const { result } = runWorker("fable", stub)
    expect(result.status).toBe("failed")
  })

  test("a different served family is recorded as a mismatch", () => {
    const stub =
      "#!/bin/sh\n" +
      `printf '%s\\n' '${RESULT_LINE("PLAN BODY", { "claude-opus-4-8": { outputTokens: 5 } })}'\n`
    const { result } = runWorker("fable", stub)
    expect(result.status).toBe("ok")
    expect(result.served_model).toBe("claude-opus-4-8")
    expect(result.receipt).toBe("mismatch")
  })

  test("picks the requested family's key from a multi-key modelUsage, not keys[0]", () => {
    // jq `keys` is sorted, so keys[0] here is claude-haiku-*, an auxiliary
    // model — the served model for a requested opus is claude-opus-*.
    const stub =
      "#!/bin/sh\n" +
      `printf '%s\\n' '${RESULT_LINE("PLAN BODY", { "claude-haiku-4-5": { outputTokens: 1 }, "claude-opus-4-8": { outputTokens: 9 } })}'\n`
    const { result } = runWorker("opus", stub)
    expect(result.served_model).toBe("claude-opus-4-8")
    expect(result.receipt).toBe("matched")
  })

  test("an absent receipt is recorded as unverified, not the requested model", () => {
    const stub =
      "#!/bin/sh\n" + `printf '%s\\n' '${RESULT_LINE("PLAN BODY", null)}'\n`
    const { result } = runWorker("fable", stub)
    expect(result.status).toBe("ok")
    expect(result.served_model).toBe("unverified")
    expect(result.receipt).toBe("unverified")
  })

  // AE4 mechanism (deterministic): the idle window is a *reset-on-growth* window,
  // not a fixed timer — so a run that keeps growing $PEERLOG is never reaped. The
  // positive-timing version of this is an inherently flaky subprocess race (it
  // depends on interpreter startup latency vs the window), so the reset mechanism
  // is asserted here against the worker source; the stall direction is exercised
  // behaviorally by the heartbeat-only test below.
  test("the idle window resets on $PEERLOG growth", () => {
    const src = readFileSync(WORKER, "utf8")
    // size change updates lastchg; reap fires only on (now - lastchg) >= IDLE_SECS
    expect(src).toContain('size="$(wc -c <"$PEERLOG"')
    expect(src).toMatch(/\[ "\$size" != "\$last" \] && \{ last="\$size"; lastchg="\$now"; \}/)
    expect(src).toMatch(/now - lastchg \)\) -ge "\$IDLE_SECS"/)
  })

  // The P0 fix: the worker's own heartbeat must not mask a stalled model. A stub
  // that grows nothing on stdout (→ empty $PEERLOG) is reaped by the worker's
  // $PEERLOG idle window even while the heartbeat keeps firing to script stderr.
  test("a heartbeat-only stall is still reaped by the idle window", () => {
    const stub = "#!/bin/sh\nsleep 30\n"
    // idle window (3s) wider than the heartbeat interval (1s) so the heartbeat
    // fires repeatedly before the idle window reaps — proving it doesn't mask.
    const { result, stderr } = runWorker("fable", stub, {
      CE_ELEVATION_POLL_SECS: "0.2",
      CE_ELEVATION_IDLE_SECS: "3",
      CE_ELEVATION_HARD_SECS: "600",
      CROSS_MODEL_HEARTBEAT_SECS: "1",
    })
    expect(stderr).toContain("peer alive") // heartbeat fired
    expect(stderr).toContain("idle") // reaped by the idle window despite it
    expect(result.status).toBe("failed")
  }, 20000)
})
