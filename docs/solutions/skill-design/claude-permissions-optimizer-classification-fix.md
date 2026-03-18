---
title: Classification bugs in claude-permissions-optimizer extract-commands script
category: logic-errors
date: 2026-03-18
severity: high
tags: [security, classification, normalization, permissions, command-extraction, destructive-commands, dcg]
component: claude-permissions-optimizer
symptoms:
  - Dangerous commands (find -delete, git push -f) recommended as safe to auto-allow
  - Safe/common commands (git blame, gh CLI) invisible or misclassified in output
  - 632 commands reported as below-threshold noise due to filtering before normalization
  - git restore -S (safe unstage) incorrectly classified as red (destructive)
---

# Classification Bugs in claude-permissions-optimizer

## Problem

The `extract-commands.mjs` script in the claude-permissions-optimizer skill had three categories of bugs that affected both security and UX of permission recommendations.

**Symptoms observed:** Running the skill across 200 sessions reported 632 commands as "below threshold noise" -- suspiciously high. Cross-referencing against the Destructive Command Guard (DCG) project confirmed classification gaps on both spectrums.

## Root Cause

### 1. Threshold before normalization (architectural ordering)

The min-count filter was applied to each raw command **before** normalization and grouping. Hundreds of variants of the same logical command (e.g., `git log --oneline src/foo.ts`, `git log --oneline src/bar.ts`) were each discarded individually for falling below the threshold of 5, even though their normalized form (`git log *`) had 200+ total uses.

### 2. Normalization broadens classification

Safety classification happened on the **raw** command, but the result was carried forward to the **normalized** pattern. `node --version` (green via `--version$` regex) would normalize to the dangerously broad `node *`, inheriting the green classification despite `node` being a yellow-tier base command.

### 3. Compound command classification leak

Classify ran on the full raw command string, but normalize only used the first command in a compound chain. So `cd /dir && git branch -D feature` was classified as RED (from the `git branch -D` part) but normalized to `cd *`. The red classification from the second command leaked into the first command's pattern, causing `cd *` to appear in the blocked list.

### 4. Global risk flags causing false fragmentation

Risk flags (`-f`, `-v`) were preserved globally during normalization to keep dangerous variants separate. But `-f` means "force" in `git push -f` and "pattern file" in `grep -f`, while `-v` means "remove volumes" in `docker-compose down -v` and "verbose/invert" everywhere else. Global preservation fragmented green patterns unnecessarily (`grep -v *` separate from `grep *`) and contaminated benign patterns with wrong risk reasons.

### 5. Allowlist glob broader than classification intent

Commands with mode-switching flags (`sed -i`, `find -delete`, `ast-grep --rewrite`) were classified green without the flag but normalized to a broad pattern like `sed *`. The resulting allowlist rule `Bash(sed *)` would auto-allow the destructive form too, since Claude Code's glob matching treats `*` as matching everything. The classification was correct for the individual command but the recommended pattern was unsafe.

### 6. Classification gaps (found via DCG cross-reference)

**Security bugs (dangerous classified as green):**
- `find` unconditionally in `GREEN_BASES` -- `find -delete` and `find -exec rm` passed as safe
- `git push -f` regex required `-f` after other args, missed `-f` immediately after `push`
- `git restore -S` falsely red (lookahead only checked `--staged`, not the `-S` alias)
- `git clean -fd` regex required `f` at end of flag group, missed `-fd` (f then d)
- `git checkout HEAD -- file` pattern didn't allow a ref between `checkout` and `--`
- `git branch --force` not caught alongside `-D`
- Missing RED patterns: `npm unpublish`, `cargo yank`, `dd of=`, `mkfs`, `pip uninstall`, `apt remove/purge`, `brew uninstall`, `git reset --merge`

**UX bugs (safe commands misclassified):**
- `git blame`, `git shortlog` -> unknown (missing from GREEN_COMPOUND)
- `git tag -l`, `git stash list/show` -> yellow instead of green
- `git clone` -> unknown (not in any YELLOW pattern)
- All `gh` CLI commands -> unknown (no patterns at all)
- `git restore --staged/-S` -> red instead of yellow

## Solution

### Fix 1: Reorder the pipeline

Normalize and group commands first, then apply the min-count threshold to the grouped totals:

