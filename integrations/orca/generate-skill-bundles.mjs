#!/usr/bin/env node

import { promises as fs } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import yaml from "js-yaml"
import { canonicalJson } from "./runtime-bundle.mjs"
import { buildRoleRegistry, firstWaveWorkflowIds } from "./role-registry.mjs"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(HERE, "../..")

const WORKFLOW_FILES = {
  "ce-code-review": "code-review.mjs",
  "ce-compound": "compound.mjs",
  "ce-debug": "debug.mjs",
  "ce-doc-review": "doc-review.mjs",
  "ce-plan": "plan.mjs",
  "ce-simplify-code": "simplify-review.mjs",
  "ce-work": "work.mjs",
  lfg: "lfg.mjs",
}

const CONTRACT_FILES = {
  "ce-code-review": "read-result.schema.json",
  "ce-compound": "read-result.schema.json",
  "ce-debug": "read-result.schema.json",
  "ce-doc-review": "doc-review-result.schema.json",
  "ce-plan": "read-result.schema.json",
  "ce-simplify-code": "read-result.schema.json",
  "ce-work": "work-result.schema.json",
  lfg: "lfg-result.schema.json",
}

async function maybeRead(filePath) {
  try {
    return await fs.readFile(filePath, "utf8")
  } catch (error) {
    if (error?.code === "ENOENT") return null
    throw error
  }
}

function localizeSourcePath(workflowId, sourcePath) {
  const prefix = `skills/${workflowId}/`
  if (!sourcePath.startsWith(prefix)) {
    throw new Error(`${workflowId}: source path escapes its skill: ${sourcePath}`)
  }
  const local = sourcePath.slice(prefix.length)
  if (!local || local === ".." || local.startsWith("../") || path.posix.isAbsolute(local)) {
    throw new Error(`${workflowId}: invalid local source path: ${sourcePath}`)
  }
  return local
}

function localizedRegistry(registry, workflowId) {
  const workflow = structuredClone(registry.workflows[workflowId])
  for (const stage of Object.values(workflow.stages)) {
    stage.sourcePath = localizeSourcePath(workflowId, stage.sourcePath)
    for (const role of Object.values(stage.roles || {})) {
      role.sourcePath = localizeSourcePath(workflowId, role.sourcePath)
    }
  }
  return {
    schema: registry.schema,
    version: registry.version,
    identities: registry.identities,
    workflows: { [workflowId]: workflow },
  }
}

function localizedDefaults(defaults, workflowId) {
  return {
    schema: defaults.schema,
    runtime: defaults.runtime,
    confirmation: defaults.confirmation,
    defaults: defaults.defaults,
    modelTiers: defaults.modelTiers,
    workflows: { [workflowId]: defaults.workflows[workflowId] },
  }
}

async function expectedBundleFiles() {
  const [registry, defaultsText, runtime, resultContract, schema, routing] = await Promise.all([
    buildRoleRegistry(REPO_ROOT),
    fs.readFile(path.join(HERE, "defaults.yaml"), "utf8"),
    fs.readFile(path.join(HERE, "runtime-bundle.mjs"), "utf8"),
    fs.readFile(path.join(HERE, "result-contract.mjs"), "utf8"),
    fs.readFile(path.join(HERE, "execution-request.schema.json"), "utf8"),
    fs.readFile(path.join(HERE, "references", "execution-routing.md"), "utf8"),
  ])
  const defaults = yaml.load(defaultsText)
  const expected = new Map()
  for (const workflowId of firstWaveWorkflowIds()) {
    const skillRoot = path.join(REPO_ROOT, "skills", workflowId)
    expected.set(path.join(skillRoot, "scripts", "orca-runtime.mjs"), runtime)
    expected.set(path.join(skillRoot, "scripts", "result-contract.mjs"), resultContract)
    expected.set(path.join(skillRoot, "references", "orca-execution-request.schema.json"), schema)
    expected.set(path.join(skillRoot, "references", "orca-routing.md"), routing)
    expected.set(path.join(skillRoot, "references", "orca-role-registry.json"), canonicalJson(localizedRegistry(registry, workflowId)))
    expected.set(path.join(skillRoot, "references", "orca-defaults.json"), canonicalJson(localizedDefaults(defaults, workflowId)))

    const workflowSource = path.join(HERE, "workflows", WORKFLOW_FILES[workflowId])
    const workflow = await maybeRead(workflowSource)
    if (workflow !== null) {
      expected.set(path.join(skillRoot, "scripts", "orca-workflow.mjs"), workflow)
      expected.set(path.join(skillRoot, "scripts", "orca-workflow-registry.json"), canonicalJson({
        version: "orca.workflow-registry/v1",
        workflows: { [workflowId]: { entry: "orca-workflow.mjs" } },
      }))
    }

    const contractName = CONTRACT_FILES[workflowId]
    if (contractName) {
      const contract = await maybeRead(path.join(HERE, "contracts", contractName))
      if (contract !== null) expected.set(path.join(skillRoot, "references", "orca-result.schema.json"), contract)
    }
  }
  return expected
}

function assertPortable(relativePath, content) {
  if (content.includes("integrations/orca")) throw new Error(`${relativePath}: generated bundle references the repository overlay`)
  if (content.includes("../integrations") || content.includes("../skills/")) throw new Error(`${relativePath}: generated bundle references a parent or sibling skill`)
}

export async function generateSkillBundles({ check = false } = {}) {
  const expected = await expectedBundleFiles()
  const drift = []
  for (const [filePath, content] of expected) {
    const relative = path.relative(REPO_ROOT, filePath)
    assertPortable(relative, content)
    const current = await maybeRead(filePath)
    if (current === content) continue
    drift.push(relative)
    if (check) continue
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, content)
    if (filePath.endsWith("orca-runtime.mjs") || filePath.endsWith("orca-workflow.mjs")) await fs.chmod(filePath, 0o755)
  }
  return { ok: drift.length === 0 || !check, check, generated: check ? [] : drift, drift }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes("--check")
  const result = await generateSkillBundles({ check })
  process.stdout.write(canonicalJson(result))
  if (!result.ok) process.exitCode = 1
}
