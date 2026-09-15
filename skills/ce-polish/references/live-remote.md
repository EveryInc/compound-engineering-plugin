# Remote live sessions

Load this from `references/live-start.md` before starting the endpoint when the riffer's browser is not on the machine running this agent and the dev server (a laptop against a desktop or Mac mini, a device on the LAN, a tailnet peer). The page then reaches two origins on this machine: the app and the endpoint. Both must be reachable from the browser, and when the page is not on localhost both must be HTTPS.

## The HTTPS rule

Browsers grant microphone and screen capture only to secure contexts: `localhost` or HTTPS. A page loaded over plain HTTP from another host gets no microphone, so the interviewer never speaks and the riffer has drawing and the board only. And an HTTPS page may not call a plain-HTTP endpoint at all (mixed content), so the stream would never start. Therefore:

- **Page on localhost:** nothing here applies; the default start is right.
- **Page over plain HTTP on another host** (a bare LAN or tailnet IP): a session can run, but say when handing over the URL that microphone and screen capture will be refused until the URL is HTTPS, so voice is unavailable. Do not present that as a full live session.
- **Page over HTTPS:** the endpoint origin must be HTTPS too. Refuse to hand over an HTTPS page URL paired with a plain-HTTP endpoint origin, and name the endpoint origin as the one that must become HTTPS. The endpoint's mint also refuses (`tls_required`) when a non-loopback request arrives without `X-Forwarded-Proto: https`; when the riffer reports that error, the tunnel in front of the endpoint is not terminating TLS.

The helper has no TLS option of its own in this version; HTTPS comes from a tunnel or a TLS-terminating proxy in front of each origin. Two origins means two tunnels, and on providers that allow one tunnel per account that means two accounts or a paid plan; say so before the riffer sets one up.

## Binding

Direct LAN or tailnet access (plain HTTP) needs both processes bound beyond loopback. Pass `--host 0.0.0.0` (or the specific interface address) to the endpoint's `start`, and bind the dev server with its recipe's flag: Vite `--host`, Next `-H 0.0.0.0`, Remix `--host 0.0.0.0`, Rails `-b 0.0.0.0` (in `bin/dev` or the Procfile `web:` line). Rewrite only the host in the URLs you hand over; ports stay as resolved.

Through tunnels, both processes stay on loopback; the tunnel connects locally and publishes an HTTPS origin. Do not add `--host` in that case.

`--app-origin` is always the origin the browser loads the page from: the LAN address with its port, or the tunnel's HTTPS origin. Never `localhost` in a remote session, or the endpoint rejects every request from the page. The `endpoint` value in the handoff fragment is likewise the browser-facing endpoint origin.

## Tunnel recipes

One tunnel per origin, each pointing at the local port:

- **Tailscale serve** (HTTPS on the tailnet, one command per origin, distinct HTTPS ports): `tailscale serve --bg --https=443 http://127.0.0.1:<app-port>` and `tailscale serve --bg --https=8443 http://127.0.0.1:<endpoint-port>`. The origins are `https://<machine>.<tailnet>.ts.net` and `https://<machine>.<tailnet>.ts.net:8443`.
- **cloudflared** (quick tunnels, no account): `cloudflared tunnel --url http://localhost:<app-port>` and again for the endpoint port; each prints its own `https://<random>.trycloudflare.com` origin.
- **ngrok**: `ngrok http <app-port>` and `ngrok http <endpoint-port>`; free accounts allow one agent session, so the second needs a paid plan or a second account.

Read each tunnel's printed origin rather than predicting it; the app tunnel origin is `--app-origin` and the page URL, and the endpoint tunnel origin goes in the fragment.

## Disclosure

Before handing over a remote URL, tell the riffer, in one line, that the app and the endpoint are reachable on that network for the length of the session, name both origins, and, for a plain-HTTP session, that voice is off until HTTPS. The endpoint serves no files from its run directory, and every route requires a credential; the dev server has whatever exposure the framework's dev mode has, which is why this is disclosed rather than assumed.
