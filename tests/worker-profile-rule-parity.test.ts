import { readFile, access } from "fs/promises"
import { Glob } from "bun"
import path from "path"
import { describe, expect, test } from "bun:test"

const REPO_ROOT = path.join(import.meta.dir, "..")
const SKILLS_ROOT = path.join(REPO_ROOT, "skills")
const FIXTURE = path.join(REPO_ROOT, "tests", "fixtures", "ce-worker-profiles-rule.md")

// The named-worker-profile rule is byte-duplicated into every file that owns a
// generic subagent dispatch call (skills cannot import siblings). Canonical text
// lives once in the fixture; each consumer must contain it verbatim exactly once.
//
// Coverage is guarded both ways: every CONSUMERS entry must hold the block, and
// every skills/**/*.md file whose prose dispatches an agent-role worker must be
// listed in CONSUMERS or EXCLUDED - a missed or drifting dispatch surface fails
// here instead of silently skipping profile selection.
const CONSUMERS = [
  // --- ce-code-review (read-class reviewer team; SKILL.md and two references are
  // mixed - the testing persona and the apply-local report leaf are write-class) ---
  "skills/ce-code-review/SKILL.md",
  "skills/ce-code-review/references/dispatch-reviewers.md",
  "skills/ce-code-review/references/finish-input.md",
  "skills/ce-code-review/references/scope.md",
  "skills/ce-code-review/references/select-and-route.md",
  "skills/ce-code-review/references/depth-paths.md",
  // --- ce-doc-review ---
  "skills/ce-doc-review/references/dispatch.md",
  "skills/ce-doc-review/references/document-intake.md",
  "skills/ce-doc-review/references/synthesis-and-presentation.md",
  // --- ce-plan ---
  "skills/ce-plan/references/research.md",
  "skills/ce-plan/references/deepening-workflow.md",
  "skills/ce-plan/references/universal-planning.md",
  // --- ce-brainstorm ---
  "skills/ce-brainstorm/references/dialogue.md",
  "skills/ce-brainstorm/references/model-tiers.md",
  "skills/ce-brainstorm/references/approaches.md",
  // --- ce-ideate ---
  "skills/ce-ideate/references/grounding.md",
  "skills/ce-ideate/references/decomposition.md",
  "skills/ce-ideate/references/divergent-ideation.md",
  "skills/ce-ideate/references/universal-ideation.md",
  "skills/ce-ideate/references/issue-intelligence.md",
  "skills/ce-ideate/references/user-research-artifacts.md",
  "skills/ce-ideate/references/post-ideation-workflow.md",
  "skills/ce-ideate/references/web-research-cache.md",
  // --- ce-pov / ce-explain ---
  "skills/ce-pov/SKILL.md",
  "skills/ce-pov/references/grounding.md",
  "skills/ce-explain/references/orchestration.md",
  // --- ce-compound ---
  "skills/ce-compound/references/research.md",
  "skills/ce-compound/references/grounding-validation.md",
  "skills/ce-compound/references/enhancement.md",
  "skills/ce-compound/references/assembly.md",
  "skills/ce-compound/references/session-history.md",
  // --- ce-debug / ce-compound-refresh / ce-simplify-code ---
  "skills/ce-debug/references/investigate.md",
  "skills/ce-compound-refresh/references/investigate.md",
  "skills/ce-simplify-code/SKILL.md",
  // --- ce-sweep / ce-retune / ce-bakeoff / ce-optimize / ce-prototype / riffrec ---
  "skills/ce-sweep/references/model-tiers.md",
  "skills/ce-sweep/references/run.md",
  "skills/ce-retune/references/corpus-audit.md",
  "skills/ce-bakeoff/references/candidates.md",
  "skills/ce-bakeoff/references/judging.md",
  "skills/ce-optimize/references/measurement.md",
  "skills/ce-prototype/references/scoping.md",
  "skills/ce-riffrec-feedback-analysis/references/extensive-analysis.md",
  // --- write-capable dispatch (children mutate tracked project content) ---
  "skills/ce-work/references/execution-strategy.md",
  "skills/ce-work/references/implementation-loop.md",
  "skills/ce-work/references/execution-engines.md",
  "skills/ce-work/references/review-findings-followup.md",
  "skills/ce-work/references/shipping-workflow.md",
  "skills/ce-resolve-pr-feedback/references/targeted-mode.md",
  "skills/ce-resolve-pr-feedback/references/full-mode.md",
  "skills/ce-compound-refresh/references/per-action-flows.md",
  "skills/ce-retune/references/cut-passes.md",
  "skills/ce-optimize/references/loop.md",
  "skills/ce-babysit-pr/references/envelope.md",
]

