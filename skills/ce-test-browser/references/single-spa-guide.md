# Single-SPA Micro Frontend Testing Guide

Load this reference when testing single-spa micro frontend applications with `agent-browser`. Covers mount detection, cross-app navigation, auth flows, and WebSocket-driven update patterns.

## Known Limitations

`agent-browser` has **no JavaScript evaluation capability**. All "framework awareness" in this guide uses DOM-based workarounds:

- **Mount detection** = waiting for a known DOM element to appear (not detecting the single-spa mount event)
- **WebSocket awareness** = polling for UI changes (not hooking into socket events)
- **State checking** = reading visible DOM content (not querying Vuex store)

These workarounds are reliable for testing but cannot detect invisible failures (e.g., socket event received but UI didn't update).

## App Topology

| App | Base Path | Port (dev) | Mount Element | AMD Output |
|-----|-----------|-----------|---------------|------------|
| Main Shell | `/` | — | `#app` | orchestrator |
| Messaging | `/messaging-portal` | 8240 | `#messaging` | `messaging.js` |
| MCS | `/multichannel-portal` | 8243 | `#multichannel-sender` | `sender.js` |
| Automation | `/automation` | — | TBD | React + Bun |

## Mount Detection

Single-spa apps mount/unmount based on route. After navigating to an app's route, wait for its mount element to have child content before interacting.

**Pattern:**
```
1. agent-browser navigate <base-url>/messaging-portal
2. agent-browser wait #messaging          # Wait for mount element
3. agent-browser snapshot -i              # Verify app content is loaded
4. # Now safe to interact with the app
```

**Why not just `wait` for the mount element?** The `#messaging` div may exist in the HTML before the app mounts (it's a static container). Wait for a child element that only appears after the Vue app renders — e.g., a navigation bar, a specific component, or any content inside the container.

**Better pattern:**
```
1. agent-browser navigate <base-url>/messaging-portal
2. agent-browser wait .messaging-sidebar   # Wait for a child that proves the app mounted
3. agent-browser snapshot -i
```

## Cross-App Navigation

When navigating between micro frontends, the current app unmounts and the new app mounts. This takes time.

**Pattern:**
```
1. # Currently in Messaging at /messaging-portal
2. agent-browser navigate <base-url>/multichannel-portal
3. agent-browser wait 2000                 # Allow unmount/mount cycle
4. agent-browser wait #multichannel-sender # Wait for MCS mount
5. agent-browser snapshot -i               # Verify MCS is loaded
```

**Common mistake:** Interacting with elements immediately after navigation. The old app's DOM may still be present during the unmount/mount transition.

## Auth Flow

### Prerequisites
- Shell app running (serves the login page at `/`)
- Test credentials in environment variables:
  - `TEST_USER_EMAIL` — test account email
  - `TEST_USER_PASSWORD` — test account password
- Descope auth service reachable

### Login Pattern
```
1. agent-browser navigate <base-url>/
2. agent-browser wait [data-testid="login-form"]    # Or the actual login form selector
3. agent-browser fill @email-input $TEST_USER_EMAIL
4. agent-browser fill @password-input $TEST_USER_PASSWORD
5. agent-browser click @login-button
6. agent-browser wait 3000                           # Allow auth redirect
7. agent-browser wait .main-shell-content            # Verify logged-in state
```

### Session Persistence
After login through the shell app, session cookies are set in the browser. Navigating to micro frontend routes (`/messaging-portal`, `/multichannel-portal`) carries the auth state automatically — no need to re-login.

### Error Handling
If login fails:
1. **Check env vars:** Are `TEST_USER_EMAIL` and `TEST_USER_PASSWORD` set?
2. **Check Descope:** Is the auth service reachable? (may not be available in local dev)
3. **Check 2FA:** Does the test account require two-factor authentication? If so, it cannot be automated with `agent-browser`.
4. **Check rate limiting:** Descope may rate-limit login attempts. Wait and retry.
5. **Take a screenshot:** `agent-browser screenshot --full` to see what the login page shows.

## WebSocket-Driven Updates

Our apps use a Vuex socket module for real-time updates (new messages, status changes). Since `agent-browser` cannot hook into WebSocket events, use poll-and-wait patterns.

**Pattern: Wait for a message to appear**
```
1. # Trigger the action that should produce a WebSocket event
2. # (e.g., send a message via API, or click send in the UI)
3. agent-browser wait .message-list-item:last-child   # Wait for new DOM element
4. agent-browser snapshot -i                            # Verify content
```

**Pattern: Wait for a status change**
```
1. # Trigger status change
2. agent-browser wait [data-status="active"]            # Wait for attribute change
3. agent-browser snapshot -i
```

**Timeout guidance:** If the expected UI change doesn't appear within 10 seconds, the event likely didn't arrive or the UI didn't update. Take a screenshot and report the failure rather than waiting indefinitely.

**What you can't detect:** If a WebSocket event arrives but the UI handler has a bug and doesn't update the DOM, the wait will time out. This is a real limitation — report it as "expected UI change did not appear within timeout" and let the developer investigate.

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Mount element exists but app content doesn't load | App hasn't finished mounting | Wait for a child element, not just the container |
| Login succeeds but micro frontend shows "unauthorized" | Session cookie not set correctly | Check if the shell app and micro frontend are on the same domain |
| Elements not found after navigation | Old app's DOM is still present during transition | Add a delay before waiting for the new app's elements |
| WebSocket updates don't appear | Socket not connected, or event handler bug | Check if the dev server's WebSocket endpoint is running |
| `agent-browser wait` times out | Element selector is wrong, or the element is inside a shadow DOM | Use `agent-browser snapshot -i` to inspect available elements |
