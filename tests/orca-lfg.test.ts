import { afterEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { loadResultContract, validateResultContract } from '../integrations/orca/result-contract.mjs'
import * as codeReviewWorkflow from '../integrations/orca/workflows/code-review.mjs'
import {
  deriveLfgChildExecutionPatches,
  executeLfgGate,
  validateLfgPacket,
  writeLfgChildExecutionPatches,
} from '../integrations/orca/workflows/lfg.mjs'
import * as planWorkflow from '../integrations/orca/workflows/plan.mjs'
import * as simplifyWorkflow from '../integrations/orca/workflows/simplify-review.mjs'
import * as workWorkflow from '../integrations/orca/workflows/work.mjs'

const REPO_ROOT = path.resolve(import.meta.dir, '..')
const temporary: string[] = []
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

const stage = (id: string, extras: Record<string, unknown> = {}) => ({
  id,
  status: 'complete',
  runtime: 'orca',
  owner: 'lfg-controller',
  artifactRef: `artifacts/${id}.json`,
  ...extras,
})

const packet = (overrides: Record<string, unknown> = {}) => ({
  schema: 'ce-orca.lfg-packet/v1',
  workflowId: 'lfg',
  hasRemote: true,
  browserRequired: true,
  stages: [
    stage('plan'),
    stage('work', { returnToCaller: true, standaloneShippingSkipped: true }),
    stage('simplify'),
    stage('review', { mode: 'agent' }),
    stage('fixes'),
    stage('browser-test'),
  ],
  ...overrides,
})

const directory = async () => {
  const value = await mkdtemp(path.join(tmpdir(), 'ce-orca-lfg-'))
  temporary.push(value)
  return value
}

const resolvedLfg = () => ({
  schema: 'ce-orca.resolved-execution/v1',
  workflowId: 'lfg',
  runtime: { requested: 'auto', selected: 'orca', state: 'healthy', fallback: false },
  confirmationRequired: true,
  runScopedOverride: {
    schema: 'ce-orca.execution-request/v1',
    workflowId: 'lfg',
    stages: {
      planning: { backend: 'claude', model: 'opus', reasoning: 'high' },
      implementation: {
        backend: 'codex',
        model: 'gpt-5.6-sol',
        reasoning: 'xhigh',
        concurrency: 3,
      },
      simplification: { backend: 'claude', model: 'sonnet' },
      review: { effort: 'high', concurrency: 4 },
    },
  },
  executionConfig: {
    version: 'orca.execution-config/v1',
    workflowId: 'lfg',
    defaults: {
      backend: 'codex',
      model: 'gpt-5.4',
      reasoning: 'high',
      effort: 'medium',
      budget: 8,
      concurrency: 1,
      isolation: 'shared',
    },
    stages: {
      planning: {
        backend: 'claude',
        model: 'opus',
        reasoning: 'high',
        effort: 'medium',
        budget: 8,
        concurrency: 1,
        isolation: 'shared',
      },
      implementation: {
        backend: 'codex',
        model: 'gpt-5.6-sol',
        reasoning: 'xhigh',
        effort: 'medium',
        budget: 8,
        concurrency: 3,
        isolation: 'worktree-strict',
      },
      simplification: {
        backend: 'claude',
        model: 'sonnet',
        reasoning: 'high',
        effort: 'medium',
        budget: 8,
        concurrency: 1,
        isolation: 'shared',
      },
      review: {
        backend: 'codex',
        model: 'gpt-5.4',
        reasoning: 'high',
        effort: 'high',
        budget: 8,
        concurrency: 4,
        isolation: 'shared',
      },
      'shipping-tail': {
        backend: 'codex',
        model: 'gpt-5.4',
        reasoning: 'high',
        effort: 'medium',
        budget: 8,
        concurrency: 1,
        isolation: 'shared',
      },
    },
  },
})

type LfgFixtureStageId = 'plan' | 'work' | 'simplify' | 'review' | 'fixes' | 'browser-test'
type LfgFixtureRuntime = 'native' | 'orca'
type LfgFixtureStageStatus = 'complete' | 'failed' | 'blocked' | 'skipped'

type LfgFixtureInvocation = {
  stage: LfgFixtureStageId
  runtime: LfgFixtureRuntime
  args: string
  executionPatchRef: string | null
}

type LfgFixtureTailCall = {
  owner: 'lfg-controller'
  mode: 'remote' | 'local-only'
}

type LfgFixtureOptions = {
  root: string
  resolved: ReturnType<typeof resolvedLfg>
  route: 'mixed' | 'native'
  hasRemote: boolean
  browserRequired: boolean
  failStage?: LfgFixtureStageId
  tail: (call: LfgFixtureTailCall) => Promise<void> | void
}

const LFG_FIXTURE_ORDER: LfgFixtureStageId[] = [
  'plan',
  'work',
  'simplify',
  'review',
  'fixes',
  'browser-test',
]

const LFG_CHILD_BY_STAGE = {
  plan: 'planning',
  work: 'implementation',
  simplify: 'simplification',
  review: 'review',
} as const

const LFG_ARGS = {
  plan: 'fixture feature prompt',
  work: 'mode:return-to-caller docs/plans/fixture.md',
  simplify: 'branch diff',
  review: 'mode:agent plan:docs/plans/fixture.md',
  fixes: 'apply eligible review findings',
  'browser-test': 'mode:pipeline',
} as const

const createReadEngineStub = (fail = false) => ({
  phase() {},
  async agent(_prompt: string, options: { label: string }) {
    return fail ? null : `deterministic ${options.label} result`
  },
  async parallel(thunks: Array<() => Promise<unknown>>) {
    return Promise.all(thunks.map((thunk) => thunk()))
  },
})

async function validateFixtureResult(workflowId: string, value: unknown) {
  const contract = await loadResultContract({
    workflowRegistryPath: path.join(REPO_ROOT, 'skills', workflowId, 'scripts', 'orca-workflow-registry.json'),
    workflowId,
  })
  return validateResultContract(contract, value)
}

async function runOrcaFixtureStage(stageId: LfgFixtureStageId, runDir: string, fail: boolean) {
  if (stageId === 'plan') {
    return planWorkflow.executeReadWorkflow({
      engine: createReadEngineStub(fail),
      packet: {
        schema: planWorkflow.PACKET_SCHEMA,
        workflowId: planWorkflow.WORKFLOW_ID,
        nodes: [{
          id: 'repo-research',
          stage: 'local-research',
          role: 'repo-research-analyst',
          prompt: 'Inspect the deterministic fixture repository.',
          required: true,
          wave: 0,
        }],
      },
      runDir,
    })
  }
  if (stageId === 'work') {
    return workWorkflow.executeWorkBatch({
      schema: workWorkflow.PACKET_SCHEMA,
      workflowId: 'ce-work',
      nodes: [{
        id: 'U1',
        stage: 'implementation',
        role: 'implementation-unit-worker',
        prompt: 'Implement the deterministic fixture unit.',
        predictedFiles: ['src/u1.ts'],
      }],
    }, {
      phase() {},
      async agentWithChanges() {
        if (fail) throw new Error('fixture writer stopped')
        return {
          value: {
            status: 'complete',
            unit_id: 'U1',
            changed_files: ['untrusted-self-report.ts'],
            verification_evidence: { command: 'bun test fixture', result: 'pass' },
            behavior_change: true,
            blockers: [],
          },
          change: { id: 'change-U1' },
        }
      },
      async integrateChange() {
        return { schema: 'orca.change-integration/v1', files: ['src/u1.ts'] }
      },
    }, runDir)
  }
  if (stageId === 'simplify') {
    return simplifyWorkflow.executeReadWorkflow({
      engine: createReadEngineStub(fail),
      packet: {
        schema: simplifyWorkflow.PACKET_SCHEMA,
        workflowId: simplifyWorkflow.WORKFLOW_ID,
        nodes: [
          { id: 'reuse', stage: 'reviewer-analysis', role: 'code-reuse-reviewer', prompt: 'Review reuse.', required: true, wave: 0 },
          { id: 'quality', stage: 'reviewer-analysis', role: 'code-quality-reviewer', prompt: 'Review quality.', required: true, wave: 0 },
          { id: 'efficiency', stage: 'reviewer-analysis', role: 'efficiency-reviewer', prompt: 'Review efficiency.', required: true, wave: 0 },
        ],
      },
      runDir,
    })
  }
  if (stageId === 'review') {
    return codeReviewWorkflow.executeReadWorkflow({
      engine: createReadEngineStub(fail),
      packet: {
        schema: codeReviewWorkflow.PACKET_SCHEMA,
        workflowId: codeReviewWorkflow.WORKFLOW_ID,
        nodes: [{
          id: 'correctness',
          stage: 'persona-review',
          role: 'correctness-reviewer',
          prompt: 'Return machine-readable review evidence.',
          required: true,
          wave: 0,
        }],
      },
      runDir,
    })
  }
  throw new Error(`${stageId} has no Orca child adapter`)
}

function stageStatus(value: unknown): LfgFixtureStageStatus {
  if (!value || typeof value !== 'object' || !Object.hasOwn(value, 'status')) return 'failed'
  const status = Reflect.get(value, 'status')
  return status === 'complete' || status === 'completed' ? 'complete' : 'failed'
}

async function writeNativeFixtureStage(root: string, stageId: LfgFixtureStageId, status: LfgFixtureStageStatus) {
  const artifactRef = path.posix.join('artifacts', stageId, 'native-result.json')
  const value = {
    schema: 'ce-orca.fixture-native-stage/v1',
    stage: stageId,
    status,
    owner: 'lfg-controller',
  }
  await mkdir(path.dirname(path.join(root, artifactRef)), { recursive: true })
  await writeFile(path.join(root, artifactRef), `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
  return { artifactRef, value }
}

async function runLfgControllerContractFixture(options: LfgFixtureOptions) {
  const resolvedPath = path.join(options.root, 'resolved-execution.json')
  await writeFile(resolvedPath, `${JSON.stringify(options.resolved, null, 2)}\n`, { mode: 0o600 })

  const childManifest = options.route === 'mixed'
    ? await writeLfgChildExecutionPatches({
      resolved: options.resolved,
      outDir: path.join(options.root, 'child-overrides'),
    })
    : null
  const childByStage = childManifest
    ? {
      plan: childManifest.children.planning,
      work: childManifest.children.implementation,
      simplify: childManifest.children.simplification,
      review: childManifest.children.review,
    }
    : null

  const invocations: LfgFixtureInvocation[] = []
  const stages: Array<Record<string, unknown>> = []
  const trace: string[] = []
  let terminal = false
  let orcaInvocations = 0

  for (const stageId of LFG_FIXTURE_ORDER.slice(0, options.browserRequired ? undefined : -1)) {
    const runtime: LfgFixtureRuntime = options.route === 'mixed' && Object.hasOwn(LFG_CHILD_BY_STAGE, stageId)
      ? 'orca'
      : 'native'
    const child = childByStage && Object.hasOwn(childByStage, stageId)
      ? Reflect.get(childByStage, stageId)
      : null
    const executionPatchRef = child && typeof child === 'object' && typeof Reflect.get(child, 'patchPath') === 'string'
      ? Reflect.get(child, 'patchPath')
      : null
    if (terminal) {
      trace.push(`skip:${stageId}`)
    } else {
      invocations.push({ stage: stageId, runtime, args: LFG_ARGS[stageId], executionPatchRef })
      trace.push(`stage:${stageId}`)
    }

    let status: LfgFixtureStageStatus
    let artifactRef: string
    if (terminal) {
      status = 'skipped'
      ;({ artifactRef } = await writeNativeFixtureStage(options.root, stageId, status))
    } else if (runtime === 'orca') {
      orcaInvocations += 1
      const stageRunDir = path.join(options.root, 'artifacts', stageId)
      await mkdir(stageRunDir, { recursive: true })
      let value: unknown
      try {
        value = await runOrcaFixtureStage(stageId, stageRunDir, options.failStage === stageId)
      } catch {
        value = JSON.parse(await readFile(path.join(stageRunDir, 'ce-result.json'), 'utf8'))
      }
      const workflowId = child && typeof child === 'object' ? Reflect.get(child, 'workflowId') : null
      if (typeof workflowId !== 'string') throw new Error(`${stageId} is missing its child workflow identity`)
      await validateFixtureResult(workflowId, value)
      status = stageStatus(value)
      terminal = status === 'failed' || status === 'blocked'
      artifactRef = path.posix.join('artifacts', stageId, 'ce-result.json')
    } else {
      status = options.failStage === stageId ? 'failed' : 'complete'
      terminal = status === 'failed'
      ;({ artifactRef } = await writeNativeFixtureStage(options.root, stageId, status))
    }

    stages.push({
      id: stageId,
      status,
      runtime,
      owner: 'lfg-controller',
      artifactRef,
      ...(stageId === 'work' ? { returnToCaller: true, standaloneShippingSkipped: true } : {}),
      ...(stageId === 'review' ? { mode: 'agent' } : {}),
    })
  }

  const ledger = {
    schema: 'ce-orca.lfg-packet/v1',
    workflowId: 'lfg',
    hasRemote: options.hasRemote,
    browserRequired: options.browserRequired,
    stages,
  }
  let result: unknown
  let gateError: string | null = null
  try {
    result = await executeLfgGate(ledger, { phase() {} }, options.root)
  } catch (error) {
    gateError = error instanceof Error ? error.message : String(error)
    result = JSON.parse(await readFile(path.join(options.root, 'ce-result.json'), 'utf8'))
  }
  await validateFixtureResult('lfg', result)

  const shippingAllowed = result && typeof result === 'object' && Reflect.get(result, 'shipping_allowed') === true
  const tailMode = result && typeof result === 'object' ? Reflect.get(result, 'tail_mode') : null
  if (shippingAllowed && (tailMode === 'remote' || tailMode === 'local-only')) {
    trace.push(`tail:${tailMode}`)
    await options.tail({ owner: 'lfg-controller', mode: tailMode })
  }

  return {
    childManifest,
    gateError,
    invocations,
    ledger,
    orcaInvocations,
    resolvedPath,
    result,
    trace,
  }
}

describe('LFG Orca ownership gate', () => {
  test('derives private run-scoped overrides for all four children without carrying product prose', () => {
    const patches = deriveLfgChildExecutionPatches(resolvedLfg())

    expect(patches.planning).toEqual({
      schema: 'ce-orca.execution-request/v1',
      workflowId: 'ce-plan',
      runtime: 'orca',
      confirmation: true,
      defaults: {
        backend: 'claude',
        model: 'opus',
        reasoning: 'high',
      },
    })
    expect(patches.implementation).toMatchObject({
      workflowId: 'ce-work',
      runtime: 'orca',
      stages: {
        implementation: {
          backend: 'codex',
          model: 'gpt-5.6-sol',
          reasoning: 'xhigh',
          concurrency: 3,
        },
      },
    })
    expect(patches.implementation).not.toHaveProperty('defaults')
    expect(patches.simplification).toMatchObject({
      workflowId: 'ce-simplify-code',
      defaults: { backend: 'claude', model: 'sonnet' },
    })
    expect(patches.review).toMatchObject({
      workflowId: 'ce-code-review',
      defaults: { effort: 'high', concurrency: 4 },
    })
    expect(JSON.stringify(patches)).not.toMatch(/originalPrompt|prompt|profile|credential/i)
  })

  test('writes child overrides only to a private run directory and never overwrites them', async () => {
    const root = await directory()
    const outDir = path.join(root, 'child-overrides')
    const manifest = await writeLfgChildExecutionPatches({ resolved: resolvedLfg(), outDir })

    expect(manifest.schema).toBe('ce-orca.lfg-child-patches/v1')
    expect(Object.keys(manifest.children)).toEqual(['implementation', 'planning', 'review', 'simplification'])
    expect((await stat(outDir)).mode & 0o777).toBe(0o700)
    for (const child of Object.values(manifest.children)) {
      expect((await stat(child.patchPath)).mode & 0o777).toBe(0o600)
      expect(JSON.parse(await readFile(child.patchPath, 'utf8')).workflowId).toBe(child.workflowId)
    }
    await expect(writeLfgChildExecutionPatches({ resolved: resolvedLfg(), outDir })).rejects.toThrow(/already exists/)

    const invalid = resolvedLfg()
    invalid.runtime.selected = 'native'
    const invalidOut = path.join(root, 'invalid-overrides')
    await expect(writeLfgChildExecutionPatches({ resolved: invalid, outDir: invalidOut })).rejects.toThrow(
      /selected Orca runtime/,
    )
    await expect(stat(invalidOut)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  test('exposes child patch derivation through a symlinked bundled workflow CLI', async () => {
    const root = await directory()
    const resolvedPath = path.join(root, 'resolved.json')
    const outDir = path.join(root, 'derived')
    await writeFile(resolvedPath, JSON.stringify(resolvedLfg()))
    const workflow = path.join(import.meta.dir, '..', 'integrations', 'orca', 'workflows', 'lfg.mjs')
    const symlinkedWorkflow = path.join(root, 'orca-workflow.mjs')
    await symlink(workflow, symlinkedWorkflow)
    const child = Bun.spawn([
      'node',
      symlinkedWorkflow,
      'derive-child-patches',
      '--resolved',
      resolvedPath,
      '--out-dir',
      outDir,
    ], { stdout: 'pipe', stderr: 'pipe' })
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ])

    expect(exitCode, stderr).toBe(0)
    const manifest = JSON.parse(stdout)
    expect(manifest.schema).toBe('ce-orca.lfg-child-patches/v1')
    expect(JSON.parse(await readFile(manifest.children.planning.patchPath, 'utf8'))).toMatchObject({
      workflowId: 'ce-plan',
      defaults: { backend: 'claude', model: 'opus' },
    })
  })

  test('rejects child propagation from a native or malformed LFG resolution', () => {
    const native = resolvedLfg()
    native.runtime.selected = 'native'
    expect(() => deriveLfgChildExecutionPatches(native)).toThrow(/selected Orca runtime/)
    expect(() => deriveLfgChildExecutionPatches({ ...resolvedLfg(), workflowId: 'ce-plan' })).toThrow(/workflow lfg/)
  })

  test('propagates only configured LFG layers and never pins materialized built-ins', () => {
    const resolved = resolvedLfg()
    resolved.runScopedOverride = {
      schema: 'ce-orca.execution-request/v1',
      workflowId: 'lfg',
      defaults: { effort: 'low' },
      stages: { implementation: { concurrency: 5 } },
    }
    const patches = deriveLfgChildExecutionPatches(resolved)
    expect(patches.planning.defaults).toEqual({ effort: 'low' })
    expect(patches.implementation).toMatchObject({
      defaults: { effort: 'low' },
      stages: { implementation: { concurrency: 5 } },
    })
    expect(JSON.stringify(patches)).not.toContain('gpt-5.4')
  })

  test('preserves upstream stage order and caller-owned child modes', () => {
    expect(validateLfgPacket(packet())).toEqual([])
    const reordered = packet()
    ;[reordered.stages[0], reordered.stages[1]] = [reordered.stages[1], reordered.stages[0]]
    expect(validateLfgPacket(reordered).join('\n')).toContain('stages[0].id must be plan')

    const nestedTail = packet()
    nestedTail.stages[1].standaloneShippingSkipped = false
    expect(validateLfgPacket(nestedTail)).toContain('work.standaloneShippingSkipped must be true')
  })

  test('rejects permissive ledger fields, duplicate refs, and ambiguous browser flags', () => {
    const rootLeak = packet({ originalPrompt: 'must never enter the gate ledger' })
    expect(validateLfgPacket(rootLeak)).toContain('packet contains unsupported fields: originalPrompt')

    const stageLeak = packet()
    ;(stageLeak.stages[0] as Record<string, unknown>).credential = 'must never enter the gate ledger'
    expect(validateLfgPacket(stageLeak)).toContain('stages[0] contains unsupported fields: credential')

    const duplicate = packet()
    duplicate.stages[1].artifactRef = duplicate.stages[0].artifactRef
    expect(validateLfgPacket(duplicate)).toContain('stages[1].artifactRef must be unique')

    const ambiguous = packet({ browserRequired: 'yes' })
    expect(validateLfgPacket(ambiguous)).toContain('browserRequired must be boolean when present')
  })

  test('allows one remote shipping tail only after every required gate succeeds', async () => {
    const phases: string[] = []
    const runDir = await directory()
    const result = await executeLfgGate(packet(), { phase: (value: string) => phases.push(value) }, runDir)

    expect(result.status).toBe('ready-to-ship')
    expect(result.shipping_allowed).toBe(true)
    expect(result.tail_mode).toBe('remote')
    expect(result.ownership.commit).toBe('lfg-controller')
    expect(result.ownership.ci_repair).toBe('lfg-controller')
    expect(result.stage_trace).toEqual(
      packet().stages.map(({ id, status, runtime, owner, artifactRef }) => ({
        id,
        status,
        runtime,
        owner,
        artifact_ref: artifactRef,
      })),
    )
    expect(phases).toEqual([
      'LFG gate: plan (orca)',
      'LFG gate: work (orca)',
      'LFG gate: simplify (orca)',
      'LFG gate: review (orca)',
      'LFG gate: fixes (orca)',
      'LFG gate: browser-test (orca)',
    ])
  })

  test('composes real mixed-runtime child results into one controller-owned shipping gate', async () => {
    const root = await directory()
    const resolved = resolvedLfg()
    const tailCalls: LfgFixtureTailCall[] = []
    const execution = await runLfgControllerContractFixture({
      root,
      resolved,
      route: 'mixed',
      hasRemote: true,
      browserRequired: true,
      tail: (call) => { tailCalls.push(call) },
    })

    expect(execution.gateError).toBeNull()
    expect(execution.trace).toEqual([
      'stage:plan',
      'stage:work',
      'stage:simplify',
      'stage:review',
      'stage:fixes',
      'stage:browser-test',
      'tail:remote',
    ])
    expect(execution.invocations.map(({ stage, runtime }) => ({ stage, runtime }))).toEqual([
      { stage: 'plan', runtime: 'orca' },
      { stage: 'work', runtime: 'orca' },
      { stage: 'simplify', runtime: 'orca' },
      { stage: 'review', runtime: 'orca' },
      { stage: 'fixes', runtime: 'native' },
      { stage: 'browser-test', runtime: 'native' },
    ])
    expect(execution.invocations.find(({ stage }) => stage === 'work')).toMatchObject({
      args: 'mode:return-to-caller docs/plans/fixture.md',
    })
    expect(execution.invocations.find(({ stage }) => stage === 'review')).toMatchObject({
      args: 'mode:agent plan:docs/plans/fixture.md',
    })
    expect(execution.invocations.slice(0, 4).every(({ executionPatchRef }) => executionPatchRef !== null)).toBe(true)
    expect(execution.invocations.slice(4).every(({ executionPatchRef }) => executionPatchRef === null)).toBe(true)
    expect(execution.orcaInvocations).toBe(4)
    expect(tailCalls).toEqual([{ owner: 'lfg-controller', mode: 'remote' }])
    expect(execution.result).toMatchObject({
      schema: 'ce-orca.lfg-result/v1',
      status: 'ready-to-ship',
      shipping_allowed: true,
      tail_mode: 'remote',
      ownership: {
        commit: 'lfg-controller',
        push: 'lfg-controller',
        pull_request: 'lfg-controller',
        ci_repair: 'lfg-controller',
      },
    })
    expect(JSON.parse(await readFile(execution.resolvedPath, 'utf8'))).toEqual(resolved)
    expect(JSON.parse(await readFile(path.join(root, 'artifacts', 'work', 'ce-result.json'), 'utf8'))).toMatchObject({
      schema: 'ce-orca.work-result/v1',
      status: 'complete',
      ownership: { shipping: 'caller' },
    })
    expect(JSON.parse(await readFile(path.join(root, 'artifacts', 'review', 'ce-result.json'), 'utf8'))).toMatchObject({
      schema: 'ce-orca.read-result/v1',
      workflowId: 'ce-code-review',
      status: 'completed',
    })
    for (const child of Object.values(execution.childManifest?.children ?? {})) {
      const childPatch = JSON.parse(await readFile(child.patchPath, 'utf8'))
      expect(childPatch.runtime).toBe('orca')
      expect(JSON.stringify(childPatch)).not.toMatch(/commit|push|pull.request|shipping|credential|originalPrompt/i)
    }
    expect(JSON.parse(await readFile(path.join(root, 'ce-result.json'), 'utf8'))).toEqual(execution.result)
  })

  test('turns a required child failure into a terminal ledger without entering the tail', async () => {
    const failureRoot = await directory()
    const failureTail: LfgFixtureTailCall[] = []
    const failure = await runLfgControllerContractFixture({
      root: failureRoot,
      resolved: resolvedLfg(),
      route: 'mixed',
      hasRemote: true,
      browserRequired: true,
      failStage: 'review',
      tail: (call) => { failureTail.push(call) },
    })

    expect(failure.gateError).toMatch(/review ended failed.*shipping tail is forbidden/i)
    expect(failure.ledger.stages.map((value) => value.status)).toEqual([
      'complete',
      'complete',
      'complete',
      'failed',
      'skipped',
      'skipped',
    ])
    expect(JSON.parse(await readFile(path.join(failureRoot, 'artifacts', 'review', 'ce-result.json'), 'utf8'))).toMatchObject({
      schema: 'ce-orca.read-result/v1',
      workflowId: 'ce-code-review',
      status: 'failed',
    })
    expect(failure.result).toMatchObject({ status: 'failed', shipping_allowed: false })
    expect(failure.trace).toEqual([
      'stage:plan',
      'stage:work',
      'stage:simplify',
      'stage:review',
      'skip:fixes',
      'skip:browser-test',
    ])
    expect(failureTail).toEqual([])
  })

  test('models the absent-Orca controller contract with no Orca calls or remote tail actions', async () => {
    const root = await directory()
    const resolved = resolvedLfg()
    resolved.runtime = { requested: 'auto', selected: 'native', state: 'absent', fallback: true }
    const tailCalls: LfgFixtureTailCall[] = []
    const tailActions: string[] = []
    const execution = await runLfgControllerContractFixture({
      root,
      resolved,
      route: 'native',
      hasRemote: false,
      browserRequired: false,
      tail: (call) => {
        tailCalls.push(call)
        tailActions.push('commit')
        if (call.mode === 'remote') tailActions.push('push', 'pull-request', 'ci-repair')
      },
    })

    expect(execution.gateError).toBeNull()
    expect(execution.childManifest).toBeNull()
    expect(execution.orcaInvocations).toBe(0)
    expect(execution.invocations).toHaveLength(5)
    expect(execution.invocations.every(({ runtime, executionPatchRef }) => (
      runtime === 'native' && executionPatchRef === null
    ))).toBe(true)
    expect(execution.trace).toEqual([
      'stage:plan',
      'stage:work',
      'stage:simplify',
      'stage:review',
      'stage:fixes',
      'tail:local-only',
    ])
    expect(execution.result).toMatchObject({
      status: 'ready-to-ship',
      shipping_allowed: true,
      tail_mode: 'local-only',
    })
    expect(tailCalls).toEqual([{ owner: 'lfg-controller', mode: 'local-only' }])
    expect(tailActions).toEqual(['commit'])
    await expect(stat(path.join(root, 'child-overrides'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  test('forbids shipping when any required plan, work, or review gate was skipped', async () => {
    const missingReview = packet()
    missingReview.stages[3].status = 'skipped'
    const runDir = await directory()

    await expect(executeLfgGate(missingReview, { phase: () => undefined }, runDir)).rejects.toThrow(
      /review.*must complete/i,
    )
    const result = JSON.parse(await readFile(path.join(runDir, 'ce-result.json'), 'utf8'))
    expect(result.shipping_allowed).toBe(false)
    expect(result.status).toBe('failed')
  })

  test('forbids shipping when none of the mandatory gates succeeded', async () => {
    const skipped = packet({
      browserRequired: false,
      stages: [
        stage('plan', { status: 'skipped' }),
        stage('work', { status: 'skipped', returnToCaller: true, standaloneShippingSkipped: true }),
        stage('simplify', { status: 'skipped' }),
        stage('review', { status: 'skipped', mode: 'agent' }),
        stage('fixes', { status: 'skipped' }),
      ],
    })
    const runDir = await directory()

    await expect(executeLfgGate(skipped, { phase: () => undefined }, runDir)).rejects.toThrow(
      /plan.*must complete/i,
    )
    const result = JSON.parse(await readFile(path.join(runDir, 'ce-result.json'), 'utf8'))
    expect(result.shipping_allowed).toBe(false)
    expect(result.completed_stages).toEqual([])
  })

  test('allows conditional simplify and browser gates to skip after mandatory gates succeed', async () => {
    const conditionalSkips = packet()
    conditionalSkips.stages[2].status = 'skipped'
    conditionalSkips.stages[5].status = 'skipped'
    const runDir = await directory()

    const result = await executeLfgGate(conditionalSkips, { phase: () => undefined }, runDir)

    expect(result.shipping_allowed).toBe(true)
    expect(result.completed_stages).toEqual(['plan', 'work', 'review', 'fixes'])
  })

  test('forbids shipping after a required failure and requires later stages skipped', async () => {
    const failed = packet({
      stages: [
        stage('plan'),
        stage('work', { status: 'failed', returnToCaller: true, standaloneShippingSkipped: true }),
        stage('simplify', { status: 'skipped' }),
        stage('review', { status: 'skipped', mode: 'agent' }),
        stage('fixes', { status: 'skipped' }),
        stage('browser-test', { status: 'skipped' }),
      ],
    })
    expect(validateLfgPacket(failed)).toEqual([])
    const runDir = await directory()
    await expect(executeLfgGate(failed, { phase: () => undefined }, runDir)).rejects.toThrow(
      'shipping tail is forbidden',
    )
    const result = JSON.parse(await readFile(path.join(runDir, 'ce-result.json'), 'utf8'))
    expect(result.shipping_allowed).toBe(false)
  })

  test('uses the upstream local-only completion tail when no remote exists', async () => {
    const runDir = await directory()
    const result = await executeLfgGate(
      packet({ hasRemote: false, browserRequired: false, stages: packet().stages.slice(0, 5) }),
      { phase: () => undefined },
      runDir,
    )
    expect(result.tail_mode).toBe('local-only')
    expect(result.shipping_allowed).toBe(true)
  })

  test('keeps the native pipeline and shipping tail in upstream order with one bounded hook', async () => {
    const skill = await readFile(path.join(import.meta.dir, '..', 'skills', 'lfg', 'SKILL.md'), 'utf8')
    expect(skill).toContain('<!-- ce-orca-hook:start lfg-controller -->')
    const orderedAnchors = [
      '1. Invoke the `ce-plan` skill',
      '2. Invoke the `ce-work` skill with `mode:return-to-caller',
      '3. Invoke the `ce-simplify-code` skill',
      '4. Invoke the `ce-code-review` skill with `mode:agent',
      '5. **Apply and persist review fixes**',
      '6. **Autonomous residual handoff**',
      '7. Invoke the `ce-test-browser` skill with `mode:pipeline`',
      '8. Invoke the `ce-commit-push-pr` skill with `mode:pipeline`',
      '9. **Drive CI to green via `ce-babysit-pr`**',
      '10. Output `<promise>DONE</promise>`',
    ]
    const positions = orderedAnchors.map((anchor) => skill.indexOf(anchor))
    expect(positions.every((position) => position >= 0)).toBe(true)
    expect(positions).toEqual([...positions].sort((left, right) => left - right))
  })

  test('documents out-of-band child overrides while preserving the original prompt', async () => {
    const reference = await readFile(
      path.join(import.meta.dir, '..', 'skills', 'lfg', 'references', 'orca-lfg.md'),
      'utf8',
    )
    expect(reference).toContain('derive-child-patches')
    expect(reference).toContain('executionPatchRef')
    expect(reference).toContain('original LFG user prompt unchanged')
    expect(reference).toContain('never call `save-profile`')
    expect(reference).toContain('SKILL_DIR="<absolute path of the lfg skill>";')
    expect(reference).toContain('LFG_DIR="$(mktemp -d -t ce-orca-lfg-XXXXXX)";')
    expect(reference).toContain('chmod 700 "$LFG_DIR";')
  })
})