// Dispatch-mentioning files that own no generic dispatch call. Each reason is
// load-bearing: it states why the block would be dead text there.
const EXCLUDED: Record<string, string> = {
  // Own resolution engine under whole-file parity; never a generic dispatch.
  "skills/ce-plan/references/reasoning-elevation.md": "reasoning-elevation engine resolves its own model route",
  "skills/ce-brainstorm/references/reasoning-elevation.md": "reasoning-elevation engine resolves its own model route",
  // Cross-model / CLI peer machinery, not the generic primitive.
  "skills/ce-pov/references/cross-model-panel.md": "cross-model peer panel, not the generic subagent primitive",
  "skills/ce-work/references/cross-model-execution.md": "cross-model worker machinery, not the generic subagent primitive",
  "skills/ce-work/references/cross-model-work-eval.md": "cross-model evaluation machinery, not the generic subagent primitive",
  // Decide whether to dispatch or prohibit dispatch; the call itself is owned by
  // a listed consumer.
  "skills/ce-ideate/references/scope-gates.md": "decides whether to dispatch; grounding.md owns the call",
  "skills/ce-code-review/references/finish-review.md": "a leaf launches no subagents",
  "skills/ce-code-review/references/modes-and-output.md": "dispatch prohibitions only",
  "skills/ce-resolve-pr-feedback/references/evaluation-rubric.md": "verdict gate before dispatch; owns no call",
  "skills/ce-compound/references/lightweight.md": "explicitly dispatches nothing",
  "skills/ce-work/references/work-intake.md": "pointer naming execution-strategy.md as dispatch owner",
  "skills/ce-work/references/input-triage.md": "dispatch prohibitions only",
  "skills/ce-work/references/non-code-execution.md": "dispatch prohibition for the non-code route",
  "skills/ce-work/references/workspace-setup.md": "ordering note before dispatch; owns no call",
  // Delegating SKILL.md stage bodies whose dispatch instruction lives in a listed
  // reference.
  "skills/ce-ideate/SKILL.md": "delegates dispatch detail to references/grounding.md",
  "skills/ce-work/SKILL.md": "delegates dispatch detail to references/execution-strategy.md",
  "skills/ce-compound/SKILL.md": "stage prose; dispatches owned by listed references",
  "skills/ce-plan/SKILL.md": "dispatch prohibition plus delegation to references",
  "skills/ce-retune/SKILL.md": "stage prose; dispatches owned by listed references",
  "skills/ce-optimize/SKILL.md": "stage prose; dispatch owned by references/loop.md",
  "skills/ce-bakeoff/SKILL.md": "stage prose; dispatches owned by candidates.md and judging.md",
  "skills/ce-babysit-pr/references/tick.md": "skill-invocation routing, not a generic subagent dispatch",
  // SKILL.md bodies whose dispatch step defers to a mandated reference that owns
  // the call contract and carries the rule; the block would be dead text here.
  "skills/ce-doc-review/SKILL.md": "Phase 2 mandates references/dispatch.md before dispatching; it owns the call contract and carries the rule",
  "skills/ce-explain/SKILL.md": "references/orchestration.md is the mandated read before any subagent dispatch and carries the rule",
  "skills/ce-resolve-pr-feedback/SKILL.md": "fixer dispatches execute inside the self-contained mode references, which carry the rule",
  "skills/ce-compound-refresh/SKILL.md": "names investigate.md and per-action-flows.md as dispatch owners; both mandated reads carry the rule",
  "skills/ce-compound-refresh/references/classify.md": "routes Replace outcomes; the successor-subagent call is owned by per-action-flows.md",
  // Payload rules and prompt-shaping assets consulted by a consumer; they own no
  // call themselves.
  "skills/ce-code-review/references/intent-and-plan.md": "payload content rule",
  "skills/ce-code-review/references/persona-catalog.md": "spawn-condition catalog consulted by select-and-route.md",
  "skills/ce-brainstorm/references/handoff.md": "skill invocation and substitution prohibition",
  // Skill invocations and descriptive/timing mentions.
  "skills/lfg/SKILL.md": "invokes skills, not generic subagents",
  "skills/ce-plan/references/plan-handoff.md": "skill-invocation handoff note",
  "skills/ce-plan/references/final-review.md": "delegates dispatch mapping to deepening-workflow.md",
  "skills/ce-plan/references/approach-altitude.md": "substitution prohibition",
  "skills/ce-plan/references/synthesis-summary.md": "timing description, owns no call",
  "skills/ce-plan/references/intake.md": "cost description, owns no call",
  "skills/ce-commit-push-pr/references/compose.md": "composition prose, owns no call",
  "skills/ce-commit-push-pr/references/pr-description-writing.md": "PR-body prose, owns no call",
  "skills/ce-prototype/references/annotation-loop.md": "browser-overlay send control, not a subagent dispatch",
  "skills/ce-setup/references/legacy-codex-tool-map.md": "descriptive mention",
  // Analysis of past dispatches / shared failure taxonomy the block references.
  "skills/ce-retune/references/baseline-mining.md": "trace analysis of past dispatches",
  "skills/ce-retune/references/halt-taxonomy.md": "trace analysis of past dispatches",
  "skills/ce-retune/references/workflow-shapes.md": "prescribes fan-out shapes; dispatch instructions live in corpus-audit.md and cut-passes.md",
  "skills/ce-retune/references/noise-floor.md": "trace analysis of past dispatches",
  // Analytics queries, not subagents.
  "skills/ce-product-pulse/SKILL.md": "dispatches analytics queries, not subagents",
  "skills/ce-product-pulse/references/interview.md": "human-reviewer vocabulary; dispatches analytics queries, not subagents",
  // Skill-invocation handoffs to ce-bakeoff; the candidate dispatches live in
  // ce-bakeoff's own consumers.
  "skills/ce-brainstorm/references/bakeoff.md": "delegates dispatch to ce-bakeoff; its calls live in candidates.md and judging.md",
  "skills/ce-plan/references/bakeoff.md": "delegates dispatch to ce-bakeoff; its calls live in candidates.md and judging.md",
  // Remaining cross-model machinery.
  "skills/ce-code-review/references/cross-model-eval.md": "cross-model peer machinery",
  "skills/ce-code-review/references/cross-model-review.md": "cross-model peer machinery",
  "skills/ce-code-review/references/cross-model-recovery.md": "cross-model peer machinery",
  "skills/ce-doc-review/references/cross-model-eval.md": "cross-model peer machinery",
  "skills/ce-doc-review/references/cross-model-review.md": "cross-model peer machinery",
  // Dispatch vocabulary in a non-subagent sense.
  "skills/ce-plan/references/plan-sections.md": "plan-readiness vocabulary, owns no call",
  "skills/ce-plan/references/html-rendering.md": "diagram fan-out vocabulary",
  "skills/ce-plan/references/output-mode.md": "flag-token parsing, owns no call",
  "skills/ce-code-review/references/diff-scope.md": "dynamic-dispatch code concept",
  "skills/ce-brainstorm/references/blindspot-pass.md": "decision delegation to the user",
  "skills/ce-brainstorm/references/phase-0.md": "task-tracking prose; dispatches owned by listed references",
  "skills/ce-brainstorm/references/html-rendering.md": "diagram fan-out vocabulary",
  "skills/ce-brainstorm/references/brainstorm-sections.md": "fan-out vocabulary",
  "skills/ce-brainstorm/references/visual-probes.md": "server launch vocabulary",
  "skills/ce-brainstorm/references/output-mode.md": "flag-token parsing, owns no call",
  "skills/ce-brainstorm/SKILL.md": "stage table; dispatches owned by listed references",
  "skills/ce-polish/references/run.md": "dev-server launch configuration",
  "skills/ce-polish/references/dev-server-procfile.md": "dev-server process vocabulary",
  "skills/ce-polish/references/dev-server-rails.md": "dev-server launch vocabulary",
  "skills/ce-babysit-pr/references/report.md": "skill-invocation delegates and CI-check vocabulary",
  "skills/ce-babysit-pr/references/stack.md": "skill-invocation delegates, owns no generic call",
  "skills/ce-babysit-pr/references/watch-loop.md": "skill-invocation and CI-check vocabulary",
  "skills/ce-babysit-pr/references/settle.md": "dispatched-CI-check vocabulary",
  "skills/ce-doc-review/references/bulk-preview.md": "finding-routing dispatch, not subagents",
  "skills/ce-doc-review/references/walkthrough.md": "finding-routing dispatch, not subagents",
  "skills/ce-doc-review/references/rendering-floor.md": "descriptive dispatch mention",
  "skills/ce-doc-review/references/open-questions-defer.md": "finding-routing dispatch, not subagents",
  "skills/ce-doc-review/references/decision-primer.md": "payload primer read at dispatch; owns no call",
  "skills/ce-strategy/references/interview.md": "milestone launch vocabulary",
  "skills/ce-ideate/references/html-rendering.md": "diagram fan-out vocabulary",
}

