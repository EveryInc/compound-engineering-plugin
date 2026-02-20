# Phase 1 Handoff Report: Type Changes for Command Files

**Date:** 2026-02-20  
**Phase:** 1 of 4  
**Status:** Complete

## Summary

Implemented type changes to support storing commands as `.md` files instead of inline in `opencode.json`.

## Changes Made

### 1. Type Changes (`src/types/opencode.ts`)

- Removed `OpenCodeCommandConfig` type (lines 23-28)
- Removed `command?: Record<string, OpenCodeCommandConfig>` from `OpenCodeConfig`
- Added `OpenCodeCommandFile` type:
  ```typescript
  export type OpenCodeCommandFile = {
    name: string
    content: string
  }
  ```
- Added `commandFiles: OpenCodeCommandFile[]` to `OpenCodeBundle` (with comment referencing ADR-001)

### 2. Import Update (`src/converters/claude-to-opencode.ts`)

- Removed `OpenCodeCommandConfig` from imports
- Added `OpenCodeCommandFile` to import

### 3. Test Updates

- `tests/converter.test.ts`: Updated 4 tests to use `bundle.commandFiles.find()` instead of `bundle.config.command`
- `tests/opencode-writer.test.ts`: Added `commandFiles: []` to all 4 bundle literals definitions

## Test Status

4 tests fail in `converter.test.ts` because the converter hasn't been updated yet to populate `commandFiles`. This is expected behavior - Phase 2 will fix these.

```
76 pass, 4 fail in converter.test.ts
```

## Next Steps (Phase 2)

- Update converter to populate `commandFiles` instead of `config.command`
- Update writer to output `.md` files for commands
- Tests will pass after Phase 2 implementation