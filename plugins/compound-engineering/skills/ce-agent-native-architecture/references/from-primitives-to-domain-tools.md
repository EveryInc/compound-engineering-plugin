<overview>
Start with pure primitives: bash, file operations, basic storage. This proves the architecture works and reveals what the agent actually needs. As patterns emerge, add domain-specific tools deliberately. This document covers when and how to evolve from primitives to domain tools, and when to graduate to optimized code.
</overview>

<start_with_primitives>
## Start with Pure Primitives

Begin every agent-native system with the most atomic tools possible:
- `read_file` / `write_file` / `list_files`
- `bash` (for everything else)
- Basic storage (`store_item` / `get_item`)
- HTTP requests (`fetch_url`)

**Why:** Proves the architecture, reveals actual needs, maximizes flexibility, forces good prompts. If it works with primitives, your prompts are doing their job.
</start_with_primitives>

<when_to_add_domain_tools>
## When to Add Domain Tools

Add domain tools deliberately, for one of three reasons:

**1. Vocabulary Anchoring:** When the agent needs to understand domain concepts. A `create_note` tool teaches the agent what "note" means in your system — its schema, location, and format — better than prompting "write a file to the notes directory with this format."

**2. Guardrails:** When operations need validation or constraints that shouldn't be left to agent judgment (e.g., `publish_to_feed` enforces headline length limits and content policies).

**3. Efficiency:** When common operations would take many primitive calls. A `get_book_with_content` domain tool replaces reading library.json, finding the book, reading full_text.txt, and reading introduction.md as four separate calls.
</when_to_add_domain_tools>

<the_rule>
## The Rule for Domain Tools

**Domain tools should represent one conceptual action from the user's perspective.**

They can include mechanical validation, but **judgment about what to do or whether to do it belongs in the prompt**.

**The test:** Ask "Who is making the decision here?"
- If the answer is "the tool code" → you've encoded judgment, refactor
- If the answer is "the agent based on the prompt" → correct

**Wrong:** `analyze_and_publish` — tool decides whether quality is high enough to publish  
**Right:** Separate `analyze_content` and `publish` tools — agent decides what "high quality" means
</the_rule>

<keep_primitives_available>
## Keep Primitives Available

Domain tools are shortcuts, not gates. Unless there's a specific reason to restrict access (security, data integrity, audit), the agent should still be able to use underlying primitives for edge cases.

**Gate only for:** security requirements, data integrity invariants, audit/compliance requirements. The default is open access.
</keep_primitives_available>

<graduating_to_code>
## Graduating to Code

The progression:
```text
Stage 1: Agent uses primitives in a loop        (flexible, proves concept, slow/expensive)
Stage 2: Add domain tools for common operations (faster, still agent-orchestrated)
Stage 3: Hot paths implemented in optimized code (fast, deterministic, agent triggers it)
```

Even when an operation graduates to code, the agent should still be able to trigger it and fall back to primitives for edge cases. **Parity still holds** — the agent doesn't lose capability when you optimize.
</graduating_to_code>

<decision_framework>
## Decision Framework

### Should I Add a Domain Tool?

| Question | If Yes |
|----------|--------|
| Is the agent confused about what this concept means? | Add for vocabulary anchoring |
| Does this operation need validation the agent shouldn't decide? | Add with guardrails |
| Is this a common multi-step operation? | Add for efficiency |
| Would changing behavior require code changes? | Keep as prompt instead |

### Should I Graduate to Code?

| Question | If Yes |
|----------|--------|
| Is this operation called very frequently? | Consider graduating |
| Does latency matter significantly? | Consider graduating |
| Are token costs problematic? | Consider graduating |
| Do you need deterministic behavior? | Graduate to code |

### Should I Gate Access?

| Question | If Yes |
|----------|--------|
| Is there a security requirement? | Gate appropriately |
| Must this operation maintain data integrity? | Gate appropriately |
| Is there an audit/compliance requirement? | Gate appropriately |
| Is it just "safer" with no specific risk? | Keep primitives available |
</decision_framework>

<checklist>
## Checklist: Primitives to Domain Tools

### Starting Out
- [ ] Begin with pure primitives (read, write, list, bash)
- [ ] Write behavior in prompts, not tool logic
- [ ] Let patterns emerge from actual usage

### Adding Domain Tools
- [ ] Clear reason: vocabulary anchoring, guardrails, or efficiency
- [ ] Tool represents one conceptual action
- [ ] Judgment stays in prompts, not tool code
- [ ] Primitives remain available alongside domain tools

### Graduating to Code
- [ ] Hot path identified (frequent, latency-sensitive, or expensive)
- [ ] Optimized version doesn't remove agent capability
- [ ] Fallback to primitives for edge cases still works

### Gating Decisions
- [ ] Specific reason for each gate (security, integrity, audit)
- [ ] Default is open access
- [ ] Gates are conscious decisions, not defaults
</checklist>
