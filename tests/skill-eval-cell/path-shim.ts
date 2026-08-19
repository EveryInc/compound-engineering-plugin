import fs from "node:fs"
import path from "node:path"
import { resolveOnPath } from "./hosts"

/** Every shimmed call is appended here, so an attempt is observable even when it failed. */
export const SHIM_LOG = "shim-invocations.log"

export type PathShim = {
  bin: string
  subcommand: string
  exitCode: number
  stdout?: string
  stderr?: string
}

function resolveRealBin(bin: string): string {
  const resolved = resolveOnPath(bin)
  if (!resolved) throw new Error(`cannot resolve ${bin} on PATH`)
  return resolved
}

/**
 * `dir` must be outside the workspace the skill under test sees: shims dropped into
 * the workspace after its seed commit are untracked files the skill reads as its own
 * dirty tree (and for the gh-pr commit-flow cells, the only dirty files there are).
 */
export function installPathShims(dir: string, shims: PathShim[]): Record<string, string> {
  if (shims.length === 0) return {}
  const binDir = path.join(dir, ".bin")
  fs.mkdirSync(binDir, { recursive: true })
  const byBin = new Map<string, PathShim[]>()
  for (const shim of shims) {
    const list = byBin.get(shim.bin) ?? []
    list.push(shim)
    byBin.set(shim.bin, list)
  }
  for (const [bin, list] of byBin) {
    const real = resolveRealBin(bin)
    for (const shim of list) {
      const stem = `${bin}.${shim.subcommand}`
      fs.writeFileSync(path.join(binDir, `${stem}.exit`), `${shim.exitCode}\n`)
      fs.writeFileSync(path.join(binDir, `${stem}.stdout`), shim.stdout ?? "")
      fs.writeFileSync(path.join(binDir, `${stem}.stderr`), shim.stderr ?? "")
    }
    const subcommands = list.map((s) => s.subcommand)
    const script = `#!/bin/sh
REAL=${JSON.stringify(real)}
DIR=$(dirname "$0")
LOG="$DIR/${SHIM_LOG}"
cmd=""
skip=0
for arg in "$@"; do
  if [ "$skip" = 1 ]; then skip=0; continue; fi
  case "$arg" in
    -C|--git-dir|--work-tree|--namespace|--config-env|-c|-R|--repo|--hostname) skip=1 ;;
    --git-dir=*|--work-tree=*|--namespace=*|-c*|--repo=*|--hostname=*) ;;
    -*) ;;
    *) cmd=$arg; break ;;
  esac
done
case "$cmd" in
${subcommands
  .map(
    (sub) => `  ${sub})
    echo "${bin} $*" >> "$LOG"
    [ -s "$DIR/${bin}.${sub}.stdout" ] && cat "$DIR/${bin}.${sub}.stdout"
    [ -s "$DIR/${bin}.${sub}.stderr" ] && cat "$DIR/${bin}.${sub}.stderr" >&2
    exit "$(cat "$DIR/${bin}.${sub}.exit")"
    ;;`,
  )
  .join("\n")}
esac
exec "$REAL" "$@"
`
    fs.writeFileSync(path.join(binDir, bin), script, { mode: 0o755 })
  }
  return { PATH: `${binDir}:${process.env.PATH ?? ""}` }
}
