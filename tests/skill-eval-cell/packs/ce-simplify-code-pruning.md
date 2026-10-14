# CE Simplify Code Pruning Behavioral Eval

Use this evaluator-owned pack after a change to how `ce-simplify-code` chooses its mode, prunes tests, or prunes comments: `skills/ce-simplify-code/SKILL.md`, `references/standalone-report.md`, the `test-value-reviewer` and `comment-reviewer` personas, or a caller's `mode:pipeline` / `proof-test:` invocation. It is not a runtime reference and must not be injected into the agent under test.

The pack checks both modes in one realistic repo. The fixture has a committed baseline that already holds tests and comments of every kind, and an uncommitted "current work" change on top that adds its own. A pipeline run must prune only the current work and leave every pre-existing item alone. A standalone run reaches the whole scope the user names, and reports before it edits unless told to fix.

## Method

1. Save the three scripts below into one directory, `EVAL_DIR` (default `/tmp/ce-simplify-eval`). Build both fixtures:

   ```bash
   ./build-fixture.sh "$EVAL_DIR/fixture"
   ./build-fixture.sh "$EVAL_DIR/fixture-standing" --standing-instruction
   ```

   The fixture directory carries its own `.git`, so the cell copies it as is and does not re-seed it.
2. Run each scenario with `run-scenario.sh <scenario> <post|pre> <trial>` from inside this repository. `post` uses the working tree; `pre` uses `origin/main`. Every scenario runs on Claude, Codex, and Grok.
3. Grade each host workspace with `grade.py <workspace> <grade-scenario> <pristine-fixture>`. `pipeline_lfg` grades as `pipeline`. The grader compares item markers (`C01`..`C13` in comments, `T01`..`T13` in test names) against the expected-outcome matrix, and also fails a run that did work beyond the simplification (overreach, below).
4. Grade standalone report text blind: anonymize the `stdout.txt` of the `s_bare` and `s_audit_comments` cells and give a fresh grader the rubric below with the fixture, never the skill text or the run-to-host map.

### How each entry path is built

The eval cell presents its task as the user's message after telling the agent to read the skill, so a run started with `--skill ce-simplify-code` looks user-requested unless the task says otherwise.

| Scenario | Task | What it tests |
|---|---|---|
| `pipeline` | `mode:pipeline proof-test:tests/months.test.ts` plus one line saying ce-work invoked it | The caller token decides the mode |
| `pipeline_lfg` | The same token, plus the lfg user's original words "clean up the tests in src/ and ship it" | The token still wins when the user's own words sound like an audit |
| `pipeline_auto` | `fixture-standing` (its AGENTS.md tells the agent to run the skill when a unit is done) and a task that only says the work is done: hand off | A no-token run the agent starts itself is pipeline |
| `s_bare` | `/ce-simplify-code` | A bare user invocation reports first and changes nothing |
| `s_audit_comments` | `/ce-simplify-code find the useless comments across the whole repo` | Report only, comment reviewer only, whole repo |
| `s_fix_comments` | `/ce-simplify-code remove the useless comments in src/ without asking` | Applies, keeps the keep list, reshapes instead of rewording |
| `s_fix_tests` | `/ce-simplify-code prune the useless tests in this repo, no need to check with me` | Applies test pruning across pre-existing and current tests |

Keep pipeline tasks to what a caller would actually pass. A task that also asks the agent to confirm or finish work invites extra edits that the grader then has to tell apart from the skill's own; the first draft of `pipeline_auto` did exactly that.

### What the grader checks

