# Mode + Side-Effect Matrix

This table centralizes which features are active in each mode, eliminating
the scattered "skip in headless" / "skip in lightweight" conditionals
throughout SKILL.md.

## Modes

| Mode            | When                         | User interaction       |
| --------------- | ---------------------------- | ---------------------- |
| **Interactive** | Default (no mode token)      | Questions at each gate |
| **Headless**    | `mode:headless` in arguments | None — automation-only |
| **Lightweight** | User selects option 2        | Single prompt only     |

## Feature Matrix

| Feature / Side-Effect                              |    Interactive    |     Headless      |     Lightweight     |
| -------------------------------------------------- | :---------------: | :---------------: | :-----------------: |
| Full vs Lightweight prompt                         |         ✓         |      skipped      |          —          |
| Session history opt-in                             |         ✓         |      skipped      |       skipped       |
| Phase 0.5 Auto Memory Scan                         |         ✓         |         ✓         |          ✓          |
| Phase 1: Parallel subagents                        |         ✓         |         ✓         |          ✓          |
| Phase 1: ce-sessions skill call                    |  ✓ (if opted in)  |      skipped      |       skipped       |
| Phase 2.1: Overlap assessment                      |         ✓         |         ✓         |       skipped       |
| Phase 2.2: Write doc                               |         ✓         |         ✓         |          ✓          |
| Phase 2.4: Vocabulary capture on CONCEPTS.md       | ✓ (create/update) | ✓ (create/update) |   ✓ (update-only)   |
| Phase 2.5: Selective refresh recommendation        |         ✓         |         ✓         |          ✓          |
| Discoverability Check                              |    ✓ (consent)    |  ✓ (silent edit)  | ✓ (tip-only output) |
| Phase 3: Optional enhancement (specialized agents) |         ✓         |      skipped      |       skipped       |
| validate-frontmatter.py                            |         ✓         |         ✓         |          ✓          |
| validate-schema.py                                 |         ✓         |         ✓         |          ✓          |
| check-duplicates.py                                |         ✓         |         ✓         |       skipped       |
| validate-concepts.py                               |  ✓ (if changed)   |  ✓ (if changed)   |   ✓ (if changed)    |
| Instruction-file edit (Discoverability)            |    ✓ (consent)    |    ✓ (silent)     | skipped (tip only)  |
| "What's next?" question                            |         ✓         |      skipped      |       skipped       |

## Key Rules

- **Headless forces Full mode** with session history disabled. The doc itself is
  identical to what an interactive Full run would produce.
- **Lightweight skips cross-reference and overlap detection.** It may create a
  doc that overlaps with an existing one. `ce-compound-refresh` will catch
  duplicates later.
- **Vocabulary capture is a side effect, not a decision** — the orchestrator
  performs it silently in all modes.
- **CONCEPTS.md creation/deferral:** Lightweight mode refines an existing
  `CONCEPTS.md` but defers file creation/seeding to a Full run.
