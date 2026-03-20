# Changelog

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
