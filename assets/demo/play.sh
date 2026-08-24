#!/usr/bin/env bash
# Scripted playback of a real Compound Engineering session, anonymized.
# See README.md in this directory for provenance. Not a live agent run:
# every line below is transcribed from real recorded output.
set -u

R=$'\033[0m'; B=$'\033[1m'; D=$'\033[2m'
W=$'\033[97m'; GRN=$'\033[32m'; CY=$'\033[36m'; YEL=$'\033[33m'

BOX_W=86
p()   { printf '%b\n' "$1"; }
pause(){ sleep "$1"; }

# ── assistant turn marker ────────────────────────────────────────────────
say() { p "${W}⏺${R} $1"; }
cont(){ p "  $1"; }
res() { p "  ${D}⎿  $1${R}"; }
res2(){ p "     ${D}$1${R}"; }
tool(){ p "${W}⏺${R} ${W}$1${R}${D}($2)${R}"; }
agent(){ p "${W}⏺${R} ${W}Agent${R}${D}($1)${R} ${B}Opus 5 (1M context)${R}"
         p "  ${D}⎿  Backgrounded agent (↓ to manage · ctrl+o to expand)${R}"; }

# ── composer box + typing ────────────────────────────────────────────────
box() {
  local text="$1" pad
  pad=$(( BOX_W - 4 - ${#text} ))
  p "${D}╭$(printf '─%.0s' $(seq 1 $((BOX_W-2))))╮${R}"
  printf '%b\n' "${D}│${R} ${W}> ${R}${text}$(printf ' %.0s' $(seq 1 $((pad>0?pad:1))))${D}│${R}"
  p "${D}╰$(printf '─%.0s' $(seq 1 $((BOX_W-2))))╯${R}"
  p "${D}  ⏵⏵ accept edits on (shift+tab to cycle)${R}"
}
type_in_box() {
  local full="$1" i cur
  for (( i=0; i<=${#full}; i++ )); do
    cur="${full:0:i}"
    (( i > 0 )) && printf '\033[4A'
    box "$cur"
    sleep 0.045
  done
  sleep 0.5
  printf '\033[4A\033[J'
  p "${D}> ${full}${R}"
  p ""
}

spin() {
  local msg="$1" secs="$2" frames=('·' '✢' '✳' '✶' '⏺' '✻' '✽') i=0 n
  n=$(python3 -c "print(int($secs/0.12))")
  for (( i=0; i<n; i++ )); do
    printf '\r%b' "${D}${frames[i%7]} ${msg}… ($(python3 -c "print(round($i*0.12,0).__int__())")s · esc to interrupt)${R}\033[K"
    sleep 0.12
  done
  printf '\r\033[K'
}

card() {
  p ""; p "${D}$(printf '─%.0s' $(seq 1 $BOX_W))${R}"
  p "  ${B}$1${R}"
  [ -n "${2:-}" ] && p "  ${D}$2${R}"
  p "${D}$(printf '─%.0s' $(seq 1 $BOX_W))${R}"; p ""
}

printf '\033[?25l'                 # hide cursor for the take
# Restore it on exit for interactive previews, but not mid-take: VHS keeps
# capturing after this script ends, and a restored cursor would blink in the
# final frame. CE_DEMO_TAKE is set by compound-loop.tape.
trap '[ -n "${CE_DEMO_TAKE:-}" ] || printf "\033[?25h"' EXIT
clear
# ═══ BEAT 1 — it learns ══════════════════════════════════════════════════
p ""
type_in_box "/ce-compound"

tool "Skill" "compound-engineering:ce-compound"
res  "Launching skill: compound-engineering:ce-compound"
p ""
pause 0.4
agent "ce-compound Context Analyzer"
p ""
pause 0.3
agent "ce-compound Solution Extractor"
p ""
pause 0.3
agent "ce-compound Related Docs Finder"
p ""
spin "Compounding" 2.2
say  "All three research agents reported. Assembling the learning:"
p ""
pause 0.5
tool "Write" "docs/solutions/runtime-errors/tenant-gate-worktree-env-gate.md"
res  "${GRN}Wrote 95 lines${R}${D} to docs/solutions/runtime-errors/tenant-gate-worktree-env-gate.md${R}"
p ""
pause 0.7
say  "Captured the trap:"
p ""
pause 0.3
cont "${YEL}\`wrangler.jsonc\` vars provision the deployed worker only${R} — nothing"
cont "copies them into a dev worktree, so every signed-in user is"
cont "redirected to ${W}/no-tenant${R}."
p ""
pause 3.0

# ═══ TRANSITION ══════════════════════════════════════════════════════════
card "18 days later — different feature, different worktree." ""
pause 1.0

# ═══ BEAT 2 — it remembers ═══════════════════════════════════════════════
type_in_box "/ce-plan move retrieval into its own worker"

say "Dispatching research agents (repo patterns + institutional learnings)."
p ""
pause 0.4
agent "Learnings research: retrieval worker plan"
p ""
spin "Researching" 2.0
say "Learnings report in — ${B}71 files scanned, 9 strong matches${R}."
p ""
pause 0.5
res  "${CY}#8${R}${D}  docs/solutions/runtime-errors/tenant-gate-worktree-env-gate.md${R}"
res2 "    ${YEL}\`wrangler.jsonc\` vars provision the deployed worker only${R}${D} — nothing"
res2 "    copies them into a dev worktree.${R}"
p ""
pause 3.2
tool "Write" "docs/plans/2026-08-17-feed-insights-retrieval-worker-plan.md"
res  "${GRN}Wrote 214 lines${R}"
p ""
pause 0.6
p "  ${D}Constraint carried into the plan:${R}"
p "  ${D}declare the worker env triple ${R}${GRN}assertedOptional${R}${D}, and gate${R}"
p "  ${GRN}.worktreeinclude${R}${D} on untracked per-worktree files.${R}"
p ""
pause 3.0

card "Nothing in the prompt asked for either constraint." \
     "The plan already knew them. That is the compounding."
# The closing card is the payoff — give it real dwell time before the GIF loops.
# The tape's Sleep governs how much of this hold is actually captured.
pause 10
