Quick update on the checkout latency investigation — here's where things stand.

It's important to note that we have likely found the main cause. The payment-service pool appears to be exhausted under load — at peak we saw 48 of 50 connections in use, and request queueing seems to account for most of the extra 900 ms at p99. That said, we haven't ruled out the retry storm in the inventory client — it could potentially be contributing as well.

The fix we're testing raises the pool size to 120 and adds a 2-second acquire timeout. In staging, this significantly reduced p99 latency — from about 1.4 s to roughly 600 ms in a 20-minute load test. It should hold up in production, but we haven't confirmed that yet, and staging traffic is not a perfect match for real traffic.

Next steps: roll the change to 10 percent of production traffic on Thursday, watch p99 and the database CPU for 24 hours, and then decide whether to go to 100 percent. If database CPU goes above 70 percent, we'll roll back. We may also need to revisit the inventory retries — but that's a separate ticket.

Bottom line: we're cautiously optimistic — but not done.
