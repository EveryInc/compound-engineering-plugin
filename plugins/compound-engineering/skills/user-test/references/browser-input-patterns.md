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

## Modal Dialog Handling

JavaScript dialogs (`alert()`, `confirm()`, `prompt()`) block all browser events.
If MCP commands stop responding after triggering a dialog, instruct the user to
dismiss it manually before continuing.
