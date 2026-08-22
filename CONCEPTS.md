# Concepts

Shared domain vocabulary for this project — entities, named processes, and status concepts with project-specific meaning. Seeded with core domain vocabulary, then accretes as ce-compound and ce-compound-refresh process learnings; direct edits are fine. Glossary only, not a spec or catch-all.

## The plugin and its parts

### Plugin
A distributable bundle of Skills, Agents, Commands, and Hooks (optionally MCP servers) described by a single manifest and installed into a coding-agent platform as one unit — the artifact the Converter translates for non-Claude Targets and the Marketplace distributes.

### Skill
A user-invoked capability defined in its own directory, and the primary entry point a user reaches for. A Skill orchestrates: it can progressively pull in its own reference files as needed and dispatch generic subagents seeded with Specialist prompt assets. Distinct from an Agent in that a Skill is user-invoked and coordinates, whereas an Agent or subagent is dispatched to perform scoped work.

### Agent
A specialized, single-purpose worker running in its own isolated context and returning a result, rather than conversing with the user. Also called a subagent. In the current plugin design, most CE specialist behavior is not exposed as standalone Agent definitions; Skills seed generic subagents with Skill-local prompt material instead.

### Specialist prompt asset
An internal prompt file owned by one Skill that defines a specialist persona or research/review role for a generic subagent. It is not an externally exposed plugin component: the owning Skill controls when it is loaded, which model or tool policy applies, and how its output is merged.

## Conversion

### Target
A destination coding-agent platform other than Claude Code (OpenCode, Codex, Pi, Antigravity, Kimi Code, and others) that the repo supports through native plugin metadata or a Converter/Writer pair. Also called a target provider when it uses the conversion path.

A Plugin is installed to a Target at one of two scopes: global (user-wide) or per-workspace.

### Native plugin surface
A platform-provided install contract that can consume this repo's committed plugin manifest or marketplace metadata directly, without generating a converted Bundle. When a Target has a native plugin surface, user-facing support usually belongs in platform metadata, release validation, and docs instead of a new Converter and Writer.

### Converter
The step that transforms a parsed Plugin into one Target's in-memory form, mapping tools, permissions, hooks, and model names explicitly rather than by convention.

### Writer
The step that emits a Target's converted Bundle onto disk, in that Target's expected paths and merge semantics. Paired with a Converter, one per Target.

### Bundle
The in-memory converted form of a Plugin for a single Target — the handoff a Converter produces and a Writer consumes.

### Install manifest
A per-plugin ledger, written by a Writer at install time, of exactly which skill, agent, prompt, and extension paths that install created on a Target — the record later installs consult to tell tool-owned content apart from user-managed content.

The load-bearing invariant is that a Writer never claims a path it did not write: a path the user has replaced (a symlink into a personal fork, a hand-authored directory) is excluded from the manifest and preserved on reinstall rather than overwritten, and the ledger is self-healing — removing the override lets the next install resume tracking that path. A path with no manifest entry — including one from an install predating the mechanism — reads as unowned and is therefore preserved.

### Marketplace
The catalog metadata listing installable plugins and their versions for distribution, kept consistent with each Plugin's manifest by release validation.

## Compound engineering

### Compound engineering
The methodology this project embodies: structure engineering work so each unit makes the next one easier, capturing reusable knowledge as you go so the toolset gets smarter with every use.

### Pipeline
The chained progression of Skills that carries a piece of work from strategy and ideation through brainstorm, plan, execution, and review, and closes by capturing what was learned. Each stage hands a durable artifact to the next, and research is gathered at the stage that needs it rather than re-gathered downstream.

### Visual probe
A disposable, display-only decision sketch used during brainstorming for one shape, layout, or relationship question. The user looks at it and answers in chat. It is not a prototype or a spec: a decision a rough sketch cannot settle — anything turning on real finish or motion — goes to an experience prototype instead.

### Experience prototype
A throwaway prototype of the product, built so a human can experience it — by driving it, or by seeing it at real finish — and decide how something should work, feel, or read before that choice is encoded in a plan and code. Modality, fidelity, and medium all follow one rule: do not fake the dimension being tested. Throwaway means unmaintained and unshipped rather than discarded — a scratch prototype is left in place as a best-effort reference for what gets built next, alongside the decisions, though an in-app overlay run is undone and leaves nothing behind. Distinct from a visual probe (rough, one decision) and from polish (a feature that already works).

