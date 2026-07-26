---
name: ce-riffrec-feedback-analysis
description: Analyze Riffrec feedback captures from bundles or standalone recordings. Always load for `riffrec-*.zip`, `session.json` + `events.json` + `recording.webm` + `voice.webm` bundles, `.mp4`/`.mov`/`.webm` videos, `.m4a`/`.mp3`/`.wav` audio, or capture/share requests.
---

# Riffrec Feedback Analysis

Turn raw product feedback into structured evidence for downstream agents. This skill is the consumption side of [Riffrec](https://github.com/kieranklaassen/riffrec), a capture tool that records synchronized screen + voice + event sessions and emits a `riffrec-*.zip` bundle.

## Choose the path

Route to the matching reference based on the input. Read only that reference; do not load the others.

- **Setup** — user has no recording yet and asks how to install Riffrec, capture a session, or share feedback. Read `references/install-riffrec.md`.
- **Quick bug report** — input is a short recording (under ~60 seconds), the user describes a single specific issue, or asks for "quick", "small", or "just transcribe". Read `references/quick-bug-report.md`. Emit one concise bug report; skip the full artifact set and brainstorm handoff.
- **Extensive analysis** — input is a longer recording, contains multiple issues / requirements / workflow walkthroughs, or the user wants requirements or brainstorm material. Read `references/extensive-analysis.md`. Always continue into the `ce-brainstorm` skill.

When the input is ambiguous (e.g., a zip arrived without context), inspect the recording length and event count before choosing. If still unclear, ask the user which path applies before running anything heavy.

## Common rules

- Keep raw recordings, audio chunks, zip contents, session dumps, and extracted screenshots local-only by default. Do not commit `raw/` or `frames/` directories unless the user explicitly asks and privacy is acceptable.
- Text/metadata artifacts (requirements kickoff material, analysis summaries, problem analyses, source manifests) may be committed when they are needed for traceability and contain no sensitive data.
- Use repo-relative screenshot paths in any committed doc so later agents can open the evidence without absolute local paths.

**Native routing context.** Keep routing state as private `ce-routing-context/v1` control data, never as feedback, evidence, requirement, source mapping, artifact, or subagent text. Before the first native call, normalize applicable current-task, still-active session, provenance-bearing caller (at its recorded authority), and project-instruction intent under the host instruction hierarchy. Lower authority may fill only unset fields; conflicting equal-authority bindings stop before model invocation; incidental model or harness mentions are not intent. Reuse an inherited frozen context; otherwise freeze the first `resolve_batch` response. Every later, nested, or recovery request passes the exact full self-validating first-wave `snapshot` object as the `parent_snapshot` envelope; `parent_snapshot_id` may appear only when it matches that envelope. Never use ID-only lineage or reread live routing sources. Reuse the frozen role/instance bindings on recovery. Forward this state to nested CE skills without adding it to their product arguments.

**Native routing invariants.** The routing-batch gate in `references/extensive-analysis.md` runs only after the existing source-mapping mode and product-area roster are selected and before prompt assembly. The co-located `references/execution-routing.md` governs `ce-default`, unavailable selectors, policy, attempt finalization, and redacted receipts. Apply only model, effort, or route selectors supported by the existing host primitive. An unconfigured binding or `ce-default` uses the exact built-in arguments; an unsupported configured selector is unavailable and follows its declared policy, never prompt rewriting or typed-agent substitution. Keep prompt bytes and assets, tools, permission mode, read-only posture, roster, sequential/parallel scheduling, existing failure semantics, and the top-level orchestrator unchanged. A required-route failure prevents that source-mapper call; the unchanged owning failure semantics decide whether mapping stays inline or degrades. Group redacted successes by profile, class, source, and outcome; report each fallback, mismatch, or blocker separately.

## Analyzer entrypoint

All non-setup paths share the same analyzer, which ships in this skill's `scripts/` directory. The Bash tool's working directory is the user's project, not the skill directory, so a bare `scripts/<name>` path will not resolve. Invoke it by the skill's own absolute path: set `SKILL_DIR` to the directory you loaded this `ce-riffrec-feedback-analysis` SKILL.md from, in the same command (shell state does not persist between Bash calls):

```bash
SKILL_DIR="<absolute path of the directory containing this SKILL.md>";
python "$SKILL_DIR/scripts/analyze_riffrec_zip.py" /path/to/input
```

Accepted inputs: a Riffrec `.zip`, an `.mp4` / `.mov` / `.webm` video, an `.m4a` / `.mp3` / `.wav` audio file, or a meeting-notes `.md`. Use `--output-dir <dir>` to control where artifacts land. In repos with `docs/brainstorms/`, the default remains `docs/brainstorms/riffrec-feedback/` as a documented evidence/kickoff-artifact exception; it is not the durable `ce-brainstorm` output convention. The quick path overrides the output dir to a temp location so nothing pollutes the repo.

The Compound Engineering output format used by the extensive path is documented in `references/compound-engineering-feedback-format.md`.
