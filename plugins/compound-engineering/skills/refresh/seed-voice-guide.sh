#!/usr/bin/env bash
#
# seed-voice-guide.sh — seed the writing voice guide from a persona source repo.
#
# The voice guide is the ground-truth artifact the writing reviewers (the Perkins
# panel) check prose against. It lives alongside the personas in a source repo
# (e.g. JumpstartLab/ce-reviewers-jsl at voice/voice-guide.md).
#
# Seeds ~/.config/compound-engineering/voice-guide.md ONLY IF ABSENT. The guide is
# a living document — Perkins's compound phase edits the local copy and commits the
# canonical version back to the source repo — so a box's existing copy is never
# overwritten here. To pull a newer canonical guide, delete the local copy and
# re-run /ce:refresh.
#
# Fetches from the repos named in the persona source configs (orchestrator first,
# then reviewer). If none host a voice guide, this is a no-op and the reviewers
# fall back to first principles.

set -u

DEST_DIR="$HOME/.config/compound-engineering"
DEST="$DEST_DIR/voice-guide.md"
GUIDE_PATH="voice/voice-guide.md"

if [ -f "$DEST" ]; then
  echo "Voice guide already present ($DEST) — left as-is (seed-if-absent)."
  exit 0
fi

# Gather candidate repos (repo<TAB>branch) from the persona source configs.
repos_raw="$(python3 - "$DEST_DIR" <<'PY'
import os, sys
d = sys.argv[1]
out = []
for cfg in ("orchestrator-sources.yaml", "reviewer-sources.yaml"):
    p = os.path.join(d, cfg)
    if not os.path.exists(p):
        continue
    repo, branch = None, "main"
    def flush():
        if repo:
            out.append(f"{repo}\t{branch}")
    for line in open(p):
        s = line.strip()
        if s.startswith("- name:"):
            flush(); repo, branch = None, "main"
        elif s.startswith("repo:"):
            repo = s.split(":", 1)[1].strip()
        elif s.startswith("branch:"):
            branch = s.split(":", 1)[1].strip()
    flush()
seen, uniq = set(), []
for r in out:
    if r not in seen:
        seen.add(r); uniq.append(r)
print("\n".join(uniq))
PY
)"

# Fall back to the canonical JSL personas repo if no configs are present.
if [ -z "${repos_raw//[$'\n\t ']/}" ]; then
  repos_raw=$'JumpstartLab/ce-reviewers-jsl\tmain'
fi

mkdir -p "$DEST_DIR"

while IFS=$'\t' read -r repo branch; do
  [ -n "$repo" ] || continue
  [ -n "$branch" ] || branch="main"
  if command -v gh &>/dev/null; then
    if gh api "repos/${repo}/contents/${GUIDE_PATH}?ref=${branch}" \
        -H "Accept: application/vnd.github.raw+json" > "$DEST" 2>/dev/null && [ -s "$DEST" ]; then
      echo "Seeded voice guide from ${repo}@${branch}:${GUIDE_PATH} -> $DEST"
      exit 0
    fi
    rm -f "$DEST"
  elif command -v git &>/dev/null; then
    tmp="$(mktemp -d)"
    if git clone --depth 1 --branch "$branch" "https://github.com/${repo}.git" "$tmp" 2>/dev/null \
        && [ -s "$tmp/$GUIDE_PATH" ]; then
      cp "$tmp/$GUIDE_PATH" "$DEST"
      rm -rf "$tmp"
      echo "Seeded voice guide from ${repo}@${branch}:${GUIDE_PATH} -> $DEST"
      exit 0
    fi
    rm -rf "$tmp"
  fi
done <<< "$repos_raw"

echo "No ${GUIDE_PATH} found in configured persona sources — skipped (writing reviewers will fall back to first principles)."
exit 0
