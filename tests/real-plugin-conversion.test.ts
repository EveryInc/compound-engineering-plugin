import { afterAll, describe, expect, test } from "bun:test"
import { existsSync, promises as fs, readdirSync, readFileSync } from "fs"
import os from "os"
import path from "path"
import { parseFrontmatter } from "../src/utils/frontmatter"

// Conversion-drift smoke test.
//
// Converts the REAL root plugin -- not fixtures --
// to every implemented target via the CLI, then structurally validates each
// output tree. Expected counts are
// re-derived from the source tree (agents/, commands/, skills/ plus
// `ce_platforms` frontmatter) rather than from the converter code, so drift on
// either side fails here. Fixture-based behavior (field mappings, deep-merge,
// legacy cleanup) is covered elsewhere; this file owns whole-tree shape for
// the shipping plugins.
//
// Sandbox safety: every conversion writes only inside a fresh os.tmpdir()
// root, with HOME redirected into that root and CODEX_HOME /
// OPENCODE_CONFIG_DIR scrubbed so no target default can escape to the real
// home directory.

const repoRoot = path.join(import.meta.dir, "..")
const cliEntry = path.join(repoRoot, "src", "index.ts")

const IMPLEMENTED_TARGETS = ["opencode", "codex", "pi", "antigravity"] as const
type Target = (typeof IMPLEMENTED_TARGETS)[number]

const PLUGIN_NAMES = ["compound-engineering"] as const
type PluginName = (typeof PLUGIN_NAMES)[number]

// Note on skill body size: an "8KB Codex skill body cap" circulates in
// ecosystem lint tooling (e.g. wshobson/agents harness_portability.py), but it
// is not in the Codex source (codex-rs/core-skills has no body-size constant)
// or the official docs. The real Codex limit is an ~8,000-character budget on
// the injected skills METADATA LIST; full SKILL.md bodies are read from disk
// on demand. So no body-size check is enforced here. The codex-path
// description cap is converter-enforced (src/converters/claude-to-codex.ts
// CODEX_DESCRIPTION_MAX_LENGTH).

// ---------------------------------------------------------------------------
// Source inventory -- read independently from the plugin source tree.
// ---------------------------------------------------------------------------

type SourceInventory = {
  agents: string[]
  commands: string[]
  skills: { name: string; cePlatforms?: string[]; userInvocable?: boolean }[]
}

function listFileBasenames(dir: string, extension: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(extension))
      .map((entry) => entry.name.slice(0, -extension.length))
      .sort()
  } catch {
    return []
  }
}

function listDirNames(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
  } catch {
    return []
  }
}

function walkFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...walkFiles(full))
    } else if (entry.isFile()) {
      out.push(full)
    }
  }
  return out
}

function loadSourceInventory(pluginName: PluginName): SourceInventory {
  const pluginRoot = pluginName === "compound-engineering" ? repoRoot : path.join(repoRoot, "plugins", pluginName)
  const agents = listFileBasenames(path.join(pluginRoot, "agents"), ".md")
  const commands = listFileBasenames(path.join(pluginRoot, "commands"), ".md")
  const skills: SourceInventory["skills"] = []
  const skillsRoot = path.join(pluginRoot, "skills")
  for (const name of listDirNames(skillsRoot)) {
    const skillFile = path.join(skillsRoot, name, "SKILL.md")
    let raw: string
    try {
      raw = readFileSync(skillFile, "utf8")
    } catch {
      continue
    }
    const { data } = parseFrontmatter(raw, skillFile)
    const cePlatforms = Array.isArray(data.ce_platforms) ? (data.ce_platforms as string[]) : undefined
    const userInvocable = data["user-invocable"] === false ? false : undefined
    skills.push({ name, cePlatforms, userInvocable })
  }
  return { agents, commands, skills }
}

// Mirrors filterSkillsByPlatform (src/types/claude.ts) on purpose: the
// expected skill list must come from an independent reading of the source
// frontmatter so a regression in the converter's platform filter (or an
// undocumented new exclusion) shows up as a set difference here. The only
// intentional exclusion today is `ce_platforms`.
function skillsForPlatform(inventory: SourceInventory, target: Target): string[] {
  return inventory.skills
    .filter((skill) => !skill.cePlatforms || skill.cePlatforms.includes(target))
    .map((skill) => skill.name)
    .sort()
}

