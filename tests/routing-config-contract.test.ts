import { mkdtemp, mkdir, readFile, rm, writeFile } from "fs/promises"
import os from "os"
import path from "path"
import { describe, expect, test } from "bun:test"

const repoRoot = path.join(import.meta.dir, "..")
const schemaPath = path.join(repoRoot, "scripts", "routing", "settings-schema.json")
const protocolPath = path.join(repoRoot, "scripts", "routing", "protocol-schema.json")
const rolesPath = path.join(repoRoot, "scripts", "routing", "dispatch-roles.json")
const executionRoutingPath = path.join(repoRoot, "scripts", "routing", "execution-routing.md")
const templatePath = path.join(repoRoot, "skills", "ce-setup", "references", "config-template.yaml")
const examplePath = path.join(repoRoot, ".compound-engineering", "config.local.example.yaml")

const legacyKeys = [
  "pulse_product_name",
  "pulse_lookback_default",
  "pulse_primary_event",
  "pulse_value_event",
  "pulse_completion_events",
  "pulse_quality_scoring",
  "pulse_quality_dimension",
  "pulse_analytics_source",
  "pulse_tracing_source",
  "pulse_payments_source",
  "pulse_db_enabled",
  "pulse_metric_sources",
  "pulse_pending_metrics",
  "pulse_excluded_metrics",
  "plan_output",
  "brainstorm_output",
  "ideate_output",
  "plan_model",
  "brainstorm_model",
  "pr_teaching_section",
  "pr_teaching_archive",
  "auto_babysit",
  "plan_skip_scoping_confirm",
  "cross_model_peer",
  "work_engine_mode",
  "work_engine_preferences",
  "ce_promote_spiral_optout",
  "feedback_sources",
  "sweep_state_path",
  "sweep_ack_cap",
  "sweep_lease_ttl_minutes",
  "sweep_shared_branch",
] as const

describe("routing configuration contract", () => {
  test("registers every shipped setting plus generalized routing", async () => {
    const schema = JSON.parse(await readFile(schemaPath, "utf8")) as {
      protocol: string
      settings: Record<string, Record<string, unknown>>
      structured_types: Record<string, unknown>
    }

    expect(schema.protocol).toBe("ce-routing/v1")
    expect(Object.keys(schema.settings).sort()).toEqual([...legacyKeys, "routing"].sort())

    for (const key of legacyKeys) {
      expect(schema.settings[key]?.type, `${key} is missing a type`).toBeString()
      expect(schema.settings[key]?.merge, `${key} is missing merge behavior`).toBeString()
      expect(schema.settings[key]?.authority, `${key} is missing authority metadata`).toBeString()
      expect(schema.settings[key]?.consumers, `${key} is missing consumers`).toBeArray()
      expect(schema.settings[key]?.writers, `${key} is missing writers`).toBeArray()
      expect(schema.settings[key]).toHaveProperty("default")
    }

    expect(schema.settings.feedback_sources.authority).toBe("standing-action")
    expect(schema.settings.feedback_sources.merge).toBe("replace")
    expect(schema.settings.routing.merge).toBe("routing-merge")
    expect(schema.structured_types).toHaveProperty("feedback_source")
    expect(schema.structured_types).toHaveProperty("execution_candidate")
    expect(schema.structured_types).toHaveProperty("route_binding")
  })

  test("pins protocol operations and receipt fields", async () => {
    const protocol = JSON.parse(await readFile(protocolPath, "utf8")) as {
      protocol: string
      operations: string[]
      attempt_lock_protocol: string
      adapter_outcomes: string[]
      finalize_request_fields: string[]
      task_binding_fields: Record<string, string[]>
      receipt_fields: string[]
      error_codes: string[]
    }

    expect(protocol.protocol).toBe("ce-routing/v1")
    expect(protocol.operations).toEqual(["inspect", "resolve_batch", "finalize_attempt", "patch_source"])
    expect(protocol.attempt_lock_protocol).toBe("ce-routing-attempt-lock/v1")
    expect(protocol.adapter_outcomes).toEqual(["ok", "unavailable", "failed"])
    expect(protocol.finalize_request_fields).toEqual([
      "snapshot",
      "attempt_lock",
      "attempt",
      "outcome",
      "report",
      "prior_attempts",
    ])
    expect(protocol.task_binding_fields).toEqual({
      profile: ["profile", "policy"],
      direct: ["policy", "candidates"],
    })
    for (const field of [
      "snapshot_id",
      "binding_digest",
      "attempt_lock_digest",
      "role",
      "class",
      "profile",
      "source_layer",
      "source_authority",
      "profile_source_layer",
      "profile_source_authority",
      "policy",
      "effort_requested",
      "model_requested",
      "model_actual",
      "adapter_outcome",
      "identity_status",
      "attempts",
      "terminal_status",
    ]) {
      expect(protocol.receipt_fields).toContain(field)
    }
    for (const code of [
      "CONFIG_UNSAFE",
      "YAML_DUPLICATE_KEY",
      "REFERENCE_UNKNOWN",
      "IDENTITY_REQUIRED",
      "IDENTITY_MISMATCH",
      "ATTEMPT_FAILED",
      "ATTEMPT_LOCK_INVALID",
      "RETRY_UNSAFE",
      "WRITE_CONFLICT",
    ]) {
      expect(protocol.error_codes).toContain(code)
    }
  })

  test("keeps the two distributed examples identical and schema-complete", async () => {
    const [template, example, schemaText] = await Promise.all([
      readFile(templatePath, "utf8"),
      readFile(examplePath, "utf8"),
      readFile(schemaPath, "utf8"),
    ])
    const schema = JSON.parse(schemaText) as { settings: Record<string, unknown> }

    expect(example).toBe(template)
    for (const key of legacyKeys) {
      expect(template, `${key} is absent from the template`).toMatch(new RegExp(`^# ${key}:`, "m"))
      expect(schema.settings).toHaveProperty(key)
    }
    expect(template).toContain("routing:")
    expect(template).toContain("ce-default")
  })

  test("catalogs stable named personas separately from runtime instances", async () => {
    const catalog = JSON.parse(await readFile(rolesPath, "utf8")) as {
      classes: string[]
      roles: Record<string, { class: string; owner: string; adapter_family: string }>
    }

    expect(catalog.classes).toEqual(["implementation", "review", "reasoning", "research", "verification"])
    expect(catalog.roles["ce-code-review.security-reviewer"]?.class).toBe("review")
    expect(catalog.roles["ce-work.implementation-worker"]?.class).toBe("implementation")
    expect(catalog.roles["ce-optimize.experiment-author"]?.class).toBe("implementation")
    expect(catalog.roles["ce-optimize.semantic-judge"]?.class).toBe("verification")
    expect(Object.keys(catalog.roles).some((role) => /(?:provider|ordinal|unit-[0-9]|batch-[0-9])/.test(role))).toBe(false)
  })

  test("documents frozen parent envelopes and cumulative attempt finalization", async () => {
    const body = await readFile(executionRoutingPath, "utf8")

    expect(body).toContain("parent_snapshot")
    expect(body).toMatch(/full.*snapshot envelope|snapshot envelope.*full/i)
    expect(body).toMatch(/ID-only.*CONTEXT_STALE/i)
    expect(body).toContain("prior_attempts")
    expect(body).toMatch(/top-level `ce-default` binding.*no candidate attempt lock/i)
  })
})

