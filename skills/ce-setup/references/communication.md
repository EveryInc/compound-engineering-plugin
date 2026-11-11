# Talking to the user

Ask each question using the host's blocking question tool already in the current tool list (match by capability, not by a host-specific name). Presence in the current tool list is proof the tool exists; never call a user-facing question tool to discover whether it exists. If a matching tool is listed but unloaded, use the host's tool-discovery primitive to load that capability — do not search for another host's tool name. Fall back to a numbered list on the host's user-visible chat surface only when no such tool is in the list or a real question call errors.

The user decides each offer from what your reply shows. Tool output may be collapsed or hidden, so anything the user needs in order to decide belongs in your reply itself.

- Before asking, give a short account of each change that the user can read once: what it is and what it gets them in this repository. Show full file text, directive text, or diffs only when the user asks. Nothing is committed, so the user can read the written files afterwards.
- A question dialog can cover the chat. Each question also names its change and what it gets the user, so it makes sense on its own.
- Use plain words. Never use this skill's step or phase names, and never use a bare skill or tool name as the explanation. Name a file, setting, or package only alongside what it does for the user.
- Each option says what happens if it is picked, and the offer names every change it covers.
