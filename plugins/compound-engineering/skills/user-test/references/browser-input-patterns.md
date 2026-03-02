# Browser Input Patterns

Patterns for interacting with web apps via `claude-in-chrome` MCP tools.

## React-Safe Input

React uses synthetic events and controlled components. Setting `.value` directly
bypasses React's state management. Use the native setter pattern:

```javascript
// React-safe input via javascript_tool
mcp__claude-in-chrome__javascript_tool({
  code: `
    const el = document.querySelector('input[name="email"]');
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    ).set;
    setter.call(el, 'test@example.com');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  `
})
```

This works for `<input>`, `<textarea>`, and `<select>` elements in React, Vue,
and other virtual-DOM frameworks.

## Batching DOM Checks

Each MCP call is a Chrome extension round-trip. Batch simple checks into one call:

```javascript
// Batch multiple checks into one javascript_tool call
mcp__claude-in-chrome__javascript_tool({
  code: `JSON.stringify({
    submitBtn: !!document.querySelector('[type=submit]'),
    errorMsg: !!document.querySelector('.error'),
    price: document.querySelector('.price')?.textContent,
    itemCount: document.querySelectorAll('.cart-item').length
  })`
})
```

## File Upload Limitation

File uploads (`<input type="file">`) cannot be automated via claude-in-chrome.
Mark these interactions as `MANUAL ONLY` in the test file. Workaround: pause the
test and use `/agent-browser` for file upload steps, then resume.

## Async Wait Pattern

Many interactions trigger async operations (API calls, animations, state updates).
Check for completion before asserting results:

```javascript
// Wait for async operation completion
mcp__claude-in-chrome__javascript_tool({
  code: `
    (async () => {
      const start = Date.now();
      const timeout = 10000;
      const selector = '.success-message'; // adapt per use case
      while (Date.now() - start < timeout) {
        if (document.querySelector(selector)) return 'found';
        await new Promise(r => setTimeout(r, 200));
      }
      return 'timeout';
    })()
  `
})
```

Adapt the selector and timeout per use case. Common patterns:
- Success message appears: `.success-message`, `.toast`, `[role="alert"]`
- Loading spinner gone: `!document.querySelector('.spinner')`
- Data rendered: `document.querySelectorAll('.result-item').length > 0`

## Agent Response Polling

After sending a query to an AI agent chat interface, poll for response completion instead of using fixed waits. AI agents take variable time (5-30s) — a fixed wait is either too short or too long.

**Polling pattern:**

```javascript
mcp__claude-in-chrome__javascript_tool({
  code: `
    (async () => {
      const start = Date.now();
      const timeout = 30000; // 30s max
      const interval = 1000; // check every 1s

      while (Date.now() - start < timeout) {
        const typing = document.querySelector('.typing-indicator, .loading-spinner');
        const response = document.querySelector('.agent-response:last-child, .message:last-child');
        const chips = document.querySelector('.suggestion-chips, .quick-replies');

        if (!typing && response && response.textContent.trim().length > 20) {
          await new Promise(r => setTimeout(r, 500)); // final render buffer
          return JSON.stringify({
            status: 'complete',
            waitedMs: Date.now() - start,
            hasChips: !!chips,
            responseLength: response.textContent.trim().length
          });
        }
        await new Promise(r => setTimeout(r, interval));
      }
      return JSON.stringify({ status: 'timeout', waitedMs: Date.now() - start });
    })()
  `
})
```

**Parameters:** 1-second poll interval, 30-second maximum. The 500ms final buffer allows post-streaming render (chips, formatting).

**Timeout handling:** A poll timeout is NOT a disconnect. The tool call succeeded — the agent response is slow. Log `waitedMs` in timing data. Proceed with whatever DOM state exists (partial response may be usable). Do NOT increment `disconnect_counter`.

**Selector adaptation:** Polling selectors vary per app. On first run, discover response indicators during exploration. Document in area details:

```markdown
**Agent response selectors:** typing=`.typing-indicator`,
response=`.chat-message:last-child`, chips=`.suggestion-chip`
```

**Fallback:** If selectors unknown (first run), use 3-second fixed wait then read_page. Shorter than current 5-10s because the read itself shows whether the response appeared.

## Modal Dialog Handling

JavaScript dialogs (`alert()`, `confirm()`, `prompt()`) block all browser events.
If MCP commands stop responding after triggering a dialog, instruct the user to
dismiss it manually before continuing.
