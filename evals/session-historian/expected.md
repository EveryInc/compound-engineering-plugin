# Expected outcomes

## Scenario: sparse-mismatch

The fake repo has 3 recent sessions, all about unrelated topics (frontend styles, docs cleanup, test setup). The dispatch asks about an auth-middleware crash that has no presence in any session.

The agent should:

1. Discover the 3 sessions via `ce-session-inventory`.
2. Apply the priority signals from Step 3:
   - Branch-match: 3 sessions, all on different branches that do not lexically overlap with `auth` / `middleware` / `crash` keywords.
   - CWD-match: same fake repo, so all 3 match — but no branch correlation.
   - Keyword fallback: invoke `ce-session-inventory --keyword auth,middleware,crash` (or similar) to filter content. Expected: 0 matches.
3. Return "no relevant prior sessions" without deep-diving.

### Pass criteria

- **Tool call count: <= 5** (1 inventory, 1 keyword filter, 0 deep-dives, plus possibly 1 repo-name resolution and 1 misc)
- **No `Bash grep` calls against session JSONL files** — the agent must use the `--keyword` mode, not roll its own grep
- **Wall time: under 60 seconds** for a sparse "no match" answer (a generous bound that should be met by any reasonable run)
- **Response contains "no relevant prior sessions" or equivalent** — does not fabricate findings

### Fail criteria

- Agent runs more than 8 tool calls (suggests it widened the search beyond the prescribed steps)
- Agent invokes `Bash` with `grep -l` on session JSONL files (replicates the original failure mode)
- Agent extracts more than 1 session via `ce-session-extract` (deep-dive on a session that should have been filtered out)
- Agent returns fabricated findings or claims relevance when none exists
