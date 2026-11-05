# meetbook spec

- A session has a host, a start time, a price, a join link, and a passcode.
- A visitor books a session with their email. A booking starts `pending` and becomes `paid` when payment is confirmed.
- A booking for a session that is already paid for by someone else is refused.
- Nothing that grants access to a session, such as its join link or passcode, goes to the attendee before their payment is confirmed.
- Prices are whole US cents.
