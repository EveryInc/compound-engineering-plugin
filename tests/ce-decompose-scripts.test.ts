import { describe, expect, test } from "bun:test"
import path from "path"

const SCRIPTS_DIR = path.join(
  __dirname,
  "../plugins/compound-engineering/skills/ce-decompose-beta/scripts"
)
const FIXTURES_DIR = path.join(__dirname, "fixtures/ce-decompose")

async function runScript(
  scriptName: string,
  args: string[] = []
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const scriptPath = path.join(SCRIPTS_DIR, scriptName)
  const proc = Bun.spawn(["python3", scriptPath, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  })
  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()
  const exitCode = await proc.exited
  return { stdout, stderr, exitCode }
}

async function compute(fixture: string) {
  const { stdout, exitCode } = await runScript("graph_compute.py", [
    path.join(FIXTURES_DIR, fixture),
  ])
  return { result: JSON.parse(stdout), exitCode }
}

function kinds(result: any): string[] {
  return result.findings.map((f: any) => f.kind)
}

describe("graph_compute.py", () => {
  test("valid graph: clean, exit 0", async () => {
    const { result, exitCode } = await compute("valid")
    expect(exitCode).toBe(0)
    expect(result.findings).toHaveLength(0)
    expect(result.schema_version).toBe(1)
    expect(result.node_count).toBe(6)
  })

  test("valid graph: detects a multi-root forest", async () => {
    const { result } = await compute("valid")
    expect(result.is_forest).toBe(true)
    expect(result.roots.sort()).toEqual(["n1", "n7"])
  })

  test("valid graph: critical path runs through the longest chain", async () => {
    const { result } = await compute("valid")
    expect(result.critical_path).toEqual(["n1", "n2", "n3", "n6"])
    // n7 is an independent root off the critical path → positive slack
    expect(result.per_node.n7.slack).toBeGreaterThan(0)
    expect(result.per_node.n7.critical).toBe(false)
  })

  test("valid graph: brief and no_pr nodes report dependency-check skipped", async () => {
    const { result } = await compute("valid")
    expect(result.dependency_checks.n6).toContain("brief")
    expect(result.dependency_checks.n10).toContain("no_pr")
    expect(result.dependency_checks.n1).toBe("checked")
  })

  test("valid graph: mirror-suppression keeps the coherent hub from flagging", async () => {
    // n3 spans 5 directories but declares it mirrors an existing module
    const { result } = await compute("valid")
    expect(kinds(result)).not.toContain("possible_over_decomposition")
  })

  test("cycle: flagged as correctness, exit 1, no partial topo", async () => {
    const { result, exitCode } = await compute("cycle")
    expect(exitCode).toBe(1)
    expect(kinds(result)).toContain("cycle")
    expect(result.critical_path).toHaveLength(0)
  })

  test("missing dependency: modify of a created file with no edge is flagged", async () => {
    const { result, exitCode } = await compute("missing-dep")
    expect(exitCode).toBe(1)
    expect(kinds(result)).toContain("missing_dependency")
  })

  test("orphans: missing referenced file and unreferenced node file both flagged", async () => {
    const { result, exitCode } = await compute("orphans")
    expect(exitCode).toBe(1)
    expect(kinds(result)).toContain("orphan_index_entry")
    expect(kinds(result)).toContain("orphan_node_file")
  })

  test("determinism: same input yields identical output across runs", async () => {
    const a = await compute("valid")
    const b = await compute("valid")
    expect(JSON.stringify(a.result)).toBe(JSON.stringify(b.result))
  })

  test("usage error: missing project dir exits 2", async () => {
    const { exitCode } = await runScript("graph_compute.py", [])
    expect(exitCode).toBe(2)
  })

  test("malformed table missing the |---| separator still parses every node (no silent drop)", async () => {
    // Regression: a separator-less table once dropped its first data row, cascading
    // into bogus unknown_dependency + orphan findings. Surfaced by a skill-creator eval.
    const { result } = await compute("no-separator")
    expect(result.node_count).toBe(2)
    expect(result.findings).toHaveLength(0)
  })

  test("optional prose preamble above the table parses clean (title + locked decisions)", async () => {
    // Real-world runs write a project title + "Decisions locked" block above the
    // table; the parser must read the table by |-lines and skip the prose.
    const { result, exitCode } = await compute("with-preamble")
    expect(exitCode).toBe(0)
    expect(result.schema_version).toBe(1)
    expect(result.node_count).toBe(2)
    expect(result.findings).toHaveLength(0)
  })

  test("golden fixture (real LAB-867 decomposition) parses clean", async () => {
    const { result, exitCode } = await compute("golden")
    expect(exitCode).toBe(0)
    expect(result.findings).toHaveLength(0)
    expect(result.node_count).toBe(10)
    expect(result.is_forest).toBe(true)
    expect(result.roots.sort()).toEqual(["n1", "n7"])
    // canopy is delivered live only at the ops node n10, on the critical path
    expect(result.critical_path[result.critical_path.length - 1]).toBe("n10")
    // brief/plan and no_pr nodes are reported skipped, not silently passed
    expect(result.dependency_checks.n6).toContain("skip")
    expect(result.dependency_checks.n10).toContain("no_pr")
  })
})

