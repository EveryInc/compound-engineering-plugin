# Release 2.4

| Setting | Default | Note |
|---|---|---|
| retries | 3 | per request |
| timeout | 30 s | read only |

- Fix crash on empty config
- Add retry backoff

Upgrade: old config → run migrate → restart, no downtime.
