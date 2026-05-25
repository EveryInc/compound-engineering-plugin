/**
 * Content transformation utilities for the Grok target.
 *
 * This module handles the mechanical mappings from Claude Code content to
 * Grok-compatible content. The goal is high fidelity while preserving the
 * source skills as the single source of truth.
 *
 * Key areas covered:
 * - Tool name normalization (via CLAUDE_TO_GROK_TOOLS table)
 * - Task / spawn_subagent dispatch rewriting with recommended injection pattern
 * - allowed-tools normalization
 * - Path and variable rewriting (including defensive ${VAR:-.} patterns)
 * - Script invocation cleanup
 * - Conditional Grok + CE agent port note injection
 * - Grok-specific specialization of portable date-stamping rules (ce-plan / brainstorm templates)
 *
 * This file is the right place to evolve the transform as real usage feedback
 * arrives (especially during dogfood in U8). Grok-specific syntax and guidance
 * lives only here — never in the universal source skills under plugins/compound-engineering/.
 */

export type TransformKind = "agent" | "command" | "skill"

export interface TransformOptions {
  kind?: TransformKind
  /** When true, we are transforming content that will be used inside a skill reference */
  insideSkillReference?: boolean
}

// ---------------------------------------------------------------------------
// Explicit Tool Mapping (Claude → Grok)
// ---------------------------------------------------------------------------

/**
 * Mapping of Claude tool names (as they appear in source) to their Grok equivalents.
 * This is the authoritative table for tool rewriting in the Grok target.
 */
export const CLAUDE_TO_GROK_TOOLS: Record<string, string> = {
  // File system & search (very common in CE skills)
  Read: "read_file",
  Glob: "Glob",
  Grep: "grep",
  LS: "list_dir", // best effort

  // Editing
  Edit: "search_replace",
  MultiEdit: "search_replace",
  Write: "write",

  // Execution & shell (Grok canonical names observed in practice + dogfood)
  Bash: "run_terminal_command",
  "BashOutput": "run_terminal_command",

  // Task / Delegation (core of CE agent usage)
  Task: "spawn_subagent",
  Agent: "spawn_subagent",

  // User interaction & blocking questions
  AskUserQuestion: "ask_user_question",
  request_user_input: "ask_user_question", // Codex equivalent

  // Todo / task tracking
  TodoWrite: "todo_write",
  TodoRead: "todo_read",
  TaskCreate: "todo_write",
  TaskUpdate: "todo_write",
  TaskList: "todo_read",

  // Web / external
  WebFetch: "web_fetch",
  WebSearch: "web_search",

  // Other common ones
  "mcp__*": "mcp tools (via MCP server)",
};

/**
 * Tools that are generally safe to map to a wildcard or broad equivalent in Grok.
 * Used when we encounter broad tool grants in source.
 */
export const BROAD_CLAUDE_TOOLS = ["*", "all", "Bash", "Read", "Edit", "Write"];

// ---------------------------------------------------------------------------
// Main Transform
// ---------------------------------------------------------------------------

