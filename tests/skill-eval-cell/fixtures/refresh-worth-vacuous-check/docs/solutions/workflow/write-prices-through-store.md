---
title: Write prices through savePrice, never to the cache directly
module: prices
tags: [cache, invalidation]
problem_type: runtime_error
date: 2026-02-14
---

## Problem

Checkout showed customers a discount that had already ended. A price write went straight to the cache and skipped invalidation, so readers kept the old price.

## Solution

Write prices only through `savePrice` in `src/store.js`, which writes and then invalidates. A direct cache write skips invalidation, so readers keep serving the old price.
