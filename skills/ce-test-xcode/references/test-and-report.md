# Test and report

This reference owns evidence collection after the app launches.

## Exercise the requested surfaces

Derive the key screens and flows from the user's request and the changed iOS surface. For each one:

- Navigate through the running app and record what was exercised.
- Capture a descriptively named screenshot of the resulting state.
- Check that expected content and controls render without visible error or broken layout.
- Read the captured simulator logs for crashes, exceptions, error-level messages, and failed network requests attributable to the flow.

A simulated action reporting success is not proof of the expected state change; verify the visible result or logs.

### SwiftUI inline Text links

Simulated taps do not trigger gesture recognizers on SwiftUI `Text` views with inline `AttributedString` links because the link is not exposed as a separate accessibility element. When such a tap reports success but has no visible effect, ask the user to tap the link manually in the simulator. If the target URL is known, this is the direct fallback:

```bash
xcrun simctl openurl <device-uuid> <URL>
```

Record which fallback supplied the verification; do not report the automated tap itself as a pass.

## Human-only verification

Pause only when the scoped flow requires user interaction the available simulator automation cannot complete. Examples include Sign in with Apple, push delivery, a sandbox purchase, camera/photos permission, location permission, or the inline-link case above.

State the exact action and expected observation, then ask whether it worked. An unanswered check is `SKIP` for that surface and forces overall `PARTIAL`; a failed check is `FAIL`. Never silently mark either passed.

## Failure route

For a failed screen or flow, preserve its screenshot, relevant logs, and reproduction steps. Ask whether to investigate now or skip that flow and continue testing the remaining scope.

- **Investigate now:** invoke `ce-debug` with the failure evidence and simulator reproduction context. Narrow its inherited authority to diagnosis and any fix the user approves at `ce-debug`'s informed fix gate, with no commit, push, or PR authority. Let it complete its owned quality and summary work, then return here. Only an applied fix triggers rebuild and retest; otherwise retain the failure and continue the remaining scoped checks.
- **Skip this flow:** mark it `SKIP`, preserve the observed failure evidence in its notes, and proceed with the rest of the scoped checks.

## Cleanup and summary

Stop the log capture started by this run. Leave a simulator that was already booted as found; a simulator booted only for this run may be shut down after evidence is saved.

Report these fields, omitting no field even when its value is `None` or `0`:

```markdown
## Xcode Test Results

**Project:** <project or workspace>
**Scheme:** <scheme>
**Simulator:** <name>
**Build:** Success | Failed
**Screens tested:** <count>

| Screen or flow | Status | Evidence / notes |
|---|---|---|
| <name> | PASS / FAIL / SKIP | <screenshot and observation> |

**Console errors:** <count and relevant errors>
**Human verifications:** <count and outcomes>
**Failures:** <count and residual failures>
**Result:** PASS | FAIL | PARTIAL
```
