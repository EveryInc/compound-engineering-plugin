# Establish the Frame Before Grounding

Load this when the frame isn't clear from the prompt — a bare link, a bare topic, or a warm invocation with no stated question (SKILL.md Phase 0). The job is to figure out what POV the user actually wants *before* spending the scout fan-out, by orienting on what they gave you and proposing — **never guessing**.

## Why this gate exists

The same subject supports very different verdicts. A link to a new sign-in method could mean "should we **adopt** it?", "should we **migrate** to it, and how costly?", "how does it **compare** to what we have?", or "I just have a **question** about it." Guessing "migrate" sends all three scouts after migration cost and answers a question the user never asked. The frame determines what the scouts even look for, so settle it first.

## Step 1 — Orient on what was provided (cheap, pre-grounding)

- **A bare link** → fetch it lightly (one fetch) to learn what the thing *is*; name it. If you cannot fetch it (no web tool, paywalled), ask the user what it is rather than assuming.
- **A bare topic or name** → recognize it from your own knowledge; a single search only if you genuinely can't place it.
- **A paste or provided context** → read it.

This is orientation, not grounding — keep it to one read/fetch. The project and external grounding (the scouts) come *after* the frame is set.

## Step 2 — Determine the POV intent

The subject is usually recoverable; the **intent** is the ambiguous part. Classify it:

- **Adopt** — use this new capability (net-new, or no incumbent)?
- **Migrate / replace** — switch *from an incumbent* to this?
- **Compare** — how does it stack up vs. what we have or the alternatives (no switch implied)?
- **Exposure** — is this (a CVE, deprecation, or ecosystem change) *our problem*?
- **Explainer** — they just want to understand it. This is **not** a verdict — handle it as a general research question (or a dedicated deep-research-style tool, *if the environment has one*), rather than forcing one.

## Step 3 — Infer, or propose; never guess

- **Subject AND intent clear** → state the frame in one line and proceed. Do not ask a question you can already answer: "Framing this as: should we replace `<incumbent>` with `<X>`? Say if you meant something else."
- **Intent ambiguous** → propose, built from Step 1's orientation. Use the blocking question tool with the **2-3 strongest concrete candidate framings this specific input suggests** (naming the incumbent where you know it), and rely on the tool's built-in free-text path for "something else" rather than adding it as an explicit option — some tools (e.g. Codex's `request_user_input`) cap explicit options at 2-3 and already provide the free-form fallback, so an extra explicit option can error or get trimmed. Do not offer a generic checklist; offer the real readings of *this* input. Example for a passkeys link on a password-auth project: *adopt passkeys* · *migrate auth to them (and at what cost)* · *compare them to our current sign-in*.
- **Reads as an explainer** → say so and answer it as a general research question (or hand to a dedicated research tool if one is available), rather than manufacturing a verdict.

## Discipline

`ce-pov` is not `ce-brainstorm`. **One** orientation read, **at most one** clarifying question, then go. If the user already stated the intent, skip straight to the one-line frame — do not interrogate. The cost of one cheap question is trivial; the cost of grounding the wrong frame is the whole run.

## Warm invocations

A warm invocation with no clear question is this same gate — the conversation is the material you orient on. Infer the decision from it, propose/confirm it, then proceed. For the rest of the warm contract (guest output, provenance buckets), see `references/invocation.md`.
