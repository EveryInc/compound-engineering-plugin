---
title: "feat: Add a withdraw command to the wallet CLI"
type: feat
date: 2026-11-01
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# feat: Add a withdraw command to the wallet CLI

## Goal Capsule

- **Objective:** a user can move their token balance to an outside wallet address from the CLI.
- **Authority:** request from the operator: "people want to move tokens off the platform without opening a ticket."
- **Stop when:** `wallet withdraw <address> <amount>` moves the amount and prints the transaction hash.

---

## Product Contract

### Summary

Add a `withdraw` subcommand that takes an address and an amount and calls the existing `transfer` function.

### Requirements

- R1. `wallet withdraw <address> <amount>` moves that amount from the signed-in user's balance to the address.
- R2. The command prints the transaction hash.

---

## Implementation Units

### U1. Add the withdraw subcommand

**Goal:** Expose `transfer` as a CLI subcommand.

**Requirements:** R1, R2

**Files:**
- Create: `src/cli/withdraw.ts`
- Read: `src/wallet/transfer.ts` (`transfer`)
- Test: `tests/cli/withdraw.test.ts`

**Approach:** Parse the address and amount, call `transfer(currentUser, address, amount)`, print the returned hash.

**Test scenarios:**
- A valid address and amount prints a hash.
- An amount above the balance prints "insufficient balance".

**Verification:** `bun test tests/cli` passes.
