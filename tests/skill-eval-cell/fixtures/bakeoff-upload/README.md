# Bake-off upload fixture

Raw constraints for a live `ce-bakeoff` trial. Seed a new throwaway repository for each host invocation with only `BRIEF.md`, `AGENTS.md`, and the required skills below. Run each host from its own repository and retain its result and receipts there. Never reuse a prior run's repository as another run's input or run against the source checkout. No generated candidate or winner belongs in this fixture.

Copy the current `skills/ce-bakeoff/` and `skills/ce-pov/` directories to `.agents/skills/ce-bakeoff/` and `.agents/skills/ce-pov/` for Codex. For Claude, create an OS-temp plugin with a `.claude-plugin/plugin.json` manifest and both current skill directories under `skills/`; pass that directory with `--plugin-dir`. Bake-off requires `ce-pov` for its independent judge. This registers discovery without editing installed caches. Include other current neighboring skills when checking activation boundaries.

Use this user request:

> Use the ce-bakeoff skill to develop and choose an approach for BRIEF.md. Save the complete comparison and selected artifact to RESULT.md. Keep within the skill default budget.

Choose one host command per newly seeded repository (set `PLUGIN` to the temp plugin path and `REQUEST` to the user request above). The receipt filenames below are local to that invocation's repository:

```bash
env -u CLAUDECODE claude -p --plugin-dir "$PLUGIN" --permission-mode dontAsk --allowedTools 'Read,Write,Edit,Bash,Agent,Task,Skill' --setting-sources '' --strict-mcp-config --no-session-persistence --output-format stream-json --verbose "$REQUEST" > transcript.jsonl 2> stderr.log
env -u CLAUDECODE codex exec --ignore-user-config --enable multi_agent --skip-git-repo-check --json -s workspace-write "$REQUEST" > transcript.jsonl 2> stderr.log
```

Keep stdin closed. Neither command mutates user configuration. Record installed CLI versions and actual served models where receipts expose them. Codex 0.153.3's JSONL exec output omitted `collaboration.spawn_agent` events in this trial: inspect the exact newly created session's tool-call records for dispatch evidence; an agent's statement that candidates ran is insufficient. Those records may encrypt payloads, limiting independence audit. Claude stream output includes native `task_started` receipts and candidate prompts.

Grade actual dispatch, same-brief independence, returned artifacts, comparison/verification, authority, caller delivery, and budget. Document missing receipts and unexercised paths. A single run is smoke evidence, not the three-arm repeated promotion benchmark.
