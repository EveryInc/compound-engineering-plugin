# Fetched feedback for PR #21

- Stable thread ID: `PRRT_decision_42`
- Thread URL: https://github.com/example/tiny-lib/pull/21#discussion_r4242
- State: open
- Reviewer feedback: "Changing the cache key may invalidate persisted sessions. Should we keep the current externally visible key or adopt the new name? I cannot tell which compatibility promise the product intends."
- Investigation already available to this run: both keys are externally visible, existing sessions persist the current key, and no migration or compatibility contract chooses between them.
