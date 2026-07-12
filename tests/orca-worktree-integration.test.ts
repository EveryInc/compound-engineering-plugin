import { afterEach, describe, expect, test } from 'bun:test'
import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { executeWorkBatch } from '../integrations/orca/workflows/work.mjs'

const execFileAsync = promisify(execFile)
const temporary: string[] = []

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

const git = async (cwd: string, ...args: string[]) => (await execFileAsync('git', ['-C', cwd, ...args])).stdout.trim()

describe('ce-work integration contract', () => {
  test('declares strict isolation and one owner for integration and shipping', async () => {
    const reference = await readFile(
      path.join(import.meta.dir, '..', 'skills', 'ce-work', 'references', 'orca-execution.md'),
      'utf8',
    )
    expect(reference).toContain('strict Orca worktree isolation')
    expect(reference).toContain('No worker stages, commits, pushes, opens a PR')
    expect(reference).toContain('only after successful application')
    expect(reference).toContain('Do not dispatch the next dependency batch on a broken tree')
  })

  test('the result schema preserves caller-owned verification and shipping', async () => {
    const schema = JSON.parse(
      await readFile(
        path.join(import.meta.dir, '..', 'integrations', 'orca', 'contracts', 'work-result.schema.json'),
        'utf8',
      ),
    )
    expect(schema.properties.ownership.properties.integration.const).toBe('ce-controller')
    expect(schema.properties.ownership.properties.verification.const).toBe('ce-controller')
    expect(schema.properties.ownership.properties.shipping.const).toBe('caller')
    expect(schema.properties.units.items.required).toContain('verification_evidence')
  })

  test('integrates disjoint isolated worktree changes into a real fixture repository without staging or committing', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'ce-orca-worktree-fixture-'))
    temporary.push(root)
    const parent = path.join(root, 'parent')
    const children = { U1: path.join(root, 'child-u1'), U2: path.join(root, 'child-u2') }
    await mkdir(path.join(parent, 'src'), { recursive: true })
    await Promise.all([
      writeFile(path.join(parent, 'src', 'one.ts'), 'export const one = 1\n'),
      writeFile(path.join(parent, 'src', 'two.ts'), 'export const two = 2\n'),
    ])
    await execFileAsync('git', ['init', '-b', 'main', parent])
    await git(parent, 'config', 'user.email', 'fixture@example.invalid')
    await git(parent, 'config', 'user.name', 'Fixture')
    await git(parent, 'add', 'src/one.ts', 'src/two.ts')
    await git(parent, 'commit', '-m', 'fixture baseline')
    const baseline = await git(parent, 'rev-parse', 'HEAD')
    await git(parent, 'worktree', 'add', '--detach', children.U1, 'HEAD')
    await git(parent, 'worktree', 'add', '--detach', children.U2, 'HEAD')

    const nodes = [
      { id: 'U1', stage: 'implementation', role: 'implementation-unit-worker', predictedFiles: ['src/one.ts'], prompt: 'Implement U1.' },
      { id: 'U2', stage: 'implementation', role: 'implementation-unit-worker', predictedFiles: ['src/two.ts'], prompt: 'Implement U2.' },
    ]
    const packet = { schema: 'ce-orca.packet/v1', workflowId: 'ce-work', nodes }
    const engine = {
      phase: () => undefined,
      agentWithChanges: async (_prompt: string, options: { label: 'U1' | 'U2'; allowedFiles: string[] }) => {
        const relative = options.allowedFiles[0]
        await writeFile(path.join(children[options.label], relative), `export const ${options.label.toLowerCase()} = '${options.label}-isolated'\n`)
        return {
          value: {
            status: 'complete',
            unit_id: options.label,
            changed_files: [relative],
            verification_evidence: { command: 'fixture assertion', result: 'pass' },
            behavior_change: true,
            blockers: [],
          },
          change: { id: options.label, worktree: children[options.label], relative },
        }
      },
      integrateChange: async (change: { worktree: string; relative: string }) => {
        const patch = await git(change.worktree, 'diff', '--binary', 'HEAD', '--', change.relative)
        const patchPath = path.join(root, `${path.basename(change.worktree)}.patch`)
        await writeFile(patchPath, `${patch}\n`)
        await execFileAsync('git', ['-C', parent, 'apply', '--check', patchPath])
        await execFileAsync('git', ['-C', parent, 'apply', patchPath])
        return { schema: 'orca.change-integration/v1', files: [change.relative] }
      },
    }

    const runDir = path.join(root, 'run')
    await mkdir(runDir)
    const result = await executeWorkBatch(packet, engine, runDir)

    expect(result.units.map((unit) => unit.changed_files)).toEqual([['src/one.ts'], ['src/two.ts']])
    expect(await readFile(path.join(parent, 'src', 'one.ts'), 'utf8')).toContain('U1-isolated')
    expect(await readFile(path.join(parent, 'src', 'two.ts'), 'utf8')).toContain('U2-isolated')
    expect(await git(parent, 'rev-parse', 'HEAD')).toBe(baseline)
    expect(await git(parent, 'diff', '--cached', '--name-only')).toBe('')
    expect((await git(parent, 'status', '--short')).split('\n').map((line) => line.trim()).filter(Boolean).sort()).toEqual([
      'M src/one.ts',
      'M src/two.ts',
    ])
  })
})
