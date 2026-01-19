#!/bin/bash
# PreToolUse hook: Validate YAML frontmatter before writing to docs/solutions/
# Exit 0 = allow, Exit 2 = block with error message

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // empty')
CONTENT=$(echo "$INPUT" | jq -r '.tool_input.content // empty')

# Only validate files in docs/solutions/
if [[ ! "$FILE_PATH" =~ docs/solutions/ ]]; then
  exit 0
fi

# Check if file has YAML frontmatter
if [[ ! "$CONTENT" =~ ^--- ]]; then
  echo "ERROR: docs/solutions/ files must have YAML frontmatter starting with ---" >&2
  exit 2
fi

# Extract frontmatter (between first two ---)
FRONTMATTER=$(echo "$CONTENT" | sed -n '/^---$/,/^---$/p' | sed '1d;$d')

if [ -z "$FRONTMATTER" ]; then
  echo "ERROR: Could not extract YAML frontmatter. Ensure file starts with --- and ends frontmatter with ---" >&2
  exit 2
fi

# Required fields
REQUIRED_FIELDS=("module" "date" "problem_type" "component" "symptoms" "root_cause" "resolution_type" "severity")

for field in "${REQUIRED_FIELDS[@]}"; do
  if ! echo "$FRONTMATTER" | grep -q "^${field}:"; then
    echo "ERROR: Missing required YAML field: $field" >&2
    echo "Required fields: ${REQUIRED_FIELDS[*]}" >&2
    exit 2
  fi
done

# Validate problem_type enum
PROBLEM_TYPE=$(echo "$FRONTMATTER" | grep "^problem_type:" | cut -d':' -f2 | tr -d ' ')
VALID_PROBLEM_TYPES="build_error|test_failure|runtime_error|performance_issue|database_issue|security_issue|ui_bug|integration_issue|logic_error"

if [[ ! "$PROBLEM_TYPE" =~ ^($VALID_PROBLEM_TYPES)$ ]]; then
  echo "ERROR: Invalid problem_type: $PROBLEM_TYPE" >&2
  echo "Valid values: $VALID_PROBLEM_TYPES" >&2
  exit 2
fi

# Validate component enum
COMPONENT=$(echo "$FRONTMATTER" | grep "^component:" | cut -d':' -f2 | tr -d ' ')
VALID_COMPONENTS="model|controller|view|service|hook|component|background_job|database|state_management|api_client|data_processing|ai_assistant|authentication|payments"

if [[ ! "$COMPONENT" =~ ^($VALID_COMPONENTS)$ ]]; then
  echo "ERROR: Invalid component: $COMPONENT" >&2
  echo "Valid values: $VALID_COMPONENTS" >&2
  exit 2
fi

# Validate severity enum
SEVERITY=$(echo "$FRONTMATTER" | grep "^severity:" | cut -d':' -f2 | tr -d ' ')
VALID_SEVERITIES="critical|high|medium|low"

if [[ ! "$SEVERITY" =~ ^($VALID_SEVERITIES)$ ]]; then
  echo "ERROR: Invalid severity: $SEVERITY" >&2
  echo "Valid values: $VALID_SEVERITIES" >&2
  exit 2
fi

# Validate date format (YYYY-MM-DD)
DATE=$(echo "$FRONTMATTER" | grep "^date:" | cut -d':' -f2 | tr -d ' ')
if [[ ! "$DATE" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
  echo "ERROR: Invalid date format: $DATE. Expected YYYY-MM-DD" >&2
  exit 2
fi

echo "✓ YAML frontmatter validated: $FILE_PATH"
exit 0
