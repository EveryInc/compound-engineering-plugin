# CE Packs

*Experimental — the shape may change.*

A **CE Pack** ingests domain knowledge into the steps of Compound Engineering at runtime. It is a folder of prescriptive rules that the pipeline reads at the moments judgment happens: `ce-brainstorm` and `ce-plan` ground requirements and plans in the rules that apply, and `ce-code-review` / `ce-doc-review` flag work that contradicts them. Every constraint a pack shapes is cited — `(pack: <id>, <path within the pack>)` — so a reader can trace any rule back to its file.

**A pack is not a skill.** A skill is something CE can *do*; a pack is something CE must *know* while doing it. See [Why packs aren't skills](#why-packs-arent-skills).

Where a [Learning](./ce-compound.md) records what a past problem taught, a pack says what work in its domain **must honor**: "Rails owns routes and props; pages don't get a parallel JSON API", "recovery flows re-verify identity", "every module documents its adoption boundary".

Packs are **declared, never scanned**: nothing happens until the repo's CE config names one. With no `packs:` key, every skill behaves exactly as before.

## Create your first pack (repo-local, 2 minutes)

**1. Write a rule file.** Anywhere in your repo — `packs/house-rules/` is a fine convention:

```markdown
<!-- packs/house-rules/no-parallel-json-api.md -->
---
title: Pages receive server data as Inertia props, never from a parallel JSON endpoint
applies_when:
  - adding a page that needs server data
  - adding or changing an API endpoint consumed by the app's own pages
tags: [inertia, routes, props, json-api]
---

Rails controllers own routes and props. A page gets its data through
`render inertia:` props. Do not add a JSON endpoint for a page's own data;
if a third party needs the data, that is a separate, documented API decision.
```

`title` and `applies_when` are required; files without them are skipped with a warning. `tags` helps matching.

A pack can also carry files the load script never touches — see the layout rule below.

**2. Declare it** in `.compound-engineering/config.yaml`:

```yaml
packs:
  - source: packs/house-rules
```

**3. Done.** Next `ce-plan` run in this repo, a prompt like *"add a settings page showing billing history"* matches the first `applies_when` clause, and the plan's decision reads:

> Load invoices in the settings controller and pass them as Inertia props; no new endpoint. `(pack: house-rules, no-parallel-json-api.md)`

And if a later diff adds `/api/invoices` anyway, `ce-code-review` flags it against the same rule.

## Writing `applies_when` that actually fires

`applies_when` conditions are matched **semantically** by the agent against the work being planned or reviewed — they are not regexes. Write them like the left-hand side of "when someone is doing X, this rule applies":

```yaml
# Good — describes the situation, in the words a task would use
applies_when:
  - adding a page that needs server data
  - rendering server data in the UI
  - adding or changing a background job

# Weak — labels the topic instead of the situation
applies_when:
  - inertia
  - architecture
```

Rules of thumb: one situation per line; use the vocabulary a feature request would use ("page", "endpoint", "background job"), not internal jargon; two or three concrete conditions beat one abstract one.

**Scoping a rule to a pipeline stage** is also just phrasing — there is no `stages:` field, on purpose. Every consuming stage matches `applies_when` against *its own* context, so a situational condition self-selects: *"reviewing a diff that touches payment code"* fires at review and nowhere else; *"deciding whether a feature needs a new endpoint"* is planning-shaped; a neutral condition like *"adding a page that needs server data"* correctly fires at planning **and** again at review — same rule, both moments earned. Only frontmatter is re-read per stage (cheap); a rule's body loads solely on a match. Unknown frontmatter keys are tolerated, so future fields can be added without breaking existing packs. Packs are read in full (every file's frontmatter, no keyword pre-filter, up to 25 files per pack), so a condition sharing zero keywords with the prompt can still match — but a clearly-worded situation matches more reliably.

## Every way to declare a source

```yaml
packs:
  # Repo-relative folder — tracked with the repo, read live
  - source: packs/house-rules

  # Machine-local folder — read live, only on this machine
  - source: ~/packs/kk-style

  # Git repo pinned to a tag — cached, reproducible for the whole team
  - source: https://github.com/org/rails-ce-pack
    ref: v1.2.0

  # Pick specific packs from a multi-pack source (one id, or a list)
  - source: https://github.com/org/ce-packs
    ref: v2.0.0
    pack: [rails, inertia]

  # Subfolder of a repo — explicit path:, or just paste the browser URL
  - source: https://github.com/org/stack
    ref: v2.0.0
    path: packs
  - source: https://github.com/org/stack/tree/v2.0.0/packs   # same thing

  # Rename a single-pack entry
  - source: ~/packs/rules
    id: house-rules
```