```javascript
// Group ALL non-allowed commands by normalized pattern first
for (const [command, data] of commands) {
  if (isAllowed(command)) { alreadyCovered++; continue; }
  const pattern = "Bash(" + normalize(command) + ")";
  // ... group by pattern, merge sessions, escalate tiers
}

// THEN filter by min-count on GROUPED totals
for (const [pattern, data] of patternGroups) {
  if (data.totalCount < minCount) {
    belowThreshold += data.rawCommands.length;
    patternGroups.delete(pattern);
  }
}
```

### Fix 2: Post-grouping safety reclassification

After grouping, re-classify the normalized pattern itself. If the broader form maps to a more restrictive tier, escalate:

```javascript
for (const [pattern, data] of patternGroups) {
  if (data.tier !== "green") continue;
  if (!pattern.includes("*")) continue;
  const cmd = pattern.replace(/^Bash\(|\)$/g, "");
  const { tier, reason } = classify(cmd);
  if (tier === "red") { data.tier = "red"; data.reason = reason; }
  else if (tier === "yellow") { data.tier = "yellow"; }
  else if (tier === "unknown") { data.tier = "unknown"; }
}
```

### Fix 3: Classify must match normalize's scope

Classify now extracts the first command from compound chains (`&&`, `||`, `;`) and pipe chains before checking patterns, matching what normalize does. Pipe-to-shell (`| bash`) is excluded from stripping since the pipe itself is the danger.

```javascript
function classify(command) {
  const compoundMatch = command.match(/^(.+?)\s*(&&|\|\||;)\s*(.+)$/);
  if (compoundMatch) return classify(compoundMatch[1].trim());
  const pipeMatch = command.match(/^(.+?)\s*\|\s*(.+)$/);
  if (pipeMatch && !/\|\s*(sh|bash|zsh)\b/.test(command)) {
    return classify(pipeMatch[1].trim());
  }
  // ... RED/GREEN/YELLOW checks on the first command only
}
```

### Fix 4: Context-specific risk flags

Replaced global `-f`/`-v` risk flags with a contextual system. Flags are only preserved during normalization when they're risky for the specific base command:

```javascript
const CONTEXTUAL_RISK_FLAGS = {
  "-f": new Set(["git", "docker", "rm"]),
  "-v": new Set(["docker", "docker-compose"]),
};

function isRiskFlag(token, base) {
  if (GLOBAL_RISK_FLAGS.has(token)) return true;
  const contexts = CONTEXTUAL_RISK_FLAGS[token];
  if (contexts && base && contexts.has(base)) return true;
  // ...
}
```

Risk flags are a **presentation improvement**, not a safety mechanism. Classification + tier escalation handles safety regardless. The contextual approach prevents fragmentation of green patterns (`grep -v *` merges with `grep *`) while keeping dangerous variants visible in the blocked table (`git push -f *` stays separate from `git push *`).

Commands with mode-switching flags (`sed -i`, `ast-grep --rewrite`) are handled via dedicated normalization rules rather than risk flags, since their safe and dangerous forms need entirely different classification.

### Fix 5: Mode-preserving normalization

Commands with mode-switching flags get dedicated normalization rules that preserve the safe/dangerous mode flag, producing narrow patterns safe to recommend:

```javascript
// sed: preserve the mode flag
if (/^sed\s/.test(command)) {
  if (/\s-i\b/.test(command)) return "sed -i *";
  const sedFlag = command.match(/^sed\s+(-[a-zA-Z])\s/);
  return sedFlag ? "sed " + sedFlag[1] + " *" : "sed *";
}

// find: preserve the predicate/action flag
if (/^find\s/.test(command)) {
  if (/\s-delete\b/.test(command)) return "find -delete *";
  if (/\s-exec\s/.test(command)) return "find -exec *";
  const findFlag = command.match(/\s(-(?:name|type|path|iname))\s/);
  return findFlag ? "find " + findFlag[1] + " *" : "find *";
}
```

GREEN_COMPOUND then matches the narrow normalized forms:

```javascript
/^sed\s+-(?!i\b)[a-zA-Z]\s/   // sed -n *, sed -e * (not sed -i *)
/^find\s+-(?:name|type|path|iname)\s/  // find -name *, find -type *
/^(ast-grep|sg)\b(?!.*--rewrite)/      // ast-grep * (not ast-grep --rewrite *)
```

