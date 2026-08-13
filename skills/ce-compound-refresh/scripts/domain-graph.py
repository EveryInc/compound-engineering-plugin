"""Read-only resolver for the progressive domain-vocabulary protocol.

The script owns the *mechanical* half of the protocol: locating vocabulary
files, parsing the canonical index grammar, enumerating glossary paths,
validating the graph and its links, detecting duplicates and the two blocked
states, and proposing a deterministic migration mapping. It never makes a
semantic judgment (which context owns a term, polyseme versus sloppy synonym,
Shared Kernel promotion) and it never writes a repository file.

Invocation
----------
Standard library only, Python 3. The file carries no shebang and needs no
executable bit: callers resolve a working interpreter by probing execution and
invoke ``"$PY" domain-graph.py <subcommand> ...``. A script that needs its own
directory derives it from ``__file__``; nothing here reads an environment
variable for a path.

    domain-graph.py inventory       [--repo-root DIR] [--docs-root REL]
    domain-graph.py validate        [--repo-root DIR] [--docs-root REL] [--mapping FILE]
    domain-graph.py plan-migration  [--repo-root DIR] [--docs-root REL]

All three subcommands are read-only and emit one JSON document to stdout.
Output is deterministic: stable key order, stable list ordering, so repeated
runs over an unchanged tree are byte-identical.

Exit status
-----------
    0  the subcommand succeeded; for ``validate``, no findings were produced
    1  ``validate`` completed and produced at least one finding
    2  usage or argument error (an error document is written to stderr)

Any other subcommand exits 0 on success regardless of what it discovered:
findings are ``validate``'s vocabulary, not a general error channel.

Canonical index grammar (R21)
-----------------------------
The root ``CONCEPTS.md`` is an *index* when, and only when, it contains a
level-2 heading ``## Contexts`` whose body parses exactly as described below.
A ``## Contexts`` section that does not parse is a COLLISION, not an index:
consumers treat the root as a flat glossary and surface the collision instead
of reinterpreting the file.

The section body runs from the ``## Contexts`` heading to the next level-1 or
level-2 heading (or end of file) and contains, in this order:

  1. One or more CONTEXT ENTRY lines, each exactly::

         - [<Context Name>](<repo-relative link>) <sep> <ownership sentence>

     ``<sep>`` is ``--`` or an em dash, surrounded by single spaces.
     ``<Context Name>`` is non-empty and contains none of ``[]()``.
     ``<repo-relative link>`` is non-empty and contains no whitespace.
     ``<ownership sentence>`` is non-empty: one line stating what the context
     owns.

  2. Optionally, in either order and at most once each, these subsections::

         ### Relations

         - <Source Context> -> <Target Context>: <relation description>

         ### Shared vocabulary

         - **<Term>** <sep> <definition>

     Relation entries use the ASCII arrow ``->``. A relation naming a context
     the index does not declare is reported as ``relation-dangling-context``;
     it is a finding, not a collision.

Blank lines are allowed anywhere in the section. Any other content — prose, a
heading other than the two subsections, a bullet that does not match the shape
required at its position, a context entry after a subsection has started — is
a collision.

Context glossaries live at ``<docs-root>/contexts/<context-slug>/CONCEPTS.md``.
``<docs-root>`` defaults to ``docs`` and is supplied by the calling skill via
``--docs-root``; an absolute or ``..``-containing value is rejected at argument
parsing. A context slug matches ``^[a-z0-9]+(-[a-z0-9]+)*$``. Slugification
lowercases the name and turns runs of spaces and underscores into single
hyphens; a name that does not reach the allowlist that way (``Billing/Payments``,
``..``, ``Retail & Wholesale``) is never composed into a path.

Term, alias, and invariant extraction
-------------------------------------
A TERM DEFINITION is either

  * a heading of level 3 or deeper whose text is not a reserved section name
    and which is followed, before the next heading, by at least one non-blank
    line; or
  * a definition bullet ``- **<Term>** <sep> <definition>`` or
    ``- **<Term>**: <definition>``; or
  * a bold-term line ``**<Term>** (<qualifier>):`` at the start of a line —
    either ending the line (the definition is the following body, the shape
    legacy Pocock-convention glossaries use) or followed inline by the
    definition. The qualifier parenthetical is optional and is not part of
    the term.

Reserved section names (case-insensitive) are: contexts, relations,
relationships, shared vocabulary, flagged ambiguities, invariants, aliases,
glossary, terms, notes, overview, table of contents, context map.

Inside a term body:

  * an ALIAS line reads ``Avoid: a, b`` or ``Aliases: a, b`` (surrounding
    ``*`` or ``_`` emphasis is ignored);
  * an INVARIANT line reads ``Invariant: <statement>`` (optionally as a
    bullet, emphasis ignored).

Content inside fenced code blocks is never parsed as structure. The root's
``## Contexts`` section is excluded from root term extraction, so the index's
own ``Shared vocabulary`` entries are reported separately and do not make the
root vocabulary-bearing.

Legacy import grammar (import-only)
-----------------------------------
``CONTEXT-MAP.md`` and ``CONTEXT.md`` belong to a different tool's convention
and are read only as migration inputs.

``CONTEXT.md`` is a legacy context glossary parsed with the term rules above.
Its context name is the file's level-1 title when present, otherwise its parent
directory name.

``CONTEXT-MAP.md`` is a map, not a glossary. A heading of level 2 or 3 whose
text is not a reserved section name declares a legacy context; the field lines
under it are::

    Glossary: <repo-relative path>
    Terms: <term>, <term>, ...

Relation bullets ``- <Source> -> <Target>: <description>`` are read anywhere in
the file. A map declaration that links a glossary names that glossary's
context. A map file is vocabulary-bearing only through its ``Terms:`` lines.

A legacy file is VOCABULARY-BEARING when extraction yields at least one term
definition from it. An empty scaffold, a headings-only file, and an unrelated
project-notes file with the same name are not vocabulary-bearing, and neither
raises a blocked state.

Sibling domain-truth files
--------------------------
A ``DOMAIN.md`` sitting beside a glossary — at the repo root beside
``CONCEPTS.md``, or at ``<docs-root>/contexts/<slug>/DOMAIN.md`` beside that
context's glossary — is a project-convention business-truth file, not a
vocabulary authority, and never raises a blocked state. It is inventoried,
and two findings police its boundary:

  * headings inside it are rule anchors, never term definitions;
  * a definition bullet or a bold-term line inside it IS a term definition
    and is reported as ``domain-defines-terms`` — definitions belong to the
    owning glossary;
  * a canonical-location ``DOMAIN.md`` whose sibling glossary is missing is
    reported as ``domain-orphan``.

A ``DOMAIN.md`` anywhere else in the repository is an ordinary project file
and is ignored.

A sibling ``DOMAIN.md`` may open with a VERIFICATION STAMP: YAML frontmatter
whose recognized keys are ``verified_against`` (a full 40-hex commit) and
``last_verified`` (``YYYY-MM-DD``). The stamp records the commit a grounding
pass verified the rules against. Being unstamped is legal and is not a
finding. The frontmatter block is excluded from term-definition scanning.
When the repo root is itself a git toplevel, the stamp commit is resolved
and the inventory reports how many commits ``HEAD`` is ahead of it; without
git — or when the tree merely sits inside some other repository — the
verification fields degrade to null. Staleness thresholds are the auditing
skill's judgment — the script only reports the distance.

Blocked states
--------------
With at least one vocabulary-bearing legacy file present:

    dual-canonical            the root ``CONCEPTS.md`` also carries term
                              definitions outside its index section
    legacy-coexistence-pending the root is a parseable index carrying no term
                              definitions of its own — the migration ran and
                              only the confirmed deletion is outstanding
    legacy-only               no root ``CONCEPTS.md`` carries vocabulary

Finding codes emitted by ``validate``
-------------------------------------
    index-collision              ``## Contexts`` present but not the grammar above
    index-duplicate-context      the same context name or slug declared twice
    index-context-slug-invalid   a declared context name cannot be slugified
    index-link-absolute          a context link is an absolute path
    index-link-traversal         a context link contains a ``..`` segment
    index-link-symlink-escape    a context link resolves outside the repository
    index-link-missing           a context link names no existing file
    relation-dangling-context    a relation names an undeclared context
    duplicate-term-in-context    one glossary defines the same term twice
    legacy-dual-canonical        blocked state (above)
    legacy-coexistence-pending   blocked state (above)
    legacy-only                  blocked state (above)
    legacy-reference-pending     a repository file still references a legacy file
    invariant-dropped            a supplied mapping loses an extracted invariant
    domain-defines-terms         a sibling DOMAIN.md carries a term definition
    domain-orphan                a canonical DOMAIN.md has no sibling glossary
    domain-stamp-malformed       a verification stamp key has an invalid value
    domain-stamp-unresolvable    verified_against names no commit in this repo

Polysemy across contexts is legal and is never a finding: the same term may
carry different definitions in two context glossaries.
"""

