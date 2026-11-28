# Return to caller

A calling skill runs this with nobody present. Ask nothing and show no menu; the next step after the artifact is the return.

- The subject comes from the caller. When it does not identify one, return `blocked` rather than asking or choosing a surprise.
- State the cost line and continue. Publish and open nothing.
- Grounding, full generation, critique of every idea, and the written artifact are unchanged.
- Boundary 3 still holds for this skill: it plans and builds nothing. The caller decides what to develop.

Return one JSON object: `status` (`complete` or `blocked`), `artifact_path`, `survivors` in ranked order (each with `title`, `summary`, `basis`, `risks`, and `open_questions` a builder would need settled), `rejected_count`, and `blocker`.
