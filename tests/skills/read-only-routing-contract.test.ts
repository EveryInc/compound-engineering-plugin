import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { describe, expect, test } from "bun:test"

const ROOT = path.join(import.meta.dir, "../..")
const RESOLVER = path.join(ROOT, "skills/ce-plan/scripts/ce-routing.py")

const references = [
  "skills/ce-plan/references/reasoning-elevation.md",
  "skills/ce-code-review/references/cross-model-review.md",
  "skills/ce-doc-review/references/cross-model-review.md",
  "skills/ce-pov/references/cross-model-panel.md",
] as const
const cleanLauncherConsumers = ["ce-plan", "ce-brainstorm", "ce-pov"] as const

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
  const [exitCode, stdout] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
  ])
  return { exitCode, body: JSON.parse(stdout) as Record<string, any> }
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "ce-read-only-routing-"))
  const home = path.join(root, "home")
  const project = path.join(root, "project")
  await mkdir(home, { recursive: true, mode: 0o700 })
  await mkdir(project, { recursive: true })
  await Bun.$`git init -q`.cwd(project)
  await writeFile(path.join(project, ".gitignore"), ".compound-engineering/*.local.yaml\n")
  return { root, home, project }
}

async function resolveRole(
  f: Awaited<ReturnType<typeof fixture>>,
  role: string,
  policy: "prefer" | "require",
  instance: Record<string, unknown> = { id: "peer", ordinal: 0 },
) {
  await writeFile(
    path.join(f.home, "config.yaml"),
    `routing:\n  profiles:\n    test-route:\n      candidates:\n        - { harness: claude, model: opus }\n        - { harness: codex, model: gpt-5.6-luna }\n  roles:\n    ${role}: { profile: test-route, policy: ${policy} }\n`,
    { mode: 0o600 },
  )
  return runResolver({
    protocol: "ce-routing/v1",
    op: "resolve_batch",
    cwd: f.project,
    intents: [],
    roles: [{ role, instance }],
  }, f.project, f.home)
}

function finalizeRequest(
  resolved: Awaited<ReturnType<typeof runResolver>>,
  outcome: "ok" | "unavailable" | "failed",
  report: Record<string, unknown>,
  attempt: Record<string, unknown>,
) {
  return {
    protocol: "ce-routing/v1",
    op: "finalize_attempt",
    snapshot: resolved.body.snapshot,
    attempt_lock: resolved.body.resolutions[0].attempt_locks[0],
    attempt,
    outcome,
    report,
  }
}

