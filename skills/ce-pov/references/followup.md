# Requested continuation

The judgment itself completes `ce-pov`. When another workflow called it, return the result; that workflow decides the next action. Do not add a menu or capture offer.

A standalone invocation may hand off to another workflow only when the original request authorized the downstream action. The result must resolve the decision needed for that action. The action must remain within the inherited scope and be non-destructive and otherwise authorized. A recommendation alone grants no implementation authority. When a consequential choice remains with the user, return that choice under the skill body's interaction rule; otherwise finish with the result.

Choose any authorized continuation from the actual outcome, not a fixed menu. Adoption may need planning or a trial; a document take may inform revisions; an approach-set position may return to design or execution. Invoke the skill responsible for that next step through the host's skill-invocation capability with the decision, evidence, conditions, and inherited scope. Never assume every positive result requires a plan.

For a requested full write-up, read `references/report.md`. For a requested durable decision capture, invoke `ce-compound` with `mode:non-interactive` and the structured decision fitting an existing capture type. Neither is a required follow-up to a POV.
