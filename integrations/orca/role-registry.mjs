import { promises as fs } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

export const ROLE_REGISTRY_SCHEMA = "ce-orca.role-registry/v1"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_REPO_ROOT = path.resolve(HERE, "../..")

const promptRole = (sourcePath, {
  activation = "conditional",
  modelTier = "parent",
  mutation = "read-only",
  required = false,
  resultMode = "structured",
} = {}) => ({
  sourceKind: "prompt-asset",
  sourcePath,
  activation,
  modelTier,
  mutation,
  required,
  resultMode,
})

const workflowRole = (sourcePath, anchor, {
  activation = "conditional",
  modelTier = "parent",
  mutation = "read-only",
  required = false,
  resultMode = "structured",
} = {}) => ({
  sourceKind: "workflow-role",
  sourcePath,
  anchor,
  activation,
  modelTier,
  mutation,
  required,
  resultMode,
})

const stage = (sourcePath, anchor, roles = {}, {
  activation = "always",
  defaultOwner = "orca",
  mutation = "read-only",
  nativeTargetHandling = "unconfigurable",
  resultMode = "structured",
} = {}) => ({
  sourcePath,
  anchor,
  activation,
  mutation,
  resultMode,
  defaultOwner,
  ...(defaultOwner === "native" ? { nativeTargetHandling } : {}),
  roles,
})

