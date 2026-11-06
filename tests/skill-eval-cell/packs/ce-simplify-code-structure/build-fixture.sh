#!/usr/bin/env bash
# Builds the ce-simplify-code structural-pass fixture: a small notification
# service whose history shows three channel files changing together.
# Usage: build-fixture.sh <dest-dir> [--with-diff]
set -euo pipefail
D="$1"; DIFF="${2:-}"
[ -e "$D" ] && { echo "$D exists; pass a new directory" >&2; exit 2; }
mkdir -p "$D/src/channels" "$D/tests"
cd "$D"
git init -q -b main
git config user.email eval@example.com
git config user.name eval
commit() { git add -A && git commit -qm "$1"; }

cat > AGENTS.md <<'EOF'
# acme-notify

Sends user notifications over several channels. Bun + TypeScript; run tests with `bun test`.
EOF
cat > package.json <<'EOF'
{ "name": "acme-notify", "private": true, "type": "module", "scripts": { "test": "bun test" } }
EOF
cat > src/channels/email.ts <<'EOF'
export function sendEmail(to: string, body: string, now: Date): string | null {
  const hour = now.getUTCHours()
  if (hour >= 23 || hour < 7) return null
  return `email:${to}:${body}`
}
EOF
cat > src/channels/sms.ts <<'EOF'
export function sendSms(to: string, body: string, now: Date): string | null {
  const hour = now.getUTCHours()
  if (hour >= 23 || hour < 7) return null
  return `sms:${to}:${body.slice(0, 160)}`
}
EOF
cat > src/send.ts <<'EOF'
import { sendEmail } from "./channels/email"
import { sendSms } from "./channels/sms"

export function send(channel: string, to: string, body: string, now = new Date()): string | null {
  switch (channel) {
    case "email":
      return sendEmail(to, body, now)
    case "sms":
      return sendSms(to, body, now)
    default:
      throw new Error(`unknown channel: ${channel}`)
  }
}
EOF
cat > src/settings.ts <<'EOF'
export const CHANNEL_OPTIONS = ["email", "sms"]

export function channelLabel(channel: string): string {
  if (channel === "sms") return "Text message"
  return channel[0].toUpperCase() + channel.slice(1)
}
EOF
cat > tests/send.test.ts <<'EOF'
import { expect, test } from "bun:test"
import { send } from "../src/send"

const day = new Date("2026-01-05T12:00:00Z")
const night = new Date("2026-01-05T23:30:00Z")

test("email sends during the day", () => {
  expect(send("email", "a@x.io", "hi", day)).toBe("email:a@x.io:hi")
})
test("sms truncates to 160 characters", () => {
  expect(send("sms", "+1", "x".repeat(200), day)).toBe(`sms:+1:${"x".repeat(160)}`)
})
test("quiet hours suppress every channel", () => {
  expect(send("email", "a@x.io", "hi", night)).toBeNull()
  expect(send("sms", "+1", "hi", night)).toBeNull()
})
test("unknown channel throws", () => {
  expect(() => send("fax", "1", "hi", day)).toThrow("unknown channel")
})
EOF
cat > tests/settings.test.ts <<'EOF'
import { expect, test } from "bun:test"
import { CHANNEL_OPTIONS, channelLabel } from "../src/settings"

test("settings offer email and sms", () => {
  expect(CHANNEL_OPTIONS).toEqual(["email", "sms"])
})
test("labels", () => {
  expect(channelLabel("sms")).toBe("Text message")
  expect(channelLabel("email")).toBe("Email")
})
EOF
commit "feat: email and sms notifications"

sed -i.bak 's/hour >= 23/hour >= 22/' src/channels/email.ts src/channels/sms.ts && find . -name '*.bak' -delete
sed -i.bak 's/23:30/22:30/' tests/send.test.ts && find . -name '*.bak' -delete
commit "fix: quiet hours start at 22:00"

cat > src/channels/push.ts <<'EOF'
export function sendPush(to: string, body: string, now: Date): string | null {
  const hour = now.getUTCHours()
  if (hour >= 22 || hour < 7) return null
  return `push:${to}:${body.slice(0, 100)}`
}
EOF
cat > src/send.ts <<'EOF'
import { sendEmail } from "./channels/email"
import { sendPush } from "./channels/push"
import { sendSms } from "./channels/sms"

export function send(channel: string, to: string, body: string, now = new Date()): string | null {
  switch (channel) {
    case "email":
      return sendEmail(to, body, now)
    case "sms":
      return sendSms(to, body, now)
    case "push":
      return sendPush(to, body, now)
    default:
      throw new Error(`unknown channel: ${channel}`)
  }
}
EOF
cat >> tests/send.test.ts <<'EOF'
test("push truncates to 100 characters", () => {
  expect(send("push", "dev1", "y".repeat(150), day)).toBe(`push:dev1:${"y".repeat(100)}`)
})
EOF
commit "feat: push notifications"

sed -i.bak 's/hour < 7/hour < 8/' src/channels/email.ts src/channels/sms.ts src/channels/push.ts && find . -name '*.bak' -delete
cat >> tests/send.test.ts <<'EOF'
test("quiet hours last until 08:00", () => {
  const early = new Date("2026-01-05T07:30:00Z")
  expect(send("email", "a@x.io", "hi", early)).toBeNull()
  expect(send("push", "dev1", "hi", early)).toBeNull()
})
EOF
commit "fix: quiet hours end at 08:00"

if [ "$DIFF" = "--with-diff" ]; then
  cat >> src/settings.ts <<'EOF'

// return the default channel
export function defaultChannel(): string {
  // email is first in the list
  return CHANNEL_OPTIONS[0]
}
EOF
fi
echo "built $D"
