/**
 * Headless host-CLI argv for skill eval cells.
 *
 * Gotchas from docs/solutions/skill-design/size-driven-skill-restructure.md
 * (Eval-harness gotchas, 2026-08-17). Do not invent flags; pin the invocation
 * that was measured to work.
 */
import path from "node:path"

export const HOSTS = ["claude", "codex", "grok"] as const
export type Host = (typeof HOSTS)[number]
export type CurrentHost = Host | "unknown"

export type HostResolution = {
  current: CurrentHost
  wanted: Host[]
  run: Host[]
  skipped: Array<{ host: Host; reason: string }>
  ownEvalOnly: boolean
  warnings: string[]
}

export function attestCurrentHost(env: NodeJS.ProcessEnv = process.env): CurrentHost {
  if (env.CLAUDECODE === "1") return "claude"
  if (
    env.CODEX_SANDBOX ||
    env.CODEX_SANDBOX_NETWORK_DISABLED ||
    env.CODEX_SESSION_ID ||
    env.CODEX_THREAD_ID ||
    env.CODEX_CI
  ) {
    return "codex"
  }
  if (env.GROK_AGENT === "1" || env.GROK_SESSION_ID) return "grok"
  return "unknown"
}

export function peerHosts(current: CurrentHost): Host[] {
  if (current === "unknown") return [...HOSTS]
  return HOSTS.filter((host) => host !== current)
}

export function resolveRunHosts(opts: {
  explicit?: Host[]
  env?: NodeJS.ProcessEnv
  onPath?: (host: Host) => boolean
}): HostResolution {
  const current = attestCurrentHost(opts.env)
  const wanted = opts.explicit ?? peerHosts(current)
  const onPath = opts.onPath ?? ((host: Host) => commandExists(host))
  const warnings: string[] = []
  if (!opts.explicit && current === "unknown") {
    warnings.push("warning: could not attest current harness; defaulting to every CLI on PATH")
  }
  const skipped: HostResolution["skipped"] = []
  let run = wanted.filter((host) => {
    if (onPath(host)) return true
    skipped.push({ host, reason: `${host} CLI not on PATH` })
    warnings.push(`warning: skipping ${host}: ${host} CLI not on PATH`)
    return false
  })
  if (run.length === 0 && current !== "unknown" && onPath(current)) {
    run = [current]
  }
  const ownEvalOnly = run.length === 1 && run[0] === current
  if (ownEvalOnly) {
    warnings.push(
      `warning: own-eval only on ${current}; not a multi-harness perspective (wanted ${wanted.join(", ")})`,
    )
  } else if (run.length < wanted.length && run.length > 0) {
    warnings.push(
      `warning: limited multi-harness eval: running ${run.join(", ")} (wanted ${wanted.join(", ")})`,
    )
  }
  return { current, wanted, run, skipped, ownEvalOnly, warnings }
}

export type HostPlan = {
  host: Host
  argv: string[]
  env: NodeJS.ProcessEnv
  stdin: "null"
  notes: string[]
}

export function resolveOnPath(name: string): string | undefined {
  return Bun.which(name) ?? undefined
}

function commandExists(name: string): boolean {
  return Boolean(resolveOnPath(name))
}

export function cellEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env = { ...base }
  delete env.CLAUDECODE
  delete env.CLICOLOR_FORCE
  delete env.GH_FORCE_TTY
  env.NO_COLOR = "1"
  return env
}

/** Read-only cells must not mutate, delegate, or reach the network. */
export const CLAUDE_READ_ONLY_DENY = "Bash,Edit,Write,NotebookEdit,Task,Skill,WebFetch,WebSearch"

export function planHost(
  host: Host,
  opts: { cwd: string; prompt: string; promptFile: string; readOnly?: boolean },
): HostPlan {
  const env = cellEnv()
  const notes: string[] = []
  if (host === "claude") {
    notes.push("print mode ends when the model stops calling tools; not a sustained-watch harness")
    const argv = ["claude", "-p", opts.prompt, "--dangerously-skip-permissions", "--output-format", "text"]
    if (opts.readOnly) {
      // --allowedTools only pre-approves; under --dangerously-skip-permissions every
      // other tool stays callable, so the boundary has to be drawn by --disallowedTools.
      argv.push("--allowedTools", "Read,Glob,Grep", "--disallowedTools", CLAUDE_READ_ONLY_DENY)
      notes.push(`read-only: ${CLAUDE_READ_ONLY_DENY} disallowed`)
    }
    return { host, argv, env, stdin: "null", notes }
  }
  if (host === "codex") {
    notes.push("stdin must be /dev/null or exec blocks on 'Reading additional input from stdin'")
    notes.push("unset CLAUDECODE or a Claude-launched cell attests the wrong host")
    notes.push("transcript is on stderr; stdout is the final message only")
    // --sandbox read-only and --dangerously-bypass-approvals-and-sandbox contradict
    // each other; the bypass flag disables the sandbox the read-only arm depends on.
    const argv = ["codex", "exec"]
    if (opts.readOnly) {
      argv.push("--sandbox", "read-only")
      notes.push("read-only: --sandbox read-only, no approvals/sandbox bypass")
    } else {
      argv.push("--dangerously-bypass-approvals-and-sandbox")
    }
    argv.push("--skip-git-repo-check", "-C", opts.cwd, opts.prompt)
    return { host, argv, env, stdin: "null", notes }
  }
  notes.push("progress narration prints to stdout before the answer; grep for trailers, do not treat the whole file as the answer")
  const argv = [
    "grok",
    "--prompt-file",
    opts.promptFile,
    "--verbatim",
    "--cwd",
    opts.cwd,
    "--always-approve",
    "--disable-web-search",
  ]
  if (opts.readOnly) {
    argv.push("--deny", "Bash", "--deny", "Edit", "--deny", "Write")
    notes.push("read-only: Bash/Edit/Write denied")
  }
  return { host, argv, env, stdin: "null", notes }
}

export const TRAILER_NAMES = {
  files_read: "FILES_READ",
  actions: "ACTIONS",
  delegates: "DELEGATES_DISPATCHED",
} as const

export function wrapPrompt(opts: { skillDir: string; workspace: string; task: string }): string {
  return [
    `Read the skill at ${path.join(opts.skillDir, "SKILL.md")} first.`,
    `Resolve bundled references and scripts from that directory.`,
    `Do not read or use an installed plugin copy of this skill (not ~/.claude, ~/.grok, ~/.agents marketplace caches, or a plugin cache).`,
    `The project workspace is ${opts.workspace}. Stay inside it.`,
    ``,
    `Task:`,
    opts.task,
    ``,
    `When finished, end with these trailers on their own lines:`,
    `${TRAILER_NAMES.files_read}: <comma-separated paths you read>`,
    `${TRAILER_NAMES.actions}: <comma-separated mutations you performed, or none>`,
    `${TRAILER_NAMES.delegates}: <none or names>`,
  ].join("\n")
}
