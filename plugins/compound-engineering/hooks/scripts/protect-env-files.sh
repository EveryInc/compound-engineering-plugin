#!/bin/bash
# PreToolUse hook: Protect secret/sensitive files from unintended modification
# Matches: .env files, .pem, .key, credentials, secret configs
set -euo pipefail

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

FILENAME=$(basename "$FILE_PATH")

# Pattern 1: .env files (.env, .env.local, .env.production, etc.)
if echo "$FILENAME" | grep -qE '\.env($|\.)'; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: "Editing .env file which may contain secrets: '"$FILENAME"'"
    }
  }'
  exit 0
fi

# Pattern 2: PEM certificate files
if echo "$FILENAME" | grep -qE '\.pem$'; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: "Editing certificate file which may contain private keys: '"$FILENAME"'"
    }
  }'
  exit 0
fi

# Pattern 3: Key files
if echo "$FILENAME" | grep -qE '\.key$'; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: "Editing key file which may contain private keys: '"$FILENAME"'"
    }
  }'
  exit 0
fi

# Pattern 4: Credentials files
if echo "$FILENAME" | grep -qiE 'credentials'; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: "Editing credentials file which may contain secrets: '"$FILENAME"'"
    }
  }'
  exit 0
fi

# Pattern 5: Secret config files (secret.json, secret.yml, secret.yaml, secrets.json, etc.)
if echo "$FILENAME" | grep -qE 'secret.*\.(json|yml|yaml)$'; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: "Editing secrets config file which may contain sensitive data: '"$FILENAME"'"
    }
  }'
  exit 0
fi

# All other files: allow
exit 0
