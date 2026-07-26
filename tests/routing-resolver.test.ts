import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "fs/promises"
import os from "os"
import path from "path"
import { describe, expect, test } from "bun:test"

const repoRoot = path.join(import.meta.dir, "..")
const resolver = path.join(repoRoot, "scripts", "routing", "config-resolver.py")

type RunResult = {
  exitCode: number
  body: Record<string, any>
  stderr: string
}

async function runResolver(
  request: Record<string, unknown>,
  options: { cwd: string; home: string; env?: Record<string, string> },
): Promise<RunResult> {
  const proc = Bun.spawn(["python3", "-I", "-S", resolver], {
    cwd: options.cwd,
    env: {
      PATH: process.env.PATH ?? "/usr/bin:/bin",
      HOME: options.home,
      COMPOUND_ENGINEERING_HOME: options.home,
      ...options.env,
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
  return { exitCode, body: JSON.parse(stdout) as Record<string, any>, stderr }
}

async function runResolverWithEnv(
  request: Record<string, unknown>,
  options: { cwd: string; env: Record<string, string> },
): Promise<RunResult> {
  const proc = Bun.spawn(["python3", "-I", "-S", resolver], {
    cwd: options.cwd,
    env: {
      PATH: process.env.PATH ?? "/usr/bin:/bin",
      ...options.env,
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
  return { exitCode, body: JSON.parse(stdout) as Record<string, any>, stderr }
}

async function installedResolver(
  root: string,
  roleCatalog: Record<string, unknown>,
): Promise<string> {
  const skillRoot = path.join(root, "installed-skill")
  const scripts = path.join(skillRoot, "scripts")
  const references = path.join(skillRoot, "references")
  await mkdir(scripts, { recursive: true })
  await mkdir(references, { recursive: true })
  await copyFile(resolver, path.join(scripts, "ce-routing.py"))
  await copyFile(
    path.join(repoRoot, "scripts", "routing", "settings-schema.json"),
    path.join(references, "ce-routing-schema.json"),
  )
  await writeFile(
    path.join(references, "dispatch-roles.json"),
    `${JSON.stringify(roleCatalog)}\n`,
  )
  return path.join(scripts, "ce-routing.py")
}

function baseBinding(policy = "prefer") {
  return {
    role: "ce-work.implementation-worker",
    class: "implementation",
    profile: "economy",
    source_layer: "global-class",
    policy,
    candidates: [
      { harness: "codex", model: "gpt-5-mini", ordinal: 0 },
      { harness: "claude", model: "sonnet", ordinal: 1 },
    ],
  }
}

async function initRepo(root: string): Promise<void> {
  await Bun.$`git init -q`.cwd(root)
  await writeFile(path.join(root, ".gitignore"), ".compound-engineering/*.local.yaml\n")
}

async function fixture(): Promise<{ root: string; home: string; project: string }> {
  const root = await mkdtemp(path.join(os.tmpdir(), "ce-routing-resolver-"))
  const home = path.join(root, "global")
  const project = path.join(root, "project with spaces")
  await mkdir(home, { recursive: true, mode: 0o700 })
  await mkdir(project, { recursive: true })
  await initRepo(project)
  return { root, home, project }
}

describe("routing resolver", () => {
  test("merges sparse project settings and resolves role over class", async () => {
    const f = await fixture()
    try {
      await writeFile(path.join(f.home, "config.yaml"), `plan_output: html\nrouting:\n  profiles:\n    economy:\n      candidates:\n        - { harness: codex, model: gpt-5-mini, effort: low }\n    strong:\n      candidates:\n        - { harness: claude, model: opus, effort: high }\n  classes:\n    implementation: { profile: economy, policy: prefer }\n    review: { profile: strong, policy: require }\n`, { mode: 0o600 })
      await mkdir(path.join(f.project, ".compound-engineering"), { recursive: true })
      await writeFile(path.join(f.project, ".compound-engineering", "config.local.yaml"), `plan_output: md\nrouting:\n  roles:\n    ce-code-review.security-reviewer: { profile: strong, policy: require }\n`, { mode: 0o600 })

      const result = await runResolver({
        protocol: "ce-routing/v1",
        op: "resolve_batch",
        cwd: f.project,
        host: { harness: "opencode", serving_family: "openai" },
        intents: [],
        roles: [
          { role: "ce-work.implementation-worker", instance: { id: "U1", ordinal: 0 } },
          { role: "ce-code-review.security-reviewer", instance: { id: "security", ordinal: 1 } },
        ],
      }, { cwd: f.project, home: f.home })

      expect(result.exitCode).toBe(0)
      expect(result.body.settings.effective.plan_output).toBe("md")
      expect(result.body.settings.provenance.plan_output.layer).toBe("project")
      expect(result.body.resolutions[0].binding.profile).toBe("economy")
      expect(result.body.resolutions[0].binding.source_layer).toBe("global-class")
      expect(result.body.resolutions[0].binding.profile_source_layer).toBe("global")
      expect(result.body.resolutions[0].binding.profile_source_authority).toBe(true)
      expect(result.body.resolutions[1].binding.profile).toBe("strong")
      expect(result.body.resolutions[1].binding.source_layer).toBe("project-role")
      expect(result.body.resolutions[1].binding.source_authority).toBe(true)
      expect(result.body.snapshot.id).toMatch(/^cesnap-v1:[0-9a-f]{64}$/)
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("ce-default stops lower-layer inheritance", async () => {
    const f = await fixture()
    try {
      await writeFile(path.join(f.home, "config.yaml"), `routing:\n  profiles:\n    economy:\n      candidates:\n        - { harness: codex, model: gpt-5-mini }\n  classes:\n    implementation: { profile: economy, policy: prefer }\n`, { mode: 0o600 })
      await mkdir(path.join(f.project, ".compound-engineering"), { recursive: true })
      await writeFile(path.join(f.project, ".compound-engineering", "config.local.yaml"), `routing:\n  classes:\n    implementation: ce-default\n`, { mode: 0o600 })

      const result = await runResolver({
        protocol: "ce-routing/v1",
        op: "resolve_batch",
        cwd: f.project,
        host: { harness: "opencode", serving_family: "openai" },
        intents: [],
        roles: [{ role: "ce-work.implementation-worker", instance: { id: "U1", ordinal: 0 } }],
      }, { cwd: f.project, home: f.home })

      expect(result.exitCode).toBe(0)
      expect(result.body.resolutions[0].binding).toMatchObject({
        kind: "ce-default",
        explicit_reset: true,
        source_layer: "project-class",
      })
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("rejects an unknown task-intent profile without an internal failure", async () => {
    const f = await fixture()
    try {
      const result = await runResolver({
        protocol: "ce-routing/v1",
        op: "resolve_batch",
        cwd: f.project,
        intents: [{
          role: "ce-work.implementation-worker",
          binding: { profile: "missing", policy: "require" },
        }],
        roles: [{ role: "ce-work.implementation-worker" }],
      }, { cwd: f.project, home: f.home })

      expect(result.exitCode).toBe(4)
      expect(result.body.error).toMatchObject({ code: "REFERENCE_UNKNOWN", profile: "missing" })
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test.each([
    ["missing prefer evidence", "prefer", {}, "accept", "accepted_unverified"],
    ["mismatched prefer evidence", "prefer", { model_actual: "other" }, "next_candidate", "mismatched"],
    ["missing required evidence", "require", {}, "block", "unverified"],
    ["matching required evidence", "require", { model_actual: "gpt-5-mini" }, "accept", "verified"],
  ])("finalizes %s deterministically", async (_name, policy, report, action, identityStatus) => {
    const f = await fixture()
    try {
      const result = await runResolver({
        protocol: "ce-routing/v1",
        op: "finalize_attempt",
        cwd: f.project,
        binding: {
          role: "ce-work.implementation-worker",
          class: "implementation",
          profile: "economy",
          policy,
          source_layer: "global-class",
          candidates: [
            { harness: "codex", model: "gpt-5-mini", ordinal: 0 },
            { harness: "claude", model: "sonnet", ordinal: 1 },
          ],
        },
        attempt: { ordinal: 0, terminal: true, integrated: false },
        report,
      }, { cwd: f.project, home: f.home })

      expect(result.exitCode).toBe(action === "block" ? 4 : 0)
      expect(result.body.action).toBe(action)
      expect(result.body.receipt.identity_status).toBe(identityStatus)
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("refuses retry after integration", async () => {
    const f = await fixture()
    try {
      const result = await runResolver({
        protocol: "ce-routing/v1",
        op: "finalize_attempt",
        cwd: f.project,
        binding: {
          role: "ce-work.implementation-worker",
          class: "implementation",
          profile: "economy",
          policy: "prefer",
          source_layer: "global-class",
          candidates: [
            { harness: "codex", model: "gpt-5-mini", ordinal: 0 },
            { harness: "claude", model: "sonnet", ordinal: 1 },
          ],
        },
        attempt: { ordinal: 0, terminal: true, integrated: true },
        report: { model_actual: "other" },
      }, { cwd: f.project, home: f.home })

      expect(result.exitCode).toBe(4)
      expect(result.body.error.code).toBe("RETRY_UNSAFE")
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("rejects a symlinked global config", async () => {
    const f = await fixture()
    try {
      const real = path.join(f.root, "real.yaml")
      await writeFile(real, "plan_output: html\n", { mode: 0o600 })
      await symlink(real, path.join(f.home, "config.yaml"))

      const result = await runResolver({ protocol: "ce-routing/v1", op: "inspect", cwd: f.project }, { cwd: f.project, home: f.home })

      expect(result.exitCode).toBe(3)
      expect(result.body.error).toMatchObject({ code: "CONFIG_UNSAFE", reason: "symlink" })
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("requires isolated no-site Python startup", async () => {
    const f = await fixture()
    try {
      const proc = Bun.spawn(["python3", resolver], {
        cwd: f.project,
        env: { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: f.home, COMPOUND_ENGINEERING_HOME: f.home },
        stdin: new Blob([JSON.stringify({ protocol: "ce-routing/v1", op: "inspect", cwd: f.project })]),
        stdout: "pipe",
      })
      const [exitCode, stdout] = await Promise.all([proc.exited, new Response(proc.stdout).text()])
      const body = JSON.parse(stdout)

      expect(exitCode).toBe(3)
      expect(body.error.code).toBe("RUNTIME_UNSUPPORTED")
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("patches one layer with compare-and-swap and preserves unrelated keys", async () => {
    const f = await fixture()
    try {
      await writeFile(path.join(f.home, "config.yaml"), "plan_output: html\npulse_product_name: Spiral\n", { mode: 0o600 })
      const inspected = await runResolver({ protocol: "ce-routing/v1", op: "inspect", cwd: f.project }, { cwd: f.project, home: f.home })
      const revision = inspected.body.sources.global.revision as string

      const patched = await runResolver({
        protocol: "ce-routing/v1",
        op: "patch_source",
        cwd: f.project,
        writer: "ce-setup",
        layer: "global",
        expected_revision: revision,
        set: { plan_output: "md" },
        remove: [],
      }, { cwd: f.project, home: f.home })

      expect(patched.exitCode).toBe(0)
      expect(await readFile(path.join(f.home, "config.yaml"), "utf8")).toContain('"pulse_product_name": "Spiral"')
      expect(await readFile(path.join(f.home, "config.yaml"), "utf8")).toContain('"plan_output": "md"')

      await chmod(path.join(f.home, "config.yaml"), 0o600)
      const stale = await runResolver({
        protocol: "ce-routing/v1",
        op: "patch_source",
        cwd: f.project,
        writer: "ce-setup",
        layer: "global",
        expected_revision: revision,
        set: { plan_output: "html" },
        remove: [],
      }, { cwd: f.project, home: f.home })
      expect(stale.exitCode).toBe(5)
      expect(stale.body.error.code).toBe("WRITE_CONFLICT")
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("freezes child waves from a validated parent snapshot envelope", async () => {
    const f = await fixture()
    try {
      const configPath = path.join(f.home, "config.yaml")
      const writeRouting = async (model: string) => {
        await writeFile(configPath, `routing:\n  profiles:\n    frozen:\n      candidates:\n        - { harness: codex, model: ${model} }\n  classes:\n    implementation: { profile: frozen, policy: prefer }\n    review: { profile: frozen, policy: prefer }\n`, { mode: 0o600 })
        await chmod(configPath, 0o600)
      }
      const intents = [{ class: "review", source: "current-task", binding: { profile: "frozen", policy: "prefer" } }]
      await writeRouting("original-model")
      const parent = await runResolver({
        protocol: "ce-routing/v1",
        op: "resolve_batch",
        cwd: f.project,
        host: { harness: "opencode", serving_family: "openai" },
        intents,
        roles: [{ role: "ce-work.implementation-worker", instance: { id: "U1" } }],
      }, { cwd: f.project, home: f.home })
      expect(parent.exitCode).toBe(0)

      await writeRouting("drifted-model")
      const childRequest = {
        protocol: "ce-routing/v1",
        op: "resolve_batch",
        cwd: f.project,
        host: { harness: "opencode", serving_family: "openai" },
        intents,
        parent_snapshot: parent.body.snapshot,
        parent_snapshot_id: parent.body.snapshot.id,
        roles: [{ role: "ce-code-review.security-reviewer", instance: { id: "security" } }],
      }
      const child = await runResolver(childRequest, { cwd: f.project, home: f.home })
      const fresh = await runResolver({
        protocol: "ce-routing/v1",
        op: "resolve_batch",
        cwd: f.project,
        host: { harness: "opencode", serving_family: "openai" },
        intents,
        roles: [{ role: "ce-code-review.security-reviewer", instance: { id: "security" } }],
      }, { cwd: f.project, home: f.home })

      expect(child.exitCode).toBe(0)
      expect(child.body.resolutions[0].binding.candidates[0].model).toBe("original-model")
      expect(child.body.snapshot.parent_snapshot_id).toBe(parent.body.snapshot.id)
      expect(fresh.body.resolutions[0].binding.candidates[0].model).toBe("drifted-model")

      const idOnly = await runResolver({
        protocol: "ce-routing/v1",
        op: "resolve_batch",
        cwd: f.project,
        intents,
        parent_snapshot_id: parent.body.snapshot.id,
        roles: [{ role: "ce-code-review.security-reviewer" }],
      }, { cwd: f.project, home: f.home })
      expect(idOnly.exitCode).toBe(4)
      expect(idOnly.body.error.code).toBe("CONTEXT_STALE")

      const forged = structuredClone(parent.body.snapshot)
      forged.routing.profiles.frozen.candidates[0].model = "forged-model"
      const forgedResult = await runResolver({ ...childRequest, parent_snapshot: forged }, { cwd: f.project, home: f.home })
      expect(forgedResult.exitCode).toBe(4)
      expect(forgedResult.body.error.code).toBe("CONTEXT_STALE")

      const wrongId = await runResolver({ ...childRequest, parent_snapshot_id: `cesnap-v1:${"0".repeat(64)}` }, { cwd: f.project, home: f.home })
      expect(wrongId.exitCode).toBe(4)
      expect(wrongId.body.error.code).toBe("CONTEXT_STALE")

      const wrongContext = await runResolver({ ...childRequest, cwd: f.root }, { cwd: f.project, home: f.home })
      expect(wrongContext.exitCode).toBe(4)
      expect(wrongContext.body.error.code).toBe("CONTEXT_STALE")

      const wrongIntents = await runResolver({ ...childRequest, intents: [] }, { cwd: f.project, home: f.home })
      expect(wrongIntents.exitCode).toBe(4)
      expect(wrongIntents.body.error.code).toBe("CONTEXT_STALE")

      const wrongProtocolSnapshot = structuredClone(parent.body.snapshot)
      wrongProtocolSnapshot.protocol = "ce-routing/v2"
      const wrongProtocol = await runResolver(
        { ...childRequest, parent_snapshot: wrongProtocolSnapshot },
        { cwd: f.project, home: f.home },
      )
      expect(wrongProtocol.exitCode).toBe(4)
      expect(wrongProtocol.body.error.code).toBe("CONTEXT_STALE")
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("requires trusted binding and profile provenance for recipient-bearing routes", async () => {
    const f = await fixture()
    try {
      await writeFile(path.join(f.project, ".gitignore"), "")
      await writeFile(path.join(f.home, "config.yaml"), `routing:\n  profiles:\n    trusted:\n      candidates:\n        - { harness: codex, model: trusted-model }\n  classes:\n    review: { profile: trusted, policy: prefer }\n`, { mode: 0o600 })
      const projectDir = path.join(f.project, ".compound-engineering")
      const projectPath = path.join(projectDir, "config.local.yaml")
      await mkdir(projectDir, { recursive: true })
      await writeFile(projectPath, `routing:\n  profiles:\n    trusted:\n      candidates:\n        - { harness: claude, model: substituted-model }\n`, { mode: 0o600 })

      const profileSubstitution = await runResolver({
        protocol: "ce-routing/v1",
        op: "resolve_batch",
        cwd: f.project,
        intents: [],
        roles: [{ role: "ce-code-review.security-reviewer" }],
      }, { cwd: f.project, home: f.home })
      expect(profileSubstitution.exitCode).toBe(4)
      expect(profileSubstitution.body.error).toMatchObject({
        code: "AUTHORITY_UNTRUSTED",
        profile: "trusted",
      })

      await writeFile(projectPath, `routing:\n  classes:\n    review: { profile: trusted, policy: prefer }\n`, { mode: 0o600 })
      const bindingSubstitution = await runResolver({
        protocol: "ce-routing/v1",
        op: "resolve_batch",
        cwd: f.project,
        intents: [],
        roles: [{ role: "ce-code-review.security-reviewer" }],
      }, { cwd: f.project, home: f.home })
      expect(bindingSubstitution.exitCode).toBe(4)
      expect(bindingSubstitution.body.error).toMatchObject({
        code: "AUTHORITY_UNTRUSTED",
        profile: "trusted",
      })

      await writeFile(projectPath, "routing:\n  classes:\n    review: ce-default\n", { mode: 0o600 })
      const reset = await runResolver({
        protocol: "ce-routing/v1",
        op: "resolve_batch",
        cwd: f.project,
        intents: [],
        roles: [{ role: "ce-code-review.security-reviewer" }],
      }, { cwd: f.project, home: f.home })
      expect(reset.exitCode).toBe(0)
      expect(reset.body.resolutions[0].binding).toMatchObject({
        kind: "ce-default",
        explicit_reset: true,
        source_layer: "project-class",
        source_authority: false,
      })
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("retains ignored-project authority on the first project write", async () => {
    const f = await fixture()
    try {
      const inspected = await runResolver(
        { protocol: "ce-routing/v1", op: "inspect", cwd: f.project },
        { cwd: f.project, home: f.home },
      )
      expect(inspected.body.sources.project).toMatchObject({
        exists: false,
        ignored: true,
        authority_trusted: true,
      })

      const patched = await runResolver({
        protocol: "ce-routing/v1",
        op: "patch_source",
        cwd: f.project,
        writer: "ce-sweep",
        layer: "project",
        expected_revision: inspected.body.sources.project.revision,
        set: {
          feedback_sources: [{ type: "slack", id: "slack-alpha", target: "C0123", approved: true }],
        },
        remove: [],
      }, { cwd: f.project, home: f.home })
      expect(patched.exitCode).toBe(0)

      const after = await runResolver(
        { protocol: "ce-routing/v1", op: "inspect", cwd: f.project },
        { cwd: f.project, home: f.home },
      )
      expect(after.body.settings.effective.feedback_sources[0].approved).toBe(true)
      expect(after.body.settings.authority.feedback_sources).toBe("approved")
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("enforces patch writer and layer ownership", async () => {
    const f = await fixture()
    try {
      const inspected = await runResolver(
        { protocol: "ce-routing/v1", op: "inspect", cwd: f.project },
        { cwd: f.project, home: f.home },
      )
      const common = {
        protocol: "ce-routing/v1",
        op: "patch_source",
        cwd: f.project,
        expected_revision: inspected.body.sources.global.revision,
        set: { pulse_product_name: "Spiral" },
        remove: [],
      }

      const missingWriter = await runResolver({ ...common, layer: "global" }, { cwd: f.project, home: f.home })
      expect(missingWriter.exitCode).toBe(2)
      expect(missingWriter.body.error.code).toBe("REQUEST_INVALID")

      const foreignGlobal = await runResolver({ ...common, writer: "ce-product-pulse", layer: "global" }, { cwd: f.project, home: f.home })
      expect(foreignGlobal.exitCode).toBe(5)
      expect(foreignGlobal.body.error.code).toBe("WRITE_UNSAFE")

      const foreignProject = await runResolver({
        ...common,
        writer: "ce-product-pulse",
        layer: "project",
        expected_revision: inspected.body.sources.project.revision,
        set: { sweep_ack_cap: 10 },
      }, { cwd: f.project, home: f.home })
      expect(foreignProject.exitCode).toBe(5)
      expect(foreignProject.body.error.code).toBe("WRITE_UNSAFE")
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("lets ce-setup safely clean retired keys", async () => {
    const f = await fixture()
    try {
      const configPath = path.join(f.home, "config.yaml")
      await writeFile(configPath, "work_engine_target: codex\nplan_output: html\n", { mode: 0o600 })
      const inspected = await runResolver(
        { protocol: "ce-routing/v1", op: "inspect", cwd: f.project },
        { cwd: f.project, home: f.home },
      )
      const patched = await runResolver({
        protocol: "ce-routing/v1",
        op: "patch_source",
        cwd: f.project,
        writer: "ce-setup",
        layer: "global",
        expected_revision: inspected.body.sources.global.revision,
        set: {},
        remove: ["work_engine_target"],
      }, { cwd: f.project, home: f.home })

      expect(patched.exitCode).toBe(0)
      const output = await readFile(configPath, "utf8")
      expect(output).not.toContain("work_engine_target")
      expect(output).toContain('"plan_output": "html"')
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("quotes every emitted YAML string so scalar-looking text round-trips", async () => {
    const f = await fixture()
    try {
      const inspected = await runResolver(
        { protocol: "ce-routing/v1", op: "inspect", cwd: f.project },
        { cwd: f.project, home: f.home },
      )
      const values = {
        pulse_product_name: "true",
        pulse_primary_event: "123",
        pulse_value_event: "null",
        sweep_state_path: "false",
      }
      const patched = await runResolver({
        protocol: "ce-routing/v1",
        op: "patch_source",
        cwd: f.project,
        writer: "ce-setup",
        layer: "global",
        expected_revision: inspected.body.sources.global.revision,
        set: values,
        remove: [],
      }, { cwd: f.project, home: f.home })
      expect(patched.exitCode).toBe(0)

      const output = await readFile(path.join(f.home, "config.yaml"), "utf8")
      for (const [key, value] of Object.entries(values)) {
        expect(output).toContain(`${JSON.stringify(key)}: ${JSON.stringify(value)}`)
      }
      const after = await runResolver(
        { protocol: "ce-routing/v1", op: "inspect", cwd: f.project },
        { cwd: f.project, home: f.home },
      )
      expect(after.body.settings.effective).toMatchObject(values)
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test.each([
    ["HOME", (root: string) => ({ HOME: path.join(root, "fresh", "home") }), (root: string) => path.join(root, "fresh", "home", ".config", "compound-engineering", "config.yaml")],
    ["XDG_CONFIG_HOME", (root: string) => ({ HOME: path.join(root, "home"), XDG_CONFIG_HOME: path.join(root, "fresh", "xdg", "nested") }), (root: string) => path.join(root, "fresh", "xdg", "nested", "compound-engineering", "config.yaml")],
    ["COMPOUND_ENGINEERING_HOME", (root: string) => ({ HOME: path.join(root, "home"), COMPOUND_ENGINEERING_HOME: path.join(root, "fresh", "ce", "nested") }), (root: string) => path.join(root, "fresh", "ce", "nested", "config.yaml")],
  ])("securely creates a fresh nested %s chain", async (_name, envFor, pathFor) => {
    const f = await fixture()
    try {
      const result = await runResolverWithEnv({
        protocol: "ce-routing/v1",
        op: "patch_source",
        cwd: f.project,
        writer: "ce-setup",
        layer: "global",
        expected_revision: "cecfg-v1:absent",
        set: { plan_output: "md" },
        remove: [],
      }, { cwd: f.project, env: envFor(f.root) })

      expect(result.exitCode).toBe(0)
      const configPath = pathFor(f.root)
      expect(await readFile(configPath, "utf8")).toContain('"plan_output": "md"')
      expect((await stat(path.dirname(configPath))).mode & 0o777).toBe(0o700)
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("rejects a symlink in a fresh global directory chain", async () => {
    const f = await fixture()
    try {
      const home = path.join(f.root, "fresh-home")
      const outside = path.join(f.root, "outside")
      await mkdir(home)
      await mkdir(outside)
      await symlink(outside, path.join(home, ".config"))

      const result = await runResolverWithEnv({
        protocol: "ce-routing/v1",
        op: "patch_source",
        cwd: f.project,
        writer: "ce-setup",
        layer: "global",
        expected_revision: "cecfg-v1:absent",
        set: { plan_output: "md" },
        remove: [],
      }, { cwd: f.project, env: { HOME: home } })

      expect(result.exitCode).toBe(5)
      expect(result.body.error.code).toBe("WRITE_UNSAFE")
      expect(await Bun.file(path.join(outside, "compound-engineering", "config.yaml")).exists()).toBe(false)
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("fails compare-and-swap when an external writer replaces the validated source", async () => {
    const f = await fixture()
    try {
      const configPath = path.join(f.home, "config.yaml")
      await writeFile(configPath, "plan_output: md\n", { mode: 0o600 })
      const externalPath = path.join(f.home, ".external-replacement")
      const probe = [
        "import importlib.util, os",
        `resolver_path = ${JSON.stringify(resolver)}`,
        `config_path = ${JSON.stringify(configPath)}`,
        `external_path = ${JSON.stringify(externalPath)}`,
        "spec = importlib.util.spec_from_file_location('ce_routing_cas_test', resolver_path)",
        "module = importlib.util.module_from_spec(spec)",
        "spec.loader.exec_module(module)",
        "raw = open(config_path, 'rb').read()",
        "source = {'exists': True, 'identity': module.file_identity(os.stat(config_path)), 'revision': module.digest('cecfg-v1', raw)}",
        "original = module.read_commit_source",
        "def replace_after_validation(*args):\n    result = original(*args)\n    with open(external_path, 'wb') as stream:\n        stream.write(b'plan_output: html\\npulse_product_name: external\\n')\n    os.chmod(external_path, 0o600)\n    os.replace(external_path, config_path)\n    return result",
        "module.read_commit_source = replace_after_validation",
        "try:\n    module.atomic_write(config_path, b'plan_output: changed\\n', source, 262144)\nexcept module.RoutingError as error:\n    print(error.code)\nelse:\n    raise SystemExit('replacement was overwritten')",
      ].join("\n")
      const proc = Bun.spawn(["python3", "-I", "-S", "-c", probe], {
        cwd: f.project,
        stdout: "pipe",
        stderr: "pipe",
      })
      const [exitCode, stdout, stderr] = await Promise.all([
        proc.exited,
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ])

      expect(exitCode, stderr).toBe(0)
      expect(stdout.trim()).toBe("WRITE_CONFLICT")
      expect(await readFile(configPath, "utf8")).toContain("pulse_product_name: external")
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("finalize_attempt rejects all nonterminal or integrated states and exactness violations", async () => {
    const f = await fixture()
    try {
      for (const attempt of [
        { ordinal: 0, terminal: false, integrated: false },
        { ordinal: 0, terminal: true, integrated: true },
      ]) {
        const result = await runResolver({
          protocol: "ce-routing/v1",
          op: "finalize_attempt",
          binding: baseBinding("require"),
          attempt,
          report: { model_actual: "gpt-5-mini" },
        }, { cwd: f.project, home: f.home })
        expect(result.exitCode).toBe(4)
        expect(result.body.error.code).toBe("RETRY_UNSAFE")
      }

      for (const attempt of [
        { ordinal: 0, terminal: 1, integrated: false },
        { ordinal: 0, terminal: true, integrated: 0 },
        { ordinal: true, terminal: true, integrated: false },
      ]) {
        const result = await runResolver({
          protocol: "ce-routing/v1",
          op: "finalize_attempt",
          binding: baseBinding(),
          attempt,
          report: {},
        }, { cwd: f.project, home: f.home })
        expect(result.exitCode).toBe(2)
        expect(result.body.error.code).toBe("REQUEST_INVALID")
      }
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("finalize_attempt carries validated cumulative attempt history", async () => {
    const f = await fixture()
    try {
      const first = await runResolver({
        protocol: "ce-routing/v1",
        op: "finalize_attempt",
        binding: baseBinding(),
        attempt: { ordinal: 0, terminal: true, integrated: false },
        report: { model_actual: "wrong-model" },
      }, { cwd: f.project, home: f.home })
      expect(first.body.action).toBe("next_candidate")
      expect(first.body.receipt.attempts).toEqual([{
        ordinal: 0,
        identity_status: "mismatched",
        terminal: true,
        integrated: false,
        fallback_reason: "identity_mismatch",
        terminal_status: "next_candidate",
      }])

      const second = await runResolver({
        protocol: "ce-routing/v1",
        op: "finalize_attempt",
        binding: baseBinding(),
        prior_attempts: first.body.receipt.attempts,
        attempt: { ordinal: 1, terminal: true, integrated: false },
        report: { model_actual: "sonnet" },
      }, { cwd: f.project, home: f.home })
      expect(second.exitCode).toBe(0)
      expect(second.body.action).toBe("accept")
      expect(second.body.receipt.attempts).toHaveLength(2)
      expect(second.body.receipt.attempts[0]).toEqual(first.body.receipt.attempts[0])
      expect(second.body.receipt.attempts[1]).toMatchObject({
        ordinal: 1,
        identity_status: "verified",
        terminal: true,
        integrated: false,
        fallback_reason: null,
        terminal_status: "accept",
      })
      expect(second.body.receipt.fallback_reason).toBe("identity_mismatch")

      const missing = await runResolver({
        protocol: "ce-routing/v1",
        op: "finalize_attempt",
        binding: baseBinding(),
        attempt: { ordinal: 1, terminal: true, integrated: false },
        report: { model_actual: "sonnet" },
      }, { cwd: f.project, home: f.home })
      expect(missing.exitCode).toBe(2)
      expect(missing.body.error.code).toBe("REQUEST_INVALID")

      const malformed = await runResolver({
        protocol: "ce-routing/v1",
        op: "finalize_attempt",
        binding: baseBinding(),
        prior_attempts: [{ ...first.body.receipt.attempts[0], terminal: false }],
        attempt: { ordinal: 1, terminal: true, integrated: false },
        report: { model_actual: "sonnet" },
      }, { cwd: f.project, home: f.home })
      expect(malformed.exitCode).toBe(2)
      expect(malformed.body.error.code).toBe("REQUEST_INVALID")

      const manyCandidates = Array.from({ length: 130 }, (_, ordinal) => ({
        harness: "codex",
        model: `model-${ordinal}`,
        ordinal,
      }))
      const tooMuchHistory = Array.from({ length: 129 }, (_, ordinal) => ({
        ordinal,
        identity_status: "failed",
        terminal: true,
        integrated: false,
        fallback_reason: "attempt_failed",
        terminal_status: "next_candidate",
      }))
      const unbounded = await runResolver({
        protocol: "ce-routing/v1",
        op: "finalize_attempt",
        binding: { ...baseBinding(), candidates: manyCandidates },
        prior_attempts: tooMuchHistory,
        attempt: { ordinal: 129, terminal: true, integrated: false },
        report: { model_actual: "model-129" },
      }, { cwd: f.project, home: f.home })
      expect(unbounded.exitCode).toBe(2)
      expect(unbounded.body.error.code).toBe("REQUEST_INVALID")
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("accepts isolated/no-site runtime flags when safe_path is unavailable", async () => {
    const f = await fixture()
    try {
      const probe = [
        "import importlib.util, types",
        `spec = importlib.util.spec_from_file_location('ce_routing_test', ${JSON.stringify(resolver)})`,
        "module = importlib.util.module_from_spec(spec)",
        "spec.loader.exec_module(module)",
        "module.sys = types.SimpleNamespace(flags=types.SimpleNamespace(isolated=1, no_site=1))",
        "module.require_runtime()",
        "print('accepted')",
      ].join("; ")
      const proc = Bun.spawn(["python3", "-I", "-S", "-c", probe], {
        cwd: f.project,
        stdout: "pipe",
        stderr: "pipe",
      })
      const [exitCode, stdout, stderr] = await Promise.all([
        proc.exited,
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ])
      expect(exitCode, stderr).toBe(0)
      expect(stdout.trim()).toBe("accepted")
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("reports catalog roles outside class membership as unclassified", async () => {
    const f = await fixture()
    try {
      const copied = await installedResolver(f.root, {
        version: 1,
        classes: ["review"],
        roles: {
          "ce-test.worker": {
            class: "mystery",
            owner: "ce-test",
            adapter_family: "native-generic-subagent",
            built_in_tier: "inherit",
          },
        },
      })
      const proc = Bun.spawn(["python3", "-I", "-S", copied], {
        cwd: f.project,
        env: { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: f.home, COMPOUND_ENGINEERING_HOME: f.home },
        stdin: new Blob([JSON.stringify({ protocol: "ce-routing/v1", op: "inspect", cwd: f.project })]),
        stdout: "pipe",
      })
      const [exitCode, stdout] = await Promise.all([proc.exited, new Response(proc.stdout).text()])
      expect(exitCode).toBe(0)
      expect(JSON.parse(stdout).role_coverage).toEqual({ registered: 1, unclassified: ["ce-test.worker"] })
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("rejects malformed role metadata as an invalid asset", async () => {
    const f = await fixture()
    try {
      const copied = await installedResolver(f.root, {
        version: 1,
        classes: ["review"],
        roles: { "ce-test.worker": [] },
      })
      const proc = Bun.spawn(["python3", "-I", "-S", copied], {
        cwd: f.project,
        env: { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: f.home, COMPOUND_ENGINEERING_HOME: f.home },
        stdin: new Blob([JSON.stringify({ protocol: "ce-routing/v1", op: "inspect", cwd: f.project })]),
        stdout: "pipe",
      })
      const [exitCode, stdout] = await Promise.all([proc.exited, new Response(proc.stdout).text()])
      expect(exitCode).toBe(3)
      expect(JSON.parse(stdout).error.code).toBe("ASSET_INVALID")
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })
})
