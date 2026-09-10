# Invocation Contexts

Read this for a **warm** invocation (SKILL.md Phase 0, Frame and Classify). The method is one method; warm changes *where the question comes from* and *how much ceremony is warranted*, not the workflow.

## Cold vs warm

- **Cold** — the user opens with an explicit external question at session start. Run the full method at the warranted tier.
- **Warm** — `ce-pov` is dropped into a live session ("weigh in", "give me your POV on this") and the question lives in the surrounding conversation, or is absent.

## What warm takes from the conversation: the question only

The conversation supplies the **question** and the **claims-to-verify** — *nothing else*. It is **not** grounding. The biggest failure here is consensus laundering: twenty turns of you and the agent mutually assuming "we must migrate off X" quietly become "grounding," and the result is a confident verdict that ratifies chat fiction.

So every input is labeled by where it came from, and only verified buckets satisfy the grounding check (see `references/method.md`):

| Bucket | Counts as grounding? |
|---|---|
| Observed project facts (from a scout dossier or a host bounded read of the authoritative source) | Yes |
| Verified external facts (from a scout dossier or a host bounded read of the authoritative source) | Yes |
| Conversation claims | No — frame and hypotheses until a scout or a bounded inline read of the authoritative source corroborates |
| Unconfirmed assumptions | No — shown to the user to confirm or deny |

If the conversation says "we have 40 call-sites on X," the project-grounding scout — or the host's own bounded read, when the sites are already located — must confirm that against the codebase before it counts. **Warm adds no evidentiary weight.** It brings out the question and hypotheses; the independent grounding is still done by scouts or bounded reads of the source, never by the conversation itself. The same invalidation rule applies, with no warm exemption.

## Establishing the question (frame gate)

The frame gate is the check that the question is settled before research starts. A warm invocation with **no explicit question**, or a materially ambiguous one, goes through it in `references/intake.md`: resolve the decision from context and evidence, and return essential missing context to the caller. Rendering a confident POV on the wrong question is the warm-mode failure that check prevents. **Skip the check** when the user named the question ("ce-pov: should we use X?"); a mandatory confirm on every warm run is the bureaucratic ritual the skill avoids.

Short references are intentional: "on the approach," "these options," or "the three options presented" resolve from the active conversation when one referent fits. Return missing context to the caller when competing meanings would materially change the POV and the conversation cannot distinguish them. `oracle` requests immediate panel convergence; explicit peer names in the same invocation select those exact participants and override oracle discovery and its automatic cap. `Cursor` means the Cursor harness's configured default/Auto model; `Composer` means a Composer model reached through Cursor, not an alias for Cursor.

A warm panel request (a "summons" in `references/cross-model-panel.md`) that names an already-formed position to oracle — the host's prior POV or the user's own view — is the prior-opinion subject case (see `references/cross-model-panel.md` Section 1), not a revision prompt: the position ships as the subject and peers form their own verdict. A follow-up panel request after pushback re-enters the panel with a fresh round before any position change is emitted.

## Be more adversarial than cold — operationalized

The conversation's momentum pulls toward agreement, and a second opinion that rubber-stamps is worthless. "More adversarial" is not an attitude; it is two concrete rules:

1. Run an **explicit disconfirming-evidence pass** on each conversation claim the verdict depends on: try to refute it from the grounded evidence (scout dossiers or bounded inline reads) before accepting it.
2. **Never upgrade a grade on conversation momentum alone.** If the only thing pushing toward Adopt is that the room already wants it, that is not grounding, and the grade does not move.

## Guest output contract

Warm is a guest, not a host:

- Consult a peer only when the warm invocation explicitly requests one; never make a proactive panel offer mid-session.
- Output a **requested POV only** — no reframing of the host session, no taking over the brainstorm.
- **Hand control back** after the POV.
- **Skip the capture offer** unless the user asks — a mid-session interjection should not push a durable-record decision.
