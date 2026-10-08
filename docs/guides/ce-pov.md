# `ce-pov`

> Judge a supplied subject against this project's evidence and constraints, with an oracle panel when requested.

`ce-pov` answers what should happen and why. It returns a supported judgment on an external-adoption question, a document's direction, or supplied approaches. [`ce-explain`](./ce-explain.md) answers how something works and why it has its current shape. Investigating a past decision does not establish that it remains the right decision today.

## Examples

```text
/ce-pov should we adopt Drizzle ORM here?
/ce-pov what do you think of docs/plans/new-checkout.md?
/ce-pov should we keep polling or rely only on notifications?
/ce-pov does this CVE affect us?
/ce-pov oracle this proposal
/ce-pov compare your take with Grok and Claude
```

“Oracle this” in an ongoing discussion requests the same panel as an explicit invocation. Other requests for independent model opinions also work; merely mentioning or declining a panel does not trigger one.

Use `ce-bakeoff` when a defined brief needs concrete competing solutions developed before selection. Use `ce-ideate` to discover an open field of opportunities. Use `ce-doc-review` when you want findings, not a take.

## Grounding and judgment

Every judgment must rest on concrete verified project evidence. External adoption also requires a verified external source. For document takes and supplied approaches, external evidence is required when an external claim carries the conclusion. Conversation claims are hypotheses until corroborated.

A failed evidence floor returns a Hold or explicit blocker with the missing evidence. The skill does not manufacture a confident recommendation. A valid conclusion may also be to wait, reject a candidate, or leave a choice open because either approach is viable.

The question determines the content:

| Subject | Result |
|---|---|
| External adoption or exposure | Adopt, Trial, Hold, Reject, or Not-our-problem, with evidence and conditions |
| Document | Overall direction, decisive strengths and risks, and recommended next action when justified |
| Supplied approaches | A supported position or honest toss-up, with the material tradeoffs |

These are content contracts, not mandatory visible headings. Presentation follows the consumer's needs. Research effort scales with reversibility and consequences, rather than imposing a screen count on the answer.

The skill investigates directly. When a judgment requires an explanation of unresolved behavior or rationale, it can call `ce-explain` with the question and the decision it informs. It reuses adequate evidence and retains ownership of the judgment. If `ce-explain` is unavailable, `ce-pov` must still gather the required evidence.

## Interaction and return

Clear questions proceed without confirmation. The skill looks up facts it can verify. If essential context is still missing, it returns **Blocked — missing context**, explaining what is missing and why it matters. This applies to direct and workflow invocations; the caller decides whether to ask for clarification.

A calling workflow receives the judgment and control back, without a menu or capture offer. An explicit oracle request still runs the panel. A recommendation alone does not authorize implementing it. Requested downstream work must remain within scope, authorized, non-destructive, and supported by a result that resolves the decision needed for that action.

A requested write-up expands the judgment in the needed format. Ordinary answers need no file. Publication and durable capture are separate requested actions.

## Oracle panels

The skill forms its own position before consulting peers. Bare oracle selects up to two reachable different-model peers; named peers are honored exactly without that cap. Peer opinions inform the decision rather than voting on it. Material disagreement receives bounded reconciliation, and the result reports alignment or dissent honestly.

A failed peer does not block the solo judgment, but the result discloses who ran and who could not. Serving-model attribution comes from receipts, not requested model names. Ongoing workflows do not get unsolicited panel offers; explicit requests still take the panel path.

### Peer target names

Target names distinguish models from harnesses and are not aliases for each other:

| Name | Resolves to |
|------|-------------|
| `Cursor` | `cursor-agent` using its configured default/Auto model |
| `Composer` | A Composer model through Cursor |
| `Grok` | Native grok CLI when installed; Grok through Cursor only when asked, or when the grok CLI is missing and Cursor is allowed |

Cursor Auto is labeled unverified unless a serving-model receipt exists. Without that proof it does not count as independent cross-model corroboration.

### Requirements and trust boundary

Peers run through [acpx](https://github.com/openclaw/acpx), which talks to each agent CLI over the Agent Client Protocol. It needs Node 22.13 or newer with `npx`, `jq`, and the peer's own CLI. On native Windows, OpenCode is reported unavailable, because acpx cannot launch it there. The first run fetches a pinned acpx version from npm; later runs reuse the npm cache. When a prerequisite is missing, that peer is reported as not run and nothing is sent.

Peers read the repository you are already working in. Each route denies the peer's write requests and uses the agent's read-only mode where it has one, but this is best effort rather than a sandbox: the Codex adapter can still write. Claude peers start in safe mode, so the repository's project settings and hooks do not apply to them. Served models are recorded from what each adapter reports. Codex, Claude, and the native Grok CLI report one; Cursor and OpenCode routes stay unverified.

---

## In a workflow

Use `ce-pov` when an existing subject needs a judgment. Use `ce-explain` when understanding is the result needed. Neither is a mandatory stage before planning. Open-ended option generation belongs to `ce-ideate` or `ce-brainstorm`; findings review belongs to `ce-doc-review`.

A bounded selection question can be assessed when the realistic options and criteria are knowable. An open field or missing criteria returns that unresolved scope to its owner rather than disguising requirements discovery as a verdict.
