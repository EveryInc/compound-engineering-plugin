---
title: Codex content transform regexes greedily matched URLs and email-like strings
date: 2026-07-24
category: logic-errors
module: src/utils/codex-content.ts
problem_type: logic_error
component: tooling
symptoms:
  - "Slash-command rewrite corrupted URLs such as `https://example.com/path` by matching the second `/`"
  - "@-agent rewrite corrupted email-like strings such as `user@security-reviewer` by matching the `@` inside a word"
root_cause: logic_error
resolution_type: code_fix
severity: medium
tags: [codex, converter, regex, slash-commands, agent-mentions, url-handling, word-boundary]
related_components: [codex converter, transformContentForCodex]
---

# Codex content transform regexes greedily matched URLs and email-like strings

## Problem

`transformContentForCodex()` in `src/utils/codex-content.ts` rewrites Claude-style `Task` calls, slash commands, backticked agent names, and `@`-references into Codex-style phrasing. Two of its regexes were too greedy and matched the command/mention markers when they appeared inside unrelated text, producing incorrect output.

## Symptoms

- URLs such as `https://example.com/path` were rewritten as `https:prompts:example.com/path` because the slash-command regex matched the second `/`.
- Email-like strings such as `user@security-reviewer` were rewritten as `usercustom agent \`security-reviewer\`` because the `@`-agent regex matched the `@` inside a word.

## What Didn't Work

Guarding inside the slash-command replacement callback with `commandName.includes("/")` did not prevent the match; the URL's second slash still entered the callback. Removing the guard alone would not fix the underlying match, and adding a second post-match filter would still have rewritten the URL before the guard could reject it.

For `@`-references, there was no boundary check at all, so any `@` followed by a recognized suffix was transformed regardless of context.

## Solution

Move both exclusions into the regex patterns themselves instead of the replacement callbacks.

Slash commands now use a negative lookbehind that excludes another `/`:

```typescript
const slashCommandPattern = /(?<![:\w>}\]\)\/])\/([a-z][a-z0-9_:-]*?)(?=[\s,."')\]}`]|$)/gi
```

The `commandName.includes("/")` guard in the callback was then unreachable and was removed.

`@`-agent references now require a word boundary before the `@`:

```typescript
const agentRefPattern = /(?<!\w)@([a-z][a-z0-9-]*-(?:agent|reviewer|researcher|analyst|specialist|oracle|sentinel|guardian|strategist))/gi
```

## Why This Works

A slash that follows another slash is part of a URL path or protocol separator, not a leading command slash. The lookbehind rejects those positions before the match is consumed, so the replacement callback never sees a URL path segment.

A `@` that follows a word character is part of an email handle, username, or other compound token, not a stand-alone agent mention. The `(?<!\w)` lookbehind ensures only boundary `@` symbols are considered.

## Prevention

- When writing regexes for command or mention syntax that will run against free-form text, put the contextual exclusions in the pattern (lookbehind/lookahead) rather than in post-match guards.
- Test common embedding cases early: URLs, markdown links, HTML attributes, quoted strings, email addresses, and parentheses.
- Keep the negative lookbehind character class up to date with every character that can legitimately precede the same token (`/`, word chars, closing brackets, punctuation).

## Related

- `docs/solutions/codex-skill-prompt-entrypoints.md` — broader Codex converter architecture and the rule to preserve unknown slash references.
