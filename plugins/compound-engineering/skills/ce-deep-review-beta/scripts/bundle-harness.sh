#!/usr/bin/env bash
# Build-time copy: bundle the canonical cross-model harness into this skill so the installed skill
# is self-contained (AGENTS.md "each skill directory is a self-contained unit"). Run after ANY change
# to the canonical files -- INCLUDING eval-only changes, since arms.py / panel-critique.sh are shared
# with the cross-model eval workflow. The bundle-drift test
# (tests/skills/ce-deep-review-beta-bundle-drift.test.ts) fails until you re-run this.
#
# Symlinks are deliberately NOT used: the converter copies each skill dir as an isolated unit, so a
# symlink would dangle on install.
set -eu
here="$(cd "$(dirname "$0")" && pwd)"
repo="$(git -C "$here" rev-parse --show-toplevel)"
src="$repo/scripts/eval/cross_model_review"
mkdir -p "$here/validation"
cp "$src/panel-critique.sh" "$here/panel-critique.sh"
cp "$src/arms.py" "$here/arms.py"
cp "$src/validation/agy-readonly.sb.tmpl" "$here/validation/agy-readonly.sb.tmpl"
echo "bundled into $here : panel-critique.sh, arms.py, validation/agy-readonly.sb.tmpl"