import argparse
import json
import os
import re
import subprocess
import sys

SCHEMA_INVENTORY = "ce.domain-graph.inventory/v1"
SCHEMA_VALIDATE = "ce.domain-graph.validate/v1"
SCHEMA_PLAN = "ce.domain-graph.plan-migration/v1"
SCHEMA_ERROR = "ce.domain-graph.error/v1"

ROOT_GLOSSARY = "CONCEPTS.md"
LEGACY_MAP_NAME = "CONTEXT-MAP.md"
LEGACY_GLOSSARY_NAME = "CONTEXT.md"
LEGACY_NAMES = (LEGACY_MAP_NAME, LEGACY_GLOSSARY_NAME)
DOMAIN_TRUTH_NAME = "DOMAIN.md"

SKIP_DIRS = frozenset({
    ".git", ".hg", ".svn", "node_modules", ".venv", "venv", "__pycache__",
    "dist", "build", ".next", ".cache", ".turbo", "target", "vendor",
})

TEXT_EXTENSIONS = frozenset({
    ".md", ".mdx", ".markdown", ".txt", ".rst", ".yaml", ".yml", ".json",
    ".toml", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".sh",
})

RESERVED_SECTIONS = frozenset({
    "contexts", "relations", "relationships", "shared vocabulary",
    "flagged ambiguities", "invariants", "aliases", "glossary", "terms",
    "notes", "overview", "table of contents", "context map",
})

SLUG_PATTERN = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
HEADING_PATTERN = re.compile(r"^(#{1,6})\s+(.*?)\s*#*\s*$")
FENCE_PATTERN = re.compile(r"^\s*(```|~~~)")
SEPARATOR = r"(?:--|—)"
ENTRY_PATTERN = re.compile(r"^- \[([^\[\]()]+)\]\((\S+)\)\s+" + SEPARATOR + r"\s+(.+?)\s*$")
RELATION_PATTERN = re.compile(r"^- (.+?)\s+->\s+(.+?):\s*(.+?)\s*$")
# Term captures use [^*] so a bullet carrying several bold spans (a rule like
# "- **X** applies when **Y**: ...") is never lazily re-bracketed into a fake
# term spanning the whole line; only a separator directly after the closing
# ** makes a definition.
SHARED_PATTERN = re.compile(r"^- \*\*([^*]+?)\*\*\s*(?:" + SEPARATOR + r"|:)\s+(.+?)\s*$")
DEFINITION_BULLET_PATTERN = re.compile(r"^\s*[-*]\s+\*\*([^*]+?)\*\*\s*(?:" + SEPARATOR + r"|:)\s+(.+?)\s*$")
BOLD_TERM_OPENER_PATTERN = re.compile(r"^\*\*([^*]+?)\*\*\s*(?:\([^)]*\))?\s*:\s*$")
BOLD_TERM_INLINE_PATTERN = re.compile(
    r"^\*\*([^*]+?)\*\*\s*(?:\([^)]*\))?\s*(?:" + SEPARATOR + r"|:)\s+(\S.*?)\s*$"
)
ALIAS_PATTERN = re.compile(r"^[_*]*(?:avoid|aliases)[_*]*\s*:\s*(.+)$", re.IGNORECASE)
INVARIANT_PATTERN = re.compile(r"^[_*]*invariant[_*]*\s*:\s*(.+)$", re.IGNORECASE)
FIELD_PATTERN = re.compile(r"^(glossary|terms)\s*:\s*(.+?)\s*$", re.IGNORECASE)


