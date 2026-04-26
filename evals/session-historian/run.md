# Sparse-history eval — run procedure

This eval validates that `ce-session-historian` correctly returns "no relevant prior sessions" without deep-extracting any session, on a sparse-history scenario where the inventory contains 3 unrelated sessions.

## Procedure

Run from inside an active Claude Code session in this repo. The orchestrating agent (you, the one reading this) sets up fixtures, dispatches the historian, captures metrics, cleans up, and reports.

### 1. Set up fixtures

```bash
bash evals/session-historian/setup.sh
```

Captures `FIXTURE_DIR` and `FAKE_REPO_NAME` from stdout. The setup script generates 3 synthetic Claude Code session JSONL files in `~/.claude/projects/-tmp-eval-<FAKE_REPO_NAME>/`. Each has:

- A recent `mtime` (within the 7-day scan window)
- A `gitBranch` that does **not** lexically overlap with `auth` / `middleware` / `crash` / `session` / `token`
- User and assistant content about an unrelated topic (docs cleanup, marketing styles, snapshot tests)

### 2. Dispatch the historian — use the skill-creator pattern, not the typed agent

**Critical caveat:** plugin agent definitions in Claude Code load at session start and cache in memory. **Do not dispatch via `Agent({subagent_type: "compound-engineering:ce-session-historian"})`** — that path uses the cached definition and your repo edits will not be tested. See `../README.md` ("Critical caveat: agent definitions load at session start").

Use the skill-creator pattern instead: spawn a `general-purpose` subagent and inject the agent definition's full text from disk at dispatch time. Each subagent reads the latest content fresh.

```
Agent({
  subagent_type: "general-purpose",
  prompt: `You are acting as the ce-session-historian agent. Follow the full agent instruction set below verbatim — do NOT use any prior knowledge of how this agent has historically behaved.

---BEGIN ce-session-historian.agent.md---
<full content of plugins/compound-engineering/agents/ce-session-historian.agent.md>
---END---

Now execute this dispatch as if you are the ce-session-historian agent:

Pre-resolved context:
- Repo name: <FAKE_REPO_NAME>
- Git branch: fix/auth-middleware-crash

Time window: 7 days

Problem topic: a recent crash in the auth middleware where session-validation rejects valid tokens after a deploy.

Filter rule: Only surface findings directly relevant to this specific problem.

Output schema:
- What was tried before
- What didn't work
- Key decisions
- Related context`
})
```

Read the file fresh from `plugins/compound-engineering/agents/ce-session-historian.agent.md` immediately before each dispatch. Capture the wall-time start before the call and the wall-time end after.

### 3. Inspect the subagent log

The subagent's tool call sequence is captured at:

```
~/.claude/projects/<encoded-cwd>/<session-id>/subagents/agent-<agentId>.jsonl
```

The `agentId` is returned in the dispatch result. Find the log:

```bash
SUBAGENT_LOG=$(find "$HOME/.claude/projects/-Users-tmchow-Code-compound-engineering-plugin" -name "agent-<agentId>.jsonl")
```

Extract the tool calls:

```bash
python3 -c "
import json
with open('$SUBAGENT_LOG') as f:
    for line in f:
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue
        if obj.get('type') == 'assistant':
            for block in obj.get('message', {}).get('content', []):
                if block.get('type') == 'tool_use':
                    name = block.get('name')
                    inp = block.get('input', {})
                    if name == 'Skill':
                        print(f'Skill: {inp.get(\"skill\")} args={inp.get(\"args\", \"\")[:200]}')
                    else:
                        print(f'{name}: {json.dumps(inp)[:200]}')
"
```

### 4. Compare against `expected.md`

Pass criteria are in `expected.md`. The headline assertions:

- Tool call count <= 5 (target: 2 — inventory + `--keyword` filter)
- No `Bash grep` calls against session JSONL files
- Wall time under 60s
- Response contains "no relevant prior sessions" or equivalent
- Zero `ce-session-extract` invocations on this scenario

### 5. Clean up

```bash
bash evals/session-historian/cleanup.sh "$FIXTURE_DIR"
```

The cleanup script refuses to delete anything outside `~/.claude/projects/-tmp-eval-` to keep a typo from nuking real session data.

## Iteration

If pass criteria miss, iterate on `plugins/compound-engineering/agents/ce-session-historian.agent.md` (or the dispatch prompt in `plugins/compound-engineering/skills/ce-compound/SKILL.md`) and re-run. Because the skill-creator pattern reads the agent definition from disk at dispatch time, every iteration is testable in the same session.
