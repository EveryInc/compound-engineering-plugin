import { describe, expect, test } from "bun:test"
import { promises as fs } from "fs"
import os from "os"
import path from "path"

// skills/ce-polish/scripts/detect-riffrec.sh against the two project fixtures
// under tests/fixtures/ce-polish-live/. Each run points the script at a
// throwaway copy so nothing inspects this checkout and node_modules can be
// added without being committed.

const detectRiffrec = path.join(import.meta.dir, "..", "..", "skills", "ce-polish", "scripts", "detect-riffrec.sh")
const fixturesDir = path.join(import.meta.dir, "..", "fixtures", "ce-polish-live")

type Detection = { dependency: boolean; version: string | null; mount: boolean; package_manager: string | null }

async function run(args: string[], cwd?: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(["bash", detectRiffrec, ...args], { cwd, stdout: "pipe", stderr: "pipe" })
  const [exitCode, stdout, stderr] = await Promise.all([proc.exited, new Response(proc.stdout).text(), new Response(proc.stderr).text()])
  return { exitCode, stdout, stderr }
}

async function copyFixture(name: string): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ce-polish-detect-"))
  await fs.cp(path.join(fixturesDir, name), root, { recursive: true })
  return root
}

async function detect(root: string): Promise<Detection> {
  const result = await run([root])
  expect(result.exitCode, result.stderr).toBe(0)
  expect(result.stdout.trim().split("\n")).toHaveLength(1)
  return JSON.parse(result.stdout)
}

describe("detect-riffrec.sh", () => {
  test("the with-riffrec fixture reports dependency true, a version string, mount true, and its package manager", async () => {
    const root = await copyFixture("project-with-riffrec")
    const detection = await detect(root)
    expect(detection).toEqual({ dependency: true, version: "0.6.0", mount: true, package_manager: "pnpm" })
    expect(Object.keys(detection).sort()).toEqual(["dependency", "mount", "package_manager", "version"])
  })

  test("the without-riffrec fixture reports dependency false, version null, mount false", async () => {
    const root = await copyFixture("project-without-riffrec")
    const detection = await detect(root)
    expect(detection).toEqual({ dependency: false, version: null, mount: false, package_manager: "npm" })
  })

  test("an installed node_modules/riffrec wins over the declared range", async () => {
    const root = await copyFixture("project-with-riffrec")
    await fs.mkdir(path.join(root, "node_modules", "riffrec"), { recursive: true })
    await fs.writeFile(path.join(root, "node_modules", "riffrec", "package.json"), JSON.stringify({ name: "riffrec", version: "0.6.3" }))
    // A mount inside node_modules or build output does not count.
    await fs.mkdir(path.join(root, "dist"), { recursive: true })
    await fs.writeFile(path.join(root, "dist", "bundle.js"), "<RiffrecProvider forceEnable>")
    expect((await detect(root)).version).toBe("0.6.3")
  })

  test("a mount inside node_modules or dist alone is not a mount; an import without the JSX tag is not a mount", async () => {
    const root = await copyFixture("project-without-riffrec")
    await fs.mkdir(path.join(root, "node_modules", "riffrec", "dist"), { recursive: true })
    await fs.writeFile(path.join(root, "node_modules", "riffrec", "dist", "index.js"), "export function RiffrecProvider() {} // <RiffrecProvider>")
    await fs.mkdir(path.join(root, "dist"), { recursive: true })
    await fs.writeFile(path.join(root, "dist", "app.js"), "<RiffrecProvider forceEnable>")
    await fs.writeFile(path.join(root, "src", "imports-only.tsx"), 'import { RiffrecProvider } from "riffrec"\n')
    expect((await detect(root)).mount).toBe(false)
  })

  test("a project without package.json reports null package_manager and no dependency", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ce-polish-detect-"))
    await fs.mkdir(path.join(root, "app"), { recursive: true })
    await fs.writeFile(path.join(root, "app", "root.jsx"), "<RiffrecProvider forceEnable live={{}} />")
    expect(await detect(root)).toEqual({ dependency: false, version: null, mount: true, package_manager: null })
  })

  test("a missing path exits 1 with an ERROR line", async () => {
    const result = await run([path.join(os.tmpdir(), "ce-polish-detect-does-not-exist")])
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("ERROR:")
    expect(result.stdout).toBe("")
  })

  test("without an argument it inspects the current directory when not inside a git repo", async () => {
    const root = await copyFixture("project-with-riffrec")
    const result = await run([], root)
    expect(result.exitCode, result.stderr).toBe(0)
    const detection: Detection = JSON.parse(result.stdout)
    expect(detection.dependency).toBe(true)
    expect(detection.mount).toBe(true)
  })
})
