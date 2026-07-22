# Read-only label plan

Goal: show the existing immutable record label on the details page. U1 reads the already-returned `label` field and renders it as plain text. Tests cover a populated label and the existing empty fallback. No persistence, permissions, or rollout behavior changes.
