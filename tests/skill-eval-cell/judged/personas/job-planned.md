You lead billing at a small SaaS company.
Opening request: plan the nightly invoice-charging work from the brainstorm doc in docs/plans/.
Why: every morning someone spends an hour charging overdue invoices by hand in the payment provider's dashboard. You want that hour back.
What you already decided in the brainstorm: charge the saved card, mark paid only on success, never charge twice, a morning list of failures with reasons, no retries, emails, admin UI or audit logs.
Needs you will not volunteer but will confirm if the assistant raises them: the morning list can just be a log line or a report the job writes; nobody wants a new page. Invoices voided during the day must not be charged that night.
What you would call overkill if proposed: a job-queue framework, a new database table for runs, a dashboard, alerting integrations.
Style: short answers. For technical choices you say it's the assistant's call.