Bare forms without a mode flag (`sed *`, `find *`) fall to yellow/unknown since `Bash(sed *)` would match the destructive variant.

### Fix 6: Patch classification gaps

Key regex fixes:

```javascript
// find: removed from GREEN_BASES; destructive forms caught by RED
{ test: /\bfind\b.*\s-delete\b/, reason: "find -delete permanently removes files" },
{ test: /\bfind\b.*\s-exec\s+rm\b/, reason: "find -exec rm permanently removes files" },
// Safe find via GREEN_COMPOUND:
/^find\b(?!.*(-delete|-exec))/

// git push -f: catch -f in any position
{ test: /git\s+(?:\S+\s+)*push\s+.*-f\b/ },
{ test: /git\s+(?:\S+\s+)*push\s+-f\b/ },

// git restore: exclude both --staged and -S from red
{ test: /git\s+restore\s+(?!.*(-S\b|--staged\b))/ },
// And add yellow pattern for the safe form:
/^git\s+restore\s+.*(-S\b|--staged\b)/

// git clean: match f anywhere in combined flags
{ test: /git\s+clean\s+.*(-[a-z]*f[a-z]*\b|--force\b)/ },

// git branch: catch both -D and --force
{ test: /git\s+branch\s+.*(-D\b|--force\b)/ },
```

New GREEN_COMPOUND patterns for safe commands:

```javascript
/^git\s+(status|log|diff|show|blame|shortlog|...)\b/  // added blame, shortlog
/^git\s+tag\s+(-l\b|--list\b)/                         // tag listing
/^git\s+stash\s+(list|show)\b/                          // stash read-only
/^gh\s+(pr|issue|run)\s+(view|list|status|diff|checks)\b/  // gh read-only
/^gh\s+repo\s+(view|list|clone)\b/
/^gh\s+api\b/
```

New YELLOW_COMPOUND patterns:

```javascript
/^git\s+(...|clone)\b/           // added clone
/^gh\s+(pr|issue)\s+(create|edit|comment|close|reopen|merge)\b/  // gh write ops
```

## Verification

- Built a test suite of 70+ commands across both spectrums (dangerous and safe)
- Cross-referenced against DCG rule packs: core/git, core/filesystem, package_managers
- Final result: 0 dangerous commands classified as green, 0 safe commands misclassified
- Repo test suite: 344 tests pass

## Prevention Strategies

### Pipeline ordering is an architectural invariant

The correct pipeline order is:

```
filter(allowlist) -> normalize -> group -> threshold -> re-classify(normalized) -> output
```

The post-grouping safety check that re-classifies normalized patterns containing wildcards is load-bearing. It must never be removed or moved before the grouping step.

### The allowlist pattern is the product, not the classification

The skill's output is an allowlist glob like `Bash(sed *)`, not a safety tier. Classification determines whether to recommend a pattern, but the pattern itself must be safe to auto-allow. This creates a critical constraint: **commands with mode-switching flags that change safety profile need normalization that preserves the safe mode flag**, so the resulting glob can't match the destructive form.

Example: `sed -n 's/foo/bar/' file` is read-only and safe. But normalizing it to `sed *` produces `Bash(sed *)` which also matches `sed -i 's/foo/bar/' file` (destructive in-place edit). The fix is mode-preserving normalization: `sed -n *` produces `Bash(sed -n *)` which is narrow enough to be safe.

This applies to any command where a flag changes the safety profile:
- `sed -n *` (green) vs `sed -i *` (red) -- `-n` is read-only, `-i` edits in place
- `find -name *` (green) vs `find -delete *` (red) -- `-name` is a predicate, `-delete` removes files
- `ast-grep *` (green) vs `ast-grep --rewrite *` (red) -- default is search, `--rewrite` modifies files

Commands like these should NOT go in `GREEN_BASES` (which produces the blanket `X *` pattern). They need dedicated normalization rules that preserve the mode flag, and `GREEN_COMPOUND` patterns that match the narrower normalized form.

### GREEN_BASES requires proof of no destructive subcommands

Before adding any command to `GREEN_BASES`, verify it has NO destructive flags or modes. If in doubt, use `GREEN_COMPOUND` with explicit negative lookaheads. Commands that should never be in `GREEN_BASES`: `find`, `xargs`, `sed`, `awk`, `curl`, `wget`.

