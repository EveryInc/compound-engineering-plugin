#!/usr/bin/env bash
# ce-deep-review-beta — offline detection of which cross-model arms are usable (R9).
#
# Emits ONLY a JSON status record to stdout. It MUST NOT print credential values, tokens, or file
# contents to any stream — detection uses only `command -v`, env-var PRESENCE, and credential-file
# PRESENCE (test -s). It makes NO vendor API calls (an authenticated call would be pre-consent
# egress) and never reads credential file contents.
#
# Thin-slice (Phase 1) arms = codex + gemini (the arms the current panel-critique.sh runs).
#   - grok is deferred: grok 0.2.8 headless is blocked by a relay-auth bug
#     (docs/solutions/skill-design/2026-05-28-grok-arm-posture-validation.md).
#   - agy is validated + sandbox-wired in arms.py but joins the panel runner in Phase 2/U8.
# Statuses: "ok" (installed + auth signal present), "unauthed" (installed, no auth signal),
#           "missing" (binary not on PATH).
set -u

status_for() {
  bin="$1"; auth_present="$2"   # auth_present: "yes" | "no"
  if ! command -v "$bin" >/dev/null 2>&1; then
    printf 'missing'
  elif [ "$auth_present" = "yes" ]; then
    printf 'ok'
  else
    printf 'unauthed'
  fi
}

# codex: ~/.codex/auth.json non-empty (auth managed by codex login).
codex_auth=no
[ -s "$HOME/.codex/auth.json" ] && codex_auth=yes
codex_status="$(status_for codex "$codex_auth")"

# gemini: GEMINI_API_KEY set OR ~/.gemini/oauth_creds.json non-empty (OAuth auto-refreshes;
# do NOT gate on expiry — a stale expiry_date still works via refresh_token).
gemini_auth=no
if [ -n "${GEMINI_API_KEY:-}" ] || [ -s "$HOME/.gemini/oauth_creds.json" ]; then gemini_auth=yes; fi
gemini_status="$(status_for gemini "$gemini_auth")"

printf '{"codex":"%s","gemini":"%s"}\n' "$codex_status" "$gemini_status"
