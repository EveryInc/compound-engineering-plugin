# `ce-riffrec-feedback-analysis`

> Turn a [Riffrec](https://github.com/kieranklaassen/riffrec) capture (or a video, audio clip, or meeting notes) into structured product feedback.

`ce-riffrec-feedback-analysis` is the **consumption** skill for Riffrec recordings. Riffrec is a separate capture tool. It records synchronized screen, voice, and events and emits a `riffrec-*.zip`. This skill analyzes a Riffrec capture bundle, zipped or unpacked, or a standalone video, audio file, or notes file, and routes to setup, a quick bug report, or extensive analysis.

Use it for those recordings. Short text feedback can go straight into `/ce-brainstorm`. A debug session is `/ce-debug`. Bare transcription, with no structure, is a transcription tool.

The skill also activates when an unpacked Riffrec capture appears (`session.json`, `events.json`, `recording.webm`, `voice.webm`). Pass the capture directory itself so the analyzer preserves its synchronized metadata and media.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Routes a capture to setup, a quick bug report, or extensive analysis, then produces the matching artifact |
| When to use it | A `riffrec-*.zip` lands in chat, someone shares recorded feedback, or you ask how to capture with Riffrec |
| What it produces | Quick: one bug report in chat. Extensive: a requirements-shaped analysis, then a handoff to `/ce-brainstorm` |
| Three paths | Setup (no recording yet), quick (under ~60s or one issue), extensive (longer or several issues) |

---

## Example invocations

Length and wording pick the path. You do not pass a flag.

```text
# A complete Riffrec zip. Length and event count pick quick vs extensive
/ce-riffrec-feedback-analysis riffrec-2026-05-04-checkout-flow.zip

# Same router for video, audio, or written notes
/ce-riffrec-feedback-analysis demo.mp4
/ce-riffrec-feedback-analysis voice-memo.m4a
/ce-riffrec-feedback-analysis meeting-notes.md

# Force the short path: one bug report in chat, no brainstorm, nothing written unless you ask
/ce-riffrec-feedback-analysis just transcribe this clip.mp4

# Longer walkthrough, extract only. Artifacts land, brainstorm does not start
/ce-riffrec-feedback-analysis extract the analysis from checkout-walkthrough.mp4, do not brainstorm

# No recording yet. Install and capture guide, analyzer does not run
/ce-riffrec-feedback-analysis how do I install and use Riffrec?
```

A Riffrec bundle with no extra wording is inspected first (duration, event count). If that is still unclear, the skill asks before doing the heavy work.

---

## The Problem

A raw walkthrough does not turn into something you can build from:

- A 12-minute session is too dense to act on as a blob
- Several issues collapse into whichever one is mentioned first
- A transcript of what was said misses what the person was trying to do
- Raw screen and audio sitting in the repo get committed by accident
- Nothing in the chain consumes the recording as requirements
- The capture tool itself still needs an install path

## The Solution

Three paths, chosen from the input, not from a mode flag:

- **Setup** when there is no recording yet and the question is how to install, capture, or share. The skill walks the Riffrec install guide. The analyzer does not run.
- **Quick bug report** when the clip is under ~60 seconds, names a single issue, or asks for "quick", "small", or "just transcribe". One concise bug report, printed in chat. No full artifact set, no brainstorm. A file is written only if you ask for one.
- **Extensive analysis** when the recording is longer, covers several issues or a workflow, or you want requirements material. Structured analysis plus screenshots, then a handoff to `/ce-brainstorm`. Say "extract only" or "analyze, do not brainstorm" to stop after the artifacts.

Raw recordings, audio, zip contents, and extracted frames stay local by default. Text artifacts can be committed when they are needed for traceability and contain no sensitive data.

---

## What Makes It Novel

### The path follows the recording

A short single-issue clip should not pay for a requirements package. A multi-issue walkthrough should not collapse into one ticket. When a zip arrives without context, the skill looks at length and event count before choosing. If a quick-path transcript turns out to hold several issues, it says so and switches to extensive.

### Privacy default on the raw bits

`raw/` and `frames/` are not committed unless you ask and confirm privacy is acceptable. Committed docs use repo-relative screenshot paths so a later agent can open the evidence without an absolute local path.

### One intake, several file shapes

Non-setup runs share one analyzer. Accepted inputs: a Riffrec `.zip` or unpacked capture directory; `.mp4` / `.mov` / `.webm` video; `.m4a` / `.mp3` / `.wav` audio; a meeting-notes `.md`. A Riffrec bundle is richer because events and timestamps come along. A video or voice memo still goes through the same router.

In a repo that has `docs/brainstorms/`, extensive output defaults to `docs/brainstorms/riffrec-feedback/` as kickoff evidence. The durable plan still comes from `ce-brainstorm` under `docs/plans/`. The quick path writes to a temp directory so a one-issue report does not land in that tree.

### Extensive always continues, unless you said not to

The recording is what the user experienced. That is evidence, not a decision. After the analysis lands, the skill loads `/ce-brainstorm` with `requirements-kickoff.md` and asks you to confirm, correct, or regroup the captured requirements. The quick path skips that handoff because the bug report is the deliverable.

---

## Quick Example

A teammate drops `riffrec-2026-05-04-checkout-flow.zip` into chat.

The analyzer reports 8 minutes, 47 events, several UI surfaces. That is extensive analysis.

It extracts a voice transcript, frames at event boundaries, and an event log. Four issues show up: the "Buy now" CTA hides on mobile, form validation does not surface the error inline, the confirmation email subject is unclear, and a "wait, why did it skip step 3?" moment that points at a flow gap.

The write-up lands under `docs/brainstorms/riffrec-feedback/riffrec-2026-05-04-checkout-flow/`, with `analysis.md`, `problem-analysis.md`, and `requirements-kickoff.md` among the files. Each issue keeps its frames and timestamps. The raw recording stays local.

The skill then loads `/ce-brainstorm` on that analysis. Brainstorm asks whether the captured requirements are right, then writes the requirements-only unified plan.

---

## When to Reach For It

Use `ce-riffrec-feedback-analysis` when:

- A Riffrec capture bundle arrives and you want to act on it
- Someone shares a video, audio clip, or meeting notes as product feedback
- You need the Riffrec install and capture steps
- A long walkthrough needs to become structured input for `/ce-brainstorm`

Skip it when:

- The feedback is short and already text. Paste it into `/ce-brainstorm`
- The recording is a debug session, not product feedback → `/ce-debug`
- You only want a transcript with no structure. Use a transcription tool
- You already have a single known bug and a stack trace. Skip the capture skill

---

## Use as Part of the Workflow

This skill is a front door, not a stage in the core loop:

```text
recording → /ce-riffrec-feedback-analysis → (extensive) → /ce-brainstorm → /ce-plan → /ce-work
                                          → (quick)     → bug report in chat
                                          → (setup)     → capture instructions
```

Extensive analysis is supposed to become a plan. Quick is done when the report is in chat.

---

## Use Standalone

Most invocations are a file path plus optional intent ("just transcribe", "do not brainstorm", "how do I install").

If you already unzipped a capture, pass its directory to preserve the synchronized metadata. Passing `recording.webm` alone still works as standalone video, but drops the event log and other capture context.

---

## Reference

| Argument | Effect |
|----------|--------|
| `<riffrec-*.zip>` | Analyze the bundle. Duration and events pick quick vs extensive |
| `<unpacked-capture-directory>` | Analyze `session.json`, `events.json`, and the capture media together |
| `<video / audio / notes>` | Same router (`.mp4` `.mov` `.webm` / `.m4a` `.mp3` `.wav` / `.md`) |
| "quick", "small", "just transcribe" | Force the quick path: one bug report in chat |
| "extract only" / "analyze, do not brainstorm" | Extensive artifacts, no `/ce-brainstorm` handoff |
| Setup wording ("how do I install", "how to capture") | Install and capture guide. Analyzer does not run |

Extensive artifacts (under the output dir): `analysis.md`, `problem-analysis.md`, `review-prompt.md`, `source-materials.md`, `requirements-kickoff.md`, plus local-only `raw/` and `frames/`.

The output format the extensive path writes for brainstorm is `references/compound-engineering-feedback-format.md`.

---

## FAQ

**What is Riffrec?**
A separate capture tool ([github.com/kieranklaassen/riffrec](https://github.com/kieranklaassen/riffrec)). Screen, microphone, console, network, and DOM events into one `riffrec-*.zip`. This skill does not record. It consumes recordings.

**Do I have to use Riffrec?**
No. Video, audio, and markdown notes take the same paths. A Riffrec bundle, zipped or unpacked, is richer because events and timestamps travel with it.

**Why does extensive analysis continue into `/ce-brainstorm`?**
The recording is evidence. Without brainstorm, the analysis sits on disk and nobody decides what to build. Ask for extract-only if you want the files and not the handoff.

**Why is the quick path different?**
A 30-second single-bug clip does not need a requirements package. The report is printed in chat so you can confirm it. Nothing is written unless you ask.

**What stays local?**
Raw recordings, audio, zip contents, and frames stay local by default. Text artifacts can be committed when they are safe and you need the trace.

**What if the input is ambiguous?**
The skill inspects length and event count. If that is still unclear, it asks. Better one question than the wrong path.

---

## See Also

- [`ce-brainstorm`](./ce-brainstorm.md): where extensive analysis is supposed to go
- [`ce-plan`](./ce-plan.md): enriches the unified plan that came from the recording
- [`ce-debug`](./ce-debug.md): when the quick-path report has a clear failure to investigate
- [Riffrec](https://github.com/kieranklaassen/riffrec): the capture tool (separate project)
