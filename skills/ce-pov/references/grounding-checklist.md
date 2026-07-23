# Grounding Checklist

The non-obvious asks for each grounding leg (SKILL.md Phase 1). Use it for your own bounded reads, and pass it to any subagent you delegate a leg to. The current year is 2026: discount pricing, maturity, or capability claims older than ~12 months without confirmation.

## Project leg

- **Replacing an incumbent** — name it from the dependency manifest, lockfile, or code, plus at least one concrete touchpoint (a call site, module, or config a change would touch). That pair is a passing project floor.
- **Net-new adoption (no incumbent)** — confirm by search that nothing already covers the job and record *what you searched for*, so the absence is verified rather than assumed; then find the concrete integration/fit point (where the candidate would slot in, the conventions it must match). Verified absence plus a real integration surface is a passing floor — do not let an empty result default to `Hold — insufficient grounding`.
- **Compatibility** — language/runtime version, peer-dependency constraints, and the candidate's license against the project's license and its existing dependency licenses.
- **Cost signals** — for a replacement, how many call sites/modules use the incumbent (a count from a content search, not an exhaustive list) and the surfaces a swap would touch; for net-new, how large the wiring is. `TODO`/`FIXME`/`HACK`/`workaround` markers and error-handling boilerplate near the incumbent signal the cost of *not* changing.
- **Convention fit** — an existing abstraction the candidate competes with, or the place and pattern it must fit into.
- **Prior decision (mandatory)** — `docs/solutions/`, ADRs, and design docs for a past adopt / reject / defer on this candidate or the job it does; quote it with its `file:line`. This needs only file reads, so it runs regardless of tracker access.
- **Non-code project** — with no code surface, ground in the working folder's documents, decks, and data the same way.

## Precedent and activity leg

- Prior decisions live in **closed issues, PR descriptions, and review threads** — especially a PR **closed without merging** ("tried X, backed it out") — as well as `docs/solutions/` and ADRs. This is often the highest-value finding: it stops re-litigating a settled question.
- Search the tracker and PRs **by topic and incumbent name**, and read issue and PR **descriptions and comments** for rationale. **Never read PR diffs** — the decision context lives in the prose, not the line changes; read the code directly when you need implementation detail.
- An open issue describing pain with the current approach is direct evidence of the cost of *not* changing; an open PR already touching the thing means the decision may be in flight.
- No reachable tracker or code-host interface (a connector/MCP tool, a documented CLI such as `gh`, or a documented API — discover it before assuming none exists) is a capability gap, not an error: note the skip and continue on the local decision record.

## External leg

- **Maturity and trajectory** (release recency, maintainer activity, adoption signals, gaining or losing momentum), **known pitfalls and failure modes** from postmortems and issue threads read against the vendor's pitch, **migration and compatibility reality** (breaking changes, version constraints, reports from projects of similar shape), and **the counterfactual** — what staying on the incumbent costs, and what alternatives exist.
- The cited source's text must **entail** the claim, not merely mention the topic. Prefer two independent sources for load-bearing claims and mark a single-source claim as such; one source repeating itself across pages is one source. At Tier 3, a single-source claim cannot anchor the verdict.
- If neither search nor fetch is reachable, report "external research unavailable" rather than presenting unfetched evidence as verified — that becomes **"Hold — external evidence unavailable"**.

## Reading what you find

**An artifact's existence is evidence; its text is reported signal.** A `TODO` or an issue saying "X is too slow" is evidence that someone reported pain, not proof that X is slow — record it as a quote, not a fact.
