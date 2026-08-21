# Phase 2, 2.5, and 2.6: approaches, synthesis, and claim verification

### Phase 2: Explore Approaches

**Model elevation.** Before generating approaches, load `references/reasoning-elevation.md`, resolve the choice at this boundary, and follow it. Do not generate approaches until activation resolution has completed and any selected dispatch or transparent fallback has settled. When no model is selected it is a no-op; proceed normally. It runs the same on every harness — do not gate it on the host.

If multiple plausible directions remain, propose **2-3 concrete approaches** based on research and conversation. Otherwise state the recommended direction directly.

Use at least one non-obvious angle — inversion (what if we did the opposite?), constraint removal (what if X weren't a limitation?), or analogy from how another domain solves this. The first approaches that come to mind are usually variations on the same axis. Hold each approach to an anti-genericness test: if it would appear in a generic listicle for this problem category, sharpen it against the grounding dossier or drop it.

Present approaches first, then evaluate. Let the user see all options before hearing which one is recommended — leading with a recommendation before the user has seen alternatives anchors the conversation prematurely.

If choosing among approaches meets Interaction Rule 7, offer `ce-prototype` there; do not run a design campaign in this skill. If the differences are visual (shape, layout, relationship) and do not meet Rule 7, use `references/visual-probes.md` before presenting the choice. If the Phase 0.3 tripwire fired, those differences do not meet Rule 7, and no shape decision has yet been through the gate, the visual-probe offer fires here, per that reference. The visual path remains opt-in and display-only; text remains a first-class path.

When useful, include one deliberately higher-upside alternative:
- Identify what adjacent addition or reframing would most increase usefulness, compounding value, or durability without disproportionate carrying cost. Present it as a challenger option alongside the baseline, not as the default. Omit it when the work is already obviously over-scoped or the baseline request is clearly the right move.

At product tier, alternatives should differ on *what* is built (product shape, actor set, positioning), not *how* it is built. Implementation-variant alternatives belong at feature tier.

For each approach, provide:
- Brief description (2-3 sentences)
- Pros and cons
- Key risks or unknowns
- When it's best suited

**Approach granularity: mechanism / product shape, not architecture.** Approach descriptions name mechanism-level distinctions ("pause as a rule property" vs "pause as an event filter" vs "pause as a separate entity") and product-relevant trade-offs (plan-tier coupling, complexity surface, migration difficulty). They do NOT name implementation specifics — column names, table names, file paths, service classes, JSON shapes, exact method names. Those are ce-plan's job. Bringing architecture forward at brainstorm time forces the user to make architectural decisions on ce-brainstorm's intentionally-shallow research, and the synthesis at Phase 2.5 then has to filter out the leak.

After presenting all approaches, state your recommendation and explain why. Prefer simpler solutions when added complexity creates real carrying cost, but do not reject low-cost, high-value polish just because it is not strictly necessary.

If one approach is clearly best and alternatives are not meaningful, skip the menu and state the recommendation directly.

If relevant, call out whether the choice is:
- Reuse an existing pattern
- Extend an existing capability
- Build something net new

### Phase 2.5: Synthesis Summary

**STOP. Before composing the synthesis, read `references/synthesis-summary.md`.** The two-stage shape (internal three-bucket draft → chat-time scoping synthesis), the four scoping synthesis sections with their keep tests, the per-bullet affirmability and detail tests, the tier-aware bullet budget with re-cut rule, anti-pattern guidance, soft-cut behavior, self-redirect support, and internal-draft routing into doc body sections all live there — none of them appear here or in `SKILL.md`. Composing a synthesis without these rules loaded reliably produces malformed output: the full internal three-bucket draft pasted verbatim into chat, implementation detail leaking into the scoping synthesis, the proposal-pitch anti-pattern. The Path A / Path B routing below decides only *whether* a confirmation fires — it is not the synthesis spec.

Surface a scoping synthesis to the user before Phase 3 writes the requirements-only unified plan — the user's last opportunity to correct scope before the artifact lands. The scoping synthesis is shaped like what two product collaborators would confirm before writing a PRD, not like a comprehensive audit or a one-line preview.

Fires for **all tiers** including Lightweight. Skip Phase 2.5 entirely on the Phase 0.1b non-software (universal-brainstorming) route.

**Path A vs Path B** is decided by `references/synthesis-summary.md` from two signals: whether any blocking question fired, and the Phase 0.3 tier. Path A (announce-only, no confirmation) fires **solely** for Lightweight tier with no blocking questions; every other case — including a richly pre-loaded Standard/Deep opener that needed no dialogue — is Path B (full tier-aware scoping synthesis with an unconditional confirmation gate). Follow the reference's gate exactly; do not decide the path or compose the synthesis from memory.

Session-settled decisions render in the scoping synthesis as `Carrying forward:` lines, never as questions or call-outs — `references/synthesis-summary.md` owns the rendering. Path B rich-context openers carrying prior-session decisions are the common case.

#### 2.6 Claim Verification (inside the Path B confirmation wait)

When the upcoming Product Contract will assert checkable claims about the repo — absence claims ("no retry logic exists"), references to specific files, config, or dependencies, anything planning would build on — dispatch one generation-tier verifier at the same moment the Path B confirmation question goes up, so it runs during the user's think-time. Pass it the claim list (one line each), the grounding dossier path if one exists, and this instruction: verify each claim directly against the codebase — budget ~15 targeted reads — and return a per-claim verdict: **confirmed** (with `file:line`), **refuted** (with the contradicting evidence), or **unverifiable**. Do not block the confirmation question on the verifier.

Consume the verdicts at Phase 3: correct refuted claims before writing, label unverifiable ones as explicit assumptions. A fresh-context verifier replaces self-graded verification — the author confirming its own claims is anchored; the verifier never saw the dialogue.

Skip when Path A fires, when the doc will make no checkable claims, or on the non-software route. If the verifier dispatch fails for a reason that survives correcting the invocation, fall back to verifying the claims inline before the Phase 3 write — Phase 1.1's verify-before-claiming rule still holds either way.
