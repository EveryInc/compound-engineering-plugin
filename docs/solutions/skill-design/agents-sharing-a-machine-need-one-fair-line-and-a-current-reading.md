---
title: "Agents sharing a machine need one fair line and a current reading, not a job cap"
date: 2026-11-25
category: skill-design
module: skills/afg
problem_type: design_pattern
component: tooling
severity: medium
applies_when:
  - "Changing how afg queues checks or decides that a machine is busy, calm or has processors to spare"
  - "Writing a lock or load check that several agents or repositories share"
tags: [afg, flock, load-average, macos, concurrency]
---

# Agents sharing a machine need one fair line and a current reading, not a job cap

## Context

`afg` first kept a machine usable with a job cap, a polled file lock and the load average. None was enough alone, and going back to one looks like a simplification. Swap use was considered as a sign of memory pressure and never shipped.

## Guidance

| Belief | What is true |
|---|---|
| A cap on jobs bounds the load | A job's worker starts its own tests, browsers and agents, which no cap counts. `JOBS_AT_ONCE` limits started work when no allowance file does. The line in `machine_turn` limits heavy work, and only what goes through it |
| Polling a `flock` takes turns | A waiter blocked in `LOCK_EX` usually gets the lock before a poller looks again. With 0.3s holds over 8 seconds, two blocking lockers took 12 and 15 turns and one that polled every 0.2s took 1 (macOS; a second run gave 15, 12 and 1). `take_ticket` orders those in the line, and that holds only while no other program locks the line's file |
| The load average says whether processors are free | It lags the machine, so it kept another check waiting on idle processors. `machine_spare` sums process use, which is more current, after `machine_busy` has had its say. Load still serves for "far too much is waiting" (`machine_busy`) and "quiet enough to trust a timing test" (`machine_calm`) |
| High swap use means memory is short | Swap use and pressure can disagree. One macOS reading was 25,560 MB used of 26,624 MB (96%) with `kern.memorystatus_vm_pressure_level` at 1, normal. `machine_busy` reads that level, and 4 is critical |

## When to Apply

Read this before replacing the ticket queue with a lock, or before judging free processors by load or memory by swap. Waiting behind an earlier ticket and running another check at once are tested in `tests/skills/afg-work.test.ts`. Which signal is read is not, because tests set it through the environment.
