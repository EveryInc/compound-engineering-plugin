---
name: browser-test
description: Run browser tests on pages affected by current PR or branch using agent-browser
argument-hint: "[PR number, branch name, or 'current' for current branch]"
---

# Browser Test Command

<command_purpose>Run end-to-end browser tests on pages affected by a PR or branch changes using agent-browser CLI.</command_purpose>

## Introduction

<role>QA Engineer specializing in browser-based end-to-end testing</role>

This command tests affected pages in a real browser, catching issues that unit tests miss:
- JavaScript integration bugs
- CSS/layout regressions
- User workflow breakages
- Console errors

## Prerequisites

<requirements>
- Local development server running (e.g., `bin/dev`, `rails server`)
- agent-browser CLI installed (`npx -y agent-browser@latest --help`)
- Git repository with changes to test
</requirements>

## Main Tasks

### 1. Determine Test Scope

<test_target> $ARGUMENTS </test_target>

<determine_scope>

**If PR number provided:**
```bash
gh pr view [number] --json files -q '.files[].path'
```

**If 'current' or empty:**
```bash
git diff --name-only main...HEAD
```

**If branch name provided:**
```bash
git diff --name-only main...[branch]
```

</determine_scope>

### 2. Map Files to Routes

<file_to_route_mapping>

Map changed files to testable routes:

| File Pattern | Route(s) |
|-------------|----------|
| `app/views/users/*` | `/users`, `/users/:id`, `/users/new` |
| `app/controllers/settings_controller.rb` | `/settings` |
| `app/javascript/controllers/*_controller.js` | Pages using that Stimulus controller |
| `app/components/*_component.rb` | Pages rendering that component |
| `app/views/layouts/*` | All pages (test homepage at minimum) |
| `app/assets/stylesheets/*` | Visual regression on key pages |
| `app/helpers/*_helper.rb` | Pages using that helper |

Build a list of URLs to test based on the mapping.

</file_to_route_mapping>

### 3. Verify Server is Running

<check_server>

Before testing, verify the local server is accessible using Bash:

```bash
npx -y agent-browser@latest open http://localhost:3000
npx -y agent-browser@latest snapshot -i
npx -y agent-browser@latest close
```

If server is not running, inform user:
```markdown
**Server not running**

Please start your development server:
- Rails: `bin/dev` or `rails server`
- Node: `npm run dev`

Then run `/browser-test` again.
```

</check_server>

### 4. Test Each Affected Page

<test_pages>

For each affected route:

**Step 1: Navigate and capture snapshot**
```bash
npx -y agent-browser@latest open http://localhost:3000/[route]
npx -y agent-browser@latest snapshot -i
```

**Step 2: Check for errors**
```bash
npx -y agent-browser@latest console
```

**Step 3: Verify key elements**
- Page title/heading present
- Primary content rendered
- No error messages visible
- Forms have expected fields

**Step 4: Test critical interactions (if applicable)**
```bash
# Click element by ref (from snapshot output)
npx -y agent-browser@latest click @e1
npx -y agent-browser@latest snapshot -i
```

**Step 5: Close browser after testing**
```bash
npx -y agent-browser@latest close
```

</test_pages>

### 5. Human Verification (When Required)

<human_verification>

Pause for human input when testing touches:

| Flow Type | What to Ask |
|-----------|-------------|
| OAuth | "Please sign in with [provider] and confirm it works" |
| Email | "Check your inbox for the test email and confirm receipt" |
| Payments | "Complete a test purchase in sandbox mode" |
| SMS | "Verify you received the SMS code" |
| External APIs | "Confirm the [service] integration is working" |

Use AskUserQuestion:
```markdown
**Human Verification Needed**

This test touches the [flow type]. Please:
1. [Action to take]
2. [What to verify]

Did it work correctly?
1. Yes - continue testing
2. No - describe the issue
```

</human_verification>

### 6. Handle Failures

<failure_handling>

When a test fails:

1. **Document the failure:**
   - Screenshot the error state
   - Capture console errors
   - Note the exact reproduction steps

2. **Ask user how to proceed:**
   ```markdown
   **Test Failed: [route]**

   Issue: [description]
   Console errors: [if any]

   How to proceed?
   1. Fix now - I'll help debug and fix
   2. Create todo - Add to todos/ for later
   3. Skip - Continue testing other pages
   ```

3. **If "Fix now":**
   - Investigate the issue
   - Propose a fix
   - Apply fix
   - Re-run the failing test

4. **If "Create todo":**
   - Create `{id}-pending-p1-playwright-{description}.md`
   - Continue testing

5. **If "Skip":**
   - Log as skipped
   - Continue testing

</failure_handling>

### 7. Test Summary

<test_summary>

After all tests complete, present summary:

```markdown
## 🌐 Browser Test Results

**Test Scope:** PR #[number] / [branch name]
**Server:** http://localhost:3000
**Tool:** agent-browser

### Pages Tested: [count]

| Route | Status | Notes |
|-------|--------|-------|
| `/users` | ✅ Pass | |
| `/settings` | ✅ Pass | |
| `/dashboard` | ❌ Fail | Console error: [msg] |
| `/checkout` | ⏭️ Skip | Requires payment credentials |

### Console Errors: [count]
- [List any errors found]

### Human Verifications: [count]
- OAuth flow: ✅ Confirmed
- Email delivery: ✅ Confirmed

### Failures: [count]
- `/dashboard` - [issue description]

### Created Todos: [count]
- `005-pending-p1-playwright-dashboard-error.md`

### Result: [PASS / FAIL / PARTIAL]
```

</test_summary>

## Quick Usage Examples

```bash
# Test current branch changes
/browser-test

# Test specific PR
/browser-test 847

# Test specific branch
/browser-test feature/new-dashboard
```
