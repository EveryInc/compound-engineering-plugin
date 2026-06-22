# Visual Probes

Use visual probes when a brainstorm decision is faster to judge by seeing a rough artifact than by reading prose. A visual probe is a disposable decision sketch, not a prototype, implementation plan, UI spec, or design deliverable.

## Trigger

Use this reference only when the next question has a specific visual decision:

- behavior shape: "Which annotation or drawing behavior feels right?"
- layout shape: "Which navigation structure matches the workflow?"
- flow shape: "Where should this decision point sit?"
- state shape: "Which empty/loading/error state communicates the right thing?"
- diagram shape: "Which relationship or system boundary is clearer?"

Do not use a visual probe for product goals, scope boundaries, success criteria, evidence probes, tradeoff prose, or technical decisions that are easier to discuss in chat.

## Offer

Ask once at the decision point. Do not enable a session-wide mode.

Use the platform's blocking question tool for the opt-in when available (`AskUserQuestion`, `request_user_input`, `ask_user`, or equivalent). Use a plain chat question only when no interactive question tool exists or the tool errors. The opt-in should have two clear options:

- Visual sketch — create rough options in a local browser
- Text description — keep the decision in chat

Use this wording:

> This decision may be easier to judge visually. I can either sketch rough options in a local browser so you can react to the shape, or keep it in chat and describe the options textually, which is faster but lower-fidelity. Which do you prefer?

The text path must be credible. If you cannot explain the decision clearly in text, you do not understand it well enough to sketch it.

If the user chooses text, continue in chat and do not re-offer for the same decision. If they choose visual, proceed below.

## Visual Path

Create the cheapest artifact that answers the current question. Optimize for fast feedback, not polish.

Allowed:

- rough behavior sketches
- low-fidelity wireframes
- state comparisons
- flow diagrams
- simple A/B/C visual contrasts
- disposable interaction demos only when behavior itself is the decision

Avoid:

- polished branding
- final colors or typography
- component-library precision
- pixel-perfect layout
- production-like implementation
- unnecessary animation
- details that imply exact UI commitments

Label the artifact as directional. State what the user should judge and what they should ignore.

## Display Helper

Use the bundled display-only helper when the current platform can run a bundled skill script:

- Helper: `scripts/visual-probe-server.js`
- Resolve the helper path relative to the loaded `ce-brainstorm` skill directory before running it. Do not resolve it from the user's project CWD.
- Start: `node <resolved-helper-path> start --root /tmp/compound-engineering/ce-brainstorm-visual/<run-id>`
- Start foreground: `node <resolved-helper-path> start --root /tmp/compound-engineering/ce-brainstorm-visual/<run-id> --foreground`
- Status: `node <resolved-helper-path> status --root /tmp/compound-engineering/ce-brainstorm-visual/<run-id>`
- Stop: `node <resolved-helper-path> stop --root /tmp/compound-engineering/ce-brainstorm-visual/<run-id>`

The helper creates `screens/` and `state/`, serves the newest `.html` file in `screens/`, writes `state/display-info.json`, and exposes `/version` so the browser can poll for screen changes. The browser reloads only when the newest screen changes; it must not continually reload on a timer. `/version` polling does not count as activity, so an abandoned browser tab cannot keep the server alive forever. Detached servers monitor the owning harness process when it can be resolved, and all servers exit after an idle timeout. The helper has no click tracking or browser-to-agent event path.

If the helper path is unavailable or the platform cannot display a local URL cleanly, say so briefly and use the text path. Do not build a custom event system or long-lived server to compensate during the brainstorm.

## Launch Mode by Platform

The server is the same everywhere; only the launch mode changes.

- **Claude Code / Claude desktop app:** detached `start` is the default path. If the app opens localhost URLs, show the returned URL and continue. If the browser surface is unavailable, use the text path.
- **Codex CLI / Codex app:** if detached processes are reaped or the URL dies after the tool call, use `start --foreground` through the platform's long-running/background terminal mechanism. If there is no stable browser surface, use the text path.
- **Plain terminal UI:** print the returned URL for the user to open manually. If opening a browser would interrupt the flow, keep the decision in chat.
- **Remote or containerized sessions:** if `localhost` is not reachable from the user's browser, start with `--host 0.0.0.0` and tell the user which host/port to open. If that cannot be made clear, use the text path.

Never force the visual path because a local server exists. The user chose visual to understand the decision faster; if the platform plumbing gets in the way, switch back to text.

## Post-Artifact Feedback

After showing the visual artifact, use the platform's blocking question tool for bounded artifact feedback when available. This is still chat-based feedback, not browser event capture.

Use a bounded interactive question when the expected response is a small choice set:

- A/B/C/D option selection
- visual direction vs mix
- choose one layout/state/behavior
- accept one option with requested tweaks

Include a free-text fallback option when the tool supports it. Use plain chat only when feedback is genuinely open critique, no interactive question tool exists, or the tool errors.

Good post-artifact prompt:

> Which direction best matches what you want? Pick A, B, C, D, or mix, and use the free-text fallback for anything that feels off. Judge the behavior shape, not the exact styling.

Do not ask the user to click inside the browser artifact. The question tool is for the chat/session response after the artifact is visible.

## Interaction Contract

The browser/artifact is display-only. Feedback happens in chat.

Do not add click tracking, selected states, event ingestion, forms, analytics, or "submit" affordances in v1. Do not ask the user to click an option. Ask them to look at the artifact and reply in chat with the choice, mix, or correction.

If no interactive question tool is available, use this plain-chat fallback after showing the artifact:

> I’m showing three rough options. Reply here with A, B, C, or "mix", plus anything that feels off. Judge the behavior shape, not the exact styling.

The user's chat response is authoritative. The visual artifact is supporting context only.

## File Placement

Use OS temp by default because visual probes are disposable scratch:

```text
/tmp/compound-engineering/ce-brainstorm-visual/<run-id>/
  screens/
    001-<decision>.html
  state/
    display-info.json
```

Use `.context/compound-engineering/ce-brainstorm-visual/<run-id>/` only when the user explicitly wants to inspect, preserve, or curate the sketches after the session. The final requirements doc in `docs/brainstorms/` is the durable artifact.