export function transformContentForGrok(input: string, options: TransformOptions = {}): string {
  let output = input;

  // 1. Path rewriting (Claude → Grok layout)
  output = output.replace(/\.claude\//g, ".grok/");
  output = output.replace(/~\/\.claude\//g, "~/.grok/");

  // Preserve the defensive ${VAR:-.} pattern used across CE skills.
  // For Grok we recommend GROK_PLUGIN_ROOT when available, but keep the fallback working.
  output = output.replace(/\$\{CLAUDE_SKILL_DIR:-\.\}/g, "${GROK_PLUGIN_ROOT:-.}");
  output = output.replace(/\$\{CLAUDE_PLUGIN_ROOT:-\.\}/g, "${GROK_PLUGIN_ROOT:-.}");

  // 1b. Grok-specific specialization of portable date-stamping instructions (U2 portability fix).
  // The source of truth in ce-plan/SKILL.md and ce-brainstorm templates uses harness-agnostic
  // language. Only Grok output receives the precise `run_terminal_command` + `command:` form.
  output = rewriteDateStampingInstructions(output);

  // 2. Task / Agent dispatch rewriting (most important fidelity area)
  output = rewriteTaskAndAgentCalls(output);

  // 3. Tool name normalization (in prose and in allowed-tools lists)
  output = rewriteToolReferences(output);

  // 4. Agent reference cleanup + cross-skill references
  output = output.replace(/@([a-zA-Z0-9_-]+)/g, "@$1");

  // Normalize references to other CE skills (e.g. "load the `ce-doc-review` skill")
  output = output.replace(/`?(ce-[a-z0-9-]+)`? skill/gi, "`$1` skill");

  // 5. Basic allowed-tools normalization (very common in skills)
  output = normalizeAllowedTools(output);

  // 6. Rewrite common script invocation patterns (preserve intent, improve Grok ergonomics)
  output = rewriteScriptInvocations(output);

  // 7. Optional: inject a minimal Grok port note for skills that heavily use delegation
  if (options.kind === "skill" && shouldInjectGrokAgentNote(output)) {
    if (!output.includes("Grok + Compound Engineering agents")) {
      output = `${GROK_AGENT_INJECTION_NOTE}\n\n${output}`;
    }
  }

  return output.trim();
}

/**
 * Rewrites common bash script invocations that use the CLAUDE_SKILL_DIR pattern
 * into a form that works well on Grok while preserving the defensive fallback style.
 */
function rewriteScriptInvocations(content: string): string {
  // Common pattern: bash "${CLAUDE_SKILL_DIR:-.}/scripts/xxx.sh" args...
  // We already rewrote the variable above; this cleans up the surrounding text slightly for readability.
  return content.replace(
    /bash\s+["']?\$\{GROK_PLUGIN_ROOT:-\.\}\/scripts\/([^"'\s]+)["']?/g,
    (match, scriptName) => {
      // Keep it as a clear relative-style call with the Grok root
      return `bash "\${GROK_PLUGIN_ROOT:-.}/scripts/${scriptName}"`;
    }
  );
}

/**
 * Specializes portable date-stamping instructions (from ce-plan and ce-brainstorm templates)
 * into the precise Grok form using `run_terminal_command` + explicit `command:` shape.
 *
 * This lives in the transform layer (not source skills) to keep the universal CE skills
 * portable across all targets per the 2026-05-25 Grok target requirements and AGENTS.md.
 */
function rewriteDateStampingInstructions(content: string): string {
  let result = content;

  // The portable phrasing we expect in source (after U2 revert). Match the distinctive
  // instruction block in ce-plan/SKILL.md Phase 3.1 and emit the Grok-dogfood-ready form.
  // This is intentionally high-specificity so only the date rule is affected.
  const portableDateRule = /obtain the \*actual current calendar date\* by running the appropriate terminal or shell execution command for your current harness\. The conventional form is `date \+%Y-%m-%d` \(adapt the exact tool name and parameter shape to the harness you are executing under\)\./g;

  const grokDateRule = 'obtain the *actual current calendar date* by running a shell command via your terminal execution tool. Preferred: use `run_terminal_command` with `command: "date +%Y-%m-%d"` (or the exact equivalent for the installed Grok harness).';

  result = result.replace(portableDateRule, grokDateRule);

  // Also handle the shorter template form used in ce-brainstorm references/requirements-capture.md
  // (the IMPORTANT comment that gets embedded into generated brainstorm docs).
  const portableTemplate = /the harness-appropriate date command \(e\.g\. `date \+%Y-%m-%d`\)/g;
  const grokTemplate = 'the harness-appropriate date command (for Grok: `run_terminal_command` with `command: "date +%Y-%m-%d"`)';

  result = result.replace(portableTemplate, grokTemplate);

  return result;
}

// ---------------------------------------------------------------------------
// Dispatch Rewriting
// ---------------------------------------------------------------------------

/**
 * Generates consistent Grok agent injection guidance text.
 */
function makeGrokAgentInjection(agentName: string, extraDetails = ""): string {
  const base = `Load the agent definition using read_file with path "\${GROK_PLUGIN_ROOT}/agents/${agentName}.md" (or the installed plugin location) and prepend its full content (frontmatter + body) to the prompt passed to spawn_subagent. Use subagent_type "general-purpose" (or "explore"/"plan" for read-only work).`;
  return extraDetails ? `${base} ${extraDetails}`.trim() : base;
}

function rewriteTaskAndAgentCalls(content: string): string {
  let result = content;

  // Strategy: Specific patterns first (most common in real CE skills), then generic fallbacks.
  // Goal: Produce clear, consistent guidance that tells the Grok user exactly how to load ce-* agents.

  // 1. Explicit "Task ce-foo(...)" — original Claude delegation style
  result = result.replace(
    /Task\s+(ce-[a-zA-Z0-9_-]+)\s*\(([^)]*)\)/g,
    (_match, agentName, args) => {
      const cleanArgs = args ? args.trim() : "";
      return makeGrokAgentInjection(agentName, cleanArgs ? `Task description: ${cleanArgs}` : "");
    }
  );

  // 2. "spawn ... ce-foo (sub)agent" or "dispatch the ce-foo subagent" (very common in CE skills)
  result = result.replace(
    /(?:spawn|dispatch)\s+(?:the\s+)?ce-([a-zA-Z0-9_-]+)\s*(?:sub)?agent[^.]*?(?:with|using|prompt:)?\s*([^.]*?)(?=\.|$)/gi,
    (_match, agentName, rest) => {
      const cleanRest = rest ? rest.trim() : "";
      return makeGrokAgentInjection(`ce-${agentName}`, cleanRest ? `Details: ${cleanRest}` : "");
    }
  );

  // 3. "Agent tool" or "use the Agent tool" dispatching ce-* agents/reviewers
  result = result.replace(
    /(?:Use\s+the\s+)?Agent\s+tool[^.]*?ce-([a-zA-Z0-9_-]+)[^.]*?(?:in parallel|dispatch)?/gi,
    (_match, agentName) => {
      return `Use spawn_subagent after loading the ce-${agentName} agent definition with read_file("\${GROK_PLUGIN_ROOT}/agents/ce-${agentName}.md") (prepend full content to prompt).`;
    }
  );

  // 4. Table-style mentions of ce-*-reviewer / ce-*-agent (very dense in ce-code-review etc.)
  result = result.replace(
    /\b(?:spawn|dispatch|use)\s+ce-([a-zA-Z0-9_-]+)(?:-reviewer|-agent|-researcher)?\b/gi,
    (_match, base) => {
      const fullName = base.startsWith("ce-") ? base : `ce-${base}`;
      return makeGrokAgentInjection(fullName);
    }
  );

  // 5. Generic fallback for any remaining "Task <name>" style
  result = result.replace(
    /\bTask\s+([a-zA-Z0-9_-]+)\s*\(([^)]*)\)/g,
    (_match, agentName, args) => {
      const cleanArgs = args ? args.trim() : "";
      return `Dispatch via spawn_subagent (subagent_type based on the task). ${cleanArgs ? `Args: ${cleanArgs}` : ""}`.trim();
    }
  );

  return result;
}

