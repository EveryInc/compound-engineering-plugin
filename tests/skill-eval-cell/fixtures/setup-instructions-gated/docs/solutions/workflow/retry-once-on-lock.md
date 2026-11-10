---
title: Retry once on lock contention
module: jobs
tags: [locking]
problem_type: runtime_error
---
A second retry never helps because the lock holder is the same process.
