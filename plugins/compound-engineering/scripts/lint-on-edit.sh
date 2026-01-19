#!/bin/bash
# PostToolUse hook: Auto-lint after Edit/Write operations
# Runs appropriate linter based on file extension
# Exit 0 = success (always allow, just report issues)

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // empty')

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Get file extension
EXT="${FILE_PATH##*.}"

# Run appropriate linter based on extension
case "$EXT" in
  ts|tsx)
    if command -v npx &> /dev/null && [ -f "package.json" ]; then
      npx eslint --fix "$FILE_PATH" 2>/dev/null || true
      npx prettier --write "$FILE_PATH" 2>/dev/null || true
      echo "✓ Linted: $FILE_PATH"
    fi
    ;;
  js|jsx)
    if command -v npx &> /dev/null && [ -f "package.json" ]; then
      npx eslint --fix "$FILE_PATH" 2>/dev/null || true
      npx prettier --write "$FILE_PATH" 2>/dev/null || true
      echo "✓ Linted: $FILE_PATH"
    fi
    ;;
  py)
    if command -v ruff &> /dev/null; then
      ruff check --fix "$FILE_PATH" 2>/dev/null || true
      ruff format "$FILE_PATH" 2>/dev/null || true
      echo "✓ Linted: $FILE_PATH"
    elif command -v black &> /dev/null; then
      black "$FILE_PATH" 2>/dev/null || true
      echo "✓ Formatted: $FILE_PATH"
    fi
    ;;
  css|scss)
    if command -v npx &> /dev/null && [ -f "package.json" ]; then
      npx prettier --write "$FILE_PATH" 2>/dev/null || true
      echo "✓ Formatted: $FILE_PATH"
    fi
    ;;
  json)
    if command -v npx &> /dev/null; then
      npx prettier --write "$FILE_PATH" 2>/dev/null || true
      echo "✓ Formatted: $FILE_PATH"
    fi
    ;;
  md)
    # Skip linting markdown files
    ;;
  *)
    # Unknown extension, skip
    ;;
esac

# Always exit 0 - linting is advisory, not blocking
exit 0
