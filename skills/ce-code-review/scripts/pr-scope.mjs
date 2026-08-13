#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
const SHA_PATTERN = /^(?:[0-9a-fA-F]{40}|[0-9a-fA-F]{64})$/
const NAMESPACE_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,126}[A-Za-z0-9_-])?$/

function fail(reason) {
  throw new Error(reason)
}

function validateNamespace(value) {
  if (
    !NAMESPACE_PATTERN.test(value)
    || value.endsWith('.lock')
    || value.includes('..')
  ) {
    fail('run namespace must be a safe ref component using 1-128 letters, digits, dots, underscores, or hyphens')
  }
}

function validateSha(value, name) {
  if (!SHA_PATTERN.test(value)) {
    fail(`${name} must be a concrete 40- or 64-character hexadecimal SHA`)
  }
}

function git(repo, args, reason) {
  try {
    return execFileSync('git', ['-C', repo, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  } catch {
    fail(reason)
  }
}

function main() {
  const args = process.argv.slice(2)
  if (args.length !== 5) {
    fail('usage: pr-scope.mjs <repo> <remote> <number-or-run-namespace> <base-oid> <head-oid>')
  }

  const [repo, remote, namespace, baseOid, headOid] = args
  validateNamespace(namespace)
  validateSha(baseOid, 'base OID')
  validateSha(headOid, 'head OID')
  if (repo.length === 0) fail('repo must be non-empty')
  if (remote.length === 0 || remote.startsWith('-')) fail('remote must be non-empty and must not start with a hyphen')

  const refKey = createHash('sha256').update(`${namespace}\0${baseOid}\0${headOid}`).digest('hex').slice(0, 24)
  const baseOidRef = `refs/review/pr-${namespace}-${refKey}-base-oid`
  const headOidRef = `refs/review/pr-${namespace}-${refKey}-head-oid`
  git(
    repo,
    [
      'fetch',
      '--no-tags',
      remote,
      `+${baseOid}:${baseOidRef}`,
      `+${headOid}:${headOidRef}`,
    ],
    'cannot fetch immutable PR base/head OIDs',
  )

  git(repo, ['rev-parse', '--verify', `${baseOidRef}^{commit}`], 'fetched PR base OID is not a commit')
  const verifiedHead = git(
    repo,
    ['rev-parse', '--verify', `${headOidRef}^{commit}`],
    'fetched PR head OID is not a commit',
  )
  const mergeBase = git(
    repo,
    ['merge-base', baseOidRef, headOidRef],
    'cannot compute the immutable PR endpoint merge base',
  )
  const verifiedMergeBase = git(
    repo,
    ['rev-parse', '--verify', `${mergeBase}^{commit}`],
    'computed PR merge base is not a commit',
  )

  process.stdout.write(`${JSON.stringify({
    status: 'ok',
    base_oid_ref: baseOidRef,
    head_oid_ref: headOidRef,
    base_sha: verifiedMergeBase,
    head_sha: verifiedHead,
  })}\n`)
}

try {
  main()
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error)
  process.stderr.write(`pr-scope: ${reason.replace(/[\r\n]+/g, ' ')}\n`)
  process.exitCode = 1
}
