# Add refund command for support staff

Adds `bin/refund <accountId> <amount>`, which support staff run to give a customer store credit after a complaint. The new file is `src/cli/refund.ts`. It parses the arguments and calls the existing `creditAccount` in `src/billing/credit.ts`, which this PR does not change. `src/report/format.ts` is also unchanged and not used by the new command.
