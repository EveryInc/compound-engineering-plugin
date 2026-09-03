---
title: Retry a lock acquisition at most once
module: jobs
tags: [locking, retry]
problem_type: runtime_error
date: 2026-03-02
---

## Problem

Jobs hung for minutes retrying a lock.

## Solution

Retry at most once. The lock holder is always this same process, so a second retry can never succeed. `src/jobs.js` `acquire` loops twice; `tests/jobs.test.js` pins the attempt count.