// This inventory names only roles and stages that the corresponding upstream
// skill currently dispatches. Semantic workflow roles point at their defining
// SKILL.md anchor; prompt-backed roles point at the exact local prompt asset.
// An execution override can configure a conditional role but cannot activate it.
const WORKFLOW_DEFINITIONS = {
  "ce-doc-review": {
    stages: {
      "persona-review": stage(
        "skills/ce-doc-review/SKILL.md",
        "## Phase 2: Announce and Dispatch Personas",
        {
          "coherence-reviewer": promptRole("skills/ce-doc-review/references/personas/coherence-reviewer.md", { activation: "always", modelTier: "cheap", required: true }),
          "feasibility-reviewer": promptRole("skills/ce-doc-review/references/personas/feasibility-reviewer.md", { activation: "always", required: true }),
          "product-lens-reviewer": promptRole("skills/ce-doc-review/references/personas/product-lens-reviewer.md"),
          "design-lens-reviewer": promptRole("skills/ce-doc-review/references/personas/design-lens-reviewer.md", { modelTier: "mid" }),
          "security-lens-reviewer": promptRole("skills/ce-doc-review/references/personas/security-lens-reviewer.md"),
          "scope-guardian-reviewer": promptRole("skills/ce-doc-review/references/personas/scope-guardian-reviewer.md", { modelTier: "mid" }),
          "adversarial-document-reviewer": promptRole("skills/ce-doc-review/references/personas/adversarial-document-reviewer.md"),
        },
      ),
    },
  },
  "ce-plan": {
    excludedPromptAssets: {
      "data-migration-reviewer": "The upstream asset is dormant in ce-plan and is not dispatched by the installed workflow.",
    },
    stages: {
      "project-profile": stage("skills/ce-plan/SKILL.md", "Resolve the project profile from the shared cache first.", {
        "repo-profiler": promptRole("skills/ce-plan/references/agents/repo-profiler.md", { activation: "conditional", modelTier: "cheap", resultMode: "artifact" }),
      }),
      "local-research": stage("skills/ce-plan/SKILL.md", "All specialist research and deepening prompts used in this phase are skill-local prompt assets", {
        "repo-research-analyst": promptRole("skills/ce-plan/references/agents/repo-research-analyst.md", { activation: "always", required: true, resultMode: "artifact" }),
        "learnings-researcher": promptRole("skills/ce-plan/references/agents/learnings-researcher.md", { activation: "always", resultMode: "artifact" }),
        "agent-native-planning-strategist": promptRole("skills/ce-plan/references/agents/agent-native-planning-strategist.md", { activation: "conditional", resultMode: "artifact" }),
      }),
      "organizational-research": stage("skills/ce-plan/SKILL.md", "**Slack context** (opt-in) — never auto-dispatch. Route by condition:", {
        "slack-researcher": promptRole("skills/ce-plan/references/agents/slack-researcher.md", { activation: "conditional", resultMode: "artifact" }),
      }, { defaultOwner: "native" }),
      "external-research": stage("skills/ce-plan/SKILL.md", "External Research", {
        "best-practices-researcher": promptRole("skills/ce-plan/references/agents/best-practices-researcher.md", { resultMode: "artifact" }),
        "framework-docs-researcher": promptRole("skills/ce-plan/references/agents/framework-docs-researcher.md", { resultMode: "artifact" }),
        "web-researcher": promptRole("skills/ce-plan/references/agents/web-researcher.md", { resultMode: "artifact" }),
      }, { defaultOwner: "native" }),
      "flow-analysis": stage("skills/ce-plan/SKILL.md", "spec-flow-analyzer", {
        "spec-flow-analyzer": promptRole("skills/ce-plan/references/agents/spec-flow-analyzer.md", { activation: "conditional", modelTier: "mid", resultMode: "artifact" }),
      }),
      deepening: stage("skills/ce-plan/SKILL.md", "Confidence Check and Deepening", {
        "repo-research-analyst": promptRole("skills/ce-plan/references/agents/repo-research-analyst.md", { resultMode: "artifact" }),
        "agent-native-planning-strategist": promptRole("skills/ce-plan/references/agents/agent-native-planning-strategist.md", { resultMode: "artifact" }),
        "framework-docs-researcher": promptRole("skills/ce-plan/references/agents/framework-docs-researcher.md", { resultMode: "artifact" }),
        "best-practices-researcher": promptRole("skills/ce-plan/references/agents/best-practices-researcher.md", { resultMode: "artifact" }),
        "spec-flow-analyzer": promptRole("skills/ce-plan/references/agents/spec-flow-analyzer.md", { resultMode: "artifact" }),
        "learnings-researcher": promptRole("skills/ce-plan/references/agents/learnings-researcher.md", { resultMode: "artifact" }),
        "web-researcher": promptRole("skills/ce-plan/references/agents/web-researcher.md", { resultMode: "artifact" }),
        "git-history-analyzer": promptRole("skills/ce-plan/references/agents/git-history-analyzer.md", { resultMode: "artifact" }),
        "architecture-strategist": promptRole("skills/ce-plan/references/agents/architecture-strategist.md", { resultMode: "artifact" }),
        "pattern-recognition-specialist": promptRole("skills/ce-plan/references/agents/pattern-recognition-specialist.md", { resultMode: "artifact" }),
        "performance-oracle": promptRole("skills/ce-plan/references/agents/performance-oracle.md", { resultMode: "artifact" }),
        "security-sentinel": promptRole("skills/ce-plan/references/agents/security-sentinel.md", { resultMode: "artifact" }),
        "data-integrity-guardian": promptRole("skills/ce-plan/references/agents/data-integrity-guardian.md", { resultMode: "artifact" }),
        "deployment-verification-agent": promptRole("skills/ce-plan/references/agents/deployment-verification-agent.md", { resultMode: "artifact" }),
      }, { defaultOwner: "native" }),
      authoring: stage("skills/ce-plan/SKILL.md", "### Phase 5: Final Review, Write File, and Handoff", {
        "plan-author": workflowRole("skills/ce-plan/SKILL.md", "Research, decide, and write the plan", { activation: "always", required: true, resultMode: "controller" }),
      }, { defaultOwner: "native", mutation: "artifact-write", resultMode: "controller" }),
    },
  },
  "ce-code-review": {
    stages: {
      "scope-triage": stage("skills/ce-code-review/SKILL.md", "Trivial-PR judgment", {
        "trivial-pr-judge": workflowRole("skills/ce-code-review/SKILL.md", "Trivial-PR judgment", { activation: "conditional", modelTier: "cheap" }),
      }, { defaultOwner: "native" }),
      "project-profile": stage("skills/ce-code-review/SKILL.md", "Resolve the question-agnostic project profile", {
        "repo-profiler": promptRole("skills/ce-code-review/references/agents/repo-profiler.md", { activation: "conditional", modelTier: "cheap", resultMode: "artifact" }),
      }),
      "persona-review": stage("skills/ce-code-review/SKILL.md", "### Stage 4: Spawn sub-agents", {
        "correctness-reviewer": promptRole("skills/ce-code-review/references/personas/correctness-reviewer.md", { activation: "always", required: true }),
        "testing-reviewer": promptRole("skills/ce-code-review/references/personas/testing-reviewer.md", { activation: "always", modelTier: "mid", required: true }),
        "maintainability-reviewer": promptRole("skills/ce-code-review/references/personas/maintainability-reviewer.md", { activation: "always", modelTier: "mid", required: true }),
        "project-standards-reviewer": promptRole("skills/ce-code-review/references/personas/project-standards-reviewer.md", { activation: "always", modelTier: "mid", required: true }),
        "agent-native-reviewer": promptRole("skills/ce-code-review/references/personas/agent-native-reviewer.md", { activation: "always", modelTier: "mid" }),
        "learnings-researcher": promptRole("skills/ce-code-review/references/personas/learnings-researcher.md", { activation: "always", modelTier: "mid" }),
        "security-reviewer": promptRole("skills/ce-code-review/references/personas/security-reviewer.md"),
        "performance-reviewer": promptRole("skills/ce-code-review/references/personas/performance-reviewer.md", { modelTier: "mid" }),
        "api-contract-reviewer": promptRole("skills/ce-code-review/references/personas/api-contract-reviewer.md", { modelTier: "mid" }),
        "data-migration-reviewer": promptRole("skills/ce-code-review/references/personas/data-migration-reviewer.md", { modelTier: "mid" }),
        "reliability-reviewer": promptRole("skills/ce-code-review/references/personas/reliability-reviewer.md", { modelTier: "mid" }),
        "adversarial-reviewer": promptRole("skills/ce-code-review/references/personas/adversarial-reviewer.md"),
        "previous-comments-reviewer": promptRole("skills/ce-code-review/references/personas/previous-comments-reviewer.md", { modelTier: "mid" }),
        "julik-frontend-races-reviewer": promptRole("skills/ce-code-review/references/personas/julik-frontend-races-reviewer.md", { modelTier: "mid" }),
        "swift-ios-reviewer": promptRole("skills/ce-code-review/references/personas/swift-ios-reviewer.md", { modelTier: "mid" }),
        "deployment-verification-agent": promptRole("skills/ce-code-review/references/personas/deployment-verification-agent.md", { modelTier: "mid" }),
      }),
      "adversarial-peer": stage("skills/ce-code-review/SKILL.md", "Cross-model adversarial pass", {
        "adversarial-peer": workflowRole("skills/ce-code-review/SKILL.md", "cross-model adversarial pass", { activation: "conditional" }),
      }, { defaultOwner: "native" }),
      "finding-validation": stage("skills/ce-code-review/SKILL.md", "### Stage 5b: Validation pass", {
        "finding-validator": workflowRole("skills/ce-code-review/SKILL.md", "One sub-agent per finding", { activation: "repeatable", modelTier: "mid" }),
      }),
    },
  },
  "ce-simplify-code": {
    stages: {
      "reviewer-analysis": stage("skills/ce-simplify-code/SKILL.md", "Dispatch three generic subagents", {
        "code-reuse-reviewer": promptRole("skills/ce-simplify-code/references/personas/code-reuse-reviewer.md", { activation: "always", modelTier: "mid", required: true }),
        "code-quality-reviewer": promptRole("skills/ce-simplify-code/references/personas/code-quality-reviewer.md", { activation: "always", modelTier: "mid", required: true }),
        "efficiency-reviewer": promptRole("skills/ce-simplify-code/references/personas/efficiency-reviewer.md", { activation: "always", modelTier: "mid", required: true }),
      }),
    },
  },
  "ce-debug": {
    excludedPromptAssets: {
      "repo-profiler": "ce-debug reads the shared cache opportunistically and does not dispatch its bundled repo-profiler asset.",
    },
    stages: {
      "hypothesis-investigation": stage("skills/ce-debug/SKILL.md", "Parallel investigation option", {
        "hypothesis-probe": workflowRole("skills/ce-debug/SKILL.md", "each with an explicit hypothesis and structured evidence-return format", { activation: "repeatable", modelTier: "mid" }),
      }),
    },
  },
  "ce-compound": {
    stages: {
      "project-profile": stage("skills/ce-compound/SKILL.md", "Resolve the agnostic project orientation from the shared cache", {
        "repo-profiler": promptRole("skills/ce-compound/references/agents/repo-profiler.md", { activation: "conditional", modelTier: "cheap", resultMode: "artifact" }),
      }),
      research: stage("skills/ce-compound/SKILL.md", "Launch research subagents.", {
        "context-analyzer": workflowRole("skills/ce-compound/SKILL.md", "Context Analyzer", { activation: "always", required: true, resultMode: "artifact" }),
        "solution-extractor": workflowRole("skills/ce-compound/SKILL.md", "Solution Extractor", { activation: "always", required: true, resultMode: "artifact" }),
        "related-docs-finder": workflowRole("skills/ce-compound/SKILL.md", "Related Docs Finder", { activation: "always", required: true, resultMode: "artifact" }),
      }),
      "session-history": stage("skills/ce-compound/SKILL.md", "Session History", {
        "session-historian": promptRole("skills/ce-compound/references/agents/session-historian.md", { activation: "conditional", resultMode: "artifact" }),
      }),
      "grounding-validation": stage("skills/ce-compound/SKILL.md", "### Phase 2.45: Grounding Validation", {
        "grounding-validator": workflowRole("skills/ce-compound/SKILL.md", "Semantic grounding validator", { activation: "conditional", modelTier: "mid" }),
      }),
      "specialized-review": stage("skills/ce-compound/SKILL.md", "Skip Phase 3 entirely in headless mode", {
        "pattern-recognition-specialist": promptRole("skills/ce-compound/references/agents/pattern-recognition-specialist.md"),
        "performance-oracle": promptRole("skills/ce-compound/references/agents/performance-oracle.md"),
        "security-sentinel": promptRole("skills/ce-compound/references/agents/security-sentinel.md"),
        "data-integrity-guardian": promptRole("skills/ce-compound/references/agents/data-integrity-guardian.md"),
        "best-practices-researcher": promptRole("skills/ce-compound/references/agents/best-practices-researcher.md"),
        "framework-docs-researcher": promptRole("skills/ce-compound/references/agents/framework-docs-researcher.md"),
        "code-simplification-reviewer": workflowRole("skills/ce-compound/SKILL.md", "read-only documentation review"),
      }, { defaultOwner: "native" }),
    },
  },
  "ce-work": {
    stages: {
      implementation: stage("skills/ce-work/SKILL.md", "your harness's subagent/worker mechanism.", {
        "implementation-unit-worker": workflowRole("skills/ce-work/SKILL.md", "bounded unit packet", { activation: "repeatable", mutation: "worktree-write", required: true, resultMode: "artifact" }),
      }, { mutation: "worktree-write", resultMode: "artifact" }),
      "design-validation": stage("skills/ce-work/SKILL.md", "figma-design-sync", {
        "figma-design-sync": promptRole("skills/ce-work/references/agents/figma-design-sync.md", { activation: "conditional", resultMode: "artifact" }),
      }, { defaultOwner: "native" }),
      "review-fixes": stage("skills/ce-work/SKILL.md", "dispatch fix subagents", {
        "review-fix-worker": workflowRole("skills/ce-work/SKILL.md", "dispatch fix subagents", { activation: "repeatable", mutation: "worktree-write", resultMode: "artifact" }),
      }, { defaultOwner: "native", mutation: "worktree-write", resultMode: "artifact" }),
    },
  },
  lfg: {
    stages: {
      planning: stage("skills/lfg/SKILL.md", "Invoke the `ce-plan` skill", {}, { defaultOwner: "native", nativeTargetHandling: "child-workflow", resultMode: "controller" }),
      implementation: stage("skills/lfg/SKILL.md", "Invoke the `ce-work` skill", {}, { defaultOwner: "native", nativeTargetHandling: "child-workflow", mutation: "worktree-write", resultMode: "controller" }),
      simplification: stage("skills/lfg/SKILL.md", "Invoke the `ce-simplify-code` skill", {}, { defaultOwner: "native", nativeTargetHandling: "child-workflow", mutation: "worktree-write", resultMode: "controller" }),
      review: stage("skills/lfg/SKILL.md", "Invoke the `ce-code-review` skill", {}, { defaultOwner: "native", nativeTargetHandling: "child-workflow", resultMode: "controller" }),
      "shipping-tail": stage("skills/lfg/SKILL.md", "Shipping precondition", {}, { defaultOwner: "native", mutation: "shipping-tail", resultMode: "controller" }),
    },
  },
}

