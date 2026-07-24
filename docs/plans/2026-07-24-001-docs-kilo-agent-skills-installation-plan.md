---
title: Kilo Agent Skills Installation Documentation - Plan
type: docs
date: 2026-07-24
topic: kilo-agent-skills-installation
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Kilo Agent Skills Installation Documentation - Plan

## Goal Capsule

- **Objective:** Help Kilo Code users install the official Compound Engineering skill bundle through Kilo's native Agent Skills support, without implying that CE ships a Kilo runtime plugin or has proven full behavioral parity with Claude Code or Codex.
- **Product authority:** The Product Contract below, bootstrapped from the user's request and the session-settled distribution decisions in KTD1 and KTD2.
- **Stop conditions:** Stop and surface a blocker if the documented command no longer installs directly from `EveryInc/compound-engineering-plugin`, Kilo no longer discovers the installed skills, or safe wording would require claiming unverified runtime parity.
- **Execution profile:** Documentation-only changes to the public install guide and the repository's native-install strategy record. No plugin code, converter, manifest, skill content, or release metadata changes.
- **Tail ownership:** Follow the repository's normal pull-request path. Do not bump versions or write release notes for this docs-only change.

## Product Contract

### Summary

Kilo Code implements the Agent Skills format already used by Compound Engineering. The independent Skills CLI can fetch the official CE repository, install every current skill for its Kilo target, and make those skills discoverable to Kilo globally. The README should expose this verified compatibility path while preserving three boundaries: it is not Kilo's JavaScript/TypeScript runtime-plugin mechanism, it does not depend on the separate personal `agent-skills-kit` project, and successful installation/discovery does not prove every CE workflow behaves identically across hosts.

### Problem Frame

The README lists many secondary hosts under “More Install Options,” but it does not mention Kilo. A Kilo user can already install CE through native Agent Skills, yet the missing documentation makes an upstream Kilo runtime feature or a separate distribution project appear necessary.

The existing sentence “Everything here is equally supported” is too broad for adding Kilo. Current evidence proves source provenance, complete skill-tree installation, and Kilo discovery. Kilo does not currently enforce CE's `disable-model-invocation` frontmatter, and several CE interaction adapters do not name Kilo's `question` tool, so the documentation must not turn installation evidence into a parity claim.

### Actors

- **A1. Kilo user:** Wants CE skills available across Kilo projects with one understandable command.
- **A2. CE maintainer:** Needs public installation claims that remain traceable to the official repository and current platform contracts.

### Requirements

#### Discoverability and terminology

- **R1.** Add Kilo Code to the README's “Another editor or CLI?” pointer so users can discover the detailed route under “More Install Options.”
- **R2.** Add a `### Kilo Code` subsection that calls the mechanism a native Agent Skills installation through the independent Skills CLI, never a CE Kilo runtime plugin.
- **R3.** Narrow the “Everything here is equally supported” sentence so it promises supported installation paths while allowing host capability and invocation differences documented by each subsection.

#### Installation and activation

- **R4.** Document one global command that fetches directly from `EveryInc/compound-engineering-plugin`, quotes the all-skills wildcard, and targets Kilo explicitly: `npx skills add EveryInc/compound-engineering-plugin --skill '*' --agent kilo --global`.
- **R5.** State that the command requires Node.js/npm for `npx`, while CE's own Bun converter remains unnecessary for normal Kilo installation.
- **R6.** Complete the user journey with `/reload` or a new Kilo session, an availability check for `ce-plan`, and a natural-language example such as “Use the ce-plan skill to plan this change.”
- **R7.** Do not document update or removal commands until a CE-scoped lifecycle flow is verified; broad global commands could affect unrelated skills.

#### Provenance and support boundaries

- **R8.** Keep the public route sourced only from the official CE repository; do not mention or depend on the separate personal `agent-skills-kit` project.
- **R9.** State the Kilo-specific limitation narrowly: installation and discovery are verified, but Kilo currently treats CE's manual-only metadata as advisory and full cross-host behavioral parity is not claimed.
- **R10.** Update `docs/solutions/integrations/native-plugin-install-strategy.md` so the internal support matrix records the Kilo Agent Skills route, its external transport, its current compatibility-path dependency, and the no-plugin/no-converter decision.

### User Flow

1. The user finds Kilo in the README's secondary-host pointer and opens “More Install Options.”
2. The user reviews the Skills CLI's installation summary and runs the R4 command globally.
3. The user runs `/reload` or starts a new Kilo session.
4. The user asks Kilo whether `ce-plan` is available, then invokes it by name in natural language.
5. If discovery fails, the user follows the linked Kilo Skills troubleshooting guidance instead of switching to `kilo plugin`.

