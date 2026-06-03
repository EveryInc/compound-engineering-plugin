#!/usr/bin/env bash
# ce-deep-review-beta — offline detection of which cross-model arms are usable (R9).
#
# Emits ONLY a JSON status record to stdout. It MUST NOT print credential values, tokens, or file
# contents to any stream — detection uses only `command -v`, env-var PRESENCE, and credential-file
# PRESENCE (test -s). It makes NO vendor API calls (an authenticated call would be pre-consent
# egress) and never reads credential file contents.
#
# Arms = codex + agy. (gemini was retired from the skill — it 410s on 2026-06-18; the shared
# arms.py gemini arm remains for the cross-model eval, but the skill no longer offers it.)
#   - grok is deferred: grok 0.2.8 headless is blocked by a relay-auth bug
#     (docs/solutions/skill-design/2026-05-28-grok-arm-posture-validation.md).
#   - agy's read-only floor is a macOS seatbelt, so agy is macOS-ONLY: off-darwin it reports
#     "unavailable" regardless of install/auth, and the consent gate must not offer it (R5 — never
#     offer an arm whose floor is unenforced; arms.py also refuses agy off-darwin).
# Statuses: "ok" (installed + auth signal present), "unauthed" (installed, no auth signal),
#           "missing" (binary not on PATH), "unavailable" (platform-gated off — agy off macOS).
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

# agy: macOS-ONLY (its read-only floor is a macOS seatbelt; arms.py refuses agy off-darwin). Off
# macOS -> "unavailable" so the gate never offers an unfloored arm. Auth = agy's OAuth file
# (~/.gemini/oauth_creds.json); presence only (test -s) — never read contents, and do NOT gate on
# expiry (agy auto-refreshes).
agy_status=unavailable
if [ "$(uname -s)" = "Darwin" ]; then
  agy_auth=no
  [ -s "$HOME/.gemini/oauth_creds.json" ] && agy_auth=yes
  agy_status="$(status_for agy "$agy_auth")"
fi

printf '{"codex":"%s","agy":"%s"}\n' "$codex_status" "$agy_status"
