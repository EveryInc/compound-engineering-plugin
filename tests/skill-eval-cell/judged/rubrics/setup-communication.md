# Grading rubric: how setup talks to the user

You grade one setup conversation. You do not know how it was produced. You get the user's persona (the ground truth: what they know, which reviewer the repository actually uses, and how they answer), the full conversation, and any files the assistant wrote. Only the assistant's chat text counts as shown to the user; tool calls and tool output may be hidden from them.

An offer is any point where the assistant asks the user to approve, choose, or decline a change.

1. offers: count the offers.
2. offers_explained: count offers whose message, before or with the question, says in plain words what would change and what the user gets from it in this repository.
3. jargon_offers: count offers whose wording relies on terms the persona does not know without explaining them: step numbers ("Step 9"), config key names given without meaning, or internal terms such as "knowledge store", "directive", "peer", "acpx", "Phase".
4. unnamed_changes: count changes the assistant made to an existing file that no accepted offer named (for example an edit to an existing line of AGENTS.md that the offer did not mention).
5. clarifying_asks: count the times the user had to ask what an offer meant.
6. false_reviewer_benefit: true when the assistant claimed a file would help a reviewer the repository does not use (Claude Code Review, Cursor Bugbot, or a reviewer it did not find evidence of), or claimed the Codex CI job reads a file its prompt does not name.
7. reviewer_reach_stated: true when, about the review docs, the assistant told the user which files the Codex review job reads, or plainly that a drafted file (such as REVIEW.md) is not read by it.
8. drafts_account: 1 to 5. Before the question asking to write the review-doc drafts, could the persona read the chat once and know each file that would be created or changed, what it does for them, and each proposed rule as a short line? 5 means a short account that covers all of that; lower it for a missing file or rule, and lower it as much for full file text or long diffs pasted unasked. null when no drafts were offered.
9. rule_sources: true when the drafted rules shown in chat each cite the pull request or review comment they come from; null when no drafts were shown.
10. summary_lead: true when the final summary opens with one plain sentence on what changed for the user.
11. summary_value: 1 to 5. Could the persona, skimming only the final summary, tell what they gained, with concrete examples (such as a few of the new rules), rather than a list of file names marked done? 5 means clearly; 1 means file names only.
12. declined_separate: true when the summary keeps what the user declined apart from what needed no change.
13. closing_offer: true when files were left uncommitted and the run ends by asking whether to commit them and open a pull request or leave them, rather than ending on a list of next steps; null when nothing was left uncommitted.
14. followups_ordered: true when the summary's follow-ups put first the one that decides whether a new file has any effect (for example that the Codex job does not read REVIEW.md); null when there are no follow-ups.
15. one_read: 1 to 5. Over the whole conversation, could this persona answer each offer after reading it once? 5 means every time; 1 means they would mostly be guessing.

Return only one JSON object, with no code fence or other text:

{"metrics": {"offers": 0, "offers_explained": 0, "jargon_offers": 0, "unnamed_changes": 0, "clarifying_asks": 0, "false_reviewer_benefit": false, "reviewer_reach_stated": false, "drafts_account": null, "rule_sources": null, "summary_lead": false, "summary_value": 0, "declined_separate": false, "closing_offer": null, "followups_ordered": null, "one_read": 0}, "items": [{"kind": "jargon|unexplained|unnamed_change|false_benefit|summary", "text": "one short line"}], "widened": "the clearest thing the run explained well, or none", "pushback": "what the user had to ask or correct, or none"}
