# `ce-riffrec-feedback-analysis`

> Turn raw [Riffrec](https://github.com/kieranklaassen/riffrec) recordings into structured product feedback — quick bug reports for short captures, extensive analysis for longer ones, with handoff to `ce-brainstorm` when requirements emerge.

`ce-riffrec-feedback-analysis` is the **product-feedback consumption** skill. Riffrec is a separate capture tool that records synchronized screen + voice + event sessions and emits a `riffrec-*.zip` bundle. This skill is the consumption side: it analyzes those bundles (or any video / audio / meeting-notes file), routes between three paths based on length and intent, and produces the right artifact for what's actually inside the recording.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Analyzes a Riffrec zip (or video/audio/notes file), routes to setup / quick-bug / extensive-analysis path, produces structured feedback artifacts |
| When to use it | A `riffrec-*.zip` lands in chat; a video, audio, or meeting-notes file is shared as feedback; the user asks how to capture and share Riffrec sessions |
| What it produces | Quick: one concise bug report. Extensive: requirements-shaped analysis + handoff to `/ce-brainstorm` |
| Three paths | Setup (no recording yet), Quick bug report (under ~60s, single issue), Extensive analysis (longer, multiple issues) |

---

## The Problem

Raw user-feedback recordings don't reduce to structured input automatically:

- **Long recordings get ignored** — a 12-minute walkthrough is too dense to act on without preprocessing
- **Multi-issue recordings collapse to a single fix** — the recording covers 4 distinct problems but only the first one gets attention
- **Audio nuance lost in transcription** — what the user said matters less than what they were trying to do; raw transcripts miss the intent
- **Privacy bleed** — raw screen captures and audio on disk get committed accidentally
- **No bridge to building** — the feedback exists, but nothing turns it into a brainstorm or plan
- **Setup friction** — the user wants to share feedback but doesn't know how to install the capture tool

## The Solution

`ce-riffrec-feedback-analysis` runs a routed flow with three paths:

- **Setup path** — when the user has no recording yet and asks how to install / capture / share, this surfaces the Riffrec install guide and capture instructions
- **Quick bug report** — short recording, single issue, "just transcribe" intent → one concise bug report, no full artifact set
- **Extensive analysis** — longer recording or multiple issues → structured analysis with screenshots, requirements-shaped output, mandatory handoff to `/ce-brainstorm`

The skill defaults raw recordings, audio chunks, zip contents, and extracted screenshots to local-only — no automatic commit. Text artifacts (analysis summaries, problem analyses) can be committed when traceability matters and there's no sensitive data.

---

## What Makes It Novel

### 1. Three-path routing on length + intent

The path is chosen by what the input actually warrants, not by a flag:

- **Setup** — user has no recording yet, asks how to install Riffrec, capture a session, or share feedback. The skill loads `references/install-riffrec.md` and walks through it.
- **Quick bug report** — under ~60 seconds, single issue, or the user explicitly asks for "quick", "small", or "just transcribe". Output is one concise bug report; the skill skips the full artifact set and brainstorm handoff.
- **Extensive analysis** — longer, multiple issues / requirements / workflow walkthroughs, or the user wants requirements material. Output is the full structured analysis with screenshots; the skill **always continues into `/ce-brainstorm`**.

When the input is ambiguous (a zip arrived without context), the skill inspects recording length and event count before choosing. If still unclear, it asks the user.

### 2. Privacy-default for raw artifacts

Raw recordings, audio chunks, zip contents, session dumps, and extracted screenshot frames stay local-only by default. The `raw/` and `frames/` directories are not committed unless the user explicitly asks and confirms privacy is acceptable. Text/metadata artifacts (analysis summaries, problem analyses, source manifests) may be committed when needed for traceability and they contain no sensitive data.

Repo-relative screenshot paths in committed docs ensure later agents can open the evidence without absolute local paths.

### 3. Single analyzer entry point — accepts multiple input shapes

All non-setup paths share one entry point: `python scripts/analyze_riffrec_zip.py /path/to/input`. Accepted inputs:

- A Riffrec `.zip` bundle
- An `.mp4` / `.mov` / `.webm` video
- An `.m4a` / `.mp3` / `.wav` audio file
- A meeting-notes `.md`

This is what makes the skill useful beyond Riffrec — any recorded feedback fits the same pipeline.

### 4. Context-aware output location

In repos with `docs/brainstorms/`, the default output directory is `docs/brainstorms/riffrec-feedback/` so the analysis lands where downstream skills (`ce-brainstorm`, `ce-plan`) expect to find requirements material. The quick path overrides to a temp location so it doesn't pollute the repo with single-issue bug reports.

### 5. Compound Engineering output format for extensive analysis

The extensive path produces output in the Compound Engineering feedback format documented in `references/compound-engineering-feedback-format.md` — structured to feed cleanly into `/ce-brainstorm` as raw input. Multiple issues / requirements / observations get separated, each with the relevant screenshot frames and timestamps. The brainstorm receives a starting point, not a transcript.

### 6. Mandatory `ce-brainstorm` handoff for extensive analysis

The extensive path always continues into `/ce-brainstorm` after the analysis lands. The recording captured *what the user experienced*; the brainstorm clarifies *what to build in response*. Without the handoff, the analysis sits on disk and nobody knows what to do with it.

The quick path skips the handoff — a single bug report is its own deliverable.

### 7. Lazy reference loading

The skill loads only the reference for the chosen path: `install-riffrec.md` for setup, `quick-bug-report.md` for quick, `extensive-analysis.md` for extensive. The other references stay unread, keeping the skill's runtime context small.

---

## Quick Example

A teammate shares a `riffrec-2026-05-04-checkout-flow.zip` in your chat. You drag it in.

The skill detects a Riffrec zip, runs the analyzer to inspect length and event count: 8 minutes, 47 events, multiple distinct UI surfaces touched. It routes to **extensive analysis**.

The analyzer extracts: synchronized voice transcript, screen capture frames at event boundaries, event log with timestamps. It identifies 4 distinct issues: (1) the "Buy now" CTA hides on mobile, (2) form validation doesn't surface the error inline, (3) confirmation email subject line is unclear, (4) a confused "wait, why did it skip step 3?" moment that signals a flow gap.

It produces a structured analysis at `docs/brainstorms/riffrec-feedback/2026-05-04-checkout-flow-analysis.md` with each issue, the relevant frames, and timestamps. Raw recording stays local-only.

The skill loads `/ce-brainstorm` with the analysis as the starting point. Brainstorm clarifies which issue to address first, what success looks like, and produces the requirements doc.

---

## When to Reach For It

Reach for `ce-riffrec-feedback-analysis` when:

- A `riffrec-*.zip` arrives and you want to act on it
- Someone shares a video, audio, or meeting notes as product feedback
- The user asks how to install Riffrec or capture a session for feedback
- A long walkthrough recording needs to become structured input for `/ce-brainstorm`

Skip `ce-riffrec-feedback-analysis` when:

- The feedback is text-only and short — just paste it directly into `/ce-brainstorm`
- The recording is for a debug session, not feedback — handle the bug directly
- You just want to transcribe audio with no further structure — use a transcription tool, not this skill

---

## Use as Part of the Workflow

The skill is a **front-door entry point** to the chain:

```text
recording → /ce-riffrec-feedback-analysis → (extensive) → /ce-brainstorm → /ce-plan → /ce-work
                                          → (quick)     → bug report (standalone)
                                          → (setup)     → instructions for capturing
```

The extensive path always continues into `/ce-brainstorm` so the captured feedback becomes a real artifact downstream skills can use. The quick path produces a complete artifact on its own (a bug report) without forcing brainstorm overhead.

---

## Use Standalone

The skill is most often invoked directly with a Riffrec zip or other input file:

- **Riffrec zip** — `/ce-riffrec-feedback-analysis riffrec-2026-05-04-checkout-flow.zip`
- **Video file** — `/ce-riffrec-feedback-analysis demo.mp4`
- **Audio file** — `/ce-riffrec-feedback-analysis voice-memo.m4a`
- **Meeting notes** — `/ce-riffrec-feedback-analysis meeting-notes.md`
- **Setup question** — `/ce-riffrec-feedback-analysis "how do I install riffrec"` (no input file; routes to setup path)

When the input is ambiguous (a zip arrived without context, or the path-routing signals are mixed), the skill inspects length and event count before choosing — and asks if still unclear.

---

## Reference

| Argument | Effect |
|----------|--------|
| `<file path>` | Analyzes the file — Riffrec zip, video, audio, or meeting notes |
| Setup intent ("how do I install", "how to capture") | Routes to setup path with install instructions |
| Length + intent inferred from input | Routes to quick or extensive path |

Analyzer: `scripts/analyze_riffrec_zip.py`. Compound Engineering output format: `references/compound-engineering-feedback-format.md`.

---

## FAQ

**What's Riffrec?**
A separate capture tool ([github.com/kieranklaassen/riffrec](https://github.com/kieranklaassen/riffrec)) that records synchronized screen + voice + event sessions and emits a `riffrec-*.zip`. This skill is the consumption side — it doesn't capture, it analyzes captures.

**Do I have to use Riffrec to use this skill?**
No. The analyzer accepts videos (`.mp4`, `.mov`, `.webm`), audio (`.m4a`, `.mp3`, `.wav`), and meeting notes (`.md`) as well. Riffrec just provides a structured zip with synchronized event timestamps that produces richer analysis.

**Why does the extensive path always continue into `/ce-brainstorm`?**
Because the recording captures what the user experienced — that's evidence, not a decision. Without continuing into brainstorm, the analysis sits on disk as a transcript-with-screenshots and nobody knows what to build in response. The handoff is what makes the feedback actionable.

**Why is the quick path different?**
A 30-second recording showing a single bug doesn't need the full artifact set or a brainstorm — the bug report itself is the deliverable. The user already knows what's wrong; the skill produces a concise report and stops.

**What stays local vs gets committed?**
Raw recordings, audio, zip contents, frames stay local by default — privacy-first. Text artifacts (analysis summaries, bug reports) can be committed when traceability matters and the content is safe. Repo-relative paths in committed docs let later agents reference local screenshots without absolute paths.

**What if the input is ambiguous?**
The skill inspects length and event count first. If still unclear, it asks the user which path applies. Better to ask one question than to run the wrong path.

---

## See Also

- [`ce-brainstorm`](./ce-brainstorm.md) — extensive-analysis output feeds directly into brainstorm
- [`ce-plan`](./ce-plan.md) — downstream of brainstorm; receives the requirements doc that came from the recording
- [`ce-debug`](./ce-debug.md) — when a quick-path bug report has a clear root cause to investigate
- [Riffrec](https://github.com/kieranklaassen/riffrec) — the capture-side tool (separate project)
