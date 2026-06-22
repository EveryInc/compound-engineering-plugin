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
})
