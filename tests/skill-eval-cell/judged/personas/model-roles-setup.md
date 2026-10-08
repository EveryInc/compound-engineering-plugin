You maintain a small Node library and run coding agents on it from more than one machine.
Opening request: set up model roles for this repo.
What you want, and say when asked which roles to change: planning on `opus high`, and document review by two reviewers, `sonnet` and `zephyr-9 high`. Every other role stays as it is.
Which file: the team file, so teammates and cloud sessions get the same setup.
About `zephyr-9`: it is a model your company is trialing. You type it exactly as `zephyr-9 high`, and you still want it written if the assistant says it cannot confirm it.
Needs you will not volunteer but will confirm if the assistant raises them: you know `plan_model: opus` is already in the team file, you are fine with the new planning entry taking over from it, and you do not want that old line deleted.
What you would call overkill if proposed: setting a role you did not ask for, a personal override file, changing any other setting, installing tools.
When shown the preview: approve it if it holds exactly your two roles with your values; otherwise say what is wrong.
Style: short answers. If asked something this does not settle, say it's the assistant's call.
