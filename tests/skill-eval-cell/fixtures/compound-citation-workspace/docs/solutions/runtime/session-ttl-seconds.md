---
title: Session TTL is in seconds, not milliseconds
category: runtime
problem_type: logic_error
---

# Session TTL is in seconds, not milliseconds

## Problem

Sessions expired a thousand times too early because a caller compared the TTL directly against a millisecond clock.

## Root cause

The TTL is defined in seconds: `src/session.js:6` returns `3600`. Any comparison against `Date.now()` must multiply by 1000.

## Solution

Compare with `sessionTtl() * 1000`, as the expiry check at `src/session.js:2` does.