class UsageError(Exception):
    """An argument or environment problem the caller must fix."""

    def __init__(self, code, message):
        super().__init__(message)
        self.code = code
        self.message = message


# ---------------------------------------------------------------------------
# Markdown scanning primitives
# ---------------------------------------------------------------------------

def read_text(path):
    with open(path, "r", encoding="utf-8", errors="replace") as handle:
        return handle.read()


def scan_lines(text):
    """Yield (line_number, line, in_fence) with fenced code blocks marked."""
    in_fence = False
    fence_token = None
    for index, raw in enumerate(text.splitlines(), start=1):
        line = raw.rstrip("\r")
        fence = FENCE_PATTERN.match(line)
        if fence:
            token = fence.group(1)
            if not in_fence:
                in_fence = True
                fence_token = token
                yield index, line, True
                continue
            if token == fence_token:
                in_fence = False
                fence_token = None
                yield index, line, True
                continue
        yield index, line, in_fence


def heading_at(line, in_fence):
    if in_fence:
        return None
    match = HEADING_PATTERN.match(line)
    if not match:
        return None
    return len(match.group(1)), match.group(2).strip()


def strip_emphasis(line):
    return line.replace("*", "").replace("`", "").strip()


def split_list(value):
    return [item.strip() for item in value.split(",") if item.strip()]


def slugify(name):
    """Return the context slug for ``name``, or None when it is not reachable."""
    candidate = re.sub(r"[\s_]+", "-", name.strip().lower())
    if not candidate or not SLUG_PATTERN.match(candidate):
        return None
    return candidate


def to_posix(relative_path):
    return relative_path.replace(os.sep, "/")


# ---------------------------------------------------------------------------
# Index parsing
# ---------------------------------------------------------------------------

def find_contexts_section(text):
    """Return (present, body_lines, start_line, end_line) for ``## Contexts``."""
    lines = list(scan_lines(text))
    start = None
    for position, (number, line, in_fence) in enumerate(lines):
        heading = heading_at(line, in_fence)
        if heading and heading[0] == 2 and heading[1].strip().lower() == "contexts":
            start = position
            break
    if start is None:
        return False, [], 0, 0
    body = []
    end_line = lines[-1][0] if lines else lines[start][0]
    for number, line, in_fence in lines[start + 1:]:
        heading = heading_at(line, in_fence)
        if heading and heading[0] <= 2:
            end_line = number - 1
            break
        body.append((number, line, in_fence))
    else:
        end_line = lines[-1][0] if lines else lines[start][0]
    return True, body, lines[start][0], end_line


def parse_index(text):
    """Parse the ``## Contexts`` section.

    Returns (present, index_or_None, span). ``index_or_None`` is None when the
    section is present but does not parse as the canonical grammar — a
    collision.
    """
    present, body, start_line, end_line = find_contexts_section(text)
    span = (start_line, end_line)
    if not present:
        return False, None, span

    contexts = []
    relations = []
    shared = []
    state = "entries"
    seen_subsections = set()

    for number, line, in_fence in body:
        if not line.strip():
            continue
        if in_fence:
            return True, None, span
        heading = heading_at(line, in_fence)
        if heading:
            level, title = heading
            key = title.strip().lower()
            if level != 3 or key not in ("relations", "shared vocabulary"):
                return True, None, span
            if key in seen_subsections:
                return True, None, span
            seen_subsections.add(key)
            state = "relations" if key == "relations" else "shared"
            continue
        if state == "entries":
            match = ENTRY_PATTERN.match(line)
            if not match:
                return True, None, span
            contexts.append({
                "name": match.group(1).strip(),
                "link": match.group(2).strip(),
                "ownership": match.group(3).strip(),
                "line": number,
            })
            continue
        if state == "relations":
            match = RELATION_PATTERN.match(line)
            if not match:
                return True, None, span
            relations.append({
                "from": match.group(1).strip(),
                "to": match.group(2).strip(),
                "description": match.group(3).strip(),
                "line": number,
            })
            continue
        match = SHARED_PATTERN.match(line)
        if not match:
            return True, None, span
        shared.append({
            "term": match.group(1).strip(),
            "definition": match.group(2).strip(),
            "line": number,
        })

    if not contexts:
        return True, None, span
    return True, {"contexts": contexts, "relations": relations, "shared": shared}, span


# ---------------------------------------------------------------------------
# Term extraction
# ---------------------------------------------------------------------------

def extract_terms(text, source, skip_span=None):
    """Extract term definitions from a glossary-shaped Markdown document."""
    terms = []
    current = None
    lines = list(scan_lines(text))

    def close(entry):
        if entry is None:
            return
        if entry["definition"]:
            entry.pop("_open", None)
            terms.append(entry)

    for number, line, in_fence in lines:
        if skip_span and skip_span[0] <= number <= skip_span[1]:
            continue
        heading = heading_at(line, in_fence)
        if heading:
            close(current)
            current = None
            level, title = heading
            if level >= 3 and title.strip().lower() not in RESERVED_SECTIONS and title.strip():
                current = {
                    "term": title.strip(),
                    "definition": "",
                    "aliases": [],
                    "invariants": [],
                    "source": source,
                    "line": number,
                }
            continue
        if in_fence or not line.strip():
            continue
        bullet = DEFINITION_BULLET_PATTERN.match(line)
        if bullet and bullet.group(1).strip().lower() not in RESERVED_SECTIONS:
            close(current)
            current = None
            terms.append({
                "term": bullet.group(1).strip(),
                "definition": bullet.group(2).strip(),
                "aliases": [],
                "invariants": [],
                "source": source,
                "line": number,
            })
            continue
        opener = BOLD_TERM_OPENER_PATTERN.match(line)
        if opener and opener.group(1).strip().lower() not in RESERVED_SECTIONS:
            close(current)
            current = {
                "term": opener.group(1).strip(),
                "definition": "",
                "aliases": [],
                "invariants": [],
                "source": source,
                "line": number,
            }
            continue
        inline = BOLD_TERM_INLINE_PATTERN.match(line)
        if inline and inline.group(1).strip().lower() not in RESERVED_SECTIONS:
            close(current)
            current = None
            terms.append({
                "term": inline.group(1).strip(),
                "definition": inline.group(2).strip(),
                "aliases": [],
                "invariants": [],
                "source": source,
                "line": number,
            })
            continue
        if current is None:
            continue
        plain = strip_emphasis(line.lstrip("-* \t"))
        alias = ALIAS_PATTERN.match(plain)
        if alias:
            current["aliases"].extend(split_list(alias.group(1)))
            continue
        invariant = INVARIANT_PATTERN.match(plain)
        if invariant:
            current["invariants"].append(invariant.group(1).strip())
            continue
        if not current["definition"]:
            current["definition"] = strip_emphasis(line)

    close(current)
    terms.sort(key=lambda entry: (entry["line"], entry["term"]))
    return terms


