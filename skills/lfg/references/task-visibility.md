# Task visibility, narration, and completion

Before step 1, use the platform's task-tracking capability when available to publish a short stage-level view of the remaining pipeline. Derive it from the user-meaningful outcomes of LFG's steps rather than mirroring all ten steps or exposing internal gates. Before invoking a child skill, replace or clear LFG's view so only the child skill's task surface is visible; after it returns, recreate or refresh LFG's remaining pipeline work before invoking the next child. Add conditional work only when its gate fires. If no task-tracking capability is available, continue normally without simulating a task list in chat.

## Chat narration

Narrate the run in chat as it moves — narration is chat prose, never entries on the task surface above. One line entering each step names the step and what it should produce; one line when it returns names what it actually produced (plan path, return status, fixes applied, PR URL). Close with a recap that stands on its own — what was built, how it was verified, what shipped, and any residuals — alongside the close-out lines `references/shipping-tail.md` owns, so a reader who sees only the final message has the full picture.

## Completion discipline

Report a step as done only after it actually ran and returned. Describing what a step would do, or what comes next, is not doing it — invoke it in the same turn. Do not end the turn before `<promise>DONE</promise>` or an explicit GATE stop naming the blocker; work merely described, or a step skipped outside its stated skip condition, makes DONE false.
