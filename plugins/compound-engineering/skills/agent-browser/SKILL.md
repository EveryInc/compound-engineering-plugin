---
name: agent-browser
description: Browser automation using Vercel's agent-browser CLI. Use when you need to interact with web pages, fill forms, take screenshots, or scrape data. Alternative to Playwright MCP - uses Bash commands with ref-based element selection. Triggers on "browse website", "fill form", "click button", "take screenshot", "scrape page", "web automation".
---

# agent-browser: CLI Browser Automation

Vercel's headless browser automation CLI designed for AI agents. Uses ref-based selection (@e1, @e2) from accessibility snapshots.

## Setup Check

```bash
# Check installation
command -v agent-browser >/dev/null 2>&1 && echo "Installed" || echo "NOT INSTALLED - run: npm install -g agent-browser && agent-browser install"
```

### Install if needed

```bash
npm install -g agent-browser
agent-browser install  # Downloads Chromium
```

## Core Workflow

**The snapshot + ref pattern is optimal for LLMs:**

1. **Navigate** to URL
2. **Snapshot** to get interactive elements with refs
3. **Interact** using refs (@e1, @e2, etc.)
4. **Re-snapshot** after navigation or DOM changes

```bash
# Step 1: Open URL
agent-browser open https://example.com

# Step 2: Get interactive elements with refs
agent-browser snapshot -i --json

# Step 3: Interact using refs
agent-browser click @e1
agent-browser fill @e2 "search query"

# Step 4: Re-snapshot after changes
agent-browser snapshot -i
```

## Key Commands

### Navigation

```bash
agent-browser open <url>       # Navigate to URL
agent-browser back             # Go back
agent-browser forward          # Go forward
agent-browser reload           # Reload page
agent-browser close            # Close browser
```

### Snapshots (Essential for AI)

```bash
agent-browser snapshot              # Full accessibility tree
agent-browser snapshot -i           # Interactive elements only (recommended)
agent-browser snapshot -i --json    # JSON output for parsing
agent-browser snapshot -c           # Compact (remove empty elements)
agent-browser snapshot -d 3         # Limit depth
```

### Interactions

```bash
agent-browser click @e1                    # Click element
agent-browser dblclick @e1                 # Double-click
agent-browser fill @e1 "text"              # Clear and fill input
agent-browser type @e1 "text"              # Type without clearing
agent-browser press Enter                  # Press key
agent-browser hover @e1                    # Hover element
agent-browser check @e1                    # Check checkbox
agent-browser uncheck @e1                  # Uncheck checkbox
agent-browser select @e1 "option"          # Select dropdown option
agent-browser scroll down 500              # Scroll (up/down/left/right)
agent-browser scrollintoview @e1           # Scroll element into view
```

### Get Information

```bash
agent-browser get text @e1          # Get element text
agent-browser get html @e1          # Get element HTML
agent-browser get value @e1         # Get input value
agent-browser get attr href @e1     # Get attribute
agent-browser get title             # Get page title
agent-browser get url               # Get current URL
agent-browser get count "button"    # Count matching elements
```

### Screenshots & PDFs

```bash
agent-browser screenshot                      # Viewport screenshot
agent-browser screenshot --full               # Full page
agent-browser screenshot output.png           # Save to file
agent-browser screenshot --full output.png    # Full page to file
agent-browser pdf output.pdf                  # Save as PDF
```

### Wait

```bash
agent-browser wait @e1              # Wait for element
agent-browser wait 2000             # Wait milliseconds
agent-browser wait "text"           # Wait for text to appear
```

## Semantic Locators (Alternative to Refs)

```bash
agent-browser find role button click --name "Submit"
agent-browser find text "Sign up" click
agent-browser find label "Email" fill "user@example.com"
agent-browser find placeholder "Search..." fill "query"
```

## Sessions (Parallel Browsers)

```bash
# Run multiple independent browser sessions
agent-browser --session browser1 open https://site1.com
agent-browser --session browser2 open https://site2.com

# List active sessions
agent-browser session list
```

## Examples

### Login Flow

```bash
agent-browser open https://app.example.com/login
agent-browser snapshot -i
# Output shows: textbox "Email" [ref=e1], textbox "Password" [ref=e2], button "Sign in" [ref=e3]
agent-browser fill @e1 "user@example.com"
agent-browser fill @e2 "password123"
agent-browser click @e3
agent-browser wait 2000
agent-browser snapshot -i  # Verify logged in
```

### Search and Extract

```bash
agent-browser open https://news.ycombinator.com
agent-browser snapshot -i --json
# Parse JSON to find story links
agent-browser get text @e12  # Get headline text
agent-browser click @e12     # Click to open story
```

### Form Filling

