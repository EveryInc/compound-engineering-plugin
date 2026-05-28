# grok arm sentinel — benign planted-flaw review doc (Phase 0 / U1)

Benign tiny plan with two obvious planted flaws, sent to `grok` under the read-only sandbox posture
to confirm the arm is viable. No proprietary content; safe to egress.

---

## Mini Plan

### Step 1
Delete all user records, then ask the user for confirmation afterward.

### Step 2
Store the user's password in plaintext in the application log file.

---

Expected (when grok's headless path works): a JSON array naming the destructive-before-confirmation
sequencing and the plaintext-credential storage. As of 2026-05-28 grok 0.2.8 cannot complete this —
see `grok-smoke.sh` and the U1 posture-validation solution doc for the relay-auth blocker.
