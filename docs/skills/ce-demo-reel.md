# `ce-demo-reel`

> Capture a visual demo reel — GIF, terminal recording, screenshots — for PR descriptions. Real product usage, not test output.

`ce-demo-reel` is the **evidence capture** skill. It detects the project type, recommends the right capture tier (browser reel / terminal recording / screenshot reel / static screenshots), records the actual feature in action, uploads to a public URL, and returns markdown ready for a PR description. **Evidence means using the product**, not running tests — "I ran npm test" is test evidence. Capture is running the actual CLI command, opening the web app, making the API call, or triggering the feature.

It's most often invoked by `/ce-commit-push-pr` when a change has observable behavior, but also directly when you want to add a demo to a PR description after the fact.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Detects project type, picks a capture tier, records the feature in action, uploads, returns markdown for PR inclusion |
| When to use it | Shipping UI changes, CLI features, API behavior with runnable examples — anything where visual evidence helps |
| What it produces | A public URL (or local path) and a `Tier`/`Description` ready for `ce-commit-push-pr` to splice into a PR body |
| Tiers | Browser reel, terminal recording, screenshot reel, static screenshots, no evidence needed |

---

## The Problem

PR descriptions without evidence are weaker for predictable reasons:

- **Reviewers can't see what changed** — they have to clone, build, run, and reproduce just to verify a UI render
- **Visual regressions are silent** — no recorded baseline means a future regression may go unnoticed for weeks
- **Evidence gets faked under pressure** — when capturing the real flow is hard, agents substitute test output and label it "Demo"
- **Capturing eats focus** — figuring out which tool to use, getting the right window size, finding a public host, generating the markdown — all distracts from shipping
- **Secrets leak into recordings** — credentials in CLI output, URL bars, DevTools, env exports — the demo ships with the leak
- **Local-only artifacts** — recordings on disk that never make it to the PR description, or break when the local file moves

## The Solution

`ce-demo-reel` runs as a structured capture flow with explicit fallbacks:

- **Project detection** picks the right tier automatically (browser reel for web apps, terminal recording for CLIs)
- **Real product usage** — the skill exercises the feature first to verify it works, then captures
- **Tier fallback chain** — if the chosen tier fails, the skill drops to the next available tier rather than failing the run
- **Secret-safe by design** — recordings stay in the visible transcript only; secrets stay in env vars or out of frame; pre-upload scan catches leaks
- **Test output is never labeled "Demo"** — that distinction is absolute
- **Upload to public host** — returns a real public URL ready for `## Demo` embedding
- **Skip-cleanly when irrelevant** — docs-only, markdown-only, internal refactors get an explicit "no evidence needed" rather than fake substitutes

---

## What Makes It Novel

### 1. Evidence means using the product — strict separation from test output

The skill enforces an absolute distinction: **evidence is running the actual CLI command, opening the web app, making the API call, or triggering the feature.** Test output (`npm test`, `pytest`, etc.) is never labeled "Demo" or "Screenshots." If real product usage is impractical (requires API keys, cloud deploy, paid services, bot tokens), the skill says so explicitly and recommends a fallback rather than silently substituting test output.

### 2. Four tiers — picked by project type and change shape

| Tier | When |
|------|------|
| **Browser reel** | Web apps with motion or interaction (forms, transitions, real-time updates) — agent-browser screenshots stitched into animated GIF |
| **Terminal recording** | CLI tools with motion (typing flows, streaming output) — VHS recording to GIF |
| **Screenshot reel** | CLI with discrete steps — styled terminal frames stitched into GIF |
| **Static screenshots** | Fallback when other tools are unavailable; or naturally discrete states |
| **No evidence needed** | Docs-only, config-only, CI-only, test-only, or pure internal refactors |

