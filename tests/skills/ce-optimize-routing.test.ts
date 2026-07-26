import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { describe, expect, test } from "bun:test"

const ROOT = path.join(import.meta.dir, "../..")
const SKILL_PATH = path.join(ROOT, "skills/ce-optimize/SKILL.md")
const SCHEMA_PATH = path.join(ROOT, "skills/ce-optimize/references/optimize-spec-schema.yaml")
const LOG_SCHEMA_PATH = path.join(ROOT, "skills/ce-optimize/references/experiment-log-schema.yaml")
const RESOLVER = path.join(ROOT, "skills/ce-optimize/scripts/ce-routing.py")

async function runResolver(
  request: Record<string, unknown>,
  cwd: string,
  home: string,
) {
  const proc = Bun.spawn(["python3", "-I", "-S", RESOLVER], {
    cwd,
    env: {
      PATH: process.env.PATH ?? "/usr/bin:/bin",
      HOME: home,
      COMPOUND_ENGINEERING_HOME: home,
    },
    stdin: new Blob([JSON.stringify(request)]),
    stdout: "pipe",
    stderr: "pipe",
  })
  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  return {
    exitCode,
    body: JSON.parse(stdout) as Record<string, any>,
    stderr,
  }
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "ce-optimize-routing-"))
  const home = path.join(root, "home")
  const project = path.join(root, "project")
  await mkdir(home, { recursive: true, mode: 0o700 })
  await mkdir(project, { recursive: true })
  await Bun.$`git init -q`.cwd(project)
  await writeFile(path.join(project, ".gitignore"), ".compound-engineering/*.local.yaml\n")
  return { root, home, project }
}

