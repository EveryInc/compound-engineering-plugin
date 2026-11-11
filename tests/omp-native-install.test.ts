import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { parseFrontmatter } from "../src/utils/frontmatter"

// Smoke test for native oh-my-pi (omp) install of this repository (#1224).
// omp loads the repo directly from package.json#pi — no converter, no writer.
setDefaultTimeout(20_000)

const REPO_ROOT = path.join(import.meta.dir, "..")

// Probed at module load (not beforeAll) because test.skipIf evaluates its
// condition at registration time, matching the convention in the
// *-writer.test.ts suites.
const OMP_BIN = Bun.which("omp")

const packageJson = JSON.parse(readFileSync(path.join(REPO_ROOT, "package.json"), "utf8")) as {
  name: string
  version: string
  pi?: { extensions?: string[]; skills?: string[]; version?: string }
}

describe("omp native install", () => {
  // omp 18.18+ answers `install --dry-run` for a local path without reading
  // package.json, so only a real link reports the name and manifest it parsed.
  test.skipIf(OMP_BIN === null)("omp link recognizes the repository", async () => {
    const home = mkdtempSync(path.join(tmpdir(), "omp-native-install-"))
    let stdout: string, stderr: string, exitCode: number
    try {
      const proc = Bun.spawn([OMP_BIN!, "plugin", "link", REPO_ROOT, "--json"], {
        stdout: "pipe",
        stderr: "pipe",
        env: {
          ...process.env,
          HOME: home,
          PI_CODING_AGENT_DIR: path.join(home, "agent"),
          XDG_DATA_HOME: path.join(home, "data"),
          XDG_STATE_HOME: path.join(home, "state"),
          XDG_CACHE_HOME: path.join(home, "cache"),
        },
      })
      ;[stdout, stderr, exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ])
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
    expect(exitCode, `omp plugin link failed:\n${stderr}`).toBe(0)

    const result = JSON.parse(stdout) as {
      name: string
      manifest: { extensions?: string[]; skills?: string[]; version?: string }
    }
    expect(result.name).toBe("compound-engineering")
    expect(result.manifest.skills).toContain("./skills")
    expect(result.manifest.extensions).toContain("./.pi/extensions/compound-engineering.ts")
    // The pi manifest does not pin its own version; omp then reports the
    // package.json top-level version. Read both so the test drifts with the
    // repo instead of pinning a literal.
    const expectedVersion = packageJson.pi?.version ?? packageJson.version
    expect(result.manifest.version).toBe(expectedVersion)
  })

  // The link JSON above does not enumerate discovered skills, so inventory
  // coverage is asserted on disk instead: omp requires a frontmatter
  // description for native-provider skill discovery and silently drops skills
  // without one. This test spawns nothing and stays unguarded so CI hosts
  // without omp still gate the inventory.
  test("omp discovers the full skill inventory", () => {
    const skillsDir = path.join(REPO_ROOT, "skills")
    const skillDirs = readdirSync(skillsDir, { withFileTypes: true })
      .filter((entry) =>
        entry.isDirectory() && existsSync(path.join(skillsDir, entry.name, "SKILL.md"))
      )
      .map((entry) => entry.name)
    expect(skillDirs.length).toBeGreaterThan(0)

    for (const dir of skillDirs) {
      const skillMdPath = path.join(skillsDir, dir, "SKILL.md")
      const { data } = parseFrontmatter(readFileSync(skillMdPath, "utf8"), skillMdPath)
      expect(
        typeof data.name === "string" && data.name.trim() !== "",
        `${dir}/SKILL.md must declare a non-empty frontmatter name`,
      ).toBe(true)
      expect(
        typeof data.description === "string" && data.description.trim() !== "",
        `${dir}/SKILL.md must declare a non-empty frontmatter description; omp drops skills without one`,
      ).toBe(true)
    }
  })
})