# ---------------------------------------------------------------------------
# Repository scanning
# ---------------------------------------------------------------------------

def walk_files(repo_root):
    """Yield repo-relative POSIX paths of regular files, symlinks excluded."""
    collected = []
    for directory, subdirectories, files in os.walk(repo_root, followlinks=False):
        subdirectories[:] = sorted(
            name for name in subdirectories
            if name not in SKIP_DIRS and not os.path.islink(os.path.join(directory, name))
        )
        for name in sorted(files):
            absolute = os.path.join(directory, name)
            if os.path.islink(absolute):
                continue
            collected.append(to_posix(os.path.relpath(absolute, repo_root)))
    collected.sort()
    return collected


def link_safety(repo_root, link):
    """Classify a context link: returns (code_or_None, resolved_relative_path)."""
    if not link:
        return "index-link-missing", None
    normalized = link.replace("\\", "/")
    if normalized.startswith("/") or re.match(r"^[A-Za-z]:[\\/]", link):
        return "index-link-absolute", None
    if any(segment == ".." for segment in normalized.split("/")):
        return "index-link-traversal", None

    repo_real = os.path.realpath(repo_root)
    absolute = os.path.join(repo_root, *[segment for segment in normalized.split("/") if segment not in ("", ".")])
    # lstat every prefix before trusting existence: a symlink component whose
    # realpath leaves the repository is an escape, not a missing file.
    prefix = repo_root
    for segment in [segment for segment in normalized.split("/") if segment not in ("", ".")]:
        prefix = os.path.join(prefix, segment)
        try:
            os.lstat(prefix)
        except OSError:
            break
        if os.path.islink(prefix):
            resolved = os.path.realpath(prefix)
            if not is_within(resolved, repo_real):
                return "index-link-symlink-escape", None
    resolved = os.path.realpath(absolute)
    if not is_within(resolved, repo_real):
        return "index-link-symlink-escape", None
    if not os.path.isfile(absolute):
        return "index-link-missing", None
    return None, normalized


def is_within(candidate, root):
    if candidate == root:
        return True
    return candidate.startswith(root.rstrip(os.sep) + os.sep)


# ---------------------------------------------------------------------------
# Legacy discovery
# ---------------------------------------------------------------------------

def parse_legacy_map(text, source):
    """Parse a legacy CONTEXT-MAP.md into declarations and relations."""
    declarations = []
    relations = []
    current = None
    for number, line, in_fence in scan_lines(text):
        heading = heading_at(line, in_fence)
        if heading:
            level, title = heading
            current = None
            if level in (2, 3) and title.strip().lower() not in RESERVED_SECTIONS and title.strip():
                current = {
                    "name": title.strip(),
                    "glossary": None,
                    "terms": [],
                    "line": number,
                    "source": source,
                }
                declarations.append(current)
            continue
        if in_fence or not line.strip():
            continue
        relation = RELATION_PATTERN.match(line)
        if relation:
            relations.append({
                "from": relation.group(1).strip(),
                "to": relation.group(2).strip(),
                "description": relation.group(3).strip(),
                "line": number,
                "source": source,
            })
            continue
        if current is None:
            continue
        field = FIELD_PATTERN.match(strip_emphasis(line.lstrip("-* \t")))
        if not field:
            continue
        if field.group(1).lower() == "glossary":
            current["glossary"] = field.group(2).strip().replace("\\", "/")
        else:
            current["terms"] = split_list(field.group(2))
    return declarations, relations


def discover_legacy(repo_root, files):
    """Return the legacy file records, sorted by repo-relative path."""
    records = []
    for relative in files:
        name = relative.rsplit("/", 1)[-1]
        if name not in LEGACY_NAMES:
            continue
        text = read_text(os.path.join(repo_root, *relative.split("/")))
        if name == LEGACY_MAP_NAME:
            declarations, relations = parse_legacy_map(text, relative)
            terms = []
            for declaration in declarations:
                for term in declaration["terms"]:
                    terms.append({
                        "term": term,
                        "definition": "",
                        "aliases": [],
                        "invariants": [],
                        "source": relative,
                        "line": declaration["line"],
                        "contextName": declaration["name"],
                    })
            records.append({
                "path": relative,
                "kind": "context-map",
                "vocabularyBearing": bool(terms),
                "contextName": None,
                "declarations": declarations,
                "relations": relations,
                "terms": terms,
            })
            continue
        terms = extract_terms(text, relative)
        records.append({
            "path": relative,
            "kind": "context-glossary",
            "vocabularyBearing": bool(terms),
            "contextName": legacy_context_name(text, relative),
            "declarations": [],
            "relations": [],
            "terms": terms,
        })
    records.sort(key=lambda record: record["path"])
    return records


def legacy_context_name(text, relative):
    for number, line, in_fence in scan_lines(text):
        heading = heading_at(line, in_fence)
        if heading and heading[0] == 1 and heading[1].strip():
            return heading[1].strip()
    parts = relative.split("/")
    return parts[-2] if len(parts) > 1 else parts[0]


