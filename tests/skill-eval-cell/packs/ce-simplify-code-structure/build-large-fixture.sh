#!/usr/bin/env bash
# Builds the larger structural-pass fixture: the base fixture plus a hidden
# start-up order, a stable module importing a volatile one, a parameter only
# one caller understands, a pass-through wrapper, and one feature split by layer.
# Usage: build-large-fixture.sh <dest-dir>
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
D="$1"
"$HERE/build-fixture.sh" "$D" >/dev/null
cd "$D"
commit() { git add -A && git commit -qm "$1"; }
mkdir -p src/core src/campaigns src/controllers src/services src/models

cat > src/context.ts <<'EOF'
export let brand = ""

export function setBrand(name: string): void {
  brand = name
}
EOF
cat > src/boot.ts <<'EOF'
import { setBrand } from "./context"

export function boot(config: { brand: string }): void {
  setBrand(config.brand)
}
EOF
cat > src/format.ts <<'EOF'
import { brand } from "./context"

export function formatMessage(body: string, opts: { forPromo?: boolean } = {}): string {
  const text = `[${brand}] ${body}`
  if (opts.forPromo) return `${text} Reply STOP to opt out.`
  return text
}
EOF
cat > src/campaigns/promo.ts <<'EOF'
import { formatMessage } from "../format"
import { send } from "../send"

export const PROMO_MAX_ATTEMPTS = 2

export function sendPromo(to: string, body: string, now = new Date()): string | null {
  return send("email", to, formatMessage(body, { forPromo: true }), now)
}
EOF
cat > src/core/retry.ts <<'EOF'
import { PROMO_MAX_ATTEMPTS } from "../campaigns/promo"

export function withRetry<T>(fn: () => T): T {
  let lastError: unknown
  for (let attempt = 0; attempt < PROMO_MAX_ATTEMPTS; attempt++) {
    try {
      return fn()
    } catch (error) {
      lastError = error
    }
  }
  throw lastError
}
EOF
cat > tests/format.test.ts <<'EOF'
import { expect, test } from "bun:test"
import { boot } from "../src/boot"
import { formatMessage } from "../src/format"
import { withRetry } from "../src/core/retry"

test("messages carry the brand once booted", () => {
  boot({ brand: "Acme" })
  expect(formatMessage("hi")).toBe("[Acme] hi")
  expect(formatMessage("sale", { forPromo: true })).toBe("[Acme] sale Reply STOP to opt out.")
})
test("retry gives up after the attempt limit", () => {
  let calls = 0
  expect(() => withRetry(() => { calls++; throw new Error("down") })).toThrow("down")
  expect(calls).toBe(2)
})
EOF
commit "feat: branded messages, promos, and retry"

sed -i.bak 's/PROMO_MAX_ATTEMPTS = 2/PROMO_MAX_ATTEMPTS = 3/' src/campaigns/promo.ts && find . -name '*.bak' -delete
sed -i.bak 's/toBe(2)/toBe(3)/' tests/format.test.ts && find . -name '*.bak' -delete
commit "chore: promos retry three times"

sed -i.bak 's/body: string, now = new Date()): string | null {/body: string, now = new Date(), channel = "email"): string | null {/; s/send("email", to/send(channel, to/' src/campaigns/promo.ts && find . -name '*.bak' -delete
commit "feat: promos can go out by sms"

cat > src/models/digest.ts <<'EOF'
export type DigestItem = { title: string }

export function digestTitle(items: DigestItem[]): string {
  return `${items.length} updates`
}
EOF
cat > src/services/digest.ts <<'EOF'
import { type DigestItem, digestTitle } from "../models/digest"
import { formatMessage } from "../format"

export function buildDigest(items: DigestItem[]): string {
  return formatMessage(`${digestTitle(items)}: ${items.map((i) => i.title).join(", ")}`)
}
EOF
cat > src/controllers/digest.ts <<'EOF'
import { buildDigest } from "../services/digest"
import type { DigestItem } from "../models/digest"
import { notify } from "../services/notifier"

export function sendDigest(to: string, items: DigestItem[], now = new Date()): string | null {
  return notify("email", to, buildDigest(items), now)
}
EOF
cat > src/services/notifier.ts <<'EOF'
import { send } from "../send"

export function notify(channel: string, to: string, body: string, now?: Date): string | null {
  return send(channel, to, body, now)
}
EOF
cat > tests/digest.test.ts <<'EOF'
import { expect, test } from "bun:test"
import { boot } from "../src/boot"
import { sendDigest } from "../src/controllers/digest"

test("digest lists item titles", () => {
  boot({ brand: "Acme" })
  const day = new Date("2026-01-05T12:00:00Z")
  expect(sendDigest("a@x.io", [{ title: "A" }, { title: "B" }], day)).toBe("email:a@x.io:[Acme] 2 updates: A, B")
})
EOF
commit "feat: daily digest"

sed -i.bak 's/`${items.length} updates`/items.length === 1 ? "1 update" : `${items.length} updates`/' src/models/digest.ts
sed -i.bak 's/join(", ")/join("; ")/' src/services/digest.ts
sed -i.bak 's/A, B/A; B/' tests/digest.test.ts
sed -i.bak 's/sendDigest(to: string, items: DigestItem\[\], now = new Date())/sendDigest(to: string, items: DigestItem[], now = new Date(), channel = "email")/; s/notify("email"/notify(channel/' src/controllers/digest.ts
find . -name '*.bak' -delete
commit "fix: digest wording and channel choice"

sed -i.bak 's/export type DigestItem = { title: string }/export type DigestItem = { title: string; url?: string }/' src/models/digest.ts
sed -i.bak 's/items.map((i) => i.title)/items.map((i) => (i.url ? `${i.title} <${i.url}>` : i.title))/' src/services/digest.ts
sed -i.bak 's/import { notify } from "..\/services\/notifier"/import { notify } from "..\/services\/notifier"\n\nexport const DIGEST_MAX_ITEMS = 20/; s/buildDigest(items)/buildDigest(items.slice(0, DIGEST_MAX_ITEMS))/' src/controllers/digest.ts
find . -name '*.bak' -delete
commit "feat: digest links and item cap"

sed -i.bak 's/PROMO_MAX_ATTEMPTS = 3/PROMO_MAX_ATTEMPTS = 4/' src/campaigns/promo.ts && find . -name '*.bak' -delete
sed -i.bak 's/toBe(3)/toBe(4)/' tests/format.test.ts && find . -name '*.bak' -delete
commit "chore: promos retry four times"
echo "built $D"