### Learning
A documented solution to a past problem — a bug fix, a convention, or a workflow pattern — stored as the unit of compounded knowledge so future work can find and reuse it. Also called a solution doc. Carries structured metadata (category, tags, problem type) for retrieval; its creation date lives in the entry, not the filename.

### Pattern doc
Guidance generalized from several Learnings into a broader rule. Higher-leverage than any single incident-level Learning, and higher-risk when stale, because future work treats it as broadly applicable.

### Knowledge track
One of the two classifications a Learning carries, set by its problem type: the knowledge track holds guidance — conventions, workflow patterns, practices, decisions — while the bug track holds diagnosed defects. The track decides which metadata a Learning must carry and which maintenance checks apply to it; procedure-shaped checks, such as comparing a Learning against the Guidance layer, key on the knowledge track.

### Guidance layer
The agent-facing instructions an agent loads at the moment it acts — a skill's instructions, a runbook, a root instruction file. Because an agent reads it at the moment of acting, a Learning that disagrees with it is not merely stale but liable to be overridden in practice, so a contradiction there outranks ordinary staleness. Maintenance skills compare a Learning only against guidance the Learning itself names or links, resolve the disagreement by which side current code follows, and report a wrong guidance file rather than editing it.

### Explainer
A dense, visual teaching artifact written for the developer personally — explaining a concept, a change, an idea, or a window of their own recent work — so the human keeps learning when agents do the writing. The complement of a Learning: a Learning teaches the repo's future work; an explainer teaches the human.

### Session handoff
An immutable continuity artifact that lets a fresh agent recover the objective, decisions, current state, and unfinished work without the prior session transcript. CE-created handoffs use managed temporary Markdown by default and point to authoritative project artifacts rather than replacing them. A receiving agent may also resume from any user-selected source with sufficient continuity context; selection supplies context but no authority to continue automatically.

### Check-in
The active-recall step that can follow an explainer in the same session: the developer predicts or answers first and the explanation confirms or corrects — predict-then-reveal for changes, checked exercises for concepts. Skippable when the material does not warrant retention work.

### Concept-teaching section
A conditional section of a generated PR description, added by agent judgment when the change introduces a concept new to the codebase, that teaches the concept — what it is, why it was chosen here, and an example from the PR — so a reader can understand and re-explain the change without reading the diff. The passive, in-description counterpart of an Explainer.

## Skill orchestration

### Dispatch skill
A Skill whose workflow delegates work to subagents — reviewers, scouts, fixers — rather than performing every pass in the orchestrator's own context.

Each dispatch boundary owns its failure direction. Work whose value is parallelism may run serially or inline when dispatch is unavailable. Work whose correctness depends on separation must stop or withhold independence credit unless it actually ran in a separate context.

