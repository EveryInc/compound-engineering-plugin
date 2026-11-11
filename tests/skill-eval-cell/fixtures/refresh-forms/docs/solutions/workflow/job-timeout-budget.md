---
title: Why the job timeout is thirty seconds
module: jobs
tags: [timeouts]
problem_type: workflow_issue
date: 2026-03-09
---

## Context

Jobs longer than thirty seconds were cut off with no error.

## Guidance

Keep the job timeout at thirty seconds because the upstream gateway closes idle connections at thirty-five, and a job must fail before the gateway hides the reason.