describe("strict routing YAML", () => {
  const resolver = path.join(repoRoot, "scripts", "routing", "config-resolver.py")

  async function runInspect(config: string): Promise<{ exitCode: number; body: Record<string, any> }> {
    const root = await mkdtemp(path.join(os.tmpdir(), "ce-routing-contract-"))
    const home = path.join(root, "ce-home")
    await mkdir(home, { recursive: true })
    await writeFile(path.join(home, "config.yaml"), config, { mode: 0o600 })
    try {
      const proc = Bun.spawn(["python3", "-I", "-S", resolver], {
        cwd: root,
        env: { ...process.env, COMPOUND_ENGINEERING_HOME: home },
        stdin: new Blob([JSON.stringify({ protocol: "ce-routing/v1", op: "inspect", cwd: root })]),
        stdout: "pipe",
        stderr: "pipe",
      })
      const [exitCode, stdout] = await Promise.all([proc.exited, new Response(proc.stdout).text()])
      return { exitCode, body: JSON.parse(stdout) as Record<string, any> }
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }

  test("accepts the shipped flow-map shape without granting omitted approval", async () => {
    const result = await runInspect(`feedback_sources:\n  - { type: slack, id: slack-alpha, target: C0123, ack_action: eyes, closeout_action: white_check_mark, sensitive: false }\n`)

    expect(result.exitCode).toBe(0)
    expect(result.body.ok).toBe(true)
    expect(result.body.settings.effective.feedback_sources[0].approved).toBe(false)
    expect(result.body.settings.authority.feedback_sources).toBe("denied")
  })

  test.each([
    ["duplicate key", "plan_output: md\nplan_output: html\n", "YAML_DUPLICATE_KEY"],
    ["alias", "plan_output: &fmt md\nbrainstorm_output: *fmt\n", "YAML_UNSUPPORTED"],
    ["tag", "plan_output: !unsafe md\n", "YAML_UNSUPPORTED"],
    ["unsafe route token", "routing:\n  profiles:\n    bad:\n      candidates:\n        - { harness: codex, model: '--dangerous' }\n", "SETTING_INVALID"],
    ["falsey profile sequence", "routing:\n  profiles: []\n", "SETTING_INVALID"],
    ["null classes", "routing:\n  classes: null\n", "SETTING_INVALID"],
    ["false roles", "routing:\n  roles: false\n", "SETTING_INVALID"],
  ])("rejects %s", async (_name, config, code) => {
    const result = await runInspect(config)

    expect(result.exitCode).toBe(3)
    expect(result.body.ok).toBe(false)
    expect(result.body.error.code).toBe(code)
  })
})
