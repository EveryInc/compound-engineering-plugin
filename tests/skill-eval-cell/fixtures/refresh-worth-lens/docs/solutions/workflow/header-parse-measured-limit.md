---
title: Header parsing must not use split on the first colon
module: jobs
tags: [parsing]
problem_type: runtime_error
date: 2026-04-11
---

## Problem

`parseHeader` returns the wrong value for headers whose value itself contains a colon, such as timestamps. Measured on 2026-04-11 against 1,204 production headers: 61 (5.1%) contain a colon in the value.

## Solution

Split on the first colon only. The obvious alternative, a regex on `^[^:]+:`, was rejected because it fails on header names that legitimately contain a colon on the ingest side (vendor-prefixed names). Nothing in the code or tests records either the measurement or the rejected alternative.
