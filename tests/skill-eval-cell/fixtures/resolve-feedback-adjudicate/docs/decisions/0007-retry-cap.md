# 0007: Cap retries at 3

The partner API's rate limiter bans a client for an hour after the fourth retry in a minute. We cap at 3 and accept occasional failed requests over a ban. Revisit if the partner changes the policy.
