# Requirements: Test Suite Integration into Compound Engineering

---
date: 2026-04-14
topic: test-suite-compound-engineering-integration
---

## Problem Frame

The compound engineering workflow closes the loop on building features (brainstorm → plan → implement) but has no systematic test step. A Maestro-based test engine exists (`flutter_test_engine/`) and has proven capable of running 18 onboarding test cases on a real emulator — but 10/18 currently fail. The gaps fall into four buckets:

1. **Native system widgets break tests** — system time pickers and permission dialogs live below the Flutter accessibility layer; Maestro cannot tap their buttons, and the test generation prompt has no guidance on this boundary
2. **Test generation is flow-blind** — `generate_test_cases.md` produces tests without knowing the full app state graph, leading to missing `clearState` isolation and incomplete edge case coverage
3. **No CE integration** — the CE plugin has no rules requiring widget semantic keys, no skill for running tests, and no standard diagrams that feed test generation and planning together
4. **Diagrams are too coarse** — the current app diagram (see: existing Excalidraw file) is a flat, single-layer view showing features side by side with cross-feature arrows. It cannot serve as a reference for editing, AI context reduction, or test case generation. What is needed is a layered diagram system: one HLD for the app, and per-feature LLD diagrams at multiple architectural layers.

The desired end state: every new Flutter feature ships with a complete diagram set, a keys file, and a passing test suite — all generated and verified as part of the CE workflow. Diagrams reduce the context Claude needs to reason about a feature, directly cutting token cost and improving plan quality.

---

## Requirements

**App-Level HLD (High Level Design)**

- R1. A single app-level HLD diagram lives at `lib/architecture.excalidraw`. It shows every feature module as a named block, the core layer as a separate block, and cross-feature dependencies as labeled edges. It does NOT show internal widget or BLoC details — those live in feature-level LLD diagrams.
- R2. The HLD is composed from feature blocks: each feature's top-level node (Screen → Bloc → Repo chain) is referenced by the HLD without duplicating internal structure. When a feature diagram changes, the HLD remains valid because it only references the feature block boundary.
- R3. The HLD must be kept current as new features are added. The CE plugin rules must require HLD update as part of any new feature delivery.

**Feature-Level LLD Diagram Set**

Each feature gets a folder `docs/diagrams/<feature>/` containing up to five focused Excalidraw files. Each file covers exactly one architectural layer — not the whole feature at once.

- R4. **Widget structure diagram** (`ui-structure.excalidraw`) — the Flutter widget tree for each screen in the feature: parent widgets, child widgets, and composition relationships. No BLoC/state references. Used to plan UI implementation and verify widget key coverage.
- R5. **UI ↔ BLoC interaction diagram** (`ui-bloc.excalidraw`) — shows which UI components dispatch which events to which BLoC/Cubit, and which states the UI listens to. One diagram per feature. Used to verify event/state wiring and generate interaction test cases.
- R6. **BLoC/Cubit state flow diagram** (`bloc-flow.excalidraw`) — a state machine showing all states, transitions, events that trigger them, and which use cases each transition calls. Used to verify BLoC logic completeness and generate edge case tests.
- R7. **Data flow diagram** (`data-flow.excalidraw`) — end-to-end data path from UI action → BLoC event → use case → repository → API/local storage and back. Shows what data is passed at each boundary. Used to verify the full call chain and generate integration test cases.
- R8. **Repository layer flow** (`repo-flow.excalidraw`) — the repository and data source layer in isolation: which methods exist, which data sources they call, and how errors propagate. Used to plan repository implementation and verify data contracts.

**Diagram Conventions**

- R9. All diagrams use a consistent color coding across the entire project: blue = Screen/UI, purple = BLoC/Cubit, green = Repository/UseCase, yellow = Core services/external. This must be documented in a `docs/diagrams/CONVENTIONS.md` file so Claude and developers both use the same visual language.
- R10. Each diagram file must include a `docs/diagrams/<feature>/README.md` with one-line descriptions of each diagram, the feature's key screens, and links to the keys file and test cases file. This README is the entry point Claude reads when starting work on a feature.
- R11. Diagrams are living documents — they are updated when the feature changes, not after. The CE plugin rules must include: "before implementing a change that alters a component's boundaries or interactions, update the relevant diagram first."

**Diagrams as AI Context**

- R12. When `/ce:plan` or `/ce:work` is invoked for a feature, the skill must read the feature's diagram README and the relevant LLD files to build context before generating a plan. This replaces the need for Claude to re-derive architecture from source code on every session.
- R13. When `generate_test_cases.md` is used for a feature that has diagrams, the BLoC flow diagram and UI ↔ BLoC diagram are passed as FLOW context. Test cases must trace to specific state transitions in the BLoC flow diagram, not just to UI actions.

**Test Reliability**

- R14. `generate_test_cases.md` must list `clearState` as a required first step before every `launchApp`, with the explicit rule: "Every test must be fully independent — always start with `clearState` to wipe app state, then `launchApp`."
- R15. The prompt must document the testable boundary: Maestro interacts with Flutter-layer widgets only. System dialogs (time pickers, permission prompts, OS notifications) cannot be tapped. Test steps must stop at the Flutter layer.
- R16. For unavoidable system UI gates (e.g., alarm permission), the test design pattern is: assert the app's error/blocked state is visible before the gate, then document the dialog interaction as "manual verification only" in the test's description field.

**Native Widget Strategy**