// Mirrors convertSkillsToCommands (src/converters/claude-to-opencode.ts) on
// purpose: OpenCode generates one slash-command stub per platform-eligible
// skill, excluding only those that opt out of user invocation
// (`user-invocable: false`). `disable-model-invocation` does NOT exclude a skill
// -- it marks user-invocation-only skills, which need the slash command most.
// Derived independently from source frontmatter so a regression in the exclusion
// shows up as a set difference here.
function commandStubsForPlatform(inventory: SourceInventory, target: Target): string[] {
  return inventory.skills
    .filter((skill) => !skill.cePlatforms || skill.cePlatforms.includes(target))
    .filter((skill) => skill.userInvocable !== false)
    .map((skill) => skill.name)
    .sort()
}

// ---------------------------------------------------------------------------
// Conversion harness -- one CLI `convert` per (plugin, target), reused by all
// downstream assertions.
// ---------------------------------------------------------------------------

type Conversion = {
  // Directory containing the target's output tree (e.g. <tmp>/codex-home,
  // <tmp>/gemini-out/.gemini).
  root: string
}

const conversions = new Map<string, Conversion>()

function conversionKey(pluginName: PluginName, target: Target): string {
  return `${pluginName}:${target}`
}

function getConversion(pluginName: PluginName, target: Target): Conversion {
  const conversion = conversions.get(conversionKey(pluginName, target))
  if (!conversion) {
    throw new Error(
      `No conversion recorded for ${pluginName} -> ${target}. ` +
        `The "${pluginName} converts to every implemented target" test must pass first.`,
    )
  }
  return conversion
}

function targetInvocation(target: Target, tempRoot: string): { args: string[]; root: string } {
  switch (target) {
    case "opencode": {
      // The output basename must not be "opencode"/".opencode" -- that flips
      // the writer into the flat global layout. Pin --permissions explicitly:
      // `convert` defaults to broad while `install` defaults to none, and the
      // opencode.json assertion below depends on the permission block.
      const out = path.join(tempRoot, "opencode-out")
      return { args: ["--output", out, "--permissions", "broad"], root: out }
    }
    case "codex": {
      // codex ignores --output entirely (resolveTargetOutputRoot returns the
      // codex home); without --codex-home it would write to ~/.codex.
      // --include-skills exercises the full standalone bundle.
      const out = path.join(tempRoot, "codex-home")
      return { args: ["--codex-home", out, "--include-skills"], root: out }
    }
    case "pi": {
      // pi also ignores --output. The basename must be ".pi" (or "agent") to
      // get the flat canonical layout instead of nesting under <home>/.pi/.
      const out = path.join(tempRoot, "pi-home", ".pi")
      return { args: ["--pi-home", out], root: out }
    }
    case "antigravity": {
      // Without --output antigravity defaults to <cwd>/.agy.
      const out = path.join(tempRoot, "antigravity-out")
      return { args: ["--output", out], root: path.join(out, ".agy") }
    }
  }
}

async function runConvert(pluginName: PluginName, target: Target, tempRoot: string, fakeHome: string): Promise<void> {
  const { args, root } = targetInvocation(target, tempRoot)
  const env: Record<string, string | undefined> = { ...process.env, HOME: fakeHome }
  // Inherited target overrides would silently redirect writes outside tempRoot.
  delete env.CODEX_HOME
  delete env.OPENCODE_CONFIG_DIR

  const proc = Bun.spawn([
    "bun",
    "run",
    cliEntry,
    "convert",
    pluginName === "compound-engineering" ? repoRoot : path.join(repoRoot, "plugins", pluginName),
    "--to",
    target,
    ...args,
  ], {
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
    env,
  })

  const exitCode = await proc.exited
  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()

  if (exitCode !== 0) {
    throw new Error(
      `convert ${pluginName} --to ${target} failed (exit ${exitCode}).\nstdout: ${stdout}\nstderr: ${stderr}`,
    )
  }

  conversions.set(conversionKey(pluginName, target), { root })
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

function readJson(filePath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(filePath, "utf8")) as Record<string, unknown>
}