// ---------------------------------------------------------------------------
// Tool Rewriting
// ---------------------------------------------------------------------------

function rewriteToolReferences(content: string): string {
  let result = content;

  // Replace known tool mentions in prose
  for (const [claudeTool, grokTool] of Object.entries(CLAUDE_TO_GROK_TOOLS)) {
    // Word boundary aware replacement, case sensitive on the Claude side
    const regex = new RegExp(`\\b${escapeRegExp(claudeTool)}\\b`, "g");
    result = result.replace(regex, grokTool);
  }

  return result;
}

function normalizeAllowedTools(content: string): string {
  // Handle common patterns like `allowed-tools: Bash, Read, Edit, Task`
  return content.replace(
    /allowed-tools:\s*([^\n]+)/g,
    (_match, toolsList) => {
      const tools = toolsList
        .split(/[, ]+/)
        .map((t: string) => t.trim())
        .filter(Boolean)
        .map((t: string) => CLAUDE_TO_GROK_TOOLS[t] || t);

      return `allowed-tools: ${tools.join(", ")}`;
    }
  );
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------------------------------------------------------------------------
// Port Note / Injection Guidance
// ---------------------------------------------------------------------------

/**
 * Recommended note that skills using ce-* agents should include (or have injected).
 * We prefer keeping this guidance in docs/specs/grok.md and only emitting a minimal
 * version when we detect heavy use of Task / Agent patterns.
 *
 * U3 readiness pass (2026-05-20) findings + policy decision:
 * - Official source (plugins/compound-engineering/skills/** and agents/) contains ZERO Grok/port notes (clean).
 * - Prior one-off conversion (installed copy) sprinkled verbose "load agent definition and inject into spawn_subagent prompt"
 *   annotations on dozens of ce-*-reviewer lines inside tables + refs -- this is the noise to avoid.
 * - Policy: Single source of truth remains the Claude-authored skills. Transform emits *minimal* central note only for
 *   detected heavy delegation. Full recipe, tool table, env vars, agent loading, differences, and usage examples live in
 *   the forthcoming docs/specs/grok.md (U7). No per-skill duplication. Existing installed noise is legacy and will be
 *   replaced on re-conversion with the official target.
 * - shouldInject + rewriteTaskAndAgentCalls were expanded during readiness to cover real ce-code-review / ce-plan
 *   dispatch language (spawn/dispatch/Agent tool of ce-*-reviewer etc.).
 */
export const GROK_AGENT_INJECTION_NOTE = `
> **Grok + Compound Engineering agents**: Custom \`ce-*\` agents are provided as files under \`agents/\` in the installed plugin.
> Load the relevant agent definition with \`read_file\` (using \`GROK_PLUGIN_ROOT\`) and prepend it to the prompt
> passed to \`spawn_subagent\`. See \`docs/specs/grok.md\` for the current recommended pattern.
`.trim();

/**
 * Returns true if the content appears to make heavy use of subagent delegation.
 * Used to decide whether to inject the Grok agent guidance note.
 */
export function shouldInjectGrokAgentNote(content: string): boolean {
  const delegationPatterns = [
    /\bTask\s+ce-/i,
    /\bAgent\s*\(/,
    /spawn_subagent/i,
    /spawn.*ce-/i,
    /dispatch.*(ce-|subagent|agent)/i,
    /ce-(plan|work|code-review|brainstorm|debug|resolve|worktree)/i,
    /ce-[\w-]*-(reviewer|agent|researcher|native)/i,  // heavy CE agent dispatch in review/plan skills
  ];
  return delegationPatterns.some((re) => re.test(content));
}

