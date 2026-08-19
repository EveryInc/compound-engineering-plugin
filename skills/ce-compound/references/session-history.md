# Session history (Phase 1 step 4)

## Session context

Resolve two values at runtime with the shell tool before Phase 1 session-history filtering. Run each as its own command and read its exit status — a non-zero exit is a normal state here, not an error to route around:

- **Git branch** — run `git rev-parse --abbrev-ref HEAD`. Use the branch name to filter session history in Phase 1. If it returns `HEAD` (detached) or exits non-zero (not a git repo), skip branch filtering.
- **Repo root** — run `git rev-parse --show-toplevel`. Use it as the session-history repo filter in Phase 1. If it exits non-zero (not a git repo), fall back to the working directory.

#### 4. **Session History** (internal flow after launching the parallel block — automatic in Full mode, including non-interactive)
   - This is a two-stage probe: the cheap discovery+metadata pass below always executes, and the expensive extraction+synthesis executes only when the probe clears the relevance gate (see **Escalation gate** below).
   - Run session discovery, branch/keyword filtering, scan-window selection, deep-dive selection, and per-session extraction directly inside this skill using `scripts/session-history/`.
   - Read the skill-local synthesis prompt at `references/agents/session-historian.md`, then dispatch a generic subagent using that prompt content. Do not dispatch a standalone agent by type/name.

   **Session-history payload — keep tight.** A long, keyword-rich payload licenses widening. Use this shape:

   - **Session context** (only if the values resolved cleanly above; otherwise omit): repo name, current git branch.
   - **Time window**: explicit `7 days` unless the documented problem clearly spans a longer arc.
   - **Problem topic**: one sentence naming the concrete issue — error message, module name, what broke and how it was fixed. Not a paragraph; not a bullet list of related topics.
   - **Filter rule (one line)**: "Only surface findings directly relevant to this specific problem. Ignore unrelated work from the same sessions or branches."
   - **Output schema**:

     ```
     Structure your response with these sections (omit any with no findings):
     - What was tried before
     - What didn't work
     - Key decisions
     - Related context
     ```

   Do not append additional context blocks, exclusion lists, or topic-keyword bullets — verbose payloads give the session-history flow license to keep widening the search and rapidly compound wall time. If keyword search is needed, the internal flow owns that decision based on the topic.
   - Returns a structured digest, or `no relevant prior sessions`. Either is a valid final Phase 1 input, and the documentation gets written without session context when it is the latter.

   **Script resolution.** Set `SKILL_DIR` to the absolute path of the directory containing the SKILL.md you just read, and run the bundled scripts from `"$SKILL_DIR/scripts/session-history/"`. Set `SKILL_DIR` inline in each bash block below (shell state does not persist between commands). If the bundled scripts are genuinely not present on disk under `"$SKILL_DIR/scripts/session-history/"`, skip session history visibly with: "Session history bundled scripts were not found in this skill's directory; skipping the session-history probe for this run." Continue Phase 2 without session context.

   **Discovery pipeline.** Infer the scan window from the problem topic, starting with 7 days. Run discovery and metadata extraction:

   ```bash
   SKILL_DIR="<absolute path of the directory containing the SKILL.md you just read>";
   if [ -f "$SKILL_DIR/scripts/session-history/discover-sessions.sh" ] && [ -f "$SKILL_DIR/scripts/session-history/extract-metadata.py" ]; then
     PY="$(for c in python3 python py; do command -v "$c" >/dev/null 2>&1 && "$c" -c '' >/dev/null 2>&1 && { echo "$c"; break; }; done)"; [ -n "$PY" ] || { echo "no working Python 3 interpreter on PATH" >&2; exit 1; };
     REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd); REPO_NAME=$(basename "$REPO_ROOT"); SCAN_DAYS="7"; bash "$SKILL_DIR/scripts/session-history/discover-sessions.sh" "$REPO_NAME" "$SCAN_DAYS" --cwd "$REPO_ROOT" | tr '\n' '\0' | xargs -0 "$PY" "$SKILL_DIR/scripts/session-history/extract-metadata.py" --cwd-filter "$REPO_ROOT";
   else echo "Session history bundled scripts were not found in this skill's directory; skipping the session-history probe for this run."; fi
   ```

   Claude sessions live under `~/.claude/projects/` unless `CLAUDE_CONFIG_DIR` is set, in which case they live under that directory's `projects/`. Codex sessions live under `~/.codex/sessions/` unless `CODEX_HOME` is set, in which case they live under that directory's `sessions/`; `~/.agents/sessions/` is also scanned. Pi sessions are included when present under `~/.pi/agent/sessions/` (`PI_CODING_AGENT_DIR` / `PI_CODING_AGENT_SESSION_DIR` override), and oh-my-pi (`omp`) sessions under `~/.omp/agent/sessions/` (named profiles: `~/.omp/profiles/<name>/agent/sessions/`; XDG: `$XDG_DATA_HOME/omp/sessions` and `$XDG_DATA_HOME/omp/profiles/<name>/sessions`; `PI_CONFIG_DIR` / `PI_CODING_AGENT_DIR` / `PI_CODING_AGENT_SESSION_DIR` override). Claude, Codex, Pi, and oh-my-pi (`omp`) sessions carry a recorded `cwd` (Claude also has git branch; Pi/omp do not). `--cwd-filter` keeps a session when that cwd is the repo root, an ancestor of it, or a path inside it (path-component boundaries: `my-repo` vs `my-repo-old` do not match). Claude, Codex, Pi, and omp sessions with no recorded cwd are dropped. Cursor has no cwd and stays. Do not drop a Claude session because its project folder name lacks the repo basename — that is how Claude stores parent-started sessions. If `_meta.files_processed` is `0`, return `no relevant prior sessions`. If the first pass finds no relevant branch matches, or if processing Codex, Pi, or oh-my-pi (`omp`) sessions, derive 2-4 keywords from the topic and re-run metadata extraction with `--keyword K1,K2,...`. Keep at most 5 sessions across Claude Code, Codex, Cursor, Pi, and oh-my-pi (`omp`), ranked by branch match, keyword match count, file size over 30KB, and recency. Exclude the current session.

   **Escalation gate.** The discovery+metadata pass above is the cheap probe and always runs in Full mode. Escalate to the extraction and synthesis stages below **only** when at least one retained candidate clears the relevance bar: a current-branch match, or ≥2 topic-keyword matches. If no candidate clears the bar (including the `_meta.files_processed` is `0` case), stop here, record `no relevant prior sessions` as the session-history input, and skip extraction and synthesis. This gate is what keeps the always-on probe cheap — the expensive synthesis is paid for only when a prior session is genuinely relevant.

   **Extraction pipeline.** Create `SCRATCH=$(mktemp -d "${TMPDIR:-/tmp}/ce-compound-sessions-XXXXXX")`. For each selected session, write extracted content to scratch files:

   ```bash
   SKILL_DIR="<absolute path of the directory containing the SKILL.md you just read>";
   if [ -f "$SKILL_DIR/scripts/session-history/extract-skeleton.py" ]; then
     PY="$(for c in python3 python py; do command -v "$c" >/dev/null 2>&1 && "$c" -c '' >/dev/null 2>&1 && { echo "$c"; break; }; done)"; [ -n "$PY" ] || { echo "no working Python 3 interpreter on PATH" >&2; exit 1; };
     "$PY" "$SKILL_DIR/scripts/session-history/extract-skeleton.py" --output "$SCRATCH/<session-id>.skeleton.txt" < <session-file>;
   else echo "Session history bundled scripts were not found in this skill's directory; skipping the session-history probe for this run."; fi
   ```

   Use `extract-errors.py` selectively when dead ends or recurring errors are likely useful. Pass only the scratch file paths and metadata to the synthesis subagent.

   **Synthesis dispatch.** Build a generic subagent prompt containing:
   - the full content of `references/agents/session-historian.md`
   - `problem_topic`
   - `scratch_dir`
   - a `sessions` array with extracted file paths and metadata
   - the output schema above
   - the filter rule above

   The subagent reads only the scratch paths, **writes its prose findings to `{run_dir}/session-history.md`, and returns only that artifact path once the write is confirmed** (same #956 reliability rationale — session-history findings are long-form prose prone to summary-collapse). If `{run_id}` did not resolve or the artifact write failed, it returns the prose inline instead (per the inline-fallback rule above). If synthesis fails, note the failure and continue without session context.
