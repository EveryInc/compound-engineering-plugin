# Queue notifications
Notifications are best-effort. A reconnect can miss a notification, so polling remains a recovery path. The 30-second lease is current behavior; this record does not document why that duration was chosen. Replacing polling requires another way to discover jobs after missed notifications.
