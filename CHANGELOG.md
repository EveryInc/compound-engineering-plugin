# Changelog

## [2.62.1](https://github.com/EveryInc/compound-engineering-plugin/compare/cli-v2.62.0...cli-v2.62.1) (2026-04-05)


### Bug Fixes

* **ce-brainstorm:** reduce token cost by extracting late-sequence content ([#511](https://github.com/EveryInc/compound-engineering-plugin/issues/511)) ([bdeb793](https://github.com/EveryInc/compound-engineering-plugin/commit/bdeb7935fcdb147b73107177769c2e968463d93f))
* **cli:** resolve repo-wide tsc --noEmit type errors ([#512](https://github.com/EveryInc/compound-engineering-plugin/issues/512)) ([3fa0c81](https://github.com/EveryInc/compound-engineering-plugin/commit/3fa0c815b286c9e11b28dc04c803529e73b79c1b))

## [2.62.0](https://github.com/EveryInc/compound-engineering-plugin/compare/cli-v2.61.0...cli-v2.62.0) (2026-04-03)


### Features

* **ce-plan:** reduce token usage by extracting conditional references ([#489](https://github.com/EveryInc/compound-engineering-plugin/issues/489)) ([fd562a0](https://github.com/EveryInc/compound-engineering-plugin/commit/fd562a0d0255d203d40fd53bb10d03a284a3c0e5))


### Bug Fixes

* **converters:** OpenCode subagent model and FQ agent name resolution ([#483](https://github.com/EveryInc/compound-engineering-plugin/issues/483)) ([577db53](https://github.com/EveryInc/compound-engineering-plugin/commit/577db53a2d2e237e900ef2079817cfe63df2d725))
* **converters:** remove invalid tools/infer from Copilot agent frontmatter ([#493](https://github.com/EveryInc/compound-engineering-plugin/issues/493)) ([6dcb4a3](https://github.com/EveryInc/compound-engineering-plugin/commit/6dcb4a3c553c94e95cb15b5af59aeb6693e6fd61))
* **mcp:** remove bundled context7 MCP server ([#486](https://github.com/EveryInc/compound-engineering-plugin/issues/486)) ([afdd9d4](https://github.com/EveryInc/compound-engineering-plugin/commit/afdd9d44651f834b1eed0b20e401ffbef5c8cd41))

## [2.61.0](https://github.com/EveryInc/compound-engineering-plugin/compare/cli-v2.60.0...cli-v2.61.0) (2026-04-01)


### Features

* **release:** document linked-versions policy ([#482](https://github.com/EveryInc/compound-engineering-plugin/issues/482)) ([96345ac](https://github.com/EveryInc/compound-engineering-plugin/commit/96345acf217333726af0dcfdaa24058a149365bb))
* **skill-design:** document skill file isolation and platform variable constraints ([#469](https://github.com/EveryInc/compound-engineering-plugin/issues/469)) ([0294652](https://github.com/EveryInc/compound-engineering-plugin/commit/0294652395cb62d5569f73ebfea543cfe8b514d6))


### Bug Fixes

* **converters:** preserve user config when writing MCP servers ([#479](https://github.com/EveryInc/compound-engineering-plugin/issues/479)) ([c65a698](https://github.com/EveryInc/compound-engineering-plugin/commit/c65a698d932d02e5fb4a948db4d000e21ed6ba4f))

## [2.60.0](https://github.com/EveryInc/compound-engineering-plugin/compare/cli-v2.59.0...cli-v2.60.0) (2026-03-31)


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
* **converters:** centralize model field normalization across targets ([#442](https://github.com/EveryInc/compound-engineering-plugin/issues/442)) ([f93d10c](https://github.com/EveryInc/compound-engineering-plugin/commit/f93d10cf60a61b13c7765198d69f7c4cfa268ed6))
* **git-commit-push-pr:** add conditional visual aids to PR descriptions ([#444](https://github.com/EveryInc/compound-engineering-plugin/issues/444)) ([44e3e77](https://github.com/EveryInc/compound-engineering-plugin/commit/44e3e77dc039d31a86194b0254e4e92839d9d5e9))
* **git-commit-push-pr:** precompute shield badge version via skill preprocessing ([#464](https://github.com/EveryInc/compound-engineering-plugin/issues/464)) ([6ca7aef](https://github.com/EveryInc/compound-engineering-plugin/commit/6ca7aef7f33ebdf29f579cb4342c209d2bd40aad))
* **model:** add MiniMax provider prefix for cross-platform model normalization ([#463](https://github.com/EveryInc/compound-engineering-plugin/issues/463)) ([e372b43](https://github.com/EveryInc/compound-engineering-plugin/commit/e372b43d30378321ac815fe1ae101c1d5634d321))
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

## [2.59.0](https://github.com/EveryInc/compound-engineering-plugin/compare/cli-v2.58.1...cli-v2.59.0) (2026-03-29)


### Features

* **ce-review:** add headless mode for programmatic callers ([#430](https://github.com/EveryInc/compound-engineering-plugin/issues/430)) ([3706a97](https://github.com/EveryInc/compound-engineering-plugin/commit/3706a9764b6e73b7a155771956646ddef73f04a5))
* **ce-work:** accept bare prompts and add test discovery ([#423](https://github.com/EveryInc/compound-engineering-plugin/issues/423)) ([6dabae6](https://github.com/EveryInc/compound-engineering-plugin/commit/6dabae6683fb2c37dc47616f172835eacc105d11))
* **document-review:** collapse batch_confirm tier into auto ([#432](https://github.com/EveryInc/compound-engineering-plugin/issues/432)) ([0f5715d](https://github.com/EveryInc/compound-engineering-plugin/commit/0f5715d562fffc626ddfde7bd0e1652143710a44))
* **review:** make review mandatory across pipeline skills ([#433](https://github.com/EveryInc/compound-engineering-plugin/issues/433)) ([9caaf07](https://github.com/EveryInc/compound-engineering-plugin/commit/9caaf071d9b74fd938567542167768f6cdb7a56f))

## [2.58.1](https://github.com/EveryInc/compound-engineering-plugin/compare/cli-v2.58.0...cli-v2.58.1) (2026-03-28)


### Bug Fixes

* **release:** align cli and compound-engineering versions with linked-versions plugin ([0bd29c7](https://github.com/EveryInc/compound-engineering-plugin/commit/0bd29c7f2e930fc1198cc7ae833394bfabd47c40))

## [2.58.0](https://github.com/EveryInc/compound-engineering-plugin/compare/cli-v2.57.1...cli-v2.58.0) (2026-03-28)


### Features

* **document-review:** add headless mode for programmatic callers ([#425](https://github.com/EveryInc/compound-engineering-plugin/issues/425)) ([4e4a656](https://github.com/EveryInc/compound-engineering-plugin/commit/4e4a6563b4aa7375e9d1c54bd73442f3b675f100))

## [2.57.1](https://github.com/EveryInc/compound-engineering-plugin/compare/cli-v2.57.0...cli-v2.57.1) (2026-03-28)


### Bug Fixes

* **onboarding:** resolve section count contradiction with skip rule ([#421](https://github.com/EveryInc/compound-engineering-plugin/issues/421)) ([d2436e7](https://github.com/EveryInc/compound-engineering-plugin/commit/d2436e7c933129784c67799a5b9555bccce2e46d))

## [2.57.0](https://github.com/EveryInc/compound-engineering-plugin/compare/cli-v2.56.0...cli-v2.57.0) (2026-03-28)


### Features

* **ce-plan:** add decision matrix form, unchanged invariants, and risk table format ([#417](https://github.com/EveryInc/compound-engineering-plugin/issues/417)) ([ccb371e](https://github.com/EveryInc/compound-engineering-plugin/commit/ccb371e0b7917420f5ca2c58433f5fc057211f04))


### Bug Fixes

* **cli-agent-readiness-reviewer:** remove top-5 cap on improvements ([#419](https://github.com/EveryInc/compound-engineering-plugin/issues/419)) ([16eb8b6](https://github.com/EveryInc/compound-engineering-plugin/commit/16eb8b660790f8de820d0fba709316c7270703c1))
* **document-review:** enforce interactive questions and fix autofix classification ([#415](https://github.com/EveryInc/compound-engineering-plugin/issues/415)) ([d447296](https://github.com/EveryInc/compound-engineering-plugin/commit/d44729603da0c73d4959c372fac0198125a39c60))

## [2.56.0](https://github.com/EveryInc/compound-engineering-plugin/compare/cli-v2.55.0...cli-v2.56.0) (2026-03-27)


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
* clarify commit prefix selection for markdown product code ([#407](https://github.com/EveryInc/compound-engineering-plugin/issues/407)) ([4a60ee2](https://github.com/EveryInc/compound-engineering-plugin/commit/4a60ee23b77c942111f3935d325ca5c80424ceb2))
* consolidate compound-docs into ce-compound skill ([#390](https://github.com/EveryInc/compound-engineering-plugin/issues/390)) ([daddb7d](https://github.com/EveryInc/compound-engineering-plugin/commit/daddb7d72f280a3bd9645c54d091844c198a324d))
* consolidate local dev README and fix shell aliases ([#396](https://github.com/EveryInc/compound-engineering-plugin/issues/396)) ([1bd63c2](https://github.com/EveryInc/compound-engineering-plugin/commit/1bd63c2c8931b63bcafe960ea6353372ea85512a))
* document SwiftUI Text link tap limitation in test-xcode skill ([#400](https://github.com/EveryInc/compound-engineering-plugin/issues/400)) ([6ddaec3](https://github.com/EveryInc/compound-engineering-plugin/commit/6ddaec3b6ed5b6a91aeaddadff3960714ef10dc1))
* harden git workflow skills with better state handling ([#406](https://github.com/EveryInc/compound-engineering-plugin/issues/406)) ([f83305e](https://github.com/EveryInc/compound-engineering-plugin/commit/f83305e22af09c37f452cf723c1b08bb0e7c8bdf))
* improve agent-native-reviewer with triage, prioritization, and stack-aware search ([#387](https://github.com/EveryInc/compound-engineering-plugin/issues/387)) ([e792166](https://github.com/EveryInc/compound-engineering-plugin/commit/e7921660ad42db8e9af56ec36f36ce8d1af13238))
* replace broken markdown link refs in skills ([#392](https://github.com/EveryInc/compound-engineering-plugin/issues/392)) ([506ad01](https://github.com/EveryInc/compound-engineering-plugin/commit/506ad01b4f056b0d8d0d440bfb7821f050aba156))
* sanitize colons in skill/agent names for Windows path compatibility ([#398](https://github.com/EveryInc/compound-engineering-plugin/issues/398)) ([b25480a](https://github.com/EveryInc/compound-engineering-plugin/commit/b25480af9eb1e69efa2fe30a8e7048f4c6aaa53c))

## [2.55.0](https://github.com/EveryInc/compound-engineering-plugin/compare/cli-v2.54.0...cli-v2.55.0) (2026-03-26)


### Features

* add branch-based plugin install for worktree workflows ([#395](https://github.com/EveryInc/compound-engineering-plugin/issues/395)) ([e09a742](https://github.com/EveryInc/compound-engineering-plugin/commit/e09a7426be6ba1cd86122e7519abfe3376849ade))


### Bug Fixes

* prevent orphaned opening paragraphs in PR descriptions ([#393](https://github.com/EveryInc/compound-engineering-plugin/issues/393)) ([4b44a94](https://github.com/EveryInc/compound-engineering-plugin/commit/4b44a94e23c8621771b8813caebce78060a61611))

## [2.54.0](https://github.com/EveryInc/compound-engineering-plugin/compare/cli-v2.53.0...cli-v2.54.0) (2026-03-26)


### Features

* add new `onboarding` skill to create onboarding guide for repo ([#384](https://github.com/EveryInc/compound-engineering-plugin/issues/384)) ([27b9831](https://github.com/EveryInc/compound-engineering-plugin/commit/27b9831084d69c4c8cf13d0a45c901268420de59))
* replace manual review agent config with ce:review delegation ([#381](https://github.com/EveryInc/compound-engineering-plugin/issues/381)) ([fed9fd6](https://github.com/EveryInc/compound-engineering-plugin/commit/fed9fd68db283c64ec11293f88a8ad7a6373e2fe))


### Bug Fixes

* add default-branch guard to commit skills ([#386](https://github.com/EveryInc/compound-engineering-plugin/issues/386)) ([31f07c0](https://github.com/EveryInc/compound-engineering-plugin/commit/31f07c00473e9d8bd6d447cf04081c0a9631e34a))
* one-step codex installs by preferring bundled plugins ([#383](https://github.com/EveryInc/compound-engineering-plugin/issues/383)) ([f819e43](https://github.com/EveryInc/compound-engineering-plugin/commit/f819e435a54f5d7df558df5a6bee1e616a5da837))
* scope commit-push-pr descriptions to full branch diff ([#385](https://github.com/EveryInc/compound-engineering-plugin/issues/385)) ([355e739](https://github.com/EveryInc/compound-engineering-plugin/commit/355e7392b21a28c8725f87a8f9c473a86543ce4a))

## [2.53.0](https://github.com/EveryInc/compound-engineering-plugin/compare/cli-v2.52.0...cli-v2.53.0) (2026-03-25)


### Features

* add git commit and branch helper skills ([#378](https://github.com/EveryInc/compound-engineering-plugin/issues/378)) ([fe08af2](https://github.com/EveryInc/compound-engineering-plugin/commit/fe08af2b417b707b6d3192a954af7ff2ab0fe667))
* improve `resolve-pr-feedback` skill ([#379](https://github.com/EveryInc/compound-engineering-plugin/issues/379)) ([2ba4f3f](https://github.com/EveryInc/compound-engineering-plugin/commit/2ba4f3fd58d4e57dfc6c314c2992c18ba1fb164b))
* improve commit-push-pr skill with net-result focus and badging ([#380](https://github.com/EveryInc/compound-engineering-plugin/issues/380)) ([efa798c](https://github.com/EveryInc/compound-engineering-plugin/commit/efa798c52cb9d62e9ef32283227a8df68278ff3a))
* integrate orphaned stack-specific reviewers into ce:review ([#375](https://github.com/EveryInc/compound-engineering-plugin/issues/375)) ([ce9016f](https://github.com/EveryInc/compound-engineering-plugin/commit/ce9016fac5fde9a52753cf94a4903088f05aeece))


### Bug Fixes

* guard CONTEXTUAL_RISK_FLAGS lookup against prototype pollution ([#377](https://github.com/EveryInc/compound-engineering-plugin/issues/377)) ([8ebc77b](https://github.com/EveryInc/compound-engineering-plugin/commit/8ebc77b8e6c71e5bef40fcded9131c4457a387d7))

## [2.52.0](https://github.com/EveryInc/compound-engineering-plugin/compare/cli-v2.51.0...cli-v2.52.0) (2026-03-25)


### Features

* add consolidation support and overlap detection to `ce:compound` and `ce:compound-refresh` skills ([#372](https://github.com/EveryInc/compound-engineering-plugin/issues/372)) ([fe27f85](https://github.com/EveryInc/compound-engineering-plugin/commit/fe27f85810268a8e713ef2c921f0aec1baf771d7))
* minimal config for conductor support ([#373](https://github.com/EveryInc/compound-engineering-plugin/issues/373)) ([aad31ad](https://github.com/EveryInc/compound-engineering-plugin/commit/aad31adcd3d528581e8b00e78943b21fbe2c47e8))
* optimize `ce:compound` speed and effectiveness ([#370](https://github.com/EveryInc/compound-engineering-plugin/issues/370)) ([4e3af07](https://github.com/EveryInc/compound-engineering-plugin/commit/4e3af079623ae678b9a79fab5d1726d78f242ec2))
* promote `ce:review-beta` to stable `ce:review` ([#371](https://github.com/EveryInc/compound-engineering-plugin/issues/371)) ([7c5ff44](https://github.com/EveryInc/compound-engineering-plugin/commit/7c5ff445e3065fd13e00bcd57041f6c35b36f90b))
* rationalize todo skill names and optimize skills ([#368](https://github.com/EveryInc/compound-engineering-plugin/issues/368)) ([2612ed6](https://github.com/EveryInc/compound-engineering-plugin/commit/2612ed6b3d86364c74dc024e4ce35dde63fefbf6))

## [2.51.0](https://github.com/EveryInc/compound-engineering-plugin/compare/cli-v2.50.0...cli-v2.51.0) (2026-03-24)


### Features

* add `ce:review-beta` with structured persona pipeline ([#348](https://github.com/EveryInc/compound-engineering-plugin/issues/348)) ([e932276](https://github.com/EveryInc/compound-engineering-plugin/commit/e9322768664e194521894fe770b87c7dabbb8a22))
* promote ce:plan-beta and deepen-plan-beta to stable ([#355](https://github.com/EveryInc/compound-engineering-plugin/issues/355)) ([169996a](https://github.com/EveryInc/compound-engineering-plugin/commit/169996a75e98a29db9e07b87b0911cc80270f732))
* redesign `document-review` skill with persona-based review ([#359](https://github.com/EveryInc/compound-engineering-plugin/issues/359)) ([18d22af](https://github.com/EveryInc/compound-engineering-plugin/commit/18d22afde2ae08a50c94efe7493775bc97d9a45a))

## [2.50.0](https://github.com/EveryInc/compound-engineering-plugin/compare/cli-v2.49.0...cli-v2.50.0) (2026-03-23)


### Features

* **ce-work:** add Codex delegation mode ([#328](https://github.com/EveryInc/compound-engineering-plugin/issues/328)) ([341c379](https://github.com/EveryInc/compound-engineering-plugin/commit/341c37916861c8bf413244de72f83b93b506575f))
* improve `feature-video` skill with GitHub native video upload ([#344](https://github.com/EveryInc/compound-engineering-plugin/issues/344)) ([4aa50e1](https://github.com/EveryInc/compound-engineering-plugin/commit/4aa50e1bada07e90f36282accb3cd81134e706cd))
* rewrite `frontend-design` skill with layered architecture and visual verification ([#343](https://github.com/EveryInc/compound-engineering-plugin/issues/343)) ([423e692](https://github.com/EveryInc/compound-engineering-plugin/commit/423e69272619e9e3c14750f5219cbf38684b6c96))


### Bug Fixes

* quote frontend-design skill description ([#353](https://github.com/EveryInc/compound-engineering-plugin/issues/353)) ([86342db](https://github.com/EveryInc/compound-engineering-plugin/commit/86342db36c0d09b65afe11241e095dda2ad2cdb0))

## [2.49.0](https://github.com/EveryInc/compound-engineering-plugin/compare/cli-v2.48.0...cli-v2.49.0) (2026-03-22)


### Features

* add execution mode toggle and context pressure bounds to parallel skills ([#336](https://github.com/EveryInc/compound-engineering-plugin/issues/336)) ([216d6df](https://github.com/EveryInc/compound-engineering-plugin/commit/216d6dfb2c9320c3354f8c9f30e831fca74865cd))
* fix skill transformation pipeline across all targets ([#334](https://github.com/EveryInc/compound-engineering-plugin/issues/334)) ([4087e1d](https://github.com/EveryInc/compound-engineering-plugin/commit/4087e1df82138f462a64542831224e2718afafa7))
* improve reproduce-bug skill, sync agent-browser, clean up redundant skills ([#333](https://github.com/EveryInc/compound-engineering-plugin/issues/333)) ([affba1a](https://github.com/EveryInc/compound-engineering-plugin/commit/affba1a6a0d9320b529d429ad06fd5a3b5200bd8))


### Bug Fixes

* gitignore .context/ directory for Conductor ([#331](https://github.com/EveryInc/compound-engineering-plugin/issues/331)) ([0f6448d](https://github.com/EveryInc/compound-engineering-plugin/commit/0f6448d81cbc47e66004b4ecb8fb835f75aeffe2))

## [2.48.0](https://github.com/EveryInc/compound-engineering-plugin/compare/cli-v2.47.0...cli-v2.48.0) (2026-03-22)


### Features

* **git-worktree:** auto-trust mise and direnv configs in new worktrees ([#312](https://github.com/EveryInc/compound-engineering-plugin/issues/312)) ([cfbfb67](https://github.com/EveryInc/compound-engineering-plugin/commit/cfbfb6710a846419cc07ad17d9dbb5b5a065801c))
* make skills platform-agnostic across coding agents ([#330](https://github.com/EveryInc/compound-engineering-plugin/issues/330)) ([52df90a](https://github.com/EveryInc/compound-engineering-plugin/commit/52df90a16688ee023bbdb203969adcc45d7d2ba2))

## [2.47.0](https://github.com/EveryInc/compound-engineering-plugin/compare/cli-v2.46.0...cli-v2.47.0) (2026-03-20)


### Features

* improve `repo-research-analyst` by adding a structured technology scan ([#327](https://github.com/EveryInc/compound-engineering-plugin/issues/327)) ([1c28d03](https://github.com/EveryInc/compound-engineering-plugin/commit/1c28d0321401ad50a51989f5e6293d773ac1a477))


### Bug Fixes

* **skills:** update ralph-wiggum references to ralph-loop in lfg/slfg ([#324](https://github.com/EveryInc/compound-engineering-plugin/issues/324)) ([ac756a2](https://github.com/EveryInc/compound-engineering-plugin/commit/ac756a267c5e3d5e4ceb2f99939dbb93491ac4d2))

## [2.46.0](https://github.com/EveryInc/compound-engineering-plugin/compare/cli-v2.45.0...cli-v2.46.0) (2026-03-20)


### Features

* add optional high-level technical design to plan-beta skills ([#322](https://github.com/EveryInc/compound-engineering-plugin/issues/322)) ([3ba4935](https://github.com/EveryInc/compound-engineering-plugin/commit/3ba4935926b05586da488119f215057164d97489))


### Bug Fixes

* **ci:** add npm registry auth to release publish job ([#319](https://github.com/EveryInc/compound-engineering-plugin/issues/319)) ([3361a38](https://github.com/EveryInc/compound-engineering-plugin/commit/3361a38108991237de51050283e781be847c6bd3))

## [2.45.0](https://github.com/EveryInc/compound-engineering-plugin/compare/cli-v2.44.0...cli-v2.45.0) (2026-03-19)


### Features

* edit resolve_todos_parallel skill for complete todo lifecycle ([#292](https://github.com/EveryInc/compound-engineering-plugin/issues/292)) ([88c89bc](https://github.com/EveryInc/compound-engineering-plugin/commit/88c89bc204c928d2f36e2d1f117d16c998ecd096))
* integrate claude code auto memory as supplementary data source for ce:compound and ce:compound-refresh ([#311](https://github.com/EveryInc/compound-engineering-plugin/issues/311)) ([5c1452d](https://github.com/EveryInc/compound-engineering-plugin/commit/5c1452d4cc80b623754dd6fe09c2e5b6ae86e72e))


### Bug Fixes

* add cursor-marketplace as release-please component ([#315](https://github.com/EveryInc/compound-engineering-plugin/issues/315)) ([838aeb7](https://github.com/EveryInc/compound-engineering-plugin/commit/838aeb79d069b57a80d15ff61d83913919b81aef))

## [2.44.0](https://github.com/EveryInc/compound-engineering-plugin/compare/cli-v2.43.2...cli-v2.44.0) (2026-03-18)


### Features

* **plugin:** add execution posture signaling to ce:plan-beta and ce:work ([#309](https://github.com/EveryInc/compound-engineering-plugin/issues/309)) ([748f72a](https://github.com/EveryInc/compound-engineering-plugin/commit/748f72a57f713893af03a4d8ed69c2311f492dbd))

## [2.43.2](https://github.com/EveryInc/compound-engineering-plugin/compare/cli-v2.43.1...cli-v2.43.2) (2026-03-18)


### Bug Fixes

* enable release-please labeling so it can find its own PRs ([a7d6e3f](https://github.com/EveryInc/compound-engineering-plugin/commit/a7d6e3fbba862d4e8b4e1a0510f0776e9e274b89))
* re-enable changelogs so release PRs accumulate correctly ([516bcc1](https://github.com/EveryInc/compound-engineering-plugin/commit/516bcc1dc4bf4e4756ae08775806494f5b43968a))
* reduce release-please search depth from 500 to 50 ([f1713b9](https://github.com/EveryInc/compound-engineering-plugin/commit/f1713b9dcd0deddc2485e8cf0594266232bf0019))
* remove close-stale-PR step that broke release creation ([178d6ec](https://github.com/EveryInc/compound-engineering-plugin/commit/178d6ec282512eaee71ab66d45832d22d75353ec))

## Changelog

Release notes now live in GitHub Releases for this repository:

https://github.com/EveryInc/compound-engineering-plugin/releases

Multi-component releases are published under component-specific tags such as:

- `cli-vX.Y.Z`
- `compound-engineering-vX.Y.Z`
- `coding-tutor-vX.Y.Z`
- `marketplace-vX.Y.Z`

Do not add new release entries here. New release notes are managed by release automation in GitHub.