const readJson = async (file) => JSON.parse(await fs.readFile(file, "utf8"))

function contained(root, candidate) {
  const relative = path.relative(root, candidate)
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

async function assertSource(repoRoot, record, label) {
  const candidate = path.resolve(repoRoot, record.sourcePath)
  if (!contained(repoRoot, candidate)) throw new Error(`${label}: source escapes repository`)
  const content = await fs.readFile(candidate, "utf8")
  if (record.anchor && !content.includes(record.anchor)) {
    throw new Error(`${label}: missing upstream anchor ${JSON.stringify(record.anchor)}`)
  }
}

export async function buildRoleRegistry(repoRoot = DEFAULT_REPO_ROOT) {
  const [upstream, protocol] = await Promise.all([
    readJson(path.join(repoRoot, "integrations/orca/upstream.json")),
    readJson(path.join(repoRoot, "integrations/orca/protocol.json")),
  ])
  const integrationVersion = `${upstream.version}-orca.${protocol.integration.revision}`
  const registry = {
    schema: ROLE_REGISTRY_SCHEMA,
    version: `ce-orca.registry/v1@${integrationVersion}`,
    identities: {
      ceVersion: upstream.version,
      integrationVersion,
      registryVersion: `ce-orca.registry/v1@${integrationVersion}`,
      protocolVersion: protocol.orca.protocol,
      requestVersion: protocol.orca.requestVersions[0],
    },
    workflows: {},
  }

  for (const [workflowId, definition] of Object.entries(WORKFLOW_DEFINITIONS)) {
    const coverage = protocol.integration.workflowCoverage[workflowId]
    if (!coverage) throw new Error(`${workflowId}: missing workflow coverage metadata`)
    const workflow = {
      skill: workflowId,
      mode: coverage.mode,
      controller: coverage.controller,
      ...(definition.excludedPromptAssets ? { excludedPromptAssets: definition.excludedPromptAssets } : {}),
      stages: definition.stages,
    }
    for (const [stageId, stageRecord] of Object.entries(workflow.stages)) {
      await assertSource(repoRoot, stageRecord, `${workflowId}.${stageId}`)
      for (const [roleId, role] of Object.entries(stageRecord.roles)) {
        await assertSource(repoRoot, role, `${workflowId}.${stageId}.${roleId}`)
      }
    }
    registry.workflows[workflowId] = workflow
  }
  return registry
}

export async function workflowRoleRegistry(workflowId, repoRoot = DEFAULT_REPO_ROOT) {
  const registry = await buildRoleRegistry(repoRoot)
  const workflow = registry.workflows[workflowId]
  if (!workflow) throw new Error(`Unknown workflow ${workflowId}. Valid workflows: ${Object.keys(registry.workflows).sort().join(", ")}`)
  return {
    schema: registry.schema,
    version: registry.version,
    identities: registry.identities,
    workflows: { [workflowId]: workflow },
  }
}

export const firstWaveWorkflowIds = () => Object.keys(WORKFLOW_DEFINITIONS).sort()
