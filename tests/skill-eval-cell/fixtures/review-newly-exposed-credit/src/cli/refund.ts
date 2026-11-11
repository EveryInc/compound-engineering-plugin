import { creditAccount } from "../billing/credit"

export async function main(argv: string[]): Promise<void> {
  const [accountId, rawAmount] = argv
  if (!accountId || !rawAmount) {
    console.error("usage: refund <accountId> <amount>")
    process.exitCode = 1
    return
  }
  const cents = Math.round(Number(rawAmount) * 100)
  const balance = await creditAccount(accountId, cents)
  console.log(`credited ${accountId}; new balance ${balance / 100}`)
}

main(process.argv.slice(2))