def discover_legacy_references(repo_root, files, legacy_paths):
    """Find repository files that link to or mention a legacy file by path."""
    if not legacy_paths:
        return []
    targets = sorted(set(list(legacy_paths) + list(LEGACY_NAMES)), key=lambda value: (-len(value), value))
    pattern = re.compile("|".join(re.escape(target) for target in targets))
    references = []
    legacy_set = set(legacy_paths)
    for relative in files:
        if relative in legacy_set:
            continue
        extension = os.path.splitext(relative)[1].lower()
        if extension not in TEXT_EXTENSIONS:
            continue
        text = read_text(os.path.join(repo_root, *relative.split("/")))
        counts = {}
        for match in pattern.finditer(text):
            counts[match.group(0)] = counts.get(match.group(0), 0) + 1
        for target in sorted(counts):
            references.append({"path": relative, "target": target, "occurrences": counts[target]})
    references.sort(key=lambda entry: (entry["path"], entry["target"]))
    return references


STAMP_SHA_PATTERN = re.compile(r"^[a-f0-9]{40}$")
STAMP_DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")
FRONTMATTER_KEY_PATTERN = re.compile(r"^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*?)\s*$")
FRONTMATTER_MAX_LINES = 32


def parse_frontmatter(text):
    """Return (fields, last_line) for a leading YAML frontmatter block.

    Only flat ``key: value`` lines are read; unknown keys are kept so the
    caller can ignore them. Returns (None, 0) when the file does not open
    with ``---`` or the block never closes within the scan bound.
    """
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        return None, 0
    fields = {}
    for number, line in enumerate(lines[1:FRONTMATTER_MAX_LINES], start=2):
        if line.strip() == "---":
            return fields, number
        match = FRONTMATTER_KEY_PATTERN.match(line.strip())
        if match:
            fields[match.group(1)] = match.group(2).strip("\"'")
    return None, 0


