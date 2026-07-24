# Setup: Add Riffrec to a project

Use this path when the user has no recording yet and wants to start capturing product feedback with [Riffrec](https://github.com/kieranklaassen/riffrec).

## What to tell the user

1. Riffrec lives at <https://github.com/kieranklaassen/riffrec>. Refer them to the README for the current install command — it is the source of truth and may change.
2. Integration shape: add the capture script or package to the project's web app, wire a "Record feedback" affordance that is reachable during real use (bug report button, dev-only floating recorder, or keyboard shortcut), then confirm a sample session ends with a downloadable `riffrec-*.zip`.
3. When they return with a zip, re-enter this skill with the zip path.

## Recommended capture habits

Surface these to the user during setup so the recordings they share later are easy to analyze:

- Speak the issue out loud while reproducing it. The transcript is the single highest-signal artifact.
- Click the affected UI even when it does nothing — failed clicks are the strongest signal in event extraction.
- Keep recordings focused. Many short clips beat one long one when issues are unrelated.
- Note when a step is intentional vs. accidental ("oops, that wasn't what I meant"). The analyzer cannot infer intent.
