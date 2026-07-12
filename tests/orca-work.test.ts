import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { executeWorkBatch, validatePacket } from '../integrations/orca/workflows/work.mjs'

const temporary: string[] = []

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

const node = (id: string, predictedFiles: string[]) => ({
  id,
  stage: 'implementation',
  role: 'implementation-unit-worker',
  predictedFiles,
  prompt: `Implement ${id} from its bounded unit packet.`,
})

const packet = (...nodes: ReturnType<typeof node>[]) => ({
  schema: 'ce-orca.packet/v1',
  workflowId: 'ce-work',
  nodes,
})

const workerValue = (id: string) => ({
  status: 'complete',
  unit_id: id,
  changed_files: [`src/${id}.ts`],
  verification_evidence: { command: `bun test ${id}`, result: 'pass' },
  behavior_change: true,
  blockers: [],
})

const runDir = async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ce-orca-work-'))
  temporary.push(directory)
  return directory
}

describe('ce-work Orca workflow', () => {
  test('rejects overlapping batches and unsafe paths before launching a writer', () => {
    expect(validatePacket(packet(node('U1', ['src/shared.ts']), node('U2', ['src/shared.ts'])))).toContain(
      'nodes U1 and U2 overlap; serialize them',
    )
    expect(validatePacket(packet(node('U1', ['src/feature/../shared.ts']), node('U2', ['src/shared.ts'])))).toContain(
      'nodes U1 and U2 overlap; serialize them',
    )
    expect(validatePacket(packet(node('U1', ['.'])))).toContain('nodes[0].predictedFiles contains an unsafe path')
  })

  test('rejects wildcard and glob scopes before launching a single writer', async () => {
    for (const predictedFile of [
      '*',
      'src/*.ts',
      'src/file?.ts',
      'src/[ab].ts',
      'src/{one,two}.ts',
      'src/@(one|two).ts',
      'src/+(one|two).ts',
      'src/!(one|two).ts',
    ]) {
      let writerCalls = 0
      const engine = {
        phase: () => undefined,
        agentWithChanges: async () => {
          writerCalls += 1
          return { value: workerValue('U1'), change: { id: 'U1' } }
        },
        integrateChange: async () => ({ files: ['src/U1.ts'] }),
      }
      const directory = await runDir()

      await expect(executeWorkBatch(packet(node('U1', [predictedFile])), engine, directory)).rejects.toThrow(
        'nodes[0].predictedFiles contains an unsafe path',
      )
      expect(writerCalls).toBe(0)
    }
  })

  test('runs disjoint writers concurrently and integrates in packet order', async () => {
    const calls: string[] = []
    const engine = {
      phase: (title: string) => calls.push(`phase:${title}`),
      agentWithChanges: async (prompt: string, options: {
        label: string
        allowedFiles: string[]
        schema: { properties: { status: { enum: string[] } } }
      }) => {
        calls.push(`agent:${options.label}`)
        expect(prompt).toContain('Do not run git add, commit, push, open a PR')
        expect(options.allowedFiles).toEqual([options.label === 'U1' ? 'src/one.ts' : 'src/two.ts'])
        expect(options.schema.properties.status.enum).toEqual(['complete', 'blocked', 'failed'])
        return { value: workerValue(options.label), change: { id: options.label } }
      },
      integrateChange: async (change: { id: string }) => {
        calls.push(`integrate:${change.id}`)
        return {
          schema: 'orca.change-integration/v1',
          files: [change.id === 'U1' ? 'src/one.ts' : 'src/two.ts'],
        }
      },
    }
    const directory = await runDir()
    const result = await executeWorkBatch(packet(node('U1', ['src/one.ts']), node('U2', ['src/two.ts'])), engine, directory)

    expect(result.status).toBe('complete')
    expect(calls.filter((call) => call.startsWith('integrate:'))).toEqual(['integrate:U1', 'integrate:U2'])
    expect(result.units.map((unit) => unit.changed_files)).toEqual([['src/one.ts'], ['src/two.ts']])
    expect(result.ownership).toEqual({
      implementation: 'orca',
      integration: 'ce-controller',
      verification: 'ce-controller',
      shipping: 'caller',
    })
    expect(JSON.parse(await readFile(path.join(directory, 'ce-result.json'), 'utf8'))).toEqual(result)
  })

  test('integrates none of a batch when a required worker fails', async () => {
    let integrations = 0
    const engine = {
      phase: () => undefined,
      agentWithChanges: async (_prompt: string, options: { label: string }) => {
        if (options.label === 'U2') throw new Error('worker failed')
        return { value: workerValue(options.label), change: { id: options.label } }
      },
      integrateChange: async () => {
        integrations += 1
      },
    }
    const directory = await runDir()

    await expect(
      executeWorkBatch(packet(node('U1', ['src/one.ts']), node('U2', ['src/two.ts'])), engine, directory),
    ).rejects.toThrow('no batch integration was attempted')
    expect(integrations).toBe(0)
    const result = JSON.parse(await readFile(path.join(directory, 'ce-result.json'), 'utf8'))
    expect(result.status).toBe('failed')
    expect(result.units.map(({ status }: { status: string }) => status)).toEqual(['complete', 'failed'])
  })

  test('normalizes malformed and unknown-status worker envelopes to failed', async () => {
    const invalidValues = [
      { ...workerValue('U1'), status: 'unexpected' },
      { status: 'complete', unit_id: 'U1', changed_files: ['src/one.ts'] },
      ['not', 'an', 'object'],
    ]

    for (const value of invalidValues) {
      let integrations = 0
      const engine = {
        phase: () => undefined,
        agentWithChanges: async () => ({ value, change: { id: 'U1' } }),
        integrateChange: async () => {
          integrations += 1
          return { files: ['src/one.ts'] }
        },
      }
      const directory = await runDir()

      await expect(executeWorkBatch(packet(node('U1', ['src/one.ts'])), engine, directory)).rejects.toThrow(
        'no batch integration was attempted',
      )
      expect(integrations).toBe(0)
      expect(JSON.parse(await readFile(path.join(directory, 'ce-result.json'), 'utf8'))).toMatchObject({
        status: 'failed',
        units: [{ id: 'U1', status: 'failed' }],
      })
    }
  })

  test('does not integrate a blocked or mismatched worker envelope', async () => {
    let integrations = 0
    const engine = {
      phase: () => undefined,
      agentWithChanges: async () => ({
        value: { ...workerValue('another-unit'), status: 'blocked', blockers: ['needs a decision'] },
        change: { id: 'U1' },
      }),
      integrateChange: async () => {
        integrations += 1
      },
    }
    const directory = await runDir()
    await expect(executeWorkBatch(packet(node('U1', ['src/one.ts'])), engine, directory)).rejects.toThrow(
      'no batch integration was attempted',
    )
    expect(integrations).toBe(0)
    expect(JSON.parse(await readFile(path.join(directory, 'ce-result.json'), 'utf8'))).toMatchObject({
      units: [{ id: 'U1', status: 'failed' }],
    })
  })

  test('stops deterministic integration after the first conflict', async () => {
    const integrated: string[] = []
    const engine = {
      phase: () => undefined,
      agentWithChanges: async (_prompt: string, options: { label: string }) => ({
        value: workerValue(options.label),
        change: { id: options.label },
      }),
      integrateChange: async (change: { id: string }) => {
        integrated.push(change.id)
        if (change.id === 'U2') throw new Error('patch conflict')
        return { files: [`src/${change.id}.ts`] }
      },
    }
    const directory = await runDir()

    await expect(
      executeWorkBatch(
        packet(node('U1', ['src/one.ts']), node('U2', ['src/two.ts']), node('U3', ['src/three.ts'])),
        engine,
        directory,
      ),
    ).rejects.toThrow('patch conflict')
    expect(integrated).toEqual(['U1', 'U2'])
    const result = JSON.parse(await readFile(path.join(directory, 'ce-result.json'), 'utf8'))
    expect(result.failure_reason).toContain('Integration failed for U2')
  })

  test('does not trust worker-reported changed files without controller attestation', async () => {
    const engine = {
      phase: () => undefined,
      agentWithChanges: async () => ({
        value: workerValue('U1'),
        change: { id: 'U1' },
      }),
      integrateChange: async () => ({ version: 'orca.change-integration/v1' }),
    }
    const directory = await runDir()

    await expect(executeWorkBatch(packet(node('U1', ['src/one.ts'])), engine, directory)).rejects.toThrow(
      'integration did not attest actual changed files',
    )
    expect(JSON.parse(await readFile(path.join(directory, 'ce-result.json'), 'utf8'))).toMatchObject({
      status: 'failed',
      units: [{ id: 'U1', status: 'failed' }],
    })
  })

  test('rejects array-shaped integration attestations even when they expose files', async () => {
    const engine = {
      phase: () => undefined,
      agentWithChanges: async () => ({
        value: workerValue('U1'),
        change: { id: 'U1' },
      }),
      integrateChange: async () => Object.assign([], { files: ['src/one.ts'] }),
    }
    const directory = await runDir()

    await expect(executeWorkBatch(packet(node('U1', ['src/one.ts'])), engine, directory)).rejects.toThrow(
      'integration did not attest actual changed files',
    )
    expect(JSON.parse(await readFile(path.join(directory, 'ce-result.json'), 'utf8'))).toMatchObject({
      status: 'failed',
      units: [{ id: 'U1', status: 'failed' }],
    })
  })

  test('keeps the native dispatch text intact behind a bounded hook', async () => {
    const skill = await readFile(path.join(import.meta.dir, '..', 'skills', 'ce-work', 'SKILL.md'), 'utf8')
    expect(skill).toContain('<!-- ce-orca-hook:start ce-work-engine -->')
    expect(skill).toContain('For the inline/subagent engine, **prefer subagents for any structured multi-unit plan**')
    expect(skill).toContain('Do not also launch native implementation workers for an Orca-owned batch')
  })

  test('documents immutable resolve-then-run dispatch', async () => {
    const reference = await readFile(
      path.join(import.meta.dir, '..', 'skills', 'ce-work', 'references', 'orca-execution.md'),
      'utf8',
    )
    expect(reference).toContain('resolve --workflow ce-work --out <resolved.json>')
    expect(reference).toContain('--resolved <private-resolved.json>')
  })
})
