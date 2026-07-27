import { chmod, copyFile, lstat, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, utimes, writeFile } from "fs/promises"
import { createHash } from "crypto"
import os from "os"
import path from "path"
import { describe, expect, test } from "bun:test"

const repoRoot = path.join(import.meta.dir, "..")
const resolver = path.join(repoRoot, "scripts", "routing", "config-resolver.py")
const opencodeHostWrapper = path.join(repoRoot, ".opencode", "plugins", "ce-routing-host.py")

type RunResult = {
  exitCode: number
  body: Record<string, any>
  stderr: string
}

async function runResolver(
  request: Record<string, unknown>,
  options: { cwd: string; home: string; env?: Record<string, string>; resolverPath?: string },
): Promise<RunResult> {
  const proc = Bun.spawn(["python3", "-I", "-S", options.resolverPath ?? resolver], {
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
  await copyFile(
    path.join(repoRoot, "scripts", "routing", "consumer-identity.json"),
    path.join(references, "ce-routing-consumer.json"),
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

function opencodeIntentProvenance(messageID = "direct-message") {
  return {
    source: "opencode-direct-input",
    provenance: {
      protocol: "ce-routing-intent/v1",
      session_id: "session-1",
      message_id: messageID,
      carrier_digest: "a".repeat(64),
    },
  }
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`
  }
  return JSON.stringify(value)
}

function recomputeSnapshotId(snapshot: Record<string, any>): void {
  const payload = structuredClone(snapshot)
  delete payload.id
  delete payload.auth
  snapshot.id = `cesnap-v1:${createHash("sha256").update(canonicalJson(payload), "ascii").digest("hex")}`
}

async function resolvedBinding(
  f: { project: string; home: string },
  options: {
    role?: string
    policy?: "prefer" | "require"
    candidates?: Array<Record<string, unknown> | "ce-default">
    instance?: Record<string, unknown>
    host?: Record<string, string>
  } = {},
) {
  const role = options.role ?? "ce-work.implementation-worker"
  const policy = options.policy ?? "prefer"
  const candidates = options.candidates ?? baseBinding(policy).candidates.map(({ ordinal: _ordinal, ...candidate }) => candidate)
  await writeFile(
    path.join(f.home, "config.yaml"),
    `routing:\n  profiles:\n    test-route:\n      candidates:\n${candidates.map((candidate) => `        - ${JSON.stringify(candidate)}`).join("\n")}\n  roles:\n    ${role}: { profile: test-route, policy: ${policy} }\n`,
    { mode: 0o600 },
  )
  return runResolver({
    protocol: "ce-routing/v1",
    op: "resolve_batch",
    cwd: f.project,
    host: options.host,
    intents: [],
    roles: [{ role, instance: options.instance ?? { id: "test-instance", ordinal: 0 } }],
  }, { cwd: f.project, home: f.home })
}

function finalizeRequest(
  resolved: RunResult,
  ordinal: number,
  outcome: "ok" | "unavailable" | "failed",
  report: Record<string, unknown> = {},
  attempt: Record<string, unknown> = {},
  priorAttempts?: Record<string, unknown>[],
) {
  return {
    protocol: "ce-routing/v1",
    op: "finalize_attempt",
    snapshot: resolved.body.snapshot,
    attempt_lock: resolved.body.resolutions[0].attempt_locks[ordinal],
    attempt: {
      ordinal,
      terminal: true,
      integrated: false,
      phase: "dispatched",
      retry_safety: "adapter-isolated",
      ...attempt,
    },
    outcome,
    report,
    ...(priorAttempts === undefined ? {} : { prior_attempts: priorAttempts }),
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

async function waitForFile(file: string): Promise<void> {
  const deadline = Date.now() + 5_000
  while (!(await Bun.file(file).exists())) {
    if (Date.now() >= deadline) throw new Error(`timed out waiting for ${file}`)
    await Bun.sleep(10)
  }
}

describe("routing resolver", () => {
  test.each([
    {
      name: "task profile wins",
      task: { profile: "task-profile", policy: "require" },
      projectRole: { profile: "project-role-profile", policy: "require" },
      projectClass: { profile: "project-class-profile", policy: "require" },
      globalRole: { profile: "global-role-profile", policy: "require" },
      globalClass: { profile: "global-class-profile", policy: "require" },
      expected: { kind: "profile", profile: "task-profile", source_layer: "task" },
    },
    {
      name: "project role wins after task inherit",
      task: "inherit",
      projectRole: { profile: "project-role-profile", policy: "require" },
      projectClass: { profile: "project-class-profile", policy: "require" },
      globalRole: { profile: "global-role-profile", policy: "require" },
      globalClass: { profile: "global-class-profile", policy: "require" },
      expected: { kind: "profile", profile: "project-role-profile", source_layer: "project-role" },
    },
    {
      name: "project class wins after narrower inherits",
      task: "inherit",
      projectRole: "inherit",
      projectClass: { profile: "project-class-profile", policy: "require" },
      globalRole: { profile: "global-role-profile", policy: "require" },
      globalClass: { profile: "global-class-profile", policy: "require" },
      expected: { kind: "profile", profile: "project-class-profile", source_layer: "project-class" },
    },
    {
      name: "global role wins after project inherits",
      task: "inherit",
      projectRole: "inherit",
      projectClass: "inherit",
      globalRole: { profile: "global-role-profile", policy: "require" },
      globalClass: { profile: "global-class-profile", policy: "require" },
      expected: { kind: "profile", profile: "global-role-profile", source_layer: "global-role" },
    },
    {
      name: "global class wins after role inherit",
      task: "inherit",
      projectRole: "inherit",
      projectClass: "inherit",
      globalRole: "inherit",
      globalClass: { profile: "global-class-profile", policy: "require" },
      expected: { kind: "profile", profile: "global-class-profile", source_layer: "global-class" },
    },
    {
      name: "built-in wins after every configured layer inherits",
      task: "inherit",
      projectRole: "inherit",
      projectClass: "inherit",
      globalRole: "inherit",
      globalClass: "inherit",
      expected: { kind: "ce-default", explicit_reset: false, source_layer: "builtin" },
    },
    {
      name: "task CE-default stops every lower profile",
      task: "ce-default",
      projectRole: { profile: "project-role-profile", policy: "require" },
      projectClass: { profile: "project-class-profile", policy: "require" },
      globalRole: { profile: "global-role-profile", policy: "require" },
      globalClass: { profile: "global-class-profile", policy: "require" },
      expected: { kind: "ce-default", explicit_reset: true, source_layer: "task" },
    },
    {
      name: "project role CE-default stops lower profiles",
      task: "inherit",
      projectRole: "ce-default",
      projectClass: { profile: "project-class-profile", policy: "require" },
      globalRole: { profile: "global-role-profile", policy: "require" },
      globalClass: { profile: "global-class-profile", policy: "require" },
      expected: { kind: "ce-default", explicit_reset: true, source_layer: "project-role" },
    },
    {
      name: "project class CE-default stops lower profiles",
      task: "inherit",
      projectRole: "inherit",
      projectClass: "ce-default",
      globalRole: { profile: "global-role-profile", policy: "require" },
      globalClass: { profile: "global-class-profile", policy: "require" },
      expected: { kind: "ce-default", explicit_reset: true, source_layer: "project-class" },
    },
    {
      name: "global role CE-default stops its class",
      task: "inherit",
      projectRole: "inherit",
      projectClass: "inherit",
      globalRole: "ce-default",
      globalClass: { profile: "global-class-profile", policy: "require" },
      expected: { kind: "ce-default", explicit_reset: true, source_layer: "global-role" },
    },
    {
      name: "global class CE-default stops at built-in",
      task: "inherit",
      projectRole: "inherit",
      projectClass: "inherit",
      globalRole: "inherit",
      globalClass: "ce-default",
      expected: { kind: "ce-default", explicit_reset: true, source_layer: "global-class" },
    },
  ])("applies the complete R4 precedence matrix: $name", async (scenario) => {
    const f = await fixture()
    const role = "ce-work.implementation-worker"
    const binding = (value: unknown) => typeof value === "string" ? value : JSON.stringify(value)
    try {
      await writeFile(path.join(f.home, "config.yaml"), [
        "routing:",
        "  profiles:",
        "    task-profile:",
        "      candidates:",
        "        - { harness: opencode, model: openai/task-model }",
        "    project-role-profile:",
        "      candidates:",
        "        - { harness: opencode, model: openai/project-role-model }",
        "    project-class-profile:",
        "      candidates:",
        "        - { harness: opencode, model: openai/project-class-model }",
        "    global-role-profile:",
        "      candidates:",
        "        - { harness: opencode, model: openai/global-role-model }",
        "    global-class-profile:",
        "      candidates:",
        "        - { harness: opencode, model: openai/global-class-model }",
        "  classes:",
        `    implementation: ${binding(scenario.globalClass)}`,
        "  roles:",
        `    ${role}: ${binding(scenario.globalRole)}`,
        "",
      ].join("\n"), { mode: 0o600 })
      await mkdir(path.join(f.project, ".compound-engineering"), { recursive: true })
      await writeFile(path.join(f.project, ".compound-engineering", "config.local.yaml"), [
        "routing:",
        "  classes:",
        `    implementation: ${binding(scenario.projectClass)}`,
        "  roles:",
        `    ${role}: ${binding(scenario.projectRole)}`,
        "",
      ].join("\n"), { mode: 0o600 })

      const result = await runResolver({
        protocol: "ce-routing/v1",
        op: "resolve_batch",
        cwd: f.project,
        host: { harness: "claude", serving_family: "anthropic" },
        intents: [{
          role,
          source: `current-task-${scenario.name.replaceAll(" ", "-")}`,
          binding: scenario.task,
        }],
        roles: [{ role, instance: { id: scenario.name } }],
      }, { cwd: f.project, home: f.home })

      expect(result.exitCode).toBe(0)
      expect(result.stderr).toBe("")
      expect(result.body.resolutions[0].binding).toMatchObject(scenario.expected)
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

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
        host: { harness: "claude", serving_family: "anthropic" },
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
        host: { harness: "claude", serving_family: "anthropic" },
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

  test("freezes direct task candidates for lock-bound finalization", async () => {
    const f = await fixture()
    try {
      await writeFile(path.join(f.home, "config.yaml"), "plan_model: fable\n", { mode: 0o600 })
      const resolved = await runResolver({
        protocol: "ce-routing/v1",
        op: "resolve_batch",
        cwd: f.project,
        host: { harness: "claude", serving_family: "anthropic" },
        intents: [{
          role: "ce-plan.plan-author",
          source: "current-task",
          binding: {
            policy: "prefer",
            candidates: [
              { harness: "opencode", model: "opus" },
              "ce-default",
            ],
          },
        }],
        roles: [{ role: "ce-plan.plan-author", instance: { id: "author" } }],
      }, { cwd: f.project, home: f.home })

      expect(resolved.exitCode).toBe(0)
      expect(resolved.body.resolutions[0]).toMatchObject({
        compatibility: { applied: false, reason: "higher-route" },
        binding: {
          profile: "current-task",
          source: "current-task",
          source_layer: "task",
          policy: "prefer",
          candidates: [
            { harness: "opencode", model: "opus", ordinal: 0 },
            { kind: "ce-default", ordinal: 1 },
          ],
        },
      })
      expect(resolved.body.resolutions[0].attempt_locks).toHaveLength(2)

      const finalized = await runResolver(
        finalizeRequest(resolved, 0, "ok", { model_actual: "opus" }),
        { cwd: f.project, home: f.home },
      )
      expect(finalized.exitCode).toBe(0)
      expect(finalized.body.action).toBe("accept")
      expect(finalized.body.receipt).toMatchObject({
        profile: "current-task",
        model_requested: "opus",
        identity_status: "verified",
      })
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("rejects a direct task binding whose CE-default candidate is not final", async () => {
    const f = await fixture()
    try {
      const result = await runResolver({
        protocol: "ce-routing/v1",
        op: "resolve_batch",
        cwd: f.project,
        intents: [{
          role: "ce-plan.plan-author",
          binding: {
            policy: "prefer",
            candidates: ["ce-default", { harness: "claude", model: "opus" }],
          },
        }],
        roles: [{ role: "ce-plan.plan-author" }],
      }, { cwd: f.project, home: f.home })

      expect(result.exitCode).not.toBe(0)
      expect(result.body.error.code).toBe("SETTING_INVALID")
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("rejects unsigned OpenCode task intents before they can win precedence", async () => {
    const f = await fixture()
    try {
      const result = await runResolver({
        protocol: "ce-routing/v1",
        op: "resolve_batch",
        cwd: f.project,
        host: { harness: "opencode", serving_family: "openai" },
        intents: [{
          role: "ce-work.implementation-worker",
          source: "model-normalized-free-form",
          binding: { policy: "require", candidates: [{ harness: "opencode", model: "openai/forged" }] },
        }],
        roles: [{ role: "ce-work.implementation-worker" }],
      }, { cwd: f.project, home: f.home })

      expect(result.exitCode).toBe(4)
      expect(result.body.error).toMatchObject({ code: "AUTHORITY_UNTRUSTED" })
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("rejects forged public OpenCode direct-input provenance", async () => {
    const f = await fixture()
    try {
      const result = await runResolver({
        protocol: "ce-routing/v1",
        op: "resolve_batch",
        cwd: f.project,
        host: { harness: "opencode", serving_family: "openai" },
        intents: [{
          role: "ce-work.implementation-worker",
          ...opencodeIntentProvenance("forged-public-caller"),
          binding: { policy: "require", candidates: [{ harness: "opencode", model: "openai/forged" }] },
        }],
        roles: [{ role: "ce-work.implementation-worker" }],
      }, { cwd: f.project, home: f.home })

      expect(result.exitCode).toBe(4)
      expect(result.body.error).toMatchObject({ code: "AUTHORITY_UNTRUSTED" })
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("exposes canonical OpenCode semantics only through the package-private host wrapper", async () => {
    const f = await fixture()
    try {
      const intent = {
        role: "ce-work.implementation-worker",
        ...opencodeIntentProvenance(),
        binding: {
          policy: "require",
          candidates: [{ harness: "opencode", model: "openai/gpt-5.6", effort: "high" }],
        },
      }
      const publicHostCall = await runResolver({
        protocol: "ce-routing/v1",
        op: "opencode_host",
        action: "resolve_batch",
        session_id: "session-1",
        cwd: f.project,
        host: { harness: "opencode", serving_family: "host-reported" },
        intent,
        roles: [{ role: "ce-work.implementation-worker", instance: { id: "U1" } }],
      }, { cwd: f.project, home: f.home })
      expect(publicHostCall.exitCode).toBe(2)
      expect(publicHostCall.body.error).toMatchObject({ code: "REQUEST_INVALID", message: "unknown routing operation" })

      const forgedBoundary = await runResolver({
        protocol: "ce-routing/v1",
        op: "resolve_batch",
        cwd: f.project,
        host: {
          harness: "opencode",
          serving_family: "host-reported",
          boundary: "native-plugin-wrapper/v1",
        },
        roles: [{ role: "ce-work.implementation-worker", instance: { id: "U1" } }],
      }, { cwd: f.project, home: f.home })
      expect(forgedBoundary.exitCode).toBe(2)
      expect(forgedBoundary.body.error).toMatchObject({ code: "REQUEST_INVALID" })

      const resolved = await runResolver({
        protocol: "ce-routing/v1",
        op: "opencode_host",
        action: "resolve_batch",
        session_id: "session-1",
        cwd: f.project,
        host: { harness: "opencode", serving_family: "host-reported" },
        intent,
        roles: [{ role: "ce-work.implementation-worker", instance: { id: "U1" } }],
      }, { cwd: f.project, home: f.home, resolverPath: opencodeHostWrapper })

      expect(resolved.exitCode).toBe(0)
      expect(resolved.body).toMatchObject({ op: "opencode_host", action: "resolve_batch" })
      expect(resolved.body.resolutions[0].binding).toMatchObject({
        source_layer: "task",
        source: "opencode-direct-input",
        policy: "require",
      })
      expect(resolved.body.resolutions[0].attempt_locks).toHaveLength(1)

      const finalized = await runResolver({
        protocol: "ce-routing/v1",
        op: "opencode_host",
        action: "finalize_attempt",
        cwd: f.project,
        snapshot: resolved.body.snapshot,
        attempt_lock: resolved.body.resolutions[0].attempt_locks[0],
        attempt: {
          ordinal: 0,
          terminal: true,
          integrated: false,
          phase: "dispatched",
          retry_safety: "none",
        },
        outcome: "ok",
        report: {
          provider_selected: "openai",
          model_selected: "gpt-5.6",
          variant_selected: "high",
          provider_actual: "openai",
          model_actual: "gpt-5.6",
          variant_actual: "high",
          effort_actual: "high",
        },
        prior_attempts: [],
      }, { cwd: f.project, home: f.home, resolverPath: opencodeHostWrapper })

      expect(finalized.exitCode).toBe(0)
      expect(finalized.body).toMatchObject({
        op: "opencode_host",
        action: "accept",
        receipt: {
          source_layer: "task",
          identity_status: "verified",
          model_actual: "gpt-5.6",
        },
      })

      const publicReuse = await runResolver({
        protocol: "ce-routing/v1",
        op: "resolve_batch",
        cwd: f.project,
        parent_snapshot: resolved.body.snapshot,
        roles: [{ role: "ce-work.implementation-worker", instance: { id: "U2" } }],
      }, { cwd: f.project, home: f.home })
      expect(publicReuse.exitCode).toBe(4)
      expect(publicReuse.body.error.code).toBe("CONTEXT_STALE")

      const publicFinalize = await runResolver({
        protocol: "ce-routing/v1",
        op: "finalize_attempt",
        cwd: f.project,
        snapshot: resolved.body.snapshot,
        attempt_lock: resolved.body.resolutions[0].attempt_locks[0],
        attempt: { ordinal: 0, terminal: true, integrated: false, phase: "dispatched", retry_safety: "none" },
        outcome: "ok",
        report: {},
        prior_attempts: [],
      }, { cwd: f.project, home: f.home })
      expect(publicFinalize.exitCode).toBe(4)
      expect(publicFinalize.body.error).toMatchObject({ code: "CONTEXT_STALE" })

      const wrongHost = await runResolver({
        protocol: "ce-routing/v1",
        op: "opencode_host",
        action: "resolve_batch",
        session_id: "session-1",
        cwd: f.project,
        host: { harness: "claude", serving_family: "anthropic" },
        roles: [{ role: "ce-work.implementation-worker" }],
      }, { cwd: f.project, home: f.home, resolverPath: opencodeHostWrapper })
      expect(wrongHost.exitCode).toBe(2)
      expect(wrongHost.body.error.code).toBe("REQUEST_INVALID")
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
      const resolved = await resolvedBinding(f, { policy: policy as "prefer" | "require" })
      const result = await runResolver(
        { ...finalizeRequest(resolved, 0, "ok", report), cwd: f.project },
        { cwd: f.project, home: f.home },
      )

      expect(result.exitCode).toBe(action === "block" ? 4 : 0)
      expect(result.body.action).toBe(action)
      expect(result.body.receipt.identity_status).toBe(identityStatus)
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("does not accept unavailable preferred output as unverified success", async () => {
    const f = await fixture()
    try {
      await writeFile(path.join(f.home, "config.yaml"), `routing:\n  profiles:\n    preferred:\n      candidates:\n        - { harness: codex, model: gpt-5-mini }\n        - { harness: claude, model: sonnet }\n  roles:\n    ce-work.implementation-worker: { profile: preferred, policy: prefer }\n`, { mode: 0o600 })
      const resolved = await runResolver({
        protocol: "ce-routing/v1",
        op: "resolve_batch",
        cwd: f.project,
        intents: [],
        roles: [{ role: "ce-work.implementation-worker", instance: { id: "U1" } }],
      }, { cwd: f.project, home: f.home })

      const result = await runResolver({
        protocol: "ce-routing/v1",
        op: "finalize_attempt",
        cwd: f.project,
        snapshot: resolved.body.snapshot,
        attempt_lock: resolved.body.resolutions[0].attempt_locks[0],
        attempt: {
          ordinal: 0,
          terminal: true,
          integrated: false,
          phase: "preflight",
          retry_safety: "none",
        },
        outcome: "unavailable",
        report: {},
      }, { cwd: f.project, home: f.home })

      expect(result.exitCode).toBe(0)
      expect(result.body.action).toBe("next_candidate")
      expect(result.body.receipt.identity_status).toBe("unavailable")
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("records OpenCode provider and variant serving evidence without model-authored claims", async () => {
    const f = await fixture()
    try {
      const resolved = await resolvedBinding(f, {
        policy: "require",
        candidates: [{ harness: "opencode", model: "openai/gpt-5-mini", effort: "high" }],
      })
      const result = await runResolver(finalizeRequest(resolved, 0, "ok", {
        provider_actual: "openai",
        model_actual: "gpt-5-mini",
        variant_actual: "high",
        effort_actual: "high",
      }), { cwd: f.project, home: f.home })

      expect(result.exitCode).toBe(0)
      expect(result.body.receipt).toMatchObject({
        identity_status: "verified",
        provider_actual: "openai",
        model_actual: "gpt-5-mini",
        variant_actual: "high",
        effort_actual: "high",
      })
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("verifies an unqualified OpenCode model against its concrete preflight provider", async () => {
    const f = await fixture()
    try {
      const resolved = await resolvedBinding(f, {
        policy: "require",
        candidates: [{ harness: "opencode", model: "shared-model" }],
      })
      const mismatched = await runResolver(finalizeRequest(resolved, 0, "ok", {
        provider_selected: "openai",
        model_selected: "shared-model",
        provider_actual: "anthropic",
        model_actual: "shared-model",
      }), { cwd: f.project, home: f.home })

      expect(mismatched.exitCode).toBe(4)
      expect(mismatched.body.action).toBe("block")
      expect(mismatched.body.receipt.identity_status).toBe("mismatched")
      expect(mismatched.body.error.code).toBe("IDENTITY_MISMATCH")

      const matching = await runResolver(finalizeRequest(resolved, 0, "ok", {
        provider_selected: "openai",
        model_selected: "shared-model",
        provider_actual: "openai",
        model_actual: "shared-model",
      }), { cwd: f.project, home: f.home })
      expect(matching.exitCode).toBe(0)
      expect(matching.body.receipt.identity_status).toBe("verified")
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test.each([
    ["preferred unavailable", "prefer", "unavailable", "next_candidate", "unavailable", 0, { phase: "preflight", retry_safety: "none" }],
    ["preferred failed after dispatch", "prefer", "failed", "block", "failed", 4, { phase: "dispatched", retry_safety: "none" }],
    ["required unavailable", "require", "unavailable", "block", "unavailable", 4, { phase: "preflight", retry_safety: "none" }],
    ["required failed", "require", "failed", "block", "failed", 4, { phase: "dispatched", retry_safety: "none" }],
  ])("finalizes typed adapter outcome: %s", async (_name, policy, outcome, action, identity, exitCode, attempt) => {
    const f = await fixture()
    try {
      const resolved = await resolvedBinding(f, { policy: policy as "prefer" | "require" })
      const result = await runResolver(
        finalizeRequest(resolved, 0, outcome as "unavailable" | "failed", {}, attempt),
        { cwd: f.project, home: f.home },
      )

      expect(result.exitCode).toBe(exitCode)
      expect(result.body.action).toBe(action)
      expect(result.body.receipt.adapter_outcome).toBe(outcome)
      expect(result.body.receipt.identity_status).toBe(identity)
      expect(result.body.receipt.identity_status).not.toBe("accepted_unverified")
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("refuses retry after integration", async () => {
    const f = await fixture()
    try {
      const resolved = await resolvedBinding(f)
      const result = await runResolver(
        finalizeRequest(
          resolved,
          0,
          "ok",
          { model_actual: "other" },
          { ordinal: 0, terminal: true, integrated: true },
        ),
        { cwd: f.project, home: f.home },
      )

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
        host: { harness: "claude", serving_family: "anthropic" },
        intents,
        roles: [{ role: "ce-work.implementation-worker", instance: { id: "U1" } }],
      }, { cwd: f.project, home: f.home })
      expect(parent.exitCode).toBe(0)

      await writeRouting("drifted-model")
      const childRequest = {
        protocol: "ce-routing/v1",
        op: "resolve_batch",
        cwd: f.project,
        host: { harness: "claude", serving_family: "anthropic" },
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
        host: { harness: "claude", serving_family: "anthropic" },
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

      const rehashed = structuredClone(parent.body.snapshot)
      rehashed.routing.profiles.frozen.candidates[0].model = "rehashed-forged-model"
      recomputeSnapshotId(rehashed)
      const rehashedResult = await runResolver(
        { ...childRequest, parent_snapshot: rehashed, parent_snapshot_id: rehashed.id },
        { cwd: f.project, home: f.home },
      )
      expect(rehashedResult.exitCode).toBe(4)
      expect(rehashedResult.body.error.code).toBe("CONTEXT_STALE")

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

  test("authenticates unchanged snapshot envelopes across installed resolver copies", async () => {
    const f = await fixture()
    try {
      await writeFile(path.join(f.home, "config.yaml"), `routing:\n  profiles:\n    isolated:\n      candidates:\n        - { harness: codex, model: gpt-5-mini }\n  classes:\n    implementation: { profile: isolated, policy: prefer }\n`, { mode: 0o600 })
      const isolated = await runResolver({
        protocol: "ce-routing/v1",
        op: "resolve_batch",
        cwd: f.project,
        intents: [],
        roles: [{ role: "ce-work.implementation-worker", instance: { id: "isolated-state" } }],
      }, { cwd: f.project, home: f.home })
      expect(isolated.exitCode).toBe(0)
      expect(isolated.body.snapshot).not.toHaveProperty("auth")

      const finalized = await runResolver(
        finalizeRequest(isolated, 0, "ok", { model_actual: "gpt-5-mini" }),
        {
          cwd: f.project,
          home: f.home,
          resolverPath: path.join(repoRoot, "skills", "ce-work", "scripts", "ce-routing.py"),
        },
      )
      expect(finalized.exitCode).toBe(0)
      expect(finalized.body.action).toBe("accept")
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("validates private snapshot state ownership, modes, symlinks, and lifetime in isolation", async () => {
    const f = await fixture()
    const stateRoot = path.join(f.root, "isolated-state")
    const snapshot = { id: `cesnap-v1:${"1".repeat(64)}`, value: "private-state-test" }
    const runProbe = async (action: "create" | "validate") => {
      const probe = [
        "import importlib.util, json, sys",
        `spec = importlib.util.spec_from_file_location('ce_routing_auth_test', ${JSON.stringify(resolver)})`,
        "module = importlib.util.module_from_spec(spec)",
        "spec.loader.exec_module(module)",
        `module.SNAPSHOT_STATE_ROOT = ${JSON.stringify(stateRoot)}`,
        `snapshot = json.loads(${JSON.stringify(JSON.stringify(snapshot))})`,
        "try:",
        `    ${action === "create" ? "module.authenticate_snapshot(snapshot)" : "module.validate_snapshot_auth(snapshot)"}`,
        "except module.RoutingError as error:",
        "    print(module.canonical_json(error.response()))",
        "    raise SystemExit(error.exit_code)",
        "print(module.canonical_json({'ok': True}))",
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
      return { exitCode, body: JSON.parse(stdout), stderr }
    }
    try {
      await mkdir(stateRoot, { mode: 0o700 })
      expect((await runProbe("create")).exitCode).toBe(0)
      expect((await runProbe("validate")).exitCode).toBe(0)

      const authRoot = path.join(stateRoot, "routing", "snapshot-auth")
      const keyPath = path.join(authRoot, "snapshot-auth-v1.key")
      const recordPath = path.join(authRoot, "snapshots", `${"1".repeat(64)}.mac`)
      const key = await readFile(keyPath)
      const record = await readFile(recordPath, "utf8")
      expect(key).toHaveLength(32)
      expect((await stat(authRoot)).mode & 0o777).toBe(0o700)
      expect((await stat(keyPath)).mode & 0o777).toBe(0o600)
      expect((await stat(recordPath)).mode & 0o777).toBe(0o600)
      expect(record.trim()).toMatch(/^[0-9a-f]{64}$/)

      const expiredAt = new Date(Date.now() - (7 * 24 * 60 * 60 + 1) * 1000)
      await utimes(recordPath, expiredAt, expiredAt)
      const expired = await runProbe("validate")
      expect(expired.exitCode).toBe(4)
      expect(expired.body.error.code).toBe("CONTEXT_STALE")
      const now = new Date()
      await utimes(recordPath, now, now)

      await chmod(keyPath, 0o644)
      const unsafeState = await runProbe("validate")
      expect(unsafeState.exitCode).toBe(3)
      expect(unsafeState.body.error).toMatchObject({ code: "CONFIG_UNSAFE", reason: "mode" })

      await rm(keyPath)
      const attackerKey = path.join(f.root, "attacker-snapshot.key")
      await writeFile(attackerKey, Buffer.alloc(32, 7), { mode: 0o600 })
      await symlink(attackerKey, keyPath)
      const symlinkedState = await runProbe("validate")
      expect(symlinkedState.exitCode).toBe(3)
      expect(symlinkedState.body.error).toMatchObject({ code: "CONFIG_UNSAFE", reason: "state_key" })
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("normalizes owning legacy recipients into one frozen resolve_batch snapshot", async () => {
    const f = await fixture()
    try {
      const configPath = path.join(f.home, "config.yaml")
      await writeFile(configPath, `plan_model: opus\nbrainstorm_model: fable\ncross_model_peer: composer\nwork_engine_mode: prefer\nwork_engine_preferences:\n  - { harness: codex, model: gpt-5-mini }\n`, { mode: 0o600 })
      const roles = [
        { role: "ce-plan.plan-author", instance: { id: "author" } },
        { role: "ce-brainstorm.approach-generator", instance: { id: "approaches" } },
        { role: "ce-code-review.adversarial-reviewer", instance: { id: "peer" } },
        { role: "ce-work.implementation-worker", instance: { id: "implementation" } },
        { role: "ce-plan.repo-research-analyst", instance: { id: "non-owner" } },
      ]
      const parent = await runResolver({
        protocol: "ce-routing/v1",
        op: "resolve_batch",
        cwd: f.project,
        host: { harness: "opencode", serving_family: "openai" },
        intents: [],
        roles,
      }, { cwd: f.project, home: f.home })

      expect(parent.exitCode).toBe(0)
      expect(parent.body.snapshot.compatibility.values).toMatchObject({
        plan_model: "opus",
        brainstorm_model: "fable",
        cross_model_peer: "composer",
        work_engine_mode: "prefer",
      })
      expect(parent.body.resolutions[0]).toMatchObject({
        compatibility: { kind: "plan-model", applied: true, provenance: { plan_model: { layer: "global", authority_trusted: true } } },
        binding: { profile: "legacy-plan-model", source_layer: "global-legacy-plan-model", policy: "prefer" },
      })
      expect(parent.body.resolutions[0].binding.candidates).toEqual([
        { harness: "opencode", model: "opus", ordinal: 0 },
        { harness: "claude", model: "opus", effort: "high", ordinal: 1 },
        { kind: "ce-default", ordinal: 2 },
      ])
      expect(parent.body.resolutions[1].binding.profile).toBe("legacy-brainstorm-model")
      expect(parent.body.resolutions[2].binding.candidates[0]).toEqual({ harness: "composer", ordinal: 0 })
      expect(parent.body.resolutions[3].binding.candidates).toEqual([
        { harness: "codex", model: "gpt-5-mini", ordinal: 0 },
        { kind: "ce-default", ordinal: 1 },
      ])
      expect(parent.body.resolutions[4].binding).toMatchObject({ kind: "ce-default", source_layer: "builtin" })
      expect(parent.body.resolutions[4]).not.toHaveProperty("compatibility")

      const claudeHost = await runResolver({
        protocol: "ce-routing/v1",
        op: "resolve_batch",
        cwd: f.project,
        host: { harness: "claude", serving_family: "anthropic" },
        intents: [],
        roles: [roles[0]],
      }, { cwd: f.project, home: f.home })
      expect(claudeHost.body.resolutions[0].binding.candidates).toEqual([
        { harness: "claude", model: "opus", ordinal: 0 },
        { harness: "claude", model: "opus", effort: "high", ordinal: 1 },
        { kind: "ce-default", ordinal: 2 },
      ])

      await writeFile(configPath, `plan_model: sonnet\nbrainstorm_model: sonnet\ncross_model_peer: codex\nwork_engine_mode: require\nwork_engine_preferences:\n  - { harness: claude, model: sonnet }\n`, { mode: 0o600 })
      const child = await runResolver({
        protocol: "ce-routing/v1",
        op: "resolve_batch",
        cwd: f.project,
        parent_snapshot: parent.body.snapshot,
        roles: [roles[0], roles[3]],
      }, { cwd: f.project, home: f.home })

      expect(child.exitCode).toBe(0)
      expect(child.body.resolutions[0].binding.candidates[0].model).toBe("opus")
      expect(child.body.resolutions[1].binding).toMatchObject({
        policy: "prefer",
        candidates: [{ harness: "codex", model: "gpt-5-mini", ordinal: 0 }, { kind: "ce-default", ordinal: 1 }],
      })
      expect(child.body.settings.provenance.plan_model.layer).toBe("global")
      expect(child.body.snapshot.parent_snapshot_id).toBe(parent.body.snapshot.id)
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("rejects malformed host identity without an internal failure", async () => {
    const f = await fixture()
    try {
      await writeFile(path.join(f.home, "config.yaml"), "plan_model: opus\n", { mode: 0o600 })
      const result = await runResolver({
        protocol: "ce-routing/v1",
        op: "resolve_batch",
        cwd: f.project,
        host: { harness: [] },
        intents: [],
        roles: [{ role: "ce-plan.plan-author" }],
      }, { cwd: f.project, home: f.home })

      expect(result.exitCode).toBe(2)
      expect(result.body.error.code).toBe("REQUEST_INVALID")
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("preserves generalized precedence and narrower project resets around compatibility routes", async () => {
    const f = await fixture()
    try {
      const globalPath = path.join(f.home, "config.yaml")
      const projectDir = path.join(f.project, ".compound-engineering")
      const projectPath = path.join(projectDir, "config.local.yaml")
      await mkdir(projectDir, { recursive: true })
      await writeFile(globalPath, `cross_model_peer: codex\nwork_engine_mode: prefer\nwork_engine_preferences:\n  - { harness: codex, model: economy }\nrouting:\n  profiles:\n    strong:\n      candidates:\n        - { harness: claude, model: strong }\n  classes:\n    review: { profile: strong, policy: require }\n    implementation: { profile: strong, policy: require }\n`, { mode: 0o600 })
      const resolve = () => runResolver({
        protocol: "ce-routing/v1",
        op: "resolve_batch",
        cwd: f.project,
        intents: [],
        roles: [
          { role: "ce-code-review.adversarial-reviewer", instance: { id: "peer" } },
          { role: "ce-work.implementation-worker", instance: { id: "work" } },
        ],
      }, { cwd: f.project, home: f.home })

      const globalCompatibility = await resolve()
      expect(globalCompatibility.body.resolutions.map((item: any) => item.binding.source_layer)).toEqual([
        "global-legacy-cross-model-peer",
        "global-legacy-work-engine",
      ])

      await writeFile(globalPath, `cross_model_peer: codex\nwork_engine_mode: prefer\nwork_engine_preferences:\n  - { harness: codex, model: economy }\nrouting:\n  profiles:\n    strong:\n      candidates:\n        - { harness: claude, model: strong }\n  roles:\n    ce-code-review.adversarial-reviewer: { profile: strong, policy: require }\n    ce-work.implementation-worker: { profile: strong, policy: require }\n`, { mode: 0o600 })
      const globalRole = await resolve()
      expect(globalRole.body.resolutions.map((item: any) => item.binding.source_layer)).toEqual([
        "global-role",
        "global-role",
      ])

      await writeFile(projectPath, `routing:\n  classes:\n    review: ce-default\n    implementation: ce-default\n`, { mode: 0o600 })
      const projectReset = await resolve()
      expect(projectReset.body.resolutions.map((item: any) => item.binding)).toEqual([
        expect.objectContaining({ kind: "ce-default", explicit_reset: true, source_layer: "project-class" }),
        expect.objectContaining({ kind: "ce-default", explicit_reset: true, source_layer: "project-class" }),
      ])

      await writeFile(projectPath, `cross_model_peer: claude\nwork_engine_mode: require\nwork_engine_preferences:\n  - { harness: claude, model: project-worker }\nrouting:\n  classes:\n    review: { profile: strong, policy: require }\n    implementation: { profile: strong, policy: require }\n`, { mode: 0o600 })
      const projectCompatibility = await resolve()
      expect(projectCompatibility.body.resolutions.map((item: any) => item.binding.source_layer)).toEqual([
        "project-legacy-cross-model-peer",
        "project-legacy-work-engine",
      ])

      await writeFile(projectPath, `cross_model_peer: null\nwork_engine_mode: off\nwork_engine_preferences: []\nrouting:\n  classes:\n    review: { profile: strong, policy: require }\n    implementation: { profile: strong, policy: require }\n`, { mode: 0o600 })
      const projectMasks = await resolve()
      expect(projectMasks.body.resolutions.map((item: any) => item.binding.source_layer)).toEqual([
        "project-class",
        "project-class",
      ])
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test.each([
    ["plan model", "plan_model: opus\n", "ce-plan.plan-author", "plan_model"],
    ["peer target", "cross_model_peer: codex\n", "ce-code-review.adversarial-reviewer", "cross_model_peer"],
    ["work engine", "work_engine_mode: prefer\nwork_engine_preferences:\n  - { harness: codex }\n", "ce-work.implementation-worker", "work_engine_mode"],
  ])("rejects untrusted recipient-bearing project compatibility: %s", async (_name, config, role, setting) => {
    const f = await fixture()
    try {
      await writeFile(path.join(f.project, ".gitignore"), "")
      const projectDir = path.join(f.project, ".compound-engineering")
      await mkdir(projectDir, { recursive: true })
      await writeFile(path.join(projectDir, "config.local.yaml"), config, { mode: 0o600 })
      const result = await runResolver({
        protocol: "ce-routing/v1",
        op: "resolve_batch",
        cwd: f.project,
        intents: [],
        roles: [{ role, instance: { id: "untrusted" } }],
      }, { cwd: f.project, home: f.home })

      expect(result.exitCode).toBe(4)
      expect(result.body.error).toMatchObject({ code: "AUTHORITY_UNTRUSTED", role, setting })
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

  test("does not let a hostile PATH forge tracked project config authority", async () => {
    const f = await fixture()
    try {
      const projectDir = path.join(f.project, ".compound-engineering")
      const projectPath = path.join(projectDir, "config.local.yaml")
      const shimDir = path.join(f.root, "hostile-bin")
      const marker = path.join(f.root, "hostile-git-ran")
      await writeFile(path.join(f.project, ".gitignore"), "")
      await mkdir(projectDir, { recursive: true })
      await writeFile(projectPath, `routing:\n  profiles:\n    forged:\n      candidates:\n        - { harness: codex, model: forged-model }\n  classes:\n    implementation: { profile: forged, policy: require }\n`, { mode: 0o600 })
      await Bun.$`git add .compound-engineering/config.local.yaml`.cwd(f.project)
      await mkdir(shimDir)
      const shim = path.join(shimDir, "git")
      await writeFile(shim, `#!/bin/sh\nprintf hostile > ${JSON.stringify(marker)}\ncase "$*" in\n  *rev-parse*) printf '%s\\n' ${JSON.stringify(f.project)}; exit 0 ;;\n  *check-ignore*) exit 0 ;;\n  *ls-files*) exit 1 ;;\nesac\nexit 1\n`)
      await chmod(shim, 0o755)

      const result = await runResolver({
        protocol: "ce-routing/v1",
        op: "resolve_batch",
        cwd: f.project,
        intents: [],
        roles: [{ role: "ce-work.implementation-worker" }],
      }, {
        cwd: f.project,
        home: f.home,
        env: {
          PATH: `${shimDir}:${process.env.PATH ?? "/usr/bin:/bin"}`,
          GIT_CONFIG_GLOBAL: path.join(f.root, "attacker.gitconfig"),
          GIT_CONFIG_SYSTEM: path.join(f.root, "attacker-system.gitconfig"),
        },
      })

      expect(result.exitCode).toBe(3)
      expect(result.body.error).toMatchObject({ code: "CONFIG_UNSAFE", reason: "tracked" })
      expect(await Bun.file(marker).exists()).toBe(false)
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("rejects rehashed snapshots with forged project authority", async () => {
    const f = await fixture()
    try {
      await writeFile(path.join(f.project, ".gitignore"), "")
      const projectDir = path.join(f.project, ".compound-engineering")
      await mkdir(projectDir, { recursive: true })
      await writeFile(path.join(projectDir, "config.local.yaml"), `routing:\n  profiles:\n    forged:\n      candidates:\n        - { harness: codex, model: forged-model }\n  classes:\n    review: { profile: forged, policy: require }\n`, { mode: 0o600 })
      const parent = await runResolver({
        protocol: "ce-routing/v1",
        op: "resolve_batch",
        cwd: f.project,
        intents: [],
        roles: [{ role: "ce-work.implementation-worker" }],
      }, { cwd: f.project, home: f.home })
      expect(parent.exitCode).toBe(0)

      const forged = structuredClone(parent.body.snapshot)
      forged.routing.layers.project.authority_trusted = true
      forged.routing.profile_provenance.forged.authority_trusted = true
      recomputeSnapshotId(forged)
      const child = await runResolver({
        protocol: "ce-routing/v1",
        op: "resolve_batch",
        cwd: f.project,
        intents: [],
        parent_snapshot: forged,
        parent_snapshot_id: forged.id,
        roles: [{ role: "ce-code-review.security-reviewer" }],
      }, { cwd: f.project, home: f.home })

      expect(child.exitCode).toBe(4)
      expect(child.body.error.code).toBe("CONTEXT_STALE")
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
      }, {
        cwd: f.project,
        home: f.home,
        resolverPath: path.join(repoRoot, "skills", "ce-sweep", "scripts", "ce-routing.py"),
      })
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

  test("binds patch_source writer identity to each generated resolver copy", async () => {
    const f = await fixture()
    const productPulseResolver = path.join(repoRoot, "skills", "ce-product-pulse", "scripts", "ce-routing.py")
    try {
      const inspected = await runResolver(
        { protocol: "ce-routing/v1", op: "inspect", cwd: f.project },
        { cwd: f.project, home: f.home, resolverPath: productPulseResolver },
      )
      const impersonation = await runResolver({
        protocol: "ce-routing/v1",
        op: "patch_source",
        cwd: f.project,
        writer: "ce-setup",
        layer: "global",
        expected_revision: inspected.body.sources.global.revision,
        set: { plan_output: "html" },
        remove: [],
      }, { cwd: f.project, home: f.home, resolverPath: productPulseResolver })
      expect(impersonation.exitCode).toBe(5)
      expect(impersonation.body.error).toMatchObject({
        code: "WRITE_UNSAFE",
        writer: "ce-setup",
        consumer: "ce-product-pulse",
      })

      const owned = await runResolver({
        protocol: "ce-routing/v1",
        op: "patch_source",
        cwd: f.project,
        writer: "ce-product-pulse",
        layer: "project",
        expected_revision: inspected.body.sources.project.revision,
        set: { pulse_product_name: "Trusted Pulse" },
        remove: [],
      }, { cwd: f.project, home: f.home, resolverPath: productPulseResolver })
      expect(owned.exitCode).toBe(0)
      expect(owned.body).toMatchObject({ writer: "ce-product-pulse", consumer: "ce-product-pulse" })

      const after = await runResolver(
        { protocol: "ce-routing/v1", op: "inspect", cwd: f.project },
        { cwd: f.project, home: f.home, resolverPath: productPulseResolver },
      )
      const foreignKey = await runResolver({
        protocol: "ce-routing/v1",
        op: "patch_source",
        cwd: f.project,
        writer: "ce-product-pulse",
        layer: "project",
        expected_revision: after.body.sources.project.revision,
        set: { sweep_ack_cap: 10 },
        remove: [],
      }, { cwd: f.project, home: f.home, resolverPath: productPulseResolver })
      expect(foreignKey.exitCode).toBe(5)
      expect(foreignKey.body.error).toMatchObject({
        code: "WRITE_UNSAFE",
        writer: "ce-product-pulse",
        setting: "sweep_ack_cap",
      })
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

  test("preserves a competing save injected at the final replacement boundary", async () => {
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
        "original_rename = os.rename",
        "original_replace = os.replace",
        "injected = False",
        "def compete_at_boundary(src, dst, *args, **kwargs):\n    global injected\n    if not injected and src == os.path.basename(config_path):\n        injected = True\n        with open(external_path, 'wb') as stream:\n            stream.write(b'plan_output: html\\npulse_product_name: external\\n')\n        os.chmod(external_path, 0o600)\n        original_replace(external_path, config_path)\n    return original_rename(src, dst, *args, **kwargs)",
        "module.os.rename = compete_at_boundary",
        "try:\n    module.atomic_write(config_path, b'plan_output: changed\\n', source, 262144)\nexcept module.RoutingError as error:\n    print(module.canonical_json({'code': error.code, **error.details}))\nelse:\n    raise SystemExit('replacement was overwritten')",
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
      const conflict = JSON.parse(stdout)
      expect(conflict.code).toBe("WRITE_CONFLICT")
      expect(await readFile(conflict.candidate_path, "utf8")).toBe("plan_output: changed\n")
      expect(await readFile(configPath, "utf8")).toContain("pulse_product_name: external")
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("restores the source when interrupted immediately after displacement", async () => {
    const f = await fixture()
    try {
      const configPath = path.join(f.home, "config.yaml")
      await writeFile(configPath, "plan_output: md\n", { mode: 0o600 })
      const probe = [
        "import importlib.util, os",
        `resolver_path = ${JSON.stringify(resolver)}`,
        `config_path = ${JSON.stringify(configPath)}`,
        "spec = importlib.util.spec_from_file_location('ce_routing_interrupt_test', resolver_path)",
        "module = importlib.util.module_from_spec(spec)",
        "spec.loader.exec_module(module)",
        "raw = open(config_path, 'rb').read()",
        "source = {'exists': True, 'identity': module.file_identity(os.stat(config_path)), 'revision': module.digest('cecfg-v1', raw)}",
        "original_rename = module.os.rename",
        "def interrupt_after_displacement(src, dst, *args, **kwargs):\n    result = original_rename(src, dst, *args, **kwargs)\n    if src == os.path.basename(config_path):\n        raise KeyboardInterrupt()\n    return result",
        "module.os.rename = interrupt_after_displacement",
        "try:\n    module.atomic_write(config_path, b'plan_output: html\\n', source, 262144)\nexcept module.RoutingError as error:\n    print(module.canonical_json({'code': error.code, **error.details}))\nelse:\n    raise SystemExit('interruption was not raised')",
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
      const conflict = JSON.parse(stdout)
      expect(conflict.code).toBe("WRITE_CONFLICT")
      expect(await readFile(configPath, "utf8")).toBe("plan_output: md\n")
      expect(await readFile(conflict.candidate_path, "utf8")).toBe("plan_output: html\n")
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("blocks snapshot readers across the missing replacement boundary", async () => {
    const f = await fixture()
    let writer: any
    let interruptedReader: any
    let reader: any
    try {
      const configPath = path.join(f.home, "config.yaml")
      const boundary = path.join(f.root, "replacement-paused")
      const release = path.join(f.root, "release-replacement")
      const interruptedAttempt = path.join(f.root, "interrupted-reader-attempted")
      const interruptedAcquired = path.join(f.root, "interrupted-reader-acquired")
      const readerAttempt = path.join(f.root, "reader-attempted")
      const readerAcquired = path.join(f.root, "reader-acquired")
      const oldConfig = `routing:\n  profiles:\n    guarded:\n      candidates:\n        - { harness: codex, model: old-policy }\n  classes:\n    implementation: { profile: guarded, policy: require }\n`
      const newRouting = {
        profiles: { guarded: { candidates: [{ harness: "codex", model: "new-policy" }] } },
        classes: { implementation: { profile: "guarded", policy: "require" } },
        roles: {},
      }
      await writeFile(configPath, oldConfig, { mode: 0o600 })
      const expectedRevision = `cecfg-v1:${createHash("sha256").update(oldConfig).digest("hex")}`
      const writerProbe = [
        "import importlib.util, os, time",
        `resolver_path = ${JSON.stringify(resolver)}`,
        `config_path = ${JSON.stringify(configPath)}`,
        `boundary = ${JSON.stringify(boundary)}`,
        `release = ${JSON.stringify(release)}`,
        "spec = importlib.util.spec_from_file_location('ce_routing_paused_writer', resolver_path)",
        "module = importlib.util.module_from_spec(spec)",
        "spec.loader.exec_module(module)",
        "original_rename = module.os.rename",
        "def pause_after_displacement(src, dst, *args, **kwargs):\n    result = original_rename(src, dst, *args, **kwargs)\n    if src == os.path.basename(config_path):\n        with open(boundary, 'xb'):\n            pass\n        while not os.path.exists(release):\n            time.sleep(0.005)\n    return result",
        "module.os.rename = pause_after_displacement",
        "module.main()",
      ].join("\n")
      const patchRequest = {
        protocol: "ce-routing/v1",
        op: "patch_source",
        cwd: f.project,
        writer: "ce-setup",
        layer: "global",
        expected_revision: expectedRevision,
        set: { routing: newRouting },
        remove: [],
      }
      writer = Bun.spawn(["python3", "-I", "-S", "-c", writerProbe], {
        cwd: f.project,
        env: {
          PATH: process.env.PATH ?? "/usr/bin:/bin",
          HOME: f.home,
          COMPOUND_ENGINEERING_HOME: f.home,
        },
        stdin: new Blob([JSON.stringify(patchRequest)]),
        stdout: "pipe",
        stderr: "pipe",
      })
      await waitForFile(boundary)

      const request = {
        protocol: "ce-routing/v1",
        op: "resolve_batch",
        cwd: f.project,
        intents: [],
        roles: [{ role: "ce-work.implementation-worker" }],
      }
      const spawnObservedReader = (attempted: string, acquired: string) => {
        const readerProbe = [
          "import importlib.util",
          `resolver_path = ${JSON.stringify(resolver)}`,
          `attempted = ${JSON.stringify(attempted)}`,
          `acquired = ${JSON.stringify(acquired)}`,
          "spec = importlib.util.spec_from_file_location('ce_routing_observed_reader', resolver_path)",
          "module = importlib.util.module_from_spec(spec)",
          "spec.loader.exec_module(module)",
          "original_flock = module.fcntl.flock",
          "observed = [False]",
          "def observe_recovery_lock(fd, operation):\n    first_exclusive = operation == module.fcntl.LOCK_EX and not observed[0]\n    if first_exclusive:\n        observed[0] = True\n        with open(attempted, 'xb'):\n            pass\n    result = original_flock(fd, operation)\n    if first_exclusive:\n        with open(acquired, 'xb'):\n            pass\n    return result",
          "module.fcntl.flock = observe_recovery_lock",
          "module.main()",
        ].join("\n")
        return Bun.spawn(["python3", "-I", "-S", "-c", readerProbe], {
          cwd: f.project,
          env: {
            PATH: process.env.PATH ?? "/usr/bin:/bin",
            HOME: f.home,
            COMPOUND_ENGINEERING_HOME: f.home,
          },
          stdin: new Blob([JSON.stringify(request)]),
          stdout: "pipe",
          stderr: "pipe",
        })
      }

      interruptedReader = spawnObservedReader(interruptedAttempt, interruptedAcquired)
      await waitForFile(interruptedAttempt)
      await Bun.sleep(50)
      expect(await Bun.file(interruptedAcquired).exists()).toBe(false)
      interruptedReader.kill()
      await interruptedReader.exited

      reader = spawnObservedReader(readerAttempt, readerAcquired)
      await waitForFile(readerAttempt)
      await Bun.sleep(50)
      expect(await Bun.file(readerAcquired).exists()).toBe(false)

      await writeFile(release, "release\n")
      const [writerExit, writerStdout, writerStderr, readerExit, readerStdout, readerStderr] = await Promise.all([
        writer.exited,
        new Response(writer.stdout).text(),
        new Response(writer.stderr).text(),
        reader.exited,
        new Response(reader.stdout).text(),
        new Response(reader.stderr).text(),
      ])
      expect(writerExit, writerStderr).toBe(0)
      expect(JSON.parse(writerStdout).ok).toBe(true)
      expect(readerExit, readerStderr).toBe(0)
      const resolved = JSON.parse(readerStdout)
      expect(resolved.sources.global.exists).toBe(true)
      expect(resolved.resolutions[0].binding.kind).not.toBe("ce-default")
      expect(resolved.resolutions[0].binding.policy).toBe("require")
      expect(["old-policy", "new-policy"]).toContain(resolved.resolutions[0].binding.candidates[0].model)
    } finally {
      for (const process of [writer, interruptedReader, reader]) {
        process?.kill()
        if (process) await process.exited.catch(() => {})
      }
      await rm(f.root, { recursive: true, force: true })
    }
  }, 15_000)

  test.each([
    ["transaction-created", "SIGTERM", "closed", null],
    ["candidate-durable", "SIGKILL", "closed", null],
    ["metadata-durable", "SIGKILL", "old", "old-policy"],
    ["displaced", "SIGKILL", "old", "old-policy"],
    ["installed", "SIGKILL", "new", "new-policy"],
    ["committed", "SIGKILL", "new", "new-policy"],
    ["source-cleaned", "SIGKILL", "new", "new-policy"],
    ["candidate-cleaned", "SIGKILL", "new", "new-policy"],
    ["retired", "SIGKILL", "new", "new-policy"],
    ["cleaned", "SIGKILL", "new", "new-policy"],
  ])("recovers or fails closed after %s crash", async (boundary, signalName, outcome, model) => {
    const f = await fixture()
    try {
      const configPath = path.join(f.home, "config.yaml")
      const oldConfig = `routing:\n  profiles:\n    guarded:\n      candidates:\n        - { harness: codex, model: old-policy }\n  classes:\n    implementation: { profile: guarded, policy: require }\n`
      const newRouting = {
        profiles: { guarded: { candidates: [{ harness: "codex", model: "new-policy" }] } },
        classes: { implementation: { profile: "guarded", policy: "require" } },
        roles: {},
      }
      await writeFile(configPath, oldConfig, { mode: 0o600 })
      const probe = [
        "import importlib.util, os, signal",
        `resolver_path = ${JSON.stringify(resolver)}`,
        `target_boundary = ${JSON.stringify(boundary)}`,
        `signal_name = ${JSON.stringify(signalName)}`,
        "spec = importlib.util.spec_from_file_location('ce_routing_crash_writer', resolver_path)",
        "module = importlib.util.module_from_spec(spec)",
        "spec.loader.exec_module(module)",
        "def crash_at_boundary(name):\n    if name == target_boundary:\n        os.kill(os.getpid(), getattr(signal, signal_name))",
        "module.transaction_boundary = crash_at_boundary",
        "raise SystemExit(module.main())",
      ].join("\n")
      const patchRequest = {
        protocol: "ce-routing/v1",
        op: "patch_source",
        cwd: f.project,
        writer: "ce-setup",
        layer: "global",
        expected_revision: `cecfg-v1:${createHash("sha256").update(oldConfig).digest("hex")}`,
        set: { routing: newRouting },
        remove: [],
      }
      const writer = Bun.spawn(["python3", "-I", "-S", "-c", probe], {
        cwd: f.project,
        env: {
          PATH: process.env.PATH ?? "/usr/bin:/bin",
          HOME: f.home,
          COMPOUND_ENGINEERING_HOME: f.home,
        },
        stdin: new Blob([JSON.stringify(patchRequest)]),
        stdout: "pipe",
        stderr: "pipe",
      })
      const [writerExit] = await Promise.all([
        writer.exited,
        new Response(writer.stdout).text(),
        new Response(writer.stderr).text(),
      ])
      expect(writerExit).not.toBe(0)

      const resolved = await runResolver({
        protocol: "ce-routing/v1",
        op: "resolve_batch",
        cwd: f.project,
        intents: [],
        roles: [{ role: "ce-work.implementation-worker" }],
      }, { cwd: f.project, home: f.home })
      if (outcome === "closed") {
        expect(resolved.exitCode).toBe(3)
        expect(resolved.body.error.code).toBe("CONFIG_RECOVERY_REQUIRED")
        expect(await readFile(configPath, "utf8")).toBe(oldConfig)
      } else {
        expect(resolved.exitCode, resolved.stderr).toBe(0)
        expect(resolved.body.sources.global.exists).toBe(true)
        expect(resolved.body.resolutions[0].binding).toMatchObject({ policy: "require" })
        expect(resolved.body.resolutions[0].binding.kind).not.toBe("ce-default")
        expect(resolved.body.resolutions[0].binding.candidates[0].model).toBe(model)
      }

      const entries = await readdir(f.home)
      if (outcome === "old") {
        const preserved = entries.filter((entry) => entry.startsWith(".ce-candidate-"))
        expect(preserved).toHaveLength(1)
        expect(await readFile(path.join(f.home, preserved[0]), "utf8")).toContain("new-policy")
      }
      if (boundary === "candidate-durable") {
        const transactions = entries.filter((entry) => entry.startsWith(".ce-replace-"))
        expect(transactions).toHaveLength(1)
        expect(await readFile(path.join(f.home, transactions[0], "candidate"), "utf8")).toContain("new-policy")
      }
      if (outcome !== "closed") {
        expect(entries.some((entry) => entry.startsWith(".ce-replace-") || entry.startsWith(".ce-cleanup-"))).toBe(false)
      }
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  }, 15_000)

  test("preserves old, candidate, and an external save after a displaced writer is killed", async () => {
    const f = await fixture()
    try {
      const configPath = path.join(f.home, "config.yaml")
      const oldConfig = `routing:\n  profiles:\n    guarded:\n      candidates:\n        - { harness: codex, model: old-policy }\n  classes:\n    implementation: { profile: guarded, policy: require }\n`
      await writeFile(configPath, oldConfig, { mode: 0o600 })
      const probe = [
        "import importlib.util, os, signal",
        `resolver_path = ${JSON.stringify(resolver)}`,
        "spec = importlib.util.spec_from_file_location('ce_routing_external_crash', resolver_path)",
        "module = importlib.util.module_from_spec(spec)",
        "spec.loader.exec_module(module)",
        "def crash_at_boundary(name):\n    if name == 'displaced':\n        os.kill(os.getpid(), signal.SIGKILL)",
        "module.transaction_boundary = crash_at_boundary",
        "raise SystemExit(module.main())",
      ].join("\n")
      const writer = Bun.spawn(["python3", "-I", "-S", "-c", probe], {
        cwd: f.project,
        env: { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: f.home, COMPOUND_ENGINEERING_HOME: f.home },
        stdin: new Blob([JSON.stringify({
          protocol: "ce-routing/v1",
          op: "patch_source",
          cwd: f.project,
          writer: "ce-setup",
          layer: "global",
          expected_revision: `cecfg-v1:${createHash("sha256").update(oldConfig).digest("hex")}`,
          set: {
            routing: {
              profiles: { guarded: { candidates: [{ harness: "codex", model: "candidate-policy" }] } },
              classes: { implementation: { profile: "guarded", policy: "require" } },
              roles: {},
            },
          },
          remove: [],
        })]),
        stdout: "pipe",
        stderr: "pipe",
      })
      await Promise.all([writer.exited, new Response(writer.stdout).text(), new Response(writer.stderr).text()])
      expect(await Bun.file(configPath).exists()).toBe(false)
      const external = `routing:\n  profiles:\n    guarded:\n      candidates:\n        - { harness: codex, model: external-policy }\n  classes:\n    implementation: { profile: guarded, policy: require }\n`
      await writeFile(configPath, external, { mode: 0o600 })

      const resolved = await runResolver({
        protocol: "ce-routing/v1",
        op: "resolve_batch",
        cwd: f.project,
        intents: [],
        roles: [{ role: "ce-work.implementation-worker" }],
      }, { cwd: f.project, home: f.home })
      expect(resolved.exitCode).toBe(3)
      expect(resolved.body.error.code).toBe("CONFIG_RECOVERY_REQUIRED")
      expect(await readFile(configPath, "utf8")).toBe(external)
      const transaction = resolved.body.error.transaction_paths[0] as string
      expect(await readFile(path.join(transaction, "source"), "utf8")).toBe(oldConfig)
      expect(await readFile(path.join(transaction, "candidate"), "utf8")).toContain("candidate-policy")
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("fails closed and preserves malformed or multiple replacement transactions", async () => {
    const f = await fixture()
    try {
      const configPath = path.join(f.home, "config.yaml")
      const oldConfig = `routing:\n  profiles:\n    guarded:\n      candidates:\n        - { harness: codex, model: old-policy }\n  classes:\n    implementation: { profile: guarded, policy: require }\n`
      const candidate = oldConfig.replace("old-policy", "candidate-policy")
      await writeFile(configPath, oldConfig, { mode: 0o600 })
      const metadata = {
        protocol: "ce-config-replace/v1",
        destination: "config.yaml",
        old_revision: `cecfg-v1:${createHash("sha256").update(oldConfig).digest("hex")}`,
        candidate_revision: `cecfg-v1:${createHash("sha256").update(candidate).digest("hex")}`,
      }
      const transactionNames = [
        `.ce-replace-100-${"1".repeat(24)}`,
        `.ce-replace-101-${"2".repeat(24)}`,
      ]
      for (const name of transactionNames) {
        const transaction = path.join(f.home, name)
        await mkdir(transaction, { mode: 0o700 })
        await writeFile(path.join(transaction, "candidate"), candidate, { mode: 0o600 })
        await writeFile(path.join(transaction, "transaction.json"), `${JSON.stringify(metadata)}\n`, { mode: 0o600 })
      }

      const multiple = await runResolver({
        protocol: "ce-routing/v1",
        op: "resolve_batch",
        cwd: f.project,
        intents: [],
        roles: [{ role: "ce-work.implementation-worker" }],
      }, { cwd: f.project, home: f.home })
      expect(multiple.exitCode).toBe(3)
      expect(multiple.body.error.code).toBe("CONFIG_RECOVERY_REQUIRED")
      expect(multiple.body.error.transaction_paths).toHaveLength(2)
      for (const name of transactionNames) {
        expect(await readFile(path.join(f.home, name, "candidate"), "utf8")).toBe(candidate)
      }

      await rm(path.join(f.home, transactionNames[1]), { recursive: true })
      await writeFile(path.join(f.home, transactionNames[0], "unexpected"), "preserve me\n", { mode: 0o600 })
      const malformed = await runResolver({
        protocol: "ce-routing/v1",
        op: "resolve_batch",
        cwd: f.project,
        intents: [],
        roles: [{ role: "ce-work.implementation-worker" }],
      }, { cwd: f.project, home: f.home })
      expect(malformed.exitCode).toBe(3)
      expect(malformed.body.error.code).toBe("CONFIG_RECOVERY_REQUIRED")
      expect(await readFile(path.join(f.home, transactionNames[0], "unexpected"), "utf8")).toBe("preserve me\n")
      expect(await readFile(configPath, "utf8")).toBe(oldConfig)
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("rejects symlinked replacement metadata without following or deleting it", async () => {
    const f = await fixture()
    try {
      const configPath = path.join(f.home, "config.yaml")
      const oldConfig = `routing:\n  profiles:\n    guarded:\n      candidates:\n        - { harness: codex, model: old-policy }\n  classes:\n    implementation: { profile: guarded, policy: require }\n`
      const candidate = oldConfig.replace("old-policy", "candidate-policy")
      await writeFile(configPath, oldConfig, { mode: 0o600 })
      const outsideMetadata = path.join(f.root, "outside-transaction.json")
      await writeFile(outsideMetadata, JSON.stringify({
        protocol: "ce-config-replace/v1",
        destination: "config.yaml",
        old_revision: `cecfg-v1:${createHash("sha256").update(oldConfig).digest("hex")}`,
        candidate_revision: `cecfg-v1:${createHash("sha256").update(candidate).digest("hex")}`,
      }), { mode: 0o600 })
      const transaction = path.join(f.home, `.ce-replace-200-${"3".repeat(24)}`)
      await mkdir(transaction, { mode: 0o700 })
      await writeFile(path.join(transaction, "candidate"), candidate, { mode: 0o600 })
      await symlink(outsideMetadata, path.join(transaction, "transaction.json"))

      const resolved = await runResolver({
        protocol: "ce-routing/v1",
        op: "resolve_batch",
        cwd: f.project,
        intents: [],
        roles: [{ role: "ce-work.implementation-worker" }],
      }, { cwd: f.project, home: f.home })
      expect(resolved.exitCode).toBe(3)
      expect(resolved.body.error.code).toBe("CONFIG_RECOVERY_REQUIRED")
      expect(await readFile(outsideMetadata, "utf8")).toContain("ce-config-replace/v1")
      expect((await lstat(path.join(transaction, "transaction.json"))).isSymbolicLink()).toBe(true)
      expect(await readFile(path.join(transaction, "candidate"), "utf8")).toBe(candidate)
      expect(await readFile(configPath, "utf8")).toBe(oldConfig)
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test.each([
    ["malformed name", false],
    ["malformed empty suffix", false],
    ["malformed non-hex suffix", false],
    ["renamed source", false],
    ["renamed candidate with external save", true],
    ["renamed metadata", false],
    ["symlink control", false],
    ["wrong mode", false],
    ["wrong type with external save", true],
    ["unreadable control", false],
    ["unexpected entry", false],
    ["invalid marker with external save", true],
    ["invalid metadata", false],
  ])("fails closed and preserves suspicious cleanup state: %s", async (scenario, destinationPresent) => {
    const f = await fixture()
    try {
      const configPath = path.join(f.home, "config.yaml")
      const oldConfig = `routing:\n  profiles:\n    guarded:\n      candidates:\n        - { harness: codex, model: old-policy }\n  classes:\n    implementation: { profile: guarded, policy: require }\n`
      const candidate = oldConfig.replace("old-policy", "candidate-policy")
      const external = oldConfig.replace("old-policy", "external-policy")
      const validName = `.ce-cleanup-300-${"4".repeat(24)}`
      const invalidNames: Record<string, string> = {
        "malformed name": ".ce-cleanup-not-a-transaction",
        "malformed empty suffix": ".ce-cleanup-",
        "malformed non-hex suffix": `.ce-cleanup-300-${"g".repeat(24)}`,
      }
      const cleanupName = invalidNames[scenario] ?? validName
      const cleanupPath = path.join(f.home, cleanupName)
      const metadata = `${JSON.stringify({
        protocol: "ce-config-replace/v1",
        destination: "config.yaml",
        old_revision: `cecfg-v1:${createHash("sha256").update(oldConfig).digest("hex")}`,
        candidate_revision: `cecfg-v1:${createHash("sha256").update(candidate).digest("hex")}`,
      })}\n`

      if (destinationPresent) await writeFile(configPath, external, { mode: 0o600 })
      if (scenario === "wrong type with external save") {
        await writeFile(cleanupPath, oldConfig, { mode: 0o600 })
      } else if (scenario === "symlink control") {
        const outside = path.join(f.root, "outside-cleanup")
        await mkdir(outside, { mode: 0o700 })
        await writeFile(path.join(outside, "source"), oldConfig, { mode: 0o600 })
        await symlink(outside, cleanupPath)
      } else {
        await mkdir(cleanupPath, { mode: 0o700 })
        if (scenario.startsWith("malformed ") || scenario === "renamed source") {
          await writeFile(path.join(cleanupPath, "source"), oldConfig, { mode: 0o600 })
        } else if (scenario === "renamed candidate with external save") {
          await writeFile(path.join(cleanupPath, "candidate"), candidate, { mode: 0o600 })
        } else if (scenario === "renamed metadata") {
          await writeFile(path.join(cleanupPath, "transaction.json"), oldConfig, { mode: 0o600 })
        } else if (scenario === "unexpected entry") {
          await writeFile(path.join(cleanupPath, "saved-policy"), oldConfig, { mode: 0o600 })
        } else if (scenario === "invalid marker with external save") {
          await writeFile(path.join(cleanupPath, "transaction.json"), metadata, { mode: 0o600 })
          await writeFile(path.join(cleanupPath, "committed"), "not committed\n", { mode: 0o600 })
        } else if (scenario === "invalid metadata") {
          await writeFile(path.join(cleanupPath, "transaction.json"), "{invalid metadata\n", { mode: 0o600 })
        } else {
          await writeFile(path.join(cleanupPath, "source"), oldConfig, { mode: 0o600 })
        }
        if (scenario === "wrong mode") await chmod(cleanupPath, 0o755)
        if (scenario === "unreadable control") await chmod(cleanupPath, 0o000)
      }

      const resolved = await runResolver({
        protocol: "ce-routing/v1",
        op: "resolve_batch",
        cwd: f.project,
        intents: [],
        roles: [{ role: "ce-work.implementation-worker" }],
      }, { cwd: f.project, home: f.home })

      expect(resolved.exitCode).toBe(3)
      expect(resolved.body.error.code).toBe("CONFIG_RECOVERY_REQUIRED")
      expect(resolved.body.resolutions).toBeUndefined()
      expect(resolved.body.error.transaction_paths).toContain(cleanupPath)
      if (destinationPresent) expect(await readFile(configPath, "utf8")).toBe(external)
      else expect(await Bun.file(configPath).exists()).toBe(false)
      if (scenario === "wrong type with external save") {
        expect(await readFile(cleanupPath, "utf8")).toBe(oldConfig)
      } else if (scenario === "symlink control") {
        expect((await lstat(cleanupPath)).isSymbolicLink()).toBe(true)
        expect(await readFile(path.join(f.root, "outside-cleanup", "source"), "utf8")).toBe(oldConfig)
      } else {
        if (scenario === "unreadable control") await chmod(cleanupPath, 0o700)
        const entries = await readdir(cleanupPath)
        expect(entries.length).toBeGreaterThan(0)
        if (entries.includes("source")) expect(await readFile(path.join(cleanupPath, "source"), "utf8")).toBe(oldConfig)
        if (entries.includes("candidate")) expect(await readFile(path.join(cleanupPath, "candidate"), "utf8")).toBe(candidate)
        if (entries.includes("saved-policy")) expect(await readFile(path.join(cleanupPath, "saved-policy"), "utf8")).toBe(oldConfig)
        if (entries.includes("transaction.json")) {
          const expected = scenario === "invalid marker with external save" ? metadata : scenario === "invalid metadata" ? "{invalid metadata\n" : oldConfig
          expect(await readFile(path.join(cleanupPath, "transaction.json"), "utf8")).toBe(expected)
        }
      }
    } finally {
      if (scenario === "unreadable control") {
        await chmod(path.join(f.home, `.ce-cleanup-300-${"4".repeat(24)}`), 0o700).catch(() => {})
      }
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test.each([
    ["committed", "absent"],
    ["transaction-only", "absent"],
    ["empty", "absent"],
    ["committed", "external-save"],
    ["transaction-only", "external-save"],
  ])("preserves valid %s cleanup when destination is %s", async (cleanupState, destinationState) => {
    const f = await fixture()
    try {
      const configPath = path.join(f.home, "config.yaml")
      const cleanupName = `.ce-cleanup-303-${"7".repeat(24)}`
      const cleanupPath = path.join(f.home, cleanupName)
      const oldConfig = `routing:\n  profiles:\n    guarded:\n      candidates:\n        - { harness: codex, model: old-policy }\n  classes:\n    implementation: { profile: guarded, policy: require }\n`
      const candidate = oldConfig.replace("old-policy", "candidate-policy")
      const external = oldConfig.replace("old-policy", "external-policy")
      const metadata = `${JSON.stringify({
        protocol: "ce-config-replace/v1",
        destination: "config.yaml",
        old_revision: `cecfg-v1:${createHash("sha256").update(oldConfig).digest("hex")}`,
        candidate_revision: `cecfg-v1:${createHash("sha256").update(candidate).digest("hex")}`,
      })}\n`
      const marker = "ce-config-replace-commit/v1\n"
      if (destinationState === "external-save") await writeFile(configPath, external, { mode: 0o600 })
      await mkdir(cleanupPath, { mode: 0o700 })
      if (cleanupState !== "empty") {
        await writeFile(path.join(cleanupPath, "transaction.json"), metadata, { mode: 0o600 })
      }
      if (cleanupState === "committed") {
        await writeFile(path.join(cleanupPath, "committed"), marker, { mode: 0o600 })
      }

      const resolved = await runResolver({
        protocol: "ce-routing/v1",
        op: "resolve_batch",
        cwd: f.project,
        intents: [],
        roles: [{ role: "ce-work.implementation-worker" }],
      }, { cwd: f.project, home: f.home })

      expect(resolved.exitCode).toBe(3)
      expect(resolved.body.error.code).toBe("CONFIG_RECOVERY_REQUIRED")
      expect(resolved.body.resolutions).toBeUndefined()
      expect(resolved.body.error.transaction_paths).toContain(cleanupPath)
      const expectedEntries: Record<string, string[]> = {
        committed: ["committed", "transaction.json"],
        "transaction-only": ["transaction.json"],
        empty: [],
      }
      expect((await readdir(cleanupPath)).sort()).toEqual(expectedEntries[cleanupState])
      if (cleanupState !== "empty") {
        expect(await readFile(path.join(cleanupPath, "transaction.json"), "utf8")).toBe(metadata)
      }
      if (cleanupState === "committed") {
        expect(await readFile(path.join(cleanupPath, "committed"), "utf8")).toBe(marker)
      }
      if (destinationState === "external-save") expect(await readFile(configPath, "utf8")).toBe(external)
      else expect(await Bun.file(configPath).exists()).toBe(false)
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("preserves multiple cleanup controls when candidate revisions disagree", async () => {
    const f = await fixture()
    try {
      const configPath = path.join(f.home, "config.yaml")
      const installed = `routing:\n  profiles:\n    guarded:\n      candidates:\n        - { harness: codex, model: installed-policy }\n  classes:\n    implementation: { profile: guarded, policy: require }\n`
      const other = installed.replace("installed-policy", "other-policy")
      await writeFile(configPath, installed, { mode: 0o600 })
      const controls = [
        [`.ce-cleanup-304-${"8".repeat(24)}`, installed],
        [`.ce-cleanup-305-${"9".repeat(24)}`, other],
      ]
      const metadataByControl = new Map<string, string>()
      for (const [name, candidate] of controls) {
        const cleanupPath = path.join(f.home, name)
        const metadata = `${JSON.stringify({
          protocol: "ce-config-replace/v1",
          destination: "config.yaml",
          old_revision: `cecfg-v1:${createHash("sha256").update(installed).digest("hex")}`,
          candidate_revision: `cecfg-v1:${createHash("sha256").update(candidate).digest("hex")}`,
        })}\n`
        await mkdir(cleanupPath, { mode: 0o700 })
        await writeFile(path.join(cleanupPath, "transaction.json"), metadata, { mode: 0o600 })
        metadataByControl.set(name, metadata)
      }

      const resolved = await runResolver({
        protocol: "ce-routing/v1",
        op: "resolve_batch",
        cwd: f.project,
        intents: [],
        roles: [{ role: "ce-work.implementation-worker" }],
      }, { cwd: f.project, home: f.home })

      expect(resolved.exitCode).toBe(3)
      expect(resolved.body.error.code).toBe("CONFIG_RECOVERY_REQUIRED")
      expect(resolved.body.error.transaction_paths).toHaveLength(2)
      expect(await readFile(configPath, "utf8")).toBe(installed)
      for (const [name] of controls) {
        expect(await readFile(path.join(f.home, name, "transaction.json"), "utf8")).toBe(metadataByControl.get(name))
      }
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("rejects a wrong-owner cleanup control without deleting it", async () => {
    const f = await fixture()
    try {
      const cleanupName = `.ce-cleanup-301-${"5".repeat(24)}`
      const cleanupPath = path.join(f.home, cleanupName)
      const oldConfig = `routing:\n  profiles:\n    guarded:\n      candidates:\n        - { harness: codex, model: old-policy }\n  classes:\n    implementation: { profile: guarded, policy: require }\n`
      await mkdir(cleanupPath, { mode: 0o700 })
      await writeFile(path.join(cleanupPath, "source"), oldConfig, { mode: 0o600 })
      const probe = [
        "import importlib.util, os",
        `resolver_path = ${JSON.stringify(resolver)}`,
        `cleanup_name = ${JSON.stringify(cleanupName)}`,
        "spec = importlib.util.spec_from_file_location('ce_routing_cleanup_owner', resolver_path)",
        "module = importlib.util.module_from_spec(spec)",
        "spec.loader.exec_module(module)",
        "original_stat = module.os.stat",
        "def foreign_cleanup(target, *args, **kwargs):\n    result = original_stat(target, *args, **kwargs)\n    if target == cleanup_name and kwargs.get('dir_fd') is not None:\n        fields = list(result)\n        fields[4] = result.st_uid + 1\n        return os.stat_result(fields)\n    return result",
        "module.os.stat = foreign_cleanup",
        "raise SystemExit(module.main())",
      ].join("\n")
      const proc = Bun.spawn(["python3", "-I", "-S", "-c", probe], {
        cwd: f.project,
        env: { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: f.home, COMPOUND_ENGINEERING_HOME: f.home },
        stdin: new Blob([JSON.stringify({
          protocol: "ce-routing/v1",
          op: "resolve_batch",
          cwd: f.project,
          intents: [],
          roles: [{ role: "ce-work.implementation-worker" }],
        })]),
        stdout: "pipe",
        stderr: "pipe",
      })
      const [exitCode, stdout, stderr] = await Promise.all([
        proc.exited,
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ])

      expect(exitCode, stderr).toBe(3)
      expect(JSON.parse(stdout).error.code).toBe("CONFIG_RECOVERY_REQUIRED")
      expect(await readFile(path.join(cleanupPath, "source"), "utf8")).toBe(oldConfig)
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("preserves a validated cleanup control when removal fails", async () => {
    const f = await fixture()
    try {
      const configPath = path.join(f.home, "config.yaml")
      const cleanupName = `.ce-cleanup-302-${"6".repeat(24)}`
      const cleanupPath = path.join(f.home, cleanupName)
      const external = `routing:\n  profiles:\n    guarded:\n      candidates:\n        - { harness: codex, model: external-policy }\n  classes:\n    implementation: { profile: guarded, policy: require }\n`
      const metadata = `${JSON.stringify({
        protocol: "ce-config-replace/v1",
        destination: "config.yaml",
        old_revision: `cecfg-v1:${createHash("sha256").update(external).digest("hex")}`,
        candidate_revision: `cecfg-v1:${createHash("sha256").update(external).digest("hex")}`,
      })}\n`
      const marker = "ce-config-replace-commit/v1\n"
      await writeFile(configPath, external, { mode: 0o600 })
      await mkdir(cleanupPath, { mode: 0o700 })
      await writeFile(path.join(cleanupPath, "transaction.json"), metadata, { mode: 0o600 })
      await writeFile(path.join(cleanupPath, "committed"), marker, { mode: 0o600 })
      const probe = [
        "import importlib.util",
        `resolver_path = ${JSON.stringify(resolver)}`,
        "spec = importlib.util.spec_from_file_location('ce_routing_cleanup_remove', resolver_path)",
        "module = importlib.util.module_from_spec(spec)",
        "spec.loader.exec_module(module)",
        `cleanup_name = ${JSON.stringify(cleanupName)}`,
        "original_rmdir = module.os.rmdir",
        "def deny_cleanup(entry, *args, **kwargs):\n    if entry == cleanup_name and kwargs.get('dir_fd') is not None:\n        raise PermissionError('injected cleanup failure')\n    return original_rmdir(entry, *args, **kwargs)",
        "module.os.rmdir = deny_cleanup",
        "raise SystemExit(module.main())",
      ].join("\n")
      const proc = Bun.spawn(["python3", "-I", "-S", "-c", probe], {
        cwd: f.project,
        env: { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: f.home, COMPOUND_ENGINEERING_HOME: f.home },
        stdin: new Blob([JSON.stringify({
          protocol: "ce-routing/v1",
          op: "resolve_batch",
          cwd: f.project,
          intents: [],
          roles: [{ role: "ce-work.implementation-worker" }],
        })]),
        stdout: "pipe",
        stderr: "pipe",
      })
      const [exitCode, stdout, stderr] = await Promise.all([
        proc.exited,
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ])

      expect(exitCode, stderr).toBe(3)
      expect(JSON.parse(stdout).error.code).toBe("CONFIG_RECOVERY_REQUIRED")
      expect(await readFile(configPath, "utf8")).toBe(external)
      expect(await readFile(path.join(cleanupPath, "transaction.json"), "utf8")).toBe(metadata)
      expect(await readFile(path.join(cleanupPath, "committed"), "utf8")).toBe(marker)
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("finalize_attempt rejects all nonterminal or integrated states and exactness violations", async () => {
    const f = await fixture()
    try {
      const resolved = await resolvedBinding(f, { policy: "require" })
      for (const attempt of [
        { ordinal: 0, terminal: false, integrated: false },
        { ordinal: 0, terminal: true, integrated: true },
      ]) {
        const result = await runResolver(
          finalizeRequest(resolved, 0, "ok", { model_actual: "gpt-5-mini" }, attempt),
          { cwd: f.project, home: f.home },
        )
        expect(result.exitCode).toBe(4)
        expect(result.body.error.code).toBe("RETRY_UNSAFE")
      }

      for (const attempt of [
        { ordinal: 0, terminal: 1, integrated: false },
        { ordinal: 0, terminal: true, integrated: 0 },
      ]) {
        const result = await runResolver(
          finalizeRequest(resolved, 0, "ok", {}, attempt),
          { cwd: f.project, home: f.home },
        )
        expect(result.exitCode).toBe(2)
        expect(result.body.error.code).toBe("REQUEST_INVALID")
      }
      const wrongOrdinal = await runResolver(
        finalizeRequest(resolved, 0, "ok", {}, { ordinal: true, terminal: true, integrated: false }),
        { cwd: f.project, home: f.home },
      )
      expect(wrongOrdinal.exitCode).toBe(4)
      expect(wrongOrdinal.body.error.code).toBe("ATTEMPT_LOCK_INVALID")
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("finalization rejects mutable bindings and snapshot/role/instance/policy/candidate lock tampering", async () => {
    const f = await fixture()
    try {
      const resolved = await resolvedBinding(f, {
        role: "ce-code-review.adversarial-reviewer",
        instance: { id: "adversarial", ordinal: 7 },
      })
      const valid = finalizeRequest(resolved, 0, "ok", { model_actual: "gpt-5-mini" })
      const suppliedBinding = await runResolver(
        { ...valid, binding: baseBinding() },
        { cwd: f.project, home: f.home },
      )
      expect(suppliedBinding.exitCode).toBe(2)
      expect(suppliedBinding.body.error.code).toBe("REQUEST_INVALID")

      const lockMutations: Array<(lock: Record<string, any>) => void> = [
        (lock) => { lock.snapshot_id = `cesnap-v1:${"0".repeat(64)}` },
        (lock) => { lock.role = "ce-pov.panel-peer" },
        (lock) => { lock.instance.id = "other-instance" },
        (lock) => { lock.policy = "require" },
        (lock) => { lock.candidate.model = "other-model" },
        (lock) => { lock.candidate_ordinal = 1 },
        (lock) => { lock.binding_digest = `cebind-v1:${"0".repeat(64)}` },
        (lock) => { lock.lock_digest = `ceattempt-v1:${"0".repeat(64)}` },
      ]
      for (const mutate of lockMutations) {
        const request = structuredClone(valid)
        mutate(request.attempt_lock)
        const result = await runResolver(request, { cwd: f.project, home: f.home })
        expect(result.exitCode).toBe(4)
        expect(result.body.error.code).toBe("ATTEMPT_LOCK_INVALID")
      }

      const other = await resolvedBinding(f, {
        role: "ce-code-review.adversarial-reviewer",
        instance: { id: "other-instance", ordinal: 7 },
      })
      const replay = await runResolver(
        { ...valid, snapshot: other.body.snapshot },
        { cwd: f.project, home: f.home },
      )
      expect(replay.exitCode).toBe(4)
      expect(replay.body.error.code).toBe("ATTEMPT_LOCK_INVALID")

      const wrongCwd = await runResolver(
        { ...valid, cwd: f.root },
        { cwd: f.project, home: f.home },
      )
      expect(wrongCwd.exitCode).toBe(4)
      expect(wrongCwd.body.error.code).toBe("CONTEXT_STALE")

      const changedSnapshot = structuredClone(resolved.body.snapshot)
      changedSnapshot.roles[0].instance.id = "snapshot-tamper"
      const stale = await runResolver(
        { ...valid, snapshot: changedSnapshot },
        { cwd: f.project, home: f.home },
      )
      expect(stale.exitCode).toBe(4)
      expect(stale.body.error.code).toBe("CONTEXT_STALE")
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("redacts frozen instance metadata from finalization receipts", async () => {
    const f = await fixture()
    try {
      const secretPath = "/private/routing/prompt.md"
      const resolved = await resolvedBinding(f, {
        instance: { id: "redacted-instance", material_path: secretPath },
      })
      const result = await runResolver(
        finalizeRequest(resolved, 0, "ok", { model_actual: "gpt-5-mini" }),
        { cwd: f.project, home: f.home },
      )

      expect(result.exitCode).toBe(0)
      expect(result.body.receipt).not.toHaveProperty("instance")
      expect(JSON.stringify(result.body)).not.toContain(secretPath)
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("rejects malformed serving identity evidence", async () => {
    const f = await fixture()
    try {
      const resolved = await resolvedBinding(f)
      for (const report of [
        { model_actual: { leaked: "provider output" } },
        { effort_actual: "high\nprivate" },
      ]) {
        const result = await runResolver(
          finalizeRequest(resolved, 0, "ok", report),
          { cwd: f.project, home: f.home },
        )
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
      const resolved = await resolvedBinding(f)
      const first = await runResolver(
        finalizeRequest(resolved, 0, "ok", { model_actual: "wrong-model" }),
        { cwd: f.project, home: f.home },
      )
      expect(first.body.action).toBe("next_candidate")
      expect(first.body.receipt.attempts).toEqual([{
        ordinal: 0,
        outcome: "ok",
        identity_status: "mismatched",
        terminal: true,
        integrated: false,
        phase: "dispatched",
        retry_safety: "adapter-isolated",
        fallback_reason: "identity_mismatch",
        terminal_status: "next_candidate",
        attempt_lock_digest: resolved.body.resolutions[0].attempt_locks[0].lock_digest,
      }])

      const second = await runResolver(
        finalizeRequest(resolved, 1, "ok", { model_actual: "sonnet" }, undefined, first.body.receipt.attempts),
        { cwd: f.project, home: f.home },
      )
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

      const missing = await runResolver(
        finalizeRequest(resolved, 1, "ok", { model_actual: "sonnet" }),
        { cwd: f.project, home: f.home },
      )
      expect(missing.exitCode).toBe(2)
      expect(missing.body.error.code).toBe("REQUEST_INVALID")

      const malformed = await runResolver(
        finalizeRequest(
          resolved,
          1,
          "ok",
          { model_actual: "sonnet" },
          undefined,
          [{ ...first.body.receipt.attempts[0], terminal: false }],
        ),
        { cwd: f.project, home: f.home },
      )
      expect(malformed.exitCode).toBe(2)
      expect(malformed.body.error.code).toBe("REQUEST_INVALID")

      for (const prior of [
        [{ ...first.body.receipt.attempts[0], fallback_reason: "attempt_failed" }],
        [{ ...first.body.receipt.attempts[0], outcome: "invented", identity_status: null }],
      ]) {
        const altered = await runResolver(
          finalizeRequest(resolved, 1, "ok", { model_actual: "sonnet" }, undefined, prior),
          { cwd: f.project, home: f.home },
        )
        expect(altered.exitCode).toBe(2)
        expect(altered.body.error.code).toBe("REQUEST_INVALID")
      }

      const manyCandidates = Array.from({ length: 130 }, (_, ordinal) => ({
        harness: "codex",
        model: `model-${ordinal}`,
      }))
      const manyResolved = await resolvedBinding(f, { candidates: manyCandidates })
      const tooMuchHistory = Array.from({ length: 129 }, (_, ordinal) => ({ ordinal }))
      const unbounded = await runResolver(
        finalizeRequest(manyResolved, 129, "ok", { model_actual: "model-129" }, undefined, tooMuchHistory),
        { cwd: f.project, home: f.home },
      )
      expect(unbounded.exitCode).toBe(2)
      expect(unbounded.body.error.code).toBe("REQUEST_INVALID")
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("requires complete lock-bound history across unavailable, failed, and successful attempts", async () => {
    const f = await fixture()
    try {
      const candidates = [
        { harness: "codex", model: "first" },
        { harness: "claude", model: "second" },
        { harness: "grok", model: "third" },
      ]
      const resolved = await resolvedBinding(f, { candidates, instance: { id: "history-owner" } })
      const first = await runResolver(
        finalizeRequest(resolved, 0, "unavailable", {}, { phase: "preflight", retry_safety: "none" }),
        { cwd: f.project, home: f.home },
      )
      expect(first.body.action).toBe("next_candidate")
      expect(first.body.receipt.attempts[0]).toMatchObject({
        outcome: "unavailable",
        identity_status: "unavailable",
        fallback_reason: "route_unavailable",
      })

      const second = await runResolver(
        finalizeRequest(resolved, 1, "failed", {}, undefined, first.body.receipt.attempts),
        { cwd: f.project, home: f.home },
      )
      expect(second.body.action).toBe("next_candidate")
      expect(second.body.receipt.attempts.map((item: any) => item.outcome)).toEqual(["unavailable", "failed"])

      const third = await runResolver(
        finalizeRequest(
          resolved,
          2,
          "ok",
          { model_actual: "third" },
          undefined,
          second.body.receipt.attempts,
        ),
        { cwd: f.project, home: f.home },
      )
      expect(third.exitCode).toBe(0)
      expect(third.body.action).toBe("accept")
      expect(third.body.receipt.attempts.map((item: any) => item.outcome)).toEqual([
        "unavailable",
        "failed",
        "ok",
      ])

      const other = await resolvedBinding(f, { candidates, instance: { id: "history-replay-target" } })
      const replay = await runResolver(
        finalizeRequest(
          other,
          2,
          "ok",
          { model_actual: "third" },
          undefined,
          second.body.receipt.attempts,
        ),
        { cwd: f.project, home: f.home },
      )
      expect(replay.exitCode).toBe(2)
      expect(replay.body.error.code).toBe("REQUEST_INVALID")
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
