# Structural Pass

`references/standalone-report.md` says when to read this. It adds evidence and one reviewer to Step 2, and a grouping step between Step 2 and the report.

## Before dispatching

Gather two kinds of evidence for the scope, and keep the output in OS temp:

- **What changes together:** pairs of files that often change in the same commits, especially pairs in different directories.
- **What imports what:** the import graph for the scope, with how often each file changes in that same history.

The bundled script gathers both for JavaScript, TypeScript, and Python. Run it directly from the repository, passing the scope paths; do not read it first:

```
SKILL_DIR="<absolute path of the directory containing the SKILL.md you just read>";
PY="$(for c in python3 python py; do command -v "$c" >/dev/null 2>&1 && "$c" -c '' >/dev/null 2>&1 && { echo "$c"; break; }; done)"; [ -n "$PY" ] || { echo "no working Python 3 interpreter on PATH" >&2; exit 1; };
"$PY" "$SKILL_DIR/scripts/structure-evidence.py" <scope paths>
```

It prints JSON. `imports_not_parsed` counts files in other languages; build their import evidence yourself. If the script fails, gather the evidence with short commands of your own.

When the scope is too large for one reviewer to read in full, also make an outline of it: each file's exports and function signatures, without bodies. Every reviewer gets the outline in place of the full file set, and opens the files it needs.

Dispatch `references/personas/structure-reviewer.md` with the other Step 2 reviewers, in the same way, and pass it the evidence.

## After the reviewers return

Before writing the report, group the findings from every reviewer under the change that removes them. Work out each change as if the system had known today's requirements from the start. One change often removes several findings that look unrelated, and it often looks nothing like any of them. A special case is grouped under a change only when that change makes it unnecessary. A special case the system still needs stays as its own finding.

A grouping is kept only when all three of these hold after its change: pieces that change together end up together, pieces that do not are no longer tied, and dependencies point toward code that changes less. Drop a grouping that fails, and keep its findings as separate findings.

A grouped change still follows Step 3. It must preserve outputs, errors, side effects, and ordering, and it must stay inside the scope. That holds for every exported function and other public interface on its own, not only for the code paths the tests exercise: code you cannot see may call it directly. So a redesign may move logic behind an export, but the export keeps its signature and does what it did before. When it cannot, do not apply it; list it as not applicable. A change that would correct a bug is reported as a possible defect, not applied as a simplification.

Keep the groupings and their reasons in a file in OS temp while you work, so they survive if the context is compacted.

## In the report

In the **Refactor** group, each grouped change gets its own number, with the findings it removes indented beneath it and not numbered. Findings no change removes follow, numbered as usual. Applying a grouped change applies it whole. Changes that are not applicable go last in the group, one line each: the change and why it cannot be applied.

When a grouped change was applied, run the structure reviewer once more on the files it changed. Report what it finds instead of starting another round.
