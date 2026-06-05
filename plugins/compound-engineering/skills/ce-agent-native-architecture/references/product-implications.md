<overview>
Agent-native architecture has consequences for how products feel, not just how they're built. This document covers progressive disclosure of complexity, discovering latent demand through agent usage, and designing approval flows that match stakes and reversibility.
</overview>

<progressive_disclosure>
## Progressive Disclosure of Complexity

Agent-native apps are simple to start but endlessly powerful. This emerges naturally from the architecture — when features are prompts and tools are composable, users can start simple and gradually discover complexity without you having to build each level explicitly. The agent meets users where they are.

**Design implications:**
- Don't force configuration upfront
- Don't hide capabilities — make them discoverable through use
- Don't cap complexity — if the agent can do it, let users ask for it
- Do provide hints to help users discover what's possible
</progressive_disclosure>

<latent_demand_discovery>
## Latent Demand Discovery

Traditional development: imagine features, build, hope you guessed right. Agent-native: build a capable foundation, observe what users ask for, formalize the patterns that emerge.

### The Flywheel

```
Build with atomic tools and parity
           ↓
Users ask for things you didn't anticipate
           ↓
Agent composes tools to accomplish them
(or fails, revealing a capability gap)
           ↓
You observe patterns in what's being requested
           ↓
Add domain tools or prompts to optimize common patterns
           ↓
(Repeat)
```

**When users ask and agent succeeds:** Real need, architecture supports it — consider optimizing with a domain tool if common.
**When users ask and agent fails:** Real need, capability gap — fix it: add tool, fix parity, improve context.
**When users don't ask:** Maybe they don't need it, or they don't know it's possible (capability hiding).

Log agent requests and track success/failure. Review patterns regularly. Formalize common patterns into tools or prompt sections.
</latent_demand_discovery>

<approval_and_agency>
## Approval and User Agency

> **Note:** This framework applies to unsolicited agent actions. If the user explicitly asks the agent to do something, that's already approval — the agent just does it.

### The Stakes/Reversibility Matrix

| Stakes | Reversibility | Pattern | Example |
|--------|---------------|---------|---------|
| Low | Easy | **Auto-apply** | Organizing files |
| Low | Hard | **Quick confirm** | Publishing to a private feed |
| High | Easy | **Suggest + apply** | Code changes with undo |
| High | Hard | **Explicit approval** | Sending emails, payments |

**Auto-apply:** Agent acts, then reports what it did and how to undo.
**Quick confirm:** One-tap approval — stakes are low, but hard to reverse.
**Suggest + apply:** Show diff/preview, make reversal clear (e.g., "changes can be reverted with git").
**Explicit approval:** Show full output, state consequences, require deliberate confirmation.

### Self-Modification Considerations

When agents modify their own behavior, the goals are: **Visibility** (user can see what changed), **Understanding** (user grasps the effects), **Rollback** (user can undo). Approval flows achieve this; audit logs with easy rollback are another approach. **The principle: make it legible.**
</approval_and_agency>

<capability_visibility>
## Capability Visibility

Users need to discover what the agent can do. Hidden capabilities lead to underutilization.

- Provide onboarding hints listing key capabilities
- Offer contextual suggestions when relevant (e.g., after user mentions a book, suggest research, comparison, or feed publishing)
- Use progressive revelation — after basic features, hint at advanced ones
- Don't overwhelm upfront; reveal naturally through use; don't assume users will discover on their own
</capability_visibility>

<designing_for_trust>
## Designing for Trust

Build trust through:
- **Transparency:** Show tool calls and progress; explain reasoning when it matters; make all agent work inspectable via files/logs
- **Predictability:** Consistent behavior; clear patterns for when approval is needed; no surprises about what the agent can access
- **Reversibility:** Easy undo; checkpoints before significant changes; clear rollback paths
- **Control:** User can stop the agent; user can adjust behavior (prompts, preferences); user can restrict capabilities
</designing_for_trust>

<checklist>
## Product Design Checklist

### Progressive Disclosure
- [ ] Basic requests work immediately (no config)
- [ ] Depth is discoverable through use
- [ ] No artificial ceiling on complexity
- [ ] Capability hints provided

### Latent Demand Discovery
- [ ] Agent requests are logged
- [ ] Success/failure is tracked
- [ ] Patterns are reviewed regularly
- [ ] Common patterns formalized into tools/prompts

### Approval & Agency
- [ ] Stakes assessed for each action type
- [ ] Reversibility assessed for each action type
- [ ] Approval pattern matches stakes/reversibility
- [ ] Self-modification is legible (visible, understandable, reversible)

### Capability Visibility
- [ ] Onboarding reveals key capabilities
- [ ] Contextual suggestions provided
- [ ] Users aren't expected to guess what's possible

### Trust
- [ ] Agent actions are transparent
- [ ] Behavior is predictable
- [ ] Actions are reversible
- [ ] User has control
</checklist>
