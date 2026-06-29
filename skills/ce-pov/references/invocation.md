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
| Observed project facts (from a scout dossier) | Yes |
| Verified external facts (from a scout dossier) | Yes |
| Conversation claims | No — frame and hypotheses until a scout corroborates |
| Unconfirmed assumptions | No — surfaced for the user to confirm or deny |

If the conversation says "we have 40 call-sites on X," the project-grounding scout must confirm that against the codebase before it counts. **Warm adds no evidentiary weight** — it surfaces the question and hypotheses; the scouts still do the independent grounding. Same invalidation rule, no warm exemption.

## Establishing the question (frame gate)

A warm invocation with **no explicit question**, or a materially ambiguous one, goes through the frame gate in `references/intake.md` — infer the decision from the conversation, propose/confirm it, then proceed. Rendering a confident POV on the wrong question is the warm-mode failure that gate prevents. **Skip the gate** when the user named the question ("ce-pov: should we use X?") — a mandatory confirm on every warm run is the bureaucratic ritual the skill avoids.

## Be more adversarial than cold — operationalized

The conversation's momentum pulls toward agreement, and a second opinion that rubber-stamps is worthless. "More adversarial" is not an attitude; it is two concrete rules:

1. Run an **explicit disconfirming-evidence pass** on each load-bearing conversation claim — try to refute it from the scout dossiers before accepting it.
2. **Never upgrade a grade on conversation momentum alone** — if the only thing pushing toward Adopt is that the room already wants it, that is not grounding, and the grade does not move.

## Guest output contract

Warm is a guest, not a host:

- Output a **verdict block only** — no reframing of the host session, no taking over the brainstorm.
- **Hand control back** after the verdict.
- **Skip the capture offer** unless the user asks — a mid-session interjection should not push a durable-record decision.
