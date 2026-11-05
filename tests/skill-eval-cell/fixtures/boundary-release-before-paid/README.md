# Event registration

Guests register for paid online events. Registering reserves a seat and emails a confirmation with a payment link; the payment provider's webhook marks the registration paid and emails a receipt. Event details, including the Zoom meeting for each event, live in `src/events.js`.

Tests run with `npm test` (`node --test`).
