#!/bin/bash
# SubagentStop hook: Auto-run tests after review agents complete
# Detects project type and runs appropriate test command
# Exit 0 = success (advisory only)

echo "🧪 Review complete - running tests..."

# Detect project type and run tests
if [ -f "package.json" ]; then
  # Node.js project
  if grep -q '"test"' package.json; then
    echo "Running: npm test"
    npm test 2>&1 | head -50
    TEST_EXIT=$?
    if [ $TEST_EXIT -eq 0 ]; then
      echo "✓ Tests passed"
    else
      echo "⚠ Tests failed (exit code: $TEST_EXIT)"
      echo "Review the failures before creating PR"
    fi
  else
    echo "ℹ No test script found in package.json"
  fi
elif [ -f "pyproject.toml" ] || [ -f "setup.py" ]; then
  # Python project
  if command -v pytest &> /dev/null; then
    echo "Running: pytest"
    pytest --tb=short 2>&1 | head -50
    TEST_EXIT=$?
    if [ $TEST_EXIT -eq 0 ]; then
      echo "✓ Tests passed"
    else
      echo "⚠ Tests failed (exit code: $TEST_EXIT)"
    fi
  elif command -v python &> /dev/null && [ -d "tests" ]; then
    echo "Running: python -m unittest"
    python -m unittest discover -s tests 2>&1 | head -50
  else
    echo "ℹ No Python test runner found"
  fi
elif [ -f "Cargo.toml" ]; then
  # Rust project
  echo "Running: cargo test"
  cargo test 2>&1 | head -50
elif [ -f "go.mod" ]; then
  # Go project
  echo "Running: go test ./..."
  go test ./... 2>&1 | head -50
else
  echo "ℹ Could not detect project type for testing"
fi

# Always exit 0 - test results are advisory
exit 0
