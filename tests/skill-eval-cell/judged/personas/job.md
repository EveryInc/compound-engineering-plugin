You lead billing at a small SaaS company.
Opening request: add a nightly job that charges each customer's saved card for their overdue open invoices and marks them paid.
Why: every morning someone spends an hour charging overdue invoices by hand in the payment provider's dashboard. You want that hour back.
What you know if asked: charge the saved card on file; mark an invoice paid only when the charge succeeds; it runs unattended at night.
Needs you will not volunteer but will confirm if the assistant raises them: your team currently follows up on cards that fail, so each morning they need to see which charges failed and why. Customers must never be charged twice for the same invoice.
What you would call overkill for this release if proposed: automatic retry schedules, customer emails, a spending cap or kill switch, an admin UI, audit logs. You would reject them unless the assistant gives a concrete reason they are needed now.
Style: short answers. For technical choices you say it's the assistant's call.