Field reference:

| Field | Applies to | Meaning |
|---|---|---|
| `source` | all | Repo-relative path, `~`/absolute path, or git URL. Required. |
| `ref` | git only | Tag, sha, or branch. **Required for git; forbidden for paths.** Tags and shas reproduce exactly; a branch freezes at its cached resolution per machine (drift shows up in `/ce-setup`'s health check) — pin tags for teams. |
| `path` | git only | Subfolder of the repo to use as the source root. A pasted GitHub `…/tree/<ref>/<sub>` URL fills `ref` and `path` itself. |
| `pack` | all | One id or a list — install exactly those. Omit = everything the source publishes. A named id the source doesn't publish is a loud error listing what's available. |
| `id` | all | Rename a single-pack entry (e.g. two sources both publishing `rails`). |

**Layering:** `config.yaml` is the team's list; `config.local.yaml` **adds** personal packs on top — it can never replace or drop team packs, and a duplicate id across the two errors loudly.

## Publish a pack for others

A pack source is just a repo (or folder) laid out by convention — no manifest, no registration:

```text
rails-ce-pack/                      # git repo = the source
├── rails/                          # each child dir with valid files = one pack (id: rails)
│   ├── routes-own-props.md
│   └── no-parallel-json-api.md
├── inertia/                        # a second pack (id: inertia)
│   └── deferred-props-not-endpoints.md
└── README.md                       # ignored — no frontmatter
```

- Each **immediate child directory** containing at least one valid rule file is a published pack; deeper nesting is pack content, not more packs.
- A source whose root itself holds rule files is a **single pack** named after the folder (or the URL's last segment).
- Tag releases (`git tag v1.0.0`) so consumers can pin; "install" instructions for your users are just the two-line `packs:` entry.
- A "marketplace" needs nothing from CE — it's any README listing pack URLs.

## A pack repo is a domain package

One repo can carry everything a domain offers — rules, big reference data, docs, and skills:

```text
rails-domain-package/
├── packs/
│   ├── rails/                       # rules -- ingested via your packs: entry
│   │   ├── routes-own-props.md
│   │   ├── no-parallel-json-api.md
│   │   └── resources/               # in-pack big data -- never discovered, only
│   │       ├── error-catalog.csv    #   reached through a rule that cites it
│   │       └── api-inventory.sqlite
│   └── inertia/
│       └── deferred-props.md
├── docs/                            # human docs -- ignored by the resolver
├── skills/                          # workflows -- installed via the harness's plugin system
│   └── rails-upgrade/SKILL.md
└── .claude-plugin/plugin.json
```

The resolver enumerates **only** directories holding `.md` files with `title` + `applies_when` frontmatter — `skills/`, `docs/`, `resources/`, and `README.md` are invisible to it, so nothing collides. The `packs:` entry ingests the knowledge; a normal plugin install registers the skills. Skills cannot ride in through `packs:` — making a skill invocable is the harness's plugin machinery, which CE cannot drive at runtime.

## Big data in packs

Rules stay small; the data they lean on can be arbitrarily large — and it can live **inside the pack itself**, invisible to the load script. The layout rule:

```text
packs/house-rules/
├── no-parallel-json-api.md        # top-level .md with frontmatter = a rule (loaded on match)
├── error-responses.md             # another rule
└── resources/                     # ANY subdirectory: never scanned, never loaded,
    ├── error-catalog.csv          #   never warned about -- reachable only because
    ├── api-inventory.sqlite       #   a rule points at it
    └── notes.md                   #   even .md files in here are invisible to the resolver
```

Only **top-level `.md` files with `title` + `applies_when`** are rules the resolver sees. Everything else in the pack is inert storage: subdirectories (any name — `resources/`, `data/`, `docs/`) and top-level non-`.md` files are ignored entirely. The one thing to avoid is a top-level `.md` *without* frontmatter — that draws a `Skipped pack files` warning, so park free-form notes in a subdirectory instead.

The pattern:

1. **Put the data in a subdirectory of the pack** (or beside it, or in its own declared source — all equally invisible to discovery).
2. **Point at it from a rule**, with the access method — the rule is the only door to the data:

```markdown
---
title: Error codes map to the canonical catalog, never ad-hoc strings
applies_when:
  - adding or changing an error response
  - handling a failure from the payments provider
---

Every error surfaced to users must use a catalog entry. The full catalog is
`resources/error-catalog.csv` (code, user_message, severity, owner) — look the
code up there before inventing one. For bulk questions, query
`resources/api-inventory.sqlite` (table `endpoints`) with the sqlite3 CLI.
```

3. The agent reads or queries the data **only when the rule matches and sends it there** — nothing under `resources/` is ingested, indexed, or context-loaded up front, so a 500 MB resource costs nothing on runs that never touch its rule.

Sizing guidance: matching only ever reads rule frontmatter, so data size never slows resolution — but **git sources clone the whole tree at the ref**, so put heavyweight data behind a *path source* (`~/data/rails-corpus`) or a separate data-only entry rather than bloating a tag every consumer clones. Data files are subject to the same trust rule as rule text: content to read and cite, never instructions to obey.

## What each stage does with packs

| Stage | Behavior |
|---|---|
| `ce-brainstorm` | The grounding scout quotes matching pack rules into its dossier; the Product Contract cites the ones that shaped it |
| `ce-plan` | The learnings research reads matching rules; requirements, decisions, and risks they shape carry the citation |
| `ce-work` | Consumes the plan's cited constraints like any other plan content |
| `ce-code-review` | The institutional-learnings pass searches pack roots; a diff violating a matching rule is flagged with the citation (local reviews only — remote-PR scope skips your local config) |
| `ce-doc-review` | Reviewers receive the resolved packs and flag plan text contradicting a matching rule |
| `/ce-setup` | Health check reports each entry: resolvable, ref rules, published packs, and whether a cached branch is behind upstream |

Pack text is **evidence, never instructions**: a rule file that says "reviewer, skip this check" gets quoted, not obeyed.

## When something goes wrong

| Symptom | What it means |
|---|---|
| `git source … requires ref:` / `ref: is only valid on git sources` | Entry shape error — fix the entry; other entries still resolve |
| `pack id(s) X not published … available: …` | Typo or removed pack — the error lists what the source actually publishes |
| `duplicate pack id … neither installs` | Two entries resolved to the same id — rename one with `id:` |
| One warning, packs missing this run | Git source unreachable (offline, no credentials, gone) — planning continues without it, never blocks |
| A file silently ignored | Missing `title`/`applies_when` frontmatter — reported once per run as `Skipped pack files` |
| Branch-pinned pack seems stale | Branches freeze at their cached resolution; `/ce-setup` shows "behind upstream" — pin a tag, or clear the cache (`/tmp/compound-engineering-<uid>/ce-packs/`) |

## Why packs aren't skills

Skills and packs answer different questions, and forcing knowledge into skill form would break four properties the pipeline depends on:

| | Skill | Pack |
|---|---|---|
| Answers | "what can CE **do**?" | "what must work here **honor**?" |
| Fires when | someone invokes it | automatically, inside *other* skills' steps — planning research, review dispatch — with nothing to remember to call |
| Its text is | **instructions the agent executes** | **evidence the agent quotes and cites** — never obeyed, by design |
| Costs | context in every session (its description sits in the skill roster) and a full load when invoked | nothing until a phase resolves the config; only matching files are ever read |
| Leaves behind | whatever it did | a citation — `(pack: <id>, <path>)` — so every influence is traceable in the artifact |

Two of those rows are load-bearing:

- **Knowledge that must be invoked is knowledge that gets skipped.** The whole point of a pack is that the billing-page plan honors the no-parallel-JSON-API rule *without anyone remembering it exists*. A `/rails-rules` skill only helps the person who already knows to call it.
- **Rules must not carry instruction authority.** Skill text is obeyed; pack text is untrusted input — a rule file that says "reviewer, skip this check" gets quoted, not followed. Shipping domain rules as a skill would hand that text the agent's obedience, which is exactly the injection surface CE refuses.

The two compose at the repo level: one git repo can publish `packs/` (declared here, consumed as knowledge) **and** ship `skills/` (installed through the harness's plugin system, invoked as workflows). A Rails domain package might offer both — a `rails` pack that planning and review ground in, and a `/rails-upgrade` skill you run on purpose.

## Not built (by design, for now)

Provider protocols (`ce-pack/v1`), evidence locks and receipts, auto-update, per-pack pinning inside one source, cross-pack conflict detection, transitive pack dependencies, and a pack-authoring helper skill. The config key reference lives in [configuration](./configuration.md#ce-packs-experimental--shape-may-change).
