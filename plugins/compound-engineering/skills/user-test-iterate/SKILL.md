---
name: user-test-iterate
description: Run the same user test scenario N times to measure consistency. Use when validating score stability or detecting flaky areas.
disable-model-invocation: true
allowed-tools: Skill(user-test)
argument-hint: "[scenario-file] [n]"
---

Invoke the user-test skill in iterate mode for: $ARGUMENTS
