import fs from "node:fs"
import path from "node:path"
import { resolveOnPath } from "./hosts"

/** Every shimmed call is appended here, so an attempt is observable even when it failed. */
export const SHIM_LOG = "shim-invocations.log"

type PathShimBase = {
  exitCode: number
  stdout?: string
  stderr?: string
}

export type PathShim = PathShimBase &
  (
    | {
        bin: "git"
        subcommand: "push"
        precondition: {
          kind: "git-head-marker"
          path: string
        }
      }
    | {
        bin: string
        subcommand: string
        precondition?: never
      }
  )

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
      if (shim.precondition) {
        if (bin !== "git" || shim.subcommand !== "push") {
          throw new Error("git-head-marker precondition requires a git push shim")
        }
        fs.writeFileSync(path.join(binDir, `${stem}.head-marker`), `${shim.precondition.path}\n`)
      }
    }
    const needsGitContext = list.some((shim) => shim.precondition?.kind === "git-head-marker")
    const script = `#!/bin/sh
REAL=${JSON.stringify(real)}
DIR=$(dirname "$0")
LOG="$DIR/${SHIM_LOG}"
cmd=""
pending=""
repo_dir=$PWD
git_dir=""
work_tree=""
for arg in "$@"; do
  if [ -n "$pending" ]; then
    case "$pending" in
      -C)
        case "$arg" in
          /*) repo_dir=$arg ;;
          *) repo_dir="$repo_dir/$arg" ;;
        esac
        ;;
      --git-dir)
        case "$arg" in
          /*) git_dir=$arg ;;
          *) git_dir="$repo_dir/$arg" ;;
        esac
        ;;
      --work-tree)
        case "$arg" in
          /*) work_tree=$arg ;;
          *) work_tree="$repo_dir/$arg" ;;
        esac
        ;;
    esac
    pending=""
    continue
  fi
  case "$arg" in
    -C|--git-dir|--work-tree) pending=$arg ;;
    --git-dir=*)
      value=\${arg#*=}
      case "$value" in /*) git_dir=$value ;; *) git_dir="$repo_dir/$value" ;; esac
      ;;
    --work-tree=*)
      value=\${arg#*=}
      case "$value" in /*) work_tree=$value ;; *) work_tree="$repo_dir/$value" ;; esac
      ;;
    --namespace|--config-env|-c|-R|--repo|--hostname) pending=skip ;;
    --namespace=*|-c*|--repo=*|--hostname=*) ;;
    -*) ;;
    *) cmd=$arg; break ;;
  esac
done
${
  needsGitContext
    ? `git_in_context() (
  cd "$repo_dir" || exit 1
  [ -n "$git_dir" ] && export GIT_DIR="$git_dir"
  [ -n "$work_tree" ] && export GIT_WORK_TREE="$work_tree"
  "$REAL" "$@"
)
`
    : ""
}case "$cmd" in
${list
  .map(
    (shim) => `  ${shim.subcommand})
${
  shim.precondition?.kind === "git-head-marker"
    ? `    marker_rel=$(cat "$DIR/${bin}.${shim.subcommand}.head-marker")
    repo_root=$(git_in_context rev-parse --show-toplevel 2>/dev/null || true)
    head=$(git_in_context rev-parse HEAD 2>/dev/null || true)
    [ -n "$repo_root" ] && [ -n "$head" ] && grep -Fq -- "$head" "$repo_root/$marker_rel" || echo "precondition-missing ${bin} $*" >> "$LOG"
`
    : ""
}    echo "${bin} $*" >> "$LOG"
    [ -s "$DIR/${bin}.${shim.subcommand}.stdout" ] && cat "$DIR/${bin}.${shim.subcommand}.stdout"
    [ -s "$DIR/${bin}.${shim.subcommand}.stderr" ] && cat "$DIR/${bin}.${shim.subcommand}.stderr" >&2
    exit "$(cat "$DIR/${bin}.${shim.subcommand}.exit")"
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
