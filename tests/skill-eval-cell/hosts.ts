/**
 * Headless host-CLI argv for skill eval cells.
 *
 * Gotchas from docs/solutions/skill-design/size-driven-skill-restructure.md
 * (Eval-harness gotchas, 2026-08-17). Do not invent flags; pin the invocation
 * that was measured to work.
 */
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

export const HOSTS = ["claude", "codex", "grok", "opencode"] as const
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
  // oh-my-pi copies CLAUDECODE=1 into every session, and omp is not an eval host.
  if (env.OMPCODE) return "unknown"
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
  if (env.OPENCODE_TERMINAL) return "opencode"
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
  // Only the default peer selection falls back to self. An explicit --hosts that is
  // unavailable must come back empty, or the run reports a pass for a harness it
  // never exercised.
  if (!opts.explicit && run.length === 0 && current !== "unknown" && onPath(current)) {
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
  // Each cell's CLI re-sets its own attestation markers; an inherited marker
  // from the launching harness makes the child attest as the wrong host.
  delete env.CLAUDECODE
  delete env.OMPCODE
  delete env.CODEX_SANDBOX
  delete env.CODEX_SANDBOX_NETWORK_DISABLED
  delete env.CODEX_SESSION_ID
  delete env.CODEX_THREAD_ID
  delete env.CODEX_CI
  delete env.GROK_AGENT
  delete env.GROK_SESSION_ID
  delete env.OPENCODE_TERMINAL
  delete env.CLICOLOR_FORCE
  delete env.GH_FORCE_TTY
  env.NO_COLOR = "1"
  return env
}

/** Read-only cells must not mutate, delegate, or reach the network. */
export const CLAUDE_READ_ONLY_DENY = "Bash,Edit,Write,NotebookEdit,Task,Skill,WebFetch,WebSearch"

/**
 * Drops the "user" source: ~/.claude/CLAUDE.md, rules, skills, agents, commands, and
 * settings.json (with its enabled plugins and hooks). The workspace's own CLAUDE.md still loads.
 */
export const CLAUDE_SETTING_SOURCES = ["--setting-sources", "project,local"]

/** A host's private user-level config: inside the run, outside the sealed hosts/ root, since it holds the auth link and host state. */
export const userConfigDir = (out: string, host: Host) => path.join(out, "user-config", host)

/** Codex rollouts for a run: its private home, or the operator's for runs from before that existed. */
export function codexSessionsRoot(out: string): string {
  const own = path.join(userConfigDir(out, "codex"), "codex-home", "sessions")
  return fs.existsSync(own) ? own : path.join(os.homedir(), ".codex", "sessions")
}

/**
 * A private CODEX_HOME, so the operator's AGENTS.md, config.toml (plugins, MCP servers,
 * provider), and $CODEX_HOME/skills stay out. Codex also reads user skills from
 * $HOME/.agents/skills, which only a [[skills.config]] path entry can switch off.
 * auth.json is symlinked, never copied: Codex rewrites it in place, so a token refresh
 * lands in the operator's file and none persists in the run directory. auth.lock is
 * linked so that refresh still serializes with the operator's own Codex processes.
 */
export function privateCodexHome(
  dir: string,
  base: NodeJS.ProcessEnv = process.env,
): { env: NodeJS.ProcessEnv; notes: string[] } {
  const source = base.CODEX_HOME || path.join(os.homedir(), ".codex")
  fs.mkdirSync(dir, { recursive: true })
  const linked = ["auth.json", "auth.lock"].filter((name) => {
    const target = path.join(source, name)
    const link = path.join(dir, name)
    if (!fs.existsSync(target)) return false
    if (!fs.lstatSync(link, { throwIfNoEntry: false })) fs.symlinkSync(target, link)
    return true
  })
  const notes = [
    linked.includes("auth.json")
      ? `private CODEX_HOME ${dir}; ${linked.join(" and ")} linked from ${source}`
      : `private CODEX_HOME ${dir}; no ${path.join(source, "auth.json")}: the cell has no file login`,
  ]
  const userSkills = skillFiles(path.join(base.HOME || os.homedir(), ".agents", "skills"))
  if (userSkills.length) {
    const entries = userSkills.map((p) => `[[skills.config]]\npath = ${JSON.stringify(p)}\nenabled = false\n`)
    fs.writeFileSync(path.join(dir, "config.toml"), entries.join("\n"))
    notes.push(`${userSkills.length} user skill path(s) under ~/.agents/skills disabled`)
  }
  return { env: { CODEX_HOME: dir }, notes }
}

