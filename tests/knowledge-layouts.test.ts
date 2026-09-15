import { describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import yaml from "js-yaml"

const REPO_ROOT = path.join(import.meta.dir, "..")
const LAYOUTS_DIR = path.join(REPO_ROOT, "skills", "ce-setup", "references", "layouts")
const SCRIPT = path.join(REPO_ROOT, "skills", "ce-setup", "scripts", "knowledge-layout.py")
const TEMPLATE = path.join(REPO_ROOT, "skills", "ce-setup", "references", "config-template.yaml")

const ROLES = [
  "inbox", "sources", "ideas", "themes", "projects", "notes", "learnings",
  "writing", "memory", "scratch", "archive", "templates",
]
const REQUIRED_ROLES = ["inbox", "learnings", "memory"]
const SHIPPED = ["none", "kieran", "katie", "nityesh", "para", "johnny-decimal"]

type Role = { path: string; filename?: string; types?: string[]; retention?: string; tracked?: boolean }
type Layout = {
  name: string
  description: string
  id_scheme: string
  docs_root?: string
  roles: Record<string, Role>
  frontmatter: { required: string[]; type_enum: string[]; provenance?: string[]; source_keys?: string[] }
  promotion: Record<string, string[]>
  retention: Record<string, number>
  git: { mode: string; allow: string[] }
  index: string
}

function run(...args: string[]): { status: string; payload: any; raw: string } {
  const r = spawnSync("python3", [SCRIPT, ...args], { encoding: "utf8" })
  const out = r.stdout ?? ""
  const nl = out.indexOf("\n")
  const status = (nl === -1 ? out : out.slice(0, nl)).trim()
  const rest = nl === -1 ? "" : out.slice(nl + 1)
  let payload: any
  try {
    payload = rest.trim().startsWith("{") ? JSON.parse(rest.trim().split("\n")[0]) : undefined
  } catch {
    payload = undefined
  }
  expect(r.status, r.stderr).toBe(0)
  return { status, payload, raw: rest }
}

function tmp(): string {
  return mkdtempSync(path.join(tmpdir(), "knowledge-layout-"))
}

function configIn(dir: string): string {
  mkdirSync(path.join(dir, ".compound-engineering"), { recursive: true })
  return path.join(dir, ".compound-engineering", "config.yaml")
}

function loadLayout(name: string): Layout {
  return yaml.load(readFileSync(path.join(LAYOUTS_DIR, `${name}.yaml`), "utf8")) as Layout
}

describe("built-in layout templates (schema)", () => {
  test("exactly the six decided templates ship", () => {
    const files = readdirSync(LAYOUTS_DIR).filter((f) => f.endsWith(".yaml")).map((f) => f.replace(/\.yaml$/, "")).sort()
    expect(files).toEqual([...SHIPPED].sort())
  })

  for (const name of SHIPPED) {
    test(`${name}: roles come from the fixed enum and set inbox, learnings, memory`, () => {
      const layout = loadLayout(name)
      expect(layout.name).toBe(name)
      expect(typeof layout.description).toBe("string")
      expect(["sequential", "date", "johnny-decimal", "none"]).toContain(layout.id_scheme)
      const roleNames = Object.keys(layout.roles)
      for (const role of roleNames) expect(ROLES).toContain(role)
      for (const req of REQUIRED_ROLES) expect(roleNames).toContain(req)
      for (const [role, spec] of Object.entries(layout.roles)) {
        expect(spec.path, `${name}.roles.${role}.path`).toMatch(/^[^/~]/)
        expect(spec.path).not.toContain("..")
        if (spec.filename) expect(spec.filename).not.toContain("/")
        for (const t of spec.types ?? []) {
          expect(layout.frontmatter.type_enum, `${name}.roles.${role}.types has ${t} outside type_enum`).toContain(t)
        }
      }
    })

    test(`${name}: frontmatter contract, promotion edges, git, and reserved index are well-formed`, () => {
      const layout = loadLayout(name)
      expect(layout.frontmatter.required.length).toBeGreaterThan(0)
      expect(layout.frontmatter.required).toContain("type")
      expect(layout.frontmatter.type_enum).toContain("learning")
      for (const [src, targets] of Object.entries(layout.promotion)) {
        expect(Object.keys(layout.roles), `${name}.promotion.${src} source unset`).toContain(src)
        for (const t of targets) {
          if (t !== "pack-rule") expect(Object.keys(layout.roles), `${name}.promotion.${src} -> ${t} unset`).toContain(t)
        }
      }
      // Katie's ladder ends in a pack rule everywhere: learnings are the only source of rules.
      expect(layout.promotion.learnings).toEqual(["pack-rule"])
      expect(["none", "commit", "commit+push"]).toContain(layout.git.mode)
      for (const p of layout.git.allow) expect(Object.values(layout.roles).map((r) => r.path)).toContain(p)
      expect(layout.index).toBe("none")
      // Raw session logs are never committed: every layout has a discard/untracked scratch role.
      expect(layout.roles.scratch?.retention).toBe("discard")
      expect(layout.roles.scratch?.tracked).toBe(false)
    })
  }

  test("none is inbox + learnings only (memory nests under learnings)", () => {
    const layout = loadLayout("none")
    const tracked = Object.entries(layout.roles).filter(([, r]) => r.tracked !== false).map(([n]) => n).sort()
    expect(tracked).toEqual(["inbox", "learnings", "memory"])
    expect(layout.roles.memory.path.startsWith(layout.roles.learnings.path)).toBe(true)
    expect(layout.git.mode).toBe("none")
  })

  test("kieran matches the frontier-experiments folder contract", () => {
    const layout = loadLayout("kieran")
    expect(layout.docs_root).toBe("learnings")
    expect(layout.id_scheme).toBe("sequential")
    expect(layout.roles.projects.path).toBe("experiments/{id:03d}-{slug}/")
    expect(layout.roles.projects.filename).toBe("README.md")
    expect(layout.roles.writing.filename).toBe("learning.md")
    expect(layout.frontmatter.required).toEqual(["title", "type", "date", "author"])
    expect(layout.frontmatter.type_enum).toEqual([
      "experiment", "weekly-learning", "learning", "note", "source", "idea", "theme",
      "template", "workflow", "guidance", "strategy", "glossary",
    ])
    expect(layout.frontmatter.source_keys).toContain("source_id")
    expect(layout.frontmatter.source_keys).toContain("source_access")
    // Reviewed captures are authorized to commit and push; nothing else is.
    expect(layout.git).toEqual({ mode: "commit+push", allow: ["inbox/", "sources/"] })
  })

  test("only kieran grants write authority; the default is proposals", () => {
    for (const name of SHIPPED) {
      const layout = loadLayout(name)
      if (name === "kieran") continue
      expect(layout.git, `${name}.git`).toEqual({ mode: "none", allow: [] })
    }
  })

  test("the config template documents the knowledge block with the shipped template names", () => {
    const template = readFileSync(TEMPLATE, "utf8")
    expect(template).toContain("# knowledge:")
    for (const name of SHIPPED) expect(template).toContain(name)
    expect(template).toContain("index: none")
  })
})

describe("knowledge-layout.py (expand, validate, resolve, audit)", () => {
  test("expands every built-in template into a block that validates and preserves neighbouring keys", () => {
    for (const name of SHIPPED) {
      const dir = tmp()
      const cfg = configIn(dir)
      writeFileSync(cfg, "docs_root: learnings\n\npacks:\n  - source: compound-packs/local\n")
      const ex = run("expand", "--layout", name, "--recurring", "capture=daily,dream=weekly", "--write", cfg)
      expect(ex.status, name).toBe("OK")
      expect(ex.raw).toContain("knowledge:")
      const written = readFileSync(cfg, "utf8")
      expect(written.startsWith("docs_root: learnings\n\npacks:\n  - source: compound-packs/local\n")).toBe(true)
      expect(written.match(/^knowledge:/gm)?.length).toBe(1)
      expect(written).toContain(`  layout: ${name}`)
      expect(written).toContain("  index: none")
      expect(written).toContain("    dream: weekly")
      const parsed = yaml.load(written) as any
      expect(Object.keys(parsed.knowledge.roles).sort()).toEqual(Object.keys(loadLayout(name).roles).sort())
      const v = run("validate", "--config", cfg)
      expect(v.status, name).toBe("OK")
      expect(v.payload.layout).toBe(name)
      // Re-expanding replaces the block instead of appending a second one.
      run("expand", "--layout", "none", "--write", cfg)
      const rewritten = readFileSync(cfg, "utf8")
      expect(rewritten.match(/^knowledge:/gm)?.length).toBe(1)
      expect(rewritten).toContain("  layout: none")
      expect(rewritten.startsWith("docs_root: learnings\n")).toBe(true)
    }
  })

  test("kieran expansion announces the docs_root hint instead of changing docs_root", () => {
    const ex = run("expand", "--layout", "kieran")
    expect(ex.status).toBe("OK")
    expect(ex.raw).toContain("docs_root hint")
    expect(ex.raw).toContain("`docs_root: learnings`")
    expect(ex.raw).not.toMatch(/^docs_root:/m)
  })

  test("resolve answers where a role or a type goes", () => {
    const dir = tmp()
    const cfg = configIn(dir)
    run("expand", "--layout", "kieran", "--write", cfg)
    const byRole = run("resolve", "--config", cfg, "--role", "sources")
    expect(byRole.status).toBe("OK")
    expect(byRole.payload).toMatchObject({ role: "sources", path: "sources/", filename: "{date}-{slug}.md", types: ["source"] })
    // A type both inbox and a real role claim resolves to the real role.
    const source = run("resolve", "--config", cfg, "--type", "source")
    expect(source.payload.role).toBe("sources")
    const note = run("resolve", "--config", cfg, "--type", "note")
    expect(note.payload.role).toBe("notes")
    expect(note.payload.path).toBe("experiments/{id:03d}-{slug}/notes/")
    // An unset role is an explicit answer, not a default.
    expect(run("resolve", "--config", cfg, "--role", "archive").status).toBe("UNSET-ROLE")
    expect(run("resolve", "--config", cfg, "--type", "recipe").status).toBe("UNSET-ROLE")
    // Root joins into the path.
    const sub = configIn(tmp())
    run("expand", "--layout", "none", "--root", "knowledge", "--write", sub)
    expect(run("resolve", "--config", sub, "--role", "inbox").payload.path).toBe("knowledge/inbox/")
  })

  test("resolve reports an ambiguous type rather than picking one", () => {
    const dir = tmp()
    const cfg = configIn(dir)
    const custom = path.join(dir, "custom.yaml")
    const layout = loadLayout("none") as any
    layout.name = "custom"
    layout.roles.sources = { path: "sources/", types: ["source"] }
    layout.roles.archive = { path: "archive/", types: ["source"] }
    writeFileSync(custom, yaml.dump(layout))
    expect(run("expand", "--layout", custom, "--write", cfg).status).toBe("OK")
    const r = run("resolve", "--config", cfg, "--type", "source")
    expect(r.status).toBe("AMBIGUOUS")
    expect(r.payload.roles.sort()).toEqual(["archive", "sources"])
  })

  test("validate fails closed on unknown roles, escaping paths, bad git mode, and a non-none index", () => {
    const dir = tmp()
    const cfg = configIn(dir)
    writeFileSync(
      cfg,
      [
        "knowledge:",
        "  layout: kieran",
        "  roles:",
        "    inbox:",
        "      path: inbox/",
        "    learnings:",
        "      path: ../elsewhere/",
        "    memory:",
        "      path: /abs/",
        "    junk:",
        "      path: junk/",
        "  frontmatter:",
        "    required: [title, type]",
        "    type_enum: [learning]",
        "  git:",
        "    mode: push",
        "  index: qmd",
        "",
      ].join("\n"),
    )
    const v = run("validate", "--config", cfg)
    expect(v.status).toBe("INVALID")
    const errors: string[] = v.payload.errors
    expect(errors.some((e) => e.startsWith("roles.junk: not a known role"))).toBe(true)
    expect(errors.some((e) => e.startsWith("roles.learnings.path"))).toBe(true)
    expect(errors.some((e) => e.startsWith("roles.memory.path"))).toBe(true)
    expect(errors.some((e) => e.startsWith("git.mode: 'push'"))).toBe(true)
    expect(errors.some((e) => e.startsWith("index: 'qmd'"))).toBe(true)
    // resolve and audit refuse the same block: no role path is ever answered from an invalid layout.
    expect(run("resolve", "--config", cfg, "--role", "inbox").status).toBe("INVALID")
    expect(run("audit", "--config", cfg).status).toBe("INVALID")
  })

  test("validate distinguishes a missing config, an unset block, and a template that does not exist", () => {
    const dir = tmp()
    expect(run("validate", "--config", path.join(dir, "nope.yaml")).status).toBe("NO-CONFIG")
    const cfg = configIn(dir)
    writeFileSync(cfg, "docs_root: docs\n")
    expect(run("validate", "--config", cfg).status).toBe("UNSET")
    const ex = run("expand", "--layout", "nathan")
    expect(ex.status).toBe("INVALID")
    expect(ex.payload.errors[0]).toContain("nathan")
  })

  test("a template missing a required role or claiming a type outside its enum is refused", () => {
    const dir = tmp()
    const bad = path.join(dir, "bad.yaml")
    const layout = loadLayout("none") as any
    layout.name = "bad"
    delete layout.roles.memory
    layout.roles.inbox.types = ["recipe"]
    writeFileSync(bad, yaml.dump(layout))
    const ex = run("expand", "--layout", bad)
    expect(ex.status).toBe("INVALID")
    expect(ex.payload.errors.some((e: string) => e.startsWith("roles.memory: required"))).toBe(true)
    expect(ex.payload.errors.some((e: string) => e.includes("'recipe' not in frontmatter.type_enum"))).toBe(true)
  })

  test("audit dry-runs proposals: missing role dirs, misfiled types, stale inbox; scratch is ignored", () => {
    const dir = tmp()
    const cfg = configIn(dir)
    run("expand", "--layout", "kieran", "--write", cfg)
    mkdirSync(path.join(dir, "ideas"), { recursive: true })
    mkdirSync(path.join(dir, "inbox"), { recursive: true })
    mkdirSync(path.join(dir, "sources"), { recursive: true })
    mkdirSync(path.join(dir, ".local"), { recursive: true })
    writeFileSync(path.join(dir, "ideas", "2026-08-01-thread.md"), "---\ntitle: t\ntype: source\ndate: 2026-08-01\n---\n")
    writeFileSync(path.join(dir, "sources", "2026-08-02-ok.md"), "---\ntitle: ok\ntype: source\ndate: 2026-08-02\n---\n")
    writeFileSync(path.join(dir, "inbox", "old.md"), "---\ntitle: old\ntype: idea\ndate: 2026-08-01\n---\n")
    writeFileSync(path.join(dir, "inbox", "fresh.md"), "---\ntitle: fresh\ntype: idea\ndate: 2026-09-10\n---\n")
    writeFileSync(path.join(dir, ".local", "raw.md"), "---\ntitle: raw\ntype: source\ndate: 2026-08-01\n---\n")
    writeFileSync(path.join(dir, "README.md"), "# no frontmatter\n")
    const a = run("audit", "--config", cfg, "--today", "2026-09-14")
    expect(a.status).toBe("OK")
    expect(a.payload.unfiled).toEqual([
      { file: "ideas/2026-08-01-thread.md", type: "source", expected_role: "sources", expected_path: "sources/" },
    ])
    expect(a.payload.stale_inbox).toEqual(["inbox/old.md"])
    expect(a.payload.missing_dirs).toEqual(["learnings/", "learnings/memory/", "templates/", "themes/"])
    // Dry run: nothing moved or created.
    expect(readdirSync(path.join(dir, "ideas"))).toEqual(["2026-08-01-thread.md"])
    expect(readdirSync(dir).sort()).toEqual([".compound-engineering", ".local", "README.md", "ideas", "inbox", "sources"])
  })
})
