import { afterEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  deriveLfgChildExecutionPatches,
  executeLfgGate,
  validateLfgPacket,
  writeLfgChildExecutionPatches,
} from '../integrations/orca/workflows/lfg.mjs'

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

  test('exposes child patch derivation through the bundled workflow CLI', async () => {
    const root = await directory()
    const resolvedPath = path.join(root, 'resolved.json')
    const outDir = path.join(root, 'derived')
    await writeFile(resolvedPath, JSON.stringify(resolvedLfg()))
    const workflow = path.join(import.meta.dir, '..', 'integrations', 'orca', 'workflows', 'lfg.mjs')
    const child = Bun.spawn([
      'bun',
      workflow,
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

  test('runs a resolved mixed-runtime fixture end to end with traceable child targets and one shipping owner', async () => {
    const root = await directory()
    const resolved = resolvedLfg()
    const resolvedPath = path.join(root, 'resolved-execution.json')
    await writeFile(resolvedPath, `${JSON.stringify(resolved, null, 2)}\n`, { mode: 0o600 })
    const childManifest = await writeLfgChildExecutionPatches({
      resolved,
      outDir: path.join(root, 'child-overrides'),
    })
    const fixturePacket = packet()
    fixturePacket.stages[2].runtime = 'native'
    fixturePacket.stages[4].runtime = 'native'
    const artifactDir = path.join(root, 'artifacts')
    await mkdir(artifactDir)
    await Promise.all(
      fixturePacket.stages.map((fixtureStage) =>
        writeFile(
          path.join(root, fixtureStage.artifactRef),
          `${JSON.stringify({
            schema: 'ce-orca.fixture-stage-result/v1',
            stage: fixtureStage.id,
            runtime: fixtureStage.runtime,
            owner: fixtureStage.owner,
          })}\n`,
          { mode: 0o600 },
        ),
      ),
    )
    const phases: string[] = []
    const result = await executeLfgGate(fixturePacket, { phase: (value: string) => phases.push(value) }, root)

    expect(JSON.parse(await readFile(resolvedPath, 'utf8')).executionConfig.stages).toEqual(
      resolved.executionConfig.stages,
    )
    expect(phases).toEqual(
      fixturePacket.stages.map((fixtureStage) => `LFG gate: ${fixtureStage.id} (${fixtureStage.runtime})`),
    )
    expect(result.stage_trace.map(({ id, runtime, owner, artifact_ref }) => ({ id, runtime, owner, artifact_ref }))).toEqual(
      fixturePacket.stages.map(({ id, runtime, owner, artifactRef }) => ({
        id,
        runtime,
        owner,
        artifact_ref: artifactRef,
      })),
    )
    expect(new Set(result.stage_trace.map(({ owner }) => owner))).toEqual(new Set(['lfg-controller']))
    expect(result.shipping_allowed).toBe(true)
    expect(result.ownership).toMatchObject({
      commit: 'lfg-controller',
      push: 'lfg-controller',
      pull_request: 'lfg-controller',
      ci_repair: 'lfg-controller',
    })
    for (const child of Object.values(childManifest.children)) {
      const childPatch = JSON.parse(await readFile(child.patchPath, 'utf8'))
      expect(childPatch.runtime).toBe('orca')
      expect(JSON.stringify(childPatch)).not.toMatch(/commit|push|pull.request|shipping|credential|originalPrompt/i)
    }
    expect(JSON.parse(await readFile(path.join(root, 'ce-result.json'), 'utf8'))).toEqual(result)
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

  test('keeps the native pipeline text and one bounded hook', async () => {
    const skill = await readFile(path.join(import.meta.dir, '..', 'skills', 'lfg', 'SKILL.md'), 'utf8')
    expect(skill).toContain('<!-- ce-orca-hook:start lfg-controller -->')
    expect(skill).toContain('Invoke the `ce-work` skill with `mode:return-to-caller')
    expect(skill).toContain('Invoke the `ce-code-review` skill with `mode:agent')
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