The recommendation factors in project type (web-app vs CLI), change classification (motion vs states), and tool availability (preflight check confirms what's installed). The user picks among the available tiers.

### 3. Stateless target discovery — branch-aware, not session-bound

The skill assumes it may be invoked in a fresh session after the work was already done. It doesn't rely on conversation history or assume the caller knows the right artifact. Target discovery uses: current branch name, open PR title and description, changed files and diff, recent commits, and a plan file only when obviously referenced. When invoked by another skill, the caller-provided target is treated as a hint, not proof — the skill re-runs target discovery and validation before capturing.

### 4. Secret-safety by design — transcript hygiene, not blur-after-the-fact

The skill never records credentials. Secrets affect the environment, not the visible transcript:

- Plan secrets out of frame — env vars set before recording, CLI invoked via env vars not flag values, demonstrations of authenticated states (not auth steps)
- **No placeholder substitution inside recordings** — typing a fake `sk-xxxxx` produces a misleading artifact and may break the demo (`401 Unauthorized` because the fake env var overwrites the real one)
- **Pre-upload scan** — looks for `sk-`, `ghp_`, `Bearer`, `Authorization:`, `?token=`, `api_key=`, long hex/base64 near credential-sounding labels. If any appear, discard and recapture. Never blur or crop.

### 5. Runtime fallback chain

If the selected tier fails during execution (tool crashes, server unreachable, recording produces empty output), the skill falls back to the next available tier rather than failing the run:

- Browser reel → static screenshots
- Terminal recording → screenshot reel → static screenshots
- Screenshot reel → static screenshots
- Static screenshots → report failure to user

### 6. Pre-flight tool detection

Before capturing, the preflight script checks tool availability (`agent_browser`, `vhs`, `silicon`, `ffmpeg`, `ffprobe`) and outputs which tiers are usable. The skill prints install commands for missing tools (`brew install charmbracelet/tap/vhs`, `brew install silicon`) so the user can enable richer tiers if they want.

### 7. Per-run scratch directory in OS temp

Each capture creates a per-run directory in OS temp (`mktemp -d -t demo-reel-XXXXXX`) for ephemeral artifacts. Recordings get uploaded to a public host then discarded — they don't pollute the repo tree. The user only sees the final URL.

### 8. Stable output contract for upstream callers

The skill returns a structured envelope (`Tier`, `Description`, `URL`, `Path`) where exactly one of `URL` or `Path` carries a real value (the other is `"none"`). The caller — usually `/ce-commit-push-pr` — formats this into the PR description's `## Demo` or `## Screenshots` section. Static screenshots get the "Screenshots" label; all motion tiers get "Demo." Test output never gets either.

---

## Quick Example

You finish a notification settings page. You invoke `/ce-commit-push-pr`, which detects observable behavior and asks whether to capture evidence. You say yes. It loads `/ce-demo-reel`.

The skill discovers the target from branch + PR diff: a settings page route with toggles. It exercises the feature (navigates to `/settings/notifications`, toggles a few options, verifies hot-reload works). Detects project type as `web-app` (Next.js). Classifies the change as `motion` (toggle state changes, micro-animations).

Preflight finds `agent_browser` and `ffmpeg` available — recommends **browser reel**. You confirm. The skill captures a sequence of agent-browser screenshots through the toggle flow, stitches them into a GIF via ffmpeg, scans for secrets (none found), uploads to a public host, returns the URL.

`/ce-commit-push-pr` splices `## Demo` with the GIF embed into the PR body. Total elapsed time: ~30 seconds.

---

## When to Reach For It

Reach for `ce-demo-reel` when:

- A PR has observable behavior worth showing (UI render, CLI output, API call with runnable example)
- A bug fix has a before/after worth demonstrating
- The feature requires interaction or motion that prose doesn't capture
- You're shipping a CLI feature where output formatting matters

Skip `ce-demo-reel` when:

- The change is docs-only, markdown-only, CI-only, test-only, or pure internal refactor — pick "No evidence needed"
- Real product usage requires resources you don't have (paid services, cloud deploy, bot tokens) — say so explicitly rather than fake it
- The diff genuinely speaks for itself

---

## Use as Part of the Workflow

`ce-demo-reel` is invoked by other skills when behavior is observable:

- **`/ce-commit-push-pr` Step 6** — calls this skill when the change has UI / CLI / API behavior and asks the user whether to capture
- **`/ce-work` Phase 4.1** — Evidence Context — flags whether evidence is possible so `ce-commit-push-pr` can ask the right question

The skill returns `Tier`, `Description`, `URL`, `Path` — the caller decides how to format the result into the PR description.

---

## Use Standalone

The skill is also invoked directly:

- **After a PR is already open** — `/ce-demo-reel "the new settings page"` to add a demo to an existing PR
- **For a specific behavior** — `/ce-demo-reel "CLI output of the migrate command"`
- **Without a description** — `/ce-demo-reel` infers from branch/PR/diff context and asks if ambiguous

When invoked outside `ce-commit-push-pr`, the user typically copies the returned markdown into the PR description manually, or uses `gh pr edit --body-file` separately.

---

## Reference

| Argument | Effect |
|----------|--------|
| _(empty)_ | Infers target from branch/PR/diff context; asks if ambiguous |
| `<description>` | e.g., "the new settings page", "CLI output of the migrate command" |

Tier selection is offered as a blocking question once the recommendation is computed; the user picks among available tiers.

---

## FAQ

**Why isn't test output evidence?**
Tests prove logic in isolation; they say nothing about whether the feature works for a user. A reviewer needs to know "what does this look like when used", not "do the unit tests pass" (CI shows that). The strict separation prevents agents from substituting easy test runs for harder real-product captures.

**What if real evidence requires credentials I don't want to record?**
Set the credential before the recording starts, outside the recorded region. Demonstrate the *authenticated result*, not the auth step. Never type `export API_KEY=fake` inside the recording — that overwrites your real env var and breaks the demo (`401 Unauthorized`). If you can't capture without showing the secret, say so and pick "No evidence needed" or recommend a fallback.

**What if the chosen tier fails mid-capture?**
The skill falls back to the next available tier rather than failing entirely. Browser reel → static screenshots. Terminal recording → screenshot reel → static screenshots. If even static screenshots fail, the skill reports the failure and lets you decide.

**Where does the GIF or screenshot live?**
Per-run artifacts go to OS temp (`/tmp/...`) and get uploaded to a public host. The local files are ephemeral. The URL goes into the PR description; the local copies are discarded.

**What about `--full` page screenshots?**
Static screenshot tier supports full-page captures via agent-browser's `screenshot --full` for tall pages. The skill picks the right capture mode based on what's being demonstrated.

**Why doesn't it auto-blur secrets that slipped in?**
Because partial blur is a known-bad mitigation — even cropped or blurred secrets can leak via metadata, frame edges, or visible patterns. The skill's discipline is: scan before upload, recapture if anything looks like a secret. Recapture is the only remediation.

---

## See Also

- [`ce-commit-push-pr`](./ce-commit-push-pr.md) — primary caller; splices the captured evidence into PR descriptions
- [`ce-work`](./ce-work.md) — flags evidence context at Phase 4.1 so the PR flow can ask the right question
- [`ce-test-browser`](./ce-test-browser.md) — sibling skill for end-to-end browser testing (different goal: verify behavior, not capture)
