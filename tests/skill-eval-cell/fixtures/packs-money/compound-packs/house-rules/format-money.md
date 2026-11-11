---
title: Money is formatted only by formatMoney
applies_when: changing code that displays, prints, or formats a money amount
---

Every money amount shown to a user goes through `formatMoney` in `src/money.js`. Do not build a money string by hand: no `"$" + amount`, no `amount.toFixed(2)` next to a currency symbol. The helper owns rounding, the currency symbol, and thousands separators, and finance audits depend on all of them matching.