### Regex negative lookaheads must enumerate ALL flag aliases

Every flag exclusion must cover both long and short forms. For git, consult `git <subcmd> --help` for every alias. Example: `(?!.*(-S\b|--staged\b))` not just `(?!.*--staged\b)`.

### Classify and normalize must operate on the same scope

If normalize extracts the first command from compound chains, classify must do the same. Otherwise a dangerous second command (`git branch -D`) contaminates the first command's pattern (`cd *`). Any future change to normalize's scoping logic must be mirrored in classify.

### Risk flags are contextual, not global

Short flags like `-f` and `-v` mean different things for different commands. Adding a short flag to `GLOBAL_RISK_FLAGS` will fragment every green command that uses it innocently. Use `CONTEXTUAL_RISK_FLAGS` with explicit base-command sets instead. For commands where a flag completely changes the safety profile (`sed -i`, `ast-grep --rewrite`), use a dedicated normalization rule rather than a risk flag.

### GREEN_BASES must exclude commands useless as allowlist rules

Commands like `cd` and `cal` are technically safe but useless as standalone allowlist rules in agent contexts (shell state doesn't persist, novelty commands never used). Including them creates noise in recommendations. Before adding to GREEN_BASES, ask: would a user actually benefit from `Bash(X *)` in their allowlist?

### RISK_FLAGS must stay synchronized with RED_PATTERNS

Every flag in a `RED_PATTERNS` regex must have a corresponding entry in `GLOBAL_RISK_FLAGS` or `CONTEXTUAL_RISK_FLAGS` so normalization preserves it.

## External References

### Destructive Command Guard (DCG)

**Repository:** https://github.com/Dicklesworthstone/destructive_command_guard

DCG is a Rust-based security hook with 49+ modular security packs that classify destructive commands. Its pack-based architecture maps well to the classifier's rule sections:

| DCG Pack | Classifier Section |
|---|---|
| `core/filesystem` | RED_PATTERNS (rm, find -delete, chmod, chown) |
| `core/git` | RED_PATTERNS (force push, reset --hard, clean -f, filter-branch) |
| `strict_git` | Additional git patterns (rebase, amend, worktree remove) |
| `package_managers` | RED_PATTERNS (publish, unpublish, uninstall) |
| `system` | RED_PATTERNS (sudo, reboot, kill -9, dd, mkfs) |
| `containers` | RED_PATTERNS (--privileged, system prune, volume rm) |

DCG's rule packs are a goldmine for validating classifier completeness. When adding new command categories or modifying rules, cross-reference the corresponding DCG pack. Key packs not yet fully cross-referenced: `database`, `kubernetes`, `cloud`, `infrastructure`, `secrets`.

DCG also demonstrates smart detection patterns worth studying:
- Scans heredocs and inline scripts (`python -c`, `bash -c`)
- Context-aware (won't block `grep "rm -rf"` in string literals)
- Explicit safe-listing of temp directory operations (`rm -rf /tmp/*`)

## Related Documentation

- [Script-first skill architecture](./script-first-skill-architecture.md) -- documents the architectural pattern used by this skill; the classification bugs highlight edge cases in the script-first approach
- [Compound refresh skill improvements](./compound-refresh-skill-improvements.md) -- related skill maintenance patterns

## Testing Recommendations

Future work should add a dedicated classification test suite covering:

1. **Red boundary tests:** Every RED_PATTERNS entry with positive match AND safe variant
2. **Green boundary tests:** Every GREEN_BASES/COMPOUND with destructive flag variants
3. **Normalization safety tests:** Verify that `classify(normalize(cmd))` never returns a lower tier than `classify(cmd)`
4. **DCG cross-reference tests:** Data-driven test with one entry per DCG pack rule, asserting never-green
5. **Broadening audit:** For each green rule, generate variants with destructive flags and assert they are NOT green
6. **Compound command tests:** Verify that `cd /dir && git branch -D feat` classifies as green (cd), not red
7. **Contextual flag tests:** Verify `grep -v pattern` normalizes to `grep *` (not `grep -v *`), while `docker-compose down -v` preserves `-v`
8. **Allowlist safety tests:** For every green pattern containing `*`, verify that the glob cannot match a known destructive variant (e.g., `Bash(sed -n *)` must not match `sed -i`)
