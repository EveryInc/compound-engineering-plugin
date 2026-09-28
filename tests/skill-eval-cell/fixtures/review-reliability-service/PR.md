# Add escalate endpoint to api-gateway

Adds POST /tickets/:id/escalate, which the support UI calls every time an agent escalates a ticket. It sets the `escalated` label through the support API. Runs in the shared api-gateway service.
