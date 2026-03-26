---
name: setup
description: Configure project-level settings for compound-engineering workflows. Currently a placeholder — review agent selection is handled automatically by ce:review.
disable-model-invocation: true
---

# Compound Engineering Setup

Project-level configuration for compound-engineering workflows.

## Current State

Review agent selection is handled automatically by the `ce:review` skill, which uses intelligent tiered selection based on diff content. No per-project configuration is needed for code reviews.

If this skill is invoked, inform the user:

> Review agent configuration is no longer needed — `ce:review` automatically selects the right reviewers based on your diff. Project-specific review context (e.g., "we serve 10k req/s" or "watch for N+1 queries") belongs in your project's CLAUDE.md or AGENTS.md, where all agents already read it.

## Future Use

This skill is reserved for future project-level configuration needs beyond review agent selection.
