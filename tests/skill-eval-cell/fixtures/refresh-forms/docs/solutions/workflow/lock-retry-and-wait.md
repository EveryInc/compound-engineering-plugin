---
title: Lock retry count and wait budget
module: jobs
tags: [locking, retry]
problem_type: workflow_issue
date: 2026-03-02
---

## Context

Jobs hung for minutes retrying a lock.

## Guidance

Retry a lock acquisition at most once. The lock holder is always this same process, so a second retry can never succeed.

We measured 1,204 acquisitions on 2026-03-02: the p99 wait was 40 ms. A backoff was rejected because no contention exists to back off from.
