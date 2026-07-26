import { access, copyFile, mkdtemp, mkdir, readFile, readdir, rm, stat, symlink, writeFile } from "fs/promises"
import os from "os"
import path from "path"
import { describe, expect, test } from "bun:test"

const repoRoot = path.join(import.meta.dir, "..")
const skillsRoot = path.join(repoRoot, "skills")
const routingRoot = path.join(repoRoot, "scripts", "routing")
const syncScript = path.join(routingRoot, "sync-assets.ts")

const assets = new Map([
  ["scripts/ce-routing.py", "config-resolver.py"],
  ["references/ce-routing-schema.json", "settings-schema.json"],
  ["references/ce-routing-protocol.json", "protocol-schema.json"],
  ["references/dispatch-roles.json", "dispatch-roles.json"],
  ["references/execution-routing.md", "execution-routing.md"],
])

async function consumers(): Promise<string[]> {
  const schema = JSON.parse(await readFile(path.join(routingRoot, "settings-schema.json"), "utf8")) as {
    settings: Record<string, { consumers: string[]; writers: string[] }>
  }
  const roles = JSON.parse(await readFile(path.join(routingRoot, "dispatch-roles.json"), "utf8")) as {
    roles: Record<string, { owner: string }>
  }
  const names = new Set<string>()
  for (const setting of Object.values(schema.settings)) {
    setting.consumers.forEach((name) => names.add(name))
    setting.writers.forEach((name) => names.add(name))
  }
  for (const role of Object.values(roles.roles)) names.add(role.owner)
  return [...names].sort()
}

async function syncFixture(consumer: string): Promise<{ root: string; sync: string; skillRoot: string }> {
  const root = await mkdtemp(path.join(os.tmpdir(), "ce-routing-sync-"))
  const fixtureRouting = path.join(root, "scripts", "routing")
  const fixtureSkills = path.join(root, "skills")
  const skillRoot = path.join(fixtureSkills, "ce-safe")
  await mkdir(fixtureRouting, { recursive: true })
  await mkdir(skillRoot, { recursive: true })
  await copyFile(syncScript, path.join(fixtureRouting, "sync-assets.ts"))
  await writeFile(path.join(fixtureRouting, "settings-schema.json"), JSON.stringify({
    settings: { sample: { consumers: [consumer], writers: [] } },
  }))
  await writeFile(path.join(fixtureRouting, "dispatch-roles.json"), JSON.stringify({ roles: {} }))
  for (const source of assets.values()) {
    if (source === "settings-schema.json" || source === "dispatch-roles.json") continue
    await writeFile(path.join(fixtureRouting, source), `canonical:${source}\n`)
  }
  await writeFile(path.join(skillRoot, "SKILL.md"), "# Safe skill\n")
  if (consumer !== "ce-safe") {
    const declaredRoot = path.join(fixtureSkills, consumer)
    await mkdir(declaredRoot, { recursive: true })
    await writeFile(path.join(declaredRoot, "SKILL.md"), "# Unsafe declared skill\n")
  }
  return { root, sync: path.join(fixtureRouting, "sync-assets.ts"), skillRoot }
}

async function runSync(sync: string, mode: "--write" | "--check") {
  const proc = Bun.spawn([process.execPath, sync, mode], {
    cwd: path.join(sync, "..", "..", ".."),
    stdout: "pipe",
    stderr: "pipe",
  })
  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  return { exitCode, stdout, stderr }
}