```bash
agent-browser open https://forms.example.com
agent-browser snapshot -i
agent-browser fill @e1 "John Doe"
agent-browser fill @e2 "john@example.com"
agent-browser select @e3 "United States"
agent-browser check @e4  # Agree to terms
agent-browser click @e5  # Submit button
agent-browser screenshot confirmation.png
```

### Debug Mode

```bash
# Run with visible browser window
agent-browser --headed open https://example.com
agent-browser --headed snapshot -i
agent-browser --headed click @e1
```

## JSON Output

Add `--json` for structured output:

```bash
agent-browser snapshot -i --json
```

Returns:
```json
{
  "success": true,
  "data": {
    "refs": {
      "e1": {"name": "Submit", "role": "button"},
      "e2": {"name": "Email", "role": "textbox"}
    },
    "snapshot": "- button \"Submit\" [ref=e1]\n- textbox \"Email\" [ref=e2]"
  }
}
```

## Inspection & Debugging

### JavaScript Evaluation

```bash
agent-browser eval "document.title"                    # Evaluate JS expression
agent-browser eval "JSON.stringify(localStorage)"      # Return serialized data
agent-browser eval "document.querySelectorAll('a').length"  # Count elements
```

### Console & Errors

```bash
agent-browser console                 # Show browser console output
agent-browser console --clear         # Show and clear console
agent-browser errors                  # Show JavaScript errors only
agent-browser errors --clear          # Show and clear errors
```

## Network

```bash
agent-browser network requests                          # List captured requests
agent-browser network requests --filter "api"           # Filter by URL pattern
agent-browser route "**/*.png" abort                    # Block matching requests
agent-browser route "https://api.example.com/*" fulfill --status 200 --body '{"mock":true}'  # Mock response
agent-browser unroute "**/*.png"                        # Remove route handler
```

## Storage

### Cookies

```bash
agent-browser cookies get                               # Get all cookies
agent-browser cookies get --name "session"              # Get specific cookie
agent-browser cookies set --name "token" --value "abc"  # Set cookie
agent-browser cookies clear                             # Clear all cookies
```

### Local & Session Storage

```bash
agent-browser storage local                             # Get all localStorage
agent-browser storage local --key "theme"               # Get specific key
agent-browser storage session                           # Get all sessionStorage
agent-browser storage session --key "cart"              # Get specific key
```

## Device & Settings

```bash
agent-browser set viewport 1920 1080                    # Set viewport size
agent-browser set device "iPhone 14"                    # Emulate device
agent-browser set geo --lat 47.6 --lon -122.3           # Set geolocation
agent-browser set offline true                          # Enable offline mode
agent-browser set offline false                         # Disable offline mode
agent-browser set media "prefers-color-scheme" "dark"   # Set media feature
agent-browser set headers '{"X-Custom":"value"}'        # Set extra HTTP headers
agent-browser set credentials "user" "pass"             # Set HTTP auth credentials
```

## Element Debugging

```bash
agent-browser highlight @e1                             # Highlight element visually
agent-browser get box @e1                               # Get bounding box (x, y, width, height)
agent-browser get styles @e1                            # Get computed styles
agent-browser is visible @e1                            # Check if element is visible
agent-browser is enabled @e1                            # Check if element is enabled
agent-browser is checked @e1                            # Check if checkbox/radio is checked
```

## Recording & Tracing

```bash
agent-browser trace start                               # Start recording trace
agent-browser trace stop trace.zip                      # Stop and save trace file
agent-browser record start                              # Start recording video
agent-browser record stop video.webm                    # Stop and save recording
```

## Tabs & Windows

```bash
agent-browser tab list                                  # List open tabs
agent-browser tab new https://example.com               # Open URL in new tab
agent-browser tab close                                 # Close current tab
agent-browser tab 2                                     # Switch to tab by index
```

## Advanced Mouse

```bash
agent-browser mouse move 100 200                        # Move mouse to coordinates
agent-browser mouse down                                # Press mouse button
agent-browser mouse up                                  # Release mouse button
agent-browser mouse wheel 0 500                         # Scroll (deltaX, deltaY)
agent-browser drag @e1 @e2                              # Drag from element to element
```

## vs Playwright MCP

| Feature | agent-browser (CLI) | Playwright MCP |
|---------|---------------------|----------------|
| Interface | Bash commands | MCP tools |
| Selection | Refs (@e1) | Refs (e1) |
| Output | Text/JSON | Tool responses |
| Parallel | Sessions | Tabs |
| Best for | Quick automation | Tool integration |

Use agent-browser when:
- You prefer Bash-based workflows
- You want simpler CLI commands
- You need quick one-off automation

Use Playwright MCP when:
- You need deep MCP tool integration
- You want tool-based responses
- You're building complex automation