def git_query(repo_root, args):
    """Run a read-only git command; return stdout or None when unavailable."""
    try:
        result = subprocess.run(
            ["git", "-C", repo_root, *args],
            capture_output=True, text=True, timeout=5, check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    if result.returncode != 0:
        return None
    return result.stdout.strip()


def domain_verification(repo_root, text):
    """Stamp fields, structural problems, and git distance for a DOMAIN.md."""
    fields, end_line = parse_frontmatter(text)
    record = {
        "stamped": fields is not None,
        "verifiedAgainst": None,
        "lastVerified": None,
        "resolvable": None,
        "commitsBehindHead": None,
    }
    problems = []
    if fields is None:
        return record, problems, end_line

    sha = fields.get("verified_against")
    date = fields.get("last_verified")
    if sha is not None:
        if STAMP_SHA_PATTERN.match(sha):
            record["verifiedAgainst"] = sha
        else:
            problems.append(("domain-stamp-malformed",
                             "verified_against %r is not a full 40-hex commit." % sha))
    if date is not None:
        if STAMP_DATE_PATTERN.match(date):
            record["lastVerified"] = date
        else:
            problems.append(("domain-stamp-malformed",
                             "last_verified %r is not a YYYY-MM-DD date." % date))

    # Resolve against git only when repo_root IS the git toplevel: a tree
    # nested inside some other repository (test fixtures, exports) must not
    # borrow that repository's history.
    toplevel = git_query(repo_root, ["rev-parse", "--show-toplevel"])
    git_matches = toplevel is not None and os.path.realpath(toplevel) == os.path.realpath(repo_root)
    if record["verifiedAgainst"] and git_matches:
        resolved = git_query(repo_root, ["rev-parse", "--verify", record["verifiedAgainst"] + "^{commit}"])
        record["resolvable"] = resolved is not None
        if resolved is None:
            problems.append(("domain-stamp-unresolvable",
                             "verified_against %s names no commit in this repository."
                             % record["verifiedAgainst"]))
        else:
            behind = git_query(repo_root, ["rev-list", "--count", record["verifiedAgainst"] + "..HEAD"])
            if behind is not None and behind.isdigit():
                record["commitsBehindHead"] = int(behind)
    return record, problems, end_line


def domain_defined_terms(text, skip_until_line=0):
    """Term definitions inside a domain-truth file.

    Headings are rule anchors there, never term definitions, so only the
    explicit definition grammar counts: definition bullets and bold-term
    lines (opener or inline). Lines up to ``skip_until_line`` (the
    verification-stamp frontmatter) are never scanned.
    """
    defined = []
    for number, line, in_fence in scan_lines(text):
        if number <= skip_until_line:
            continue
        if in_fence or not line.strip():
            continue
        bullet = DEFINITION_BULLET_PATTERN.match(line)
        if bullet and bullet.group(1).strip().lower() not in RESERVED_SECTIONS:
            defined.append({"term": bullet.group(1).strip(), "line": number})
            continue
        opener = BOLD_TERM_OPENER_PATTERN.match(line)
        if opener and opener.group(1).strip().lower() not in RESERVED_SECTIONS:
            defined.append({"term": opener.group(1).strip(), "line": number})
            continue
        inline = BOLD_TERM_INLINE_PATTERN.match(line)
        if inline and inline.group(1).strip().lower() not in RESERVED_SECTIONS:
            defined.append({"term": inline.group(1).strip(), "line": number})
    defined.sort(key=lambda entry: (entry["line"], entry["term"]))
    return defined


def discover_domain_truth(repo_root, docs_root, files):
    """Sibling DOMAIN.md files at canonical locations, in path order."""
    contexts_prefix = docs_root.rstrip("/") + "/contexts/"
    file_set = set(files)
    records = []
    for relative in files:
        context = None
        if relative == DOMAIN_TRUTH_NAME:
            sibling = ROOT_GLOSSARY
        elif relative.startswith(contexts_prefix) and relative.endswith("/" + DOMAIN_TRUTH_NAME):
            middle = relative[len(contexts_prefix):-len("/" + DOMAIN_TRUTH_NAME)]
            if not middle or "/" in middle:
                continue
            context = middle
            sibling = relative[: -len(DOMAIN_TRUTH_NAME)] + ROOT_GLOSSARY
        else:
            continue
        text = read_text(os.path.join(repo_root, *relative.split("/")))
        verification, stamp_problems, stamp_end = domain_verification(repo_root, text)
        records.append({
            "path": relative,
            "context": context,
            "siblingGlossary": sibling,
            "siblingGlossaryPresent": sibling in file_set,
            "definedTerms": domain_defined_terms(text, skip_until_line=stamp_end),
            "verification": verification,
            "stampProblems": stamp_problems,
        })
    records.sort(key=lambda record: record["path"])
    return records


# ---------------------------------------------------------------------------
# Graph assembly
# ---------------------------------------------------------------------------

def build_graph(repo_root, docs_root):
    files = walk_files(repo_root)
    root_path = os.path.join(repo_root, ROOT_GLOSSARY)
    root_present = os.path.isfile(root_path)

    root = {
        "present": root_present,
        "path": ROOT_GLOSSARY,
        "hasContextsSection": False,
        "indexParses": False,
        "collision": False,
        "terms": [],
    }
    index = None
    contexts = []
    relations = []
    shared = []

    if root_present:
        text = read_text(root_path)
        present, index, span = parse_index(text)
        root["hasContextsSection"] = present
        root["indexParses"] = index is not None
        root["collision"] = present and index is None
        root["terms"] = extract_terms(text, ROOT_GLOSSARY, skip_span=span if present else None)
        if index:
            shared = index["shared"]
            relations = index["relations"]
            for entry in index["contexts"]:
                slug = slugify(entry["name"])
                code, resolved = link_safety(repo_root, entry["link"])
                glossary = {"present": False, "path": resolved, "terms": []}
                if code is None and resolved:
                    glossary_text = read_text(os.path.join(repo_root, *resolved.split("/")))
                    glossary = {
                        "present": True,
                        "path": resolved,
                        "terms": extract_terms(glossary_text, resolved),
                    }
                contexts.append({
                    "name": entry["name"],
                    "slug": slug,
                    "link": entry["link"],
                    "ownership": entry["ownership"],
                    "line": entry["line"],
                    "linkFinding": code,
                    "glossary": glossary,
                })

    legacy = discover_legacy(repo_root, files)
    legacy_paths = [record["path"] for record in legacy]
    references = discover_legacy_references(repo_root, files, legacy_paths)
    domain_truth = discover_domain_truth(repo_root, docs_root, files)
    legacy_bearing = [record for record in legacy if record["vocabularyBearing"]]

    if not legacy_bearing:
        blocked = "none"
    elif root["terms"]:
        blocked = "dual-canonical"
    elif root_present and root["indexParses"]:
        blocked = "legacy-coexistence-pending"
    else:
        blocked = "legacy-only"

    return {
        "docsRoot": docs_root,
        "repoRoot": repo_root,
        "files": files,
        "root": root,
        "index": index,
        "contexts": contexts,
        "relations": relations,
        "shared": shared,
        "legacy": legacy,
        "legacyReferences": references,
        "domainTruth": domain_truth,
        "blockedState": blocked,
    }


def public_term(term):
    entry = {
        "term": term["term"],
        "definition": term["definition"],
        "aliases": sorted(set(term["aliases"])),
        "invariants": list(term["invariants"]),
        "source": term["source"],
        "line": term["line"],
    }
    if "contextName" in term:
        entry["contextName"] = term["contextName"]
    return entry


def public_relation(relation):
    return {
        "from": relation["from"],
        "to": relation["to"],
        "description": relation["description"],
        "source": relation.get("source", ROOT_GLOSSARY),
        "line": relation["line"],
    }


# ---------------------------------------------------------------------------
# Subcommands
# ---------------------------------------------------------------------------

def command_inventory(graph):
    return {
        "schema": SCHEMA_INVENTORY,
        "docsRoot": graph["docsRoot"],
        "root": {
            "present": graph["root"]["present"],
            "path": graph["root"]["path"],
            "hasContextsSection": graph["root"]["hasContextsSection"],
            "isIndex": graph["root"]["indexParses"],
            "collision": graph["root"]["collision"],
            "terms": [public_term(term) for term in graph["root"]["terms"]],
        },
        "contexts": [
            {
                "name": context["name"],
                "slug": context["slug"],
                "link": context["link"],
                "ownership": context["ownership"],
                "glossary": {
                    "present": context["glossary"]["present"],
                    "path": context["glossary"]["path"],
                    "terms": [public_term(term) for term in context["glossary"]["terms"]],
                },
            }
            for context in graph["contexts"]
        ],
        "relations": [public_relation(relation) for relation in graph["relations"]],
        "sharedVocabulary": [
            {"term": entry["term"], "definition": entry["definition"], "line": entry["line"]}
            for entry in graph["shared"]
        ],
        "domainTruth": [
            {
                "path": record["path"],
                "context": record["context"],
                "siblingGlossary": record["siblingGlossary"],
                "siblingGlossaryPresent": record["siblingGlossaryPresent"],
                "definesTerms": bool(record["definedTerms"]),
                "definedTerms": [
                    {"term": entry["term"], "line": entry["line"]}
                    for entry in record["definedTerms"]
                ],
                "verification": record["verification"],
            }
            for record in graph["domainTruth"]
        ],
        "legacy": {
            "files": [
                {
                    "path": record["path"],
                    "kind": record["kind"],
                    "vocabularyBearing": record["vocabularyBearing"],
                    "contextName": record["contextName"],
                    "declarations": [
                        {
                            "name": declaration["name"],
                            "glossary": declaration["glossary"],
                            "terms": list(declaration["terms"]),
                        }
                        for declaration in record["declarations"]
                    ],
                    "relations": [public_relation(relation) for relation in record["relations"]],
                    "terms": [public_term(term) for term in record["terms"]],
                }
                for record in graph["legacy"]
            ],
            "references": list(graph["legacyReferences"]),
        },
        "blockedState": graph["blockedState"],
    }


def finding(code, message, **fields):
    entry = {"code": code, "message": message}
    for key in sorted(fields):
        if fields[key] is not None:
            entry[key] = fields[key]
    return entry


def command_validate(graph, mapping_document):
    findings = []
    root = graph["root"]

    if root["collision"]:
        findings.append(finding(
            "index-collision",
            "`## Contexts` is present but does not parse as the canonical index grammar; "
            "the root is treated as a flat glossary.",
            path=root["path"],
        ))

    seen_names = {}
    seen_slugs = {}
    for context in graph["contexts"]:
        key = context["name"].strip().lower()
        if key in seen_names:
            findings.append(finding(
                "index-duplicate-context",
                "Context '%s' is declared more than once in the index." % context["name"],
                path=root["path"], line=context["line"], context=context["name"],
            ))
        else:
            seen_names[key] = context
        if context["slug"] is None:
            findings.append(finding(
                "index-context-slug-invalid",
                "Context name '%s' cannot be slugified to ^[a-z0-9]+(-[a-z0-9]+)*$." % context["name"],
                path=root["path"], line=context["line"], context=context["name"],
            ))
        elif context["slug"] in seen_slugs and seen_slugs[context["slug"]] != key:
            findings.append(finding(
                "index-duplicate-context",
                "Context '%s' resolves to slug '%s', which another context already claims."
                % (context["name"], context["slug"]),
                path=root["path"], line=context["line"], context=context["name"],
            ))
        elif context["slug"] is not None:
            seen_slugs[context["slug"]] = key
        if context["linkFinding"]:
            findings.append(finding(
                context["linkFinding"],
                "Context '%s' links to '%s', which the path-safety rules reject."
                % (context["name"], context["link"]),
                path=root["path"], line=context["line"], context=context["name"],
            ))

    declared = {context["name"].strip().lower() for context in graph["contexts"]}
    for relation in graph["relations"]:
        for side in ("from", "to"):
            if relation[side].strip().lower() not in declared:
                findings.append(finding(
                    "relation-dangling-context",
                    "Relation references context '%s', which the index does not declare." % relation[side],
                    path=root["path"], line=relation["line"], context=relation[side],
                ))

    for source, terms in glossaries(graph):
        seen = {}
        for term in terms:
            key = term["term"].strip().lower()
            if key in seen:
                findings.append(finding(
                    "duplicate-term-in-context",
                    "Term '%s' is defined twice in the same glossary." % term["term"],
                    path=source, line=term["line"], term=term["term"],
                ))
            else:
                seen[key] = term

    blocked = graph["blockedState"]
    if blocked == "dual-canonical":
        findings.append(finding(
            "legacy-dual-canonical",
            "A vocabulary-bearing legacy file coexists with vocabulary-bearing root CONCEPTS.md "
            "content; vocabulary writes are blocked until migrate-domain-docs runs.",
        ))
    elif blocked == "legacy-only":
        findings.append(finding(
            "legacy-only",
            "A vocabulary-bearing legacy file exists and no root CONCEPTS.md carries vocabulary; "
            "glossary creation and seeding are blocked until migrate-domain-docs runs.",
        ))
    elif blocked == "legacy-coexistence-pending":
        findings.append(finding(
            "legacy-coexistence-pending",
            "Migrated glossaries are in place while vocabulary-bearing legacy files remain; "
            "the confirmed deletion step has not run yet.",
        ))

    for record in graph["domainTruth"]:
        for defined in record["definedTerms"]:
            findings.append(finding(
                "domain-defines-terms",
                "Domain-truth file defines the term '%s'; definitions belong to the owning "
                "glossary, not DOMAIN.md." % defined["term"],
                path=record["path"], line=defined["line"], term=defined["term"],
            ))
        if not record["siblingGlossaryPresent"]:
            findings.append(finding(
                "domain-orphan",
                "'%s' has no sibling glossary at '%s'; a domain-truth file belongs beside "
                "its context's CONCEPTS.md." % (record["path"], record["siblingGlossary"]),
                path=record["path"],
            ))
        for code, message in record["stampProblems"]:
            findings.append(finding(code, message, path=record["path"]))

    if any(record["vocabularyBearing"] for record in graph["legacy"]):
        for reference in graph["legacyReferences"]:
            findings.append(finding(
                "legacy-reference-pending",
                "%s still references '%s'; legacy deletion is not ready until every reference is updated."
                % (reference["path"], reference["target"]),
                path=reference["path"],
            ))

    if mapping_document is not None:
        findings.extend(invariant_findings(graph, mapping_document))

    findings.sort(key=lambda entry: (
        entry["code"], entry.get("path", ""), entry.get("line", 0),
        entry.get("term", ""), entry.get("context", ""), entry["message"],
    ))
    return {
        "schema": SCHEMA_VALIDATE,
        "docsRoot": graph["docsRoot"],
        "blockedState": blocked,
        "findings": findings,
    }


def glossaries(graph):
    """Yield (source_path, terms) for every glossary that carries terms."""
    if graph["root"]["terms"]:
        yield graph["root"]["path"], graph["root"]["terms"]
    for context in graph["contexts"]:
        if context["glossary"]["present"]:
            yield context["glossary"]["path"], context["glossary"]["terms"]
    for record in graph["legacy"]:
        if record["kind"] == "context-glossary" and record["terms"]:
            yield record["path"], record["terms"]


def invariant_findings(graph, mapping_document):
    mapping = mapping_document.get("mapping") or {}
    unresolved = {entry.get("term") for entry in mapping_document.get("unresolved") or []}
    findings = []
    for record in graph["legacy"]:
        for term in record["terms"]:
            if not term["invariants"]:
                continue
            if term["term"] in unresolved:
                continue
            carried = mapping.get(term["term"], {}).get("invariants") or []
            for invariant in term["invariants"]:
                if invariant not in carried:
                    findings.append(finding(
                        "invariant-dropped",
                        "The supplied mapping drops the invariant '%s' extracted for term '%s'."
                        % (invariant, term["term"]),
                        path=record["path"], term=term["term"],
                    ))
    return findings


def command_plan_migration(graph):
    docs_root = graph["docsRoot"]
    legacy_contexts = collect_legacy_contexts(graph)
    root_terms = {term["term"].strip().lower() for term in graph["root"]["terms"]}

    owners = {}
    for context in legacy_contexts:
        for term in context["terms"]:
            owners.setdefault(term["term"], {})[context["name"]] = (context, term)

    single = legacy_contexts[0] if len(legacy_contexts) == 1 else None
    mapping = {}
    unresolved = []

    for term_name in sorted(owners):
        candidates = owners[term_name]
        if single is not None:
            context, term = candidates[single["name"]] if single["name"] in candidates else next(iter(candidates.values()))
        elif len(candidates) > 1:
            unresolved.append({
                "term": term_name,
                "reason": "defined-in-multiple-contexts",
                "candidates": sorted(candidates),
            })
            continue
        else:
            context, term = next(iter(candidates.values()))
        if term_name.strip().lower() in root_terms:
            unresolved.append({
                "term": term_name,
                "reason": "defined-in-root-and-legacy",
                "candidates": sorted(candidates),
            })
            continue
        if context["slug"] is None:
            unresolved.append({
                "term": term_name,
                "reason": "context-slug-invalid",
                "candidates": sorted(candidates),
            })
            continue
        mapping[term_name] = {
            "context": context["slug"],
            "contextName": context["name"],
            "source": term["source"],
            "destination": "%s/contexts/%s/%s" % (docs_root, context["slug"], ROOT_GLOSSARY),
            "aliases": sorted(set(term["aliases"])),
            "invariants": list(term["invariants"]),
        }

    unresolved.sort(key=lambda entry: (entry["term"], entry["reason"]))

    writes = []
    if mapping:
        for destination in sorted({entry["destination"] for entry in mapping.values()}):
            writes.append({"path": destination, "kind": "context-glossary"})
        writes.append({"path": ROOT_GLOSSARY, "kind": "root-index"})
    deletions = sorted(
        record["path"] for record in graph["legacy"]
        if record["vocabularyBearing"] or (record["kind"] == "context-map" and record["declarations"])
    )
    reference_updates = [
        {"path": reference["path"], "target": reference["target"], "occurrences": reference["occurrences"]}
        for reference in graph["legacyReferences"]
    ]

    return {
        "schema": SCHEMA_PLAN,
        "docsRoot": docs_root,
        "mapping": {name: mapping[name] for name in sorted(mapping)},
        "unresolved": unresolved,
        "manifest": {
            "writes": writes,
            "referenceUpdates": reference_updates,
            "deletions": deletions if mapping or unresolved else [],
        },
    }


def collect_legacy_contexts(graph):
    """Build the legacy context list: map declarations plus CONTEXT.md glossaries."""
    by_glossary = {}
    contexts = []

    for record in graph["legacy"]:
        if record["kind"] != "context-map":
            continue
        for declaration in record["declarations"]:
            entry = {
                "name": declaration["name"],
                "slug": slugify(declaration["name"]),
                "glossary": declaration["glossary"],
                "terms": [],
            }
            contexts.append(entry)
            if declaration["glossary"]:
                by_glossary[declaration["glossary"]] = entry
            for term in record["terms"]:
                if term.get("contextName") == declaration["name"]:
                    entry["terms"].append(term)

    for record in graph["legacy"]:
        if record["kind"] != "context-glossary" or not record["vocabularyBearing"]:
            continue
        entry = by_glossary.get(record["path"])
        if entry is None:
            entry = {
                "name": record["contextName"],
                "slug": slugify(record["contextName"] or ""),
                "glossary": record["path"],
                "terms": [],
            }
            contexts.append(entry)
        known = {term["term"] for term in entry["terms"]}
        for term in record["terms"]:
            if term["term"] in known:
                entry["terms"] = [
                    term if existing["term"] == term["term"] else existing
                    for existing in entry["terms"]
                ]
            else:
                entry["terms"].append(term)

    contexts = [entry for entry in contexts if entry["terms"]]
    contexts.sort(key=lambda entry: entry["name"])
    return contexts


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def validate_docs_root(value):
    if value is None or value == "":
        raise UsageError("docs-root-empty", "--docs-root must be a non-empty repo-relative path")
    normalized = value.replace("\\", "/")
    if normalized.startswith("/") or re.match(r"^[A-Za-z]:[\\/]", value):
        raise UsageError(
            "docs-root-absolute",
            "--docs-root '%s' is absolute; use a repo-relative path" % value,
        )
    if any(segment == ".." for segment in normalized.split("/")):
        raise UsageError(
            "docs-root-traversal",
            "--docs-root '%s' contains a '..' segment; use a plain repo-relative path" % value,
        )
    return normalized.strip("/")


def build_parser():
    parser = argparse.ArgumentParser(
        prog="domain-graph.py",
        description="Read-only resolver for the progressive domain-vocabulary protocol.",
    )
    subparsers = parser.add_subparsers(dest="command")
    for name in ("inventory", "validate", "plan-migration"):
        subparser = subparsers.add_parser(name)
        subparser.add_argument("--repo-root", default=".")
        subparser.add_argument("--docs-root", default="docs")
        if name == "validate":
            subparser.add_argument("--mapping", default=None)
    return parser


def main(argv):
    parser = build_parser()
    arguments = parser.parse_args(argv)
    if not arguments.command:
        raise UsageError("missing-subcommand", "one of inventory, validate, plan-migration is required")

    docs_root = validate_docs_root(arguments.docs_root)
    repo_root = os.path.abspath(arguments.repo_root)
    if not os.path.isdir(repo_root):
        raise UsageError("repo-root-invalid", "--repo-root '%s' is not a directory" % arguments.repo_root)

    mapping_document = None
    if arguments.command == "validate" and arguments.mapping:
        if not os.path.isfile(arguments.mapping):
            raise UsageError("mapping-missing", "--mapping '%s' is not a file" % arguments.mapping)
        try:
            mapping_document = json.loads(read_text(arguments.mapping))
        except ValueError as error:
            raise UsageError("mapping-unreadable", "--mapping is not valid JSON: %s" % error)

    graph = build_graph(repo_root, docs_root)

    if arguments.command == "inventory":
        emit(command_inventory(graph))
        return 0
    if arguments.command == "plan-migration":
        emit(command_plan_migration(graph))
        return 0

    report = command_validate(graph, mapping_document)
    emit(report)
    return 1 if report["findings"] else 0


def emit(document):
    # ensure_ascii keeps stdout writable under a non-UTF-8 console encoding
    # (native Windows defaults to cp1252) without losing any character.
    sys.stdout.write(json.dumps(document, indent=2, ensure_ascii=True, sort_keys=False))
    sys.stdout.write("\n")


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except UsageError as error:
        sys.stderr.write(json.dumps(
            {"schema": SCHEMA_ERROR, "code": error.code, "message": error.message},
            indent=2,
            ensure_ascii=True,
        ))
        sys.stderr.write("\n")
        sys.exit(2)
