# Changelog

This file is no longer the canonical changelog for compound-engineering releases.

Historical entries are preserved below, but new release history is recorded in the root [`CHANGELOG.md`](../../CHANGELOG.md).

All notable changes to the compound-engineering plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.6.1](https://github.com/EveryInc/compound-engineering-plugin/compare/compound-engineering-v3.6.0...compound-engineering-v3.6.1) (2026-05-06)


### Bug Fixes

* **doc-review:** cut review noise on plans, scope personas to doc shape ([#780](https://github.com/EveryInc/compound-engineering-plugin/issues/780)) ([8349e75](https://github.com/EveryInc/compound-engineering-plugin/commit/8349e750b856d267b74fbbeb2fb135e4ff73eb91))

## [3.6.0](https://github.com/EveryInc/compound-engineering-plugin/compare/compound-engineering-v3.5.0...compound-engineering-v3.6.0) (2026-05-05)


### Features

* **ce-work-beta:** adaptive effort selection for Codex delegation batches ([#759](https://github.com/EveryInc/compound-engineering-plugin/issues/759)) ([3e03365](https://github.com/EveryInc/compound-engineering-plugin/commit/3e03365d54b5ec909ba75adfc15b870f2e5a9b53))


### Bug Fixes

* **ce-doc-review:** block diagram deletion as a fix recommendation ([#775](https://github.com/EveryInc/compound-engineering-plugin/issues/775)) ([1f3c646](https://github.com/EveryInc/compound-engineering-plugin/commit/1f3c6466e4eb4e1b584c658953dfb1ca98dd3335))
* **ce-doc-review:** tighten finding resolution routing ([#769](https://github.com/EveryInc/compound-engineering-plugin/issues/769)) ([5427863](https://github.com/EveryInc/compound-engineering-plugin/commit/542786320bc155d48823e58162d6a474b54be671))
* **ce-plan:** render Implementation Units as headings, not bulleted list items ([#766](https://github.com/EveryInc/compound-engineering-plugin/issues/766)) ([be2efd7](https://github.com/EveryInc/compound-engineering-plugin/commit/be2efd7d7605c483ea9f068c6190b81a9d68e942))
* **ce-work-beta:** replace semicolon pre-resolution with single-command form ([#758](https://github.com/EveryInc/compound-engineering-plugin/issues/758)) ([5139ff1](https://github.com/EveryInc/compound-engineering-plugin/commit/5139ff13e9102e9db821fbeffa5e2abc49014dd6))
* **ce-work-beta:** update Codex sandbox flags to current CLI syntax ([#770](https://github.com/EveryInc/compound-engineering-plugin/issues/770)) ([7ff3472](https://github.com/EveryInc/compound-engineering-plugin/commit/7ff3472cabb4dfe7141b55429ed2bc6b02a7b5e9))
* **ce-worktree:** resolve script path against skill dir, not user CWD ([#772](https://github.com/EveryInc/compound-engineering-plugin/issues/772)) ([4cc1ee6](https://github.com/EveryInc/compound-engineering-plugin/commit/4cc1ee6fe2a353cd0b8e7466ec27e9556b042ee3))
* **review:** escape literal pipes in finding table cells ([#779](https://github.com/EveryInc/compound-engineering-plugin/issues/779)) ([c7fc674](https://github.com/EveryInc/compound-engineering-plugin/commit/c7fc6743264440c2b0093607572764a0ce451b5d))

## [3.5.0](https://github.com/EveryInc/compound-engineering-plugin/compare/compound-engineering-v3.4.2...compound-engineering-v3.5.0) (2026-05-04)


### Features

* **riffrec-feedback-analysis:** add Riffrec feedback skill with three-path routing ([#747](https://github.com/EveryInc/compound-engineering-plugin/issues/747)) ([dde9256](https://github.com/EveryInc/compound-engineering-plugin/commit/dde9256362db90606d052c662dc8f2f0ae6b620b))

## [3.4.2](https://github.com/EveryInc/compound-engineering-plugin/compare/compound-engineering-v3.4.1...compound-engineering-v3.4.2) (2026-05-04)


### Bug Fixes

* **ce-code-review:** keep finding numbers stable ([#754](https://github.com/EveryInc/compound-engineering-plugin/issues/754)) ([e856756](https://github.com/EveryInc/compound-engineering-plugin/commit/e8567566b7ed779ea1964d6ffe97e8cb4ca79d73))
* **ce-commit-push-pr:** use body-file for PR descriptions ([#757](https://github.com/EveryInc/compound-engineering-plugin/issues/757)) ([a84cb75](https://github.com/EveryInc/compound-engineering-plugin/commit/a84cb759d078787f1e2f4a0ce2eda9d8680b7c90))
* **ce-compound, ce-sessions:** remove bash parameter expansion from ! backtick  ([#752](https://github.com/EveryInc/compound-engineering-plugin/issues/752)) ([9539bf0](https://github.com/EveryInc/compound-engineering-plugin/commit/9539bf045deba099a20d306b2b118e3b019c633c))
* **ce-polish-beta:** support Bash 3.2 project detection ([#755](https://github.com/EveryInc/compound-engineering-plugin/issues/755)) ([caf5e12](https://github.com/EveryInc/compound-engineering-plugin/commit/caf5e1251caeeed45ed2e18eb366fc25d90f38be))

## [3.4.1](https://github.com/EveryInc/compound-engineering-plugin/compare/compound-engineering-v3.4.0...compound-engineering-v3.4.1) (2026-05-01)


### Bug Fixes

* **ce-setup:** detect codex global skills ([#739](https://github.com/EveryInc/compound-engineering-plugin/issues/739)) ([887db6b](https://github.com/EveryInc/compound-engineering-plugin/commit/887db6b2ade997a2723debc15b5baf34fcf52fb4))
* **code-review:** grant Write to JSON-pipeline reviewer agents ([#741](https://github.com/EveryInc/compound-engineering-plugin/issues/741)) ([520a9eb](https://github.com/EveryInc/compound-engineering-plugin/commit/520a9ebea039f4f5d984cd7f31d8b8e60a9e0bc6))

## [3.4.0](https://github.com/EveryInc/compound-engineering-plugin/compare/compound-engineering-v3.3.2...compound-engineering-v3.4.0) (2026-05-01)


### Features

* **ce-simplify-code:** add skill for simplifying recent code changes ([#735](https://github.com/EveryInc/compound-engineering-plugin/issues/735)) ([2d20757](https://github.com/EveryInc/compound-engineering-plugin/commit/2d207574123782722116bd3d93f9f5756fab4dd3))
* **ce-strategy,ce-product-pulse:** add PM skills for upstream anchor and outcome pulse ([#614](https://github.com/EveryInc/compound-engineering-plugin/issues/614)) ([cb8f9b3](https://github.com/EveryInc/compound-engineering-plugin/commit/cb8f9b348391d28f31ce367b9ff308980939c96f))
* **ce-strategy:** move strategy doc to root and add frontmatter ([#732](https://github.com/EveryInc/compound-engineering-plugin/issues/732)) ([265cb42](https://github.com/EveryInc/compound-engineering-plugin/commit/265cb4280f22bbd2fd5cc45e338371442b6c1692))


### Bug Fixes

* **ce-commit-push-pr:** URL-encode parens in badge model-slug examples ([#725](https://github.com/EveryInc/compound-engineering-plugin/issues/725)) ([3873b9e](https://github.com/EveryInc/compound-engineering-plugin/commit/3873b9e9de483cfe91eaed295a6b736d0a2e1168))
* **ce-compound,ce-sessions:** handle non-git CWD in pre-resolved git branch ([#731](https://github.com/EveryInc/compound-engineering-plugin/issues/731)) ([5e04534](https://github.com/EveryInc/compound-engineering-plugin/commit/5e045341372fc95d284268d514a53da5722c81d2))
* **ce-plan:** close synthesis drift in rich-context invocations ([#729](https://github.com/EveryInc/compound-engineering-plugin/issues/729)) ([15c1cde](https://github.com/EveryInc/compound-engineering-plugin/commit/15c1cde7b353d8f309b5a2de94bafb99380d787a))
* **ce-sessions:** 722 ce-compound and ce-sessions permission error ([#723](https://github.com/EveryInc/compound-engineering-plugin/issues/723)) ([8f80466](https://github.com/EveryInc/compound-engineering-plugin/commit/8f804669b184bc68ef6dbab4669fe0e431d8271a))
* **review:** default to harness-native code review, escalate on risk ([#721](https://github.com/EveryInc/compound-engineering-plugin/issues/721)) ([d217660](https://github.com/EveryInc/compound-engineering-plugin/commit/d217660b3d37acf38227abf5c57ba6f390ccaa1e))

## [3.3.2](https://github.com/EveryInc/compound-engineering-plugin/compare/compound-engineering-v3.3.1...compound-engineering-v3.3.2) (2026-04-29)


### Bug Fixes

* **ce-code-review:** comment-gate previous-comments persona to skip empty PRs ([#720](https://github.com/EveryInc/compound-engineering-plugin/issues/720)) ([09fa18b](https://github.com/EveryInc/compound-engineering-plugin/commit/09fa18bcc1f130b7af26dfc53974776f1434b53d))
* **ce-code-review:** mandate walkthrough.md load on walk-through entry ([#718](https://github.com/EveryInc/compound-engineering-plugin/issues/718)) ([5ac1a06](https://github.com/EveryInc/compound-engineering-plugin/commit/5ac1a063a9c154bb586a5f2b2ad17ef59990c0b6))

## [3.3.1](https://github.com/EveryInc/compound-engineering-plugin/compare/compound-engineering-v3.3.0...compound-engineering-v3.3.1) (2026-04-28)


### Bug Fixes

* **review:** queue reviewers when subagent slots fill ([#716](https://github.com/EveryInc/compound-engineering-plugin/issues/716)) ([d69a772](https://github.com/EveryInc/compound-engineering-plugin/commit/d69a772bb8682da23fa0b6a293245768e573254b))

## [3.3.0](https://github.com/EveryInc/compound-engineering-plugin/compare/compound-engineering-v3.2.0...compound-engineering-v3.3.0) (2026-04-28)


### Features

* **ce-brainstorm,ce-plan:** surface agent's scope synthesis before doc-write ([#705](https://github.com/EveryInc/compound-engineering-plugin/issues/705)) ([41e7f72](https://github.com/EveryInc/compound-engineering-plugin/commit/41e7f72ab697b3aee9b4a740794daa55317f44d1))


### Bug Fixes

* **ce-code-review:** restate model override at dispatch point ([#681](https://github.com/EveryInc/compound-engineering-plugin/issues/681)) ([9751d1a](https://github.com/EveryInc/compound-engineering-plugin/commit/9751d1a30a39fcfe17a9e052d32dbc9a5deafd02))
* **ce-compound-refresh:** check inbound links before deletion ([#713](https://github.com/EveryInc/compound-engineering-plugin/issues/713)) ([e806522](https://github.com/EveryInc/compound-engineering-plugin/commit/e806522caab45f07f7bd3f06d6b1333068c538cd))
* **ce-doc-review:** tighten suggested_fix and why_it_matters rules ([#702](https://github.com/EveryInc/compound-engineering-plugin/issues/702)) ([dd08094](https://github.com/EveryInc/compound-engineering-plugin/commit/dd080943e0bff65416c5a3b16bcc6c3e1d26524f))
* **ce-plan:** inline post-generation menu routing so option 1 actually starts /ce-work ([#715](https://github.com/EveryInc/compound-engineering-plugin/issues/715)) ([0c515c0](https://github.com/EveryInc/compound-engineering-plugin/commit/0c515c06fe7efc77baf29b5512a768c930d50ba0))
* **ce-work-beta:** defer model and reasoning effort to Codex config ([#704](https://github.com/EveryInc/compound-engineering-plugin/issues/704)) ([4b5f28d](https://github.com/EveryInc/compound-engineering-plugin/commit/4b5f28da9746aae8f2c5dd715d7029d0ab2758a6))
* **commit-push-pr:** branch from fresh remote base to prevent stale-base contamination ([#708](https://github.com/EveryInc/compound-engineering-plugin/issues/708)) ([cd2fc67](https://github.com/EveryInc/compound-engineering-plugin/commit/cd2fc67c3f2db9b98de16a10d2a1e8e11700985e))
* **skills:** replace shell antipatterns blocked by permission check ([#711](https://github.com/EveryInc/compound-engineering-plugin/issues/711)) ([1f0a77b](https://github.com/EveryInc/compound-engineering-plugin/commit/1f0a77bcc1e4edbf1b7979ea5cd13d1e553d4662))

## [3.2.0](https://github.com/EveryInc/compound-engineering-plugin/compare/compound-engineering-v3.1.0...compound-engineering-v3.2.0) (2026-04-26)


### Features

* **ce-compound:** add frontmatter parser-safety validator ([#697](https://github.com/EveryInc/compound-engineering-plugin/issues/697)) ([7eea2d1](https://github.com/EveryInc/compound-engineering-plugin/commit/7eea2d1cfe5c177e2d144b1e12f4957c75dac556))


### Bug Fixes

* **ce-code-review:** move run artifacts from .context/ to /tmp per AGENTS.md ([#690](https://github.com/EveryInc/compound-engineering-plugin/issues/690)) ([85e9a20](https://github.com/EveryInc/compound-engineering-plugin/commit/85e9a2073b09295b1a0771d4775d42b7142fd172))
* **ce-code-review:** replace LFG with best-judgment auto-resolve ([#685](https://github.com/EveryInc/compound-engineering-plugin/issues/685)) ([9ba41a1](https://github.com/EveryInc/compound-engineering-plugin/commit/9ba41a14cadfe2eee75fe50485f72f38b09df00b))
* **ce-code-review:** tighten autofix_class rubric for safe_auto/gated_auto boundary ([#695](https://github.com/EveryInc/compound-engineering-plugin/issues/695)) ([ad9577e](https://github.com/EveryInc/compound-engineering-plugin/commit/ad9577e7329cba31cffba71815cac6cef290ae1b))
* **ce-debug:** default to commit-and-PR and tighten learning offer ([#693](https://github.com/EveryInc/compound-engineering-plugin/issues/693)) ([e21156e](https://github.com/EveryInc/compound-engineering-plugin/commit/e21156eeb7e1502a37bf7d4a30fdc6a3287eed7a))
* **ce-debug:** delegate commit/PR and add branch check ([#683](https://github.com/EveryInc/compound-engineering-plugin/issues/683)) ([1284290](https://github.com/EveryInc/compound-engineering-plugin/commit/1284290af27139c2df192488099626688fd4898b))
* **ce-demo-reel:** wait for network idle and reject blank frames ([#692](https://github.com/EveryInc/compound-engineering-plugin/issues/692)) ([f30404e](https://github.com/EveryInc/compound-engineering-plugin/commit/f30404e57bcbf7866c1a9524f4392f7dff8f3a0b))
* **ce-doc-review:** rename LFG path to best-judgment to avoid /lfg collision ([#691](https://github.com/EveryInc/compound-engineering-plugin/issues/691)) ([50bf65e](https://github.com/EveryInc/compound-engineering-plugin/commit/50bf65e88c556eaa1ae10c7d88d8e646274d7ae0))
* **ce-resolve-pr-feedback:** add declined verdict for harmful suggestions ([#694](https://github.com/EveryInc/compound-engineering-plugin/issues/694)) ([bd72818](https://github.com/EveryInc/compound-engineering-plugin/commit/bd72818609054f6d173cf141641799fa729cc668))
* **ce-work:** codify worktree isolation for parallel subagent dispatch ([#698](https://github.com/EveryInc/compound-engineering-plugin/issues/698)) ([053c1db](https://github.com/EveryInc/compound-engineering-plugin/commit/053c1db25511843b5967b3d04427b172ede98d25))
* **session-historian:** cap deep-dives, add keyword filter primitive, tighten dispatch ([#699](https://github.com/EveryInc/compound-engineering-plugin/issues/699)) ([a91270c](https://github.com/EveryInc/compound-engineering-plugin/commit/a91270ccd2d5fba3e035275b7af2c4fec3f90b1c))
* **skills:** replace case statements blocked by permission check ([#701](https://github.com/EveryInc/compound-engineering-plugin/issues/701)) ([5952b20](https://github.com/EveryInc/compound-engineering-plugin/commit/5952b20d7f2a056f8d7d8719a2d20b6615aca9e4))

## [3.1.0](https://github.com/EveryInc/compound-engineering-plugin/compare/compound-engineering-v3.0.7...compound-engineering-v3.1.0) (2026-04-24)


### Features

* **ce-brainstorm:** probe rigor gaps with prose before Phase 2 ([#677](https://github.com/EveryInc/compound-engineering-plugin/issues/677)) ([304a975](https://github.com/EveryInc/compound-engineering-plugin/commit/304a975d02b362eac8e715e482f0118ee623da91))
* **ce-brainstorm:** product-tier with end-to-end ID traceability ([#629](https://github.com/EveryInc/compound-engineering-plugin/issues/629)) ([bd77d55](https://github.com/EveryInc/compound-engineering-plugin/commit/bd77d5550a492974a26b648df4a9dc556acb9dec))
* **ce-code-review:** add Swift/iOS stack-specific reviewer persona ([#638](https://github.com/EveryInc/compound-engineering-plugin/issues/638)) ([701ae10](https://github.com/EveryInc/compound-engineering-plugin/commit/701ae10c2dfc60fa50fed11f596c61a0906b3cc4))
* **ce-commit-push-pr:** skip evidence prompt when judgment allows ([#663](https://github.com/EveryInc/compound-engineering-plugin/issues/663)) ([75cf4d6](https://github.com/EveryInc/compound-engineering-plugin/commit/75cf4d603da4d2449658ddfe97b374a1f9c67362))
* **ce-debug:** environment sanity, assumption audit, more techniques ([#649](https://github.com/EveryInc/compound-engineering-plugin/issues/649)) ([cce95fb](https://github.com/EveryInc/compound-engineering-plugin/commit/cce95fb814a69a1414af4bee34933cbc117d2449))
* **ce-demo-reel:** add local save as alternative to catbox upload ([#647](https://github.com/EveryInc/compound-engineering-plugin/issues/647)) ([fdf5fe4](https://github.com/EveryInc/compound-engineering-plugin/commit/fdf5fe4af56dab1f40cbf83e2e761997bce8c939))
* **ce-ideate:** subject gate, surprise-me, and warrant contract ([#671](https://github.com/EveryInc/compound-engineering-plugin/issues/671)) ([6514b1f](https://github.com/EveryInc/compound-engineering-plugin/commit/6514b1fce5df62582673fe7274c97a90e9aea45c))
* **ce-plan:** add U-IDs and origin trace to plan template ([#632](https://github.com/EveryInc/compound-engineering-plugin/issues/632)) ([44ce9dd](https://github.com/EveryInc/compound-engineering-plugin/commit/44ce9dd127ccbc300b18051aa2bf7c718112a79c))
* **ce-proof:** broaden triggers and surface markdown viewing ([#618](https://github.com/EveryInc/compound-engineering-plugin/issues/618)) ([e0f2a4f](https://github.com/EveryInc/compound-engineering-plugin/commit/e0f2a4f9d748124fecb41114856690f88f8fc2e9))
* **ce-setup:** check for ast-grep CLI and agent skill ([#653](https://github.com/EveryInc/compound-engineering-plugin/issues/653)) ([23dc11b](https://github.com/EveryInc/compound-engineering-plugin/commit/23dc11b95ae46dc6be0308306de5c8f16329fe49))
* **ce-test-browser:** free-port scan and auto-server start ([f8720da](https://github.com/EveryInc/compound-engineering-plugin/commit/f8720da3d1ba9e6d9fc161a6377f3ba83a8ab978))
* **ce-test-browser:** gate port scan and auto-start on pipeline mode ([22d493b](https://github.com/EveryInc/compound-engineering-plugin/commit/22d493b192108970a3d54378f8de2fd72ac62863))
* **codex:** native plugin install manifests + agents-only converter ([#616](https://github.com/EveryInc/compound-engineering-plugin/issues/616)) ([3ed4a4f](https://github.com/EveryInc/compound-engineering-plugin/commit/3ed4a4fa0f6f4d08144ae7598af391b4f070b649))
* **lfg:** add ce-commit-push-pr step and remove ralph-loop ([1f20c38](https://github.com/EveryInc/compound-engineering-plugin/commit/1f20c3842d26a02ed8baca13eb737ca635320719))
* **pi:** first-class support via pi-subagents + pi-ask-user ([#651](https://github.com/EveryInc/compound-engineering-plugin/issues/651)) ([7ddfbed](https://github.com/EveryInc/compound-engineering-plugin/commit/7ddfbed33b08e5ad0dc56a3ecc19adb9a10ebb2c))


### Bug Fixes

* **ce-brainstorm:** enforce Interaction Rules in universal flow ([#669](https://github.com/EveryInc/compound-engineering-plugin/issues/669)) ([494313e](https://github.com/EveryInc/compound-engineering-plugin/commit/494313e8ebf7635f18087a4091d2ba5ef98c0eba))
* **ce-debug:** stop hanging handoffs and read full issue thread ([#646](https://github.com/EveryInc/compound-engineering-plugin/issues/646)) ([86d9a2c](https://github.com/EveryInc/compound-engineering-plugin/commit/86d9a2c55f49eb49dbbc3d918ce859dbe273d44e))
* **ce-demo-reel:** prevent secrets in recorded demos ([#664](https://github.com/EveryInc/compound-engineering-plugin/issues/664)) ([9ddcd22](https://github.com/EveryInc/compound-engineering-plugin/commit/9ddcd22aee55e538d53d7d14aaf0ebebce84cae5))
* **ce-ideate:** sharpen bug intent, surprise-me dispatch, and drop authoring refs ([#672](https://github.com/EveryInc/compound-engineering-plugin/issues/672)) ([f0433d9](https://github.com/EveryInc/compound-engineering-plugin/commit/f0433d9150b0c62a1fd65db7ffdb08a7c45fdb7f))
* **ce-learnings-researcher:** drop unreadable schema path reference ([#630](https://github.com/EveryInc/compound-engineering-plugin/issues/630)) ([05ea109](https://github.com/EveryInc/compound-engineering-plugin/commit/05ea109bdb68c6f7686d7ab4f52518d9a23a903e))
* **ce-proof:** correct op shapes and add retry/batch discipline ([#658](https://github.com/EveryInc/compound-engineering-plugin/issues/658)) ([a9fd842](https://github.com/EveryInc/compound-engineering-plugin/commit/a9fd8421f42d598e8d85c4cb50cbec0fa3d6af46))
* **ce-resolve-pr-feedback:** stop dropping unresolved and actionable feedback ([#617](https://github.com/EveryInc/compound-engineering-plugin/issues/617)) ([153bea8](https://github.com/EveryInc/compound-engineering-plugin/commit/153bea8669d63848f57942e842cd58ed664e7435))
* **ce-test-browser:** skip headed/headless question in pipeline mode ([47350c3](https://github.com/EveryInc/compound-engineering-plugin/commit/47350c3e4e612fa341d8e43e4d1709ab391fbe42))
* **ce-update:** compare against main plugin.json, not release tags ([#660](https://github.com/EveryInc/compound-engineering-plugin/issues/660)) ([351d12e](https://github.com/EveryInc/compound-engineering-plugin/commit/351d12ec5b795bff4c5e633e9a64644f045340c6))
* **ce-update:** derive cache dir from CLAUDE_PLUGIN_ROOT parent ([#645](https://github.com/EveryInc/compound-engineering-plugin/issues/645)) ([6155b9d](https://github.com/EveryInc/compound-engineering-plugin/commit/6155b9de3c2d60ca424386f2dfcb0dfa7668f2c1))
* **ce-update:** replace cache sweep with claude plugin update ([#656](https://github.com/EveryInc/compound-engineering-plugin/issues/656)) ([b9ae6b7](https://github.com/EveryInc/compound-engineering-plugin/commit/b9ae6b758d0d538648cc4dbb09dfb0fa8c0858fb))
* **lfg:** use platform-neutral skill references ([#642](https://github.com/EveryInc/compound-engineering-plugin/issues/642)) ([b104ce4](https://github.com/EveryInc/compound-engineering-plugin/commit/b104ce46bea4b1b9b0e9cfbdd9203dbc5a0aa510))
* **main:** recover version drift, fix stale test, document learnings ([#678](https://github.com/EveryInc/compound-engineering-plugin/issues/678)) ([bc8ae1a](https://github.com/EveryInc/compound-engineering-plugin/commit/bc8ae1a6b5375f7fbb8120104b3222391da470bb))
* **question-tool:** stop silent skips when tool looks unavailable ([#620](https://github.com/EveryInc/compound-engineering-plugin/issues/620)) ([d359cc7](https://github.com/EveryInc/compound-engineering-plugin/commit/d359cc7e2f4dd5e920e7daa6dbd1eddc8f53bc19))
* **skills:** cap skill descriptions at harness limit ([#643](https://github.com/EveryInc/compound-engineering-plugin/issues/643)) ([13f95ba](https://github.com/EveryInc/compound-engineering-plugin/commit/13f95ba6392f86aa8dd9b4430b84f0b7523c6c89))
* **skills:** plan is a decision artifact; progress comes from git ([#666](https://github.com/EveryInc/compound-engineering-plugin/issues/666)) ([c33bf70](https://github.com/EveryInc/compound-engineering-plugin/commit/c33bf70f46b74979651c7229544743604b965713))

## [3.0.7] - 2026-04-24

### Fixed
- **ce-test-browser:** skip headed/headless question entirely in pipeline mode (`mode:pipeline`) -- agents were blocking forever on `AskUserQuestion` with no user present

## [3.0.6] - 2026-04-24

### Changed
- **ce-test-browser:** port scan and server auto-start now only happen in pipeline mode (`mode:pipeline` / `PIPELINE_MODE=1`); manual invocations use the preferred port as-is and ask the user to start their own server
- **lfg:** step 6 now passes `mode:pipeline` to `ce-test-browser` so parallel LFG runs claim non-colliding ports automatically

## [3.0.5] - 2026-04-24

### Changed
- **ce-test-browser:** always find a free port before starting — scans upward from preferred port so parallel agents never collide on 3000; auto-starts the dev server on the claimed port if nothing is already listening

## [3.0.4] - 2026-04-24

### Changed
- **lfg:** add `ce-commit-push-pr` as step 8 so the full autonomous workflow ends with a pushed branch and open PR, not just `<promise>DONE</promise>`

## [3.0.3](https://github.com/EveryInc/compound-engineering-plugin/compare/compound-engineering-v3.0.2...compound-engineering-v3.0.3) (2026-04-24)


### Bug Fixes

* **ce-ideate:** sharpen bug intent, surprise-me dispatch, and drop authoring refs ([#672](https://github.com/EveryInc/compound-engineering-plugin/issues/672)) ([f0433d9](https://github.com/EveryInc/compound-engineering-plugin/commit/f0433d9150b0c62a1fd65db7ffdb08a7c45fdb7f))

## [3.0.2](https://github.com/EveryInc/compound-engineering-plugin/compare/compound-engineering-v3.0.1...compound-engineering-v3.0.2) (2026-04-24)


### Features

* **ce-commit-push-pr:** skip evidence prompt when judgment allows ([#663](https://github.com/EveryInc/compound-engineering-plugin/issues/663)) ([75cf4d6](https://github.com/EveryInc/compound-engineering-plugin/commit/75cf4d603da4d2449658ddfe97b374a1f9c67362))
* **ce-ideate:** subject gate, surprise-me, and warrant contract ([#671](https://github.com/EveryInc/compound-engineering-plugin/issues/671)) ([6514b1f](https://github.com/EveryInc/compound-engineering-plugin/commit/6514b1fce5df62582673fe7274c97a90e9aea45c))


### Bug Fixes

* **ce-brainstorm:** enforce Interaction Rules in universal flow ([#669](https://github.com/EveryInc/compound-engineering-plugin/issues/669)) ([494313e](https://github.com/EveryInc/compound-engineering-plugin/commit/494313e8ebf7635f18087a4091d2ba5ef98c0eba))
* **ce-demo-reel:** prevent secrets in recorded demos ([#664](https://github.com/EveryInc/compound-engineering-plugin/issues/664)) ([9ddcd22](https://github.com/EveryInc/compound-engineering-plugin/commit/9ddcd22aee55e538d53d7d14aaf0ebebce84cae5))
* **ce-update:** compare against main plugin.json, not release tags ([#660](https://github.com/EveryInc/compound-engineering-plugin/issues/660)) ([351d12e](https://github.com/EveryInc/compound-engineering-plugin/commit/351d12ec5b795bff4c5e633e9a64644f045340c6))
* **skills:** plan is a decision artifact; progress comes from git ([#666](https://github.com/EveryInc/compound-engineering-plugin/issues/666)) ([c33bf70](https://github.com/EveryInc/compound-engineering-plugin/commit/c33bf70f46b74979651c7229544743604b965713))

## [3.0.1](https://github.com/EveryInc/compound-engineering-plugin/compare/compound-engineering-v3.0.0...compound-engineering-v3.0.1) (2026-04-23)


### Bug Fixes

* **ce-proof:** correct op shapes and add retry/batch discipline ([#658](https://github.com/EveryInc/compound-engineering-plugin/issues/658)) ([a9fd842](https://github.com/EveryInc/compound-engineering-plugin/commit/a9fd8421f42d598e8d85c4cb50cbec0fa3d6af46))
* **ce-update:** replace cache sweep with claude plugin update ([#656](https://github.com/EveryInc/compound-engineering-plugin/issues/656)) ([b9ae6b7](https://github.com/EveryInc/compound-engineering-plugin/commit/b9ae6b758d0d538648cc4dbb09dfb0fa8c0858fb))

## [3.0.0](https://github.com/EveryInc/compound-engineering-plugin/compare/compound-engineering-v2.68.1...compound-engineering-v3.0.0) (2026-04-22)


### ⚠ BREAKING CHANGES

* **cli:** rename all skills and agents to consistent ce- prefix ([#503](https://github.com/EveryInc/compound-engineering-plugin/issues/503))

### Features

* **ce-brainstorm:** product-tier with end-to-end ID traceability ([#629](https://github.com/EveryInc/compound-engineering-plugin/issues/629)) ([bd77d55](https://github.com/EveryInc/compound-engineering-plugin/commit/bd77d5550a492974a26b648df4a9dc556acb9dec))
* **ce-code-review:** add Swift/iOS stack-specific reviewer persona ([#638](https://github.com/EveryInc/compound-engineering-plugin/issues/638)) ([701ae10](https://github.com/EveryInc/compound-engineering-plugin/commit/701ae10c2dfc60fa50fed11f596c61a0906b3cc4))
* **ce-debug:** environment sanity, assumption audit, more techniques ([#649](https://github.com/EveryInc/compound-engineering-plugin/issues/649)) ([cce95fb](https://github.com/EveryInc/compound-engineering-plugin/commit/cce95fb814a69a1414af4bee34933cbc117d2449))
* **ce-demo-reel:** add local save as alternative to catbox upload ([#647](https://github.com/EveryInc/compound-engineering-plugin/issues/647)) ([fdf5fe4](https://github.com/EveryInc/compound-engineering-plugin/commit/fdf5fe4af56dab1f40cbf83e2e761997bce8c939))
* **ce-plan:** add U-IDs and origin trace to plan template ([#632](https://github.com/EveryInc/compound-engineering-plugin/issues/632)) ([44ce9dd](https://github.com/EveryInc/compound-engineering-plugin/commit/44ce9dd127ccbc300b18051aa2bf7c718112a79c))
* **ce-proof:** broaden triggers and surface markdown viewing ([#618](https://github.com/EveryInc/compound-engineering-plugin/issues/618)) ([e0f2a4f](https://github.com/EveryInc/compound-engineering-plugin/commit/e0f2a4f9d748124fecb41114856690f88f8fc2e9))
* **ce-resolve-pr-feedback:** drop bot noise, centralize test runs ([#610](https://github.com/EveryInc/compound-engineering-plugin/issues/610)) ([b35de99](https://github.com/EveryInc/compound-engineering-plugin/commit/b35de997884e9d6cf69ef19c983d9e61cf9e4bd8))
* **ce-resolve-pr-feedback:** tighten clustering to cross-round only ([#611](https://github.com/EveryInc/compound-engineering-plugin/issues/611)) ([2dd0a6e](https://github.com/EveryInc/compound-engineering-plugin/commit/2dd0a6e6c73abcd74c3709583e03cace63116cdf))
* **ce-review:** add per-finding judgment loop to Interactive mode ([#590](https://github.com/EveryInc/compound-engineering-plugin/issues/590)) ([27cbaf8](https://github.com/EveryInc/compound-engineering-plugin/commit/27cbaf8161af8aad3260b58d0d9de03d6180a66c))
* **ce-setup:** check for ast-grep CLI and agent skill ([#653](https://github.com/EveryInc/compound-engineering-plugin/issues/653)) ([23dc11b](https://github.com/EveryInc/compound-engineering-plugin/commit/23dc11b95ae46dc6be0308306de5c8f16329fe49))
* **codex:** native plugin install manifests + agents-only converter ([#616](https://github.com/EveryInc/compound-engineering-plugin/issues/616)) ([3ed4a4f](https://github.com/EveryInc/compound-engineering-plugin/commit/3ed4a4fa0f6f4d08144ae7598af391b4f070b649))
* **doc-review, learnings-researcher:** tiers, chain grouping, rewrite ([#601](https://github.com/EveryInc/compound-engineering-plugin/issues/601)) ([c1f68d4](https://github.com/EveryInc/compound-engineering-plugin/commit/c1f68d4d55ebf6085eaa7c177bf5c2e7a2cfb62c))
* **pi:** first-class support via pi-subagents + pi-ask-user ([#651](https://github.com/EveryInc/compound-engineering-plugin/issues/651)) ([7ddfbed](https://github.com/EveryInc/compound-engineering-plugin/commit/7ddfbed33b08e5ad0dc56a3ecc19adb9a10ebb2c))


### Bug Fixes

* **ce-compound:** quote YAML array items starting with reserved indicators ([#613](https://github.com/EveryInc/compound-engineering-plugin/issues/613)) ([d8436b9](https://github.com/EveryInc/compound-engineering-plugin/commit/d8436b9a3c5b5370e51ec168a251ccb45f0d826e))
* **ce-debug:** stop hanging handoffs and read full issue thread ([#646](https://github.com/EveryInc/compound-engineering-plugin/issues/646)) ([86d9a2c](https://github.com/EveryInc/compound-engineering-plugin/commit/86d9a2c55f49eb49dbbc3d918ce859dbe273d44e))
* **ce-gemini-imagegen:** bump Pillow floor to 10.3.0 to clear 4 CVEs ([#608](https://github.com/EveryInc/compound-engineering-plugin/issues/608)) ([e152428](https://github.com/EveryInc/compound-engineering-plugin/commit/e1524287f73ea1ec9598aa63c05a31745ff503c7))
* **ce-learnings-researcher:** drop unreadable schema path reference ([#630](https://github.com/EveryInc/compound-engineering-plugin/issues/630)) ([05ea109](https://github.com/EveryInc/compound-engineering-plugin/commit/05ea109bdb68c6f7686d7ab4f52518d9a23a903e))
* **ce-plan:** close exit gates and honor user-named resources ([#597](https://github.com/EveryInc/compound-engineering-plugin/issues/597)) ([d8e87c1](https://github.com/EveryInc/compound-engineering-plugin/commit/d8e87c17907b53bead27c223c5f10c7e765d67d8))
* **ce-plan:** inline handoff menu so post-plan options are never skipped ([#615](https://github.com/EveryInc/compound-engineering-plugin/issues/615)) ([9497a00](https://github.com/EveryInc/compound-engineering-plugin/commit/9497a00d90bdedf6d1741aa4cf1287fb139ed990))
* **ce-plan:** run ambiguity gate before the non-software catch-all ([#598](https://github.com/EveryInc/compound-engineering-plugin/issues/598)) ([49249d7](https://github.com/EveryInc/compound-engineering-plugin/commit/49249d73170b64046a9a6ba38186d483f28047bd))
* **ce-pr-description:** cap description size and add pre-apply preview ([#605](https://github.com/EveryInc/compound-engineering-plugin/issues/605)) ([409b07f](https://github.com/EveryInc/compound-engineering-plugin/commit/409b07fbc75148f2c149c1e66744549f5f1dcd58))
* **ce-release-notes:** backtick-wrap `<skill-name>` token in description ([#603](https://github.com/EveryInc/compound-engineering-plugin/issues/603)) ([2aee4d4](https://github.com/EveryInc/compound-engineering-plugin/commit/2aee4d42031892e7937640a003d11fad82420944))
* **ce-resolve-pr-feedback:** stop dropping unresolved and actionable feedback ([#617](https://github.com/EveryInc/compound-engineering-plugin/issues/617)) ([153bea8](https://github.com/EveryInc/compound-engineering-plugin/commit/153bea8669d63848f57942e842cd58ed664e7435))
* **ce-update:** derive cache dir from CLAUDE_PLUGIN_ROOT parent ([#645](https://github.com/EveryInc/compound-engineering-plugin/issues/645)) ([6155b9d](https://github.com/EveryInc/compound-engineering-plugin/commit/6155b9de3c2d60ca424386f2dfcb0dfa7668f2c1))
* **ce-work:** reject plan re-scoping into human-time phases ([#600](https://github.com/EveryInc/compound-engineering-plugin/issues/600)) ([b575e49](https://github.com/EveryInc/compound-engineering-plugin/commit/b575e49c291371b178775a2bd50dbb1cc16210f5))
* **lfg:** use platform-neutral skill references ([#642](https://github.com/EveryInc/compound-engineering-plugin/issues/642)) ([b104ce4](https://github.com/EveryInc/compound-engineering-plugin/commit/b104ce46bea4b1b9b0e9cfbdd9203dbc5a0aa510))
* **question-tool:** stop silent skips when tool looks unavailable ([#620](https://github.com/EveryInc/compound-engineering-plugin/issues/620)) ([d359cc7](https://github.com/EveryInc/compound-engineering-plugin/commit/d359cc7e2f4dd5e920e7daa6dbd1eddc8f53bc19))
* **skills:** cap skill descriptions at harness limit ([#643](https://github.com/EveryInc/compound-engineering-plugin/issues/643)) ([13f95ba](https://github.com/EveryInc/compound-engineering-plugin/commit/13f95ba6392f86aa8dd9b4430b84f0b7523c6c89))


### Code Refactoring

* **cli:** rename all skills and agents to consistent ce- prefix ([#503](https://github.com/EveryInc/compound-engineering-plugin/issues/503)) ([5c0ec91](https://github.com/EveryInc/compound-engineering-plugin/commit/5c0ec9137a7350534e32db91e8bad66f02693716))

## [2.68.1](https://github.com/EveryInc/compound-engineering-plugin/compare/compound-engineering-v2.68.0...compound-engineering-v2.68.1) (2026-04-18)


### Bug Fixes

* **ce-compound-refresh:** restore ce:compound hand-off ([#591](https://github.com/EveryInc/compound-engineering-plugin/issues/591)) ([821c69c](https://github.com/EveryInc/compound-engineering-plugin/commit/821c69c567269ed617c56d95564f7ba1d883f364))
* **ce-pr-description:** mark return block as hand-off ([#593](https://github.com/EveryInc/compound-engineering-plugin/issues/593)) ([cc78551](https://github.com/EveryInc/compound-engineering-plugin/commit/cc78551e7cac788d5e43efc835c040f696e5b936))
* **git-commit-push-pr:** apply PR description after delegate hand-off ([#594](https://github.com/EveryInc/compound-engineering-plugin/issues/594)) ([1afd63c](https://github.com/EveryInc/compound-engineering-plugin/commit/1afd63cc764173368a30cbd92af704f5b7602e6d))

## [2.68.0](https://github.com/EveryInc/compound-engineering-plugin/compare/compound-engineering-v2.67.0...compound-engineering-v2.68.0) (2026-04-17)


### Features

* **ce-ideate:** mode-aware v2 ideation ([#588](https://github.com/EveryInc/compound-engineering-plugin/issues/588)) ([12aaad3](https://github.com/EveryInc/compound-engineering-plugin/commit/12aaad31ebd17686db1a75d1d3575da79d1dad2b))
* **ce-release-notes:** add skill for browsing plugin release history ([#589](https://github.com/EveryInc/compound-engineering-plugin/issues/589)) ([59dbaef](https://github.com/EveryInc/compound-engineering-plugin/commit/59dbaef37607354d103113f05c13b731eecbb690))
* **proof, ce-brainstorm, ce-plan, ce-ideate:** HITL review-loop mode ([#580](https://github.com/EveryInc/compound-engineering-plugin/issues/580)) ([e7cf0ae](https://github.com/EveryInc/compound-engineering-plugin/commit/e7cf0ae9571e260a00db458dd8e2281c37f1ec8b))

## [2.67.0](https://github.com/EveryInc/compound-engineering-plugin/compare/compound-engineering-v2.66.1...compound-engineering-v2.67.0) (2026-04-17)


### Features

* **ce-polish-beta:** human-in-the-loop polish phase between /ce:review and merge ([#568](https://github.com/EveryInc/compound-engineering-plugin/issues/568)) ([070092d](https://github.com/EveryInc/compound-engineering-plugin/commit/070092d997bcc3306016e9258150d3071f017ef8))


### Bug Fixes

* **ce-plan, ce-brainstorm:** reliable interactive handoff menus ([#575](https://github.com/EveryInc/compound-engineering-plugin/issues/575)) ([3d96c0f](https://github.com/EveryInc/compound-engineering-plugin/commit/3d96c0f074faf56fcdc835a0332e0f475dc8425f))
* **ce-pr-description:** hand off PR body via temp file ([#581](https://github.com/EveryInc/compound-engineering-plugin/issues/581)) ([c89f18a](https://github.com/EveryInc/compound-engineering-plugin/commit/c89f18a1151aa289bcc293dc26ff49a011782c7b))
* **resolve-pr-feedback:** unblock /loop scheduling ([#582](https://github.com/EveryInc/compound-engineering-plugin/issues/582)) ([4ccadcf](https://github.com/EveryInc/compound-engineering-plugin/commit/4ccadcfd3fb3a08666aa4c808a123500bb14ac46))


### Miscellaneous Chores

* **claude-permissions-optimizer:** drop skill in favor of /less-permission-prompts ([#583](https://github.com/EveryInc/compound-engineering-plugin/issues/583)) ([729fa19](https://github.com/EveryInc/compound-engineering-plugin/commit/729fa191b60305d8f3761f6441d1d3d15c5f48aa))

## [2.66.1](https://github.com/EveryInc/compound-engineering-plugin/compare/compound-engineering-v2.66.0...compound-engineering-v2.66.1) (2026-04-16)


### Bug Fixes

* **ce-compound, ce-compound-refresh:** use injected memory block ([#569](https://github.com/EveryInc/compound-engineering-plugin/issues/569)) ([0b3d4b2](https://github.com/EveryInc/compound-engineering-plugin/commit/0b3d4b283c8e3165931816607cf86017d8273bbe))

## [2.66.0](https://github.com/EveryInc/compound-engineering-plugin/compare/compound-engineering-v2.65.0...compound-engineering-v2.66.0) (2026-04-15)


### Features

* **ce-optimize:** Auto-research loop for tuning system prompts / vector clustering / evaluating different code solution / etc ([#446](https://github.com/EveryInc/compound-engineering-plugin/issues/446)) ([8f20aa0](https://github.com/EveryInc/compound-engineering-plugin/commit/8f20aa0406a7cda4ff11da45b971e38681650678))
* **ce-pr-description:** focused skill for PR description generation ([#561](https://github.com/EveryInc/compound-engineering-plugin/issues/561)) ([8ec6d33](https://github.com/EveryInc/compound-engineering-plugin/commit/8ec6d339fee38cf4306e6586f726486cbae713b0))


### Bug Fixes

* **ce-plan:** close escape hatches that let the skill abandon direct invocations ([#554](https://github.com/EveryInc/compound-engineering-plugin/issues/554)) ([e4d5f24](https://github.com/EveryInc/compound-engineering-plugin/commit/e4d5f241bd3945784905a32d7fb7ef9305c621e8))
* **ce-review:** always fetch base branch to prevent stale merge-base ([#544](https://github.com/EveryInc/compound-engineering-plugin/issues/544)) ([4e0ed2c](https://github.com/EveryInc/compound-engineering-plugin/commit/4e0ed2cc8ddadf6d5504210e1210728e6f7cc9aa))
* **ce-update:** use correct marketplace name in cache path ([#566](https://github.com/EveryInc/compound-engineering-plugin/issues/566)) ([d8305dd](https://github.com/EveryInc/compound-engineering-plugin/commit/d8305dd159ebe9d89df9c4af5a7d0fb2b128801b))
* **ce-work,ce-work-beta:** add safety checks for parallel subagent dispatch ([#557](https://github.com/EveryInc/compound-engineering-plugin/issues/557)) ([5cae4d1](https://github.com/EveryInc/compound-engineering-plugin/commit/5cae4d1dab212d7e438f0b081986e987c860d4d5))
* **document-review, review:** restrict reviewer agents to read-only tools ([#553](https://github.com/EveryInc/compound-engineering-plugin/issues/553)) ([e45c435](https://github.com/EveryInc/compound-engineering-plugin/commit/e45c435b996f7c0bf5ae0e23c0ab95b3fbd9204c))
* **git-commit-push-pr:** rewrite descriptions as net result, not changelog ([#558](https://github.com/EveryInc/compound-engineering-plugin/issues/558)) ([a559903](https://github.com/EveryInc/compound-engineering-plugin/commit/a55990387d48fa7af598880746ff862cc8f10acd))

## [2.65.0](https://github.com/EveryInc/compound-engineering-plugin/compare/compound-engineering-v2.64.0...compound-engineering-v2.65.0) (2026-04-11)


### Features

* **ce-setup:** unified setup skill with dependency management and config bootstrapping ([#345](https://github.com/EveryInc/compound-engineering-plugin/issues/345)) ([354dbb7](https://github.com/EveryInc/compound-engineering-plugin/commit/354dbb75828f0152f4cbbb3b50ce4511fa6710c7))


### Bug Fixes

* **ce-demo-reel:** two-stage upload for reviewable approval gate ([#546](https://github.com/EveryInc/compound-engineering-plugin/issues/546)) ([5454053](https://github.com/EveryInc/compound-engineering-plugin/commit/545405380dba78bc0efd35f7675e8c27d99bf8c9))
* **cleanup:** remove rclone, agent-browser, lint, and bug-reproduction-validator ([#545](https://github.com/EveryInc/compound-engineering-plugin/issues/545)) ([1372b2c](https://github.com/EveryInc/compound-engineering-plugin/commit/1372b2cffd06989dee8eb9df26d7c94ac30f032a))

## [2.64.0](https://github.com/EveryInc/compound-engineering-plugin/compare/compound-engineering-v2.63.1...compound-engineering-v2.64.0) (2026-04-10)


### Features

* **ce-debug:** add systematic debugging skill ([#543](https://github.com/EveryInc/compound-engineering-plugin/issues/543)) ([e38223a](https://github.com/EveryInc/compound-engineering-plugin/commit/e38223ae91921ebacabd10ff7cd1105ba3c10b25))
* **ce-demo-reel:** add demo reel skill with Python capture pipeline ([#541](https://github.com/EveryInc/compound-engineering-plugin/issues/541)) ([b979143](https://github.com/EveryInc/compound-engineering-plugin/commit/b979143ad0460a985dd224e7f1858416d79551fb))
* **ce-plan:** add output structure and scope sub-categorization ([#542](https://github.com/EveryInc/compound-engineering-plugin/issues/542)) ([f3cc754](https://github.com/EveryInc/compound-engineering-plugin/commit/f3cc7545e5eca0c3774b2803fa5515ff98a8fc1e))
* **ce-review:** add compact returns to reduce orchestrator context during merge ([#535](https://github.com/EveryInc/compound-engineering-plugin/issues/535)) ([a5ce094](https://github.com/EveryInc/compound-engineering-plugin/commit/a5ce09477291766ffc03e0ae4e9e1e0f80560c2b))
* **ce-update:** add plugin version check skill and ce_platforms filtering ([#532](https://github.com/EveryInc/compound-engineering-plugin/issues/532)) ([d37f0ed](https://github.com/EveryInc/compound-engineering-plugin/commit/d37f0ed16f94aaec2a7b435a0aaa018de5631ed3))
* **ce-work-beta:** add beta Codex delegation mode ([#476](https://github.com/EveryInc/compound-engineering-plugin/issues/476)) ([31b0686](https://github.com/EveryInc/compound-engineering-plugin/commit/31b0686c2e88808381560314f10ce276c86e11e2))
* **ce-work:** reduce token usage by extracting late-sequence references ([#540](https://github.com/EveryInc/compound-engineering-plugin/issues/540)) ([bb59547](https://github.com/EveryInc/compound-engineering-plugin/commit/bb59547a2efdd4e7213c149f51abd9c9a17016dd))
* **session-historian:** cross-platform session history agent and /ce-sessions skill ([#534](https://github.com/EveryInc/compound-engineering-plugin/issues/534)) ([3208ec7](https://github.com/EveryInc/compound-engineering-plugin/commit/3208ec71f8f2209abc76baf97e3967406755317d))
* **slack-researcher:** add /ce-slack-research skill and improve agent ([#538](https://github.com/EveryInc/compound-engineering-plugin/issues/538)) ([042ee73](https://github.com/EveryInc/compound-engineering-plugin/commit/042ee732398d1f41b9b91953569a54e40303332d))


### Bug Fixes

* **ce-compound:** explicit mode prompt and lightweight rename ([#528](https://github.com/EveryInc/compound-engineering-plugin/issues/528)) ([0ae91dc](https://github.com/EveryInc/compound-engineering-plugin/commit/0ae91dcc298721e5b2c4ab6d1fc6f76a13b6f67c))
* **git-commit-push-pr:** remove harness slug from badge table ([#539](https://github.com/EveryInc/compound-engineering-plugin/issues/539)) ([044a035](https://github.com/EveryInc/compound-engineering-plugin/commit/044a035e77298c4b8d2152ac2cba36fc00f5b99a))

## [2.63.1](https://github.com/EveryInc/compound-engineering-plugin/compare/compound-engineering-v2.63.0...compound-engineering-v2.63.1) (2026-04-07)


### Bug Fixes

* **ce-review:** add recursion guard to reviewer subagent template ([#527](https://github.com/EveryInc/compound-engineering-plugin/issues/527)) ([bafe9f0](https://github.com/EveryInc/compound-engineering-plugin/commit/bafe9f0968054c78db23e7e7f4d5dbc2ddb4a450))
* **document-review:** widen autofix classification beyond trivial fixes ([#524](https://github.com/EveryInc/compound-engineering-plugin/issues/524)) ([9a82222](https://github.com/EveryInc/compound-engineering-plugin/commit/9a82222aba25d6e64355053fca5954f3dfbd8285))

## [2.63.0](https://github.com/EveryInc/compound-engineering-plugin/compare/compound-engineering-v2.62.1...compound-engineering-v2.63.0) (2026-04-06)


### Features

* **ce-plan,ce-brainstorm:** universal planning and brainstorming for non-software tasks ([#519](https://github.com/EveryInc/compound-engineering-plugin/issues/519)) ([320a045](https://github.com/EveryInc/compound-engineering-plugin/commit/320a04524142830a40a44bd72c4bf5d30931221c))
* **slack-researcher:** add Slack organizational context research agent ([#495](https://github.com/EveryInc/compound-engineering-plugin/issues/495)) ([b3960ec](https://github.com/EveryInc/compound-engineering-plugin/commit/b3960ec64b212d1c8f3885370762e0f124354c28))


### Bug Fixes

* **document-review:** add recursion guard to reviewer subagent template ([#523](https://github.com/EveryInc/compound-engineering-plugin/issues/523)) ([36d8119](https://github.com/EveryInc/compound-engineering-plugin/commit/36d811916637b3436aafd548319e077b6248bae3))
* **review,work:** omit mode parameter in subagent dispatch to respect user permissions ([#522](https://github.com/EveryInc/compound-engineering-plugin/issues/522)) ([949bdef](https://github.com/EveryInc/compound-engineering-plugin/commit/949bdef909ea71e9c5b885e31c028809f0f25017))
* **slack-researcher:** make Slack research opt-in, surface workspace identity ([#521](https://github.com/EveryInc/compound-engineering-plugin/issues/521)) ([6f9069d](https://github.com/EveryInc/compound-engineering-plugin/commit/6f9069df7ac3551677f8f7a1cd7ad51946f88847))

## [2.62.1](https://github.com/EveryInc/compound-engineering-plugin/compare/compound-engineering-v2.62.0...compound-engineering-v2.62.1) (2026-04-05)


### Bug Fixes

* **ce-brainstorm:** reduce token cost by extracting late-sequence content ([#511](https://github.com/EveryInc/compound-engineering-plugin/issues/511)) ([bdeb793](https://github.com/EveryInc/compound-engineering-plugin/commit/bdeb7935fcdb147b73107177769c2e968463d93f))
* **ce-ideate,ce-review:** reduce token cost and latency ([#515](https://github.com/EveryInc/compound-engineering-plugin/issues/515)) ([f4e0904](https://github.com/EveryInc/compound-engineering-plugin/commit/f4e09044ba4073f9447d783bfb7a72326ff7bf6b))
* **document-review:** promote pattern-resolved findings to auto ([#507](https://github.com/EveryInc/compound-engineering-plugin/issues/507)) ([b223e39](https://github.com/EveryInc/compound-engineering-plugin/commit/b223e39a6374566fcc4ae269811d62a2e97c4827))
* **document-review:** reduce token cost and latency ([#509](https://github.com/EveryInc/compound-engineering-plugin/issues/509)) ([9da73a6](https://github.com/EveryInc/compound-engineering-plugin/commit/9da73a60919bfc025efc2ca8b4000c45a7a27b42))
* **git-commit-push-pr:** simplify PR probe pre-resolution ([#513](https://github.com/EveryInc/compound-engineering-plugin/issues/513)) ([f6544eb](https://github.com/EveryInc/compound-engineering-plugin/commit/f6544eba0e6851b8772bb9920583ffda5c80cccc))

## [2.62.0](https://github.com/EveryInc/compound-engineering-plugin/compare/compound-engineering-v2.61.0...compound-engineering-v2.62.0) (2026-04-03)


### Features

* **ce-plan:** reduce token usage by extracting conditional references ([#489](https://github.com/EveryInc/compound-engineering-plugin/issues/489)) ([fd562a0](https://github.com/EveryInc/compound-engineering-plugin/commit/fd562a0d0255d203d40fd53bb10d03a284a3c0e5))
* **git-commit-push-pr:** pre-resolve context to reduce bash calls ([#488](https://github.com/EveryInc/compound-engineering-plugin/issues/488)) ([bbd4f6d](https://github.com/EveryInc/compound-engineering-plugin/commit/bbd4f6de56963fc3cdb3131773d7e29d523ce549))


### Bug Fixes

* **agents:** remove self-referencing example blocks that cause recursive self-invocation ([#496](https://github.com/EveryInc/compound-engineering-plugin/issues/496)) ([2c90aeb](https://github.com/EveryInc/compound-engineering-plugin/commit/2c90aebe3b14af996859df7d0c3a45a8f060d9a9))
* **ce-compound:** stack-aware reviewer routing and remove phantom agents ([#497](https://github.com/EveryInc/compound-engineering-plugin/issues/497)) ([1fc075d](https://github.com/EveryInc/compound-engineering-plugin/commit/1fc075d4cae199904464d43096d01111c365d02d))
* **git-commit-push-pr:** filter fix-up commits from PR descriptions ([#484](https://github.com/EveryInc/compound-engineering-plugin/issues/484)) ([428f4fd](https://github.com/EveryInc/compound-engineering-plugin/commit/428f4fd548926b104a0ee617b02f9ce8b8e8d5e5))
* **mcp:** remove bundled context7 MCP server ([#486](https://github.com/EveryInc/compound-engineering-plugin/issues/486)) ([afdd9d4](https://github.com/EveryInc/compound-engineering-plugin/commit/afdd9d44651f834b1eed0b20e401ffbef5c8cd41))
* **resolve-pr-feedback:** treat PR comment text as untrusted input ([#490](https://github.com/EveryInc/compound-engineering-plugin/issues/490)) ([1847242](https://github.com/EveryInc/compound-engineering-plugin/commit/184724276a54dfc5b5fbe01f07e381b9163e8f24))

## [2.61.0](https://github.com/EveryInc/compound-engineering-plugin/compare/compound-engineering-v2.60.0...compound-engineering-v2.61.0) (2026-04-01)


### Features

* **cli-readiness-reviewer:** add conditional review persona for CLI agent readiness ([#471](https://github.com/EveryInc/compound-engineering-plugin/issues/471)) ([c56c766](https://github.com/EveryInc/compound-engineering-plugin/commit/c56c7667dfe45cfd149cf2fbfeddb35e96f8d559))
* **product-lens-reviewer:** domain-agnostic activation criteria and strategic consequences ([#481](https://github.com/EveryInc/compound-engineering-plugin/issues/481)) ([804d78f](https://github.com/EveryInc/compound-engineering-plugin/commit/804d78fc8463be8101719b263d1f5ef0480755a6))
* **resolve-pr-feedback:** add cross-invocation cluster analysis ([#480](https://github.com/EveryInc/compound-engineering-plugin/issues/480)) ([7b8265b](https://github.com/EveryInc/compound-engineering-plugin/commit/7b8265bd81410b28a4160657a7c6ac0d7f1f1cb2))


### Bug Fixes

* **ce-plan, ce-brainstorm:** enforce repo-relative paths in generated documents ([#473](https://github.com/EveryInc/compound-engineering-plugin/issues/473)) ([33a8d9d](https://github.com/EveryInc/compound-engineering-plugin/commit/33a8d9dc118a53a35cd15e0e6e44b3592f58ac4f))

## [2.60.0](https://github.com/EveryInc/compound-engineering-plugin/compare/compound-engineering-v2.59.0...compound-engineering-v2.60.0) (2026-03-31)


### Features

* **ce-brainstorm:** add conditional visual aids to requirements documents ([#437](https://github.com/EveryInc/compound-engineering-plugin/issues/437)) ([bd02ca7](https://github.com/EveryInc/compound-engineering-plugin/commit/bd02ca7df04cf2c1c6301de3774e99d283d3d3ca))
* **ce-compound:** add discoverability check for docs/solutions/ in instruction files ([#456](https://github.com/EveryInc/compound-engineering-plugin/issues/456)) ([5ac8a2c](https://github.com/EveryInc/compound-engineering-plugin/commit/5ac8a2c2c8c258458307e476d6693cc387deb27e))
* **ce-compound:** add track-based schema for bug vs knowledge learnings ([#445](https://github.com/EveryInc/compound-engineering-plugin/issues/445)) ([739109c](https://github.com/EveryInc/compound-engineering-plugin/commit/739109c03ccd45474331625f35730924d17f63ef))
* **ce-plan:** add conditional visual aids to plan documents ([#440](https://github.com/EveryInc/compound-engineering-plugin/issues/440)) ([4c7f51f](https://github.com/EveryInc/compound-engineering-plugin/commit/4c7f51f35bae56dd9c9dc2653372910c39b8b504))
* **ce-plan:** add interactive deepening mode for on-demand plan strengthening ([#443](https://github.com/EveryInc/compound-engineering-plugin/issues/443)) ([ca78057](https://github.com/EveryInc/compound-engineering-plugin/commit/ca78057241ec64f36c562e3720a388420bdb347f))
* **ce-review:** enforce table format, require question tool, fix autofix_class calibration ([#454](https://github.com/EveryInc/compound-engineering-plugin/issues/454)) ([847ce3f](https://github.com/EveryInc/compound-engineering-plugin/commit/847ce3f156a5cdf75667d9802e95d68e6b3c53a4))
* **ce-review:** improve signal-to-noise with confidence rubric, FP suppression, and intent verification ([#434](https://github.com/EveryInc/compound-engineering-plugin/issues/434)) ([03f5aa6](https://github.com/EveryInc/compound-engineering-plugin/commit/03f5aa65b098e2ab8e25670594e0f554ea3cafbe))
* **ce-work:** suggest branch rename when worktree name is meaningless ([#451](https://github.com/EveryInc/compound-engineering-plugin/issues/451)) ([e872e15](https://github.com/EveryInc/compound-engineering-plugin/commit/e872e15efa5514dcfea84a1a9e276bad3290cbc3))
* **cli-agent-readiness-reviewer:** add smart output defaults criterion ([#448](https://github.com/EveryInc/compound-engineering-plugin/issues/448)) ([a01a8aa](https://github.com/EveryInc/compound-engineering-plugin/commit/a01a8aa0d29474c031a5b403f4f9bfc42a23ad78))
* **git-commit-push-pr:** add conditional visual aids to PR descriptions ([#444](https://github.com/EveryInc/compound-engineering-plugin/issues/444)) ([44e3e77](https://github.com/EveryInc/compound-engineering-plugin/commit/44e3e77dc039d31a86194b0254e4e92839d9d5e9))
* **git-commit-push-pr:** precompute shield badge version via skill preprocessing ([#464](https://github.com/EveryInc/compound-engineering-plugin/issues/464)) ([6ca7aef](https://github.com/EveryInc/compound-engineering-plugin/commit/6ca7aef7f33ebdf29f579cb4342c209d2bd40aad))
* **resolve-pr-feedback:** add gated feedback clustering to detect systemic issues ([#441](https://github.com/EveryInc/compound-engineering-plugin/issues/441)) ([a301a08](https://github.com/EveryInc/compound-engineering-plugin/commit/a301a082057494e122294f4e7c1c3f5f87103f35))
* **skills:** clean up argument-hint across ce:* skills ([#436](https://github.com/EveryInc/compound-engineering-plugin/issues/436)) ([d2b24e0](https://github.com/EveryInc/compound-engineering-plugin/commit/d2b24e07f6f2fde11cac65258cb1e76927238b5d))
* **test-xcode:** add triggering context to skill description ([#466](https://github.com/EveryInc/compound-engineering-plugin/issues/466)) ([87facd0](https://github.com/EveryInc/compound-engineering-plugin/commit/87facd05dac94603780d75acb9da381dd7c61f1b))
* **testing:** close the testing gap in ce:work, ce:plan, and testing-reviewer ([#438](https://github.com/EveryInc/compound-engineering-plugin/issues/438)) ([35678b8](https://github.com/EveryInc/compound-engineering-plugin/commit/35678b8add6a603cf9939564bcd2df6b83338c52))


### Bug Fixes

* **ce-brainstorm:** distinguish verification from technical design in Phase 1.1 ([#465](https://github.com/EveryInc/compound-engineering-plugin/issues/465)) ([8ec31d7](https://github.com/EveryInc/compound-engineering-plugin/commit/8ec31d703fc9ed19bf6377da0a9a29da935b719d))
* **ce-compound:** require question tool for "What's next?" prompt ([#460](https://github.com/EveryInc/compound-engineering-plugin/issues/460)) ([9bf3b07](https://github.com/EveryInc/compound-engineering-plugin/commit/9bf3b07185a4aeb6490116edec48599b736dc86f))
* **ce-plan:** reinforce mandatory document-review after auto deepening ([#450](https://github.com/EveryInc/compound-engineering-plugin/issues/450)) ([42fa8c3](https://github.com/EveryInc/compound-engineering-plugin/commit/42fa8c3e084db464ee0e04673f7c38cd422b32d6))
* **ce-plan:** route confidence-gate pass to document-review ([#462](https://github.com/EveryInc/compound-engineering-plugin/issues/462)) ([1962f54](https://github.com/EveryInc/compound-engineering-plugin/commit/1962f546b5e5288c7ce5d8658f942faf71651c81))
* **ce-work:** make code review invocation mandatory by default ([#453](https://github.com/EveryInc/compound-engineering-plugin/issues/453)) ([7f3aba2](https://github.com/EveryInc/compound-engineering-plugin/commit/7f3aba29e84c3166de75438d554455a71f4f3c22))
* **document-review:** show contextual next-step in Phase 5 menu ([#459](https://github.com/EveryInc/compound-engineering-plugin/issues/459)) ([2b7283d](https://github.com/EveryInc/compound-engineering-plugin/commit/2b7283da7b48dc073670c5f4d116e58255f0ffcb))
* **git-commit-push-pr:** quiet expected no-pr gh exit ([#439](https://github.com/EveryInc/compound-engineering-plugin/issues/439)) ([1f49948](https://github.com/EveryInc/compound-engineering-plugin/commit/1f499482bc65456fa7dd0f73fb7f2fa58a4c5910))
* **resolve-pr-feedback:** add actionability filter and lower cluster gate to 3+ ([#461](https://github.com/EveryInc/compound-engineering-plugin/issues/461)) ([2619ad9](https://github.com/EveryInc/compound-engineering-plugin/commit/2619ad9f58e6c45968ec10d7f8aa7849fe43eb25))
* **review:** harden ce-review base resolution ([#452](https://github.com/EveryInc/compound-engineering-plugin/issues/452)) ([638b38a](https://github.com/EveryInc/compound-engineering-plugin/commit/638b38abd267d415ad2d6b72eba3dfe12beefad9))

## [2.59.0](https://github.com/EveryInc/compound-engineering-plugin/compare/compound-engineering-v2.58.1...compound-engineering-v2.59.0) (2026-03-29)


### Features

* **ce-review:** add headless mode for programmatic callers ([#430](https://github.com/EveryInc/compound-engineering-plugin/issues/430)) ([3706a97](https://github.com/EveryInc/compound-engineering-plugin/commit/3706a9764b6e73b7a155771956646ddef73f04a5))
* **ce-work:** accept bare prompts and add test discovery ([#423](https://github.com/EveryInc/compound-engineering-plugin/issues/423)) ([6dabae6](https://github.com/EveryInc/compound-engineering-plugin/commit/6dabae6683fb2c37dc47616f172835eacc105d11))
* **document-review:** collapse batch_confirm tier into auto ([#432](https://github.com/EveryInc/compound-engineering-plugin/issues/432)) ([0f5715d](https://github.com/EveryInc/compound-engineering-plugin/commit/0f5715d562fffc626ddfde7bd0e1652143710a44))
* **review:** make review mandatory across pipeline skills ([#433](https://github.com/EveryInc/compound-engineering-plugin/issues/433)) ([9caaf07](https://github.com/EveryInc/compound-engineering-plugin/commit/9caaf071d9b74fd938567542167768f6cdb7a56f))

## [2.58.1](https://github.com/EveryInc/compound-engineering-plugin/compare/compound-engineering-v2.58.0...compound-engineering-v2.58.1) (2026-03-28)


### Miscellaneous Chores

* **compound-engineering:** Synchronize compound-engineering versions

## [2.57.0](https://github.com/EveryInc/compound-engineering-plugin/compare/compound-engineering-v2.56.1...compound-engineering-v2.57.0) (2026-03-28)


### Features

* **document-review:** add headless mode for programmatic callers ([#425](https://github.com/EveryInc/compound-engineering-plugin/issues/425)) ([4e4a656](https://github.com/EveryInc/compound-engineering-plugin/commit/4e4a6563b4aa7375e9d1c54bd73442f3b675f100))

## [2.56.1](https://github.com/EveryInc/compound-engineering-plugin/compare/compound-engineering-v2.56.0...compound-engineering-v2.56.1) (2026-03-28)


### Bug Fixes

* **onboarding:** resolve section count contradiction with skip rule ([#421](https://github.com/EveryInc/compound-engineering-plugin/issues/421)) ([d2436e7](https://github.com/EveryInc/compound-engineering-plugin/commit/d2436e7c933129784c67799a5b9555bccce2e46d))

## [2.56.0](https://github.com/EveryInc/compound-engineering-plugin/compare/compound-engineering-v2.55.0...compound-engineering-v2.56.0) (2026-03-28)


### Features

* **ce-plan:** add decision matrix form, unchanged invariants, and risk table format ([#417](https://github.com/EveryInc/compound-engineering-plugin/issues/417)) ([ccb371e](https://github.com/EveryInc/compound-engineering-plugin/commit/ccb371e0b7917420f5ca2c58433f5fc057211f04))


### Bug Fixes

* **cli-agent-readiness-reviewer:** remove top-5 cap on improvements ([#419](https://github.com/EveryInc/compound-engineering-plugin/issues/419)) ([16eb8b6](https://github.com/EveryInc/compound-engineering-plugin/commit/16eb8b660790f8de820d0fba709316c7270703c1))
* **document-review:** enforce interactive questions and fix autofix classification ([#415](https://github.com/EveryInc/compound-engineering-plugin/issues/415)) ([d447296](https://github.com/EveryInc/compound-engineering-plugin/commit/d44729603da0c73d4959c372fac0198125a39c60))

## [2.55.0](https://github.com/EveryInc/compound-engineering-plugin/compare/compound-engineering-v2.54.1...compound-engineering-v2.55.0) (2026-03-27)


### Features

* add adversarial review agents for code and documents ([#403](https://github.com/EveryInc/compound-engineering-plugin/issues/403)) ([5e6cd5c](https://github.com/EveryInc/compound-engineering-plugin/commit/5e6cd5c90950588fb9b0bc3a5cbecba2a1387080))
* add CLI agent-readiness reviewer and principles guide ([#391](https://github.com/EveryInc/compound-engineering-plugin/issues/391)) ([13aa3fa](https://github.com/EveryInc/compound-engineering-plugin/commit/13aa3fa8465dce6c037e1bb8982a2edad13f199a))
* add project-standards-reviewer as always-on ce:review persona ([#402](https://github.com/EveryInc/compound-engineering-plugin/issues/402)) ([b30288c](https://github.com/EveryInc/compound-engineering-plugin/commit/b30288c44e500013afe30b34f744af57cae117db))
* **ce-brainstorm:** group requirements by logical concern, tighten autofix classification ([#412](https://github.com/EveryInc/compound-engineering-plugin/issues/412)) ([90684c4](https://github.com/EveryInc/compound-engineering-plugin/commit/90684c4e8272b41c098ef2452c40d86d460ea578))
* **ce-plan:** strengthen test scenario guidance across plan and work skills ([#410](https://github.com/EveryInc/compound-engineering-plugin/issues/410)) ([615ec5d](https://github.com/EveryInc/compound-engineering-plugin/commit/615ec5d3feb14785530bbfe2b4a50afe29ccbc47))
* **ce-review:** add base: and plan: arguments, extract scope detection ([#405](https://github.com/EveryInc/compound-engineering-plugin/issues/405)) ([914f9b0](https://github.com/EveryInc/compound-engineering-plugin/commit/914f9b0d9822786d9ba6dc2307a543ae5a25c6e9))
* **document-review:** smarter autofix, batch-confirm, and error/omission classification ([#401](https://github.com/EveryInc/compound-engineering-plugin/issues/401)) ([0863cfa](https://github.com/EveryInc/compound-engineering-plugin/commit/0863cfa4cbebcd121b0757abf374e5095d42f989))
* **onboarding:** add consumer perspective and split architecture diagrams ([#413](https://github.com/EveryInc/compound-engineering-plugin/issues/413)) ([31326a5](https://github.com/EveryInc/compound-engineering-plugin/commit/31326a54584a12c473944fa488bea26410fd6fce))


### Bug Fixes

* add strict YAML validation for plugin frontmatter ([#399](https://github.com/EveryInc/compound-engineering-plugin/issues/399)) ([0877b69](https://github.com/EveryInc/compound-engineering-plugin/commit/0877b693ced341cec699ea959dc39f8bd78f33ef))
* consolidate compound-docs into ce-compound skill ([#390](https://github.com/EveryInc/compound-engineering-plugin/issues/390)) ([daddb7d](https://github.com/EveryInc/compound-engineering-plugin/commit/daddb7d72f280a3bd9645c54d091844c198a324d))
* document SwiftUI Text link tap limitation in test-xcode skill ([#400](https://github.com/EveryInc/compound-engineering-plugin/issues/400)) ([6ddaec3](https://github.com/EveryInc/compound-engineering-plugin/commit/6ddaec3b6ed5b6a91aeaddadff3960714ef10dc1))
* harden git workflow skills with better state handling ([#406](https://github.com/EveryInc/compound-engineering-plugin/issues/406)) ([f83305e](https://github.com/EveryInc/compound-engineering-plugin/commit/f83305e22af09c37f452cf723c1b08bb0e7c8bdf))
* improve agent-native-reviewer with triage, prioritization, and stack-aware search ([#387](https://github.com/EveryInc/compound-engineering-plugin/issues/387)) ([e792166](https://github.com/EveryInc/compound-engineering-plugin/commit/e7921660ad42db8e9af56ec36f36ce8d1af13238))
* replace broken markdown link refs in skills ([#392](https://github.com/EveryInc/compound-engineering-plugin/issues/392)) ([506ad01](https://github.com/EveryInc/compound-engineering-plugin/commit/506ad01b4f056b0d8d0d440bfb7821f050aba156))

## [2.54.1](https://github.com/EveryInc/compound-engineering-plugin/compare/compound-engineering-v2.54.0...compound-engineering-v2.54.1) (2026-03-26)


### Bug Fixes

* prevent orphaned opening paragraphs in PR descriptions ([#393](https://github.com/EveryInc/compound-engineering-plugin/issues/393)) ([4b44a94](https://github.com/EveryInc/compound-engineering-plugin/commit/4b44a94e23c8621771b8813caebce78060a61611))

## [2.54.0](https://github.com/EveryInc/compound-engineering-plugin/compare/compound-engineering-v2.53.0...compound-engineering-v2.54.0) (2026-03-26)


### Features

* add new `onboarding` skill to create onboarding guide for repo ([#384](https://github.com/EveryInc/compound-engineering-plugin/issues/384)) ([27b9831](https://github.com/EveryInc/compound-engineering-plugin/commit/27b9831084d69c4c8cf13d0a45c901268420de59))
* replace manual review agent config with ce:review delegation ([#381](https://github.com/EveryInc/compound-engineering-plugin/issues/381)) ([fed9fd6](https://github.com/EveryInc/compound-engineering-plugin/commit/fed9fd68db283c64ec11293f88a8ad7a6373e2fe))


### Bug Fixes

* add default-branch guard to commit skills ([#386](https://github.com/EveryInc/compound-engineering-plugin/issues/386)) ([31f07c0](https://github.com/EveryInc/compound-engineering-plugin/commit/31f07c00473e9d8bd6d447cf04081c0a9631e34a))
* scope commit-push-pr descriptions to full branch diff ([#385](https://github.com/EveryInc/compound-engineering-plugin/issues/385)) ([355e739](https://github.com/EveryInc/compound-engineering-plugin/commit/355e7392b21a28c8725f87a8f9c473a86543ce4a))

## [2.53.0](https://github.com/EveryInc/compound-engineering-plugin/compare/compound-engineering-v2.52.0...compound-engineering-v2.53.0) (2026-03-25)


### Features

* add git commit and branch helper skills ([#378](https://github.com/EveryInc/compound-engineering-plugin/issues/378)) ([fe08af2](https://github.com/EveryInc/compound-engineering-plugin/commit/fe08af2b417b707b6d3192a954af7ff2ab0fe667))
* improve `resolve-pr-feedback` skill ([#379](https://github.com/EveryInc/compound-engineering-plugin/issues/379)) ([2ba4f3f](https://github.com/EveryInc/compound-engineering-plugin/commit/2ba4f3fd58d4e57dfc6c314c2992c18ba1fb164b))
* improve commit-push-pr skill with net-result focus and badging ([#380](https://github.com/EveryInc/compound-engineering-plugin/issues/380)) ([efa798c](https://github.com/EveryInc/compound-engineering-plugin/commit/efa798c52cb9d62e9ef32283227a8df68278ff3a))
* integrate orphaned stack-specific reviewers into ce:review ([#375](https://github.com/EveryInc/compound-engineering-plugin/issues/375)) ([ce9016f](https://github.com/EveryInc/compound-engineering-plugin/commit/ce9016fac5fde9a52753cf94a4903088f05aeece))


### Bug Fixes

* guard CONTEXTUAL_RISK_FLAGS lookup against prototype pollution ([#377](https://github.com/EveryInc/compound-engineering-plugin/issues/377)) ([8ebc77b](https://github.com/EveryInc/compound-engineering-plugin/commit/8ebc77b8e6c71e5bef40fcded9131c4457a387d7))

## [2.52.0](https://github.com/EveryInc/compound-engineering-plugin/compare/compound-engineering-v2.51.0...compound-engineering-v2.52.0) (2026-03-25)


### Features

* add consolidation support and overlap detection to `ce:compound` and `ce:compound-refresh` skills ([#372](https://github.com/EveryInc/compound-engineering-plugin/issues/372)) ([fe27f85](https://github.com/EveryInc/compound-engineering-plugin/commit/fe27f85810268a8e713ef2c921f0aec1baf771d7))
* optimize `ce:compound` speed and effectiveness ([#370](https://github.com/EveryInc/compound-engineering-plugin/issues/370)) ([4e3af07](https://github.com/EveryInc/compound-engineering-plugin/commit/4e3af079623ae678b9a79fab5d1726d78f242ec2))
* promote `ce:review-beta` to stable `ce:review` ([#371](https://github.com/EveryInc/compound-engineering-plugin/issues/371)) ([7c5ff44](https://github.com/EveryInc/compound-engineering-plugin/commit/7c5ff445e3065fd13e00bcd57041f6c35b36f90b))
* rationalize todo skill names and optimize skills ([#368](https://github.com/EveryInc/compound-engineering-plugin/issues/368)) ([2612ed6](https://github.com/EveryInc/compound-engineering-plugin/commit/2612ed6b3d86364c74dc024e4ce35dde63fefbf6))

## [2.51.0](https://github.com/EveryInc/compound-engineering-plugin/compare/compound-engineering-v2.50.0...compound-engineering-v2.51.0) (2026-03-24)


### Features

* add `ce:review-beta` with structured persona pipeline ([#348](https://github.com/EveryInc/compound-engineering-plugin/issues/348)) ([e932276](https://github.com/EveryInc/compound-engineering-plugin/commit/e9322768664e194521894fe770b87c7dabbb8a22))
* promote ce:plan-beta and deepen-plan-beta to stable ([#355](https://github.com/EveryInc/compound-engineering-plugin/issues/355)) ([169996a](https://github.com/EveryInc/compound-engineering-plugin/commit/169996a75e98a29db9e07b87b0911cc80270f732))
* redesign `document-review` skill with persona-based review ([#359](https://github.com/EveryInc/compound-engineering-plugin/issues/359)) ([18d22af](https://github.com/EveryInc/compound-engineering-plugin/commit/18d22afde2ae08a50c94efe7493775bc97d9a45a))

## [2.50.0](https://github.com/EveryInc/compound-engineering-plugin/compare/compound-engineering-v2.49.0...compound-engineering-v2.50.0) (2026-03-23)


### Features

* **ce-work:** add Codex delegation mode ([#328](https://github.com/EveryInc/compound-engineering-plugin/issues/328)) ([341c379](https://github.com/EveryInc/compound-engineering-plugin/commit/341c37916861c8bf413244de72f83b93b506575f))
* improve `feature-video` skill with GitHub native video upload ([#344](https://github.com/EveryInc/compound-engineering-plugin/issues/344)) ([4aa50e1](https://github.com/EveryInc/compound-engineering-plugin/commit/4aa50e1bada07e90f36282accb3cd81134e706cd))
* rewrite `frontend-design` skill with layered architecture and visual verification ([#343](https://github.com/EveryInc/compound-engineering-plugin/issues/343)) ([423e692](https://github.com/EveryInc/compound-engineering-plugin/commit/423e69272619e9e3c14750f5219cbf38684b6c96))


### Bug Fixes

* quote frontend-design skill description ([#353](https://github.com/EveryInc/compound-engineering-plugin/issues/353)) ([86342db](https://github.com/EveryInc/compound-engineering-plugin/commit/86342db36c0d09b65afe11241e095dda2ad2cdb0))

## [2.49.0](https://github.com/EveryInc/compound-engineering-plugin/compare/compound-engineering-v2.48.0...compound-engineering-v2.49.0) (2026-03-22)


### Features

* add execution mode toggle and context pressure bounds to parallel skills ([#336](https://github.com/EveryInc/compound-engineering-plugin/issues/336)) ([216d6df](https://github.com/EveryInc/compound-engineering-plugin/commit/216d6dfb2c9320c3354f8c9f30e831fca74865cd))
* fix skill transformation pipeline across all targets ([#334](https://github.com/EveryInc/compound-engineering-plugin/issues/334)) ([4087e1d](https://github.com/EveryInc/compound-engineering-plugin/commit/4087e1df82138f462a64542831224e2718afafa7))
* improve reproduce-bug skill, sync agent-browser, clean up redundant skills ([#333](https://github.com/EveryInc/compound-engineering-plugin/issues/333)) ([affba1a](https://github.com/EveryInc/compound-engineering-plugin/commit/affba1a6a0d9320b529d429ad06fd5a3b5200bd8))

## [2.48.0](https://github.com/EveryInc/compound-engineering-plugin/compare/compound-engineering-v2.47.0...compound-engineering-v2.48.0) (2026-03-22)


### Features

* **git-worktree:** auto-trust mise and direnv configs in new worktrees ([#312](https://github.com/EveryInc/compound-engineering-plugin/issues/312)) ([cfbfb67](https://github.com/EveryInc/compound-engineering-plugin/commit/cfbfb6710a846419cc07ad17d9dbb5b5a065801c))
* make skills platform-agnostic across coding agents ([#330](https://github.com/EveryInc/compound-engineering-plugin/issues/330)) ([52df90a](https://github.com/EveryInc/compound-engineering-plugin/commit/52df90a16688ee023bbdb203969adcc45d7d2ba2))

## [2.47.0](https://github.com/EveryInc/compound-engineering-plugin/compare/compound-engineering-v2.46.0...compound-engineering-v2.47.0) (2026-03-20)


### Features

* improve `repo-research-analyst` by adding a structured technology scan ([#327](https://github.com/EveryInc/compound-engineering-plugin/issues/327)) ([1c28d03](https://github.com/EveryInc/compound-engineering-plugin/commit/1c28d0321401ad50a51989f5e6293d773ac1a477))


### Bug Fixes

* **skills:** update ralph-wiggum references to ralph-loop in lfg/slfg ([#324](https://github.com/EveryInc/compound-engineering-plugin/issues/324)) ([ac756a2](https://github.com/EveryInc/compound-engineering-plugin/commit/ac756a267c5e3d5e4ceb2f99939dbb93491ac4d2))

## [2.46.0](https://github.com/EveryInc/compound-engineering-plugin/compare/compound-engineering-v2.45.0...compound-engineering-v2.46.0) (2026-03-20)


### Features

* add optional high-level technical design to plan-beta skills ([#322](https://github.com/EveryInc/compound-engineering-plugin/issues/322)) ([3ba4935](https://github.com/EveryInc/compound-engineering-plugin/commit/3ba4935926b05586da488119f215057164d97489))

## [2.45.0](https://github.com/EveryInc/compound-engineering-plugin/compare/compound-engineering-v2.44.0...compound-engineering-v2.45.0) (2026-03-19)


### Features

* edit resolve_todos_parallel skill for complete todo lifecycle ([#292](https://github.com/EveryInc/compound-engineering-plugin/issues/292)) ([88c89bc](https://github.com/EveryInc/compound-engineering-plugin/commit/88c89bc204c928d2f36e2d1f117d16c998ecd096))
* integrate claude code auto memory as supplementary data source for ce:compound and ce:compound-refresh ([#311](https://github.com/EveryInc/compound-engineering-plugin/issues/311)) ([5c1452d](https://github.com/EveryInc/compound-engineering-plugin/commit/5c1452d4cc80b623754dd6fe09c2e5b6ae86e72e))

## [2.44.0](https://github.com/EveryInc/compound-engineering-plugin/compare/compound-engineering-v2.43.0...compound-engineering-v2.44.0) (2026-03-18)


### Features

* **plugin:** add execution posture signaling to ce:plan-beta and ce:work ([#309](https://github.com/EveryInc/compound-engineering-plugin/issues/309)) ([748f72a](https://github.com/EveryInc/compound-engineering-plugin/commit/748f72a57f713893af03a4d8ed69c2311f492dbd))

## [2.39.0] - 2026-03-10

### Added

- **ce:compound context budget precheck** — Warns when context is constrained and offers compact-safe mode to avoid compaction mid-compound ([#235](https://github.com/EveryInc/compound-engineering-plugin/pull/235))
- **ce:plan daily sequence numbers** — Plan filenames now include a 3-digit daily sequence number (e.g., `2026-03-10-001-feat-...`) to prevent collisions ([#238](https://github.com/EveryInc/compound-engineering-plugin/pull/238))
- **ce:review serial mode** — Pass `--serial` flag (or auto-detects when 6+ agents configured) to run review agents sequentially, preventing context limit crashes ([#237](https://github.com/EveryInc/compound-engineering-plugin/pull/237))
- **agent-browser inspection & debugging commands** — Added JS eval, console/errors, network, storage, device emulation, element debugging, recording/tracing, tabs, and advanced mouse commands to agent-browser skill ([#236](https://github.com/EveryInc/compound-engineering-plugin/pull/236))
- **test-browser port detection** — Auto-detects dev server port from CLAUDE.md, package.json, or .env files; supports `--port` flag ([#233](https://github.com/EveryInc/compound-engineering-plugin/pull/233))
- **lfg phase gating** — Added explicit GATE checks between /lfg steps to enforce plan-before-work ordering ([#231](https://github.com/EveryInc/compound-engineering-plugin/pull/231))

### Fixed

- **Context7 API key auth** — MCP server config now passes `CONTEXT7_API_KEY` via `x-api-key` header to avoid anonymous rate limits ([#232](https://github.com/EveryInc/compound-engineering-plugin/pull/232))
- **CLI: MCP server merge order** — `sync` now correctly overwrites same-named MCP servers with plugin values instead of preserving stale entries

### Removed

- **every-style-editor agent** — Removed duplicate agent; functionality already exists as `every-style-editor` skill ([#234](https://github.com/EveryInc/compound-engineering-plugin/pull/234))

### Contributors

- Matt Van Horn ([@mvanhorn](https://x.com/mvanhorn)) — PRs #231–#238

---

## [2.38.1] - 2026-03-01

### Fixed

- **Cross-platform `AskUserQuestion` fallback** — `setup` skill and `create-new-skill`/`add-workflow` workflows now include an "Interaction Method" preamble that instructs non-Claude LLMs (Codex, Gemini, Copilot, Kiro) to use numbered lists instead of `AskUserQuestion`, preventing silent auto-configuration. ([#204](https://github.com/EveryInc/compound-engineering-plugin/issues/204))
- **Codex AGENTS.md `AskUserQuestion` mapping** — Strengthened from "ask the user in chat" to structured numbered-list guidance with multi-select support and a "never skip or auto-configure" rule.
- **Skill compliance checklist** — Added `AskUserQuestion` lint rule to `CLAUDE.md` to prevent recurrence.

---

## [2.38.0] - 2026-03-01

### Changed
- `workflows:plan`, `workflows:work`, `workflows:review`, `workflows:brainstorm`, `workflows:compound` renamed to `ce:plan`, `ce:work`, `ce:review`, `ce:brainstorm`, `ce:compound` for clarity — the `ce:` prefix unambiguously identifies these as compound-engineering commands

### Deprecated
- `workflows:*` commands — all five remain functional as aliases that forward to their `ce:*` equivalents with a deprecation notice. Will be removed in a future version.

---

## [2.37.2] - 2026-03-01

### Added

- **CLI: auto-detect install targets** — `bunx @every-env/compound-plugin install compound-engineering --to all` auto-detects installed AI coding tools and installs to all of them in one command. ([#191](https://github.com/EveryInc/compound-engineering-plugin/pull/191))
- **CLI: Gemini sync** — `sync --target gemini` symlinks personal skills to `.gemini/skills/` and merges MCP servers into `.gemini/settings.json`. ([#191](https://github.com/EveryInc/compound-engineering-plugin/pull/191))
- **CLI: sync defaults to `--target all`** — Running `sync` with no target now syncs to all detected tools automatically. ([#191](https://github.com/EveryInc/compound-engineering-plugin/pull/191))

---

## [2.37.1] - 2026-03-01

### Fixed

- **`/workflows:review` rendering** — Fixed broken markdown output: "Next Steps" items 3 & 4 and Severity Breakdown no longer leak outside the Summary Report template, section numbering fixed (was jumping 5→7, now correct), removed orphaned fenced code block delimiters that caused the entire End-to-End Testing section to render as a code block, and fixed unclosed quoted string in section 1. ([#214](https://github.com/EveryInc/compound-engineering-plugin/pull/214)) — thanks [@XSAM](https://github.com/XSAM)!
- **`.worktrees` gitignore** — Added `.worktrees/` to `.gitignore` to prevent worktree directories created by the `git-worktree` skill from being tracked. ([#213](https://github.com/EveryInc/compound-engineering-plugin/pull/213)) — thanks [@XSAM](https://github.com/XSAM)!

---

## [2.37.0] - 2026-03-01

### Added

- **`proof` skill** — Create, edit, comment on, and share markdown documents via Proof's web API and local bridge. Supports document creation, track-changes suggestions, comments, and bulk rewrites. No authentication required for creating shared documents.
- **Optional Proof sharing in `/workflows:brainstorm`** — "Share to Proof" is now a menu option in Phase 4 handoff, letting you upload the brainstorm document when you want to, rather than automatically on every run.
- **Optional Proof sharing in `/workflows:plan`** — "Share to Proof" is now a menu option in Post-Generation Options, letting you upload the plan file on demand rather than automatically.

---

## [2.36.0] - 2026-03-01

### Added

- **OpenClaw install target** — `bunx @every-env/compound-plugin install compound-engineering --to openclaw` now installs the plugin to OpenClaw's extensions directory. ([#217](https://github.com/EveryInc/compound-engineering-plugin/pull/217)) — thanks [@TrendpilotAI](https://github.com/TrendpilotAI)!
- **Qwen Code install target** — `bunx @every-env/compound-plugin install compound-engineering --to qwen` now installs the plugin to Qwen Code's extensions directory. ([#220](https://github.com/EveryInc/compound-engineering-plugin/pull/220)) — thanks [@rlam3](https://github.com/rlam3)!
- **Windsurf install target** — `bunx @every-env/compound-plugin install compound-engineering --to windsurf` converts plugins to Windsurf format. Agents become Windsurf skills, commands become flat workflows, and MCP servers write to `mcp_config.json`. Defaults to global scope (`~/.codeium/windsurf/`); use `--scope workspace` for project-level output. ([#202](https://github.com/EveryInc/compound-engineering-plugin/pull/202)) — thanks [@rburnham52](https://github.com/rburnham52)!

### Fixed

- **`create-agent-skill` / `heal-skill` YAML crash** — `argument-hint` values containing special characters now properly quoted to prevent YAML parse errors in the Claude Code TUI. ([#219](https://github.com/EveryInc/compound-engineering-plugin/pull/219)) — thanks [@solon](https://github.com/solon)!
- **`resolve-pr-parallel` skill name** — Renamed from `resolve_pr_parallel` (underscore) to `resolve-pr-parallel` (hyphen) to match the standard naming convention. ([#202](https://github.com/EveryInc/compound-engineering-plugin/pull/202)) — thanks [@rburnham52](https://github.com/rburnham52)!

---

## [2.35.2] - 2026-02-20

### Changed

- **`/workflows:plan` brainstorm integration** — When plan finds a brainstorm document, it now heavily references it throughout. Added `origin:` frontmatter field to plan templates, brainstorm cross-check in final review, and "Sources" section at the bottom of all three plan templates (MINIMAL, MORE, A LOT). Brainstorm decisions are carried forward with explicit references (`see brainstorm: <path>`) and a mandatory scan before finalizing ensures nothing is dropped.

---

## [2.35.1] - 2026-02-18

### Changed

- **`/workflows:work` system-wide test check** — Added "System-Wide Test Check" to the task execution loop. Before marking a task done, forces five questions: what callbacks/middleware fire when this runs? Do tests exercise the real chain or just mocked isolation? Can failure leave orphaned state? What other interfaces need the same change? Do error strategies align across layers? Includes skip criteria for leaf-node changes. Also added integration test guidance to the "Test Continuously" section.
- **`/workflows:plan` system-wide impact templates** — Added "System-Wide Impact" section to MORE and A LOT plan templates (interaction graph, error propagation, state lifecycle, API surface parity, integration test scenarios) as lightweight prompts to flag risks during planning.

---

## [2.35.0] - 2026-02-17

### Fixed

- **`/lfg` and `/slfg` first-run failures** — Made ralph-loop step optional with graceful fallback when `ralph-wiggum` skill is not installed (#154). Added explicit "do not stop" instruction across all steps (#134).
- **`/workflows:plan` not writing file in pipeline** — Added mandatory "Write Plan File" step with explicit Write tool instructions before Post-Generation Options. The file is now always written to disk before any interactive prompts (#155). Also adds pipeline-mode note to skip AskUserQuestion calls when invoked from LFG/SLFG (#134).
- **Agent namespace typo in `/workflows:plan`** — `Task spec-flow-analyzer(...)` now uses the full qualified name `Task compound-engineering:workflow:spec-flow-analyzer(...)` to prevent Claude from prepending the wrong `workflows:` prefix (#193).

---

## [2.34.0] - 2026-02-14

### Added

- **Gemini CLI target** — New converter target for [Gemini CLI](https://github.com/google-gemini/gemini-cli). Install with `--to gemini` to convert agents to `.gemini/skills/*/SKILL.md`, commands to `.gemini/commands/*.toml` (TOML format with `description` + `prompt`), and MCP servers to `.gemini/settings.json`. Skills pass through unchanged (identical SKILL.md standard). Namespaced commands create directory structure (`workflows:plan` → `commands/workflows/plan.toml`). 29 new tests. ([#190](https://github.com/EveryInc/compound-engineering-plugin/pull/190))

---

## [2.33.1] - 2026-02-13

### Changed

- **`/workflows:plan` command** - All plan templates now include `status: active` in YAML frontmatter. Plans are created with `status: active` and marked `status: completed` when work finishes.
- **`/workflows:work` command** - Phase 4 now updates plan frontmatter from `status: active` to `status: completed` after shipping. Agents can grep for status to distinguish current vs historical plans.

---

## [2.33.0] - 2026-02-12

### Added

- **`setup` skill** — Interactive configurator for review agents
  - Auto-detects project type (Rails, Python, TypeScript, etc.)
  - Two paths: "Auto-configure" (one click) or "Customize" (pick stack, focus areas, depth)
  - Writes `compound-engineering.local.md` in project root (tool-agnostic — works for Claude, Codex, OpenCode)
  - Invoked automatically by `/workflows:review` when no settings file exists
- **`learnings-researcher` in `/workflows:review`** — Always-run agent that searches `docs/solutions/` for past issues related to the PR
- **`schema-drift-detector` wired into `/workflows:review`** — Conditional agent for PRs with migrations

### Changed

- **`/workflows:review`** — Now reads review agents from `compound-engineering.local.md` settings file. Falls back to invoking setup skill if no file exists.
- **`/workflows:work`** — Review agents now configurable via settings file
- **`/release-docs` command** — Moved from plugin to local `.claude/commands/` (repo maintenance, not distributed)

### Removed

- **`/technical_review` command** — Superseded by configurable review agents

---

## [2.32.0] - 2026-02-11

### Added

- **Factory Droid target** — New converter target for [Factory Droid](https://docs.factory.ai). Install with `--to droid` to output agents, commands, and skills to `~/.factory/`. Includes tool name mapping (Claude → Factory), namespace prefix stripping, Task syntax conversion, and agent reference rewriting. 13 new tests (9 converter + 4 writer). ([#174](https://github.com/EveryInc/compound-engineering-plugin/pull/174))

---

## [2.31.1] - 2026-02-09

### Changed

- **`dspy-ruby` skill** — Complete rewrite to DSPy.rb v0.34.3 API: `.call()` / `result.field` patterns, `T::Enum` classes, `DSPy::Tools::Base` / `Toolset`. Added events system, lifecycle callbacks, fiber-local LM context, GEPA optimization, evaluation framework, typed context pattern, BAML/TOON schema formats, storage system, score reporting, RubyLLM adapter. 5 reference files (2 new: toolsets, observability), 3 asset templates rewritten.

## [2.31.0] - 2026-02-08

### Added

- **`document-review` skill** — Brainstorm and plan refinement through structured review ([@Trevin Chow](https://github.com/trevin))
- **`/sync` command** — Sync Claude Code personal config across machines ([@Terry Li](https://github.com/terryli))

### Changed

- **Context token optimization (79% reduction)** — Plugin was consuming 316% of the context description budget, causing Claude Code to silently exclude components. Now at 65% with room to grow:
  - All 29 agent descriptions trimmed from ~1,400 to ~180 chars avg (examples moved to agent body)
  - 18 manual commands marked `disable-model-invocation: true` (side-effect commands like `/lfg`, `/deploy-docs`, `/triage`, etc.)
  - 6 manual skills marked `disable-model-invocation: true` (`orchestrating-swarms`, `git-worktree`, `skill-creator`, `compound-docs`, `file-todos`, `resolve-pr-parallel`)
- **git-worktree**: Remove confirmation prompt for worktree creation ([@Sam Xie](https://github.com/XSAM))
- **Prevent subagents from writing intermediary files** in compound workflow ([@Trevin Chow](https://github.com/trevin))

### Fixed

- Fix crash when hook entries have no matcher ([@Roberto Mello](https://github.com/robertomello))
- Fix git-worktree detection where `.git` is a file, not a directory ([@David Alley](https://github.com/davidalley))
- Backup existing config files before overwriting in sync ([@Zac Williams](https://github.com/zacwilliams))
- Note new repository URL ([@Aarni Koskela](https://github.com/aarnikoskela))
- Plugin component counts corrected: 29 agents, 24 commands, 18 skills

---

## [2.30.0] - 2026-02-05

### Added

- **`orchestrating-swarms` skill** - Comprehensive guide to multi-agent orchestration
  - Covers primitives: Agent, Team, Teammate, Leader, Task, Inbox, Message, Backend
  - Documents two spawning methods: subagents vs teammates
  - Explains all 13 TeammateTool operations
  - Includes orchestration patterns: Parallel Specialists, Pipeline, Self-Organizing Swarm
  - Details spawn backends: in-process, tmux, iterm2
  - Provides complete workflow examples
- **`/slfg` command** - Swarm-enabled variant of `/lfg` that uses swarm mode for parallel execution

### Changed

- **`/workflows:work` command** - Added optional Swarm Mode section for parallel execution with coordinated agents

---

## [2.29.0] - 2026-02-04

### Added

- **`schema-drift-detector` agent** - Detects unrelated schema.rb changes in PRs
  - Compares schema.rb diff against migrations in the PR
  - Catches columns, indexes, and tables from other branches
  - Prevents accidental inclusion of local database state
  - Provides clear fix instructions (checkout + migrate)
  - Essential pre-merge check for any PR with database changes

---

## [2.28.0] - 2026-01-21

### Added

- **`/workflows:brainstorm` command** - Guided ideation flow to expand options quickly (#101)

### Changed

- **`/workflows:plan` command** - Smarter research decision logic before deep dives (#100)
- **Research checks** - Mandatory API deprecation validation in research flows (#102)
- **Docs** - Call out experimental OpenCode/Codex providers and install defaults
- **CLI defaults** - `install` pulls from GitHub by default and writes OpenCode/Codex output to global locations

### Merged PRs

- [#102](https://github.com/EveryInc/compound-engineering-plugin/pull/102) feat(research): add mandatory API deprecation validation
- [#101](https://github.com/EveryInc/compound-engineering-plugin/pull/101) feat: Add /workflows:brainstorm command and skill
- [#100](https://github.com/EveryInc/compound-engineering-plugin/pull/100) feat(workflows:plan): Add smart research decision logic

### Contributors

Huge thanks to the community contributors who made this release possible! 🙌

- **[@tmchow](https://github.com/tmchow)** - Brainstorm workflow, research decision logic (2 PRs)
- **[@jaredmorgenstern](https://github.com/jaredmorgenstern)** - API deprecation validation

---

## [2.27.0] - 2026-01-20

### Added

- **`/workflows:plan` command** - Interactive Q&A refinement phase (#88)
  - After generating initial plan, now offers to refine with targeted questions
  - Asks up to 5 questions about ambiguous requirements, edge cases, or technical decisions
  - Incorporates answers to strengthen the plan before finalization

### Changed

- **`/workflows:work` command** - Incremental commits and branch safety (#93)
  - Now commits after each completed task instead of batching at end
  - Added branch protection checks before starting work
  - Better progress tracking with per-task commits

### Fixed

- **`dhh-rails-style` skill** - Fixed broken markdown table formatting (#96)
- **Documentation** - Updated hardcoded year references from 2025 to 2026 (#86, #91)

### Contributors

Huge thanks to the community contributors who made this release possible! 🙌

- **[@tmchow](https://github.com/tmchow)** - Interactive Q&A for plans, incremental commits, year updates (3 PRs!)
- **[@ashwin47](https://github.com/ashwin47)** - Markdown table fix
- **[@rbouschery](https://github.com/rbouschery)** - Documentation year update

### Summary

- 27 agents, 23 commands, 14 skills, 1 MCP server

---

## [2.26.5] - 2026-01-18

### Changed

- **`/workflows:work` command** - Now marks off checkboxes in plan document as tasks complete
  - Added step to update original plan file (`[ ]` → `[x]`) after each task
  - Ensures no checkboxes are left unchecked when work is done
  - Keeps plan as living document showing progress

---

## [2.26.4] - 2026-01-15

### Changed

- **`/workflows:work` command** - PRs now include Compound Engineered badge
  - Updated PR template to include badge at bottom linking to plugin repo
  - Added badge requirement to quality checklist
  - Badge provides attribution and link to the plugin that created the PR

---

## [2.26.3] - 2026-01-14

### Changed

- **`design-iterator` agent** - Now auto-loads design skills at start of iterations
  - Added "Step 0: Discover and Load Design Skills (MANDATORY)" section
  - Discovers skills from ~/.claude/skills/, .claude/skills/, and plugin cache
  - Maps user context to relevant skills (Swiss design → swiss-design skill, etc.)
  - Reads SKILL.md files to load principles into context before iterating
  - Extracts key principles: grid specs, typography rules, color philosophy, layout principles
  - Skills are applied throughout ALL iterations for consistent design language

---

## [2.26.2] - 2026-01-14

### Changed

- **`/test-browser` command** - Clarified to use agent-browser CLI exclusively
  - Added explicit "CRITICAL: Use agent-browser CLI Only" section
  - Added warning: "DO NOT use Chrome MCP tools (mcp__claude-in-chrome__*)"
  - Added Step 0: Verify agent-browser installation before testing
  - Added full CLI reference section at bottom
  - Added Next.js route mapping patterns

---

## [2.26.1] - 2026-01-14

### Changed

- **`best-practices-researcher` agent** - Now checks skills before going online
  - Phase 1: Discovers and reads relevant SKILL.md files from plugin, global, and project directories
  - Phase 2: Only goes online for additional best practices if skills don't provide enough coverage
  - Phase 3: Synthesizes all findings with clear source attribution (skill-based > official docs > community)
  - Skill mappings: Rails → dhh-rails-style, Frontend → frontend-design, AI → agent-native-architecture, etc.
  - Prioritizes curated skill knowledge over external sources for trivial/common patterns

---

## [2.26.0] - 2026-01-14

### Added

- **`/lfg` command** - Full autonomous engineering workflow
  - Orchestrates complete feature development from plan to PR
  - Runs: plan → deepen-plan → work → review → resolve todos → test-browser → feature-video
  - Uses ralph-loop for autonomous completion
  - Migrated from local command, updated to use `/test-browser` instead of `/playwright-test`

### Summary

- 27 agents, 21 commands, 14 skills, 1 MCP server

---

## [2.25.0] - 2026-01-14

### Added

- **`agent-browser` skill** - Browser automation using Vercel's agent-browser CLI
  - Navigate, click, fill forms, take screenshots
  - Uses ref-based element selection (simpler than Playwright)
  - Works in headed or headless mode

### Changed

- **Replaced Playwright MCP with agent-browser** - Simpler browser automation across all browser-related features:
  - `/test-browser` command - Now uses agent-browser CLI with headed/headless mode option
  - `/feature-video` command - Uses agent-browser for screenshots
  - `design-iterator` agent - Browser automation via agent-browser
  - `design-implementation-reviewer` agent - Screenshot comparison
  - `figma-design-sync` agent - Design verification
  - `bug-reproduction-validator` agent - Bug reproduction
  - `/review` workflow - Screenshot capabilities
  - `/work` workflow - Browser testing

- **`/test-browser` command** - Added "Step 0" to ask user if they want headed (visible) or headless browser mode

### Removed

- **Playwright MCP server** - Replaced by agent-browser CLI (simpler, no MCP overhead)
- **`/playwright-test` command** - Renamed to `/test-browser`

### Summary

- 27 agents, 20 commands, 14 skills, 1 MCP server

---

## [2.23.2] - 2026-01-09

### Changed

- **`/reproduce-bug` command** - Enhanced with Playwright visual reproduction:
  - Added Phase 2 for visual bug reproduction using browser automation
  - Step-by-step guide for navigating to affected areas
  - Screenshot capture at each reproduction step
  - Console error checking
  - User flow reproduction with clicks, typing, and snapshots
  - Better documentation structure with 4 clear phases

### Summary

- 27 agents, 21 commands, 13 skills, 2 MCP servers

---

## [2.23.1] - 2026-01-08

### Changed

- **Agent model inheritance** - All 26 agents now use `model: inherit` so they match the user's configured model. Only `lint` keeps `model: haiku` for cost efficiency. (fixes #69)

### Summary

- 27 agents, 21 commands, 13 skills, 2 MCP servers

---

## [2.23.0] - 2026-01-08

### Added

- **`/agent-native-audit` command** - Comprehensive agent-native architecture review
  - Launches 8 parallel sub-agents, one per core principle
  - Principles: Action Parity, Tools as Primitives, Context Injection, Shared Workspace, CRUD Completeness, UI Integration, Capability Discovery, Prompt-Native Features
  - Each agent produces specific score (X/Y format with percentage)
  - Generates summary report with overall score and top 10 recommendations
  - Supports single principle audit via argument

### Summary

- 27 agents, 21 commands, 13 skills, 2 MCP servers

---

## [2.22.0] - 2026-01-05

### Added

- **`rclone` skill** - Upload files to S3, Cloudflare R2, Backblaze B2, and other cloud storage providers

### Changed

- **`/feature-video` command** - Enhanced with:
  - Better ffmpeg commands for video/GIF creation (proper scaling, framerate control)
  - rclone integration for cloud uploads
  - Screenshot copying to project folder
  - Improved upload options workflow

### Summary

- 27 agents, 20 commands, 13 skills, 2 MCP servers

---

## [2.21.0] - 2026-01-05

### Fixed

- Version history cleanup after merge conflict resolution

### Summary

This release consolidates all recent work:
- `/feature-video` command for recording PR demos
- `/deepen-plan` command for enhanced planning
- `create-agent-skills` skill rewrite (official spec compliance)
- `agent-native-architecture` skill major expansion
- `dhh-rails-style` skill consolidation (merged dhh-ruby-style)
- 27 agents, 20 commands, 12 skills, 2 MCP servers

---

## [2.20.0] - 2026-01-05

### Added

- **`/feature-video` command** - Record video walkthroughs of features using Playwright

### Changed

- **`create-agent-skills` skill** - Complete rewrite to match Anthropic's official skill specification

### Removed

- **`dhh-ruby-style` skill** - Merged into `dhh-rails-style` skill

---

## [2.19.0] - 2025-12-31

### Added

- **`/deepen-plan` command** - Power enhancement for plans. Takes an existing plan and runs parallel research sub-agents for each major section to add:
  - Best practices and industry patterns
  - Performance optimizations
  - UI/UX improvements (if applicable)
  - Quality enhancements and edge cases
  - Real-world implementation examples

  The result is a deeply grounded, production-ready plan with concrete implementation details.

### Changed

- **`/workflows:plan` command** - Added `/deepen-plan` as option 2 in post-generation menu. Added note: if running with ultrathink enabled, automatically run deepen-plan for maximum depth.

## [2.18.0] - 2025-12-25

### Added

- **`agent-native-architecture` skill** - Added **Dynamic Capability Discovery** pattern and **Architecture Review Checklist**:

  **New Patterns in mcp-tool-design.md:**
  - **Dynamic Capability Discovery** - For external APIs (HealthKit, HomeKit, GraphQL), build a discovery tool (`list_*`) that returns available capabilities at runtime, plus a generic access tool that takes strings (not enums). The API validates, not your code. This means agents can use new API capabilities without code changes.
  - **CRUD Completeness** - Every entity the agent can create must also be readable, updatable, and deletable. Incomplete CRUD = broken action parity.

  **New in SKILL.md:**
  - **Architecture Review Checklist** - Pushes reviewer findings earlier into the design phase. Covers tool design (dynamic vs static, CRUD completeness), action parity (capability map, edit/delete), UI integration (agent → UI communication), and context injection.
  - **Option 11: API Integration** - New intake option for connecting to external APIs like HealthKit, HomeKit, GraphQL
  - **New anti-patterns:** Static Tool Mapping (building individual tools for each API endpoint), Incomplete CRUD (create-only tools)
  - **Tool Design Criteria** section added to success criteria checklist

  **New in shared-workspace-architecture.md:**
  - **iCloud File Storage for Multi-Device Sync** - Use iCloud Documents for your shared workspace to get free, automatic multi-device sync without building a sync layer. Includes implementation pattern, conflict handling, entitlements, and when NOT to use it.

### Philosophy

This update codifies a key insight for **agent-native apps**: when integrating with external APIs where the agent should have the same access as the user, use **Dynamic Capability Discovery** instead of static tool mapping. Instead of building `read_steps`, `read_heart_rate`, `read_sleep`... build `list_health_types` + `read_health_data(dataType: string)`. The agent discovers what's available, the API validates the type.

Note: This pattern is specifically for agent-native apps following the "whatever the user can do, the agent can do" philosophy. For constrained agents with intentionally limited capabilities, static tool mapping may be appropriate.

---

## [2.17.0] - 2025-12-25

### Enhanced

- **`agent-native-architecture` skill** - Major expansion based on real-world learnings from building the Every Reader iOS app. Added 5 new reference documents and expanded existing ones:

  **New References:**
  - **dynamic-context-injection.md** - How to inject runtime app state into agent system prompts. Covers context injection patterns, what context to inject (resources, activity, capabilities, vocabulary), implementation patterns for Swift/iOS and TypeScript, and context freshness.
  - **action-parity-discipline.md** - Workflow for ensuring agents can do everything users can do. Includes capability mapping templates, parity audit process, PR checklists, tool design for parity, and context parity guidelines.
  - **shared-workspace-architecture.md** - Patterns for agents and users working in the same data space. Covers directory structure, file tools, UI integration (file watching, shared stores), agent-user collaboration patterns, and security considerations.
  - **agent-native-testing.md** - Testing patterns for agent-native apps. Includes "Can Agent Do It?" tests, the Surprise Test, automated parity testing, integration testing, and CI/CD integration.
  - **mobile-patterns.md** - Mobile-specific patterns for iOS/Android. Covers background execution (checkpoint/resume), permission handling, cost-aware design (model tiers, token budgets, network awareness), offline handling, and battery awareness.

  **Updated References:**
  - **architecture-patterns.md** - Added 3 new patterns: Unified Agent Architecture (one orchestrator, many agent types), Agent-to-UI Communication (shared data store, file watching, event bus), and Model Tier Selection (fast/balanced/powerful).

  **Updated Skill Root:**
  - **SKILL.md** - Expanded intake menu (now 10 options including context injection, action parity, shared workspace, testing, mobile patterns). Added 5 new agent-native anti-patterns (Context Starvation, Orphan Features, Sandbox Isolation, Silent Actions, Capability Hiding). Expanded success criteria with agent-native and mobile-specific checklists.

- **`agent-native-reviewer` agent** - Significantly enhanced with comprehensive review process covering all new patterns. Now checks for action parity, context parity, shared workspace, tool design (primitives vs workflows), dynamic context injection, and mobile-specific concerns. Includes detailed anti-patterns, output format template, quick checks ("Write to Location" test, Surprise test), and mobile-specific verification.

### Philosophy

These updates operationalize a key insight from building agent-native mobile apps: **"The agent should be able to do anything the user can do, through tools that mirror UI capabilities, with full context about the app state."** The failure case that prompted these changes: an agent asked "what reading feed?" when a user said "write something in my reading feed"—because it had no `publish_to_feed` tool and no context about what "feed" meant.

## [2.16.0] - 2025-12-21

### Enhanced

- **`dhh-rails-style` skill** - Massively expanded reference documentation incorporating patterns from Marc Köhlbrugge's Unofficial 37signals Coding Style Guide:
  - **controllers.md** - Added authorization patterns, rate limiting, Sec-Fetch-Site CSRF protection, request context concerns
  - **models.md** - Added validation philosophy, let it crash philosophy (bang methods), default values with lambdas, Rails 7.1+ patterns (normalizes, delegated types, store accessor), concern guidelines with touch chains
  - **frontend.md** - Added Turbo morphing best practices, Turbo frames patterns, 6 new Stimulus controllers (auto-submit, dialog, local-time, etc.), Stimulus best practices, view helpers, caching with personalization, broadcasting patterns
  - **architecture.md** - Added path-based multi-tenancy, database patterns (UUIDs, state as records, hard deletes, counter caches), background job patterns (transaction safety, error handling, batch processing), email patterns, security patterns (XSS, SSRF, CSP), Active Storage patterns
  - **gems.md** - Added expanded what-they-avoid section (service objects, form objects, decorators, CSS preprocessors, React/Vue), testing philosophy with Minitest/fixtures patterns

### Credits

- Reference patterns derived from [Marc Köhlbrugge's Unofficial 37signals Coding Style Guide](https://github.com/marckohlbrugge/unofficial-37signals-coding-style-guide)

## [2.15.2] - 2025-12-21

### Fixed

- **All skills** - Fixed spec compliance issues across 12 skills:
  - Reference files now use proper markdown links (`[file.md](./references/file.md)`) instead of backtick text
  - Descriptions now use third person ("This skill should be used when...") per skill-creator spec
  - Affected skills: agent-native-architecture, andrew-kane-gem-writer, compound-docs, create-agent-skills, dhh-rails-style, dspy-ruby, every-style-editor, file-todos, frontend-design, gemini-imagegen

### Added

- **CLAUDE.md** - Added Skill Compliance Checklist with validation commands for ensuring new skills meet spec requirements

## [2.15.1] - 2025-12-18

### Changed

- **`/workflows:review` command** - Section 7 now detects project type (Web, iOS, or Hybrid) and offers appropriate testing. Web projects get `/playwright-test`, iOS projects get `/xcode-test`, hybrid projects can run both.

## [2.15.0] - 2025-12-18

### Added

- **`/xcode-test` command** - Build and test iOS apps on simulator using XcodeBuildMCP. Automatically detects Xcode project, builds app, launches simulator, and runs test suite. Includes retries for flaky tests.

- **`/playwright-test` command** - Run Playwright browser tests on pages affected by current PR or branch. Detects changed files, maps to affected routes, generates/runs targeted tests, and reports results with screenshots.
