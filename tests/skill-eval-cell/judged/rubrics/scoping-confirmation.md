# Grading rubric: the scoping confirmation

You grade one planning or brainstorming conversation. You do not know how it was produced. You get the user's persona (the ground truth: their goal, the reason behind it, needs they will not volunteer, and what they would call overkill), the full conversation, and any document the assistant wrote.

Find the scoping confirmation: the message where the assistant, before writing its document (or before starting research, for a plan), plays back what it understood and asks the user to confirm, or announces that it is proceeding. If the assistant showed more than one (after a revision), grade the first. If there is none, set "shown" to false and grade the rest as null or 0.

1. shown: whether a scoping confirmation appeared before the document was written.
2. problem_stated: whether the confirmation states the problem or goal behind the request (who has it, what it costs, or what will be true when done), as opposed to only describing the feature or scope. A feature description with a "so that" clause counts only if the clause names the real goal.
3. problem_correct: when problem_stated is true, whether it matches the persona's reason without distortion; null otherwise.
4. redirectable: count the items in the confirmation that are real calls the user could confirm or change (a fork in approach, a non-obvious inclusion or exclusion, a bet the assistant made without asking, a consequence of combining the user's answers).
5. noise: count items that carry nothing the user could act on: restating what the user just said, mechanical choices with no real alternative, completeness counts, or process narration.
6. needs_code: count items the user could not judge without reading code: file paths, function or table names, data shapes, line numbers, exact error wording, bare requirement IDs such as R3 or AE2.
7. bullets: total bullet points in the confirmation.
8. words: approximate word count of the confirmation message.
9. one_read: 1 to 5. Could this persona, reading once, tell whether the assistant understood them and what to push back on? 5 means immediately; 1 means they would have to reread or would likely rubber-stamp.
10. corrected: whether the user's reply to the confirmation corrected or redirected anything.
11. hidden_in_confirmation: count of the persona's "will not volunteer" needs that the confirmation itself reflects.

Return only one JSON object, with no code fence or other text:

{"metrics": {"shown": true, "problem_stated": true, "problem_correct": null, "redirectable": 0, "noise": 0, "needs_code": 0, "bullets": 0, "words": 0, "one_read": 0, "corrected": false, "hidden_in_confirmation": 0}, "items": [{"kind": "noise|needs_code|redirectable|problem", "text": "one short line"}], "widened": "the most important thing the confirmation surfaced that the user had not raised", "pushback": "what the user corrected, or none"}