describe("routing runtime asset parity", () => {
  test("every catalog-derived consumer has all canonical bytes", async () => {
    for (const consumer of await consumers()) {
      await access(path.join(skillsRoot, consumer, "SKILL.md"))
      for (const [relative, canonical] of assets) {
        const [expected, actual] = await Promise.all([
          readFile(path.join(routingRoot, canonical)),
          readFile(path.join(skillsRoot, consumer, relative)),
        ])
        expect(actual, `${consumer}/${relative} drifted`).toEqual(expected)
      }
    }
  })

  test("no non-consumer carries an orphan generated asset", async () => {
    const expected = new Set(await consumers())
    const entries = await readdir(skillsRoot, { withFileTypes: true })
    for (const entry of entries.filter((item) => item.isDirectory() && !expected.has(item.name))) {
      for (const relative of assets.keys()) {
        await expect(access(path.join(skillsRoot, entry.name, relative))).rejects.toBeDefined()
      }
    }
  })

  test("check mode reports a clean tree without rewriting copies", async () => {
    const firstConsumer = (await consumers())[0]
    const sample = path.join(skillsRoot, firstConsumer, "scripts", "ce-routing.py")
    const before = await stat(sample)
    const proc = Bun.spawn([process.execPath, syncScript, "--check"], {
      cwd: repoRoot,
      stdout: "pipe",
      stderr: "pipe",
    })
    const [exitCode, stderr] = await Promise.all([proc.exited, new Response(proc.stderr).text()])
    const after = await stat(sample)

    expect(exitCode, stderr).toBe(0)
    expect(after.mtimeMs).toBe(before.mtimeMs)
  })

  test("generated resolver ignores hostile Python startup hooks", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ce-routing-python-"))
    const hookDir = path.join(root, "hooks")
    const marker = path.join(root, "sitecustomize-ran")
    await mkdir(hookDir)
    await writeFile(path.join(hookDir, "sitecustomize.py"), `from pathlib import Path\nPath(${JSON.stringify(marker)}).write_text("bad")\n`)
    try {
      const resolver = path.join(skillsRoot, "ce-setup", "scripts", "ce-routing.py")
      const proc = Bun.spawn(["python3", "-I", "-S", resolver], {
        cwd: root,
        env: {
          PATH: process.env.PATH ?? "/usr/bin:/bin",
          HOME: root,
          COMPOUND_ENGINEERING_HOME: path.join(root, "missing-home"),
          PYTHONPATH: hookDir,
          PYTHONHOME: hookDir,
        },
        stdin: new Blob([JSON.stringify({ protocol: "ce-routing/v1", op: "inspect", cwd: root })]),
        stdout: "pipe",
        stderr: "pipe",
      })
      const [exitCode, stdout] = await Promise.all([proc.exited, new Response(proc.stdout).text()])

      expect(exitCode).toBe(0)
      expect(JSON.parse(stdout).ok).toBe(true)
      await expect(access(marker)).rejects.toBeDefined()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test.each(["../escape", "ce-safe/nested", ".", "ce_safe"]) (
    "rejects unsafe consumer id %s before path construction",
    async (consumer) => {
      const fixture = await syncFixture(consumer)
      try {
        const result = await runSync(fixture.sync, "--write")
        expect(result.exitCode).not.toBe(0)
        expect(result.stderr).toMatch(/consumer|unsafe|invalid/i)
        await expect(access(path.join(fixture.root, "escape", "scripts", "ce-routing.py"))).rejects.toBeDefined()
      } finally {
        await rm(fixture.root, { recursive: true, force: true })
      }
    },
  )

  test.each(["ancestor", "destination"])("rejects a symlinked %s in write and check modes", async (kind) => {
    const fixture = await syncFixture("ce-safe")
    const outside = path.join(fixture.root, "outside")
    await mkdir(outside)
    try {
      if (kind === "ancestor") {
        await symlink(outside, path.join(fixture.skillRoot, "references"))
      } else {
        await mkdir(path.join(fixture.skillRoot, "references"))
        await symlink(
          path.join(outside, "protocol.json"),
          path.join(fixture.skillRoot, "references", "ce-routing-protocol.json"),
        )
      }

      for (const mode of ["--write", "--check"] as const) {
        const result = await runSync(fixture.sync, mode)
        expect(result.exitCode).not.toBe(0)
        expect(result.stderr).toMatch(/symlink|unsafe/i)
      }
      await expect(access(path.join(outside, "protocol.json"))).rejects.toBeDefined()
    } finally {
      await rm(fixture.root, { recursive: true, force: true })
    }
  })

  test("writes generated assets atomically without leftover temporary files", async () => {
    const fixture = await syncFixture("ce-safe")
    try {
      const result = await runSync(fixture.sync, "--write")
      expect(result.exitCode, result.stderr).toBe(0)
      const generated = await readdir(path.join(fixture.skillRoot, "references"))
      expect(generated.some((entry) => entry.startsWith(".ce-routing-"))).toBe(false)
      expect(await readFile(path.join(fixture.skillRoot, "references", "execution-routing.md"), "utf8")).toBe(
        "canonical:execution-routing.md\n",
      )
    } finally {
      await rm(fixture.root, { recursive: true, force: true })
    }
  })
})
