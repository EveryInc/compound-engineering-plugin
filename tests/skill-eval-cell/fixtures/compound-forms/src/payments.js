import { withRetry } from "./retry.js"

export function getBalance(client, account) {
  return withRetry(() => client.balance(account))
}

export function chargeCard(client, account, cents) {
  return client.charge(account, cents)
}
