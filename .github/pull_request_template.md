<!-- Structure the body however best explains THIS change — there is no fixed format.
     Size it to the change: a one-line fix needs a sentence; a big change earns design-decision callouts.
     Reach for whatever sections aid understanding (Summary, Validation, Design decisions,
     Before/after, New concepts, …) and skip the rest. -->


## Security Disclosure
<!-- Disclose any security-relevant changes in this PR: shell/exec introduced or changed in a skill,
     path or input handling, converter/writer output, secrets or credential handling, permissions,
     or dependency changes — what changed and any residual risk or follow-up.
     If there are none, write "No security-relevant changes." -->


## Agent Disclosure
<!-- Always keep this section. Human-authored with no AI agent? Replace the bullet with: "No agent used." -->
- **Model:** <!-- e.g. `Claude Code · claude-opus-4-8`, `Codex CLI · GPT-5`, `Cursor · Composer` -->
<!-- The model that did the bulk of the WORK, not whichever agent opened this PR.
     Name your harness, then the most specific model identity your own context actually gives you.
     Some harnesses state an exact model ID (Claude Code does) — copy it verbatim.
     Others expose only a generic family (Codex says "based on GPT-5"; Cursor says nothing) — report
     that family and stop. Measured 2026-07-24: on those harnesses the running model is genuinely
     absent from your context, so do not upgrade the family to a version, and do not go hunting in
     config files — the config default is often not the model actually running.
     Never invent a version or variant. -->
