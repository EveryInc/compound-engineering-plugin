---
title: Codex content transform regexes greedily matched URLs and email-like strings
date: 2026-07-24
category: integrations
module: src/utils/codex-content.ts
problem_type: logic_error
component: tooling
symptoms:
  - "Slash-command rewrite corrupted URLs such as `https://example.com/path` by matching the second `/`"
  - "Slash-command rewrite corrupted route-like values inside URL queries and fragments"
  - "@-agent rewrite corrupted email-like strings such as `user@security-reviewer` by matching the `@` inside a word"
  - "@-agent rewrite partially transformed longer mention-like identifiers"
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
- URL queries and fragments such as `https://example.com?next=/unknown-cmd` and `https://example.com/#/ce-plan` had their embedded routes rewritten as commands.
- Email-like strings such as `user@security-reviewer` were rewritten as `usercustom agent \`security-reviewer\`` because the `@`-agent regex matched the `@` inside a word.
- Longer handles such as `@security-reviewer_helper` were partially rewritten because `_` was not treated as a continuation character.

## What Didn't Work

Guarding inside the slash-command replacement callback with `commandName.includes("/")` did not prevent the match; the URL's second slash still entered the callback. Removing the guard alone would not fix the underlying match, and adding a second post-match filter would still have rewritten the URL before the guard could reject it.

For `@`-references, there was no boundary check at all, so any `@` followed by a recognized suffix was transformed regardless of context.

## Solution

Handle each exclusion at its owning layer: preserve HTTP(S) spans once around all free-form rewrites, and keep mention-token boundaries in the `@` regex.

`transformOutsideHttpUrls()` splits the content into URL and non-URL spans. Backticked-agent, slash-command, path, and `@`-agent rewrites run only on the non-URL spans:

```typescript
result = transformOutsideHttpUrls(result, (segment) => {
  // Apply the free-form Codex rewrites to segment.
  return transformed
})
```

This handles ordinary paths, query/fragment variants, and agent-like URL tokens without enumerating every punctuation character that may precede an embedded route or mention.

`@`-agent references now require token boundaries before the `@` and after the recognized name:

```typescript
const agentRefPattern = /(?<!\w)@([a-z][a-z0-9-]*-(?:agent|reviewer|researcher|analyst|specialist|oracle|sentinel|guardian|strategist))(?![\w-])/gi
```

## Why This Works

The shared wrapper copies each complete non-whitespace HTTP(S) token unchanged and applies every free-form rewrite only to the text between URLs. Commands, paths, and agent mentions elsewhere in the same string still transform normally.

A `@` that follows a word character is part of an email handle, username, or other compound token, not a stand-alone agent mention. The `(?<!\w)` lookbehind ensures only boundary `@` symbols are considered, while `(?![\w-])` prevents partial matches inside longer identifiers.

## Prevention

- Put token-local exclusions in the pattern, but protect shared lexical regions such as URLs once at the layer that owns all affected rewrites.
- Test common embedding cases early: URLs, markdown links, HTML attributes, quoted strings, email addresses, and parentheses.
- When one protected context affects multiple sequential transforms, test that every stage preserves it and that equivalent syntax outside the context still transforms.

## Related

- `docs/solutions/codex-skill-prompt-entrypoints.md` — broader Codex converter architecture and the rule to preserve unknown slash references.
