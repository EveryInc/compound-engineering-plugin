#!/usr/bin/env node

import {
  chmodSync,
  closeSync,
  constants,
  copyFileSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';

const EXIT_ERROR = 1;
const EXIT_CONCURRENT_CHANGE = 3;

function emit(body, exitCode = 0) {
  process.stdout.write(`${JSON.stringify(body)}\n`);
  process.exitCode = exitCode;
}

function fail(message, code = 'mechanics_error') {
  emit({ status: 'error', code, message }, EXIT_ERROR);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = new Map();
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index];
    const value = rest[index + 1];
    if (!key?.startsWith('--') || value === undefined) {
      throw new Error(`invalid arguments near ${key ?? '<end>'}`);
    }
    if (options.has(key)) throw new Error(`duplicate option ${key}`);
    options.set(key, value);
  }
  return { command, options };
}

function required(options, name) {
  const value = options.get(name);
  if (value === undefined || value === '') throw new Error(`missing ${name}`);
  return value;
}

function assertOnly(options, allowed) {
  for (const key of options.keys()) {
    if (!allowed.has(key)) throw new Error(`unsupported option ${key}`);
  }
}

function sha256(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function assertOwnedPrivateDirectory(dirPath) {
  const info = lstatSync(dirPath);
  if (info.isSymbolicLink()) throw new Error(`managed directory is a symlink: ${dirPath}`);
  if (!info.isDirectory()) throw new Error(`managed path is not a directory: ${dirPath}`);
  if (typeof process.getuid === 'function' && info.uid !== process.getuid()) {
    throw new Error(`managed directory is not owned by the current user: ${dirPath}`);
  }
  chmodSync(dirPath, 0o700);
  const repaired = lstatSync(dirPath);
  if ((repaired.mode & 0o777) !== 0o700) {
    throw new Error(`managed directory mode is not 0700: ${dirPath}`);
  }
}

function createPrivateBase(dirPath) {
  if (existsSync(dirPath)) {
    assertOwnedPrivateDirectory(dirPath);
    return;
  }
  mkdirSync(dirPath, { recursive: true, mode: 0o700 });
  assertOwnedPrivateDirectory(dirPath);
}

function createExclusiveRun(basePath) {
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
    const runId = `${timestamp}-${randomBytes(8).toString('hex')}`;
    const runDir = path.join(basePath, runId);
    try {
      mkdirSync(runDir, { mode: 0o700 });
      assertOwnedPrivateDirectory(runDir);
      return { runId, runDir };
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
    }
  }
  throw new Error('could not allocate a fresh run directory');
}

function resolveTarget(product) {
  const realpath = realpathSync(product);
  const info = statSync(realpath);
  if (!info.isFile()) throw new Error(`product target is not a regular file: ${realpath}`);
  return {
    realpath,
    dev: String(info.dev),
    ino: String(info.ino),
    mode: info.mode & 0o7777,
    sha256: sha256(realpath),
  };
}

function sameTarget(actual, expected) {
  return actual.realpath === expected.realpath
    && actual.dev === expected.dev
    && actual.ino === expected.ino
    && actual.sha256 === expected.sha256;
}

function allocateCommitTemp(targetPath, mode) {
  const directory = path.dirname(targetPath);
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const tempPath = path.join(directory, `.ce-doc-review-loop-commit-${randomBytes(12).toString('hex')}`);
    try {
      const fd = openSync(tempPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, mode);
      return { fd, tempPath };
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
    }
  }
  throw new Error('could not allocate an exclusive commit temp file');
}

function fingerprintCommand(options) {
  assertOnly(options, new Set(['--path']));
  const filePath = required(options, '--path');
  const info = statSync(filePath);
  if (!info.isFile()) throw new Error(`fingerprint path is not a regular file: ${filePath}`);
  emit({ status: 'ok', sha256: sha256(filePath) });
}

function initRunCommand(options) {
  assertOnly(options, new Set());
  const uid = typeof process.getuid === 'function' ? process.getuid() : 'user';
  const stateBase = process.env.CE_DOC_REVIEW_LOOP_STATE_BASE
    || path.join('/tmp', `compound-engineering-${uid}`, 'ce-doc-review-loop');
  const snapshotBase = process.env.CE_DOC_REVIEW_LOOP_SNAPSHOT_BASE
    || path.join(tmpdir(), 'ce-doc-review-loop');

  createPrivateBase(stateBase);
  createPrivateBase(snapshotBase);
  const { runId, runDir } = createExclusiveRun(stateBase);
  const snapshotDir = mkdtempSync(path.join(snapshotBase, `${runId}-`));
  assertOwnedPrivateDirectory(snapshotDir);
  const statePath = path.join(runDir, 'run-state.json');
  writeFileSync(statePath, '{}\n', { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  emit({ status: 'ok', run_id: runId, run_dir: runDir, state_path: statePath, snapshot_dir: snapshotDir });
}

function resolveTargetCommand(options) {
  assertOnly(options, new Set(['--product']));
  const product = required(options, '--product');
  emit({ status: 'ok', product, ...resolveTarget(product) });
}

function concurrentChange(expected, actual) {
  emit({ status: 'concurrent_change', expected, actual }, EXIT_CONCURRENT_CHANGE);
}

function commitCommand(options) {
  const allowed = new Set([
    '--product',
    '--validated',
    '--expected-fingerprint',
    '--expected-realpath',
    '--expected-dev',
    '--expected-ino',
  ]);
  assertOnly(options, allowed);
  const product = required(options, '--product');
  const validated = required(options, '--validated');
  const expected = {
    sha256: required(options, '--expected-fingerprint'),
    realpath: required(options, '--expected-realpath'),
    dev: required(options, '--expected-dev'),
    ino: required(options, '--expected-ino'),
  };
  if (!/^[0-9a-f]{64}$/.test(expected.sha256)) throw new Error('expected fingerprint must be 64 lowercase hexadecimal characters');

  const initial = resolveTarget(product);
  if (!sameTarget(initial, expected)) {
    concurrentChange(expected, initial);
    return;
  }

  const validatedInfo = statSync(validated);
  if (!validatedInfo.isFile()) throw new Error(`validated path is not a regular file: ${validated}`);
  const validatedBytes = readFileSync(validated);
  const { fd, tempPath } = allocateCommitTemp(initial.realpath, initial.mode);
  let tempExists = true;
  try {
    writeFileSync(fd, validatedBytes);
    chmodSync(tempPath, initial.mode);
    fsyncSync(fd);
    closeSync(fd);

    const immediatelyBeforeRename = resolveTarget(product);
    if (!sameTarget(immediatelyBeforeRename, expected)) {
      concurrentChange(expected, immediatelyBeforeRename);
      return;
    }

    renameSync(tempPath, immediatelyBeforeRename.realpath);
    tempExists = false;
    emit({
      status: 'committed',
      product,
      realpath: immediatelyBeforeRename.realpath,
      sha256: createHash('sha256').update(validatedBytes).digest('hex'),
      mode: initial.mode,
    });
  } finally {
    try { closeSync(fd); } catch {}
    if (tempExists) rmSync(tempPath, { force: true });
  }
}

try {
  const { command, options } = parseArgs(process.argv.slice(2));
  switch (command) {
    case 'fingerprint':
      fingerprintCommand(options);
      break;
    case 'init-run':
      initRunCommand(options);
      break;
    case 'resolve-target':
      resolveTargetCommand(options);
      break;
    case 'commit':
      commitCommand(options);
      break;
    default:
      throw new Error(`unknown command ${command ?? '<none>'}`);
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
