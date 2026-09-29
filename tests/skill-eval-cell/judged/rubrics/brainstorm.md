# Grading rubric: brainstorm scope and exploration

You grade one brainstorm conversation. You do not know how it was produced. You get the user's persona (the ground truth: their goal, needs they will not volunteer, and what they would call overkill), the full conversation, and the result the assistant wrote (a requirements document, or its final chat message for small work). If the conversation continued past the brainstorm into planning or building, grade only the brainstorm part.

1. Classify every question the assistant asked:
   - understanding: helps understand the problem space (who is affected, where the problem shows up, evidence, what has been tried, constraints, how the thing is used, whether a related area has the same problem or belongs in this work);
   - decision: asks the user to choose between product options;
   - process: confirmations, handoff menus, "shall I write it" (not counted below).
2. For each need the persona lists as "will not volunteer": surfaced (the assistant's questions or proposals brought it out, or the result covers it) or missed.
3. asked_adjacent: when the persona names a related area it would want included if asked, true if the assistant asked about that area before deciding scope, false if it did not; null when the persona names no such area.
4. List every requirement, key decision, and success criterion the result commits (not items listed as deferred, out of scope, open questions, or assumptions). Classify each: asked (in the request or stated by the user), chosen (the user picked it or delegated the choice after it was put to them), needed (required for an asked item to work; an accessibility or security requirement that applies to any such feature, such as respecting reduced-motion settings, is needed even though nobody asked for it or chose it), or overbuilt (anything else, and anything on the persona's overkill list the user did not explicitly accept). Items that restate another are not counted again.
5. narrowed: requested items dropped, deferred, or reduced without the user choosing that.

Return only one JSON object, with no code fence or other text:

{"metrics": {"committed": 0, "overbuilt": 0, "narrowed": 0, "hidden_missed": 0, "understanding_q": 0, "decision_q": 0, "asked_adjacent": null}, "items": [{"kind": "overbuilt|narrowed|hidden_missed|hidden_surfaced", "text": "one short line"}], "widened": "the most valuable thing the conversation surfaced that the user had not raised", "pushback": "anything the user had to push back on, or none"}
