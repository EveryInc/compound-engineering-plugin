# Depth and session-history: why neither is a question

Both are decisions the agent is better positioned to make than the user. Depth depends on the context budget the agent can observe and the user cannot. Session-history value is unknowable a priori to *either* party — the payoff is an unrelated earlier session the current agent was never in — so a cheap probe resolves it instead of a prompt.

**Full is the right choice for essentially every documented learning.** Its token cost is small next to the engineering work that produced the learning, and it is dwarfed by the value of a doc that compounds. Lightweight buys back context at the cost of cross-referencing, overlap detection, and semantic grounding validation, so it is for real context pressure only. If Lightweight turns out to be the wrong call for the user's taste, re-running is a rare, cheap correction — cheaper than taxing every run with a prompt.

**The session-history probe is near-free on wall-clock** because it runs alongside the research subagents, and it escalates to the expensive extraction and synthesis only when genuinely relevant candidate sessions turn up (`references/session-history.md`). This support exists only inside the compounding workflow; there is no standalone session-history product surface.

## Auto-Invoke

<auto_invoke> <trigger_phrases> - "that worked" - "it's fixed" - "working now" - "problem solved" </trigger_phrases>

<manual_override> Invoke `ce-compound` with optional context to document immediately without waiting for auto-detection. </manual_override> </auto_invoke>