function expectSkillDirsHaveSkillMd(skillsRoot: string, skillNames: string[]): void {
  for (const name of skillNames) {
    const skillFile = path.join(skillsRoot, name, "SKILL.md")
    expect(existsSync(skillFile), `Converted skill dir ${path.join(skillsRoot, name)} is missing SKILL.md`).toBe(true)
  }
}

// ---------------------------------------------------------------------------
// Per-plugin drift tests.
// ---------------------------------------------------------------------------

// Conversion output is read by tests across several describe blocks, so temp
// roots are only removed once the whole file has run.
const tempRoots: string[] = []

afterAll(async () => {
  await Promise.all(tempRoots.map((root) => fs.rm(root, { recursive: true, force: true })))
})

for (const pluginName of PLUGIN_NAMES) {
  const inventory = loadSourceInventory(pluginName)

  describe(`real-plugin conversion drift: ${pluginName}`, () => {
    test("converts to every implemented target", async () => {
      const outputRoot = await fs.mkdtemp(path.join(os.tmpdir(), `real-convert-${pluginName}-`))
      tempRoots.push(outputRoot)
      const fakeHome = path.join(outputRoot, "home")
      await fs.mkdir(fakeHome)

      await Promise.all(IMPLEMENTED_TARGETS.map((target) => runConvert(pluginName, target, outputRoot, fakeHome)))

      // Sandbox safety: with explicit output flags, no target may fall back to
      // a home-relative default (the redirected HOME would catch it).
      for (const leaked of [".codex", ".pi", ".agy", ".agents", path.join(".config", "opencode")]) {
        expect(
          await exists(path.join(fakeHome, leaked)),
          `convert leaked ${leaked} into HOME despite explicit output flags`,
        ).toBe(false)
      }
    }, 120_000)

    test("opencode output matches the source inventory", () => {
      const { root } = getConversion(pluginName, "opencode")
      const expectedSkills = skillsForPlatform(inventory, "opencode")
      // OpenCode emits one slash-command stub per invocable skill, plus any
      // explicit commands/ entries (none for the skills-only root plugin).
      const expectedCommands = [...new Set([...inventory.commands, ...commandStubsForPlatform(inventory, "opencode")])].sort()

      const config = readJson(path.join(root, "opencode.json"))
      expect(config.$schema).toBe("https://opencode.ai/config.json")
      expect(config.permission, "--permissions broad was pinned, so opencode.json must carry a permission block").toBeDefined()

      const opencodeRoot = path.join(root, ".opencode")
      expect(listFileBasenames(path.join(opencodeRoot, "agents"), ".md")).toEqual(inventory.agents)
      expect(listDirNames(path.join(opencodeRoot, "skills"))).toEqual(expectedSkills)
      expectSkillDirsHaveSkillMd(path.join(opencodeRoot, "skills"), expectedSkills)
      expect(listFileBasenames(path.join(opencodeRoot, "commands"), ".md")).toEqual(expectedCommands)

      const manifest = readJson(path.join(opencodeRoot, pluginName, "install-manifest.json"))
      expect(manifest.version).toBe(1)
      expect(manifest.pluginName).toBe(pluginName)
      const groups = manifest.groups as Record<string, string[]>
      expect(groups.agents.length).toBe(inventory.agents.length)
      expect(groups.skills.length).toBe(expectedSkills.length)
      expect(groups.commands.length).toBe(expectedCommands.length)
    })

    test("codex output matches the source inventory", () => {
      const { root } = getConversion(pluginName, "codex")
      // Codex converts commands into prompts AND generated command-skills, so
      // the skills dir is the platform-filtered skills plus the commands.
      const expectedSkills = [...new Set([...skillsForPlatform(inventory, "codex"), ...inventory.commands])].sort()

      const agentsMdPath = path.join(root, "AGENTS.md")
      if (existsSync(agentsMdPath)) {
        const agentsMd = readFileSync(agentsMdPath, "utf8")
        expect(agentsMd).not.toContain("<!-- BEGIN COMPOUND CODEX TOOL MAP -->")
        expect(agentsMd).not.toContain("<!-- END COMPOUND CODEX TOOL MAP -->")
      }
      const tomlNames = listFileBasenames(path.join(root, "agents", pluginName), ".toml")
      expect(tomlNames).toEqual(inventory.agents)
      for (const name of tomlNames) {
        const toml = readFileSync(path.join(root, "agents", pluginName, `${name}.toml`), "utf8")
        for (const key of ["name", "description", "developer_instructions"]) {
          expect(toml, `${name}.toml is missing the ${key} field`).toMatch(new RegExp(`^${key} = `, "m"))
        }
      }

      expect(listDirNames(path.join(root, "skills", pluginName))).toEqual(expectedSkills)
      expectSkillDirsHaveSkillMd(path.join(root, "skills", pluginName), expectedSkills)
      expect(listFileBasenames(path.join(root, "prompts"), ".md")).toEqual(inventory.commands)

      const manifest = readJson(path.join(root, pluginName, "install-manifest.json"))
      expect(manifest.version).toBe(1)
      expect(manifest.pluginName).toBe(pluginName)
      expect((manifest.agents as string[]).length).toBe(inventory.agents.length)
      expect((manifest.skills as string[]).length).toBe(expectedSkills.length)
      expect((manifest.prompts as string[]).length).toBe(inventory.commands.length)
    })

    test("pi output matches the source inventory", () => {
      const { root } = getConversion(pluginName, "pi")
      const expectedSkills = skillsForPlatform(inventory, "pi")

      const agentsMd = readFileSync(path.join(root, "AGENTS.md"), "utf8")
      expect(agentsMd).toContain("<!-- BEGIN COMPOUND PI TOOL MAP -->")
      expect(agentsMd).toContain("<!-- END COMPOUND PI TOOL MAP -->")

      expect(listFileBasenames(path.join(root, "agents"), ".md")).toEqual(inventory.agents)
      expect(listDirNames(path.join(root, "skills"))).toEqual(expectedSkills)
      expectSkillDirsHaveSkillMd(path.join(root, "skills"), expectedSkills)
      expect(listFileBasenames(path.join(root, "prompts"), ".md")).toEqual(inventory.commands)

      const manifest = readJson(path.join(root, pluginName, "install-manifest.json"))
      expect(manifest.version).toBe(1)
      expect(manifest.pluginName).toBe(pluginName)
      expect((manifest.agents as string[]).length).toBe(inventory.agents.length)
      expect((manifest.skills as string[]).length).toBe(expectedSkills.length)
      expect((manifest.prompts as string[]).length).toBe(inventory.commands.length)
    })

    test("antigravity output matches the source inventory", () => {
      const { root } = getConversion(pluginName, "antigravity")
      const expectedSkills = skillsForPlatform(inventory, "antigravity")

      expect(listFileBasenames(path.join(root, "agents"), ".md")).toEqual(inventory.agents)
      expect(listDirNames(path.join(root, "skills"))).toEqual(expectedSkills)
      expectSkillDirsHaveSkillMd(path.join(root, "skills"), expectedSkills)
      expect(listFileBasenames(path.join(root, "commands"), ".toml")).toEqual(inventory.commands)

      // agy ingests a plugin bundle with a root plugin.json {name, version};
      // it does not use the gemini install-manifest.
      const manifest = readJson(path.join(root, "plugin.json"))
      expect(manifest.name).toBe(pluginName)
      expect(typeof manifest.version).toBe("string")
    })

    test("every emitted .json parses and every emitted .md has parseable frontmatter", () => {
      const errors: string[] = []
      let scanned = 0
      for (const target of IMPLEMENTED_TARGETS) {
        const { root } = getConversion(pluginName, target)
        for (const file of walkFiles(root)) {
          if (file.endsWith(".json")) {
            scanned += 1
            try {
              JSON.parse(readFileSync(file, "utf8"))
            } catch (err) {
              errors.push(`${target}: ${file}: ${err instanceof Error ? err.message : err}`)
            }
          } else if (file.endsWith(".md")) {
            scanned += 1
            try {
              parseFrontmatter(readFileSync(file, "utf8"), file)
            } catch (err) {
              errors.push(`${target}: ${file}: ${err instanceof Error ? err.message : err}`)
            }
          }
        }
      }
      expect(scanned, "expected the converted trees to contain .json/.md files").toBeGreaterThan(0)
      expect(errors, `Converted output contains unparseable files:\n${errors.join("\n")}`).toEqual([])
    })
  })
}
