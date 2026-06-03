# ce-deep-review — onboarding & setup

`ce-deep-review-beta` runs a high-stakes plan through the Claude `ce-doc-review` panel **plus**
one or more non-Claude reviewer CLIs (cross-model decorrelation), verifies every cross-model
finding against the plan, and writes a reconciled sidecar. This doc covers the per-developer
setup it needs.

> **You are responsible for vendor data-handling.** When you opt a model in at the consent gate,
> the plan content is sent to that vendor. You are responsible for having configured each vendor
> with an appropriate data-handling policy (paid plan + DPA where applicable) per your
> organization's requirements. The skill does not verify this for you.

## v1 cross-model arms (status as of 2026-05-28 Phase 0 validation)

| Arm | Status | Why |
|---|---|---|
| **codex** (OpenAI) | ✅ available | `-s read-only` posture; strong, precise reviewer (clean negative control in prior eval) |
| **agy** (Antigravity) | ✅ available, OS-sandboxed | Viable on 1.0.3; read-only floor enforced via a macOS seatbelt profile (agy's own flags don't confine the FS) |
| **grok** (xAI) | ⏸️ deferred | grok 0.2.8 headless reviewer is blocked by a relay-auth bug; re-enabled after a grok fix/version bump (see `docs/solutions/skill-design/2026-05-28-grok-arm-posture-validation.md`) |

You need **at least one** arm available. With none, the skill still runs the Claude panel and
writes a `*.panel-review.md` (it refuses to be quiet, not to run).

## codex

- Install the OpenAI `codex` CLI and sign in so it runs non-interactively.
- Verify: `codex exec -s read-only --skip-git-repo-check - <<<'say hi'` returns a response.
- No env var required; auth is via codex's own login.

## agy (Antigravity)

- Install `agy` (Antigravity CLI) and sign in to a **paid Antigravity plan**, accepting the
  appropriate **DPA** with Google for the content you'll send.
- Auth lands at `~/.gemini/oauth_creds.json` (OAuth; agy auto-refreshes via its `refresh_token`,
  so a stale `expiry_date` is fine — it refreshes on use).
- Verify: `agy -p "say hi"` returns a non-empty response.
- **Posture:** agy's `--sandbox` flag does **not** restrict the filesystem, so `ce-deep-review`
  runs agy inside a macOS `sandbox-exec` (seatbelt) profile that enforces read-only + no arbitrary
  writes at the process boundary. No action needed from you; just be aware the floor is OS-enforced.

## grok (xAI) — deferred

`grok login` authenticates you, and `grok models` will show you logged in — but grok 0.2.8's
**headless `-p` reviewer** currently fails (`Transport channel closed / AuthorizationRequired` at
the WebSocket-relay layer), independent of login state. grok is therefore deferred from v1. When a
future grok version fixes the relay path, re-run the U1 validation and re-enable the arm with the
documented posture (clean cwd + `--tools ""` + `--permission-mode plan` + `--disable-web-search`
+ `--no-subagents` + `--sandbox read-only` + a generous `--max-turns`).

## gitleaks (recommended, not required)

The consent gate previews your plan for secret/PII-shaped content before egress using `gitleaks`.

- Install: `brew install gitleaks`.
- If gitleaks is **not** installed, the gate still opens but shows a "content preview unavailable —
  you are the sole filter" notice and escalates the responsibility acknowledgment. Installing it
  upgrades the preview from manual-only to automated + manual.

## Egress permission (auto-mode)

The cross-model dispatch shells out to send your plan to the consented vendors. Under Claude
Code's **default auto-mode**, that `bash` call is screened by a permission classifier that reasons
about whether the conversation authorized the egress — the skill's `allowed-tools` declaration is
**not** sufficient on its own (verified 2026-05-28).

- **Interactive runs (the normal case):** no setup needed. The consent gate's options are phrased
  as explicit egress authorizations (`Send the plan to agy (Antigravity)`), which is what the
  classifier reads. Selecting a model and proceeding clears the dispatch. If a run is still blocked,
  the skill restates your consent and retries, then offers to let you re-issue the command via the
  `!` prefix.
- **Unattended / headless runs** (no interactive consent turn — e.g. `/loop`, scheduled, or
  piped): add a durable allow rule to your settings so the dispatch is pre-authorized. In
  `~/.claude/settings.json` (or project `.claude/settings.json`):

  ```json
  { "permissions": { "allow": ["Bash(bash *panel-critique.sh*)"] } }
  ```

  > **Caveat (untested):** the interactive consent path above is empirically confirmed to clear the
  > classifier; whether a `permissions.allow` rule *alone* bypasses it for fully-headless runs is
  > not yet verified. Add the rule for headless use, but expect the interactive path to be the
  > reliable one until the headless path is confirmed. See
  > `docs/solutions/skill-design/2026-05-28-od4-egress-classifier-consent-scope.md`.

## First run

```
/ce-deep-review-beta docs/plans/<your-plan>.md
```

(The beta is invoked explicitly — typed slash command or an explicit skill call. It does not
auto-trigger.) You'll get the Claude panel, then a consent gate listing the arms available in your
environment (default: none selected — opt in per model), then a verified reconciled sidecar at
`<plan>.deep-review.md`.