describe("specialized read-only routing contract", () => {
  test("independently installed adapters share the same clean-launch kernel", async () => {
    const launchers = await Promise.all(cleanLauncherConsumers.map((skill) =>
      readFile(path.join(ROOT, "skills", skill, "scripts", "clean-launcher.py"), "utf8"),
    ))
    for (const launcher of launchers.slice(1)) expect(launcher).toBe(launchers[0])
    expect(launchers[0]).toContain('"/bin/bash", "--noprofile", "--norc"')
    expect(launchers[0]).toContain('"CE_PROVIDER_DISCOVERY_PATH": caller_path')
    expect(launchers[0]).not.toMatch(/API_KEY|OAUTH_TOKEN/)
    expect(launchers[0]).not.toMatch(/CODEX_HOME|CLAUDE_CONFIG_DIR|GROK_CONFIG_HOME|CURSOR_CONFIG_DIR/)
  })

  test("adapter invocation docs make the clean launcher the first worker argv", async () => {
    const elevation = await readFile(path.join(ROOT, references[0]), "utf8")
    const pov = await readFile(path.join(ROOT, references[3]), "utf8")
    for (const body of [elevation, pov]) {
      expect(body).toContain('/usr/bin/python3 -I -S "$SKILL_DIR/scripts/clean-launcher.py"')
      expect(body).not.toMatch(/(?:bash|\/bin\/bash)\s+"?\$SKILL_DIR\/scripts\/(?:elevation-dispatch|cross-model-pov)\.sh/)
      expect(body).toMatch(/worker argv.*(?:begin|begins).*launcher/is)
    }
    expect(elevation).toMatch(/-- \/usr\/bin\/python3 -I -S "\$SKILL_DIR\/scripts\/clean-launcher\.py"/s)
    expect(pov).toMatch(/--\s*\\?\s*\n?\s*\/usr\/bin\/python3 -I -S "\$SKILL_DIR\/scripts\/clean-launcher\.py"/s)
  })

  test("every owning reference freezes resolution before qualification and finalizes before consumption", async () => {
    for (const relative of references) {
      const body = await readFile(path.join(ROOT, relative), "utf8")
      expect(body, relative).toContain("resolve_batch")
      expect(body, relative).toContain("finalize_attempt")
      expect(body, relative).toMatch(/freeze.*snapshot/i)
      expect(body, relative).toMatch(/before.*(?:qualif|adapter)/i)
      expect(body, relative).toMatch(/before.*consum/i)
      expect(body, relative).toMatch(/terminal.*unintegrated/i)
      expect(body, relative).toMatch(/fresh.*recipient.*material/i)
      expect(body, relative).toMatch(/without prompt|never prompt/i)
      expect(body, relative).toContain("ce-default")
      expect(body, relative).toContain("accepted_unverified")
      expect(body, relative).toMatch(/no (?:generalized )?rout|no routing/i)
    }
  })

  test("elevation keeps native override, external CLI, and no-selector degradation distinct", async () => {
    const body = await readFile(
      path.join(ROOT, "skills/ce-plan/references/reasoning-elevation.md"),
      "utf8",
    )
    expect(body).toContain("Native in-harness dispatch")
    expect(body).toContain("Claude CLI")
    expect(body).toMatch(/no model or effort selector.*unavailable/i)
    expect(body).toMatch(/exact legacy no-routing behavior.*do not elevate/i)
  })

  test("strict elevation never degrades to inline execution", async () => {
    for (const relative of [
      "skills/ce-plan/references/reasoning-elevation.md",
      "skills/ce-brainstorm/references/reasoning-elevation.md",
    ]) {
      const body = await readFile(path.join(ROOT, relative), "utf8")
      expect(body, relative).toMatch(/required route never silently becomes inline/i)
      expect(body, relative).toMatch(/required binding stops.*without prompting or inline execution/is)
      expect(body, relative).not.toMatch(/requested but unavailable[^\n]*run the step inline/i)
    }
  })

  test("legacy settings come only from the frozen resolve_batch compatibility output", async () => {
    for (const relative of references) {
      const body = await readFile(path.join(ROOT, relative), "utf8")
      expect(body, relative).toContain("resolution.compatibility")
      expect(body, relative).not.toMatch(/^\s*\d+\.\s+(?:\*\*)?(?:run|inspect).*\binspect\b/im)
      expect(body, relative).not.toMatch(/read .*\.compound-engineering\/config\.local\.yaml/i)
    }
  })

  test("routing cannot activate an unselected read-only persona", async () => {
    const codeReview = await readFile(path.join(ROOT, references[1]), "utf8")
    const docReview = await readFile(path.join(ROOT, references[2]), "utf8")
    const pov = await readFile(path.join(ROOT, references[3]), "utf8")

    expect(codeReview).toMatch(/adversarial persona.*selected/i)
    expect(docReview).toMatch(/only when that lens was activated/i)
    expect(pov).toMatch(/never summons the panel/i)
    for (const body of [codeReview, docReview, pov]) {
      expect(body).toMatch(/quarantined/i)
      expect(body).toMatch(/discard/i)
    }
  })

  test("merged legacy intent and generalized role resolution share a deterministic source snapshot", async () => {
    const f = await fixture()
    try {
      await writeFile(
        path.join(f.home, "config.yaml"),
        [
          "plan_model: opus",
          "routing:",
          "  profiles:",
          "    strong:",
          "      candidates:",
          "        - { harness: claude, model: sonnet, effort: high }",
          "  roles:",
          "    ce-plan.plan-author: { profile: strong, policy: prefer }",
          "",
        ].join("\n"),
        { mode: 0o600 },
      )
      await chmod(path.join(f.home, "config.yaml"), 0o600)

      const resolved = await runResolver(
        {
          protocol: "ce-routing/v1",
          op: "resolve_batch",
          cwd: f.project,
          intents: [],
          roles: [{ role: "ce-plan.plan-author", instance: { id: "author", ordinal: 0 } }],
        },
        f.project,
        f.home,
      )

      expect(resolved.exitCode).toBe(0)
      expect(resolved.body.resolutions[0].binding.profile).toBe("strong")
      expect(resolved.body.resolutions[0].compatibility).toMatchObject({
        kind: "plan-model",
        applied: false,
        reason: "higher-route",
        values: { plan_model: "opus" },
        provenance: { plan_model: { layer: "global", authority_trusted: true } },
      })
      expect(resolved.body.snapshot.id).toMatch(/^cesnap-v1:/)
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test.each([
    ["preferred unverified success", "prefer", true, false, {}, "accept", "accepted_unverified"],
    ["preferred terminal mismatch", "prefer", true, false, { model_actual: "other" }, "next_candidate", "mismatched"],
    ["required unverified success", "require", true, false, {}, "block", "unverified"],
    ["required mismatch", "require", true, false, { model_actual: "other" }, "block", "mismatched"],
  ])("finalize_attempt: %s", async (_name, policy, terminal, integrated, report, action, identity) => {
    const f = await fixture()
    try {
      const resolved = await resolveRole(f, "ce-code-review.adversarial-reviewer", policy as "prefer" | "require")
      const result = await runResolver(finalizeRequest(
        resolved,
        "ok",
        report,
        { ordinal: 0, terminal, integrated },
      ), f.project, f.home)
      expect(result.body.action).toBe(action)
      expect(result.body.receipt.identity_status).toBe(identity)
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test.each([
    [false, false],
    [true, true],
  ])("a mismatched preferred attempt cannot advance when terminal=%s integrated=%s", async (terminal, integrated) => {
    const f = await fixture()
    try {
      const resolved = await resolveRole(f, "ce-pov.panel-peer", "prefer")
      const result = await runResolver(finalizeRequest(
        resolved,
        "ok",
        { model_actual: "other" },
        { ordinal: 0, terminal, integrated },
      ), f.project, f.home)
      expect(result.exitCode).toBe(4)
      expect(result.body.error.code).toBe("RETRY_UNSAFE")
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })
})