describe("reorient.py", () => {
  async function reorient(args: string[]) {
    const { stdout, exitCode } = await runScript("reorient.py", args)
    return { result: JSON.parse(stdout), exitCode }
  }

  const FIX = path.join(FIXTURES_DIR, "reorient")
  const FACTS = path.join(FIX, "facts.json")

  test("derives every state-machine branch from facts", async () => {
    const { result, exitCode } = await reorient([FIX, "--facts", FACTS])
    expect(exitCode).toBe(0)
    const s = result.nodes
    expect(s.n1.status).toBe("not-started") // no branch
    expect(s.n2.status).toBe("in-progress") // branch + commits, no PR
    expect(s.n3.status).toBe("in-review") // one open PR
    expect(s.n4.status).toBe("done") // one merged PR
    expect(s.n5.status).toBe("in-review") // 2 merged + 1 open -> not done
    expect(s.n6.status).toBe("done") // all merged
  })

  test("manual_status pin overrides derivation", async () => {
    const { result } = await reorient([FIX, "--facts", FACTS])
    expect(result.nodes.n7.status).toBe("done") // pinned, no PR
    expect(result.nodes.n8.status).toBe("blocked") // pinned
  })

  test("no_pr node awaits manual completion, never derives done from git", async () => {
    const { result } = await reorient([FIX, "--facts", FACTS])
    expect(result.nodes.n9.status).toBe("not-started")
    expect(result.nodes.n9.annotation).toContain("manual completion")
  })

  test("ambiguous anchored-token match is flagged, not silently picked", async () => {
    const { result } = await reorient([FIX, "--facts", FACTS])
    expect(result.nodes.n10.status).toBe("not-started")
    expect(result.nodes.n10.annotation).toContain("ambiguous")
  })

  test("done node with a not-done no_pr dependent gets the activation annotation (F1)", async () => {
    const { result } = await reorient([FIX, "--facts", FACTS])
    expect(result.nodes.n4.status).toBe("done")
    expect(result.nodes.n4.annotation).toContain("awaiting activation by n11")
  })

  // NOTE: real mode (no --facts) shells out to live git/gh per node — slow and
  // network/auth-dependent, so it is not run in the automated suite. The pure
  // state machine above is the logic worth testing; real-mode I/O (base-branch
  // resolution, graceful "no PR" handling, pins-still-honored) is verified
  // manually. A fixture-git-repo harness for real mode is deferred (see plan).

  test("determinism: identical output across runs", async () => {
    const a = await reorient([FIX, "--facts", FACTS])
    const b = await reorient([FIX, "--facts", FACTS])
    expect(JSON.stringify(a.result)).toBe(JSON.stringify(b.result))
  })
})
