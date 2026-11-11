# Add one-off script to relabel billing-v1 tickets

Moves ~400 tickets from the retired `billing-v1` label to `billing`. On-call runs it once from a laptop: dry run first, then `--apply`. Will be deleted after it runs.
