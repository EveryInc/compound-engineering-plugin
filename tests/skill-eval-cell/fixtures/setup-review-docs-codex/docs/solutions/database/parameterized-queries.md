---
module: orders
tags: [sql, security]
problem_type: bug
---

# Order search concatenated customer input into SQL

Order search built its query by concatenating `customerId`. Switched every query in `src/orders.js` to `$1` placeholders with a values array.
