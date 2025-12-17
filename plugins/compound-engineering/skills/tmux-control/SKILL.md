---
name: tmux-control
description: TUI screen control and capture using tmux for debugging, automation, and multi-pane workflows. Use when capturing terminal output, managing panes, or debugging TUI applications.
---

# tmux Control Skill

## Overview

tmux is a terminal multiplexer that enables screen capture, session management, and multi-pane workflows. This skill covers using tmux for debugging, capturing TUI output, and automating terminal interactions.

**Use this skill when:**
- Capturing terminal/TUI output for bug reports
- Running bd/bv in dedicated panes
- Setting up multi-pane development workflows
- Automating screen captures during reviews
- Debugging TUI applications

## Quick Reference

### Screen Capture

```bash
# Capture current pane output
tmux capture-pane -p

# Capture to file
tmux capture-pane -p > output.txt

# Capture specific pane
tmux capture-pane -t 0 -p

# Capture with history (last 1000 lines)
tmux capture-pane -p -S -1000
```

### Session Management

```bash
# List sessions
tmux list-sessions

# Create new detached session
tmux new-session -d -s mysession

# Attach to session
tmux attach -t mysession

# Kill session
tmux kill-session -t mysession
```

### Pane Management

```bash
# List panes
tmux list-panes

# Split horizontally
tmux split-window -h

# Split vertically
tmux split-window -v

# Select pane
tmux select-pane -t 0
```

### Sending Commands

```bash
# Send keys to current pane
tmux send-keys "command" Enter

# Send to specific pane
tmux send-keys -t 0 "command" Enter

# Send to specific session:window.pane
tmux send-keys -t mysession:0.1 "command" Enter
```

## Common Workflows

### Capture bd/bv Output

For debugging or documentation:

```bash
# Run bd status and capture
tmux send-keys "bd status" Enter
sleep 1
tmux capture-pane -p > bd-status.txt

# Run bv insights and capture
tmux send-keys "bv --robot-insights" Enter
sleep 2
tmux capture-pane -p > bv-insights.txt
```

### Multi-Pane Development Setup

Set up a development environment:

```bash
# Create session with named windows
tmux new-session -d -s dev -n code
tmux new-window -t dev -n tests
tmux new-window -t dev -n logs

# Set up code window with splits
tmux select-window -t dev:code
tmux split-window -h
tmux split-window -v

# In pane 0: editor
tmux send-keys -t dev:code.0 "nvim ." Enter

# In pane 1: git status watcher
tmux send-keys -t dev:code.1 "watch -n 5 git status" Enter

# In pane 2: bd ready watcher
tmux send-keys -t dev:code.2 "watch -n 10 bd ready" Enter
```

### Automated Screen Capture During Review

Capture visual state for bug reports:

```bash
#!/bin/bash
# capture-review.sh

# Start fresh session
tmux new-session -d -s review

# Navigate to problem area
tmux send-keys "cd /path/to/project" Enter
sleep 1

# Run the failing command
tmux send-keys "bin/rails test test/models/user_test.rb" Enter
sleep 5

# Capture output
tmux capture-pane -p -S -500 > test-output.txt

# Clean up
tmux kill-session -t review
```

### Debug TUI Application

When debugging bv or other TUI apps:

```bash
# Run TUI in dedicated session
tmux new-session -d -s tui
tmux send-keys -t tui "bv" Enter

# Wait for TUI to render
sleep 2

# Capture the visual state
tmux capture-pane -t tui -p > tui-state.txt

# Send navigation commands
tmux send-keys -t tui "j" # Move down
tmux send-keys -t tui "k" # Move up
tmux send-keys -t tui "q" # Quit

# Capture after interaction
tmux capture-pane -t tui -p > tui-after.txt
```

## Pane Targeting

tmux uses this syntax for targeting:

