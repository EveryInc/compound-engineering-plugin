#!/usr/bin/env bash
# Builds one ce-simplify-code sizing fixture: a committed baseline with a
# rounding helper, plus a change of a known substantive size.
# Usage: build-fixture.sh <dest-dir> <l5|l12|l12noise|l45|ae6>
# l45 and the l12 variants leave the change uncommitted on main, as a
# simplify pass after implementation sees it. l5 and ae6 commit it on a
# feature branch instead, as lfg's step 3 sees it; ae6 writes the
# simplified_through SHA to .git/SIMPLIFIED_THROUGH for the runner.
set -euo pipefail
D="$1"; V="$2"
[ -e "$D" ] && { echo "$D exists; pass a new directory" >&2; exit 2; }
mkdir -p "$D/src" "$D/tests"
cd "$D"
cat > AGENTS.md <<'EOF'
# acme-orders

Order pricing helpers. Bun + TypeScript; run tests with `bun test`.
EOF
cat > package.json <<'EOF'
{ "name": "acme-orders", "private": true, "type": "module", "scripts": { "test": "bun test" } }
EOF
cat > src/money.ts <<'EOF'
export function roundCents(value: number): number {
  return Math.round(value * 100) / 100
}

export function sum(values: number[]): number {
  return values.reduce((total, v) => total + v, 0)
}
EOF
cat > src/orders.ts <<'EOF'
import { roundCents, sum } from "./money"

export interface Line {
  sku: string
  price: number
  qty: number
}

export function subtotal(lines: Line[]): number {
  return roundCents(sum(lines.map((l) => l.price * l.qty)))
}
EOF
cat > tests/orders.test.ts <<'EOF'
import { expect, test } from "bun:test"
import { subtotal } from "../src/orders"

test("subtotal multiplies price by quantity", () => {
  expect(subtotal([{ sku: "a", price: 1.25, qty: 2 }, { sku: "b", price: 0.1, qty: 3 }])).toBe(2.8)
})
EOF
git init -q -b main
git config user.name "Acme Dev"; git config user.email dev@acme.test
git add -A; git commit -q -m "Add order subtotal"

# 12 substantive lines: a discount that re-implements roundCents inline.
add_discount() {
cat >> src/orders.ts <<'EOF'

export function applyDiscount(lines: Line[], percent: number): number {
  if (percent < 0 || percent > 100) {
    throw new Error("percent must be between 0 and 100")
  }
  let total = 0
  for (const l of lines) {
    total = total + l.price * l.qty
  }
  const off = (total * percent) / 100
  const discounted = total - off
  return Math.round(discounted * 100) / 100
}
EOF
cat > tests/discount.test.ts <<'EOF'
import { expect, test } from "bun:test"
import { applyDiscount } from "../src/orders"

const lines = [
  { sku: "a", price: 10, qty: 2 },
  { sku: "b", price: 5, qty: 1 },
]

test("applyDiscount takes the percent off the subtotal", () => {
  expect(applyDiscount(lines, 10)).toBe(22.5)
})

test("applyDiscount with zero percent returns the subtotal", () => {
  expect(applyDiscount(lines, 0)).toBe(25)
})

test("applyDiscount rejects a negative percent", () => {
  expect(() => applyDiscount(lines, -1)).toThrow()
})

test("applyDiscount rejects a percent over 100", () => {
  expect(() => applyDiscount(lines, 101)).toThrow()
})
EOF
}

# 33 more substantive lines: tax and shipping, each re-implementing the same sum and rounding.
add_tax_shipping() {
cat >> src/orders.ts <<'EOF'

export function taxFor(lines: Line[], rate: number): number {
  if (rate < 0) {
    throw new Error("rate must not be negative")
  }
  let total = 0
  for (const l of lines) {
    total = total + l.price * l.qty
  }
  const tax = total * rate
  return Math.round(tax * 100) / 100
}

export function shippingFor(lines: Line[], perItem: number, freeOver: number): number {
  let total = 0
  for (const l of lines) {
    total = total + l.price * l.qty
  }
  if (total >= freeOver) {
    return 0
  }
  let items = 0
  for (const l of lines) {
    items = items + l.qty
  }
  const shipping = items * perItem
  return Math.round(shipping * 100) / 100
}

export function grandTotal(lines: Line[], rate: number, perItem: number, freeOver: number): number {
  const empty = lines.length === 0
  if (empty) return 0
  const base = subtotal(lines)
  const all = base + taxFor(lines, rate) + shippingFor(lines, perItem, freeOver)
  return Math.round(all * 100) / 100
}
EOF
cat > tests/totals.test.ts <<'EOF'
import { expect, test } from "bun:test"
import { grandTotal, shippingFor, taxFor } from "../src/orders"

const lines = [{ sku: "a", price: 10, qty: 2 }]

test("taxFor applies the rate", () => {
  expect(taxFor(lines, 0.1)).toBe(2)
})

test("shippingFor is free over the threshold", () => {
  expect(shippingFor(lines, 3, 15)).toBe(0)
})

test("shippingFor charges per item under the threshold", () => {
  expect(shippingFor(lines, 3, 50)).toBe(6)
})

test("grandTotal adds tax and shipping", () => {
  expect(grandTotal(lines, 0.1, 3, 50)).toBe(28)
})
EOF
}

case "$V" in
  l5)
    git checkout -q -b feature/item-count
    cat >> src/orders.ts <<'EOF'

export function itemCount(lines: Line[]): number {
  let n = 0
  for (const l of lines) n = n + l.qty
  return n
}
EOF
    git add -A; git commit -q -m "feat: add itemCount"
    ;;
  l12)
    add_discount
    git add -N tests/discount.test.ts
    ;;
  l12noise)
    add_discount
    mkdir -p docs/plans tests/fixtures
    {
      echo "# Discount plan"; echo
      echo "## Goal"; echo; echo "Let checkout take a percent off the order subtotal."; echo
      echo "## Units"; echo
      for i in $(seq 1 40); do echo "- Step $i: describe the discount behavior for case $i and how it is verified."; done
    } > docs/plans/2026-11-04-discount-plan.md
    {
      echo "["
      for i in $(seq 1 60); do
        sep=","; [ "$i" = 60 ] && sep=""
        echo "  { \"sku\": \"sku-$i\", \"price\": $i.5, \"qty\": $((i % 4 + 1)) }$sep"
      done
      echo "]"
    } > tests/fixtures/lines.json
    git add -N tests/discount.test.ts docs/plans/2026-11-04-discount-plan.md tests/fixtures/lines.json
    ;;
  l45)
    add_discount
    add_tax_shipping
    git add -N tests/discount.test.ts tests/totals.test.ts
    ;;
  ae6)
    git checkout -q -b feature/totals
    add_tax_shipping
    git add -A; git commit -q -m "feat: add tax, shipping, and grand total"
    git rev-parse HEAD > .git/SIMPLIFIED_THROUGH
    add_discount
    git add -A; git commit -q -m "feat: add applyDiscount"
    ;;
  *) echo "unknown variant: $V" >&2; exit 2 ;;
esac
echo "fixture ready: $D ($V)"
