---
title: Run migrations before deploying the app
module: deploy
tags: [deploy, migrations]
problem_type: workflow_issue
date: 2026-03-02
---

## Context

A deploy that ran before its migration served errors for four minutes.

## Guidance

Run migrations first. The deploy tool has no ordering guard, and we kept it that way because migrations also run from a separate host.