- R17. New Flutter UI features should prefer in-app custom pickers over OS system dialogs, specifically to keep them within the Maestro-testable layer. This is a CE implementation guideline.
- R18. The keys file format (`keys_<feature>.json`) should support an optional `"native_boundaries"` field listing steps where a test intentionally stops at a system dialog, so the prompt generates the appropriate test design for those steps instead of attempting to tap system UI.

**Compound Engineering Integration**

- R19. The CE plugin rules (CLAUDE.md or a dedicated Flutter skill) must mandate that every new Flutter screen ships with: (a) a `<Feature>Keys` abstract class with `Key` constants, (b) `Semantics(identifier:)` on all interactive elements and key UI labels, and (c) a `product_requirements/keys_<feature>.json` file documenting those keys.
- R20. A `/ce:flutter-test` skill must exist in the CE plugin. It accepts a test cases file and keys file path, runs `flutter-test` against the currently installed debug build, and surfaces the pass/fail report inline without leaving the Claude Code session.
- R21. The CE implement/work workflow must treat test artifacts (keys file, test cases file) and the feature diagram set as first-class feature deliverables, generated or updated alongside code.

**User Flow Diagram Standard**

- R22. Every UI feature must include a user flow diagram (`docs/diagrams/<feature>/user-flow.excalidraw`): screens/states as nodes, user actions as directed edges, error and blocked states as explicit terminal or recovery nodes. This is distinct from the BLoC flow diagram (R6) — it models the user journey, not state machine internals.
- R23. The `generate_test_cases.md` prompt accepts PRD + KEYS + FLOW, where FLOW is a text description derived from the user flow diagram and BLoC flow diagram. This is the primary mechanism for flow-aware test generation.
- R24. The `/ce:brainstorm` skill must produce a user flow diagram description as part of its output for UI features.

**generate_test_cases.md Improvements**

- R25. When a FLOW section is provided, the prompt must generate test cases that cover all distinct paths through the flow graph (happy path, back navigation, error recovery), not just the primary success path.
- R26. The prompt must include guidance on generating test IDs that trace to specific flow transitions (e.g., TC005 = "Alarm window: wake start card → time picker appears"), making failures easier to trace back to the diagram.

---

## Success Criteria

- The onboarding test suite reaches 18/18 pass (or each remaining failure is explicitly documented as a known native boundary, not a bug)
- A new Flutter feature can go from `/ce:brainstorm` to a passing test suite without manual test debugging
- `/ce:flutter-test` surfaces pass/fail results without leaving Claude Code
- `generate_test_cases.md` with PRD + KEYS + FLOW produces a test suite where 90%+ of cases pass on first run
- When Claude starts work on a feature, reading `docs/diagrams/<feature>/README.md` + the LLD set provides enough context to plan the change without re-reading all source files from scratch
- The onboarding feature has a complete backfilled diagram set (all 5 types) as the reference implementation

---

## Scope Boundaries

- The `flutter_test_engine/` itself is not being replaced — only the prompt and CE integration are changing
- iOS is out of scope for now; Android (Maestro on emulator) is the only target platform
- Auto-discovery of widget keys from source code is future scope
- CI/CD pipeline integration (running tests on PR automatically) is future scope

---

## Key Decisions

- **Testable boundary is a design principle, not a workaround**: Tests stop at the Flutter layer by design. Attempting to drive OS dialogs would make tests platform-version-dependent and fragile.
- **Five diagram types, not one**: A single "architecture" diagram cannot serve five different audiences (widget composition, UI↔BLoC wiring, BLoC state machine, data flow, repo layer). Each layer gets its own diagram with its own level of detail.
- **HLD references features, does not duplicate them**: The app-level HLD is a composition of feature blocks, not a copy of their internals. This keeps the HLD stable when feature internals change.
- **Diagrams are updated before code changes, not after**: The diagram is the specification. Code changes that don't have a corresponding diagram update are incomplete.
- **User flow diagrams are the primary test generation input**: The BLoC flow diagram and user flow diagram together provide the coverage graph that `generate_test_cases.md` needs to produce exhaustive test suites rather than happy-path-only suites.
- **Keys file is the test contract**: The keys file is the shared contract between Flutter developer and test generator. It must be maintained alongside widget code as a first-class artifact.

---

## Dependencies / Assumptions

- Maestro `id:` field correctly matches Flutter `Semantics.identifier` values (verified in this project)
- The CE plugin CLAUDE.md can be updated with Flutter-specific rules without plugin architecture changes (assumed, not verified)
- Excalidraw files can be read and parsed by the AI for flow description extraction (unverified — deferred to planning)

---

## Outstanding Questions

### Resolve Before Planning
- None

### Deferred to Planning
- [Affects R20][Technical] How does `/ce:flutter-test` determine the target device — read from `app.device` in the test cases JSON, or prompt the user?
- [Affects R22, R24][Needs research] Can the existing `excalidraw-diagrams:diagram-reader` skill parse user flow diagrams (state/action format), or does a new skill variant need to be created?
- [Affects R4-R8][Needs research] The existing Excalidraw architecture diagram for the app (`lib/architecture.excalidraw`) is a flat single-layer view. Determine whether to retrofit it into the HLD standard or start fresh with the layered approach.
- [Affects R21][Technical] At which point in the CE work flow should test artifacts and diagrams be generated — during implementation or as a final post-implementation step?
- [Affects R1-R8][Technical] What is the migration path for existing features (onboarding, home, meals, etc.) to backfill the full LLD diagram set?

---

## Next Steps
`-> /ce:plan` for structured implementation planning
