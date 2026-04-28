#!/usr/bin/env bash
# Print the upstream `version` field from plugins/compound-engineering/.claude-plugin/plugin.json
# on main, or the literal sentinel `__CE_UPDATE_VERSION_FAILED__` if the lookup fails.
#
# Compared to release tags, this reads the current main HEAD because the marketplace
# installs plugin contents from main HEAD; comparing against tags false-positives
# whenever main is ahead of the last tag.

set -u

version=$(gh api repos/EveryInc/compound-engineering-plugin/contents/plugins/compound-engineering/.claude-plugin/plugin.json --jq '.content | @base64d | fromjson | .version' 2>/dev/null)

if [ -n "$version" ]; then
  echo "$version"
else
  echo '__CE_UPDATE_VERSION_FAILED__'
fi
