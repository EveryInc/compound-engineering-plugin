---
title: Plugin Architecture For Greeting Formats - Plan
type: feat
date: 2026-08-20
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-brainstorm
execution: code
---

# Plugin Architecture For Greeting Formats - Plan

## Goal Capsule

- **Objective:** Third parties can add a greeting format without a change to this repository, and every built-in format runs through the same plugin interface.
- **Means:** a `formats/` plugin directory loaded at startup (KTD1).
- **Authority:** this plan; the brainstorm's Product Contract below, carried forward unchanged.
- **Stop conditions:** stop if the plugin interface cannot express an existing built-in format.

## Product Contract

### Summary

Replace the hard-coded greeting formats with a plugin interface. Built-in formats become the first plugins. Third-party plugins load from a configured directory.

### Problem Frame

Every new format has been a pull request to this repository. The brainstorm settled that the format surface is where the project wants outside contribution, and that a plugin interface is the way to get it.

### Requirements

- R1. A format plugin is a module exporting `name` and `render(name)`; the loader discovers it from the configured directory at startup.
- R2. The built-in `plain` and `json` formats are shipped as plugins and pass the same loader.
- R3. A plugin that throws on load is skipped with a logged warning; the rest load.
- R4. The plugin interface is documented in `docs/plugins.md` with one worked example.

### Key Decisions

- **Formats are the extension surface.** (session-settled: user-directed — chosen over exposing the renderer internals: a narrow surface keeps third-party plugins stable across refactors.) Governs R1.
- **Built-ins are plugins too.** (session-settled: user-approved — chosen over a separate internal path: one interface, one loader, one set of tests.) Governs R2.

### Scope Boundaries

- Out: a plugin registry or marketplace; signing or sandboxing plugins; remote plugin loading.

## Planning Contract

### Key Technical Decisions

- KTD1. Load plugins with a directory scan at startup from `GREET_FORMATS_DIR`, defaulting to `./formats`. Governs R1.
- KTD2. Built-in plugins live under `src/formats/` and are loaded through the same scan. Governs R2.

## Implementation Units

### U1. Plugin loader

- **Goal:** Plugins in the configured directory are discovered and registered at startup.
- **Requirements:** R1, R3
- **Files:** `src/plugins.js`, `test/plugins.test.js`
- **Approach:** scan the directory, require each module, validate `name` and `render`, register; skip and warn on throw.
- **Test scenarios:**
  - A valid plugin module is registered under its `name`.
  - A module missing `render` is skipped with a warning; a sibling still loads.
  - A module that throws on require is skipped with a warning.
- **Verification:** `npm test` passes.

### U2. Built-in formats as plugins

- **Goal:** `plain` and `json` ship as plugins through the same loader.
- **Requirements:** R2
- **Files:** `src/formats/plain.js`, `src/formats/json.js`, `src/greet.js`, `test/formats.test.js`
- **Approach:** move each built-in into a plugin module; `greet` resolves formats from the registry.
- **Test scenarios:**
  - `greet("Ada", "json")` returns `{"greeting":"hello Ada"}` via the registry.
  - Removing `src/formats/json.js` makes `json` unavailable, with the documented error.
- **Verification:** `npm test` passes.

### U3. Plugin documentation

- **Goal:** A third party can write a plugin from the docs alone.
- **Requirements:** R4
- **Files:** `docs/plugins.md`
- **Approach:** interface, discovery directory, the worked example, failure behavior.
- **Test expectation:** none -- documentation; verified by following the example end to end.
- **Verification:** the example plugin loads and renders.

## Verification Contract

| Gate | Command |
|---|---|
| Unit | `npm test` |

## Definition of Done

- R1-R4 hold; `npm test` passes; the worked example in `docs/plugins.md` loads and renders.