### Acceptance Examples

- **AE1. Covers R4-R6.** A Kilo user with Node.js/npm runs the documented command, reloads Kilo, confirms `ce-plan` is available, and asks Kilo to use it without cloning CE or running the CE Bun converter.
- **AE2. Covers R2, R8.** A reader understands that the Skills CLI transports skill directories directly from the official CE repository; no Kilo runtime plugin or `agent-skills-kit` dependency is implied.
- **AE3. Covers R3, R9.** A reader sees that Kilo installation/discovery is supported while host-specific behavior can differ, and finds no claim of Claude Code or Codex parity.
- **AE4. Covers R4, R7.** The command preserves the interactive installation review because it omits `--yes`, and the section contains no broad update or wildcard removal command.

### Success Criteria

- Kilo is discoverable from the README's top secondary-host pointer.
- The Kilo subsection gives one verified global install -> reload -> verify -> invoke path.
- Public wording distinguishes Agent Skills, the Skills CLI, and Kilo runtime plugins.
- The README and the native-install strategy record agree on the support level and known compatibility seam.
- No public claim depends on a personal repository, a fixed skill count, or hardcoded tool versions.

### Scope Boundaries

#### In Scope

- `README.md` navigation, support-language correction, and Kilo installation subsection.
- `docs/solutions/integrations/native-plugin-install-strategy.md` metadata, support-matrix row, and concise Kilo strategy section.
- Verification evidence for the exact global command, source identity, complete skill tree, and Kilo discovery.

#### Non-Goals

- A Kilo JavaScript/TypeScript runtime plugin, npm package, native manifest, marketplace submission, or converter target.
- Changes to CE skill prose, tool adapters, `disable-model-invocation`, or Kilo's `question`-tool compatibility.
- Full workflow-by-workflow parity certification.
- Public installation through `agent-skills-kit`.
- Update, removal, collision-resolution, or project-scoped installation documentation.

## Planning Contract

### Key Technical Decisions