describe("ce-optimize routing", () => {
  test("resolves weaker authors and stronger judges independently from one snapshot", async () => {
    const f = await fixture()
    try {
      const configPath = path.join(f.home, "config.yaml")
      await writeFile(configPath, [
        "routing:",
        "  profiles:",
        "    economy:",
        "      candidates:",
        "        - { harness: opencode, model: openai/economy, effort: low }",
        "    strong:",
        "      candidates:",
        "        - { harness: opencode, model: openai/strong, effort: high }",
        "  roles:",
        "    ce-optimize.experiment-author: { profile: economy, policy: prefer }",
        "    ce-optimize.semantic-judge: { profile: strong, policy: require }",
        "",
      ].join("\n"), { mode: 0o600 })
      await chmod(configPath, 0o600)

      const result = await runResolver({
        protocol: "ce-routing/v1",
        op: "resolve_batch",
        cwd: f.project,
        host: { harness: "opencode", serving_family: "openai" },
        intents: [],
        roles: [
          { role: "ce-optimize.experiment-author", instance: { id: "experiment", ordinal: 0 } },
          { role: "ce-optimize.semantic-judge", instance: { id: "judge", ordinal: 1 } },
        ],
      }, f.project, f.home)

      expect(result.exitCode).toBe(0)
      expect(result.stderr).toBe("")
      expect(result.body.snapshot.id).toMatch(/^cesnap-v1:[0-9a-f]{64}$/)
      expect(result.body.resolutions.map((item: any) => [
        item.role,
        item.class,
        item.binding.profile,
        item.binding.candidates[0].model,
      ])).toEqual([
        ["ce-optimize.experiment-author", "implementation", "economy", "openai/economy"],
        ["ce-optimize.semantic-judge", "verification", "strong", "openai/strong"],
      ])
      expect(result.body.resolutions[0].binding).not.toBe(result.body.resolutions[1].binding)
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("no routing and an explicit CE-default reset both retain built-in optimize bindings", async () => {
    const f = await fixture()
    try {
      const roles = [
        { role: "ce-optimize.experiment-author", instance: { id: "experiment", ordinal: 0 } },
        { role: "ce-optimize.semantic-judge", instance: { id: "judge", ordinal: 1 } },
      ]
      const unconfigured = await runResolver({
        protocol: "ce-routing/v1",
        op: "resolve_batch",
        cwd: f.project,
        intents: [],
        roles,
      }, f.project, f.home)

      expect(unconfigured.exitCode).toBe(0)
      expect(unconfigured.body.resolutions.map((item: any) => item.binding)).toEqual([
        expect.objectContaining({ kind: "ce-default", explicit_reset: false, source_layer: "builtin" }),
        expect.objectContaining({ kind: "ce-default", explicit_reset: false, source_layer: "builtin" }),
      ])

      const reset = await runResolver({
        protocol: "ce-routing/v1",
        op: "resolve_batch",
        cwd: f.project,
        intents: [{
          role: "ce-optimize.semantic-judge",
          source: "current-task",
          binding: "ce-default",
        }],
        roles,
      }, f.project, f.home)
      expect(reset.exitCode).toBe(0)
      expect(reset.body.resolutions[1].binding).toMatchObject({
        kind: "ce-default",
        explicit_reset: true,
        source_layer: "task",
      })
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test.each([
    ["required author with missing evidence", "ce-optimize.experiment-author", {}, "block", "unverified"],
    ["required judge with mismatched evidence", "ce-optimize.semantic-judge", { model_actual: "other/model" }, "block", "mismatched"],
    ["required judge with matching evidence", "ce-optimize.semantic-judge", { model_actual: "openai/strong" }, "accept", "verified"],
  ])("%s", async (_name, role, report, action, identityStatus) => {
    const f = await fixture()
    try {
      const result = await runResolver({
        protocol: "ce-routing/v1",
        op: "finalize_attempt",
        binding: {
          role,
          class: role.endsWith("semantic-judge") ? "verification" : "implementation",
          profile: "strict",
          source_layer: "global-role",
          policy: "require",
          candidates: [{ harness: "opencode", model: "openai/strong", ordinal: 0 }],
        },
        attempt: { ordinal: 0, terminal: true, integrated: false },
        report,
      }, f.project, f.home)

      expect(result.body.action).toBe(action)
      expect(result.body.receipt.identity_status).toBe(identityStatus)
      expect(result.exitCode).toBe(action === "accept" ? 0 : 4)
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("prefer advances only after terminal unintegrated output", async () => {
    const f = await fixture()
    try {
      const binding = {
        role: "ce-optimize.experiment-author",
        class: "implementation",
        profile: "authors",
        source_layer: "global-role",
        policy: "prefer",
        candidates: [
          { harness: "opencode", model: "openai/first", ordinal: 0 },
          { harness: "opencode", model: "openai/second", ordinal: 1 },
        ],
      }
      const safe = await runResolver({
        protocol: "ce-routing/v1",
        op: "finalize_attempt",
        binding,
        attempt: { ordinal: 0, terminal: true, integrated: false },
        report: { model_actual: "openai/wrong" },
      }, f.project, f.home)
      expect(safe.exitCode).toBe(0)
      expect(safe.body.action).toBe("next_candidate")
      expect(safe.body.next_candidate.model).toBe("openai/second")

      for (const attempt of [
        { ordinal: 0, terminal: false, integrated: false },
        { ordinal: 0, terminal: true, integrated: true },
      ]) {
        const unsafe = await runResolver({
          protocol: "ce-routing/v1",
          op: "finalize_attempt",
          binding,
          attempt,
          report: { model_actual: "openai/wrong" },
        }, f.project, f.home)
        expect(unsafe.exitCode).toBe(4)
        expect(unsafe.body.error.code).toBe("RETRY_UNSAFE")
      }
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("resume keeps the persisted snapshot and bindings when configuration drifts", async () => {
    const f = await fixture()
    try {
      const configPath = path.join(f.home, "config.yaml")
      const writeConfig = async (model: string) => {
        await writeFile(configPath, [
          "routing:",
          "  profiles:",
          "    author:",
          "      candidates:",
          `        - { harness: opencode, model: ${model} }`,
          "  roles:",
          "    ce-optimize.experiment-author: { profile: author, policy: prefer }",
          "",
        ].join("\n"), { mode: 0o600 })
        await chmod(configPath, 0o600)
      }
      const request = {
        protocol: "ce-routing/v1",
        op: "resolve_batch",
        cwd: f.project,
        intents: [],
        roles: [{ role: "ce-optimize.experiment-author", instance: { id: "experiment", ordinal: 0 } }],
      }

      await writeConfig("openai/original")
      const original = await runResolver(request, f.project, f.home)
      await writeConfig("openai/drifted")
      const drifted = await runResolver(request, f.project, f.home)

      expect(original.body.snapshot.id).not.toBe(drifted.body.snapshot.id)
      expect(original.body.resolutions[0].binding.candidates[0].model).toBe("openai/original")

      const skill = await readFile(SKILL_PATH, "utf8")
      const logSchema = await readFile(LOG_SCHEMA_PATH, "utf8")
      expect(skill).toMatch(/resume.*frozen.*snapshot/i)
      expect(skill).toMatch(/do not re-resolve|never re-resolve/i)
      expect(logSchema).toContain("snapshot_id")
      expect(logSchema).toContain("source_revisions")
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("the owning adapter pins backend eligibility, selectors, legacy judge model, and no-routing behavior", async () => {
    const skill = await readFile(SKILL_PATH, "utf8")
    const schema = await readFile(SCHEMA_PATH, "utf8")

    expect(skill).toMatch(/one `ce-routing\/v1` `resolve_batch`.*ce-optimize\.experiment-author.*ce-optimize\.semantic-judge/is)
    expect(skill).toMatch(/backend.*higher authority.*routing|routing.*cannot change.*backend/is)
    expect(skill).toMatch(/worktree.*current host.*selector/is)
    expect(skill).toMatch(/codex.*candidate.*harness.*codex/is)
    expect(skill).toMatch(/no .*selector.*unavailable/i)
    expect(skill).toMatch(/incompatible.*backend.*unavailable/i)
    expect(skill).toMatch(/legacy.*metric\.judge\.model.*owning seam/is)
    expect(skill).toMatch(/ce-default.*v3\.20\.0|no routing.*v3\.20\.0/is)
    expect(schema).toContain("model:")
    expect(schema).toContain("haiku")
    expect(schema).toContain("sonnet")
  })

  test("required routing is non-interactive and cannot expose or integrate unverified output", async () => {
    const skill = await readFile(SKILL_PATH, "utf8")

    expect(skill).toContain("finalize_attempt")
    expect(skill).toContain("accepted_unverified")
    expect(skill).toMatch(/require.*without prompt/is)
    expect(skill).toMatch(/quarantin|isolated output/i)
    expect(skill).toMatch(/before.*(?:measurement|judge|result marker|checkpoint|commit|merge|integrat)/is)
    expect(skill).toMatch(/result marker.*commit.*merge.*checkpoint/is)
    expect(skill).toMatch(/fresh.*recipient.*material.*environment/is)
  })

  test("routing cannot alter Codex sandbox, measurement, concurrency, or stopping policy", async () => {
    const skill = await readFile(SKILL_PATH, "utf8")

    expect(skill).toContain("CODEX_SANDBOX")
    expect(skill).toContain("CODEX_SESSION_ID")
    expect(skill).toContain("--full-auto")
    expect(skill).toContain("--dangerously-bypass-approvals-and-sandbox")
    expect(skill).toMatch(/route.*cannot.*codex_security/is)
    expect(skill).toMatch(/measurement\.command.*unchanged|cannot change.*measurement\.command/is)
    expect(skill).toMatch(/stopping.*unchanged|cannot change.*stopping/is)
    expect(skill).toMatch(/execution\.max_concurrent.*unchanged|cannot change.*max_concurrent/is)
    expect(skill).toMatch(/bounded dispatch.*backpressure/is)
  })
})