function skillFiles(root: string, depth = 0, seen = new Set<string>()): string[] {
  let real: string
  try {
    real = fs.realpathSync(root)
  } catch {
    return []
  }
  if (seen.has(real) || depth > 6) return []
  if (!fs.statSync(real).isDirectory()) return []
  seen.add(real)
  const found: string[] = []
  for (const entry of fs.readdirSync(real, { withFileTypes: true })) {
    const p = path.join(root, entry.name)
    if (entry.name === "SKILL.md") {
      found.push(p)
      try {
        const resolved = fs.realpathSync(p)
        if (resolved !== p) found.push(resolved)
      } catch {}
    } else if (entry.isDirectory() || entry.isSymbolicLink()) {
      found.push(...skillFiles(p, depth + 1, seen))
    }
  }
  return found
}

export function planHost(
  host: Host,
  opts: {
    cwd: string
    prompt: string
    promptFile: string
    userConfigDir: string
    readOnly?: boolean
    reasoningEffort?: string
  },
): HostPlan {
  const env = cellEnv()
  const notes: string[] = []
  if (host === "claude") {
    notes.push("print mode ends when the model stops calling tools; not a sustained-watch harness")
    notes.push("user settings, CLAUDE.md, skills, and plugins skipped; auto memory off")
    // Auto memory is outside the setting sources and would read and write the operator's ~/.claude/projects.
    env.CLAUDE_CODE_DISABLE_AUTO_MEMORY = "1"
    const argv = ["claude", "-p", opts.prompt, "--dangerously-skip-permissions", "--output-format", "text", ...CLAUDE_SETTING_SOURCES]
    if (opts.reasoningEffort) argv.push("--effort", opts.reasoningEffort)
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
    const home = privateCodexHome(path.join(opts.userConfigDir, "codex-home"), env)
    Object.assign(env, home.env)
    notes.push(...home.notes)
    // --sandbox read-only and --dangerously-bypass-approvals-and-sandbox contradict
    // each other; the bypass flag disables the sandbox the read-only arm depends on.
    const argv = ["codex", "exec"]
    if (opts.readOnly) {
      argv.push("--sandbox", "read-only")
      notes.push("read-only: --sandbox read-only, no approvals/sandbox bypass")
    } else {
      argv.push("--dangerously-bypass-approvals-and-sandbox")
    }
    if (opts.reasoningEffort) argv.push("-c", `model_reasoning_effort=${opts.reasoningEffort}`)
    argv.push("--skip-git-repo-check", "-C", opts.cwd, opts.prompt)
    return { host, argv, env, stdin: "null", notes }
  }
  if (host === "opencode") {
    // OpenCode 2.x routes a plain `run` through its background service, which
    // ignores this process's OPENCODE_CONFIG_CONTENT deny; --standalone keeps it.
    const argv = ["opencode", "run", "--standalone", opts.prompt]
    // Always disable project config: a fixture's .opencode/{plugins,agents} load
    // as trusted runtime before wrapPrompt's "don't use project .opencode" can
    // apply, contaminating the eval (and, in a reviewed repo, overriding the deny).
    // Only the permission overlay and --auto posture vary between read-only and write.
    env.OPENCODE_DISABLE_PROJECT_CONFIG = "1"
    if (opts.readOnly) {
      // Omitting --auto is not read-only (defaults are permissive); the deny
      // overlay merges after project config, so it wins on last-match.
      env.OPENCODE_CONFIG_CONTENT = '{"permission":{"edit":"deny","bash":"deny","webfetch":"deny","task":"deny"}}'
      notes.push("read-only: project config disabled; overlay denies edit, bash, webfetch, task")
    } else {
      argv.push("--auto")
      notes.push("write: project config disabled so only the extracted skill ref is exercised")
    }
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
  // Without this the run inherits the operator's ~/.grok default, which can be xhigh.
  if (opts.reasoningEffort) argv.push("--reasoning-effort", opts.reasoningEffort)
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

export function wrapPrompt(opts: {
  skillDir: string
  workspace: string
  task: string
  /** Skills the main skill may invoke, by name, with the directory holding each copy. */
  companions?: { name: string; dir: string }[]
}): string {
  const companions = opts.companions ?? []
  return [
    `Read the skill at ${path.join(opts.skillDir, "SKILL.md")} first.`,
    `Resolve bundled references and scripts from that directory.`,
    `Do not read or use an installed plugin copy of this skill (not ~/.claude, ~/.grok, ~/.agents, ~/.config/opencode, project .opencode, or a plugin cache).`,
    ...companions.map(
      (c) =>
        `When it tells you to invoke the \`${c.name}\` skill, invoke it by reading ${path.join(c.dir, "SKILL.md")} and following it, resolving its references from that directory. Do not use an installed plugin copy of \`${c.name}\`.`,
    ),
    `The project workspace is ${opts.workspace}. Stay inside it, except for private scratch files the skill tells you to create under the system temp directory.`,
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