```
session:window.pane

Examples:
- 0           → pane 0 in current window
- :0.1        → window 0, pane 1 in current session
- mysession:  → current window in mysession
- mysession:2 → window 2 in mysession
- mysession:2.1 → window 2, pane 1 in mysession
```

## Capture Options

| Option | Effect |
|--------|--------|
| `-p` | Print to stdout (required for capture) |
| `-S -N` | Start capture N lines back in history |
| `-E N` | End capture at line N |
| `-t target` | Target specific pane |
| `-J` | Join wrapped lines |

## Environment Variables

tmux sets useful variables:

```bash
$TMUX           # Set if inside tmux
$TMUX_PANE      # Current pane ID
```

Check if in tmux:
```bash
if [ -n "$TMUX" ]; then
    echo "Inside tmux"
fi
```

## Integration with bd/bv

### bd Dashboard Pane

```bash
# Create dashboard showing bd status
tmux new-session -d -s dashboard
tmux send-keys -t dashboard "watch -n 30 'bd ready --json | jq -r \".[] | [.id, .priority, .title] | @tsv\"'" Enter
```

### bv Monitoring

```bash
# Monitor for cycles (unhealthy state)
tmux new-session -d -s monitor
tmux send-keys -t monitor "watch -n 60 'bv --robot-insights | jq .cycles'" Enter
```

## Debugging Tips

### Capture Failing Test Output

```bash
# Run test and capture everything
tmux new-session -d -s test
tmux send-keys -t test "bin/rails test 2>&1 | tee test.log" Enter
sleep 30  # Wait for tests
tmux capture-pane -t test -p -S -2000 > full-output.txt
tmux kill-session -t test
```

### Capture Interactive Session

```bash
# Start recording session
tmux new-session -d -s record

# Pipe all output to file
tmux pipe-pane -t record "cat >> session.log"

# Run commands
tmux send-keys -t record "commands here" Enter

# Stop recording
tmux pipe-pane -t record
```

### Reproduce Bug in Clean Environment

```bash
# Fresh session with specific setup
tmux new-session -d -s bug
tmux send-keys -t bug "cd /tmp/test-project" Enter
tmux send-keys -t bug "git checkout main" Enter
tmux send-keys -t bug "bundle install" Enter
tmux send-keys -t bug "bin/rails db:reset" Enter

# Now reproduce bug
tmux send-keys -t bug "bin/rails console" Enter
sleep 2
tmux send-keys -t bug "User.find(1).problematic_method" Enter
sleep 1
tmux capture-pane -t bug -p > bug-output.txt
```

## Common Patterns

### Capture with Timestamp

```bash
timestamp=$(date +%Y%m%d-%H%M%S)
tmux capture-pane -p > "capture-${timestamp}.txt"
```

### Capture All Panes

```bash
for pane in $(tmux list-panes -F '#{pane_index}'); do
    tmux capture-pane -t $pane -p > "pane-${pane}.txt"
done
```

### Wait for Command Completion

```bash
# Send command with marker
tmux send-keys "command; echo DONE" Enter

# Wait for marker
while ! tmux capture-pane -p | grep -q "DONE"; do
    sleep 1
done
```

## Key Bindings Reference

Default prefix: `Ctrl-b`

| Binding | Action |
|---------|--------|
| `%` | Split horizontal |
| `"` | Split vertical |
| `o` | Next pane |
| `x` | Kill pane |
| `z` | Toggle zoom |
| `d` | Detach |
| `[` | Copy mode |
| `]` | Paste |

## Troubleshooting

### Not in tmux

```bash
# Check if tmux is available
which tmux

# Start tmux if not running
[ -z "$TMUX" ] && tmux
```

### Pane Not Found

```bash
# List all available panes
tmux list-panes -a -F '#{session_name}:#{window_index}.#{pane_index}'
```

### Capture Empty

```bash
# Ensure pane has content - may need to scroll
tmux capture-pane -p -S -1000  # Get more history
```
