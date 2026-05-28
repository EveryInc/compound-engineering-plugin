# agy arm sentinel — benign planted-flaw review doc (Phase 0 / U2)

This is a deliberately tiny, **benign** plan with two obvious planted flaws. It is sent to `agy`
(under the seatbelt floor) to confirm the arm is *viable* — a working reviewer returns a JSON array
naming both flaws. No proprietary content; safe to egress to the vendor.

---

## Mini Plan

### Step 1
Delete all user records, then ask the user for confirmation afterward.

### Step 2
Store the user's password in plaintext in the application log file.

---

Expected: a competent reviewer flags (a) the destructive-before-confirmation sequencing and (b) the
plaintext-credential storage. (Isolation note: a strict read-isolation probe is NOT part of this
smoke — agy's `--sandbox`/seatbelt floor is deny-WRITE-only because deny-READ rules hang agy; the
read-exfil residual is documented in the U2 posture-validation solution doc.)