- **KTD1. Use Kilo's native Agent Skills surface with the independent Skills CLI as transport.** `(session-settled: user-approved — chosen over a Kilo runtime plugin: the documented runtime-plugin contract exposes JavaScript/TypeScript hooks rather than a skill-bundle distribution contract, while native Agent Skills already load CE's source format.)` This implements R2, R4, and R6 without depending on a new upstream Kilo feature.

- **KTD2. Source the public path directly from `EveryInc/compound-engineering-plugin`.** `(session-settled: user-directed — chosen over routing users through the personal agent-skills-kit project: public CE installation must have unambiguous official provenance and must not inherit a separate distributor's pinning, overlays, or ownership rules.)` This governs R4 and R8.

- **KTD3. Keep the public command interactive by omitting `--yes`.** Skills CLI 1.5.20 uses `--yes` to skip confirmation, including overwrite review for same-named skills. The one-command path remains simple without suppressing that safety seam. The quoted `'*'` and explicit `--agent kilo --global` flags are load-bearing.

- **KTD4. Promise installation and discovery, not slash-command or behavioral parity.** Kilo's official Skills documentation guarantees explicit invocation by naming the skill in natural language. It also documents reload/session discovery. This is the durable public contract; live or source-level slash exposure is not needed for onboarding and is more likely to drift.

- **KTD5. Correct the shared support sentence instead of hiding the caveat only inside Kilo's subsection.** “Everything here is equally supported” would make R9 internally contradictory. Reframe the section as supported installation paths whose host capabilities and invocation syntax vary as noted, then keep the Kilo limitation local and concrete.

- **KTD6. Record Kilo in the native-install strategy without promoting it to a runtime-plugin surface.** The strategy already includes skill-oriented paths such as Cline. A Kilo row and section can preserve the external Skills CLI dependency, current `.kilocode/skills` compatibility seam, and verification date without adding a provider spec or release surface.

- **KTD7. Use live acceptance evidence rather than a brittle README-content test.** No existing test owns the secondary-host list or Kilo install prose. The meaningful regression is that the exact command still installs the official tree and current Kilo still discovers it; repository-wide tests remain coupling guards.

### Implementation Constraints

- Resolve README insertion points by headings and surrounding prose, not the current line numbers.
- Do not expose `.kilocode/skills` as Kilo's canonical public path. Kilo documents `.kilo/skills`, while the current Skills CLI adapter writes the legacy path that Kilo still discovers.
- Do not hardcode “32 skills,” Kilo 7.4.15, or Skills CLI 1.5.20 into evergreen README prose; record versions and commit SHA in implementation/PR evidence.
- Do not change plugin manifests, release-owned versions, `CHANGELOG.md`, or skill inventory counts.
- Keep links on primary sources: Kilo's Skills documentation and the Skills CLI's official repository/documentation.

### Risks and Dependencies

- **External adapter drift:** The Skills CLI currently targets `.kilocode/skills` while Kilo documents `.kilo/skills`. Mitigation: avoid the path in public copy, record it in the strategy document, and rerun isolated acceptance against current releases before shipping.
- **Manual-only metadata is advisory in Kilo:** Installing all skills makes eight current `disable-model-invocation: true` skills visible to Kilo's description-based selection. Mitigation: narrow the support claim and tell users that manual-only workflows should be invoked intentionally; parity work remains out of scope.
- **Third-party installer and Node.js dependency:** Kilo does not ship the Skills CLI, and some Kilo installation methods do not imply Node.js/npm. Mitigation: name the independent transport, state the prerequisite, link its official docs, and preserve its confirmation flow.
- **Source or target shadowing:** Project-level or duplicate skills can override a global skill. Mitigation: keep initial docs compact and link Kilo's troubleshooting guidance; do not claim collision behavior that was not tested.
- **Broad lifecycle commands:** Global update/removal could touch unrelated skills. Mitigation: omit them from this change and defer a targeted lifecycle story.

## Implementation Units

### U1. Add the verified Kilo onboarding path to the public README

- **Goal:** Make Kilo discoverable and give users one accurate, safe install -> reload -> verify -> invoke sequence.
- **Requirements:** R1-R9; AE1-AE4.
- **Dependencies:** None.
- **Files:** `README.md`
- **Approach:** Add “Kilo Code” to the existing secondary-host pointer. At the start of “More Install Options,” replace the equal-support claim per KTD5 and add a Kilo subsection before Kimi. The subsection should name Kilo Agent Skills and the independent Skills CLI, show the exact R4 command without `--yes`, state the Node.js/npm prerequisite, link both primary documentation sources, explain reload/session activation, give KTD4's natural-language availability/invocation examples, and state R9's limitation without listing drifting versions or install paths.
- **Patterns to follow:** The neighboring Kimi and Cline subsections: one mechanism explanation, one command block, activation guidance, and a link for deeper details. Preserve the README's current heading hierarchy and concise install-first style.
- **Test scenarios:** `Test expectation: none -- user-facing documentation backed by live external acceptance rather than deterministic repo behavior.`
- **Verification:**
  - Kilo appears once in the secondary-host pointer and once as a `### Kilo Code` heading.
  - The shell block contains the exact R4 command, including the quoted wildcard, and omits `--yes`.
  - The subsection contains install, reload/new-session, availability-check, and natural-language invocation steps in that order.
  - The section links to Kilo's Skills docs and the official Skills CLI source/docs.
  - README wording contains no Kilo runtime-plugin, full-parity, automatic-update, or removal promise.

### U2. Reconcile the repository's native-install strategy record

- **Goal:** Keep internal distribution guidance consistent with the new public Kilo route and preserve the compatibility risks future maintainers must recheck.
- **Requirements:** R10.
- **Dependencies:** U1, so the strategy record describes the final public contract.
- **Files:** `docs/solutions/integrations/native-plugin-install-strategy.md`
- **Approach:** Refresh the document metadata and verification date, add Kilo to the relevant tags and support table, and add a concise Kilo section. Record that CE remains a native Agent Skills package; the independent Skills CLI fetches the official repository; the current adapter writes a legacy path that current Kilo deliberately discovers; and this is neither a CE Kilo runtime plugin nor a converter target. Record installation/discovery and manual-only limitations without duplicating the full README walkthrough.
- **Patterns to follow:** The existing Cline and Kimi entries: state the normal install surface, distinguish it from a converter, name the operational limitation, and keep release ownership explicit.
- **Test scenarios:** `Test expectation: none -- maintenance documentation for an externally verified integration contract.`
- **Verification:**
  - The support table and dedicated section use the same Agent Skills terminology and source as U1.
  - The strategy document records the `.kilocode/skills` compatibility dependency while the README does not present it as canonical.
  - The document does not add a Kilo manifest, provider spec, converter, release component, or versioning obligation.

## Verification Contract

### Live integration evidence

- Run the exact R4 global command in an isolated effective-user home so no existing user skills, config, or lock state can affect the result.
- From a separate clean project, confirm current Kilo discovers every skill directory in the official source, including `ce-babysit-pr`, `ce-plan`, `ce-work`, `ce-retune`, and `lfg`.
- Confirm the install lock names only `EveryInc/compound-engineering-plugin` and the installed skill tree is byte-identical to the source checkout, including bundled `references/` and `scripts/`.
- Record the tested CE commit, Kilo version, and Skills CLI version in PR evidence rather than durable README prose.
- Treat this as installation/discovery acceptance only; do not report all-workflow behavioral parity.

### Documentation and repository gates

- `git diff --check` passes.
- All new external links resolve to primary Kilo or Skills CLI sources.
- `bun run release:validate` passes with no release-owned metadata changes.
- `bun run plugin:validate` passes against the existing manifests.
- `bun run test` passes; no focused README-content test is added.

## Definition of Done

- `README.md` exposes Kilo through the secondary-host pointer and a complete Kilo Agent Skills subsection.
- The public command preserves source provenance, explicit Kilo targeting, global scope, quoted wildcard safety, and installer confirmation.
- A user is told how to activate, verify, and explicitly invoke `ce-plan`.
- Public copy distinguishes native Agent Skills from Kilo runtime plugins and avoids full-parity, update, removal, or `agent-skills-kit` claims.
- The shared “equally supported” sentence no longer contradicts host-specific limitations.
- `docs/solutions/integrations/native-plugin-install-strategy.md` records the route, compatibility seam, verification date, and non-goals.
- Live integration acceptance and all documentation/repository gates in the Verification Contract pass.
- No abandoned experimental files, manifests, scripts, or scratch environments remain.
- The docs-only change is committed on the feature branch and proposed through a pull request; it is not merged directly to `main`.

## Sources and Research

### Repository evidence

- `README.md` at upstream `main` commit `a9f6d530d4446d805a3100387dedd86268d7e695` — secondary-host pointer, “More Install Options” support claim, neighboring Kimi/Cline install patterns, and global invocation-syntax note.
- `docs/solutions/integrations/native-plugin-install-strategy.md` — controlling preference for native loading surfaces and keeping the CE Bun converter out of normal installation.
- `docs/solutions/integrations/kimi-native-plugin-manifest-support.md` — platform support is a distribution-contract decision, not automatically a converter target.
- `docs/solutions/codex-skill-prompt-entrypoints.md` — one normal public source of skills; avoid parallel compatibility install paths.
- `docs/solutions/best-practices/preserve-user-content-across-all-destructive-paths.md` — do not publish update/removal safety claims without testing every destructive path.
- `tests/skill-conventions.test.ts` and `src/release/components.ts` — README is read for the Codex invocation contract and mapped to the root release component, but no test owns the secondary-host inventory or Kilo prose.

### External authorities

- [Kilo Code: Skills](https://kilo.ai/docs/customize/skills) — Agent Skills behavior, natural-language explicit invocation, canonical paths, discovery lifecycle, reload, and troubleshooting.
- [Kilo Code: Plugins](https://kilo.ai/docs/automate/extending/plugins) — runtime plugins are JavaScript/TypeScript hook modules, not skill-bundle metadata.
- [Skills CLI documentation](https://www.skills.sh/docs/cli) and [official source](https://github.com/vercel-labs/skills) — `npx` transport and current add/list/update/remove flags.
- [Skills CLI Kilo adapter](https://github.com/vercel-labs/skills/blob/main/src/agents.ts) — current `.kilocode/skills` target.
- [Kilo 7.4.16 skill-path source](https://github.com/Kilo-Org/kilocode/blob/v7.4.16/packages/opencode/src/kilocode/paths.ts) — deliberate discovery of both `.kilocode` and `.kilo` global/project paths.

### Reproduced acceptance baseline

- On 2026-07-24, the exact R4 command ran in an isolated home with Skills CLI 1.5.20.
- The installer fetched official CE `main` at `a9f6d530d4446d805a3100387dedd86268d7e695`, installed 32 skill directories, and wrote a 32-entry lock whose only source was `EveryInc/compound-engineering-plugin`.
- `diff -qr` found no difference between the official `skills/` tree and the global Kilo installation.
- Kilo 7.4.15, started from a separate clean project, discovered all 32 CE skills, including the representative workflows named in the Verification Contract.
