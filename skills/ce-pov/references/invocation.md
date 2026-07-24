# Invocation Contexts

Load this for a **warm** invocation (SKILL.md Phase 0). The method is one method; warm is a modifier on *where the question comes from* and *how much ceremony is warranted*, not a second workflow.

## Cold vs warm

- **Cold** — the user opens with an explicit external question at session start. Run the full method at the warranted tier.
- **Warm** — `ce-pov` is dropped into a live session ("weigh in", "give me your POV on this") and the question lives in the surrounding conversation, or is absent.

## What warm takes from the conversation: the question only

The conversation supplies the **question** and the **claims-to-verify** — *nothing else*. It is **not** grounding. The biggest failure here is **consensus laundering**: twenty turns of you and the agent mutually assuming "we must migrate off X" quietly becoming "grounding," producing a confident verdict that ratifies chat fiction.

So every input is labeled by provenance, and only verified buckets satisfy the gate (see `references/method.md`):

| Bucket | Counts as grounding? |
|---|---|
| Observed project facts (from a scout dossier or a host bounded read of the authoritative source) | Yes |
| Verified external facts (from a scout dossier or a host bounded read of the authoritative source) | Yes |
| Conversation claims | No — frame and hypotheses until a scout or a bounded inline read of the authoritative source corroborates |
| Unconfirmed assumptions | No — surfaced for the user to confirm or deny |

If the conversation says "we have 40 call-sites on X," a bounded read of the codebase — or a scout, when the search is broad — must confirm that before it counts. **Warm adds no evidentiary weight**: it surfaces the question and hypotheses; the grounding is still done against the source, never by the conversation itself.

## Establishing the question (frame gate)

A warm invocation with **no explicit question**, or a materially ambiguous one, goes through the frame gate in `references/intake.md` — infer the decision from the conversation, propose/confirm it, then proceed. Rendering a confident POV on the wrong question is the warm-mode failure that gate prevents. **Skip the gate** when the user named the question ("ce-pov: should we use X?") — a mandatory confirm on every warm run is the bureaucratic ritual the skill avoids.

Short references are intentional: "on the approach," "these options," or "the three options presented" resolve from the active conversation when one referent fits. Ask once only when competing referents would materially change the POV. `oracle` requests immediate panel convergence; explicit peer names in the same invocation select those exact participants and override oracle discovery and its automatic cap. `Cursor` means the Cursor harness's configured default/Auto model; `Composer` means a Composer model reached through Cursor, not an alias for Cursor.

A warm summons naming an already-formed position to oracle — the host's prior POV or the user's own view — is the prior-opinion subject case (see `references/cross-model-panel.md` Section 1), not a revision prompt: the position ships as the subject and peers form their own verdict. A follow-up summons after pushback re-enters the panel with a fresh round before any position change is emitted.

## Be more adversarial than cold

Run an **explicit disconfirming-evidence pass** on each load-bearing conversation claim — try to refute it from the grounded evidence (bounded reads or a scout dossier) before accepting it. **Never upgrade a grade on conversation momentum alone.**

## Guest output contract

Warm is a guest, not a host:

- Consult a peer only when the warm invocation explicitly requests one; never make a proactive panel offer mid-session.
- Output a **POV block only** — no reframing of the host session, no taking over the brainstorm.
- **Do not push a next step** after the POV.
- **Skip the capture offer** unless the user asks — a mid-session interjection should not push a durable-record decision.