### Model tier
A semantic cost class for a dispatched sub-agent — extraction (cheapest capable, for retrieval and quoting), generation (mid-tier, for evidence-driven work and mechanical verification), or ceiling (the orchestrator's own model, inherited by omitting any model selection) — declared once per Skill and referenced by tier name so model names never hardcode into skill content.

When a platform cannot select models per agent, every role runs on the inherited model and cost control falls back to structure: read budgets and output caps.

### Evidence dossier
A bulk evidence artifact — verbatim quotes with source pointers, gathered by a cheap scout agent — written to scratch storage instead of returned inline, so the orchestrator carries only a short gist and downstream agents read the full dossier themselves.

### Outcome spine
The part of a Skill that must hold without any reference loaded: the result it produces and who consumes it next, the done condition, the safe failure direction, and the facts the agent cannot derive from the repository in front of it. Everything else in the skill is protocol or judgment attached to that spine, and a block that cannot name its spine is restated before it is edited.

### Host prompt budget
The ceiling a specific agent host places on how much of a Skill's body it will keep in the model-visible prompt, enforced by that host's own loader rather than by any plugin or skill specification. Each host sets its own and reaches it by a different route — one may truncate the body outright and only for packages declaring a particular manifest shape, another may re-attach a shortened copy of each invoked skill after summarizing a long conversation — so a body that survives intact on one host can silently lose its tail on another.

Every known truncation keeps the beginning of the body and discards the rest, and none of them reports an error. That is what makes ordering load-bearing: what must survive belongs above what may be cut, and a stop class or boundary rule sitting below a long routing block can disappear while every mechanical check still passes. A repository that ratchets body size sets that ratchet from the tightest bound among the hosts it ships against — a scoped engineering constraint whose owner and scope are re-verified at the source, not a conformance requirement of any specification. Such a ratchet bounds only the per-skill budgets: where a host also caps the *combined* size of everything invoked in one session, that aggregate is a separate invariant no per-file check can express, so a green per-file gate is not evidence it holds. Load stub and Phase-loaded kernel are the two shapes content takes when it moves out of the body to fit.

### Load stub
The inline remnant left in a Skill when load-bearing content moves to a reference file: a load instruction that names what the reference contains and the failure mode of skipping it, while keeping no detail an agent could improvise from — making the load structurally necessary rather than advisory.

### Output contract
The shape a planning Skill commits to delivering for one run, chosen by its proportionality gate at intake before any research or subagent spend: Direct (a few sentences in chat handed to execution), Chat brief (a chat-only summary with units and test expectations, file-optional), or Durable (the unified plan artifact with its full floor). The gate is a condition on the work's shape with a safe failure direction toward the heavier contract; pipeline and headless runs, and any run without a synchronous user, always take Durable.

### Phase-loaded kernel
A Skill body reduced to what must fire without a read — outcome, done bar, authority, phase order, the stop classes that hold when a reference is never opened, and a required read named immediately before each acting step — with each phase's mechanics owned by one reference loaded at that step. The design assumes the load happens at the acting point; a host that reads every reference at kernel load satisfies the letter of "read before the step" while losing both the context saving and any safety path that depends on a late read, so the kernel must state that an earlier read does not satisfy the acting-point read.

### Skill-eval cell
One graded scenario that runs a Skill on a real coding-agent host and scores the surviving artifacts of that run — actions taken, files written, required reads the Skill itself declared undefendable — not whether the model's essay mentioned a command or opened a procedure file.

A required-read miss fails the cell only when the always-loaded body makes the decision undefendable without that file. Omitting the probe is the correct negative when the body still states the gate; a complementary cell is what measures extraction on a path the reference actually owns.

### Detached job
A delegated worker process launched into its own session so it outlives the shell tool call that started it, with its state — status word, log, identity, and result — kept in a durable job directory the orchestrator polls between turns instead of awaiting in place.

The launching call returns as soon as the job exists; supervision (idle and hard limits, process-tree reaping) runs inside the detached worker, while the caller keeps its own aggregate deadline and proceeds without the job when that passes. A job publishes exactly one terminal record, atomically, and nothing in the detached path may prompt for input. Process-tree reaping is a guarantee supplied by the host operating system's process-grouping primitive rather than one the job contract can assume: where a grouping does not outlive the process that leads it, reaping must be re-derived from a primitive that does, or descendants survive the terminal record.

Liveness and progress are distinct signals, and an idle window detects only whichever one its watched stream actually carries. A worker-emitted heartbeat proves the supervising process is alive while saying nothing about whether the delegate is producing; conversely a delegate that buffers its output until completion looks identical to a wedged one. Which signal a given delegate can supply is a property of that delegate to be measured, not assumed, before an idle window is trusted to distinguish a working run from a stalled one.

### Cross-model pass
An additive delegated run that sends the host workflow's review or judgment brief through a different model-provider route and folds the structured result back into the host's synthesis. It stays non-blocking when the peer cannot run, and it counts as independent corroboration only when the serving model family can be verified rather than merely requested.

A peer result is usable only when it is a settled answer to the framed question — a settled Blocked verdict with its reason included. Settledness is declared by the peer in the output contract itself, never inferred from its prose; a result that satisfies the schema but is not declared final is a placeholder: it earns one bounded retry on the same route with the same target, model, and scope, inside the same time window, and if it recurs the voice is dropped with the observed reason rather than folded in as a position.

### Terminalize
The host-owned step that turns a finished external worker's working tree into one inspectable Transport commit, without requiring the worker to stage or commit.

The snapshot includes committed, uncommitted, and untracked output. The worker may edit and test; the host alone creates the Transport commit and later the canonical checkout commit.

### Transport commit
A synthetic, base-parented commit the host builds from an external worker's complete final tree so the host can inspect and fold the result. It is intermediate evidence, not the canonical checkout commit, and it is never the worker's own tip.

### Warm checkout
A checkout whose git-ignored inventory already contains what the project's verification command needs to run: installed dependencies, virtualenvs, build caches. It is the normal state of a developer's canonical checkout, and it is the opposite of a fresh clone or newly added worktree, where verification cannot run until something installs those artifacts.

Ignored state in a warm checkout is large, symlink-heavy, and owned by tooling the controller never ran, so any host-side guarantee about it can only be detection and disclosure, never byte-exact custody.

### Model identity receipt
The serving backend's own report of which model actually handled a delegated run, recorded alongside the requested model so the two can disagree visibly. A run's model identity is verified only by such a receipt — never by the request parameters or the model's own text — and outputs without one are labeled as requested-but-unverified; logic that weights cross-model agreement follows the receipt, not the request.

### Handoff seam
The point in a calling Skill where completed work triggers a follow-on Skill in the same run — distinct from a Session handoff, which carries continuity to a fresh session. A seam that states only intent ("auto-invoke X") invites the caller's agent to reproduce the callee's mechanics from memory; a hardened seam pins the invocation mechanism (the platform's skill-invocation primitive, so the callee's instructions actually load) and, when the callee runs a stateful protocol, explicitly forbids starting that protocol's mechanics directly.

### Engine carrier
A structured implementation binding — mode, target, model, source — that an orchestrating Skill serializes into the invocation string it hands the implementing Skill, so the route decision travels as data beside the request rather than as prose woven into the plan. The callee validates the carrier before any workspace action and rejects a malformed, duplicated, or out-of-order one instead of interpreting it; the resolved binding then appears in the return envelope so the caller can compare the route it asked for with the route that actually served.

### Owning layer
The single Skill, reference, script, or host surface that is responsible for a mechanism — its commands, exit semantics, or byte-level validation — and the only place that mechanism may be spelled out. A Skill that delegates the work states the condition and the safe failure direction and leaves the mechanism to its owner; a mechanism prescribed outside its owning layer drifts from the owner's copy and, for data the model itself transcribes, cannot be enforced by prose at all because the model is the transport.

### Context-absent agent
An agent performing a Skill-shaped action without that Skill's instructions loaded in context — typically reconstructing a half-remembered command, recognizable by parameter values that drift from the Skill's documented defaults. Prose in the unloaded Skill cannot reach it; the only channels that do are the seam it entered through and the output of the tools it runs, which is why fail-closed refusals in bundled CLIs carry their own recovery path.

## Review and workflow vocabulary

### Reviewer persona
A single-lens reviewer role that evaluates work from one specific perspective — security, correctness, scope, design, and so on. Review Skills dispatch a panel of personas as subagents and merge their findings.

### Confidence anchor
A discrete, self-scored confidence value on a fixed small scale, each level tied to a behavioral criterion the model can honestly apply, used to gate and rank review findings instead of a continuous score that invites false precision. Each review Skill sets its own actionable threshold; corroboration across personas promotes a finding by one level, but only when those personas meet the bar in Independence.

### Independence
A property of the *execution context* a reviewer or researcher ran in, not of the lens it applied: two findings count as independent only when they came from separately dispatched contexts. Two personas reasoned inside one context are two perspectives, not two witnesses.

Only independence in this sense licenses corroboration — promoting a Confidence anchor, counting agreement, or describing a result as independently confirmed. When dispatch does not happen and the work runs inline, the findings remain valid but the corroboration signal does not exist, and the run says what coverage was lost rather than promoting on it.

### Autofix class
The classification of a review finding by how safely its proposed fix can be applied: applied silently, applied only after user confirmation, left for a human to resolve, or recorded as advisory with no action.

### Rendering floor
The single, surface-agnostic contract for how a review finding is presented for a human decision across every output surface a Skill emits — interactive walkthrough, batch report, unattended envelope, one-line preview. It fixes a decision-first field order (recommendation and a plain-language consequence first; mechanism capped and last) and a domain-agnostic policy for opaque tokens: identifiers a reader cannot resolve without opening the reviewed document or code are glossed by their function (navigation, provenance, or mechanism) or moved out of the decision block. Each surface maps its own layout onto the floor instead of carrying its own copy of the rules, so strengthening one surface cannot silently leave the others behind.

### Headless mode
An explicit opt-in mode that runs a Skill unattended, with no user prompts — it produces a written report as its deliverable and conservatively defers genuinely ambiguous decisions rather than guessing. A Skill may expose a separate depth selector inside headless mode when automations need an explicit coverage tradeoff; the non-interactive contract and the work depth remain distinct decisions.

### Session-settled decision
A decision examined and chosen by the user in the invoking conversation — a surfaced tradeoff or alternative followed by the user's choice — carried through the Pipeline as a provenance-labeled constraint (annotation stem `session-settled:`, classes `user-directed` and `user-approved`) that downstream skills augment but never re-ask, and contradict only on evidence. An unexamined assertion is a directive, not a settled decision, and receives exactly one in-pipeline challenge; agents never label their own unexamined proposals.

### Settlement test
The classification judgment a writer skill (ce-plan, ce-brainstorm) applies to conversation-carried decisions: settled if the decision survived examination in the conversation record, a directive if merely asserted, unlabeled if only ever agent-inferred. The test's outcome rules are protocol; the classification itself is agent judgment.

### Feedback source
A configured origin of customer or user feedback — a Slack channel, a GitHub Issues repo, an email inbox — declared in repo CE config (`config.yaml`, optionally overridden in `config.local.yaml`) under a generic key so any Skill can read the list. Each source entry has its own identity and ingestion cursor; the Skill that ingests from it owns the per-item state, not the source declaration.

### Beta skill
A parallel copy of a stable Skill, suffixed `-beta`, used to trial a new version alongside the stable one without disrupting users. Invoked manually (model auto-invocation is disabled); promoting it to stable is more than a rename — every caller must move in the same change so none silently inherits stale defaults, and the retired beta name must be registered for stale-artifact cleanup so upgrading users don't keep a dead duplicate of the skill alongside the promoted one.

### Offered work
Work the user has put up for review, as distinct from work that merely exists in the tree or on a remote. Commits in an open pull request are offered; uncommitted edits, local commits, and commits pushed only for backup or to trigger CI are not.

The distinction is what a shipping gate tests before publishing anything, and it is not the same as pushed — a push moves bytes to a remote, review is what makes work offered. Because the skill that ships pushes the whole branch and its pull request spans every commit on that branch, a gate that admits unoffered work publishes it alongside the change it was asked to ship.

### Fix-owned files
The tests and implementation a run changed to fix the bug it was invoked on, as distinct from files that were already modified when the run began.

Recorded before any edit so later phases can scope to them: the commit takes fix-owned files and nothing else, and a quality pass is handed that scope explicitly rather than a branch diff, since a pass that rewrites what it is given would otherwise reach work in progress that was never offered. A fix-owned file that already carried the user's own edits cannot be separated by a file-level commit, and that entanglement is the one case the handoff stops to ask about.

### Issue of record
Whichever tracker or monitor item the user supplied as a bug's entry point, treated as that bug's canonical record regardless of which system it lives in — an error-monitor issue counts the same as a tracker ticket.

Later phases link it rather than opening a second record for the same bug elsewhere, and never ask whether to. Discovering the project's own tracker serves reading prior work, not establishing a new home. An input carrying no such reference simply has none, which is an ordinary state rather than a gap to fill.

### Residual
A review finding a run accepted or deferred rather than fixed, which must reach a durable sink before the run reports itself done — a section in the pull request body, or a ticket in the project's tracker. A finding that lives only in the session is lost when the session ends, so an accepted residual blocks a merge-ready claim until it is recorded somewhere a human will find it.