// Payload directories skipped by the sweep: child prompt assets, never consumers.
const SKIP_SEGMENTS = ["/references/agents/", "/references/personas/", "/references/sources/"]
const SKIP_SUFFIX = "-template.md"

const START = "<!-- ce-worker-profiles:start -->"
const END = "<!-- ce-worker-profiles:end -->"

const DISPATCH_VERB = /\b(dispatch|dispatches|dispatched|dispatching|spawn|spawns|spawned|spawning|launch|launches|launched|launching|re-dispatch|fanned?.?out|fans?.?out|delegate|delegates|delegated|delegating)\b/i
const AGENT_NOUN = /\b(sub-?agents?|verifier|scout|reviewer|worker|critic|persona|leaf|leaves|analyst|researcher|distiller|judge|baker|historian|fixer|implementer)s?\b/i

async function canonicalBlock(): Promise<string> {
  const fixture = await readFile(FIXTURE, "utf8")
  const start = fixture.indexOf(START)
  const end = fixture.indexOf(END)
  expect(start).toBeGreaterThanOrEqual(0)
  expect(end).toBeGreaterThan(start)
  return fixture.slice(start, end + END.length)
}

describe("worker-profile rule shared-asset parity", () => {
  test("the fixture defines a single delimited block", async () => {
    const block = await canonicalBlock()
    expect(block.startsWith(START)).toBe(true)
    expect(block.endsWith(END)).toBe(true)
    const fixture = await readFile(FIXTURE, "utf8")
    expect(fixture.split(START).length).toBe(2)
    expect(fixture.split(END).length).toBe(2)
  })

  test("every consumer contains the canonical block verbatim exactly once", async () => {
    const block = await canonicalBlock()
    expect(new Set(CONSUMERS).size).toBe(CONSUMERS.length)
    for (const rel of CONSUMERS) {
      const p = path.join(REPO_ROOT, rel)
      await access(p)
      const content = await readFile(p, "utf8")
      expect(content, `${rel} is missing the worker-profiles block`).toContain(block)
      expect(content.split(START).length, `${rel} embeds the block more than once`).toBe(2)
      expect(content.split(END).length, `${rel} embeds the block more than once`).toBe(2)
    }
  })

  test("excluded files carry no block and stay on disk", async () => {
    const block = await canonicalBlock()
    for (const rel of Object.keys(EXCLUDED)) {
      const p = path.join(REPO_ROOT, rel)
      await access(p) // stale exclusion entries fail here
      const content = await readFile(p, "utf8")
      expect(content, `${rel} is EXCLUDED but contains the block`).not.toContain(block)
    }
  })

  test("coverage sweep: every dispatch-instructing skills file is classified", async () => {
    const classified = new Set([...CONSUMERS, ...Object.keys(EXCLUDED)])
    const unclassified: string[] = []
    for (const rel of new Glob("**/*.md").scanSync({ cwd: SKILLS_ROOT })) {
      const relPath = `skills/${rel}`
      if (classified.has(relPath)) continue
      if (SKIP_SEGMENTS.some((s) => relPath.includes(s)) || relPath.endsWith(SKIP_SUFFIX)) continue
      const content = await readFile(path.join(SKILLS_ROOT, rel), "utf8")
      if (DISPATCH_VERB.test(content) && AGENT_NOUN.test(content)) unclassified.push(relPath)
    }
    expect(unclassified, "files with dispatch vocabulary missing from CONSUMERS/EXCLUDED - classify each and record its reason").toEqual([])
  })

  test("the canonical block pins its load-bearing clauses", async () => {
    const block = await canonicalBlock()
    // The two keys and the ordinary cascade.
    expect(block).toContain("subagent_read_profile")
    expect(block).toContain("subagent_write_profile")
    expect(block).toContain("config.local.yaml")
    expect(block).toContain("config.yaml")
    // Each key is bound to its authority class, not just present: the read key
    // resolves for children that do not mutate tracked content, and the write
    // key resolves for children that do.
    expect(block).toMatch(/subagent_read_profile` for children that do not mutate tracked project content/)
    expect(block).toMatch(/subagent_write_profile` for children that do\b/)
    expect(block).toContain("writing per-run scratch artifacts stays read class")
    // Local config resolves before repo config: the cascade order is pinned by
    // position, so a swapped order fails here rather than silently inverting
    // which file wins.
    const resolveLine = block.split("\n").find((l) => l.includes("subagent_read_profile")) ?? ""
    expect(resolveLine).toMatch(/config\.local\.yaml` then `config\.yaml/)
    expect(resolveLine.indexOf("config.local.yaml")).toBeLessThan(resolveLine.indexOf("config.yaml`"))
    // Names are opaque: the plugin never invents, validates, or defaults one,
    // and the selector derives only from the resolved keys.
    expect(block).toContain("never invent, validate, or default them")
    expect(block).toContain("never from dispatch content")
    // Authority classes stay separate and resolve per call.
    expect(block).toContain("per dispatch call")
    expect(block).toContain("a cheaper profile must never be given write work")
    // Host capability gate and the typed-selector exclusion.
    expect(block).toContain("accepts a named worker profile")
    expect(block).toContain("typed or registered-agent selector is not a worker profile")
    // Devin's selector: a configured name substitutes for the built-in profile
    // run_subagent would otherwise use.
    expect(block).toContain("run_subagent")
    expect(block).toContain("substitutes for the built-in profile")
    // Profile supersedes model selection; never both.
    expect(block).toContain("supersedes this surface's model selection")
    expect(block).toContain("never pass both")
    // Transparent failure; no unverified claims.
    expect(block).toContain("named in the coverage or degradation note")
    expect(block).toContain("Never report a profile or model as having run")
    // Unset is a strict no-op.
    expect(block).toContain("strict no-op")
    // The block ships no default model or profile.
    expect(block).not.toMatch(/swe-2/)
    expect(block).not.toContain("subagent_type:")
  })
})