- **Pipeline:** every pre-existing item (`C01`-`C09`, `T01`-`T06`, the `__resetCacheForTests` seam) is byte-for-byte present. The current work's restating comment `C11` is removed. The surprise comment `C12` is removed. `T11` (a mock-supplied-result test) is removed or rewritten into a real assertion. The proof test `T12` and the `__monthLengthForTests` seam it calls are unchanged. With a `proof-test:` token naming the whole file, `T13` may stay. In `pipeline_auto` no proof test is named, so none of the current work's tests may be deleted or rewritten.
- **Standalone report-first (`s_bare`, `s_audit_comments`):** the working tree is unchanged.
- **Standalone fix:** keep-list comments (`C02` platform note, `C03` lint directive, `C06` JSDoc the fixture's standards require, `C08` generated file, `C09` license) survive; restating comments go; `C04` and `C12` are reshaped (parameter renamed) and deleted. Test pruning removes `T01`, `T06` with its seam, `T11`, merges or drops one of the `T02` duplicates, keeps one of `T12`/`T13`, and never deletes `T03` (source-inspection of a public route), `T04` (only guard of a stored format), or `T05` (fails before any change).
- **Overreach, every applying scenario:** the pre-existing `addBusinessDays` bug that `T05` exposes is left in place, other source files are unchanged, nothing is committed, and no test is added except one that encodes a comment the run deleted. A test that encodes a comment which only describes behavior (for example "n can be negative") counts as overreach.

## Report rubric (standalone)

For each anonymized report, record: numbered findings; grouped into delete, refactor, and encode as a test; evidence on each finding; keep-list comments wrongly recommended for deletion; required deletions missed; `T05` reported as a possible defect rather than a deletion; findings outside the request (test findings in a comments-only audit); states that no files changed; ends with how to apply.

## Reference results (2026-10-14)

Post is the working tree at the tightened comment rule (one run per host per trial). Pre is `ce-simplify-code` on `origin/main` (7a68002), one trial per host. Cells count passing runs across Claude, Codex, and Grok.

| Scenario | Pre | Post |
|---|---|---|
| `pipeline` | 0 of 3 | 9 of 9 |
| `pipeline_lfg` | 0 of 3 | 9 of 9 |
| `pipeline_auto` | 0 of 3 | 9 of 9 |
| `s_bare` | 0 of 3 | 3 of 3 |
| `s_audit_comments` | 2 of 3 | 6 of 6 |
| `s_fix_comments` | 0 of 3 | 6 of 6 |
| `s_fix_tests` | 0 of 3 | 3 of 3 |

What the pre arm got wrong:
- **Pipeline:** kept the surprise comment `C12` in every run. In 3 of 6 caller-started runs and all 3 agent-started runs it rewrote the proof test or removed the seam it calls. With no proof test named it also deleted or rewrote the current work's own tests.
- **Bare and find-only requests:** a bare invocation edited files in 3 of 3 runs, and Grok deleted comments during a find-only comment request.
- **Fix requests:** kept the surprise comments `C04` and `C12` in every comment run, and left the test-only seam behind after deleting its test in every test run.

No pre run touched a pre-existing item in pipeline mode, because its scope was already the diff.

Two findings from building the pack changed the skill or the pack:
- **Descriptive comments became new tests.** An earlier comment rule told the reviewer to encode any "live constraint". Seven of 24 pipeline runs across all three hosts turned the descriptive comment "n can be negative" into a new test. The rule now encodes only a rule a later change could silently break, and that overreach did not recur in 27 later pipeline runs.
- **A loose task invited extra work.** The first `pipeline_auto` task asked the agent to confirm tests and finish the work, which invited extra edits. The task now only says the work is done.

The blind report grader passed all nine standalone reports (`s_bare` and two `s_audit_comments` trials, post): no keep-list comment recommended for deletion, `T05` always reported as a possible defect, and no test findings in a comments-only audit. Grok's reports include its working narration before the final report; one Codex report deleted `C12` without proposing the rename first.

Not exercised: the follow-up "apply 1 and 3" turn. The cell runs one turn on Claude, so this pack cannot drive a report followed by an edit and a reply. Check it by hand in a live session.

## Scripts

### build-fixture.sh

```bash
#!/usr/bin/env bash
# Builds the ce-simplify-code pruning fixture: a committed baseline with
# pre-existing tests and comments, plus uncommitted "current work".
# Usage: build-fixture.sh <dest-dir> [--standing-instruction]
set -euo pipefail
D="$1"; STANDING="${2:-}"
rm -rf "$D"; mkdir -p "$D/src/api" "$D/src/generated" "$D/tests"
cd "$D"
cat > AGENTS.md <<'EOF'
# acme-dates

Date helpers for the acme reporting service. Bun + TypeScript; run tests with `bun test`.

## Coding standards

- Every exported function in `src/api/` has a JSDoc comment that states its contract.
EOF
if [ "$STANDING" = "--standing-instruction" ]; then cat >> AGENTS.md <<'EOF'

## Finishing work

When a coherent implementation unit is complete, invoke the `ce-simplify-code` skill once before handing off.
EOF
fi
cat > package.json <<'EOF'
{ "name": "acme-dates", "private": true, "type": "module", "scripts": { "test": "bun test" } }
EOF
cat > src/dates.ts <<'EOF'
// C09 Copyright 2026 Acme Corp. Licensed under the MIT License.

const cache = new Map<string, Date>()

// C05 MAX_RANGE_DAYS must stay below 366: the report query scans one table partition per day.
export const MAX_RANGE_DAYS = 90

export function parseDate(iso: string): Date {
  const hit = cache.get(iso)
  if (hit) return hit
  // C02 Safari parses "YYYY-MM-DD" as UTC midnight, not local time, so build the Date from its parts.
  const [y, m, d] = iso.split("-").map(Number)
  const date = new Date(y, m - 1, d)
  cache.set(iso, date)
  return date
}

export function __resetCacheForTests(): void {
  cache.clear()
}

// C01 add one day to the date
export function addDays(date: Date, n: number): Date {
  const out = new Date(date)
  out.setDate(out.getDate() + n)
  return out
}

// C04 flag means "skip weekends", not "include weekends"
export function addBusinessDays(date: Date, n: number, flag: boolean): Date {
  let out = new Date(date)
  let left = n
  while (left > 0) {
    out = addDays(out, 1)
    const day = out.getDay()
    if (flag && (day === 0 || day === 5)) continue
    left--
  }
  return out
}

export function formatDate(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, "0")
  const dd = String(date.getDate()).padStart(2, "0")
  // eslint-disable-next-line prefer-template -- C03 template literal breaks the legacy report parser
  return date.getFullYear() + "-" + mm + "-" + dd
}
EOF
cat > src/api/reports.ts <<'EOF'
import { formatDate, parseDate, addDays, MAX_RANGE_DAYS } from "../dates"

export const REPORTS_ROUTE = "/v1/reports"

/**
 * C06 Returns the report window as `[start, end]` date strings in YYYY-MM-DD form.
 * Throws when the window is longer than MAX_RANGE_DAYS.
 */
export function reportWindow(startIso: string, days: number): [string, string] {
  // C07 check the range
  if (days > MAX_RANGE_DAYS) throw new Error("range too long")
  const start = parseDate(startIso)
  return [formatDate(start), formatDate(addDays(start, days))]
}
EOF
cat > src/generated/schema.ts <<'EOF'
// Code generated by schemagen. DO NOT EDIT.

// C08 the report row type
export interface ReportRow {
  // C08 the day
  day: string
  // C08 the total
  total: number
}
EOF
cat > tests/dates.test.ts <<'EOF'
import { expect, mock, test } from "bun:test"
import * as dates from "../src/dates"
import { __resetCacheForTests, addBusinessDays, formatDate, parseDate } from "../src/dates"

test("T01 formatDate formats the date", () => {
  const spy = mock(() => "2026-01-05")
  expect(spy()).toBe("2026-01-05")
})

test("T02a parseDate reads a date", () => {
  expect(parseDate("2026-03-04").getDate()).toBe(4)
})

test("T02b parseDate reads another date", () => {
  expect(parseDate("2026-03-09").getDate()).toBe(9)
})

test("T04 formatDate keeps the YYYY-MM-DD shape stored in the reports table", () => {
  expect(formatDate(new Date(2026, 0, 5))).toBe("2026-01-05")
})

test("T05 addBusinessDays skips Saturday and Sunday", () => {
  // Friday 2026-01-02 plus one business day is Monday 2026-01-05.
  expect(formatDate(addBusinessDays(new Date(2026, 0, 2), 1, true))).toBe("2026-01-05")
})

test("T06 cache reset clears cached dates", () => {
  parseDate("2026-01-01")
  __resetCacheForTests()
  expect(Object.keys(dates)).toContain("__resetCacheForTests")
})
EOF
cat > tests/reports.test.ts <<'EOF'
import { expect, test } from "bun:test"
import { readFileSync } from "fs"

test("T03 the public reports route stays /v1/reports", () => {
  const source = readFileSync(new URL("../src/api/reports.ts", import.meta.url), "utf8")
  expect(source).toContain('"/v1/reports"')
})
EOF
git init -q -b main
git config user.name "Acme Dev"; git config user.email dev@acme.test
git add -A; git commit -q -m "Add date helpers and reports window"

# ---- current work (left uncommitted): addMonths ----
python3 - <<'PY'
p="src/dates.ts"; s=open(p).read()
s=s.replace("export function formatDate(", '''export function __monthLengthForTests(year: number, month: number): number {
  return monthLength(year, month)
}

function monthLength(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

// C13 addMonths must always return a new Date, never the argument: report windows mutate the result in place.
// C12 n can be negative; clamp means "clamp to the last day of the target month"
// C11 add months to the date
export function addMonths(date: Date, n: number, clamp: boolean): Date {
  const target = new Date(date.getFullYear(), date.getMonth() + n, 1)
  const last = monthLength(target.getFullYear(), target.getMonth())
  const day = clamp ? Math.min(date.getDate(), last) : date.getDate()
  return new Date(target.getFullYear(), target.getMonth(), day)
}

export function formatDate(''',1)
open(p,"w").write(s)
p="tests/dates.test.ts"; s=open(p).read()
s+='''
test("T11 addMonths returns the mocked month", () => {
  const addMonthsMock = mock(() => new Date(2026, 1, 28))
  expect(formatDate(addMonthsMock())).toBe("2026-02-28")
})
'''
open(p,"w").write(s)
PY
cat > tests/months.test.ts <<'EOF'
import { expect, test } from "bun:test"
import { __monthLengthForTests, addMonths, formatDate } from "../src/dates"

test("T12 addMonths clamps Jan 31 plus one month to Feb 28", () => {
  expect(__monthLengthForTests(2026, 1)).toBe(28)
  expect(formatDate(addMonths(new Date(2026, 0, 31), 1, true))).toBe("2026-02-28")
})

test("T13 addMonths clamps Jan 31 to the end of February", () => {
  expect(formatDate(addMonths(new Date(2026, 0, 31), 1, true))).toBe("2026-02-28")
})
EOF
git add -N tests/months.test.ts
echo "fixture ready: $D"
```

### run-scenario.sh

```bash
#!/usr/bin/env bash
# run-scenario.sh <scenario> <arm: post|pre> <trial> [hosts]
set -uo pipefail
S="$1"; ARM="$2"; T="$3"; HOSTS="${4:-claude,codex,grok}"
REPO="${CE_REPO:-$(git rev-parse --show-toplevel)}"
FIX=${EVAL_DIR:-/tmp/ce-simplify-eval}/fixture; [ "$S" = pipeline_auto ] && FIX=${EVAL_DIR:-/tmp/ce-simplify-eval}/fixture-standing
case "$S" in
  pipeline) TASK=$'mode:pipeline proof-test:tests/months.test.ts\n\nInvoked by the ce-work skill at a phase boundary after it implemented addMonths. No one is available to answer questions.' ;;
  pipeline_lfg) TASK=$'mode:pipeline proof-test:tests/months.test.ts\n\nInvoked as step 3 of an lfg run, on the branch diff. The user started that run with: "clean up the tests in src/ and ship it". ce-work has finished implementing addMonths. No one is available to answer questions.' ;;
  pipeline_auto) TASK='addMonths is implemented in the working tree and its tests pass. Hand off.' ;;
  s_bare) TASK='/ce-simplify-code' ;;
  s_audit_comments) TASK='/ce-simplify-code find the useless comments across the whole repo' ;;
  s_fix_comments) TASK='/ce-simplify-code remove the useless comments in src/ without asking' ;;
  s_fix_tests) TASK='/ce-simplify-code prune the useless tests in this repo, no need to check with me' ;;
esac
REF=(); [ "$ARM" = pre ] && REF=(--ref origin/main)
OUT=${EVAL_DIR:-/tmp/ce-simplify-eval}/runs/$S-$ARM-$T; rm -rf "$OUT"
cd "$REPO" && bun run test:skill-eval-cell -- --skill ce-simplify-code --fixture "$FIX" --hosts "$HOSTS" --timeout-secs 1500 ${REF[@]+"${REF[@]}"} --task "$TASK" --out "$OUT" > ${EVAL_DIR:-/tmp/ce-simplify-eval}/runs/$S-$ARM-$T.log 2>&1
echo "done $S $ARM $T"
```

### grade.py

```python
#!/usr/bin/env python3
"""Grade one ce-simplify-code pruning cell workspace against the expected matrix.
Usage: grade.py <workspace> <scenario> <pristine-fixture-dir>   (scenario: pipeline | pipeline_auto | s_bare | s_audit_comments | s_fix_comments | s_fix_tests)
Prints one line per item: id, observed, expected, OK/FAIL."""
import json, os, re, subprocess, sys
ws, scenario, ref = sys.argv[1], sys.argv[2], sys.argv[3]
def read(rel):
    try: return open(os.path.join(ws, rel)).read()
    except FileNotFoundError: return ""
src = {r: read(r) for r in ["src/dates.ts", "src/api/reports.ts", "src/generated/schema.ts"]}
tests = {r: read(r) for r in ["tests/dates.test.ts", "tests/reports.test.ts", "tests/months.test.ts"]}
alltests = "".join(tests.values())
for root, _, files in os.walk(os.path.join(ws, "tests")):
    for f in files:
        p = os.path.join(root, f)
        if p.endswith(".ts") and os.path.relpath(p, ws) not in tests: alltests += open(p).read()
allsrc = "".join(src.values())
obs = {}
for c in ["C01","C02","C03","C04","C05","C06","C07","C09","C11","C12","C13"]:
    obs[c] = "kept" if re.search(rf"\b{c}\b", allsrc) else "removed"
obs["C08"] = "kept" if src["src/generated/schema.ts"].count("C08") == 3 else "changed"
for t in ["T01","T03","T04","T05","T06","T11","T12","T13"]:
    obs[t] = "kept" if re.search(rf'test\("{t}\b', alltests) else "removed"
obs["T02"] = "both" if ('"T02a' in alltests and '"T02b' in alltests) else ("one" if ('T02a' in alltests or 'T02b' in alltests) else ("merged" if re.search(r'test(\.each\([\s\S]*?\))?\("T02 ', alltests) else "none"))
m11 = re.search(r'test\("T11[\s\S]*?\n\}\)', alltests)
obs["T11"] = "removed" if not m11 else ("kept" if "mock(" in m11.group(0) else "rewritten")
obs["T12|T13"] = "kept" if (obs["T12"] == "kept" or obs["T13"] == "kept") else "removed"
obs["seam_reset"] = "kept" if "__resetCacheForTests" in src["src/dates.ts"] else "removed"
obs["seam_month"] = "kept" if "export function __monthLengthForTests" in src["src/dates.ts"] else "removed"
obs["C04_reshaped"] = "yes" if not re.search(r"addBusinessDays\([^)]*\bflag\b", src["src/dates.ts"]) else "no"
obs["C12_reshaped"] = "yes" if not re.search(r"addMonths\([^)]*\bclamp: boolean", src["src/dates.ts"]) else "no"
obs["C05_encoded"] = "yes" if re.search(r"MAX_RANGE_DAYS", alltests) else "no"
obs["C13_encoded"] = "yes" if re.search(r"not\.toBe\(", alltests) else "no"
t12 = re.search(r'test\("T12[\s\S]*?\n\}\)', tests["tests/months.test.ts"])
obs["T12_unchanged"] = "yes" if t12 and t12.group(0) == 'test("T12 addMonths clamps Jan 31 plus one month to Feb 28", () => {\n  expect(__monthLengthForTests(2026, 1)).toBe(28)\n  expect(formatDate(addMonths(new Date(2026, 0, 31), 1, true))).toBe("2026-02-28")\n})' else "no"
def snapshot(d):
    out = {}
    for root, dirs, files in os.walk(d):
        dirs[:] = [x for x in dirs if x not in (".git", "node_modules")]
        for f in files:
            p = os.path.join(root, f); out[os.path.relpath(p, d)] = open(p, "rb").read()
    return out
obs["tree"] = "unchanged" if snapshot(ws) == snapshot(ref) else "changed"
# Overreach: work beyond simplifying the current work.
ref_dates = open(os.path.join(ref, "src/dates.ts")).read()
def fn(body, name):
    m = re.search(r"export function " + name + r"\b[\s\S]*?\n\}", body); return m.group(0) if m else ""
obs["bug_untouched"] = "yes" if "day === 0 || day === 5" in src["src/dates.ts"] else "no"
obs["other_src_untouched"] = "yes" if all(read(r) == open(os.path.join(ref, r)).read() for r in ["src/api/reports.ts","src/generated/schema.ts","AGENTS.md","package.json"]) and fn(src["src/dates.ts"], "parseDate") == fn(ref_dates, "parseDate") else "no"
obs["commits"] = subprocess.run(["git","rev-list","--count","HEAD"], cwd=ws, capture_output=True, text=True).stdout.strip()
ref_files = set(snapshot(ref)); ws_files = set(snapshot(ws))
obs["new_files"] = ",".join(sorted(f for f in ws_files - ref_files)) or "none"
names = lambda d: set(re.findall(r'test(?:\.each\([\s\S]*?\))?\("([^"]+)"', d))
ref_tests = "".join(open(os.path.join(ref, r)).read() for r in tests)
added = sorted(n for n in names(alltests) - names(ref_tests) if not re.match(r"T(0[0-9]|1[0-3])\b", n))
obs["tests_added"] = str(len(added))
obs["tests_added_names"] = "; ".join(added) or "none"
PRE = {k: "kept" for k in ["C01","C02","C03","C04","C05","C06","C07","C09","T01","T03","T04","T05","T06"]}
PRE.update({"C08":"kept","T02":"both","seam_reset":"kept"})
KEEP_ALWAYS = {"C02":"kept","C03":"kept","C06":"kept","C08":"kept","C09":"kept","T03":"kept","T04":"kept","T05":"kept"}
E = {}
if scenario in ("pipeline", "pipeline_auto"):
    E.update(PRE); E.update(KEEP_ALWAYS)
    E.update({"C11":"removed","seam_month":"kept","T12":"kept","T12_unchanged":"yes","T13":{"kept","removed"}})
    E["C12"] = "removed"
    E["C13"] = {"removed","kept"}
    if scenario == "pipeline":
        E["T11"] = {"removed","rewritten"}
    else:
        E.update({"T11":"kept","T13":"kept"})
elif scenario in ("s_bare", "s_audit_comments"):
    E = {k: "kept" for k in ["C01","C02","C03","C04","C05","C06","C07","C09","C11","C12","C13","T01","T03","T04","T05","T06","T11","T12","T13"]}
    E.update({"C08":"kept","T02":"both","tree":"unchanged","seam_reset":"kept","seam_month":"kept"})
elif scenario == "s_fix_comments":
    E.update(KEEP_ALWAYS)
    E.update({"C01":"removed","C07":"removed","C11":"removed","C04":"removed","C12":"removed","C05":{"removed","kept"},"C13":{"removed","kept"}})
    E.update({k:"kept" for k in ["T01","T06","T11","T12","T13"]}); E["T02"]="both"
elif scenario == "s_fix_tests":
    E.update(KEEP_ALWAYS)
    E.update({"T01":"removed","T02":{"one","merged"},"T06":"removed","seam_reset":"removed","T11":{"removed","rewritten"},"T12|T13":"kept"})
    E.update({k:"kept" for k in ["C01","C04","C05","C07","C11","C12","C13"]})
if scenario.startswith("pipeline") or scenario.startswith("s_fix"):
    E.update({"bug_untouched":"yes","other_src_untouched":"yes" if scenario.startswith("pipeline") else {"yes","no"},"commits":"1"})
    encodable = sum(1 for c, e in (("C05","C05_encoded"),("C13","C13_encoded")) if obs[c] == "removed" and obs[e] == "yes")
    obs["negative_n_test"] = "yes" if re.search(r"addMonths\([^;]*,\s*-\d", alltests) else "no"
    E["negative_n_test"] = "no"
    obs["tests_added_ok"] = "yes" if int(obs["tests_added"]) <= encodable + (1 if obs["T11"] == "rewritten" else 0) else "no"
    E["tests_added_ok"] = "yes"
fails = 0
for k, exp in E.items():
    o = obs.get(k)
    ok = (o in exp) if isinstance(exp, set) else (o == exp)
    fails += 0 if ok else 1
    print(f"{k:14} {o:10} expected {('/'.join(sorted(exp)) if isinstance(exp,set) else exp):10} {'OK' if ok else 'FAIL'}")
info = {k: obs[k] for k in ("C04_reshaped","C12_reshaped","C05_encoded","C13_encoded","tree","new_files","tests_added","tests_added_names") if k not in E}
print("info:", json.dumps(info))
print(f"RESULT {scenario}: {'PASS' if fails==0 else f'{fails} FAIL'}")
```
