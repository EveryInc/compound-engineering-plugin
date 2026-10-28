# Fix status (Phases 0-3 complete, interactive run)

Bug: browser tests fail locally on macOS because WebRTC hides local IPs behind mDNS names.

Fix applied and green. Fix-owned files: `tests/playwright.config.js` only. The diff is 6 changed lines: it sets `launchOptions.args` to `["--disable-features=WebRtcHideLocalIpsWithMdns"]` in the shared `use` block that every browser test project inherits.

The pre-fix tree was clean, and the branch holds only this fix. `ce-simplify-code` and `ce-code-review` are both available. The user gave no instruction about review.
