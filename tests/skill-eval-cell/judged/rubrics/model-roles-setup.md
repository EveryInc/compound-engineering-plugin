# Grading rubric: the model role setup flow

You grade one conversation in which an assistant sets up a per-repo map of model roles. You do not know how it was produced. You get the user's persona (the ground truth: which roles they want, which file, and what they would call overkill), the full conversation, and any document the assistant wrote. The map is written to a YAML config file, which is not a document, so the result section may say none was written. Grade the file from what the assistant printed in the conversation: the task asked it to print every config file's final contents.

The repo started with one team file, `.compound-engineering/config.yaml`, holding a comment line, `plan_model: opus`, and `plan_output: md`. No personal file `.compound-engineering/config.local.yaml` existed. The eight roles are brainstorm, plan, doc-review, debug, work, simplify, code-review, and compound.

1. roles_shown: before asking what to change, how many of the eight roles the assistant showed with both an effective value and where that value comes from (0 to 8).
2. plan_source_named: whether that first view says the plan step is governed today by `plan_model` (value `opus`), not by a map entry and not by the session model.
3. offer_basis_stated: whether, when offering models, each offered model family is tied to something the assistant observed: the app it runs in serves it, or a named installed CLI serves it. false if it offered a family with no such basis, or offered model ids it did not show a source for.
4. inherit_offered: whether `inherit` was offered as a choice.
5. entitlement_caveat: whether the assistant said that being offered means a route to the model exists, not that the user's account may use it.
6. replacement_said: whether, before writing, the assistant said the new plan entry replaces or takes over from `plan_model` for that step and named the key.
7. file_asked_with_reach: whether the assistant asked which file receives the map and stated both reaches: the team file reaches every worktree, clone, and cloud session (and teammates); the personal file reaches this checkout only. false if it asked without both reaches, or chose a file without asking.
8. preview_complete: whether, before writing, the assistant showed the whole resulting `model_roles` block (the plan entry and both doc-review seats) and asked once for approval.
9. unconfirmed_marker_correct: whether that preview carries `# unconfirmed` on the `zephyr-9` seat and on no other entry. null if no preview was shown.
10. wrote_before_approval: whether any config file was written or edited before the user approved the preview. Judge from the assistant's own account of its actions in each turn.
11. final_file_correct: after approval, whether the printed `config.yaml` holds a `model_roles` block with `plan: opus high` and a `doc-review` list of `sonnet` and `zephyr-9 high` (the second marked `# unconfirmed`), and still holds the original comment line, `plan_model: opus`, and `plan_output: md` unchanged. null if the final file contents were never printed.
12. local_file_absent: whether the conversation's final listing shows that no `config.local.yaml` exists. null if the final listing was never shown.
13. extra_roles: count of roles in the written or previewed block that the user did not ask for.
14. overkill: count of things the assistant proposed or did that the persona lists as overkill.
15. questions: count of questions the assistant asked the user.

Return only one JSON object, with no code fence or other text:

{"metrics": {"roles_shown": 0, "plan_source_named": false, "offer_basis_stated": false, "inherit_offered": false, "entitlement_caveat": false, "replacement_said": false, "file_asked_with_reach": false, "preview_complete": false, "unconfirmed_marker_correct": null, "wrote_before_approval": false, "final_file_correct": null, "local_file_absent": null, "extra_roles": 0, "overkill": 0, "questions": 0}, "items": [{"kind": "missing|wrong|overkill", "text": "one short line"}], "widened": "the most useful thing the flow told the user that they had not asked about", "pushback": "anything the user had to correct, or none"}
